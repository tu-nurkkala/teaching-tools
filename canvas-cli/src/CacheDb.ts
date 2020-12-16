import low, { LowdbSync } from "lowdb";
import FileSync from "lowdb/adapters/FileSync";
import { debugCache } from "./debug";

import {Assignment, Cache, Submission} from "./entities/Assignment";
import { Term } from "./entities/Term";
import { Course } from "./entities/Course";
import { Student } from "./entities/Student";

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
    debugCache("get %s", path);
    if (!this.db.has(path)) {
      throw `No cached value for '${path}'`;
    }
    return this.db.get(path);
  }

  set(path: any, value: any) {
    debugCache("set %s", path);
    return this.db.set(path, value);
  }

  getTerm(): Term {
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

  cacheSubmission(submission: Submission) {
    this.set(`course.students.${submission.user.id}.submission`, {
      id: submission.id,
      grade: submission.grade,
      score: submission.score,
      grader_id: submission.grader_id,
      graded_at: submission.graded_at,
      workflow_state: submission.workflow_state,
    }).write();
  }
}
