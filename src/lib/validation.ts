import { z } from "zod";
import { hours, validDuration } from "./time";
const id = z.string().uuid(),
  date = z.iso.date(),
  time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
  number = z.coerce.number().finite();
export const employeeSchema = z.object({
  id,
  name: z.string().trim().min(2).max(100),
  email: z.email(),
  department: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(80),
  active: z.boolean(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  user_id: id.nullable().optional(),
});
export const shiftSchema = z.object({
  id,
  employee_id: id,
  date,
  start: time,
  end: time,
  break_minutes: number.int().min(0).max(600),
  status: z.enum(["draft", "published", "pending"]),
});
export const entrySchema = z
  .object({
    id,
    employee_id: id,
    date,
    start: time,
    end: time,
    break_minutes: number.int().min(0).max(600),
    adjustment_minutes: number.int().min(-480).max(480),
    adjustment_reason: z.string().max(500),
    approved: z.boolean(),
  })
  .refine(
    (v) => !v.adjustment_minutes || v.adjustment_reason.trim().length > 2,
    "Provide a reason for the adjustment.",
  );
export function validateRecord(table: string, record: unknown, zone: string) {
  if (table === "employees") return employeeSchema.parse(record);
  if (table === "shifts" || table === "time_entries") {
    const value = (table === "shifts" ? shiftSchema : entrySchema).parse(
      record,
    );
    if (
      !validDuration(
        value.date,
        value.start,
        value.end,
        value.break_minutes,
        zone,
      )
    )
      throw Error(
        "Invalid shift length, break, or ambiguous/nonexistent daylight-saving time. Use an unambiguous time.",
      );
    if (
      table === "time_entries" &&
      hours(value.date, value.start, value.end, value.break_minutes, zone) +
        (value as { adjustment_minutes: number }).adjustment_minutes / 60 <
        0
    )
      throw Error("Adjustment cannot exceed actual hours.");
    return value;
  }
  if (table === "notes")
    return z
      .object({
        id,
        employee_id: id,
        kind: z.enum([
          "Call-off",
          "Late arrival",
          "Schedule change",
          "General",
        ]),
        body: z.string().trim().min(3).max(3000),
        created_at: z.iso.datetime(),
      })
      .parse(record);
  if (table === "pay_rates")
    return z
      .object({
        id,
        employee_id: id,
        hourly_rate: number.positive().max(10000),
        effective_date: date,
      })
      .parse(record);
  return record;
}
