import Fuse from "fuse.js";
import { Student } from "../entities/Student";
import { table } from "table";
import { Command } from "commander";
import CanvasApi from "../api/api";
import CacheDb from "../CacheDb";

export class FindCommands {
  constructor(
    private findCmd: Command,
    private api: CanvasApi,
    private cache: CacheDb
  ) {
    findCmd
      .command("student <fuzzy>")
      .alias("search")
      .description("Find student using fuzzy match")
      .action(async (fuzzy) => {
        const students = await api.getStudents(cache.getCourse().id);
        const fuse = new Fuse(students, {
          includeScore: true,
          ignoreLocation: true,
          threshold: 0.01,
          keys: ["name", "sortable_name", "short_name", "login_id"],
        });
        const result = fuse.search<Student>(fuzzy);
        const rows = result.map((elt) => [
          elt.item.id,
          elt.score,
          elt.item.name,
        ]);
        console.log(table(rows, { singleLine: true }));
      });
  }
}
