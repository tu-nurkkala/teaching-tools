import { Student } from "./Student";
import chalk from "chalk";

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
  user: Student;
}

export interface Attachment {
  id: number;
  display_name: string;
  content_type: string;
  size: number;
  "content-type": string;
  url: string;
}

export interface FileInfo {
  name: string;
  size: number;
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

export class Assignment {
  id: number = 0;
  name: string = "";
  due_at: string = "";
  html_url: string = "";
  needs_grading_count: number = 0;
  submission_types: SubmissionType[] = [];
  points_possible: number = 0;
  submission_summary!: SubmissionSummary;
  assignment_group_id: number = 0;
  comments: string[] = [];

  toString() {
    return [chalk.green(this.name), chalk.yellow(`(${this.id})`)].join(" ");
  }
}
