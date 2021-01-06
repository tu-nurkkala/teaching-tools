import { Expose } from "class-transformer";
import { Student } from "./Student";
import { GroupCategory } from "./Group";
import chalk from "chalk";

export interface Dictionary<T> {
  [key: string]: T;
}

export class AssignmentGroup {
  @Expose() id = 0;
  @Expose() name = "";
}

export class Course {
  @Expose() id = 0;
  @Expose() name = "";
  @Expose() course_code = "";

  @Expose({ name: "assignment_groups" })
  assignmentGroups: Dictionary<AssignmentGroup> = {};

  @Expose()
  students: Dictionary<Student> = {};

  @Expose({ name: "group_categories" })
  groupCategories: Dictionary<GroupCategory> = {};

  toString(): string {
    return [chalk.green(this.name), chalk.yellow(`(${this.id})`)].join(" ");
  }
}

export interface APICourse {
  id: number;
  name: string;
  course_code: string;
  term: {
    id: number;
    name: string;
  };
}

export interface APIAssignmentGroup {
  id: number;
  name: string;
}
