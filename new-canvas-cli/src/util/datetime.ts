import { DateTime } from "luxon";

export function isoDateTimeToDate(dt: string): string {
  return DateTime.fromISO(dt).toISODate();
}
