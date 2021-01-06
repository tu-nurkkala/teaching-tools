import got, { Got, Options } from "got";
import parseLinkHeader from "parse-link-header";
import { debugNet } from "../util/debug";
import chalk from "chalk";
import ora from "ora";
import { Service } from "typedi";

const apiSpinner = ora();

@Service()
export class HttpService {
  private chatty = false;

  makeChatty(): void {
    this.chatty = true;
  }

  client(): Got {
    return got.extend({
      prefixUrl: process.env.CANVAS_URL + "/api/v1",
      headers: {
        Authorization: `Bearer ${process.env.CANVAS_TOK}`,
      },
      responseType: "json",
      pagination: {
        paginate: (response) => {
          const previousSearchParams = response.request.options.searchParams;
          let rtn: boolean | Options = false;
          if (response.headers.link) {
            const linkHeader = parseLinkHeader(response.headers.link as string);
            if (linkHeader && linkHeader.hasOwnProperty("next")) {
              if (this.chatty) {
                console.log(`Page to ${linkHeader.next.url}`);
              }
              rtn = {
                searchParams: {
                  ...previousSearchParams,
                  page: +linkHeader.next.page,
                  per_page: 10,
                },
              };
            }
          }
          return rtn;
        },
      },
      hooks: {
        beforeRequest: [
          (options) => {
            debugNet("Request options %O", options);
            if (this.chatty) {
              apiSpinner.start(
                `Send ${chalk.blue(options.method)} request to ${chalk.blue(
                  options.url.href
                )}`
              );
            }
          },
        ],
        afterResponse: [
          (response) => {
            debugNet("Response %O", response);
            if (this.chatty) {
              apiSpinner.succeed();
            }
            return response;
          },
        ],
        beforeError: [
          (error) => {
            console.log("ERROR", error);
            if (this.chatty) {
              apiSpinner.fail();
            }
            return error;
          },
        ],
      },
    });
  }
}
