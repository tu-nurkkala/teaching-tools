// export interface Student extends AbstractResource {
//     created_at: string;
//     sortable_name: string;
//     short_name: string;
//     submission: {
//         id: number;
//         grade: string;
//         score: number;
//         grader_id: number;
//         graded_at: number;
//         workflow_state: string;
//     };
//     files: FileInfo[];
// }

import { Expose } from "class-transformer";

export class Student {
  @Expose() id: number = 0;
  @Expose() name: string = "";
  @Expose() created_at: string = "";
  @Expose() sortable_name: string = "";
  @Expose() short_name: string = "";
}

export interface APIStudent {
  id: number;
  name: string;
  created_at: string;
  sortable_name: string;
  short_name: string;
}
