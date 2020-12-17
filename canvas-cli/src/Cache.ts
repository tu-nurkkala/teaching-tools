import low, { LowdbSync } from "lowdb";
import FileSync from "lowdb/adapters/FileSync";
import { debugCache } from "./util/debug";

import { Assignment, Submission } from "./entities/Assignment";
import { Term } from "./entities/Term";
import { Course } from "./entities/Course";
import { Student } from "./entities/Student";
import { PropertyPath } from "lodash";
import { plainToClass } from "class-transformer";

interface Schema {
  canvas: Canvas;
  term: Term;
  course: Course;
  assignment: Assignment;
}

interface Canvas {
  account_id: number;
}

export default class Cache {
  // This is a singleton class.
  private static instance: Cache;
  private _cache: LowdbSync<Schema>;

  private constructor(filePath = "db.json") {
    const adapter = new FileSync<Schema>(filePath);
    this._cache = low(adapter);

    this._cache
      .defaults({
        canvas: { account_id: 1 },
      })
      .write();
  }

  static getInstance() {
    if (!Cache.instance) {
      Cache.instance = new Cache();
    }
    return Cache.instance;
  }

  get(path: any) {
    debugCache("get %s", path);
    if (!this._cache.has(path)) {
      throw `No cached value for '${path}'`;
    }
    return this._cache.get(path);
  }

  set(path: any, value: any) {
    debugCache("set %s", path);
    return this._cache.set(path, value);
  }

  push(path: string, value: any) {
    const arr = this._cache.get(path).value();
    arr.push(value);
    return this._cache.set(path, arr).write();
  }

  getTerm(): Term {
    return plainToClass(Term, this.get("term").value());
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
