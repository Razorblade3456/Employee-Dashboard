import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePayroll, csvCell } from "../src/lib/payroll";
import { hours, weekStart, validDuration } from "../src/lib/time";
import { TimeEntry, Rules, PayRate } from "../src/lib/types";
import { validateRecord } from "../src/lib/validation";
const id = "10000000-0000-4000-8000-000000000001",
  zone = "America/Los_Angeles";
const policy: Rules = {
  id: "company",
  location: "Test",
  weekly_threshold: 40,
  daily_threshold: 0,
  double_threshold: 0,
  overtime_multiplier: 1.5,
  double_multiplier: 2,
  week_starts: 1,
};
const rates: PayRate[] = [
  { id, employee_id: id, hourly_rate: 20, effective_date: "2020-01-01" },
];
function entry(
  date: string,
  start = "08:00",
  end = "16:00",
  overrides: Partial<TimeEntry> = {},
): TimeEntry {
  return {
    id: crypto.randomUUID(),
    employee_id: id,
    date,
    start,
    end,
    break_minutes: 0,
    adjustment_minutes: 0,
    adjustment_reason: "",
    approved: true,
    ...overrides,
  };
}
const calculate = (
  entries: TimeEntry[],
  rules = policy,
  from = "2026-10-19",
  to = "2026-10-25",
  payRates = rates,
) => calculatePayroll(entries, payRates, rules, zone, from, to)[0];
test("weekly overtime uses approved actual entries, not scheduled hours", () => {
  const es = [19, 20, 21, 22, 23, 24].map((day) => entry("2026-10-" + day));
  const r = calculate(es);
  assert.equal(r.regular, 40);
  assert.equal(r.overtime, 8);
  assert.equal(r.gross, 1040);
});
test("unapproved entries are shown but never paid", () => {
  const r = calculate([
    entry("2026-10-19"),
    entry("2026-10-20", "08:00", "18:00", { approved: false }),
  ]);
  assert.equal(r.regular, 8);
  assert.equal(r.pending, 10);
  assert.equal(r.gross, 160);
});
test("daily overtime and double time are not counted twice with weekly overtime", () => {
  const rules = { ...policy, daily_threshold: 8, double_threshold: 12 };
  const r = calculate(
    [19, 20, 21, 22, 23].map((day) =>
      entry("2026-10-" + day, "06:00", "20:00"),
    ),
    rules,
  );
  assert.equal(r.regular, 40);
  assert.equal(r.overtime, 20);
  assert.equal(r.double, 10);
  assert.equal(r.regular + r.overtime + r.double, 70);
  assert.equal(r.gross, 1800);
});
test("weekly threshold survives a report starting midweek", () => {
  const r = calculate(
    [19, 20, 21, 22, 23, 24].map((day) => entry("2026-10-" + day)),
    policy,
    "2026-10-23",
  );
  assert.equal(r.regular, 8);
  assert.equal(r.overtime, 8);
});
test("unpaid breaks and approved adjustments affect paid time", () => {
  const r = calculate([
    entry("2026-10-19", "08:00", "17:00", {
      break_minutes: 60,
      adjustment_minutes: 30,
      adjustment_reason: "Approved meeting",
    }),
  ]);
  assert.equal(r.regular, 8.5);
});
test("rates are effective-dated", () => {
  const r = calculate(
    [entry("2026-10-19"), entry("2026-10-20")],
    policy,
    undefined,
    undefined,
    [
      ...rates,
      {
        ...rates[0],
        id: crypto.randomUUID(),
        hourly_rate: 30,
        effective_date: "2026-10-20",
      },
    ],
  );
  assert.equal(r.gross, 400);
});
test("missing rate is flagged instead of fabricated", () => {
  const r = calculate([entry("2026-10-19")], policy, undefined, undefined, []);
  assert.equal(r.missingRate, true);
  assert.equal(r.gross, 0);
});
test("overnight shifts split across workweek boundaries", () => {
  const r = calculate(
    [entry("2026-10-25", "20:00", "04:00")],
    policy,
    "2026-10-19",
    "2026-10-25",
  );
  assert.equal(r.regular, 4);
});
test("spring-forward and fall-back count elapsed hours", () => {
  assert.equal(hours("2026-03-08", "00:00", "04:00", 0, zone), 3);
  assert.equal(hours("2026-11-01", "00:00", "04:00", 0, zone), 5);
});
test("ambiguous and nonexistent wall times are rejected", () => {
  assert.equal(validDuration("2026-03-08", "02:30", "04:00", 0, zone), false);
  assert.equal(validDuration("2026-11-01", "01:30", "04:00", 0, zone), false);
});
test("custom workweek starts work across year boundaries", () => {
  assert.equal(weekStart("2027-01-01", 1), "2026-12-28");
  assert.equal(weekStart("2027-01-01", 0), "2026-12-27");
});
test("CSV quotes names and neutralizes spreadsheet formulas", () => {
  assert.equal(csvCell('=HYPERLINK("evil")'), '"\'=HYPERLINK(""evil"")"');
  assert.equal(csvCell("a,b"), '"a,b"');
});
test("validation rejects invalid and nonfinite monetary input", () => {
  assert.throws(() =>
    validateRecord("employees", { id, name: "A", email: "invalid" }, zone),
  );
  assert.throws(() =>
    validateRecord(
      "shifts",
      { ...entry("2026-10-19"), break_minutes: Infinity, status: "draft" },
      zone,
    ),
  );
});
