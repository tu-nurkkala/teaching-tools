import low, { LowdbSync } from "lowdb";
import FileSync from "lowdb/adapters/FileSync";

import Debug from "debug";
import { Assignment, Cache, Course, Student } from "./types";
import TermResource from "./entities/Term";
const debug = Debug("cli:cache");

export default class CacheDb {
  private db: LowdbSync<Cache>;

  constructor(filePath = "db.json") {
    const adapter = new FileSync(filePath);
    this.db = low(adapter);

    this.db
      .defaults({
        canvas: { account_id: 1 },
      })
      .write();
  }

  get(path: any) {
    debug("get %s", path);
    if (!this.db.has(path)) {
      throw `No cached value for '${path}'`;
    }
    return this.db.get(path);
  }

  set(path: any, value: any) {
    debug("set %s", path);
    return this.db.set(path, value);
  }

  getTerm(): TermResource {
    return this.get("term").value();
  }

  getCourse(): Course {
    return this.get("course").value();
  }

  getAssignment(): Assignment {
    return this.get("assignment").value();
  }

  getStudents(): Student[] {
    return this.get("course.students").value();
  }

  getStudent(studentId: number): Student {
    return this.get(`course.students.${studentId}`).value();
  }
}
