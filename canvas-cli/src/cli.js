import { config } from "dotenv";
config();

import got from "got";
import inquirer from "inquirer";
import _ from "lodash";
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
import tar from "tar";
import wrapText from "wrap-text";

import { program } from "commander";
import { version } from "../package.json";
program.version(version);
program.option("--api-chatter", "Show API actions");

const prettyError = require("pretty-error").start();
prettyError.appendStyle({
  "pretty-error > trace > item": {
    marginBottom: 0,
    bullet: '"<red>-</red>"',
  },
});

const debugCli = Debug("cli");
const debugCache = debugCli.extend("cache");
const debugNet = debugCli.extend("net");
const debugExtract = debugCli.extend("extract");
const debugDownload = debugCli.extend("download");

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
        debugNet("Request options %O", options);
        if (program.apiChatter) {
          apiSpinner.start(
            `Send ${chalk.blue(options.method)} request to ${chalk.blue(
              options.url.href
            )}`
          );
        }
      },
    ],
    afterResponse: [
      (response) => {
        debugNet("Response %O", response);
        if (program.apiChatter) {
          apiSpinner.succeed();
        }
        return response;
      },
    ],
    beforeError: [
      (error) => {
        console.log("ERROR", error);
        if (program.apiChatter) {
          apiSpinner.fail();
        }
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
    .then((result) =>
      _.sortBy(result.body.enrollment_terms, (term) => -term.id)
    );
}

function getCurrentCourseId() {
  return db.get("current.course.id").value();
}

function getCurrentAssignmentId() {
  return db.get("current.assignment.id").value();
}

async function getAssignments() {
  const courseId = getCurrentCourseId();
  return _.sortBy(
    await api_client.paginate.all(`courses/${courseId}/assignments`),
    (asgn) => asgn.due_at
  );
}

async function getGroupCategories(courseId) {
  const groupCategoryById = _(
    await api_client
      .get(`courses/${courseId}/group_categories`)
      .then((response) => response.body)
  )
    .map((grpCat) => {
      const newCat = _.pick(grpCat, ["id", "name"]);
      newCat.groups = [];
      return newCat;
    })
    .keyBy("id")
    .value();

  const groups = (
    await api_client
      .get(`courses/${courseId}/groups`)
      .then((response) => response.body)
  ).map((grp) => {
    const newGrp = _.pick(grp, ["id", "name", "members_count"]);
    newGrp.members = [];
    groupCategoryById[grp.group_category_id].groups.push(newGrp);
    return newGrp;
  });

  for (const group of groups) {
    (
      await api_client
        .get(`groups/${group.id}/users`)
        .then((response) => response.body)
    ).forEach((member) => {
      const newMember = _.pick(member, ["id", "name", "sortable_name"]);
      group.members.push(newMember);
    });
  }

  db.set("current.course.groupCategories", groupCategoryById).write();
  return groupCategoryById;
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

async function processOneSubmission(submission, options) {
  console.log(
    submission.id,
    submission.user.name,
    `(${submission.user.id})`,
    formatSubmissionType(submission.submission_type)
  );
  if (options.showDetails) {
    console.log(submission);
  }

  cacheSubmission(submission);
  clearStudentFiles(submission);

  switch (submission.workflow_state) {
    // Not sure we care about this; download again anyhow.
    // case "graded":
    //   console.log("\t", chalk.green("Already graded"));
    //   continue;
    case "unsubmitted":
      console.log("\t", chalk.red("Workflow state shows nothing submitted"));
      return;
  }

  switch (submission.submission_type) {
    case "online_text_entry":
      writeAndCacheOneStudentFile(
        submission,
        "submission.html",
        submission.body
      );
      writeAndCacheOneStudentFile(
        submission,
        "submission.md",
        turndownService.turndown(submission.body)
      );
      break;

    case "online_upload":
      if (!submission.hasOwnProperty("attachments")) {
        console.log(
          submission.id,
          chalk.red("NO SUBMISSION"),
          submission.user.name
        );
        return;
      }
      for (const attachment of submission.attachments) {
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
                `Too large [${prettyBytes(attachment.size)} > ${prettyBytes(
                  sizeLimit
                )}]`
              )
            );
            continue;
          }
        }
        await downloadAndProcessOneAttachment(submission, attachment);
      }
      break;

    case "online_url":
      writeAndCacheOneStudentFile(
        submission,
        "url.txt",
        "submission.url" + "\n"
      );
      console.log("\t", chalk.green(submission.url));
      break;

    case "online_quiz":
      console.log(chalk.green("Nothing to do for a quiz"));
      break;

    case null:
      console.log("\t", chalk.red("Nothing submitted by this student"));
      break;

    default:
      console.error(
        chalk.red(
          `Not set up to handle submission type '${submission.submission_type}'`
        )
      );
  }
}

function gradeSubmission(userId, score, comment) {
  const maxScore = currentMaxScore();
  if (!isScoreValid(score, maxScore)) {
    fatal(invalidScoreMessage(score, maxScore));
  }

  const parameters = {
    submission: { posted_grade: score },
  };
  if (comment && comment.length > 0) {
    parameters.comment = { text_comment: comment };
  }

  return api_client
    .put(submissionUrl(userId), {
      searchParams: queryString.stringify(parameters),
    })
    .then((response) => response.body);
}

function cacheSubmission(sub) {
  db.set(`current.course.students.${sub.user.id}.submission`, {
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
  console.log(
    chalk.blue("       URL"),
    chalk.yellow(current.assignment.html_url)
  );
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
  debugDownload(absPath);
  return pipeline(got.stream(url), createWriteStream(absPath));
}

class ExtractHelper {
  constructor() {
    this.studentFiles = [];
    this.files = { extracted: 0, skipped: 0 };
    this.bytes = { extracted: 0, skipped: 0 };
  }

  skipEntry(name) {
    return (
      name.includes("node_modules/") ||
      name.includes(".git/") ||
      name.includes(".idea/") ||
      name.includes("/.DS_Store") ||
      name.includes("/._")
    );
  }

  addEntry(name, size) {
    if (this.skipEntry(name)) {
      this.files.skipped += 1;
      this.bytes.skipped += size;
    } else {
      this.files.extracted += 1;
      this.bytes.extracted += size;
      this.studentFiles.push({ name, size });

      console.log(
        "\t",
        chalk.green(`${name}`),
        chalk.yellow(`(${prettyBytes(size)})`)
      );
    }
  }

  report() {
    const segments = [];
    if (this.files.skipped === 0) {
      segments.push(
        `${this.files.extracted} ${pluralize("file", this.files.extracted)}`
      );
    } else {
      const totalFiles = this.files.skipped + this.files.extracted;
      segments.push(`${this.files.extracted}/${totalFiles}`);
      segments.push(`${this.files.skipped} skipped`);
    }
    if (this.bytes.skipped === 0) {
      segments.push(prettyBytes(this.bytes.extracted));
    } else {
      const totalBytes = this.bytes.skipped + this.bytes.extracted;
      segments.push(
        `${prettyBytes(this.bytes.extracted)}/${prettyBytes(totalBytes)}`
      );
      segments.push(`${prettyBytes(this.bytes.skipped)} skipped`);
    }
    const report = ["\t "] + segments.join(" | ");
    const color = this.bytes.skipped || this.files.skipped ? "red" : "teal";
    console.log(chalk.keyword(color)(report));
  }
}

function dbStudentFilePath(submission) {
  return `current.course.students.${submission.user.id}.files`;
}

function clearStudentFiles(submission) {
  debugCache("Clear student files");
  db.set(dbStudentFilePath(submission), []).write();
}

function cacheOneStudentFile(submission, name, size) {
  const entry = { name, size };
  debugCache("Cache %O", entry);
  db.get(dbStudentFilePath(submission)).push(entry).write();
}

function writeAndCacheOneStudentFile(submission, name, content) {
  writeFileSync(submissionPath(submission.user, name), content);
  cacheOneStudentFile(submission, name, content.length);
}

async function downloadAndProcessOneAttachment(submission, attachment) {
  const absPath = submissionPath(submission.user, attachment.display_name);
  const contentType = attachment["content-type"];

  try {
    await downloadOneAttachment(attachment.url, absPath);
  } catch (err) {
    warning(`Problem with download: ${err}`);
  }

  const extractHelper = new ExtractHelper();

  switch (contentType) {
    case "application/zip":
    case "application/x-zip-compressed":
      console.log("\t", chalk.cyan("Zip file"));
      try {
        await extractZip(absPath, {
          dir: dirname(absPath),
          onEntry: (entry) => {
            debugExtract("Zip entry %O", entry);
            if (!entry.fileName.endsWith("/")) {
              // According to the yauzl docs, directories end with a slash.
              // Don't add them.
              extractHelper.addEntry(entry.fileName, entry.uncompressedSize);
            }
          },
        });
        extractHelper.report();
      } catch (err) {
        warning(`Problem extracting zip file: ${err}`);
      }
      break;

    case "application/x-tar":
    case "application/x-gzip":
      console.log("\t", chalk.cyan("Tar file"));
      try {
        await tar.extract({
          file: absPath,
          cwd: dirname(absPath),
          filter: (path, entry) => !extractHelper.skipEntry(path),
          onentry: (entry) => {
            debugExtract("Tar entry %O", entry);
            if (entry.type !== "Directory") {
              extractHelper.addEntry(entry.path, entry.size);
            }
          },
        });
        extractHelper.report();
      } catch (err) {
        warning(`Problem extracting tar file: ${err}`);
      }
      break;

    case "application/json":
    case "application/pdf":
    case "application/sql":
    case "text/javascript":
    case "text/plain":
    case "text/x-sql":
      extractHelper.addEntry(attachment.display_name, attachment.size);
      console.log("\t", chalk.green("No processing required"));
      break;

    default:
      warning(
        `Not configured to process ${attachment.display_name} (${attachment["content-type"]})`
      );
      break;
  }

  extractHelper.studentFiles.forEach((fileInfo) =>
    cacheOneStudentFile(submission, fileInfo.name, fileInfo.size)
  );
}

function showEditor(student) {
  const result = childProcess.spawnSync(
    "code",
    ["--wait", submissionDir(student)],
    { stdio: "ignore" }
  );
  debugCli("Editor result %O", result);
}

function formatGradeChoice(name, points, maxPoints) {
  return {
    name: [name, chalk.yellow(`(${points}/${maxPoints})`)].join(" "),
    value: points,
  };
}

function gradePassFail(maxPoints) {
  return inquirer
    .prompt([
      {
        type: "list",
        message: "Pass or fail",
        name: "score",
        choices: [
          formatGradeChoice("Pass", maxPoints, maxPoints),
          formatGradeChoice("Fail", 0, maxPoints),
        ],
      },
    ])
    .then((answer) => answer.score);
}

function gradeLetter(maxPoints) {
  const SCALE = [
    { grade: "A", percent: 100.0 },
    { grade: "B", percent: 90.0 },
    { grade: "C", percent: 80.0 },
    { grade: "D", percent: 70.0 },
    { grade: "F", percent: 60.0 },
    { grade: "N", percent: 0.0 },
  ];

  return inquirer
    .prompt([
      {
        type: "list",
        message: "Assign a grade",
        name: "score",
        choices: () =>
          SCALE.map((gr) =>
            formatGradeChoice(
              gr.grade,
              (gr.percent / 100.0) * maxPoints,
              maxPoints
            )
          ),
      },
    ])
    .then((answer) => answer.score);
}

function gradePoints(maxScore) {
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

async function showPager(student) {
  const allFiles = student.files;

  if (!allFiles || allFiles.length === 0) {
    console.log("\t", chalk.yellow(`No files for this student`));
    return;
  }

  let filePaths = [];
  if (allFiles.length === 1) {
    filePaths = [submissionPath(student, allFiles[0].name)];
  } else {
    while (filePaths.length === 0) {
      const { files } = await inquirer.prompt([
        {
          type: "checkbox",
          message: "Choose files to inspect",
          pageSize: 20,
          name: "files",
          choices: () =>
            allFiles.map((file) => ({
              name: `${file.name} (${prettyBytes(file.size)})`,
              value: file,
            })),
        },
      ]);
      if (files.length === 0) {
        console.log(chalk.yellow("Select at least one file"));
      } else {
        console.log(chalk.green(`Selected ${files.length} files`));
        filePaths = files.map((f) => submissionPath(student, f.name));
      }
    }
  }

  childProcess.spawnSync("less", filePaths, {
    stdio: "inherit",
  });
}

async function confirmScore(student, score, maxScore) {
  const formattedScore = [
    chalk.yellow(student.name),
    `${chalk.yellow(score)}/${maxScore}`,
  ].join(" ");

  const currentComments = [];

  const previousComments = db.get("current.assignment.comments").value();
  if (previousComments.length) {
    const { selected } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selected",
        message: "Choose existing comments (optional)",
        choices: previousComments,
      },
    ]);
    currentComments.push(selected);
  }

  const { comment } = await inquirer.prompt([
    {
      type: "input",
      name: "comment",
      message: "Add a comment (optional)",
    },
  ]);

  if (comment) {
    currentComments.push(comment);
    db.get("current.assignment.comments").push(comment).write();
  }

  const { confirmed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmed",
      message: `Assign ${formattedScore}?`,
    },
  ]);

  if (confirmed) {
    const commentString = currentComments.join("\n");
    await gradeSubmission(student.id, score, commentString);
    console.log("  Score", chalk.green(formattedScore));
    if (commentString) {
      console.log("Comment", chalk.green(commentString));
    }
  } else {
    console.log(chalk.yellow("No score submitted"));
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
  const wrappedMessage = wrapText(`${prefix} - ${message}`);
  return boxen(chalk.keyword(color)(wrappedMessage), {
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
      console.log(table(rows, { singleLine: true }));
    });

  listCmd
    .command("students")
    .description("List students")
    .action(async () => {
      const students = _.sortBy(await getStudents(getCurrentCourseId()), (s) =>
        s.sortable_name.toLowerCase()
      );
      const rows = students.map((s) => [s.id, s.name]);
      console.log(table(rows, { singleLine: true }));
    });

  listCmd
    .command("groups")
    .description("List all groups/members")
    .action(() => {
      const groupCategories = db.get("current.course.groupCategories").value();
      const rows = [];

      for (let grpCat of _.values(groupCategories)) {
        for (let grp of grpCat.groups) {
          for (let member of grp.members) {
            rows.push([grpCat.name, grp.name, member.name]);
          }
        }
      }
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
    .option(
      "--scheme <scheme>",
      chalk`Grading scheme: {blue points}, {blue passFail}, {blue letter}`,
      "points"
    )
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

      let gradingFunction = null;
      switch (options.scheme) {
        case "points":
          gradingFunction = gradePoints;
          break;
        case "passFail":
          gradingFunction = gradePassFail;
          break;
        case "letter":
          gradingFunction = gradeLetter;
          break;
        default:
          fatal(`Invalid grading scheme '${options.grade}'`);
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

        function formatStudentName(student) {
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

        while (_.size(remainingStudents) > 0) {
          const answer = await inquirer.prompt([
            {
              type: "list",
              name: "student",
              message: `Choose a student (${_.size(
                remainingStudents
              )} available)`,
              pageSize: 20,
              choices: () =>
                remainingStudents.map((s) => ({
                  name: formatStudentName(s),
                  value: s,
                })),
            },
          ]);
          const student = answer.student;

          await showViewer(student);

          const score = await gradingFunction(maxScore);
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
            cacheSubmission(updatedSubmission);
          }
        }
      }
    });

  program
    .command("download [studentId]")
    .description("Download submissions")
    .option(
      "--max-size <size>",
      "Don't get attachments larger than this (bytes)"
    )
    .option("--show-details", "Show submission details")
    .action(async (studentId, options) => {
      if (studentId) {
        await processOneSubmission(await getOneSubmission(studentId), options);
      } else {
        for (const submission of await getSubmissions()) {
          await processOneSubmission(submission, options);
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
              pageSize: 20,
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

      const dbData = _(selectedAssignment)
        .pick([
          "id",
          "name",
          "due_at",
          "html_url",
          "needs_grading_count",
          "submission_types",
          "points_possible",
        ])
        .set("submission_summary", submissionSummary)
        .set("comments", []);

      db.set("current.assignment", dbData).write();
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
      const groupCategories = await getGroupCategories(answer.course.id);

      db.set("current.course", {
        id: answer.course.id,
        name: answer.course.name,
        course_code: answer.course.course_code,
        assignment_groups: _.keyBy(groups, (elt) => elt.id),
        students: _.keyBy(students, (elt) => elt.id),
        groupCategories,
      }).write();
    });

  program.parse(process.argv);
}
