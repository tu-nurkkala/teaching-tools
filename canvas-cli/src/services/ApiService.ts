import _ from "lodash";
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
import {
  Assignment,
  Submission,
  SubmissionSummary,
} from "../entities/Assignment";
import { Service } from "typedi";
import { HttpService } from "./HttpService";
import { CacheService } from "./CacheService";
import { Got } from "got";

@Service()
export class ApiService {
  private apiClient: Got;

  constructor(private httpService: HttpService, private cache: CacheService) {
    this.apiClient = httpService.client();
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
  async apiGetGroups(courseId: number) {
    const response = await this.apiClient.get<APIGroup[]>(
      `courses/${courseId}/groups`
    );
    return response.body;
  }

  async apiGetGroupMembers(groupId: number) {
    const response = await this.apiClient.get<APIGroupMember[]>(
      `groups/${groupId}/users`
    );
    return response.body;
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
    const groupsWithMembers = await this.apiGetGroupsWithMembers(courseId);
    groupsWithMembers.map((grp) =>
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

  async getAssignments() {
    const courseId = this.cache.getCourse().id;
    return _.sortBy(
      await this.apiClient.paginate.all<Assignment>(
        `courses/${courseId}/assignments`
      ),
      (a) => a.due_at
    );
  }

  getSubmissionSummary(assignmentId: number) {
    const courseId = this.cache.getCourse().id;
    return this.apiClient
      .get<SubmissionSummary>(
        `courses/${courseId}/assignments/${assignmentId}/submission_summary`
      )
      .then((response) => response.body);
  }

  getOneStudent(studentId: number) {
    const courseId = this.cache.getCourse().id;
    return this.apiClient
      .get<Student>(`courses/${courseId}/users/${studentId}`)
      .then((response) => response.body);
  }

  getOneAssignment(assignmentId: number) {
    const courseId = this.cache.getCourse().id;
    return this.apiClient
      .get<Assignment>(`courses/${courseId}/assignments/${assignmentId}`)
      .then((response) => response.body);
  }

  getOneSubmission(userId: number) {
    return this.apiClient
      .get<Submission>(this.submissionUrl(userId), {
        searchParams: queryString.stringify(
          { include: ["user", "course"] },
          { arrayFormat: "brackets" }
        ),
      })
      .then((response) => response.body);
  }

  getSubmissions() {
    const segments = [
      "courses",
      this.cache.getCourse().id,
      "assignments",
      this.cache.getAssignment().id,
      "submissions",
    ];
    const searchParamInclude = { "include[]": "user" };
    return this.apiClient.paginate.all<Submission>(segments.join("/"), {
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

    return this.apiClient
      .put(this.submissionUrl(userId), {
        searchParams: queryString.stringify(parameters),
      })
      .then((response) => response.body);
  }
}
