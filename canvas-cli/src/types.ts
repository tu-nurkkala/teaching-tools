interface Dictionary<T> {
  [key: string]: T;
}

export interface CacheEntity {
  id: number;
  name: string;
}

export interface Cache {
  canvas: Canvas;
  term: Term;
  course: Course;
  assignment: Assignment;
}

export interface Canvas {
  account_id: number;
}

export interface Term extends CacheEntity {}

export interface Course extends CacheEntity {
  course_code: string;
  assignment_groups: Dictionary<AssignmentGroup>;
  students: Dictionary<Student>;
  group_categories: Dictionary<GroupCategory>;
}

export interface AssignmentGroup extends CacheEntity {}

export interface Student extends CacheEntity {
  created_at: string;
  sortable_name: string;
  short_name: string;
  submission: Submission;
  files: FileInfo[];
}

export interface StudentSubmission {
  id: number;
  grade: string;
  score: number;
  grader_id: number;
  graded_at: number;
  workflow_state: string;
}

export interface Submission extends CacheEntity {
  score: number;
  grader_id: number;
  graded_at: string;
  workflow_state: string;
}

export interface FileInfo {
  name: string;
  size: number;
}

export interface GroupCategory extends CacheEntity {
  groups: Group[];
}

export interface Group extends CacheEntity {
  id: number;
  name: string;
  members_count: number;
  members: GroupMember[];
}

export interface GroupMember extends CacheEntity {
  sortable_name: string;
}

export interface SubmissionSummary {
  graded: number;
  ungraded: number;
  not_submitted: number;
}

export type SubmissionType =
  | "online_upload"
  | "online_quiz"
  | "online_text_entry"
  | "online_url";

export interface Assignment extends CacheEntity {
  due_at: string;
  html_url: string;
  needs_grading_count: number;
  submission_types: SubmissionType[];
  points_possible: number;
  submission_summary: SubmissionSummary;
  comments: string[];
}
