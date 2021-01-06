import { Expose } from "class-transformer";
import { FileInfo, Submission } from "./Assignment";

export class Student {
  @Expose() id = 0;
  @Expose() name = "";
  @Expose() created_at = "";
  @Expose({ name: "sortable_name" }) sortableName = "";
  @Expose({ name: "short_name" }) shortName = "";
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
