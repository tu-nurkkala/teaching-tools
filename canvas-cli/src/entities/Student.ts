import { Expose } from "class-transformer";
import { FileInfo, Submission } from "./Assignment";

export class Student {
  @Expose() id: number = 0;
  @Expose() name: string = "";
  @Expose() created_at: string = "";
  @Expose({ name: "sortable_name" }) sortableName: string = "";
  @Expose({ name: "short_name" }) shortName: string = "";
  files: FileInfo[] = [];
  submission!: Submission;
}

export interface APIStudent {
  id: number;
  name: string;
  created_at: string;
  sortableName: string;
  shortName: string;
  files: FileInfo[];
  submission: Submission;
}
