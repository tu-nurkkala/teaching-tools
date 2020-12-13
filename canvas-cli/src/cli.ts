//@ts-nocheck

import { config } from "dotenv";
config();

import got from "got";
import inquirer from "inquirer";
import _ from "lodash";
import chalk from "chalk";
import { sprintf } from "sprintf-js";
import { DateTime } from "luxon";
import untildify from "untildify";
import { mkdirSync, createWriteStream, writeFileSync } from "fs";
import { dirname, join } from "path";
import { table } from "table";
import Fuse from "fuse.js";
import extractZip from "extract-zip";
import prettyBytes from "pretty-bytes";
import pluralize from "pluralize";
import childProcess from "child_process";
import boxen, { BorderStyle } from "boxen";
import tar from "tar";
import wrapText from "wrap-text";
import dir from "node-dir";
import CacheDb from "./cacheDb";
import { listGroups, listStudents } from "./commands/list";
import CanvasApi from "./api";
import stream from "stream";
import { promisify } from "util";
import { debugCache, debugCli, debugDownload, debugExtract } from "./debug";
import {
  Assignment,
  FileInfo,
  Student,
  StudentSubmission,
  SubmissionType,
} from "./types";
import { program } from "commander";
import { version } from "../package.json";
import TurndownService from "turndown";
import TermResource from "./entities/Term";

const cache = new CacheDb();
const api = new CanvasApi(cache);

program.version(version);
program.option("--api-chatter", "Show API actions");

const prettyError = require("pretty-error").start();
prettyError.appendStyle({
  "pretty-error > trace > item": {
    marginBottom: 0,
    bullet: '"<red>-</red>"',
  },
});

const turndownService = new TurndownService({
  headingStyle: "atx",
});

const pipeline = promisify(stream.pipeline);

function currentMaxScore() {
  return cache.get("assignment.points_possible").value();
}

function isScoreValid(score: number, maxScore: number) {
  return score >= 0 && score <= maxScore;
}

function invalidScoreMessage(score: number, maxScore: number) {
  return `Invalid score [0 <= ${score} <= ${maxScore}]`;
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

function gradeSubmission(userId: number, score: number, comment: string) {
  const maxScore = currentMaxScore();
  if (!isScoreValid(score, maxScore)) {
    fatal(invalidScoreMessage(score, maxScore));
  }

  return api.gradeSubmission(userId, score, comment);
}

function cacheSubmission(sub: StudentSubmission) {
  cache
    .set(`course.students.${sub.user.id}.submission`, {
      id: sub.id,
      grade: sub.grade,
      score: sub.score,
      grader_id: sub.grader_id,
      graded_at: sub.graded_at,
      workflow_state: sub.workflow_state,
    })
    .write();
}

function showElement(typeName: string, value, extraFields = []) {
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

function isoDateTimeToDate(dt: string) {
  return DateTime.fromISO(dt).toISODate();
}

function formatAssignment(assignment: Assignment) {
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

function formatSubmissionType(subType: SubmissionType) {
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
  const assignment = cache.getAssignment();
  showElement("Term", cache.getTerm().id);
  showElement("Course", cache.getCourse().id);
  showElement("Assignment", assignment.id);
  console.log(chalk.blue("       URL"), chalk.yellow(assignment.html_url));
}

function submissionBaseDir() {
  return untildify("~/Scratch");
}

function submissionCourseDir() {
  return join(
    submissionBaseDir(),
    sanitizeString(cache.get("course.course_code").value())
  );
}

function submissionAssignmentDir() {
  return join(
    submissionCourseDir(),
    sanitizeString(cache.get("assignment.name").value())
  );
}

function submissionStudentDir(student: Student) {
  return join(submissionAssignmentDir(), sanitizeString(student.sortable_name));
}

function submissionDir(student: Student) {
  // This looks dumb, but would allow future expansion.
  const finalDir = submissionStudentDir(student);
  mkdirSync(finalDir, { recursive: true });
  return finalDir;
}

function submissionPath(student: Student, fileName: string) {
  return join(submissionDir(student), fileName);
}

function downloadOneAttachment(url: string, absPath: string) {
  debugDownload(absPath);
  return pipeline(got.stream(url), createWriteStream(absPath));
}

interface ExtractInfo {
  extracted: number;
  skipped: number;
}

class ExtractHelper {
  studentFiles: FileInfo[];
  files: ExtractInfo;
  bytes: ExtractInfo;

  constructor() {
    this.studentFiles = [];
    this.files = { extracted: 0, skipped: 0 };
    this.bytes = { extracted: 0, skipped: 0 };
  }

  skipEntry(name: string) {
    return (
      name.includes("node_modules/") ||
      name.includes(".git/") ||
      name.includes(".idea/") ||
      name.includes("/.DS_Store") ||
      name.includes("/._") ||
      name.includes("/venv/")
    );
  }

  addEntry(name: string, size: number) {
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
  return `course.students.${submission.user.id}.files`;
}

function clearStudentFiles(submission) {
  debugCache("Clear student files");
  cache.set(dbStudentFilePath(submission), []).write();
}

function cacheOneStudentFile(submission, name, size) {
  const entry = { name, size };
  debugCache("Cache %O", entry);
  cache.get(dbStudentFilePath(submission)).push(entry).write();
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

    case "application/gzip":
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
    case "text/x-python":
    case "text/x-python-script":
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

function longestValueLength(objArray, key) {
  return _(objArray)
    .map(key)
    .map((n) => n.length)
    .max();
}

function formatGradeChoices(scale, maxPoints) {
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

function gradePassFail(maxPoints): Promise<number> {
  return inquirer
    .prompt([
      {
        type: "list",
        message: "Pass or fail",
        name: "score",
        choices: formatGradeChoices(
          [
            { grade: "Pass", percent: 100.0 },
            { grade: "Fail", percent: 0.0 },
          ],
          maxPoints
        ),
      },
    ])
    .then((answer) => answer.score);
}

function gradeLetter(maxPoints): Promise<number> {
  const SCALE = [
    { grade: "A", percent: 100.0, description: "Exceeds" },
    { grade: "A-", percent: 95.0, description: "Fully meets" },
    { grade: "B+", percent: 87.0 },
    { grade: "B", percent: 85.0, description: "Meets" },
    { grade: "B-", percent: 83.0 },
    { grade: "C+", percent: 77.0 },
    { grade: "C", percent: 75.0, description: "Minimally meets" },
    { grade: "C-", percent: 73.0 },
    { grade: "D+", percent: 67.0 },
    { grade: "D", percent: 65.0, description: "Partially meets" },
    { grade: "D-", percent: 63.0 },
    { grade: "F", percent: 60.0, description: "Shows effort" },
    { grade: "1/3", percent: 33.3 },
    { grade: "0", percent: 0.0, description: "No credit" },
  ];

  return inquirer
    .prompt([
      {
        type: "list",
        message: "Assign a grade",
        name: "score",
        pageSize: 20,
        choices: () => formatGradeChoices(SCALE, maxPoints),
      },
    ])
    .then((answer) => answer.score);
}

function gradePoints(maxScore: number): Promise<number> {
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

  const previousComments = cache.get("assignment.comments").value();
  if (previousComments.length) {
    const { selected } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selected",
        message: "Choose existing comments (optional)",
        choices: previousComments,
      },
    ]);
    currentComments.push(...selected);
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
    cache.get("assignment.comments").push(comment).write();
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
    borderStyle: BorderStyle.Round,
    padding: { top: 0, right: 1, bottom: 0, left: 1 },
  });
}

function fatal(message) {
  console.log(makeBox("red", "ERROR", message));
  process.exit(1);
}

function warning(message) {
  console.log(makeBox("yellow", "WARNING", message));
}

function showSeparator() {
  console.log(chalk.blue("-".repeat(80)));
}

export default function cli() {
  // FIXME - Re-enable this.
  // showCurrentState();

  program
    .command("current")
    .alias("status")
    .description("Show current settings");

  const listCmd = program.command("list").description("List things");

  listCmd
    .command("assignments")
    .description("List assignments")
    .action(async () => {
      const groups = cache.get("course.assignment_groups").value();
      const assignments = await api.getAssignments();
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
    .action(() => listStudents(cache));

  listCmd
    .command("groups")
    .description("List all groups/members")
    .action(() => listGroups(cache));

  const showCmd = program.command("show").description("Show details");

  showCmd
    .command("submission <userId>")
    .description("Show details of submission from user <userId>")
    .action(async (userId) => {
      const submission = await api.getOneSubmission(userId);
      console.log(submission);
    });

  showCmd
    .command("assignment <id>")
    .description("Show details of assignment <id>")
    .action(async (id) => {
      const assignment = await api.getOneAssignment(id);
      console.log(assignment);
    });

  showCmd
    .command("student <id>")
    .description("Show details of student <id>")
    .action(async (id) => {
      const student = await api.getOneStudent(id);
      console.log(student);
    });

  showCmd
    .command("paths [studentId]")
    .description("Show paths to downloaded files")
    .action((studentId) => {
      const entries = [
        { name: "Base", path: submissionBaseDir() },
        { name: "Course", path: submissionCourseDir() },
        { name: "Assignment", path: submissionAssignmentDir() },
      ];

      if (studentId) {
        const student = cache.getStudent(studentId);
        entries.push({ name: "Student", path: submissionStudentDir(student) });
      }

      const maxLen = longestValueLength(entries, "name");

      const rows = entries.map((e) => [
        chalk.blue(_.padStart(e.name, maxLen)),
        chalk.green(e.path),
      ]);

      console.log(table(rows, { singleLine: true }));
    });

  showCmd
    .command("tree <studentId>")
    .description("Show tree view of downloaded files")
    .action((studentId) => {
      const baseDir = submissionStudentDir(cache.getStudent(studentId));
      dir.files(baseDir, (err, files) => {
        if (err) throw err;
        files.forEach((f) => console.log(f));
      });
    });

  const findCmd = program.command("find").description("Find things");

  findCmd
    .command("student <fuzzy>")
    .alias("search")
    .description("Find student using fuzzy match")
    .action(async (fuzzy) => {
      const students = await api.getStudents();
      const fuse = new Fuse(students, {
        includeScore: true,
        ignoreLocation: true,
        threshold: 0.01,
        keys: ["name", "sortable_name", "short_name", "login_id"],
      });
      const result = fuse.search<Student>(fuzzy);
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
      chalk`Grading scheme: {blue points}, {blue passfail}, {blue letter}`,
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

      let gradingFunction;
      switch (options.scheme) {
        case "points":
          gradingFunction = gradePoints;
          break;
        case "passfail":
          gradingFunction = gradePassFail;
          break;
        case "letter":
          gradingFunction = gradeLetter;
          break;
        default:
          fatal(`Invalid grading scheme '${options.scheme}'`);
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

        const student = cache.getStudent(userId);
        if (!student) {
          fatal(`No cached student with id ${userId}`);
        }

        showViewer(student);
        await confirmScore(student, score, maxScore);
      } else {
        // Grade multiple students.
        const allStudents = [];
        for (const [id, student] of Object.entries(
          cache.get("course.students").value()
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
          showSeparator();
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

            const updatedSubmission = await api.getOneSubmission(student.id);
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
        await processOneSubmission(
          await api.getOneSubmission(studentId),
          options
        );
      } else {
        for (const submission of await api.getSubmissions()) {
          await processOneSubmission(submission, options);
        }
      }
    });

  const setCmd = program
    .command("select")
    .alias("choose")
    .alias("set")
    .description("Set current values");

  setCmd
    .command("assignment [id]")
    .description("Set the current assignment")
    .action(async (id) => {
      const allAssignments = await api.getAssignments();
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

      const submissionSummary = await api.getSubmissionSummary(
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

      cache.set("assignment", dbData).write();
      console.log(
        chalk.green(`Current assignment now '${selectedAssignment.name}'`)
      );
    });

  setCmd
    .command("term")
    .description("Set the current term")
    .action(async () => {
      const terms = await api.getEnrollmentTerms();
      const answers = await inquirer.prompt<{ term: TermResource }>([
        {
          type: "list",
          name: "term",
          message: "Choose a term",
          pageSize: 10,
          choices: () =>
            terms.map((term) => ({
              name: term,
              value: term,
            })),
        },
      ]);
      cache
        .set("term", {
          id: answers.term.id,
          name: answers.term.name,
        })
        .write();
      return answers.term;
    });

  setCmd
    .command("course")
    .description("Set current course")
    .action(async () => {
      const courses = await api.getCourses();
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
      const groups = await api.getAssignmentGroups(answer.course.id);
      const students = await api.getStudents(answer.course.id);
      const groupCategories = await api.getGroupCategories(answer.course.id);

      cache
        .set("course", {
          id: answer.course.id,
          name: answer.course.name,
          course_code: answer.course.course_code,
          assignment_groups: _.keyBy(groups, (elt) => elt.id),
          students: _.keyBy(students, (elt) => elt.id),
          groupCategories,
        })
        .write();
    });

  program.parse(process.argv);
}
