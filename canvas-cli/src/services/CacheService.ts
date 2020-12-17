import low, { LowdbSync } from "lowdb";
import FileSync from "lowdb/adapters/FileSync";
import { debugCache } from "../util/debug";
import { Assignment, Submission } from "../entities/Assignment";
import { Term } from "../entities/Term";
import { Course } from "../entities/Course";
import { Student } from "../entities/Student";
import { plainToClass } from "class-transformer";
import { Service } from "typedi";

interface CacheSchema {
  canvas: Canvas;
  term?: Term;
  course?: Course;
  assignment?: Assignment;
}

interface Canvas {
  account_id: number;
}

const FILE_PATH = "db.json";

@Service()
export class CacheService {
  private _cache: LowdbSync<CacheSchema>;

  constructor() {
    const adapter = new FileSync<CacheSchema>(FILE_PATH);
    this._cache = low(adapter);
    this._cache
      .defaults<CacheSchema>({
        canvas: { account_id: 1 },
      })
      .write();
  }

  get(path: any) {
    debugCache("get %s", path);
    if (!this._cache.has(path)) {
      throw `No cached value for '${path}'`;
    }
    const rtn = this._cache.get(path);
    debugCache("got %s", JSON.stringify(rtn));
    return rtn;
  }

  set(path: any, value: any) {
    debugCache("set %s to %s", path, JSON.stringify(value));
    return this._cache.set(path, value);
  }

  push(path: string, value: any) {
    const arr = this.get(path).value();
    arr.push(value);
    return this.set(path, arr).write();
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
