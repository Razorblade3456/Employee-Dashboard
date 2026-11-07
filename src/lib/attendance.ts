import { Data } from "./types";
/** Absence is a review item, never fabricated worked hours. */
export function attendanceGaps(
  data: Data,
  from: string,
  to: string,
  employeeId = "all",
) {
  const entered = new Set(
    data.time_entries.map((e) => e.employee_id + ":" + e.date),
  );
  const published = new Set(
    data.schedule_days
      .filter((d) => d.status === "published")
      .map((d) => d.date),
  );
  return data.shifts.filter(
    (s) =>
      s.date >= from &&
      s.date <= to &&
      (employeeId === "all" || s.employee_id === employeeId) &&
      s.status === "published" &&
      published.has(s.date) &&
      !entered.has(s.employee_id + ":" + s.date),
  );
}
