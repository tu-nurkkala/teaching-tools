import { Assignment, SubmissionType } from "../entities/Assignment";
import chalk from "chalk";
import { isoDateTimeToDate } from "./datetime";
import _ from "lodash";
import boxen, { BorderStyle } from "boxen";
import { Student } from "../entities/Student";
const wrapText = require("wrap-text");  // This module is goofy.

export function formatAssignment(assignment: Assignment) {
  const strings = [
    chalk.gray(isoDateTimeToDate(assignment.due_at)),
    assignment.name,
    formatSubmissionTypes(assignment.submission_types),
  ];

  const to_grade = assignment.needs_grading_count;
  if (to_grade) {
    strings.push(chalk.red(`[${to_grade}]`));
  } else {
    strings.push(chalk.green("[0]"));
  }

  return strings.join(" ");
}

export function formatSubmissionType(subType: SubmissionType) {
  const map = {
    online_upload: chalk.blue("upload"),
    online_text_entry: chalk.green("text"),
    online_quiz: chalk.red("quiz"),
    online_url: chalk.yellow("url"),
    none: chalk.gray("[none]"),
  };

  return map.hasOwnProperty(subType) ? map[subType] : chalk.bgGreen(subType);
}

export function formatSubmissionTypes(submissionTypes: SubmissionType[]) {
  return submissionTypes
    .map((subType) => formatSubmissionType(subType))
    .join(", ");
}

export function longestValueLength(objArray: Array<Object>, key: string) {
  return _(objArray)
    .map(key)
    .map((n) => n.length)
    .max();
}

interface GradingScaleEntry {
  grade: string;
  percent: number;
  description?: string;
}

export type GradingScale = Array<GradingScaleEntry>;

export function formatGradeChoices(scale: GradingScale, maxPoints: number) {
  const longestGradeLen = longestValueLength(scale, "grade");
  return scale.map((sc) => {
    const points = (sc.percent / 100.0) * maxPoints;
    return {
      name: [
        _.padEnd(sc.grade, longestGradeLen),
        chalk.yellow(_.padStart(`(${Number(points).toFixed(2)})`, 7)),
        sc.description || "",
      ].join(" "),
      value: points,
    };
  });
}

function makeBox(color: string, prefix: string, message: string) {
  const wrappedMessage = wrapText(`${prefix} - ${message}`);
  return boxen(chalk.keyword(color)(wrappedMessage), {
    borderColor: color,
    borderStyle: BorderStyle.Round,
    padding: { top: 0, right: 1, bottom: 0, left: 1 },
  });
}

export function fatal(message: string) {
  console.log(makeBox("red", "ERROR", message));
  process.exit(1);
}

export function warning(message: string) {
  console.log(makeBox("yellow", "WARNING", message));
}

export function showSeparator() {
  console.log(chalk.blue("-".repeat(80)));
}

export function formatStudentName(student: Student) {
  let fileDetails = chalk.red("No files");
  if (student.files && student.files.length > 0) {
    fileDetails = chalk.green(`${student.files.length} files`);
  }
  return [
    student.name,
    `(${student.id})`,
    chalk.yellow(student.submission.workflow_state),
    fileDetails,
  ].join(" ");
}
