import CacheDb from "../cacheDb";
import { table } from "table";
import { values, sortBy } from "lodash";

export function listStudents(db: CacheDb) {
  const students = sortBy(db.getStudents(), (s) =>
    s.sortable_name.toLowerCase()
  );
  const rows = students.map((s) => [s.id, s.name]);
  console.log(table(rows, { singleLine: true }));
}

export function listGroups(db: CacheDb) {
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
