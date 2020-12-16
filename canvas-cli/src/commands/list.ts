import CacheDb from "../CacheDb";
import { table } from "table";
import { values, sortBy } from "lodash";
import chalk from "chalk";
import CanvasApi from "../api/api";
import { isoDateTimeToDate } from "../util/datetime";
import { formatSubmissionTypes } from "../util/formatting";
import { Command } from "commander";

export class ListCommands {
  constructor(
    private listCmd: Command,
    private api: CanvasApi,
    private cache: CacheDb
  ) {
    listCmd
      .command("assignments")
      .description("List assignments")
      .action((api, cache) => this.listAssignments(api, cache));

    listCmd
      .command("students")
      .description("List students")
      .action(() => this.listStudents(cache));

    listCmd
      .command("groups")
      .description("List all groups/members")
      .action(() => this.listGroups(cache));
  }

  async listAssignments(api: CanvasApi, cache: CacheDb) {
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
  }

  listStudents(db: CacheDb) {
    const students = sortBy(db.getStudents(), (s) =>
      s.sortable_name.toLowerCase()
    );
    const rows = students.map((s) => [s.id, s.name]);
    console.log(table(rows, { singleLine: true }));
  }

  listGroups(db: CacheDb) {
    const groupCategories = db.get("course.groupCategories").value();
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
