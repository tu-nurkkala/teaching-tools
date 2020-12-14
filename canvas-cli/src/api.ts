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
  GroupCategory,
  Submission,
  SubmissionSummary,
} from "./types";
import Term from "./entities/Term";
import { plainToClass } from "class-transformer";
import { APIAssignmentGroup, APICourse, Course } from "./entities/Course";
import { APIStudent, Student } from "./entities/Student";
import {
  APIGroup,
  APIGroupCategory,
  APIGroupMember,
  Group,
  GroupMember,
} from "./entities/Group";
import { Promise } from "bluebird";
import { Trace } from "./Trace";

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
      pagination: {
        paginate: (response, allItems, currentItems) => {
          let rtn = false;
          if (response.headers.link) {
            const linkHeader = parseLinkHeader(response.headers.link as string);
            if (linkHeader.hasOwnProperty("next")) {
              if (program.apiChatter) {
                console.log(`Page to ${linkHeader.next.url}`);
              }
              rtn = {
                searchParams: {
                  ...searchParamInclude,
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

  // Get enrollment terms in reverse chronological order.
  @Trace({ depth: 1 })
  async getTerms() {
    const accountId = this.cache.get("canvas.account_id").value();
    const response = await this.apiClient.get<{ enrollment_terms: Term[] }>(
      `accounts/${accountId}/terms`
    );

    const terms = response.body.enrollment_terms.map((plainTerm) =>
      plainToClass(Term, plainTerm, { excludeExtraneousValues: true })
    );

    return terms.sort((a, b) => b.start_at.toMillis() - a.start_at.toMillis());
  }

  @Trace()
  getCourses(termId: number) {
    return this.apiClient
      .get<APICourse[]>(`courses`, {
        searchParams: { include: "term" },
      })
      .then((response) =>
        response.body
          .filter((c) => c.term.id === termId)
          .map((c) =>
            plainToClass(Course, c, { excludeExtraneousValues: true })
          )
      );
  }

  @Trace()
  getAssignmentGroups(courseId: number) {
    return this.apiClient.paginate.all<APIAssignmentGroup>(
      `courses/${courseId}/assignment_groups`
    );
  }

  @Trace()
  getStudents(courseId: number) {
    return this.apiClient.paginate.all<APIStudent>(
      `courses/${courseId}/students`
    );
  }

  apiGetGroupCategories = (courseId: number) =>
    this.apiClient
      .get<APIGroupCategory[]>(`courses/${courseId}/group_categories`)
      .then((response) => response.body);

  @Trace({ depth: 7 })
  XapiGetGroups(courseId: number) {
    return this.apiClient
      .get<APIGroup[]>(`courses/${courseId}/groups`)
      .then((response) => response.body)
      .then((groups) =>
        Promise.map(groups, (group) => this.apiGetGroupMembers(group.id))
      )
      .then((foo) => console.log(foo));
  }

  @Trace()
  apiGetGroups(courseId: number) {
    return this.apiClient
      .get<APIGroup[]>(`courses/${courseId}/groups`)
      .then((response) => response.body);
  }

  @Trace()
  apiGetGroupMembers(groupId: number) {
    return this.apiClient
      .get<APIGroupMember[]>(`groups/${groupId}/users`)
      .then((response) => response.body);
  }

  // @Trace()
  async getGroupCategories(courseId: number) {
    const apiGroupCategories = await this.apiGetGroupCategories(courseId);
    const apiGroups = await this.apiGetGroups(courseId);

    for (const apiGroupCategory of apiGroupCategories) {
      apiGroupCategory.groups = apiGroups.filter(
        (g) => g.group_category_id === apiGroupCategory.id
      );
    }

    return apiGroupCategories;
  }

  @Trace({ depth: 3 })
  async getGroups(courseId: number) {
    const apiGroups = await this.apiGetGroups(courseId);
    for (const apiGroup of apiGroups) {
      apiGroup.members = await this.apiGetGroupMembers(apiGroup.id);
    }
    return apiGroups.map((g) =>
      plainToClass(Group, g, { excludeExtraneousValues: true })
    );
  }

  @Trace()
  getGroupMembers(groupId: number) {
    return this.apiGetGroupMembers(groupId).then((groupMembers) =>
      groupMembers.map((groupMember) =>
        plainToClass(GroupMember, groupMember, {
          excludeExtraneousValues: true,
        })
      )
    );
  }

  // ---------- TO DO BELOW THIS LINE ----------

  async getAssignments(): Promise<Assignment[]> {
    const courseId = this.cache.getCourse().id;
    return _.sortBy(
      await this.apiClient.paginate.all(`courses/${courseId}/assignments`),
      (a) => a.due_at
    );
  }

  async getGroupCategoriesOLD(courseId: number): Promise<GroupCategory[]> {
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
