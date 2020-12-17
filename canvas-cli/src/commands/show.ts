import { Command } from "commander";
import chalk from "chalk";
import _ from "lodash";
import { table } from "table";
import dir from "node-dir";
import CanvasApi from "../api/api";
import Cache from "../Cache";
import {
  submissionAssignmentDir,
  submissionBaseDir,
  submissionCourseDir,
  submissionStudentDir,
} from "../util/fileSystem";
import { longestKeyLength } from "../util/formatting";

export class ShowCommands {
  constructor(private api: CanvasApi) {}
  private cache = Cache.getInstance();

  addCommands(program: Command) {
    const showCmd = program.command("show").description("Show things");

    showCmd
      .command("submission <userId>")
      .description("Show details of submission from user <userId>")
      .action(async (userId: number) => {
        const submission = await this.api.getOneSubmission(userId);
        console.log(submission);
      });

    showCmd
      .command("assignment <id>")
      .description("Show details of assignment <id>")
      .action(async (id: number) => {
        const assignment = await this.api.getOneAssignment(id);
        console.log(assignment);
      });

    showCmd
      .command("student <id>")
      .description("Show details of student <id>")
      .action(async (id: number) => {
        const student = await this.api.getOneStudent(id);
        console.log(student);
      });

    showCmd
      .command("paths [studentId]")
      .description("Show paths to downloaded files")
      .action((studentId: number) => {
        const entries = [
          { name: "Base", path: submissionBaseDir() },
          { name: "Course", path: submissionCourseDir() },
          { name: "Assignment", path: submissionAssignmentDir() },
        ];

        if (studentId) {
          const student = this.cache.getStudent(studentId);
          entries.push({
            name: "Student",
            path: submissionStudentDir(student),
          });
        }

        const maxLen = longestKeyLength(entries, "name");

        const rows = entries.map((e) => [
          chalk.blue(_.padStart(e.name, maxLen)),
          chalk.green(e.path),
        ]);

        console.log(table(rows, { singleLine: true }));
      });

    showCmd
      .command("tree <studentId>")
      .description("Show tree view of downloaded files")
      .action((studentId: number) => {
        const baseDir = submissionStudentDir(this.cache.getStudent(studentId));
        dir.files(baseDir, (err, files) => {
          if (err) throw err;
          files.forEach((f) => console.log(f));
        });
      });
    return showCmd;
  }
}
