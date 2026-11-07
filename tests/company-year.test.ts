import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import {
  applyMutation,
  canSave,
  persistMutation,
  readDemo,
  roleData,
  DEMO_KEY,
  STALE_EDIT,
  type Mutation,
} from "../src/lib/mutations";
import { demoData } from "../src/lib/demo";
import { calculatePayroll } from "../src/lib/payroll";
import { addDays, bounds } from "../src/lib/time";
import { conflicts } from "../src/lib/scheduling";
import { attendanceGaps } from "../src/lib/attendance";
import { Data, Role, TimeEntry, uid } from "../src/lib/types";

test("365-day fictional company simulation uses the application mutation engine", async () => {
  let data: Data = {
    ...demoData(),
    employees: [],
    shifts: [],
    schedule_days: [],
    notes: [],
    pay_rates: [],
    time_entries: [],
    audit: [],
  };
  data.settings.timezone = "America/Phoenix"; // Deterministic year oracle; dedicated DST tests cover other zones.
  const counts: Record<string, number> = {};
  let checks = 0;
  const count = (name: string, n = 1) =>
    (counts[name] = (counts[name] ?? 0) + n);
  function run(role: Role, c: Mutation) {
    data = applyMutation(data, role, c, "2026-01-01T00:00:00Z");
    count(c.kind === "save" ? c.table : c.kind);
  }
  function rejected(role: Role, c: Mutation) {
    const before = data;
    assert.throws(() => applyMutation(data, role, c));
    assert.equal(data, before);
    count("safelyRejected");
    checks++;
  }
  function hire(i: number, date: string) {
    const id = uid();
    run("manager", {
      kind: "save",
      table: "employees",
      record: {
        id,
        name: `Fictional Employee ${i}`,
        email: `fictional${i}@simulation.example`,
        department: ["Operations", "Support", "Fulfillment"][i % 3],
        title: "Associate",
        active: true,
        color: "#7073d1",
      },
    });
    if (i !== 30)
      run("accountant", {
        kind: "save",
        table: "pay_rates",
        record: {
          id: uid(),
          employee_id: id,
          hourly_rate: 18 + (i % 15),
          effective_date: date,
        },
      });
    return id;
  }
  for (let i = 1; i <= 30; i++) hire(i, "2026-01-01");
  const managers = ["manager-1", "manager-2", "manager-3", "manager-4"];
  const accountants = ["accountant-1", "accountant-2"];
  let expectedHours = 0;
  const approvedByDate = new Map<string, number>();
  for (let day = 0; day < 365; day++) {
    const date = addDays("2026-01-01", day),
      weekday = new Date(date + "T12:00Z").getUTCDay();
    count("simulatedDays");
    count("managerSessions");
    assert.ok(managers[day % 4]);
    assert.ok(accountants[day % 2]);
    if (day > 0 && day % 60 === 0) {
      const departing = data.employees.find((e) => e.active)!;
      run("manager", {
        kind: "save",
        table: "employees",
        record: { ...departing, active: false },
      });
      count("terminations");
      hire(30 + day, date);
      count("replacementHires");
    }
    const active = data.employees.filter((e) => e.active);
    const holiday = ["2026-01-01", "2026-07-04", "2026-12-25"].includes(date);
    if (holiday) count("holidays");
    if (weekday === 0 || weekday === 6) count("weekends");
    if (date >= "2026-11-20") count("busyDays");
    for (const [i, employee] of active.entries()) {
      count("employeeScheduleViews");
      const view = roleData(data, "employee", employee.id);
      assert.ok(
        view.shifts.every(
          (s) => s.employee_id === employee.id && s.status === "published",
        ),
      );
      assert.equal(
        view.pay_rates.length + view.notes.length + view.time_entries.length,
        0,
      );
      checks += 2;
      if ((day + i) % 7 >= 5 || (holiday && i % 5 !== 0)) {
        count("daysOff");
        continue;
      }
      if ((day * 3 + i) % 97 === 0) {
        count("timeOff");
        continue;
      }
      const night = i % 13 === 0,
        extra = !night && (day + i) % 9 === 0;
      const shift = {
        id: uid(),
        employee_id: employee.id,
        date,
        start: night ? "22:00" : "08:00",
        end: night ? "06:00" : extra ? "19:00" : "16:30",
        break_minutes: 30,
        status: "draft" as const,
      };
      run("manager", { kind: "save", table: "shifts", record: shift });
      if (night) count("overnightShifts");
      if (extra) count("extendedShifts");
      const saved = data.shifts.at(-1)!;
      if ((day + i) % 79 === 0) {
        run("manager", {
          kind: "save",
          table: "notes",
          record: {
            id: uid(),
            employee_id: employee.id,
            kind: "Call-off",
            body: "Fictional sick call; shift removed after manager review.",
            created_at: date + "T12:00:00Z",
          },
        });
        run("manager", {
          kind: "remove",
          id: saved.id,
          revision: saved.revision,
        });
        count("sickCallouts");
        continue;
      }
      if ((day + i) % 83 === 0) {
        count("missingTimesheets");
        continue;
      }
      const entry: TimeEntry = {
        id: uid(),
        employee_id: employee.id,
        date,
        start: shift.start,
        end: shift.end,
        break_minutes: 30,
        adjustment_minutes: 0,
        adjustment_reason: "",
        approved: (day + i) % 23 !== 0,
      };
      run(day % 2 ? "manager" : "accountant", {
        kind: "save",
        table: "time_entries",
        record: entry,
      });
      if (entry.approved) {
        const h = night ? 7.5 : extra ? 10.5 : 8;
        expectedHours += h;
        approvedByDate.set(date, (approvedByDate.get(date) ?? 0) + h);
      } else count("pendingTimesheets");
      if (day % 29 === 0 && i === 2) {
        const old = data.time_entries.at(-1)!;
        run("accountant", {
          kind: "save",
          table: "time_entries",
          record: {
            ...old,
            adjustment_minutes: 15,
            adjustment_reason: "Fictional corrected clock time",
          },
        });
        if (old.approved) {
          expectedHours += 0.25;
          approvedByDate.set(date, (approvedByDate.get(date) ?? 0) + 0.25);
        }
        count("payrollCorrections");
      }
    }
    if (day % 11 === 0) {
      count("pendingDates");
    } else
      run("manager", {
        kind: "publish",
        from: date,
        to: date,
        status: "published",
      });
    if (day % 17 === 0) {
      const row = data.shifts.findLast((s) => s.date === date);
      if (row) {
        const snapshot = { ...row };
        run("manager", {
          kind: "save",
          table: "shifts",
          record: { ...row, break_minutes: 15 },
        });
        rejected("manager", {
          kind: "save",
          table: "shifts",
          record: { ...snapshot, break_minutes: 45 },
        });
        assert.equal(
          data.schedule_days.find((d) => d.date === date)?.status,
          "draft",
        );
        count("twoManagerEditConflicts");
        run("manager", {
          kind: "publish",
          from: date,
          to: date,
          status: "published",
        });
      }
    }
    if (day % 30 === 0) {
      const row = data.shifts.findLast((s) => s.date === date);
      if (row) {
        rejected("employee", {
          kind: "save",
          table: "shifts",
          record: { ...row, start: "10:00" },
        });
        rejected("accountant", { kind: "save", table: "shifts", record: row });
        rejected("manager", {
          kind: "save",
          table: "shifts",
          record: { ...row, start: "25:00" },
        });
      }
      rejected("accountant", {
        kind: "settings",
        table: "company_settings",
        value: { ...data.settings, name: "Forbidden change" },
      });
      const restored = readDemo({ getItem: () => JSON.stringify(data) }, () => {
        throw Error("Must not reset existing records");
      });
      assert.deepEqual(restored, data);
      count("refreshRecovery");
    }
    if (day === 7) {
      const employee = data.employees.find(
        (e) => e.email === "fictional30@simulation.example",
      )!;
      const rows = calculatePayroll(
        data.time_entries,
        data.pay_rates,
        data.rules,
        data.settings.timezone,
        "2026-01-01",
        date,
      );
      assert.ok(rows.find((r) => r.employee_id === employee.id)?.missingRate);
      run("accountant", {
        kind: "save",
        table: "pay_rates",
        record: {
          id: uid(),
          employee_id: employee.id,
          hourly_rate: 23,
          effective_date: "2026-01-01",
        },
      });
      count("missingRateCorrections");
    }
    if (day === 180) {
      for (const employee of active) {
        const old = data.pay_rates.find(
          (r) => r.employee_id === employee.id && r.effective_date === date,
        );
        run("accountant", {
          kind: "save",
          table: "pay_rates",
          record: {
            id: old?.id ?? uid(),
            revision: old?.revision,
            employee_id: employee.id,
            hourly_rate: 30,
            effective_date: date,
          },
        });
      }
      count("midyearRaises", active.length);
    }
    if (day === 200 || day === 250) {
      run("accountant", {
        kind: "settings",
        table: "payroll_rules",
        value: { ...data.rules, weekly_threshold: day === 200 ? 36 : 44 },
      });
      count("policyChanges");
    }
    if (day % 14 === 13 || day === 364) {
      const from = addDays(date, -Math.min(day, 13)),
        rows = calculatePayroll(
          data.time_entries,
          data.pay_rates,
          data.rules,
          data.settings.timezone,
          from,
          date,
        );
      // Independent conservation oracle, including overnight pieces outside report boundaries.
      let expected = 0;
      for (const e of data.time_entries) {
        if (!e.approved || e.date < addDays(from, -1) || e.date > date)
          continue;
        const net = e.start === "22:00" ? 7.5 : e.end === "19:00" ? 10.5 : 8;
        const paid = net + e.adjustment_minutes / 60;
        if (e.start === "22:00") {
          if (e.date >= from) expected += paid * 0.25;
          const next = addDays(e.date, 1);
          if (next >= from && next <= date) expected += paid * 0.75;
        } else if (e.date >= from) expected += paid;
      }
      assert.ok(
        Math.abs(
          rows.reduce((n, r) => n + r.regular + r.overtime + r.double, 0) -
            expected,
        ) < 1e-7,
      );
      assert.ok(rows.every((r) => Number.isFinite(r.gross) && r.gross >= 0));
      count("payPeriodReviews");
      checks += 2;
    }
  }
  const collisions = conflicts(data.shifts, data.settings.timezone);
  assert.equal(collisions.size, 0);
  checks++;
  assert.equal(data.employees.filter((e) => e.active).length, 30);
  assert.equal(counts.simulatedDays, 365);
  assert.ok(counts.twoManagerEditConflicts > 10);
  assert.ok(expectedHours > 40000);
  const report = {
    fictional: true,
    accelerated: true,
    year: 2026,
    days: 365,
    staff: {
      employees: 30,
      managers: 4,
      accountants: 2,
      replacementHires: counts.replacementHires,
    },
    counts,
    operations:
      data.audit.length +
      counts.safelyRejected +
      counts.employeeScheduleViews +
      counts.payPeriodReviews +
      counts.refreshRecovery,
    successfulWrites: data.audit.length,
    assertions: checks,
    records: {
      employees: data.employees.length,
      shifts: data.shifts.length,
      timeEntries: data.time_entries.length,
      audit: data.audit.length,
    },
    result: "passed",
    scope:
      "Shared application mutation engine, role projection, payroll, and serialization. Separate PostgreSQL and browser tests cover RLS and actual tab coordination; this is not a year of hosted production operation.",
  };
  if (process.env.SIMULATION_REPORT)
    await writeFile(
      process.env.SIMULATION_REPORT,
      JSON.stringify(report, null, 2) + "\n",
    );
  console.log("YEAR_SIMULATION " + JSON.stringify(report));
});

test("atomic storage rejects stale edits, keeps independent writes and survives quota/corrupt data errors", () => {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
  const initial = demoData();
  map.set(DEMO_KEY, JSON.stringify(initial));
  const original = initial.employees[0];
  const a = persistMutation(storage, () => initial, "manager", {
    kind: "save",
    table: "employees",
    record: { ...original, title: "Updated once" },
  });
  assert.throws(
    () =>
      persistMutation(storage, () => initial, "manager", {
        kind: "save",
        table: "employees",
        record: { ...original, title: "Stale overwrite" },
      }),
    new RegExp(STALE_EDIT.split(".")[0]),
  );
  const b = persistMutation(storage, () => initial, "manager", {
    kind: "save",
    table: "employees",
    record: { ...initial.employees[1], title: "Independent edit" },
  });
  assert.equal(b.employees[0].title, "Updated once");
  assert.equal(b.employees[1].title, "Independent edit");
  const before = storage.getItem(DEMO_KEY);
  assert.throws(() =>
    persistMutation(
      {
        ...storage,
        setItem: () => {
          throw Error("QuotaExceeded");
        },
      },
      () => initial,
      "manager",
      {
        kind: "save",
        table: "employees",
        record: { ...a.employees[0], title: "Must not persist" },
      },
    ),
  );
  assert.equal(storage.getItem(DEMO_KEY), before);
  map.set(DEMO_KEY, "{broken");
  assert.throws(() =>
    readDemo(storage, () => {
      throw Error("Must not reset");
    }),
  );
  assert.equal(storage.getItem(DEMO_KEY), "{broken");
});

test("atomic week copy, overnight conflicts, configurable policy and historical corrections", () => {
  let data = demoData();
  const source = data.shifts[0].date;
  const before = data.shifts.length;
  data = applyMutation(data, "manager", {
    kind: "duplicate",
    from: source,
    target: addDays(source, 42),
  });
  assert.ok(data.shifts.length > before);
  assert.ok(data.shifts.slice(before).every((s) => s.status === "draft"));
  assert.throws(() =>
    applyMutation(data, "manager", {
      kind: "duplicate",
      from: source,
      target: source,
    }),
  );
  const base = data.shifts[0];
  assert.equal(
    conflicts(
      [
        { ...base, id: "a", date: "2026-02-01", start: "22:00", end: "06:00" },
        { ...base, id: "b", date: "2026-02-02", start: "05:00", end: "09:00" },
      ],
      data.settings.timezone,
    ).size,
    2,
  );
  const a = bounds("2026-02-01", "09:00", "09:00:00", "UTC");
  assert.equal(a.end - a.start, 24 * 3600000);
  assert.equal(canSave("employee", "pay_rates"), false);
  assert.equal(canSave("accountant", "employees"), false);
  assert.throws(() =>
    applyMutation(data, "accountant", {
      kind: "settings",
      table: "payroll_rules",
      value: { ...data.rules, weekly_threshold: NaN },
    }),
  );
});

test("missing published time is visible to managers without fabricating payroll; deleted records stay deleted", () => {
  let data = demoData();
  const shift = data.shifts[0];
  data = {
    ...data,
    shifts: [{ ...shift, status: "published" }],
    schedule_days: [{ id: uid(), date: shift.date, status: "published" }],
    time_entries: [],
  };
  assert.equal(attendanceGaps(data, shift.date, shift.date).length, 1);
  assert.equal(
    attendanceGaps(roleData(data, "accountant", ""), shift.date, shift.date)
      .length,
    0,
  );
  assert.equal(
    calculatePayroll(
      data.time_entries,
      data.pay_rates,
      data.rules,
      data.settings.timezone,
      shift.date,
      shift.date,
    ).length,
    0,
  );
  data = applyMutation(data, "manager", { kind: "remove", id: shift.id });
  assert.throws(() =>
    applyMutation(data, "manager", {
      kind: "save",
      table: "shifts",
      record: { ...shift, revision: 0 },
    }),
  );
});
