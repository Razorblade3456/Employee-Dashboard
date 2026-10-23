import type ExcelJS from "exceljs";
import { Temporal } from "@js-temporal/polyfill";
import { Data, Role } from "./types";
import { calculatePayroll } from "./payroll";
import { addDays, hours, today } from "./time";
export interface ExportOptions {
  from: string;
  to: string;
  employeeIds?: string[];
}
type Value = string | number | boolean;
function addSheet(
  book: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: Value[][],
  formats: Record<number, string> = {},
) {
  const sheet = book.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  sheet.getRow(1).height = 28;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF7773D5" },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rows.length + 1), column: headers.length },
  };
  sheet.columns.forEach((column, index) => {
    column.width = Math.min(
      50,
      Math.max(
        16,
        headers[index].length + 2,
        ...rows
          .slice(0, 200)
          .map((r) =>
            typeof r[index] === "number"
              ? 14
              : String(r[index] ?? "").length + 2,
          ),
      ),
    );
    if (formats[index]) column.numFmt = formats[index];
  });
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    row.height = 23;
    row.eachCell((cell) => {
      cell.font = { name: "Calibri", size: 11, color: { argb: "FF30344C" } };
      cell.alignment = { vertical: "middle", wrapText: true };
      if (i % 2 === 0)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF3F3FB" },
        };
    });
  }
  sheet.pageSetup.printTitlesRow = "1:1";
  return sheet;
}
export async function buildExcelReport(
  data: Data,
  role: Role,
  options: ExportOptions,
) {
  if (role === "employee")
    throw Error("Excel exports are available to managers and accountants.");
  const { from, to } = options;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
    from > to
  )
    throw Error("Choose a valid report date range.");
  Temporal.PlainDate.from(from);
  Temporal.PlainDate.from(to);
  const Excel = await import("exceljs");
  const book = new (Excel.default?.Workbook || Excel.Workbook)();
  book.creator = "Gather";
  book.created = new Date();
  book.title = data.settings.name + " · " + role + " report";
  book.subject =
    role === "manager"
      ? "Team and schedule snapshot"
      : "Estimated gross payroll snapshot";
  const people = data.employees.filter(
      (p) => !options.employeeIds || options.employeeIds.includes(p.id),
    ),
    ids = new Set(people.map((p) => p.id)),
    person = (id: string) => people.find((p) => p.id === id);
  const info: Value[][] = [
    ["Workspace", data.settings.name],
    [
      "Report",
      role === "manager" ? "Management workbook" : "Payroll estimates workbook",
    ],
    ["From", from],
    ["Through", to],
    ["Timezone", data.settings.timezone],
    ["Exported at", new Date().toISOString()],
    ["Currency", "USD"],
    [
      "Basis",
      role === "manager"
        ? "Scheduled hours and actual hours are separate."
        : "Only approved actual entries are paid. Gross estimates exclude taxes and deductions.",
    ],
    [
      "Workbook type",
      "Saved snapshot; changes in Gather do not change this file.",
    ],
  ];
  if (role === "accountant") {
    const rows = calculatePayroll(
      data.time_entries.filter((e) => ids.has(e.employee_id)),
      data.pay_rates,
      data.rules,
      data.settings.timezone,
      from,
      to,
    );
    const gross = rows.reduce((sum, r) => sum + r.gross, 0);
    info.push(
      ["Estimated gross USD", gross],
      ["Unapproved hours", rows.reduce((sum, r) => sum + r.pending, 0)],
      [
        "Missing rates",
        rows.some((r) => r.missingRate) ? "Yes · totals are incomplete" : "No",
      ],
    );
    addSheet(book, "Report", ["Information", "Value"], info);
    addSheet(
      book,
      "Payroll estimates",
      [
        "Employee",
        "Department",
        "Regular hours",
        "Overtime hours",
        "Double-time hours",
        "Regular pay USD",
        "Premium pay USD",
        "Estimated gross USD",
        "Unapproved hours",
        "Missing rate",
      ],
      people.map((p) => {
        const r = rows.find((r) => r.employee_id === p.id);
        return [
          p.name,
          p.department,
          r?.regular || 0,
          r?.overtime || 0,
          r?.double || 0,
          r?.regularPay || 0,
          r?.overtimePay || 0,
          r?.gross || 0,
          r?.pending || 0,
          r?.missingRate ? "Yes" : "No",
        ];
      }),
      {
        2: "0.00",
        3: "0.00",
        4: "0.00",
        5: '"$"#,##0.00',
        6: '"$"#,##0.00',
        7: '"$"#,##0.00',
        8: "0.00",
      },
    );
    addSheet(
      book,
      "Pay rate history",
      ["Employee", "Department", "Effective date", "Hourly rate USD"],
      data.pay_rates
        .filter((r) => ids.has(r.employee_id) && r.effective_date <= to)
        .sort((a, b) => a.effective_date.localeCompare(b.effective_date))
        .map((r) => [
          person(r.employee_id)!.name,
          person(r.employee_id)!.department,
          r.effective_date,
          r.hourly_rate,
        ]),
      { 3: '"$"#,##0.00' },
    );
    addSheet(
      book,
      "Payroll policy",
      ["Policy", "Value"],
      [
        ["Location", data.rules.location],
        ["Weekly regular hours", data.rules.weekly_threshold],
        ["Daily overtime after (0 = off)", data.rules.daily_threshold],
        ["Daily double time after (0 = off)", data.rules.double_threshold],
        ["Overtime multiplier", data.rules.overtime_multiplier],
        ["Double-time multiplier", data.rules.double_multiplier],
        [
          "Week starts",
          [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ][data.rules.week_starts],
        ],
        [
          "Allocation",
          "Daily premiums first; weekly overtime on remaining regular-eligible hours. Breaks/adjustments are proportional across midnight.",
        ],
        [
          "Historical context",
          "Earlier time entries in the same workweek contribute to overtime thresholds, even outside the selected range.",
        ],
      ],
    );
  } else {
    addSheet(book, "Report", ["Information", "Value"], info);
    addSheet(
      book,
      "Team",
      ["Employee", "Email", "Department", "Job title", "Status"],
      people.map((p) => [
        p.name,
        p.email,
        p.department,
        p.title,
        p.active ? "Active" : "Inactive",
      ]),
    );
    addSheet(
      book,
      "Schedule",
      [
        "Employee",
        "Department",
        "Date",
        "Start time",
        "End time",
        "Unpaid break (min)",
        "Scheduled hours",
        "Status",
        "Timezone",
      ],
      data.shifts
        .filter((s) => ids.has(s.employee_id) && s.date >= from && s.date <= to)
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
        .map((s) => [
          person(s.employee_id)!.name,
          person(s.employee_id)!.department,
          s.date,
          s.start.slice(0, 5),
          s.end.slice(0, 5) + (s.end <= s.start ? " (+1 day)" : ""),
          s.break_minutes,
          hours(
            s.date,
            s.start,
            s.end,
            s.break_minutes,
            data.settings.timezone,
          ),
          data.schedule_days.find((day) => day.date === s.date)?.status ||
            s.status,
          data.settings.timezone,
        ]),
      { 6: "0.00" },
    );
    addSheet(
      book,
      "Publication dates",
      ["Date", "Status"],
      data.schedule_days
        .filter((day) => day.date >= from && day.date <= to)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((day) => [day.date, day.status]),
    );
    addSheet(
      book,
      "Management notes",
      ["Employee", "Type", "Note", "Timestamp", "Timezone"],
      data.notes
        .filter((note) => {
          const day = Temporal.Instant.from(note.created_at)
            .toZonedDateTimeISO(data.settings.timezone)
            .toPlainDate()
            .toString();
          return ids.has(note.employee_id) && day >= from && day <= to;
        })
        .map((note) => [
          person(note.employee_id)!.name,
          note.kind,
          note.body,
          note.created_at,
          data.settings.timezone,
        ]),
    );
  }
  addSheet(
    book,
    "Actual time entries",
    [
      "Employee",
      "Department",
      "Work date",
      "Clock in",
      "Clock out",
      "Unpaid break (min)",
      "Adjustment (min)",
      "Adjustment reason",
      "Actual paid hours",
      "Approval",
      "Timezone",
    ],
    data.time_entries
      .filter(
        (e) =>
          ids.has(e.employee_id) &&
          e.date >= addDays(from, -1) &&
          e.date <= to &&
          (e.date >= from || e.end <= e.start),
      )
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
      .map((e) => [
        person(e.employee_id)!.name,
        person(e.employee_id)!.department,
        e.date,
        e.start.slice(0, 5),
        e.end.slice(0, 5) + (e.end <= e.start ? " (+1 day)" : ""),
        e.break_minutes,
        e.adjustment_minutes,
        e.adjustment_reason,
        hours(e.date, e.start, e.end, e.break_minutes, data.settings.timezone) +
          e.adjustment_minutes / 60,
        e.approved ? "Approved" : "Pending",
        data.settings.timezone,
      ]),
    { 8: "0.00" },
  );
  return book;
}
export async function downloadExcel(
  data: Data,
  role: Role,
  options: ExportOptions,
) {
  const book = await buildExcelReport(data, role, options),
    bytes = await book.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(bytes)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download =
    "gather-" + role + "-" + options.from + "-to-" + options.to + ".xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
