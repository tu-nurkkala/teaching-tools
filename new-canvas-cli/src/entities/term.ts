import { Expose, Transform } from "class-transformer";
import { DateTime } from "luxon";
import chalk from "chalk";

const asDateTime = (value: string) => DateTime.fromISO(value);
const epoch = DateTime.fromSeconds(0);

export class Term {
  @Expose() id = 0;
  @Expose() name = "";
  @Expose() workflow_state = "";

  @Expose()
  @Transform((value) => asDateTime(value))
  start_at: DateTime = epoch;

  @Expose()
  @Transform((value) => asDateTime(value))
  end_at: DateTime = epoch;

  toString(): string {
    return [
      chalk.green(this.name),
      chalk.blue(this.start_at.toISODate()),
      chalk.yellow(`(${this.id})`),
    ].join(" ");
  }
}
