// @ts-nocheck

import { Got } from "got";
import _ from "lodash";
import CacheDb from "../CacheDb";
import queryString from "qs";
import { Term } from "../entities/Term";
import { plainToClass } from "class-transformer";
import { APIAssignmentGroup, APICourse, Course } from "../entities/Course";
import { APIStudent, Student } from "../entities/Student";
import {
  APIGroup,
  APIGroupCategory,
  APIGroupMember,
  Group,
  GroupCategory,
  GroupMember,
} from "../entities/Group";
import { Promise } from "bluebird";
import {
  Assignment,
  Submission,
  SubmissionSummary,
} from "../entities/Assignment";
import getClient from "./http";

export default class CanvasApi {
  private apiClient: Got;
  constructor(private cache: CacheDb) {
    this.apiClient = getClient();
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

  apiGetCourses(termId: number) {
    return this.apiClient
      .get<APICourse[]>(`courses`, { searchParams: { include: "term" } })
      .then((response) => response.body);
  }

  getCourses(termId: number) {
    return this.apiGetCourses(termId).then((courses) =>
      courses
        .filter((c) => c.term.id === termId)
        .map((c) => plainToClass(Course, c, { excludeExtraneousValues: true }))
    );
  }

  getAssignmentGroups(courseId: number) {
    return this.apiClient.paginate.all<APIAssignmentGroup>(
      `courses/${courseId}/assignment_groups`
    );
  }

  getStudents(courseId: number) {
    return this.apiClient.paginate.all<APIStudent>(
      `courses/${courseId}/students`
    );
  }

  // @Trace()
  apiGetGroupCategories(courseId: number) {
    return this.apiClient
      .get<APIGroupCategory[]>(`courses/${courseId}/group_categories`)
      .then((response) => response.body);
  }

  unwedgeGroupCats(courseId: number) {
    return this.apiClient.get<APIGroupCategory[]>(
      `courses/${courseId}/group_categories`
    );
  }

  // @Trace()
  apiGetGroups(courseId: number) {
    return this.apiClient
      .get<APIGroup[]>(`courses/${courseId}/groups`)
      .then((response) => response.body);
  }

  apiGetGroupMembers(groupId: number) {
    return this.apiClient
      .get<APIGroupMember[]>(`groups/${groupId}/users`)
      .then((response) => {
        console.log("FETCHED", groupId);
        return response.body;
      });
  }

  async apiGetGroupsWithMembers(courseId: number) {
    const apiGroups = await this.apiGetGroups(courseId);
    for (const apiGroup of apiGroups) {
      apiGroup.members = await this.apiGetGroupMembers(apiGroup.id);
    }
    return apiGroups;
  }

  async getGroupCategories(courseId: number) {
    const apiGroupCategories = await this.apiGetGroupCategories(courseId);
    const apiGroups = await this.apiGetGroupsWithMembers(courseId);

    for (const apiGroupCategory of apiGroupCategories) {
      apiGroupCategory.groups = apiGroups.filter(
        (g) => g.group_category_id === apiGroupCategory.id
      );
    }

    return apiGroupCategories.map((grpCat) =>
      plainToClass(GroupCategory, grpCat, { excludeExtraneousValues: true })
    );
  }

  async getGroups(courseId: number) {
    return this.apiGetGroupsWithMembers.map((grp) =>
      plainToClass(Group, grp, { excludeExtraneousValues: true })
    );
  }

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