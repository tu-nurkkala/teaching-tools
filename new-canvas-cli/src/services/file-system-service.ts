import untildify from "untildify";
import { join } from "path";
import { mkdirSync } from "fs";
import { Student } from "../entities/Student";
import { CacheService } from "./cache.service";
import { Service } from "typedi";

@Service()
export class FileSystemService {
  constructor(private cache: CacheService) {}

  sanitizePathSegment(str: string): string {
    return str
      .replace(/[^-_.a-z0-9\s]/gi, "")
      .replace(/[\s_-]+/g, "-")
      .toLowerCase();
  }

  submissionBaseDir(): string {
    return untildify("~/Scratch");
  }

  submissionCourseDir(): string {
    return join(
      this.submissionBaseDir(),
      this.sanitizePathSegment(this.cache.get("course.course_code").value())
    );
  }

  submissionAssignmentDir(): string {
    return join(
      this.submissionCourseDir(),
      this.sanitizePathSegment(this.cache.get("assignment.name").value())
    );
  }

  submissionStudentDir(student: Student): string {
    return join(
      this.submissionAssignmentDir(),
      this.sanitizePathSegment(student.sortableName)
    );
  }

  submissionDir(student: Student): string {
    // This looks dumb, but would allow future expansion.
    const finalDir = this.submissionStudentDir(student);
    mkdirSync(finalDir, { recursive: true });
    return finalDir;
  }

  submissionPath(student: Student, fileName: string): string {
    return join(this.submissionDir(student), fileName);
  }
}
