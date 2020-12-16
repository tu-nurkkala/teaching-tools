import { DateTime } from "luxon";

export function isoDateTimeToDate(dt: string) {
  return DateTime.fromISO(dt).toISODate();
}
