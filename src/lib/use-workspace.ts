"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Data, Role, Table } from "./types";
import { demoData, demoEmployeeId } from "./demo";
import { supabase, configured } from "./supabase";
import {
  applyMutation,
  canSave,
  DEMO_KEY,
  persistMutation,
  readDemo,
  roleData,
  STALE_EDIT,
  type Mutation,
} from "./mutations";
import {
  credential,
  credentialKey,
  verifyPasscode,
  rotatePasscode,
  ProtectedRole,
} from "./demo-passcodes";
import { validateRecord, validateSettings } from "./validation";
export function useWorkspace() {
  const [data, setData] = useState<Data | null>(null),
    [role, setRole] = useState<Role | null>(null),
    [requestedRole, setRequestedRole] = useState<ProtectedRole | null>(null),
    [employeeId, setEmployeeId] = useState(demoEmployeeId),
    [accountName, setAccountName] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState("");
  const dataRef = useRef(data);
  dataRef.current = data;
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
      setData(readDemo(localStorage, demoData));
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
        "Saved demo data could not be read. It has not been cleared or replaced. Recover or export the existing site storage before making changes.",
      );
    }
    setLoading(false);
  }, [live, load]);
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
      if (event.key === DEMO_KEY && event.newValue) {
        try {
          setData(readDemo(localStorage, demoData));
        } catch {
          setError(
            "Another tab saved unreadable demo data. The original storage has not been cleared.",
          );
        }
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
      ++loadVersion.current;
      setRole(null);
      setData(null);
    } else {
      setRole(null);
      sessionStorage.removeItem("gather-demo-session-v2");
      setRequestedRole(null);
    }
  }
  async function demoCommit(command: Mutation) {
    if (!role) throw Error("Not signed in");
    if (!navigator.locks)
      throw Error(
        "This browser cannot safely coordinate demo edits. Use a recent browser with Web Locks support.",
      );
    await navigator.locks.request("gather-demo-write", () => {
      const next = persistMutation(localStorage, demoData, role, command);
      dataRef.current = next;
      setData(next);
      window.dispatchEvent(new Event("gather-updated"));
    });
  }
  async function save(table: Table, record: Data[Table][number]) {
    const current = dataRef.current;
    if (!current || !role) throw Error("Not signed in");
    if (!canSave(role, table))
      throw Error("This role cannot make that change.");
    if (live) {
      applyMutation(current, role, { kind: "save", table, record });
      const value = validateRecord(
        table,
        record,
        current.settings.timezone,
      ) as Data[Table][number];
      const existing = current[table].find((r) => r.id === record.id);
      if (existing && existing.revision === undefined)
        throw Error(
          "Apply database migration 002 before editing live records. No changes were saved.",
        );
      const query = existing
        ? supabase!
            .from(table)
            .update(value as unknown as Record<string, unknown>)
            .eq("id", value.id)
            .eq("revision", record.revision ?? 0)
        : supabase!
            .from(table)
            .insert(value as unknown as Record<string, unknown>);
      const { error, data: saved } = await query.select().maybeSingle();
      if (error) throw Error(error.message);
      if (!saved) throw Error(STALE_EDIT);
      await load();
    } else await demoCommit({ kind: "save", table, record });
    notify("Changes saved");
  }
  async function remove(table: Table, id: string, expectedRevision?: number) {
    if (role !== "manager" || table !== "shifts")
      throw Error("Only managers can delete shifts.");
    const revision =
      expectedRevision ??
      dataRef.current?.shifts.find((s) => s.id === id)?.revision ??
      0;
    if (live) {
      const { error, data: saved } = await supabase!
        .from(table)
        .delete()
        .eq("id", id)
        .eq("revision", revision)
        .select()
        .maybeSingle();
      if (error) throw Error(error.message);
      if (!saved) throw Error(STALE_EDIT);
      await load();
    } else await demoCommit({ kind: "remove", id, revision });
    notify("Shift deleted");
  }
  async function publish(
    from: string,
    to: string,
    status: Data["schedule_days"][number]["status"] = "published",
  ) {
    if (role !== "manager" || !dataRef.current)
      throw Error("Manager access required");
    if (live) {
      applyMutation(dataRef.current, role, {
        kind: "publish",
        from,
        to,
        status,
      });
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
    } else await demoCommit({ kind: "publish", from, to, status });
    notify(
      status === "published"
        ? "Schedule published. Employees can see the changes."
        : "Dates marked " + status + ". Employees will see pending dates.",
    );
  }
  async function duplicate(from: string, target: string) {
    if (role !== "manager") throw Error("Manager access required");
    if (live) {
      const { error } = await supabase!.rpc("duplicate_week", {
        p_from: from,
        p_target: target,
      });
      if (error) throw Error(error.message);
      await load();
    } else await demoCommit({ kind: "duplicate", from, target });
    notify("Week copied as draft");
  }
  async function settings(
    table: "company_settings" | "payroll_rules",
    value: Data["settings"] | Data["rules"],
  ) {
    if (!role || !dataRef.current) throw Error("Not signed in");
    if (live) {
      applyMutation(dataRef.current, role, { kind: "settings", table, value });
      const parsed = validateSettings(table, value);
      const { error, data: saved } = await supabase!
        .from(table)
        .update(parsed)
        .eq("id", "company")
        .eq("revision", value.revision ?? 0)
        .select()
        .maybeSingle();
      if (error) throw Error(error.message);
      if (!saved) throw Error(STALE_EDIT);
      await load();
    } else await demoCommit({ kind: "settings", table, value });
    notify("Settings updated");
  }
  return {
    data: data && !live ? roleData(data, role, employeeId) : data,
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
    duplicate,
    settings,
    notify,
    reload: load,
    setError,
  };
}
export type WorkspaceStore = ReturnType<typeof useWorkspace>;
