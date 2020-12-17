import untildify from "untildify";
import { join } from "path";
import { mkdirSync } from "fs";
import { Student } from "../entities/Student";
import { ApiService } from "./ApiService";
import { CacheService } from "./CacheService";
import { Service } from "typedi";

@Service()
export class FileSystemService {
  constructor(private cache: CacheService) {}

  sanitizePathSegment(str: string) {
    return str
      .replace(/[^-_.a-z0-9\s]/gi, "")
      .replace(/[\s_-]+/g, "-")
      .toLowerCase();
  }

  submissionBaseDir() {
    return untildify("~/Scratch");
  }

  submissionCourseDir() {
    return join(
      this.submissionBaseDir(),
      this.sanitizePathSegment(this.cache.get("course.course_code").value())
    );
  }

  submissionAssignmentDir() {
    return join(
      this.submissionCourseDir(),
      this.sanitizePathSegment(this.cache.get("assignment.name").value())
    );
  }

  submissionStudentDir(student: Student) {
    return join(
      this.submissionAssignmentDir(),
      this.sanitizePathSegment(student.sortable_name)
    );
  }

  submissionDir(student: Student) {
    // This looks dumb, but would allow future expansion.
    const finalDir = this.submissionStudentDir(student);
    mkdirSync(finalDir, { recursive: true });
    return finalDir;
  }

  submissionPath(student: Student, fileName: string) {
    return join(this.submissionDir(student), fileName);
  }
}
