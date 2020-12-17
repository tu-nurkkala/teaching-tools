import { table } from "table";
import { values, sortBy } from "lodash";
import chalk from "chalk";
import { isoDateTimeToDate } from "../util/datetime";
import { formatSubmissionTypes } from "../util/formatting";
import { Command } from "commander";
import { CacheService } from "../services/CacheService";
import { ApiService } from "../services/ApiService";
import { Service } from "typedi";

@Service()
export class ListCommands {
  constructor(private api: ApiService, private cache: CacheService) {}

  addCommands(program: Command) {
    const listCmd = program.command("list").description("List things");

    listCmd
      .command("assignments")
      .description("List assignments")
      .action((api, cache) => this.listAssignments());

    listCmd
      .command("students")
      .description("List students")
      .action(() => this.listStudents());

    listCmd
      .command("groups")
      .description("List all groups/members")
      .action(() => this.listGroups());

    return listCmd;
  }

  async listAssignments() {
    const groups = this.cache.get("course.assignment_groups").value();
    const assignments = await this.api.getAssignments();
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
  }

  listStudents() {
    const students = sortBy(this.cache.getStudents(), (s) =>
      s.sortable_name.toLowerCase()
    );
    const rows = students.map((s) => [s.id, s.name]);
    console.log(table(rows, { singleLine: true }));
  }

  listGroups() {
    const groupCategories = this.cache.get("course.groupCategories").value();
    const rows = [];

    for (let grpCat of values(groupCategories)) {
      for (let grp of grpCat.groups) {
        for (let member of grp.members) {
          rows.push([grpCat.name, grp.name, member.name]);
        }
      }
    }
    console.log(table(rows, { singleLine: true }));
  }
}
