import { version } from "../package.json";
import { config } from "dotenv";
config();

import { program } from "commander";
import got from "got";
import inquirer from "inquirer";
import { size, keyBy, pick, sortBy } from "lodash";
import chalk from "chalk";
import { sprintf } from "sprintf-js";
import { DateTime } from "luxon";
import untildify from "untildify";
import { mkdirSync, statSync, createWriteStream, writeFileSync } from "fs";
import { dirname } from "path";
import parseLinkHeader from "parse-link-header";
import { table } from "table";
import queryString from "qs";
import Fuse from "fuse.js";
import extractZip from "extract-zip";
import Debug from "debug";
import prettyBytes from "pretty-bytes";
import pluralize from "pluralize";
import childProcess from "child_process";
import boxen from "boxen";
import ora from "ora";

const prettyError = require("pretty-error").start();
prettyError.appendStyle({
  "pretty-error > trace > item": {
    marginBottom: 0,
    bullet: '"<red>-</red>"',
  },
});

const debug = Debug("cli");

import TurndownService from "turndown";
const turndownService = new TurndownService({
  headingStyle: "atx",
});

import stream from "stream";
import { promisify } from "util";
const pipeline = promisify(stream.pipeline);

import low from "lowdb";
import FileSync from "lowdb/adapters/FileSync";
import { join } from "path";

const adapter = new FileSync("db.json");
const db = low(adapter);

db.defaults({
  canvas: { account_id: 1 },
}).write();

const apiSpinner = ora();

const api_client = got.extend({
  prefixUrl: process.env["CANVAS_URL"] + "/api/v1",
  headers: {
    Authorization: `Bearer ${process.env["CANVAS_TOK"]}`,
  },
  responseType: "json",
  hooks: {
    beforeRequest: [
      (options) => {
        debug("Request options %O", options);
        apiSpinner.start(
          `Send ${chalk.blue(options.method)} request to ${chalk.blue(
            options.url.href
          )}`
        );
      },
    ],
    afterResponse: [
      (response) => {
        debug("Response %O", response);
        apiSpinner.succeed();
        return response;
      },
    ],
    beforeError: [
      (error) => {
        console.log("ERROR", error);
        apiSpinner.fail();
      },
    ],
  },
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

function getSubmissionSummary(assignmentId) {
  const courseId = getCurrentCourseId();
  return api_client
    .get(`courses/${courseId}/assignments/${assignmentId}/submission_summary`)
    .then((response) => response.body);
}

async function getStudents(courseId = getCurrentCourseId()) {
  return api_client.paginate.all(`courses/${courseId}/students`);
}

function getOneStudent(id) {
  const courseId = getCurrentCourseId();
  return api_client
    .get(`courses/${courseId}/users/${id}`)
    .then((response) => response.body);
}

function getOneAssignment(id) {
  const courseId = getCurrentCourseId();
  return api_client
    .get(`courses/${courseId}/assignments/${id}`)
    .then((response) => response.body);
}

function getAssignmentGroups(courseId) {
  return api_client.paginate.all(`courses/${courseId}/assignment_groups`);
}

function currentMaxScore() {
  return db.get("current.assignment.points_possible").value();
}

function isScoreValid(score, maxScore) {
  return score >= 0 && score <= maxScore;
}

function invalidScoreMessage(score, maxScore) {
  return `Invalid score [0 <= ${score} <= ${maxScore}]`;
}

function submissionUrl(userId) {
  return [
    "courses",
    getCurrentCourseId(),
    "assignments",
    getCurrentAssignmentId(),
    "submissions",
    userId,
  ].join("/");
}

function gradeSubmission(userId, score) {
  const maxScore = currentMaxScore();
  if (!isScoreValid(score, maxScore)) {
    fatal(invalidScoreMessage(score, maxScore));
  }

  return api_client
    .put(submissionUrl(userId), {
      searchParams: queryString.stringify({
        submission: { posted_grade: score },
      }),
    })
    .then((response) => response.body);
}

function cacheSubmission(userId, sub) {
  db.set(`current.course.students.${userId}.submission`, {
    id: sub.id,
    grade: sub.grade,
    score: sub.score,
    grader_id: sub.grader_id,
    graded_at: sub.graded_at,
    workflow_state: sub.workflow_state,
  }).write();
}

function getOneSubmission(userId) {
  return api_client
    .get(submissionUrl(userId), {
      searchParams: queryString.stringify(
        { include: ["user", "course"] },
        { arrayFormat: "brackets" }
      ),
    })
    .then((response) => response.body);
}

function getSubmissions() {
  const segments = [
    "courses",
    getCurrentCourseId(),
    "assignments",
    getCurrentAssignmentId(),
    "submissions",
  ];
  const searchParamInclude = { "include[]": "user" };
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

function submissionDir(user) {
  const absDirPath = untildify(
    join(
      "~/Scratch",
      sanitizeString(db.get("current.course.course_code").value()),
      sanitizeString(db.get("current.assignment.name").value()),
      sanitizeString(user.sortable_name)
    )
  );
  mkdirSync(absDirPath, { recursive: true });
  return absDirPath;
}

function submissionPath(user, fileName) {
  const absDirPath = submissionDir(user);
  return join(absDirPath, fileName);
}

function downloadOneAttachment(url, absPath) {
  return pipeline(got.stream(url), createWriteStream(absPath));
}

async function downloadAndProcessOneAttachment(submission, attachment) {
  const absPath = submissionPath(submission.user, attachment.display_name);
  const contentType = attachment["content-type"];

  try {
    await downloadOneAttachment(attachment.url, absPath);
  } catch (err) {
    warning(`Problem with download: ${err}`);
  }

  const allFiles = [];

  function addFile(name, size) {
    const segments = ["\t"];
    if (name.endsWith("/")) {
      // According to the yauzl docs, directories end with a slash.
      // Don't add them.
      segments.push(chalk.yellow(`${name} - skipping directory`));
    } else {
      segments.push(
        chalk.green(`${name}`),
        chalk.yellow(`(${prettyBytes(size)})`)
      );
      allFiles.push({ name, size });
    }
    console.log(segments.join(" "));
  }

  switch (contentType) {
    case "application/zip":
    case "application/x-zip-compressed":
      console.log("\t", chalk.cyan("Zip file"));
      try {
        const stats = {
          files: { extracted: 0, skipped: 0 },
          bytes: { extracted: 0, skipped: 0 },
        };
        await extractZip(absPath, {
          dir: dirname(absPath),
          onEntry: (entry) => {
            debug("Zip entry %O", entry);
            if (entry.fileName.includes("node_modules/")) {
              stats.files.skipped += 1;
              stats.bytes.skipped += entry.uncompressedSize;
            } else {
              stats.files.extracted += 1;
              stats.bytes.extracted += entry.uncompressedSize;
              addFile(entry.fileName, entry.uncompressedSize);
            }
          },
        });
        const segments = [];
        if (stats.files.skipped === 0) {
          segments.push(
            `${stats.files.extracted} ${pluralize(
              "file",
              stats.files.extracted
            )}`
          );
        } else {
          const totalFiles = stats.files.skipped + stats.files.extracted;
          segments.push(`${stats.files.extracted}/${totalFiles}`);
          segments.push(`${stats.files.skipped} skipped`);
        }
        if (stats.bytes.skipped === 0) {
          segments.push(`${prettyBytes(stats.bytes.extracted)} bytes`);
        } else {
          const totalBytes = stats.bytes.skipped + stats.bytes.extracted;
          segments.push(
            `${prettyBytes(stats.bytes.extracted)}/${prettyBytes(totalBytes)}`
          );
          segments.push(`${prettyBytes(stats.bytes.skipped)} skipped`);
        }
        const report = ["\t "] + segments.join(" | ");
        const color =
          stats.bytes.skipped || stats.files.skipped ? "red" : "teal";
        console.log(chalk.keyword(color)(report));
      } catch (err) {
        console.log(chalk.red("Problem extracting zip file:", err));
      }
      break;

    case "application/x-tar":
      console.log("\t", chalk.cyan("Tar file"));
      break;

    case "application/json":
    case "text/javascript":
      addFile(attachment.display_name, attachment.size);
      console.log("\t", chalk.green("No processing required"));
      break;

    default:
      warning(
        `Can't process ${attachment.display_name} (${attachment["content-type"]})`
      );
      break;
  }

  db.set(
    `current.course.students.${submission.user.id}.files`,
    allFiles
  ).write();
}

function showEditor(student) {
  const result = childProcess.spawnSync(
    "code",
    ["--wait", submissionDir(student)],
    { stdio: "ignore" }
  );
  debug("Editor result %O", result);
}

async function showPager(student) {
  const allFiles = student.files;

  if (!allFiles || allFiles.length === 0) {
    console.log("\t", chalk.yellow(`No files for this student`));
    return;
  }

  const { file } = await inquirer.prompt([
    {
      type: "list",
      message: "Choose a file to page",
      name: "file",
      choices: () =>
        allFiles.map((file) => ({
          name: `${file.name} (${prettyBytes(file.size)})`,
          value: file,
        })),
    },
  ]);

  const filePath = submissionPath(student, file.name);

  childProcess.spawnSync("less", [filePath], {
    stdio: "inherit",
  });
}

function askForScore(maxScore) {
  return inquirer
    .prompt([
      {
        type: "input",
        message: `Enter score (0-${maxScore})`,
        name: "score",
        default: `${maxScore}`, // Placate validate.
        validate: (entry) => {
          if (!entry.match(/^[0-9]+(\.[0-9]*)?$/)) {
            return "Not a valid score";
          }
          const value = parseFloat(entry);
          if (!isScoreValid(value, maxScore)) {
            return invalidScoreMessage(value, maxScore);
          }
          return true;
        },
      },
    ])
    .then((answer) => answer.score);
}

async function confirmScore(student, score, maxScore) {
  const formattedScore = `${chalk.yellow(student.name)} score ${chalk.yellow(
    score
  )}/${maxScore}`;

  const { confirmed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmed",
      message: `Assign ${formattedScore}?`,
    },
  ]);

  if (confirmed) {
    await gradeSubmission(student.id, score);
    console.log(chalk.green(formattedScore));
  }
  return confirmed;
}

function sanitizeString(str) {
  return str
    .replace(/[^-_.a-z0-9\s]/gi, "")
    .replace(/[\s_-]+/g, "-")
    .toLowerCase();
}

function makeBox(color, prefix, message) {
  return boxen(chalk.keyword(color)(`${prefix} -`, message), {
    borderColor: color,
    borderStyle: "round",
    padding: { left: 1, right: 1 },
  });
}

function fatal(message) {
  console.log(makeBox("red", "ERROR", message));
  process.exit(1);
}

function warning(message) {
  console.log(makeBox("yellow", "WARNING", message));
}

export function cli() {
  program.version(version);

  showCurrentState();

  program
    .command("current")
    .alias("status")
    .description("Show current settings");

  const listCmd = program.command("list").description("List things");

  listCmd
    .command("assignments")
    .description("List assignments")
    .action(async () => {
      const groups = db.get("current.course.assignment_groups").value();
      const assignments = sortBy(await getAssignments(), (a) => a.due_at);
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
      console.log(table(rows, { singleLine: true }));
    });

  listCmd
    .command("students")
    .description("List students")
    .action(async () => {
      const students = sortBy(await getStudents(getCurrentCourseId()), (s) =>
        s.sortable_name.toLowerCase()
      );
      const rows = students.map((s) => [s.id, s.name]);
      console.log(table(rows, { singleLine: true }));
    });

  const showCmd = program.command("show").description("Show details");

  showCmd
    .command("submission <userId>")
    .description("Show details of submission from user <userId>")
    .action(async (userId) => {
      const submission = await getOneSubmission(userId);
      console.log(submission);
    });

  showCmd
    .command("assignment <id>")
    .description("Show details of assignment <id>")
    .action(async (id) => {
      const assignment = await getOneAssignment(id);
      console.log(assignment);
    });

  showCmd
    .command("student <id>")
    .description("Show details of student <id>")
    .action(async (id) => {
      const student = await getOneStudent(id);
      console.log(student);
    });

  const findCmd = program.command("find").description("Find things");

  findCmd
    .command("student <fuzzy>")
    .alias("search")
    .description("Find student using fuzzy match")
    .action(async (fuzzy) => {
      const students = await getStudents();
      const fuse = new Fuse(students, {
        includeScore: true,
        ignoreLocation: true,
        threshold: 0.01,
        keys: ["name", "sortable_name", "short_name", "login_id"],
      });
      const result = fuse.search(fuzzy);
      const rows = result.map((elt) => [elt.item.id, elt.score, elt.item.name]);
      console.log(table(rows, { singleLine: true }));
    });

  program
    .command("grade [userId] [score]")
    .description("Grade submission", {
      userId: "user ID of student; if missing, select from list",
      score: "score to assign; required with userId",
    })
    .option("--editor", "Open files in editor")
    .option("--pager", "Open files in pager (default)")
    .action(async (userId, score, options) => {
      const maxScore = currentMaxScore();

      if (options.pager) {
        if (options.editor) {
          fatal("Can't enable both editor and pager");
        }
      } else {
        if (!options.editor) {
          options.pager = true;
        }
      }

      function showViewer(student) {
        if (options.editor) {
          return showEditor(student);
        } else if (options.pager) {
          return showPager(student);
        }
      }

      if (userId) {
        // Grade one student.
        if (!score) {
          fatal("Specific `userId` also requires `score`.");
        }

        const student = db.get(`current.course.students.${userId}`).value();
        if (!student) {
          fatal(`No cached student with id ${userId}`);
        }

        showViewer(student);
        await confirmScore(student, score, maxScore);
      } else {
        // Grade multiple students.
        const allStudents = [];
        for (const [id, student] of Object.entries(
          db.get("current.course.students").value()
        )) {
          allStudents.push(student);
        }
        const gradedStudents = [];
        let remainingStudents = [];
        const rows = [[chalk.red("UNGRADED"), chalk.green("GRADED")]];

        for (const student of allStudents) {
          if (student.submission.workflow_state === "graded") {
            gradedStudents.push(student);
            rows.push(["", chalk.green(student.name)]);
          } else {
            remainingStudents.push(student);
            rows.push([chalk.red(student.name), ""]);
          }
        }

        console.log(
          table(rows, {
            drawHorizontalLine: (idx, size) =>
              idx === 0 || idx === 1 || idx === size,
          })
        );

        while (size(remainingStudents) > 0) {
          const answer = await inquirer.prompt([
            {
              type: "list",
              name: "student",
              message: "Choose a student (?? available)",
              pageSize: 20,
              choices: () =>
                remainingStudents.map((s) => ({
                  name: `${s.name} ${s.submission.workflow_state}`,
                  value: s,
                })),
            },
          ]);
          const student = answer.student;

          await showViewer(student);

          const score = await askForScore(maxScore);
          const confirmed = await confirmScore(student, score, maxScore);
          if (confirmed) {
            const gradedStudent = remainingStudents.find(
              (s) => s.id === student.id
            );
            remainingStudents = remainingStudents.filter(
              (s) => s.id !== student.id
            );
            gradedStudents.push(gradedStudent);

            const updatedSubmission = await getOneSubmission(student.id);
            cacheSubmission(student.id, updatedSubmission);
          }
        }
      }
    });

  program
    .command("download")
    .description("Download submissions")
    .option(
      "--max-size <size>",
      "Don't get attachments larger than this (bytes)"
    )
    .action(async (options) => {
      const submissions = await getSubmissions();
      for (const sub of submissions) {
        console.log(
          sub.id,
          sub.user.name,
          `(${sub.user.id})`,
          formatSubmissionType(sub.submission_type)
        );

        cacheSubmission(sub.user.id, sub);

        switch (sub.workflow_state) {
          case "graded":
            console.log("\t", chalk.green("Already graded"));
            continue;
          case "unsubmitted":
            console.log("\t", chalk.red("Not submitted"));
            continue;
        }

        switch (sub.submission_type) {
          case "online_text_entry":
            writeFileSync(
              submissionPath(sub.user, "submission.html"),
              sub.body
            );
            writeFileSync(
              submissionPath(sub.user, "submission.txt"),
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
                chalk.yellow(prettyBytes(attachment.size)),
                attachment["content-type"]
              );
              if (options.maxSize) {
                const sizeLimit = parseInt(options.maxSize);
                if (attachment.size > sizeLimit) {
                  console.log(
                    "\t",
                    chalk.yellow(
                      `Too large [${prettyBytes(
                        attachment.size
                      )} > ${prettyBytes(sizeLimit)}]`
                    )
                  );
                  continue;
                }
              }
              await downloadAndProcessOneAttachment(sub, attachment);
            }
            break;
          case "online_url":
            writeFileSync(submissionPath(sub.user, "url.txt"), sub.url + "\n");
            console.log("\t", chalk.green(sub.url));
            break;
          case "online_quiz":
            console.log(chalk.green("Nothing to do"));
            break;
          default:
            console.error(
              chalk.red(`Can't handle submission type '${sub.submission_type}'`)
            );
        }
      }
    });

  const setCmd = program
    .command("set")
    .alias("choose")
    .description("Set current values");

  setCmd
    .command("assignment [id]")
    .description("Set the current assignment")
    .action(async (id) => {
      const allAssignments = await getAssignments();
      let selectedAssignment = null;
      if (id) {
        selectedAssignment = allAssignments.find((a) => a.id === +id);
        if (!selectedAssignment) {
          fatal(`No assignment with ID ${id}`);
        }
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

      const submissionSummary = await getSubmissionSummary(
        selectedAssignment.id
      );

      db.set("current.assignment", {
        id: selectedAssignment.id,
        name: selectedAssignment.name,
        due_at: selectedAssignment.due_at,
        needs_grading_count: selectedAssignment.needs_grading_count,
        submission_types: selectedAssignment.submission_types,
        points_possible: selectedAssignment.points_possible,
        submission_summary: submissionSummary,
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
      const students = await getStudents(answer.course.id);

      db.set("current.course", {
        id: answer.course.id,
        name: answer.course.name,
        course_code: answer.course.course_code,
        assignment_groups: keyBy(groups, (elt) => elt.id),
        students: keyBy(students, (elt) => elt.id),
      }).write();
    });

  program.parse(process.argv);
}
