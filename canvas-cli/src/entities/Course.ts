// export interface Course extends AbstractResource {
//   course_code: string;
//   assignment_groups: Dictionary<AssignmentGroup>;
//   students: Dictionary<Student>;
//   group_categories: Dictionary<GroupCategory>;
// }

import { Expose, Type } from "class-transformer";
import { Student } from "./Student";
import { GroupCategory } from "./Group";

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

  @Expose()
  assignment_groups: Dictionary<AssignmentGroup> = {};

  @Expose()
  students: Dictionary<Student> = {};

  @Expose()
  group_categories: Dictionary<GroupCategory> = {};
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
