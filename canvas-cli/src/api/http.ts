import got, { Options } from "got";
import parseLinkHeader from "parse-link-header";
import { program } from "commander";
import { debugNet } from "../debug";
import chalk from "chalk";
import ora from "ora";

const apiSpinner = ora();

export default function getClient(chatter = false) {
  return got.extend({
    prefixUrl: process.env["CANVAS_URL"] + "/api/v1",
    headers: {
      Authorization: `Bearer ${process.env["CANVAS_TOK"]}`,
    },
    responseType: "json",
    pagination: {
      paginate: (response, allItems, currentItems) => {
        const previousSearchParams = response.request.options.searchParams;
        let rtn: boolean | Options = false;
        if (response.headers.link) {
          const linkHeader = parseLinkHeader(response.headers.link as string);
          if (linkHeader && linkHeader.hasOwnProperty("next")) {
            if (chatter) {
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
          if (chatter) {
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
          if (chatter) {
            apiSpinner.succeed();
          }
          return response;
        },
      ],
      beforeError: [
        (error) => {
          console.log("ERROR", error);
          if (chatter) {
            apiSpinner.fail();
          }
          return error;
        },
      ],
    },
  });
}
