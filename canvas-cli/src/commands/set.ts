import { Command } from "commander";
import CanvasApi from "../api/api";
import CacheDb from "../CacheDb";
import { fatal, formatAssignment } from "../util/formatting";
import inquirer from "inquirer";
import _ from "lodash";
import chalk from "chalk";
import { Term } from "../entities/Term";
import { Course } from "../entities/Course";

export class SetCommands {
  constructor(private api: CanvasApi, private cache: CacheDb) {}

  addCommands(program: Command) {
    const setCmd = program
      .command("set")
      .aliases(["choose", "select"])
      .description("Set state");

    setCmd
      .command("assignment [id]")
      .description("Set the current assignment")
      .action(async (id) => {
        const allAssignments = await this.api.getAssignments();
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

        if (selectedAssignment) {
          const submissionSummary = await this.api.getSubmissionSummary(
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

          this.cache.set("assignment", dbData).write();
          console.log(
            chalk.green(`Current assignment now '${selectedAssignment.name}'`)
          );
        } else {
          fatal("Failed to find selected assignment.");
        }
      });

    setCmd
      .command("term")
      .description("Set the current term")
      .action(async () => {
        const terms = await this.api.getTerms();
        const answers = await inquirer.prompt<{ term: Term }>([
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
        this.cache
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
        const courses = await this.api.getCourses(this.cache.getTerm().id);
        const answers = await inquirer.prompt<{ course: Course }>([
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

        await this.api.getGroupCategories(answers.course.id);

        // FIXME - Cache the course locally.
      });
    return setCmd;
  }
}
