// export interface Course extends AbstractResource {
//   course_code: string;
//   assignment_groups: Dictionary<AssignmentGroup>;
//   students: Dictionary<Student>;
//   group_categories: Dictionary<GroupCategory>;
// }

import { Expose } from "class-transformer";
import { Dictionary } from "../types";

export class AssignmentGroup {
  @Expose() id: number = 0;
  @Expose() name: string = "";
}

export class Course {
  @Expose() id: number = 0;
  @Expose() name: string = "";
  @Expose() course_code: string = "";

  assignment_groups: Dictionary<AssignmentGroup> = {};

  //   students: Dictionary<Student>;
  //   group_categories: Dictionary<GroupCategory>;
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
