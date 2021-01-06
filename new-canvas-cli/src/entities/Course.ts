import { Expose, Type } from "class-transformer";
import { Student } from "./Student";
import { GroupCategory } from "./Group";
import chalk from "chalk";

export interface Dictionary<T> {
  [key: string]: T;
}

export class AssignmentGroup {
  @Expose() id: number = 0;
  @Expose() name: string = "";
}

export class Course {
  @Expose() id: number = 0;
  @Expose() name: string = "";
  @Expose() course_code: string = "";

  @Expose({ name: "assignment_groups" })
  assignmentGroups: Dictionary<AssignmentGroup> = {};

  @Expose()
  students: Dictionary<Student> = {};

  @Expose({ name: "group_categories" })
  groupCategories: Dictionary<GroupCategory> = {};

  toString() {
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
