import { Command, program } from "commander";
import chalk from "chalk";
import _ from "lodash";
import { table } from "table";
import dir from "node-dir";
import CanvasApi from "../api/api";
import CacheDb from "../CacheDb";
import {
    submissionAssignmentDir,
    submissionBaseDir,
    submissionCourseDir, submissionStudentDir
} from "../util/fileSystem";
import {longestValueLength} from "../util/formatting";

export class ShowCommands {
  constructor(
    private showCmd: Command,
    private api: CanvasApi,
    private cache: CacheDb
  ) {
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
          entries.push({
            name: "Student",
            path: submissionStudentDir(student),
          });
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
  }
}
