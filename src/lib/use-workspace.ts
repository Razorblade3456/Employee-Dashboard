"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Data, Role, Table, uid } from "./types";
import { demoData, demoEmployeeId } from "./demo";
import { supabase, configured } from "./supabase";
import { bounds } from "./time";
import {
  credential,
  credentialKey,
  verifyPasscode,
  rotatePasscode,
  ProtectedRole,
} from "./demo-passcodes";
import { validateRecord } from "./validation";
export function useWorkspace() {
  const [data, setData] = useState<Data | null>(null),
    [role, setRole] = useState<Role | null>(null),
    [requestedRole, setRequestedRole] = useState<ProtectedRole | null>(null),
    [employeeId, setEmployeeId] = useState(demoEmployeeId),
    [accountName, setAccountName] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState("");
  const ready = useRef(false);
  const loadVersion = useRef(0);
  const live = configured;
  const notify = useCallback((text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 4500);
  }, []);
  const load = useCallback(async () => {
    if (!supabase) return;
    const version = ++loadVersion.current;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setRole(null);
      setData(null);
      setLoading(false);
      return;
    }
    await supabase.rpc("link_employee");
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role,employee_id")
      .eq("id", user.id)
      .single();
    if (profileError) {
      setError(
        "Database setup is incomplete or your profile is missing. Run the Supabase migration.",
      );
      setLoading(false);
      return;
    }
    const allowed = [
      "employees",
      "shifts",
      "schedule_days",
      "company_settings",
      ...(profile.role !== "employee" ? ["time_entries", "audit_log"] : []),
      ...(profile.role === "manager" ? ["notes"] : []),
      ...(profile.role === "accountant" || profile.role === "manager"
        ? ["pay_rates", "payroll_rules"]
        : []),
    ];
    const results = await Promise.all(
      allowed.map(async (table) => {
        let response = await supabase!
          .from(table)
          .select("*")
          .order("id")
          .range(0, 999);
        if (response.error) return { table, ...response };
        const records = [...response.data];
        let offset = 1000;
        while (response.data.length === 1000) {
          response = await supabase!
            .from(table)
            .select("*")
            .order("id")
            .range(offset, offset + 999);
          if (response.error) return { table, ...response };
          records.push(...response.data);
          offset += 1000;
        }
        return {
          table,
          data: [...new Map(records.map((row) => [row.id, row])).values()],
          error: null,
        };
      }),
    );
    if (version !== loadVersion.current) return;
    const failed = results.find((r) => r.error);
    if (failed) {
      setError(failed.error!.message);
      setLoading(false);
      return;
    }
    const result = Object.fromEntries(results.map((r) => [r.table, r.data]));
    const blank: Data = {
      employees: [],
      shifts: [],
      schedule_days: [],
      notes: [],
      time_entries: [],
      pay_rates: [],
      audit: [],
      settings: {
        id: "company",
        name: "Your workspace",
        timezone: "America/Los_Angeles",
        minimum_staff: 0,
      },
      rules: {
        id: "company",
        location: "Configure payroll policy",
        weekly_threshold: 40,
        daily_threshold: 0,
        double_threshold: 0,
        overtime_multiplier: 1.5,
        double_multiplier: 2,
        week_starts: 1,
      },
    };
    setRole(profile.role);
    setEmployeeId(profile.employee_id || "");
    setAccountName(user.email?.split("@")[0] || "Your account");
    setData({
      ...blank,
      ...Object.fromEntries(
        [
          "employees",
          "shifts",
          "schedule_days",
          "notes",
          "time_entries",
          "pay_rates",
        ].map((k) => [k, result[k] || []]),
      ),
      settings: result.company_settings?.[0] || blank.settings,
      rules: result.payroll_rules?.[0] || blank.rules,
      audit: (result.audit_log || []).map(
        (a: {
          id: string;
          action: string;
          entity: string;
          actor: string;
          created_at: string;
        }) => a,
      ),
    });
    setError("");
    setLoading(false);
  }, []);
  useEffect(() => {
    if (live) {
      void load();
      const { data: listener } = supabase!.auth.onAuthStateChange((event) => {
        if (event !== "SIGNED_IN") setTimeout(() => void load(), 0);
      });
      return () => listener.subscription.unsubscribe();
    }
    try {
      const saved = localStorage.getItem("gather-demo-v1");
      setData(saved ? JSON.parse(saved) : demoData());
      localStorage.removeItem("gather-demo-role");
      const rawSession = sessionStorage.getItem("gather-demo-session-v2");
      if (rawSession) {
        const session = JSON.parse(rawSession);
        if (session.role === "employee") setRole("employee");
        else if (
          ["manager", "accountant"].includes(session.role) &&
          session.revision === credential(localStorage, session.role).revision
        )
          setRole(session.role);
      }
    } catch {
      setError(
        "Demo data could not be loaded. Clear this site’s demo storage to start again.",
      );
    }
    ready.current = true;
    setLoading(false);
  }, [live, load]);
  useEffect(() => {
    if (!live && ready.current && data) {
      try {
        localStorage.setItem("gather-demo-v1", JSON.stringify(data));
        window.dispatchEvent(new Event("gather-updated"));
      } catch {
        setError(
          "Browser storage is full or unavailable. Changes may not survive a reload.",
        );
      }
    }
  }, [data, live]);
  useEffect(() => {
    if (!live || !role) return;
    const channel = supabase!
      .channel("workspace")
      .on(
        "postgres_changes",
        { event: "*", schema: "public" },
        () => void load(),
      )
      .subscribe();
    const timer = setInterval(() => void load(), 20000);
    return () => {
      clearInterval(timer);
      void supabase!.removeChannel(channel);
    };
  }, [live, role, load]);
  useEffect(() => {
    if (live) return;
    const sync = (event: StorageEvent) => {
      if (event.key === "gather-demo-v1" && event.newValue) {
        try {
          setData(JSON.parse(event.newValue));
        } catch {}
      }
      if (role && role !== "employee" && event.key === credentialKey(role)) {
        setRole(null);
        setRequestedRole(role);
        sessionStorage.removeItem("gather-demo-session-v2");
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [live, role]);
  function rememberRole(r: Role) {
    sessionStorage.setItem(
      "gather-demo-session-v2",
      JSON.stringify({
        role: r,
        revision:
          r === "employee" ? null : credential(localStorage, r).revision,
      }),
    );
    setRole(r);
  }
  function chooseRole(r: Role) {
    if (live || r === role) return;
    if (r === "employee") {
      rememberRole(r);
      setRequestedRole(null);
    } else setRequestedRole(r);
  }
  const cancelRole = useCallback(() => setRequestedRole(null), []);
  async function unlockRole(passcode: string) {
    if (live || !requestedRole)
      throw Error("No local role is awaiting access.");
    if (!(await verifyPasscode(localStorage, requestedRole, passcode)))
      throw Error("Incorrect passcode. Please try again.");
    rememberRole(requestedRole);
    setRequestedRole(null);
  }
  async function changeDemoPasscode(
    current: string,
    next: string,
    confirmation: string,
  ) {
    if (live || !role || role === "employee")
      throw Error(
        "Only local manager and accountant roles can change these passcodes.",
      );
    await rotatePasscode(localStorage, role, current, next, confirmation);
    rememberRole(role);
    notify("Passcode updated. Use the new code next time you sign in.");
  }
  async function signOut() {
    if (live) {
      const { error } = await supabase!.auth.signOut();
      if (error) {
        setError(error.message);
        return;
      }
      setRole(null);
      setData(null);
    } else {
      setRole(null);
      sessionStorage.removeItem("gather-demo-session-v2");
      setRequestedRole(null);
    }
  }
  async function save(table: Table, record: Data[Table][number]) {
    if (!data || !role) throw Error("Not signed in");
    if (
      role === "employee" ||
      (role === "accountant" &&
        !["time_entries", "pay_rates"].includes(table)) ||
      (role === "manager" && table === "pay_rates")
    )
      throw Error("This role cannot make that change.");
    const value = validateRecord(
      table,
      record,
      data.settings.timezone,
    ) as Data[Table][number];
    if (table === "time_entries") {
      const entry = value as Data["time_entries"][number],
        b = bounds(entry.date, entry.start, entry.end, data.settings.timezone);
      if (
        data.time_entries.some((e) => {
          if (e.id === entry.id || e.employee_id !== entry.employee_id)
            return false;
          const other = bounds(e.date, e.start, e.end, data.settings.timezone);
          return b.start < other.end && other.start < b.end;
        })
      )
        throw Error(
          "Actual time entries cannot overlap. Edit the existing entry.",
        );
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
    if (live) {
      const { error } = await supabase!
        .from(table)
        .upsert(value as unknown as Record<string, unknown>)
        .select()
        .single();
      if (error) throw Error(error.message);
      await load();
    } else {
      setData((current) => {
        if (!current) return current;
        const list = current[table] as { id: string }[];
        const affected =
          table === "shifts"
            ? [
                (value as Data["shifts"][number]).date,
                ...current.shifts
                  .filter((s) => s.id === value.id)
                  .map((s) => s.date),
              ]
            : [];
        return {
          ...current,
          schedule_days:
            table === "shifts"
              ? [
                  ...current.schedule_days.filter(
                    (d) => !affected.includes(d.date),
                  ),
                  ...[...new Set(affected)].map((date) => ({
                    id:
                      current.schedule_days.find((d) => d.date === date)?.id ||
                      uid(),
                    date,
                    status: "draft" as const,
                  })),
                ]
              : current.schedule_days,
          [table]: list.some((r) => r.id === value.id)
            ? list.map((r) => (r.id === value.id ? value : r))
            : [...list, value],
          audit: [
            {
              id: uid(),
              action: list.some((r) => r.id === value.id)
                ? "Updated"
                : "Created",
              entity: table,
              actor: role,
              created_at: new Date().toISOString(),
            },
            ...current.audit,
          ],
        };
      });
    }
    notify("Changes saved");
  }
  async function remove(table: Table, id: string) {
    if (role !== "manager" || table !== "shifts")
      throw Error("Only managers can delete shifts.");
    if (live) {
      const { error } = await supabase!.from(table).delete().eq("id", id);
      if (error) throw Error(error.message);
      await load();
    } else
      setData((c) =>
        c
          ? {
              ...c,
              shifts: c.shifts.filter((s) => s.id !== id),
              schedule_days: c.schedule_days.map((day) =>
                c.shifts.some((s) => s.id === id && s.date === day.date)
                  ? { ...day, status: "draft" as const }
                  : day,
              ),
              audit: [
                {
                  id: uid(),
                  action: "Deleted",
                  entity: "shifts",
                  actor: role,
                  created_at: new Date().toISOString(),
                },
                ...c.audit,
              ],
            }
          : c,
      );
    notify("Shift deleted");
  }
  async function publish(
    from: string,
    to: string,
    status: Data["schedule_days"][number]["status"] = "published",
  ) {
    if (role !== "manager" || !data) throw Error("Manager access required");
    if (
      !Number.isFinite(Date.parse(from)) ||
      !Number.isFinite(Date.parse(to)) ||
      from > to ||
      (Date.parse(to) - Date.parse(from)) / 86400000 > 366
    )
      throw Error("Choose a valid date range of up to one year.");
    if (live) {
      const { error } = await supabase!.rpc(
        status === "published" ? "publish_schedule" : "set_schedule_status",
        {
          p_from: from,
          p_to: to,
          ...(status !== "published" ? { p_status: status } : {}),
        },
      );
      if (error) throw Error(error.message);
      await load();
    } else {
      const days: Data["schedule_days"] = [];
      for (let d = from; d <= to;) {
        const old = data.schedule_days.find((x) => x.date === d);
        days.push({
          id: old?.id || uid(),
          date: d,
          status,
        });
        const next = new Date(d + "T12:00:00Z");
        next.setUTCDate(next.getUTCDate() + 1);
        d = next.toISOString().slice(0, 10);
      }
      setData((c) =>
        c
          ? {
              ...c,
              shifts: c.shifts.map((s) =>
                s.date >= from && s.date <= to ? { ...s, status } : s,
              ),
              schedule_days: [
                ...c.schedule_days.filter((s) => s.date < from || s.date > to),
                ...days,
              ],
              audit: [
                {
                  id: uid(),
                  action: "Set " + status + " " + from + " to " + to,
                  entity: "shifts",
                  actor: role,
                  created_at: new Date().toISOString(),
                },
                ...c.audit,
              ],
            }
          : c,
      );
    }
    notify(
      status === "published"
        ? "Schedule published. Employees can see the changes."
        : "Dates marked " + status + ". Employees will see pending dates.",
    );
  }
  async function settings(
    table: "company_settings" | "payroll_rules",
    value: Data["settings"] | Data["rules"],
  ) {
    if (
      table === "company_settings" &&
      data &&
      "timezone" in value &&
      value.timezone !== data.settings.timezone &&
      data.time_entries.length
    )
      throw Error(
        "The company timezone is locked once actual time entries exist. A reviewed data migration is required to change it safely.",
      );
    if (
      role === "employee" ||
      (table === "company_settings" && role !== "manager") ||
      (table === "payroll_rules" && role !== "accountant")
    )
      throw Error("Role not permitted");
    if (live) {
      const { error } = await supabase!
        .from(table)
        .update(value as unknown as Record<string, unknown>)
        .eq("id", "company")
        .select()
        .single();
      if (error) throw Error(error.message);
      await load();
    } else
      setData((c) =>
        c
          ? {
              ...c,
              [table === "company_settings" ? "settings" : "rules"]: value,
              audit: [
                {
                  id: uid(),
                  action: "Updated policy",
                  entity: table,
                  actor: role!,
                  created_at: new Date().toISOString(),
                },
                ...c.audit,
              ],
            }
          : c,
      );
    notify("Settings updated");
  }
  return {
    data,
    role,
    employeeId,
    accountName,
    live,
    error,
    loading,
    message,
    chooseRole,
    requestedRole,
    cancelRole,
    unlockRole,
    changeDemoPasscode,
    signOut,
    save,
    remove,
    publish,
    settings,
    notify,
    reload: load,
    setError,
  };
}
export type WorkspaceStore = ReturnType<typeof useWorkspace>;
