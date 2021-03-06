import { Command } from "commander";
import chalk from "chalk";
import { table } from "table";
import _ from "lodash";
import inquirer from "inquirer";
import {
  fatal,
  formatGradeChoices,
  formatStudentName,
  GradingScale,
  showSeparator,
} from "../util/formatting";
import childProcess from "child_process";
import { debugCli } from "../util/debug";
import prettyBytes from "pretty-bytes";
import { Student } from "../entities/Student";
import { FileInfo } from "../entities/Assignment";
import { ApiService } from "../services/ApiService";
import { CacheService } from "../services/CacheService";
import { FileSystemService } from "../services/FileSystemService";
import { Service } from "typedi";

type GradingSchemes = "points" | "passfail" | "letter";
type GradingFunction = (max: number) => Promise<number>;

interface GradeCommandOptions {
  editor: boolean;
  pager: boolean;
  scheme: GradingSchemes;
}

@Service()
export class GradeCommands {
  constructor(
    private api: ApiService,
    private cache: CacheService,
    private fs: FileSystemService
  ) {}

  addCommands(topLevelCommand: Command) {
    topLevelCommand
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
      .action((userId: number, score: number, options: GradeCommandOptions) =>
        this.gradeSubmission(userId, score, options)
      );
  }

  private showViewer(options: GradeCommandOptions, student: Student) {
    if (options.editor) {
      return this.showEditor(student);
    } else if (options.pager) {
      return this.showPager(student);
    }
  }

  async gradeSubmission(
    userId: number,
    score: number,
    options: GradeCommandOptions
  ) {
    const maxScore = this.currentMaxScore();

    if (options.pager) {
      if (options.editor) {
        fatal("Can't enable both editor and pager");
      }
    } else {
      if (!options.editor) {
        options.pager = true;
      }
    }

    let gradingFunction: GradingFunction;
    switch (options.scheme) {
      case "points":
        gradingFunction = this.gradePoints;
        break;
      case "passfail":
        gradingFunction = this.gradePassFail;
        break;
      case "letter":
        gradingFunction = this.gradeLetter;
        break;
      default:
        fatal(`Invalid grading scheme '${options.scheme}'`);
    }

    if (userId) {
      // Grade one student.
      if (!score) {
        fatal("Specific `userId` also requires `score`.");
      }

      const student = this.cache.getStudent(userId);
      if (!student) {
        fatal(`No cached student with id ${userId}`);
      }

      this.showViewer(options, student);
      await this.confirmScore(student, score, maxScore);
    } else {
      // Grade multiple students.
      const allStudents = this.cache.getStudents();
      const gradedStudents: Student[] = [];
      let remainingStudents: Student[] = [];
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

        await this.showViewer(options, student);

        // @ts-ignore - The grading function _is_ defined above.
        // Is TS confused by the `switch` statement?
        const score = await gradingFunction(maxScore);
        const confirmed = await this.confirmScore(student, score, maxScore);
        if (confirmed) {
          const gradedStudent = remainingStudents.find(
            (s) => s.id === student.id
          );
          remainingStudents = remainingStudents.filter(
            (s) => s.id !== student.id
          );
          if (gradedStudent) {
            gradedStudents.push(gradedStudent);
          }

          const updatedSubmission = await this.api.getOneSubmission(student.id);
          this.cache.cacheSubmission(updatedSubmission);
        }
      }
    }
  }

  gradePoints(maxScore: number): Promise<number> {
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
            if (!this.isScoreValid(value, maxScore)) {
              return this.invalidScoreMessage(value, maxScore);
            }
            return true;
          },
        },
      ])
      .then((answer) => answer.score);
  }

  gradePassFail(maxPoints: number): Promise<number> {
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

  gradeLetter(maxPoints: number): Promise<number> {
    const SCALE: GradingScale = [
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

  showEditor(student: Student) {
    const result = childProcess.spawnSync(
      "code",
      ["--wait", this.fs.submissionDir(student)],
      { stdio: "ignore" }
    );
    debugCli("Editor result %O", result);
  }

  async showPager(student: Student) {
    const allFiles = student.files;

    if (!allFiles || allFiles.length === 0) {
      console.log("\t", chalk.yellow(`No files for this student`));
      return;
    }

    let filePaths: string[] = [];
    if (allFiles.length === 1) {
      filePaths = [this.fs.submissionPath(student, allFiles[0].name)];
    } else {
      while (filePaths.length === 0) {
        const { files } = await inquirer.prompt<{ files: FileInfo[] }>([
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
          filePaths = files.map((f) => this.fs.submissionPath(student, f.name));
        }
      }
    }

    childProcess.spawnSync("less", filePaths, {
      stdio: "inherit",
    });
  }

  async confirmScore(student: Student, score: number, maxScore: number) {
    const formattedScore = [
      chalk.yellow(student.name),
      `${chalk.yellow(score)}/${maxScore}`,
    ].join(" ");

    const currentComments = [];

    const previousComments = this.cache.get("assignment.comments").value();
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
      this.cache.push("assignment.comments", comment);
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
      await this.submitGrade(student.id, score, commentString);
      console.log("  Score", chalk.green(formattedScore));
      if (commentString) {
        console.log("Comment", chalk.green(commentString));
      }
    } else {
      console.log(chalk.yellow("No score submitted"));
    }
    return confirmed;
  }

  currentMaxScore() {
    return this.cache.get("assignment.points_possible").value();
  }

  isScoreValid(score: number, maxScore: number) {
    return score >= 0 && score <= maxScore;
  }

  invalidScoreMessage(score: number, maxScore: number) {
    return `Invalid score [0 <= ${score} <= ${maxScore}]`;
  }

  submitGrade(userId: number, score: number, comment: string) {
    const maxScore = this.currentMaxScore();
    if (!this.isScoreValid(score, maxScore)) {
      fatal(this.invalidScoreMessage(score, maxScore));
    }

    return this.api.gradeSubmission(userId, score, comment);
  }
}
