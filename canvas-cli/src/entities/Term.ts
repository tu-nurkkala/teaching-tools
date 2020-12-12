import { Expose, plainToClass, Transform } from "class-transformer";
import "reflect-metadata";
import { DateTime } from "luxon";
import ac from "ansi-colors";

function peek(target: any): void {
  console.log("TARGET", target);
}

@peek
export default class TermResource {
  @Expose()
  id: number = 0;
  @Expose()
  name: string = "";
  @Expose()
  @Transform((value) => DateTime.fromISO(value))
  start_at: string = "";
  @Transform((value) => DateTime.fromISO(value))
  @Expose()
  end_at: string = "";
  @Expose()
  workflow_state: string = "";

  toString() {
    return [ac.green(this.name), ac.yellow(`(${this.id})`)].join(" ");
  }
}

const termData = {
  id: 4,
  name: "Spring 2019",
  start_at: "2019-01-29T05:00:00Z",
  end_at: "2019-05-17T03:59:00Z",
  created_at: "2019-01-08T14:08:40Z",
  workflow_state: "active",
  grading_period_group_id: null,
};

const tr = plainToClass(TermResource, termData, {
  excludeExtraneousValues: true,
});
console.log("FROM", termData);
console.log("TO %s", tr);
