import { version } from "../package.json";
import { program } from "commander";
import got from "got";
import inquirer from "inquirer";
import { sortBy, sortedUniqBy } from "lodash";
import chalk from "chalk";
import { sprintf } from "sprintf-js";
import { DateTime } from "luxon";
import untildify from "untildify";
import { dirname } from "path";
import { mkdirSync, createWriteStream } from "fs";

import stream from "stream";
import { promisify } from "util";
const pipeline = promisify(stream.pipeline);

import { config } from "dotenv";
config();

import low from "lowdb";
import FileSync from "lowdb/adapters/FileSync";
import { join } from "path";

const adapter = new FileSync("db.json");
const db = low(adapter);

db.defaults({
  canvas: { account_id: 1 },
}).write();

const api_client = got.extend({
  prefixUrl: process.env["CANVAS_URL"] + "/api/v1",
  headers: {
    Authorization: `Bearer ${process.env["CANVAS_TOK"]}`,
  },
  responseType: "json",
});

function getCourses() {
  return api_client
    .get(`courses`, {
      searchParams: { include: "term" },
    })
    .then((result) => {
      const termId = db.get("current.term.id").value();
      return result.body.filter((course) => course.term.id === termId);
    });
}

function getEnrollmentTerms() {
  const accountId = db.get("canvas.account_id").value();
  return api_client
    .get(`accounts/${accountId}/terms`)
    .then((result) => sortBy(result.body.enrollment_terms, (term) => -term.id));
}

function getCurrentCourseId() {
  return db.get("current.course.id").value();
}

function getCurrentAssignmentId() {
  return db.get("current.assignment.id").value();
}

function getAssignments() {
  const courseId = getCurrentCourseId();
  return api_client
    .get(`courses/${courseId}/assignments`)
    .then((result) => result.body);
}

function getSubmissions() {
  const segments = [
    "courses",
    getCurrentCourseId(),
    "assignments",
    getCurrentAssignmentId(),
    "submissions",
  ];
  return api_client
    .get(segments.join("/"), {
      searchParams: { include: "user" },
    })
    .then((result) => result.body);
}

function showElement(typeName, value, extraFields = []) {
  const strings = [chalk.blue(sprintf("%10s", typeName))];
  if (value) {
    strings.push(chalk.bold(value.name));
    if (extraFields.length > 0) {
      const extraStrings = extraFields.map(
        (field) => `${field}=${value[field]}`
      );
      strings.push(chalk.gray(`[${extraStrings.join(",")}]`));
    }
    strings.push(chalk.gray(`(${value.id})`));
  } else strings.push(chalk.red("Not set"));
  console.log(strings.join(" "));
}

function showCurrentState() {
  const current = db.get("current").value();
  showElement("Term", current.term);
  showElement("Course", current.course);
  showElement("Assignment", current.assignment);
}

function formatAssignment(assignment) {
  const dt = DateTime.fromISO(assignment.due_at);
  const strings = [chalk.gray(dt.toISODate()), assignment.name];

  const to_grade = assignment.needs_grading_count;
  if (to_grade) {
    strings.push(chalk.red(`[${to_grade}]`));
  } else {
    strings.push(chalk.green("[0]"));
  }

  return strings.join(" ");
}

function downloadSubmission(url, path) {
  const absPath = untildify(path);
  const dirName = dirname(absPath);
  console.log("DIR", dirName);
  mkdirSync(dirName, { recursive: true });
  console.log(`DOWNLOAD ${url} to ${absPath}`);
  return pipeline(got.stream(url), createWriteStream(absPath));
}

function sanitizeString(str) {
  return str
    .replace(/[^-_.a-z0-9\s]/gi, "")
    .replace(/[\s_-]+/g, "-")
    .toLowerCase();
}

export function cli() {
  program.version(version);

  showCurrentState();

  program.command("current").description("Show current settings");

  const listCmd = program.command("list").description("List things");

  listCmd
    .command("submissions")
    .description("List submissions")
    .action(async () => {
      const submissions = await getSubmissions();
      for (const sub of submissions) {
        console.log(sub.id, sub.submitted_at, sub.user.name);
        switch (sub.submission_type) {
          case "online_upload":
            for (const attachment of sub.attachments) {
              console.log("ATTACHMENT", attachment);
              const path = join(
                "~/Scratch",
                sanitizeString(db.get("current.course.course_code").value()),
                sanitizeString(db.get("current.assignment.name").value()),
                sanitizeString(sub.user.sortable_name),
                sanitizeString(attachment.display_name)
              );
              await downloadSubmission(attachment.url, path);
            }
            break;
          default:
            console.error(chalk.red(`CAN'T HANDLE ${sub.submission_type}`));
        }
      }
    });

  const setCmd = program.command("set").description("Set current values");

  setCmd
    .command("assignment")
    .description("Set the current assignment")
    .action(async () => {
      const assignments = await getAssignments();
      inquirer
        .prompt([
          {
            type: "list",
            name: "assignment",
            message: "Choose an assignment",
            pageSize: 5,
            choices: () =>
              assignments.map((assignment) => ({
                name: formatAssignment(assignment),
                value: assignment,
              })),
          },
        ])
        .then((answer) =>
          db
            .set("current.assignment", {
              id: answer.assignment.id,
              name: answer.assignment.name,
              due_at: answer.assignment.due_at,
              needs_grading_count: answer.assignment.needs_grading_count,
            })
            .write()
        );
    });

  setCmd
    .command("term")
    .description("Set the current term")
    .action(async () => {
      const terms = await getEnrollmentTerms();
      inquirer
        .prompt([
          {
            type: "list",
            name: "term",
            message: "Choose a term",
            pageSize: 10,
            choices: () =>
              terms.map((term) => ({
                name: term.name,
                value: term,
              })),
          },
        ])
        .then((answer) =>
          db
            .set("current.term", {
              id: answer.term.id,
              name: answer.term.name,
            })
            .write()
        );
    });

  setCmd
    .command("course")
    .description("Set current course")
    .action(async () => {
      const courses = await getCourses();
      inquirer
        .prompt([
          {
            type: "list",
            name: "course",
            message: "Choose a course",
            pageSize: 10,
            choices: () =>
              courses.map((course) => ({
                name: course.name,
                value: course,
              })),
          },
        ])
        .then((answer) =>
          db
            .set("current.course", {
              id: answer.course.id,
              name: answer.course.name,
              course_code: answer.course.course_code,
            })
            .write()
        )
        .catch((err) => console.error(err));
    });

  program.parse(process.argv);
}
