import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { buildExcelReport } from "../src/lib/excel-export";
import { demoData } from "../src/lib/demo";
import { calculatePayroll } from "../src/lib/payroll";
function fixture() {
  const d = demoData(),
    p = d.employees[0];
  d.shifts = [
    {
      id: crypto.randomUUID(),
      employee_id: p.id,
      date: "2026-10-19",
      start: "09:00",
      end: "17:30",
      break_minutes: 30,
      status: "published",
    },
  ];
  d.time_entries = [
    {
      id: crypto.randomUUID(),
      employee_id: p.id,
      date: "2026-10-19",
      start: "08:00",
      end: "16:30",
      break_minutes: 30,
      adjustment_minutes: 0,
      adjustment_reason: "",
      approved: true,
    },
  ];
  d.notes = [
    {
      id: crypto.randomUUID(),
      employee_id: p.id,
      kind: "General",
      body: "PRIVATE_MANAGER_NOTE",
      created_at: "2026-10-19T16:00:00Z",
    },
  ];
  d.employees[0].name = '=HYPERLINK("not-a-formula")';
  return d;
}
test("manager Excel report has schedules and notes but never includes payroll data", async () => {
  const d = fixture(),
    book = await buildExcelReport(d, "manager", {
      from: "2026-10-19",
      to: "2026-10-25",
    });
  assert.ok(book.getWorksheet("Schedule"));
  assert.ok(book.getWorksheet("Management notes"));
  assert.equal(book.getWorksheet("Payroll estimates"), undefined);
  assert.equal(book.getWorksheet("Pay rate history"), undefined);
  assert.equal(book.getWorksheet("Schedule")!.getCell("G2").value, 8);
  const bytes = await book.xlsx.writeBuffer(),
    reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(bytes);
  assert.equal(
    reloaded.getWorksheet("Team")!.getCell("A2").type,
    ExcelJS.ValueType.String,
  );
  assert.equal(
    reloaded.getWorksheet("Team")!.getCell("A2").value,
    d.employees[0].name,
  );
  assert.equal(reloaded.getWorksheet("Schedule")!.getCell("G2").numFmt, "0.00");
});
test("accountant workbook matches calculated payroll and excludes management notes", async () => {
  const d = fixture(),
    book = await buildExcelReport(d, "accountant", {
      from: "2026-10-19",
      to: "2026-10-25",
      employeeIds: [d.employees[0].id],
    });
  assert.equal(book.getWorksheet("Management notes"), undefined);
  assert.equal(book.getWorksheet("Team"), undefined);
  assert.equal(book.getWorksheet("Schedule"), undefined);
  const expected = calculatePayroll(
    d.time_entries,
    d.pay_rates,
    d.rules,
    d.settings.timezone,
    "2026-10-19",
    "2026-10-25",
  )[0];
  assert.equal(
    book.getWorksheet("Payroll estimates")!.getCell("H2").value,
    expected.gross,
  );
  assert.equal(book.getWorksheet("Payroll estimates")!.rowCount, 2);
  assert.ok(book.getWorksheet("Pay rate history"));
  assert.ok(book.getWorksheet("Payroll policy"));
  const bytes = await book.xlsx.writeBuffer();
  assert.equal(new Uint8Array(bytes)[0], 0x50);
  assert.equal(new Uint8Array(bytes)[1], 0x4b);
});
test("exports reject employee access and invalid ranges", async () => {
  const d = fixture();
  await assert.rejects(() =>
    buildExcelReport(d, "employee", { from: "2026-10-19", to: "2026-10-25" }),
  );
  await assert.rejects(() =>
    buildExcelReport(d, "manager", { from: "2026-10-25", to: "2026-10-19" }),
  );
});
