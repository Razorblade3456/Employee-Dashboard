import { Data, Role, Table, uid } from "./types";
import { validateRecord, validateSettings } from "./validation";
import { addDays, bounds } from "./time";

export type Mutation =
  | { kind: "save"; table: Table; record: Data[Table][number] }
  | { kind: "remove"; id: string; revision?: number }
  | {
      kind: "publish";
      from: string;
      to: string;
      status: Data["schedule_days"][number]["status"];
    }
  | { kind: "duplicate"; from: string; target: string }
  | {
      kind: "settings";
      table: "company_settings" | "payroll_rules";
      value: Data["settings"] | Data["rules"];
    };
export const STALE_EDIT =
  "Someone changed this record while you were editing. Your changes were not saved. Close this form, review the latest record, and try again.";
export function canSave(role: Role, table: Table) {
  return role === "manager"
    ? ["employees", "shifts", "notes", "time_entries"].includes(table)
    : role === "accountant"
      ? ["time_entries", "pay_rates"].includes(table)
      : false;
}
function revision(old: { revision?: number }, expected?: number) {
  if ((old.revision ?? 0) !== (expected ?? 0)) throw Error(STALE_EDIT);
}
function draftDays(data: Data, dates: string[]) {
  const unique = new Set(dates);
  return [
    ...data.schedule_days.filter((d) => !unique.has(d.date)),
    ...Array.from(unique, (date) => ({
      id: data.schedule_days.find((d) => d.date === date)?.id ?? uid(),
      date,
      status: "draft" as const,
    })),
  ];
}
export function applyMutation(
  data: Data,
  role: Role,
  command: Mutation,
  now = new Date().toISOString(),
): Data {
  let next: Data;
  let entity: string = command.kind;
  if (command.kind === "save") {
    const { table, record } = command;
    entity = table;
    if (!canSave(role, table))
      throw Error("This role cannot make that change.");
    const value = validateRecord(
      table,
      record,
      data.settings.timezone,
    ) as Data[Table][number];
    const list = data[table] as Data[Table][number][];
    const old = list.find((r) => r.id === value.id);
    if (old) revision(old, record.revision);
    else if (record.revision !== undefined) throw Error(STALE_EDIT);
    if ("employee_id" in value) {
      const employee = data.employees.find((e) => e.id === value.employee_id);
      if (!employee) throw Error("Employee not found.");
      if (
        table === "shifts" &&
        !employee.active &&
        (!old ||
          ["employee_id", "date", "start", "end"].some(
            (k) =>
              (old as unknown as Record<string, unknown>)[k] !==
              (value as unknown as Record<string, unknown>)[k],
          ))
      )
        throw Error("Employee is inactive.");
    }
    if (
      table === "employees" &&
      data.employees.some(
        (e) =>
          e.id !== value.id &&
          e.email.toLowerCase() ===
            (value as Data["employees"][number]).email.toLowerCase(),
      )
    )
      throw Error("An employee with this email already exists.");
    if (
      table === "pay_rates" &&
      data.pay_rates.some(
        (e) =>
          e.id !== value.id &&
          e.employee_id === (value as Data["pay_rates"][number]).employee_id &&
          e.effective_date ===
            (value as Data["pay_rates"][number]).effective_date,
      )
    )
      throw Error("A rate already exists for that effective date.");
    if (table === "time_entries") {
      const entry = value as Data["time_entries"][number];
      const span = bounds(
        entry.date,
        entry.start,
        entry.end,
        data.settings.timezone,
      );
      const first = addDays(entry.date, -1),
        last = addDays(entry.date, 1);
      if (
        data.time_entries.some((e) => {
          if (
            e.id === entry.id ||
            e.employee_id !== entry.employee_id ||
            e.date < first ||
            e.date > last
          )
            return false;
          const other = bounds(e.date, e.start, e.end, data.settings.timezone);
          return span.start < other.end && other.start < span.end;
        })
      )
        throw Error(
          "Actual time entries cannot overlap. Edit the existing entry.",
        );
    }
    const updated = { ...value, revision: (old?.revision ?? 0) + 1 };
    next = {
      ...data,
      [table]: old
        ? list.map((r) => (r.id === updated.id ? updated : r))
        : [...list, updated],
    };
    if (table === "shifts")
      next.schedule_days = draftDays(data, [
        (value as Data["shifts"][number]).date,
        ...(old ? [(old as Data["shifts"][number]).date] : []),
      ]);
  } else if (command.kind === "remove") {
    if (role !== "manager") throw Error("Manager access required");
    const old = data.shifts.find((s) => s.id === command.id);
    if (!old) throw Error(STALE_EDIT);
    revision(old, command.revision);
    next = {
      ...data,
      shifts: data.shifts.filter((s) => s.id !== old.id),
      schedule_days: draftDays(data, [old.date]),
    };
    entity = "shifts";
  } else if (command.kind === "publish") {
    if (role !== "manager") throw Error("Manager access required");
    const { from, to, status } = command;
    // Calendar parsing rejects impossible dates rather than Date.parse normalization.
    if (
      addDays(from, 0) !== from ||
      addDays(to, 0) !== to ||
      to < from ||
      Date.parse(to) - Date.parse(from) > 366 * 86400000 ||
      !["draft", "pending", "published"].includes(status)
    )
      throw Error("Choose a valid date range of up to one year.");
    const days: Data["schedule_days"] = [];
    for (let date = from; date <= to; date = addDays(date, 1))
      days.push({
        id: data.schedule_days.find((d) => d.date === date)?.id ?? uid(),
        date,
        status,
      });
    next = {
      ...data,
      shifts: data.shifts.map((s) =>
        s.date >= from && s.date <= to
          ? { ...s, status, revision: (s.revision ?? 0) + 1 }
          : s,
      ),
      schedule_days: [
        ...data.schedule_days.filter((d) => d.date < from || d.date > to),
        ...days,
      ],
    };
  } else if (command.kind === "duplicate") {
    if (role !== "manager") throw Error("Manager access required");
    const { from, target } = command;
    if (target <= addDays(from, 6) && addDays(target, 6) >= from)
      throw Error("Choose a non-overlapping target week.");
    const copies = data.shifts
      .filter(
        (s) =>
          s.date >= from &&
          s.date <= addDays(from, 6) &&
          data.employees.some((e) => e.id === s.employee_id && e.active),
      )
      .map((s) => ({
        ...s,
        id: uid(),
        date: addDays(
          target,
          Math.round((Date.parse(s.date) - Date.parse(from)) / 86400000),
        ),
        status: "draft" as const,
        revision: 1,
      }));
    if (!copies.length)
      throw Error(
        "There are no active employees' shifts in this week to copy.",
      );
    next = {
      ...data,
      shifts: [...data.shifts, ...copies],
      schedule_days: draftDays(
        data,
        copies.map((s) => s.date),
      ),
    };
  } else {
    const key = command.table === "company_settings" ? "settings" : "rules";
    if (role !== (key === "settings" ? "manager" : "accountant"))
      throw Error("Role not permitted");
    revision(data[key], command.value.revision);
    const value = validateSettings(command.table, command.value);
    if (
      key === "settings" &&
      "timezone" in value &&
      value.timezone !== data.settings.timezone &&
      data.time_entries.length
    )
      throw Error(
        "The company timezone is locked once actual time entries exist.",
      );
    next = {
      ...data,
      [key]: { ...value, revision: (data[key].revision ?? 0) + 1 },
    };
    entity = command.table;
  }
  return {
    ...next,
    audit: [
      { id: uid(), action: command.kind, entity, actor: role, created_at: now },
      ...data.audit,
    ],
  };
}
// UI projection mirrors backend visibility. Demo storage is still fictional-only, not a security boundary.
export function roleData(
  data: Data,
  role: Role | null,
  employeeId: string,
): Data {
  if (role === "employee")
    return {
      ...data,
      employees: data.employees.filter((e) => e.id === employeeId && e.active),
      shifts: data.shifts.filter(
        (s) =>
          s.employee_id === employeeId &&
          data.employees.some((e) => e.id === employeeId && e.active) &&
          s.status === "published" &&
          data.schedule_days.some(
            (d) => d.date === s.date && d.status === "published",
          ),
      ),
      schedule_days: data.schedule_days.filter((d) => d.status === "published"),
      notes: [],
      pay_rates: [],
      time_entries: [],
      audit: [],
    };
  if (role === "accountant")
    return { ...data, notes: [], shifts: [], schedule_days: [] };
  if (role === "manager") return { ...data, pay_rates: [] };
  return data;
}
export const DEMO_KEY = "gather-demo-v1";
export function readDemo(
  storage: Pick<Storage, "getItem">,
  fallback: () => Data,
): Data {
  const raw = storage.getItem(DEMO_KEY);
  if (!raw) return fallback();
  const value = JSON.parse(raw) as Data;
  if (
    !value ||
    ![
      "employees",
      "shifts",
      "schedule_days",
      "notes",
      "time_entries",
      "pay_rates",
      "audit",
    ].every((key) => Array.isArray(value[key as keyof Data])) ||
    !value.settings?.timezone ||
    !value.rules
  )
    throw Error(
      "Saved demo data could not be read. Export or recover the existing site storage; it has not been cleared.",
    );
  return value;
}
export function persistMutation(
  storage: Pick<Storage, "getItem" | "setItem">,
  fallback: () => Data,
  role: Role,
  command: Mutation,
): Data {
  const next = applyMutation(readDemo(storage, fallback), role, command);
  storage.setItem(DEMO_KEY, JSON.stringify(next));
  return next;
}
