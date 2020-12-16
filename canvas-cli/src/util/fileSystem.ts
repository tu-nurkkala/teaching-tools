import untildify from "untildify";
import { join } from "path";
import { mkdirSync } from "fs";
import { Student } from "../entities/Student";

import CacheDb from "../CacheDb";
const cache = new CacheDb();

function sanitizePathSegment(str: string) {
  return str
    .replace(/[^-_.a-z0-9\s]/gi, "")
    .replace(/[\s_-]+/g, "-")
    .toLowerCase();
}

export function submissionBaseDir() {
  return untildify("~/Scratch");
}

export function submissionCourseDir() {
  return join(
    submissionBaseDir(),
    sanitizePathSegment(cache.get("course.course_code").value())
  );
}

export function submissionAssignmentDir() {
  return join(
    submissionCourseDir(),
    sanitizePathSegment(cache.get("assignment.name").value())
  );
}

export function submissionStudentDir(student: Student) {
  return join(submissionAssignmentDir(), sanitizePathSegment(student.sortable_name));
}

export function submissionDir(student: Student) {
  // This looks dumb, but would allow future expansion.
  const finalDir = submissionStudentDir(student);
  mkdirSync(finalDir, { recursive: true });
  return finalDir;
}

export function submissionPath(student: Student, fileName: string) {
  return join(submissionDir(student), fileName);
}
