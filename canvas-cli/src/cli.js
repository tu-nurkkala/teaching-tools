import { version } from "../package.json";
import { program } from "commander";
import got from "got";
import inquirer from "inquirer";
import { keyBy, pick, sortBy } from "lodash";
import chalk from "chalk";
import { sprintf } from "sprintf-js";
import { DateTime } from "luxon";
import untildify from "untildify";
import { mkdirSync, createWriteStream, writeFileSync } from "fs";
import parseLinkHeader from "parse-link-header";
import { table } from "table";

import TurndownService from "turndown";
const turndownService = new TurndownService({
  headingStyle: "atx",
});

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
    .then((response) => {
      const courses = response.body;
      const termId = db.get("current.term.id").value();
      return courses.filter((course) => course.term.id === termId);
    })
    .catch((err) => console.error(err));
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
  return api_client.paginate.all(`courses/${courseId}/assignments`);
}

function getAssignmentGroups(courseId) {
  return api_client.paginate.all(`courses/${courseId}/assignment_groups`);
}

function getSubmissions() {
  const segments = [
    "courses",
    getCurrentCourseId(),
    "assignments",
    getCurrentAssignmentId(),
    "submissions",
  ];
  const searchParamInclude = { include: "user" };
  return api_client.paginate.all(segments.join("/"), {
    searchParams: searchParamInclude,
    pagination: {
      paginate: (response, allItems, currentItems) => {
        const linkHeader = parseLinkHeader(response.headers.link);
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
    strings.push(chalk.green(`(${value.id})`));
  } else strings.push(chalk.red("Not set"));
  console.log(strings.join(" "));
}

function isoDateTimeToDate(dt) {
  return DateTime.fromISO(dt).toISODate();
}

function formatAssignment(assignment) {
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

function formatSubmissionType(subType) {
  const map = {
    online_upload: chalk.blue("upload"),
    online_text_entry: chalk.green("text"),
    online_quiz: chalk.red("quiz"),
    online_url: chalk.yellow("url"),
    none: chalk.gray("[none]"),
  };

  return map.hasOwnProperty(subType) ? map[subType] : chalk.bgGreen(subType);
}

function formatSubmissionTypes(submissionTypes) {
  return submissionTypes
    .map((subType) => formatSubmissionType(subType))
    .join(", ");
}

function showCurrentState() {
  const current = db.get("current").value();
  showElement("Term", current.term);
  showElement("Course", current.course);
  showElement("Assignment", current.assignment);
}

function downloadPath(user, fileName) {
  const absDirPath = untildify(
    join(
      "~/Scratch",
      sanitizeString(db.get("current.course.course_code").value()),
      sanitizeString(db.get("current.assignment.name").value()),
      sanitizeString(user.sortable_name)
    )
  );
  mkdirSync(absDirPath, { recursive: true });

  return join(absDirPath, fileName);
}

function downloadSubmission(url, contentType, absPath) {
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

  program
    .command("test")
    .description("Dummy command for development testing")
    .action(async () => {
      const response = await paginateAssignments();
      console.log("RESPONSE", response);
    });

  const listCmd = program.command("list").description("List things");

  listCmd
    .command("assignments")
    .description("List assignments")
    .action(async () => {
      const groups = db.get("current.course.assignment_groups").value();
      const assignments = await getAssignments();
      const rows = assignments.map((a) => [
        a.id,
        a.needs_grading_count
          ? chalk.red(a.needs_grading_count)
          : chalk.green(a.needs_grading_count),
        a.name,
        chalk.yellow(a.points_possible),
        groups[a.assignment_group_id].name || "NONE",
        isoDateTimeToDate(a.due_at),
        formatSubmissionTypes(a.submission_types),
      ]);
      const sortedRows = sortBy(rows, (row) => row.id);
      console.log(table(sortedRows, { singleLine: true }));
    });

  const downloadCmd = program
    .command("download")
    .description("Download things");

  downloadCmd
    .command("submissions")
    .description("Download submissions")
    .action(async () => {
      const submissions = await getSubmissions();
      for (const sub of submissions) {
        if (sub.user.name === "Test Student") {
          continue;
        }
        console.log(
          sub.id,
          sub.user.name,
          formatSubmissionType(sub.submission_type)
        );
        if (sub.workflow_state === "graded") {
          console.log("\t", chalk.yellow("Already graded"));
          continue;
        }

        switch (sub.submission_type) {
          case "online_text_entry":
            writeFileSync(
              downloadPath(sub.user, "submission.txt"),
              turndownService.turndown(sub.body)
            );
            break;
          case "online_upload":
            if (!sub.hasOwnProperty("attachments")) {
              console.log(sub.id, chalk.red("NO SUBMISSION"), sub.user.name);
              continue;
            }
            for (const attachment of sub.attachments) {
              console.log(
                "\t",
                chalk.green(attachment.display_name),
                attachment["content-type"]
              );
              try {
                await downloadSubmission(
                  attachment.url,
                  attachment["content-type"],
                  downloadPath(sub.user, attachment.display_name)
                );
              } catch (err) {
                console.log(chalk.red(`Problem with download: ${err}`));
              }
            }
            break;
          case "online_url":
            writeFileSync(downloadPath(sub.user, "url.txt"), sub.url + "\n");
            console.log("\t", chalk.green(sub.url));
            break;
          case "online_quiz":
            console.log(chalk.green("Nothing to do"));
            break;
          default:
            console.error(chalk.red(`CAN'T HANDLE ${sub.submission_type}`));
        }
      }
    });

  const setCmd = program.command("set").description("Set current values");

  setCmd
    .command("assignment [id]")
    .description("Set the current assignment")
    .action(async (id) => {
      const allAssignments = await getAssignments();
      let selectedAssignment = null;
      if (id) {
        selectedAssignment = allAssignments.find((a) => a.id === +id);
      } else {
        await inquirer
          .prompt([
            {
              type: "list",
              name: "assignment",
              message: `Choose an assignment (${allAssignments.length} available)`,
              pageSize: 10,
              choices: () =>
                allAssignments.map((assignment) => ({
                  name: formatAssignment(assignment),
                  value: assignment,
                })),
            },
          ])
          .then((answer) => (selectedAssignment = answer.assignment));
      }
      db.set("current.assignment", {
        id: selectedAssignment.id,
        name: selectedAssignment.name,
        due_at: selectedAssignment.due_at,
        needs_grading_count: selectedAssignment.needs_grading_count,
        submission_types: selectedAssignment.submission_types,
      }).write();
      console.log(
        chalk.green(`Current assignment now '${selectedAssignment.name}'`)
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
      const answer = await inquirer.prompt([
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
      ]);
      const groups = await getAssignmentGroups(answer.course.id);

      db.set("current.course", {
        id: answer.course.id,
        name: answer.course.name,
        course_code: answer.course.course_code,
        assignment_groups: keyBy(groups, (elt) => elt.id),
      }).write();
    });

  program.parse(process.argv);
}
