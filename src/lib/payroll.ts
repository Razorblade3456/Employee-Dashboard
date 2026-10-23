import { Temporal } from "@js-temporal/polyfill";
import { TimeEntry, PayRate, Rules } from "./types";
import { bounds, weekStart } from "./time";
export interface PayrollRow {
  employee_id: string;
  regular: number;
  overtime: number;
  double: number;
  regularPay: number;
  overtimePay: number;
  gross: number;
  pending: number;
  missingRate: boolean;
}
export function calculatePayroll(
  entries: TimeEntry[],
  rates: PayRate[],
  rules: Rules,
  zone: string,
  from: string,
  to: string,
): PayrollRow[] {
  const rows = new Map<string, PayrollRow>(),
    daily = new Map<string, number>(),
    weekly = new Map<string, number>();
  const segments: {
    employee_id: string;
    date: string;
    hours: number;
    approved: boolean;
    start: number;
  }[] = [];
  for (const e of entries) {
    const b = bounds(e.date, e.start, e.end, zone),
      elapsed = (b.end - b.start) / 3600000,
      paid = Math.max(
        0,
        elapsed - e.break_minutes / 60 + e.adjustment_minutes / 60,
      );
    let cursor = Temporal.Instant.fromEpochMilliseconds(
      b.start,
    ).toZonedDateTimeISO(zone);
    while (Number(cursor.epochMilliseconds) < b.end) {
      const next = cursor
          .toPlainDate()
          .add({ days: 1 })
          .toZonedDateTime({ timeZone: zone, plainTime: "00:00" }),
        stop = Math.min(Number(next.epochMilliseconds), b.end);
      segments.push({
        employee_id: e.employee_id,
        date: cursor.toPlainDate().toString(),
        hours:
          (paid * (stop - Number(cursor.epochMilliseconds))) /
          (b.end - b.start),
        approved: e.approved,
        start: Number(cursor.epochMilliseconds),
      });
      cursor =
        Temporal.Instant.fromEpochMilliseconds(stop).toZonedDateTimeISO(zone);
    }
  }
  for (const s of segments.sort((a, b) => a.start - b.start)) {
    if (s.date > to) continue;
    const included = s.date >= from;
    let row = rows.get(s.employee_id);
    if (!row) {
      row = {
        employee_id: s.employee_id,
        regular: 0,
        overtime: 0,
        double: 0,
        regularPay: 0,
        overtimePay: 0,
        gross: 0,
        pending: 0,
        missingRate: false,
      };
      rows.set(s.employee_id, row);
    }
    if (!s.approved) {
      if (included) row.pending += s.hours;
      continue;
    }
    const dk = s.employee_id + ":" + s.date,
      wk = s.employee_id + ":" + weekStart(s.date, rules.week_starts),
      used = daily.get(dk) || 0,
      weekUsed = weekly.get(wk) || 0;
    const double =
      rules.double_threshold > 0
        ? Math.max(0, used + s.hours - rules.double_threshold) -
          Math.max(0, used - rules.double_threshold)
        : 0;
    const dailyPremium =
      rules.daily_threshold > 0
        ? Math.max(0, used + s.hours - rules.daily_threshold) -
          Math.max(0, used - rules.daily_threshold)
        : double;
    const dailyOT = Math.max(0, dailyPremium - double),
      candidate = Math.max(0, s.hours - double - dailyOT),
      regular = Math.min(
        candidate,
        Math.max(0, rules.weekly_threshold - weekUsed),
      ),
      overtime = dailyOT + candidate - regular;
    daily.set(dk, used + s.hours);
    weekly.set(wk, weekUsed + candidate);
    if (!included) continue;
    const rate = rates
      .filter(
        (r) => r.employee_id === s.employee_id && r.effective_date <= s.date,
      )
      .sort((a, b) =>
        b.effective_date.localeCompare(a.effective_date),
      )[0]?.hourly_rate;
    row.missingRate ||= rate === undefined;
    row.regular += regular;
    row.overtime += overtime;
    row.double += double;
    row.regularPay += regular * (rate || 0);
    row.overtimePay +=
      (overtime * rules.overtime_multiplier +
        double * rules.double_multiplier) *
      (rate || 0);
    row.gross = row.regularPay + row.overtimePay;
  }
  return [...rows.values()].filter(
    (r) => r.regular + r.overtime + r.double + r.pending > 0,
  );
}
export function csvCell(value: unknown) {
  const s = String(value ?? ""),
    safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function exportCsv(name: string, rows: unknown[][]) {
  const blob = new Blob(
      ["\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" },
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
