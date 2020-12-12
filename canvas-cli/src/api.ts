// @ts-nocheck

import got, { Got } from "got";
import { program } from "commander";
import chalk from "chalk";
import _ from "lodash";
import ora from "ora";
import { debugNet } from "./debug";
import CacheDb from "./cacheDb";
import queryString from "qs";
import parseLinkHeader from "parse-link-header";
import {
  Assignment,
  AssignmentGroup,
  Course,
  GroupCategory,
  Student,
  Submission,
  SubmissionSummary,
} from "./types";
import TermResource from "./entities/Term";
import { plainToClass } from "class-transformer";

const apiSpinner = ora();

export default class CanvasApi {
  apiClient: Got;
  cache: CacheDb;

  constructor(cache: CacheDb) {
    this.cache = cache;

    this.apiClient = got.extend({
      prefixUrl: process.env["CANVAS_URL"] + "/api/v1",
      headers: {
        Authorization: `Bearer ${process.env["CANVAS_TOK"]}`,
      },
      responseType: "json",
      hooks: {
        beforeRequest: [
          (options) => {
            debugNet("Request options %O", options);
            if (program.apiChatter) {
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
            if (program.apiChatter) {
              apiSpinner.succeed();
            }
            return response;
          },
        ],
        beforeError: [
          (error) => {
            console.log("ERROR", error);
            if (program.apiChatter) {
              apiSpinner.fail();
            }
            return error;
          },
        ],
      },
    });
  }

  private submissionUrl(userId: number) {
    return [
      "courses",
      this.cache.getCourse().id,
      "assignments",
      this.cache.getAssignment().id,
      "submissions",
      userId,
    ].join("/");
  }

  getCourses(): Promise<Course[]> {
    return this.apiClient
      .get(`courses`, {
        searchParams: { include: "term" },
      })
      .then((response) => {
        const courses = response.body;
        const termId = this.cache.get("term.id").value();
        return courses.filter((course) => course.term.id === termId);
      })
      .catch((err) => console.error(err));
  }

  async getEnrollmentTerms() {
    const accountId = this.cache.get("canvas.account_id").value();
    const result = await this.apiClient.get<{
      enrollment_terms: TermResource[];
    }>(`accounts/${accountId}/terms`);

    for (const termData of result.body.enrollment_terms) {
      const tr = plainToClass(TermResource, termData, {
        excludeExtraneousValues: true,
      });
      console.log("-".repeat(20));
      console.log("TERM DATA", termData);
      console.log("TERM RESOURCE", tr);
    }
    return _.sortBy(result.body.enrollment_terms, (term) => -term.id);
  }

  async getAssignments(): Promise<Assignment[]> {
    const courseId = this.cache.getCourse().id;
    return _.sortBy(
      await this.apiClient.paginate.all(`courses/${courseId}/assignments`),
      (a) => a.due_at
    );
  }

  async getGroupCategories(courseId: number): Promise<GroupCategory[]> {
    const groupCategoryById = _(
      await this.apiClient
        .get(`courses/${courseId}/group_categories`)
        .then((response) => response.body)
    )
      .map((grpCat) => {
        const newCat = _.pick(grpCat, ["id", "name"]);
        newCat.groups = [];
        return newCat;
      })
      .keyBy("id")
      .value();

    const groups = (
      await this.apiClient
        .get(`courses/${courseId}/groups`)
        .then((response) => response.body)
    ).map((grp) => {
      const newGrp = _.pick(grp, ["id", "name", "members_count"]);
      newGrp.members = [];
      groupCategoryById[grp.group_category_id].groups.push(newGrp);
      return newGrp;
    });

    for (const group of groups) {
      (
        await this.apiClient
          .get(`groups/${group.id}/users`)
          .then((response) => response.body)
      ).forEach((member) => {
        const newMember = _.pick(member, ["id", "name", "sortable_name"]);
        group.members.push(newMember);
      });
    }

    this.cache.set("course.groupCategories", groupCategoryById).write();
    return groupCategoryById;
  }

  getSubmissionSummary(assignmentId: number): Promise<SubmissionSummary> {
    const courseId = this.cache.getCourse().id;
    return this.apiClient
      .get(`courses/${courseId}/assignments/${assignmentId}/submission_summary`)
      .then((response) => response.body);
  }

  async getStudents(courseId = this.cache.getCourse().id): Promise<Student[]> {
    return this.apiClient.paginate.all(`courses/${courseId}/students`);
  }

  getOneStudent(studentId: number): Promise<Student> {
    const courseId = this.cache.getCourse().id;
    return this.apiClient
      .get(`courses/${courseId}/users/${studentId}`)
      .then((response) => response.body);
  }

  getOneAssignment(assignmentId: number): Promise<Assignment> {
    const courseId = this.cache.getCourse().id;
    return this.apiClient
      .get(`courses/${courseId}/assignments/${assignmentId}`)
      .then((response) => response.body);
  }

  getAssignmentGroups(courseId: number): Promise<AssignmentGroup[]> {
    return this.apiClient.paginate.all(`courses/${courseId}/assignment_groups`);
  }

  getOneSubmission(userId: number): Promise<Submission> {
    return this.apiClient
      .get(this.submissionUrl(userId), {
        searchParams: queryString.stringify(
          { include: ["user", "course"] },
          { arrayFormat: "brackets" }
        ),
      })
      .then((response) => response.body);
  }

  getSubmissions(): Promise<Submission[]> {
    const segments = [
      "courses",
      this.cache.getCourse().id,
      "assignments",
      this.cache.getAssignment().id,
      "submissions",
    ];
    const searchParamInclude = { "include[]": "user" };
    return this.apiClient.paginate.all(segments.join("/"), {
      searchParams: searchParamInclude,
      pagination: {
        paginate: (response, allItems, currentItems) => {
          const linkHeader = parseLinkHeader(response.headers.link as string);
          let rtn = false;
          if (linkHeader.hasOwnProperty("next")) {
            rtn = {
              searchParams: {
                ...searchParamInclude,
                page: +linkHeader.next.page,
                per_page: 10,
              },
            };
          }
          return rtn;
        },
      },
    });
  }

  gradeSubmission(userId: number, score: number, comment: string) {
    const parameters = {
      submission: { posted_grade: score },
      comment: {},
    };
    if (comment && comment.length > 0) {
      parameters.comment = { text_comment: comment };
    }

    return api
      .put(submissionUrl(userId), {
        searchParams: queryString.stringify(parameters),
      })
      .then((response) => response.body);
  }
}
