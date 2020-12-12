interface Dictionary<T> {
  [key: string]: T;
}

export interface AbstractResource {
  id: number;
  name: string;
}

export interface Cache {
  canvas: Canvas;
  // term: Term;
  course: Course;
  assignment: Assignment;
}

export interface Canvas {
  account_id: number;
}

export interface Course extends AbstractResource {
  course_code: string;
  assignment_groups: Dictionary<AssignmentGroup>;
  students: Dictionary<Student>;
  group_categories: Dictionary<GroupCategory>;
}

export interface AssignmentGroup extends AbstractResource {}

export interface Student extends AbstractResource {
  created_at: string;
  sortable_name: string;
  short_name: string;
  submission: {
    id: number;
    grade: string;
    score: number;
    grader_id: number;
    graded_at: number;
    workflow_state: string;
  };
  files: FileInfo[];
}

export interface Submission {
  id: number;
  body: string;
  url: string;
  grade: string;
  score: number;
  submission_type: SubmissionType;
  workflow_state: string;
  grader_id: number;
  graded_at: string;
  attachments: Attachment[];
}

export interface Attachment {
  id: number;
  display_name: string;
  content_type: string;
  size: number;
}

export interface FileInfo {
  name: string;
  size: number;
}

export interface GroupCategory extends AbstractResource {
  groups: Group[];
}

export interface Group extends AbstractResource {
  id: number;
  name: string;
  members_count: number;
  members: GroupMember[];
}

export interface GroupMember extends AbstractResource {
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

export interface Assignment extends AbstractResource {
  due_at: string;
  html_url: string;
  needs_grading_count: number;
  submission_types: SubmissionType[];
  points_possible: number;
  submission_summary: SubmissionSummary;
  comments: string[];
}
