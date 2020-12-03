import { version } from "../package.json";
import { program } from "commander";
import got from "got";
import inquirer from "inquirer";
import { sortBy, sortedUniqBy } from "lodash";
import chalk from "chalk";
import { sprintf } from "sprintf-js";
import { DateTime } from "luxon";

import { config } from "dotenv";
config();

import low from "lowdb";
import FileSync from "lowdb/adapters/FileSync";

const adapter = new FileSync("db.json");
const db = low(adapter);

db.defaults({
  current: { account_id: 1 },
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
  const accountId = db.get("current.account_id").value();
  return api_client
    .get(`accounts/${accountId}/terms`)
    .then((result) => sortBy(result.body.enrollment_terms, (term) => -term.id));
}

function getAssignments() {
  const courseId = db.get("current.course.id").value();
  return api_client
    .get(`courses/${courseId}/assignments`)
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

export function cli() {
  program.version(version);

  showCurrentState();

  program.command("current").description("Show current settings");

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
            })
            .write()
        )
        .catch((err) => console.error(err));
    });

  program.parse(process.argv);
}
