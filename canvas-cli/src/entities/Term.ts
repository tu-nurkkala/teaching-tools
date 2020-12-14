import { Expose, Transform } from "class-transformer";
import { DateTime } from "luxon";
import ac from "ansi-colors";

const asDateTime = (value: string) => DateTime.fromISO(value);
const epoch = DateTime.fromSeconds(0);

export default class Term {
  @Expose()
  id: number = 0;

  @Expose()
  name: string = "";

  @Expose()
  @Transform((value) => asDateTime(value))
  start_at: DateTime = epoch;

  @Expose()
  @Transform((value) => asDateTime(value))
  end_at: DateTime = epoch;

  @Expose()
  workflow_state: string = "";

  toString() {
    return [
      ac.green(this.name),
      ac.blue(this.start_at.toISODate()),
      ac.yellow(`(${this.id})`),
    ].join(" ");
  }
}
