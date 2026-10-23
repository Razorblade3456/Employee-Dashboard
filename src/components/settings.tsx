"use client";
import { useState } from "react";
import {
  Save,
  ShieldCheck,
  Globe,
  KeyRound,
  ScrollText,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { WorkspaceStore } from "@/lib/use-workspace";
import { supabase } from "@/lib/supabase";
import { PanelTitle, Badge, Empty } from "./ui";
import { today } from "@/lib/time";
import { ThemeController } from "@/lib/use-theme";
export default function SettingsView({
  store,
  theme,
}: {
  store: WorkspaceStore;
  theme: ThemeController;
}) {
  const d = store.data!,
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(
    e: React.FormEvent<HTMLFormElement>,
    type: "company" | "rules" | "password" | "code",
  ) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = e.currentTarget,
      f = new FormData(form),
      s = (k: string) => String(f.get(k) || ""),
      num = (k: string) => Number(f.get(k));
    try {
      if (type === "company") {
        today(s("timezone"));
        await store.settings("company_settings", {
          id: "company",
          name: s("name").trim(),
          timezone: s("timezone"),
          minimum_staff: num("minimum_staff"),
        });
      }
      if (type === "rules") {
        const rule = {
          id: "company",
          location: s("location"),
          weekly_threshold: num("weekly_threshold"),
          daily_threshold: num("daily_threshold"),
          double_threshold: num("double_threshold"),
          overtime_multiplier: num("overtime_multiplier"),
          double_multiplier: num("double_multiplier"),
          week_starts: num("week_starts"),
        };
        if (
          rule.double_threshold &&
          rule.daily_threshold &&
          rule.double_threshold < rule.daily_threshold
        )
          throw Error(
            "Double-time threshold must be at least the daily overtime threshold.",
          );
        await store.settings("payroll_rules", rule);
      }
      if (type === "password") {
        if (!supabase)
          throw Error(
            "Demo mode has no account password. Connect Supabase to manage real accounts.",
          );
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase.auth.signInWithPassword({
          email: user!.email!,
          password: s("current"),
        });
        if (error) throw Error("Current password is incorrect.");
        const result = await supabase.auth.updateUser({
          password: s("password"),
        });
        if (result.error) throw result.error;
        form.reset();
        store.notify("Account password updated");
      }
      if (type === "code") {
        if (!store.live) {
          await store.changeDemoPasscode(
            s("current_code"),
            s("new_code"),
            s("confirm_code"),
          );
          form.reset();
          return;
        }
        if (!supabase) throw Error("Account connection is unavailable.");
        const { error } = await supabase.rpc("change_access_code", {
          p_current: s("current_code"),
          p_new: s("new_code"),
        });
        if (error) throw error;
        store.notify(
          "Access code updated. Account authentication is still required.",
        );
        form.reset();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-layout">
      <div className="settings-main">
        <section className="panel">
          <PanelTitle
            title="Day or night. Your preference."
            description="Choose a viewing theme. Your preference is saved in this browser."
          />
          <div className="appearance-options">
            {(
              [
                {
                  value: "day",
                  label: "Day",
                  detail: "A bright, clear workspace",
                  icon: Sun,
                },
                {
                  value: "night",
                  label: "Night",
                  detail: "A softer view after dark",
                  icon: Moon,
                },
                {
                  value: "system",
                  label: "System",
                  detail: "Follow your device theme",
                  icon: Monitor,
                },
              ] as const
            ).map(({ value, label, detail, icon: Icon }) => (
              <button
                key={value}
                className={
                  "appearance-option " +
                  (theme.preference === value ? "active" : "")
                }
                aria-pressed={theme.preference === value}
                onClick={() => theme.setPreference(value)}
              >
                <Icon size={22} />
                <strong>{label}</strong>
                <small>{detail}</small>
              </button>
            ))}
          </div>
        </section>
        {error && (
          <p className="form-error panel" role="alert">
            {error}
          </p>
        )}
        {store.role === "manager" && (
          <section className="panel">
            <PanelTitle
              title="Make it your workspace"
              description="Company defaults for scheduling and coverage."
            />
            <form
              className="settings-form"
              onSubmit={(e) => void submit(e, "company")}
            >
              <label>
                Workspace name
                <input
                  name="name"
                  defaultValue={d.settings.name}
                  required
                  maxLength={80}
                />
              </label>
              <div className="form-pair">
                <label>
                  Company timezone
                  <select name="timezone" defaultValue={d.settings.timezone}>
                    {[
                      ...new Set([
                        d.settings.timezone,
                        "America/Los_Angeles",
                        "America/Denver",
                        "America/Chicago",
                        "America/New_York",
                        "America/Phoenix",
                        "Europe/London",
                        "Europe/Paris",
                        "Asia/Kolkata",
                        "Asia/Tokyo",
                        "Australia/Sydney",
                        "UTC",
                      ]),
                    ].map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Minimum employees per day
                  <input
                    name="minimum_staff"
                    type="number"
                    min={0}
                    max={1000}
                    defaultValue={d.settings.minimum_staff}
                    required
                  />
                </label>
              </div>
              <p className="fine-print">
                Coverage warnings count unique employees per day. Set 0 to
                disable. Changing timezone changes how wall-clock schedules and
                actual entries are interpreted; review historical payroll before
                changing it.
              </p>
              <button className="button primary" disabled={busy}>
                <Save size={15} />
                Save workspace
              </button>
            </form>
          </section>
        )}
        {store.role === "accountant" && (
          <section className="panel">
            <PanelTitle
              title="Your company. Your overtime policy."
              description="Configure rules for your location before relying on payroll estimates."
            />
            <form
              className="settings-form"
              onSubmit={(e) => void submit(e, "rules")}
            >
              <label>
                Location / policy name
                <input
                  name="location"
                  defaultValue={d.rules.location}
                  required
                  maxLength={100}
                />
              </label>
              <div className="form-pair">
                <label>
                  Weekly regular-hour threshold
                  <input
                    name="weekly_threshold"
                    type="number"
                    min={1}
                    max={168}
                    step=".25"
                    defaultValue={d.rules.weekly_threshold}
                    required
                  />
                </label>
                <label>
                  Daily overtime starts after (0 = off)
                  <input
                    name="daily_threshold"
                    type="number"
                    min={0}
                    max={24}
                    step=".25"
                    defaultValue={d.rules.daily_threshold}
                    required
                  />
                </label>
                <label>
                  Daily double time after (0 = off)
                  <input
                    name="double_threshold"
                    type="number"
                    min={0}
                    max={24}
                    step=".25"
                    defaultValue={d.rules.double_threshold}
                    required
                  />
                </label>
                <label>
                  Workweek begins
                  <select name="week_starts" defaultValue={d.rules.week_starts}>
                    {[
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ].map((day, i) => (
                      <option value={i} key={day}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Overtime multiplier
                  <input
                    name="overtime_multiplier"
                    type="number"
                    min={1}
                    max={5}
                    step=".01"
                    defaultValue={d.rules.overtime_multiplier}
                    required
                  />
                </label>
                <label>
                  Double-time multiplier
                  <input
                    name="double_multiplier"
                    type="number"
                    min={1}
                    max={5}
                    step=".01"
                    defaultValue={d.rules.double_multiplier}
                    required
                  />
                </label>
              </div>
              <p className="fine-print">
                Daily premiums are applied first. Weekly overtime then applies
                to remaining regular-eligible hours, so hours aren’t counted
                twice. Overnight entries split at local midnight; breaks and
                adjustments are allocated proportionally. Specialized rules such
                as seventh-day premiums require a policy extension.
              </p>
              <button className="button primary" disabled={busy}>
                <Save size={15} />
                Save payroll policy
              </button>
            </form>
          </section>
        )}
        <section className="panel">
          <PanelTitle
            title="Account security"
            description={
              store.live
                ? "Manage your account credentials."
                : "Manager and accountant demo workspaces have changeable local passcodes."
            }
          />
          {store.live ? (
            <form
              className="settings-form"
              onSubmit={(e) => void submit(e, "password")}
            >
              <div className="form-pair">
                <label>
                  Current password
                  <input
                    name="current"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                </label>
                <label>
                  New password
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                  />
                </label>
              </div>
              <button className="button" disabled={busy}>
                <KeyRound size={15} />
                Update password
              </button>
            </form>
          ) : (
            <div className="notice">
              <ShieldCheck size={18} />
              Connect Supabase to enable verified accounts and database-enforced
              roles.
            </div>
          )}
          {store.role !== "employee" && (
            <form
              className="settings-form"
              onSubmit={(e) => void submit(e, "code")}
            >
              <h3>{store.live ? "Role access code" : "Workspace passcode"}</h3>
              <p className="fine-print">
                {store.live
                  ? "This code is an additional setup credential; it never replaces account authentication."
                  : "Change this role’s local passcode. You must enter the current code, and the new code will be required when you next unlock this workspace."}
              </p>
              <div className="form-pair">
                <label>
                  Current code
                  <input type="password" name="current_code" required />
                </label>
                <label>
                  New code
                  <input
                    type="password"
                    name="new_code"
                    minLength={store.live ? 8 : 4}
                    maxLength={128}
                    required
                  />
                </label>
              </div>
              {!store.live && (
                <label>
                  Confirm new code
                  <input
                    type="password"
                    name="confirm_code"
                    minLength={4}
                    maxLength={128}
                    autoComplete="new-password"
                    required
                  />
                </label>
              )}
              <button className="button" disabled={busy}>
                Change access code
              </button>
            </form>
          )}
        </section>
        {store.role !== "employee" && (
          <section className="panel">
            <PanelTitle
              title="Workspace activity"
              description="An audit trail of authorized changes."
            />
            <div className="audit-list">
              {d.audit
                .slice()
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .slice(0, 30)
                .map((a) => (
                  <div key={a.id}>
                    <span className="audit-icon">
                      <ScrollText size={15} />
                    </span>
                    <span>
                      <strong>
                        {a.action} · {a.entity.replaceAll("_", " ")}
                      </strong>
                      <small>
                        {a.actor} ·{" "}
                        {new Date(a.created_at).toLocaleString("en-US", {
                          timeZone: d.settings.timezone,
                        })}
                      </small>
                    </span>
                  </div>
                ))}
            </div>
            {!d.audit.length && (
              <Empty
                title="All quiet for now"
                body="Schedule and payroll changes will appear here."
              />
            )}
          </section>
        )}
      </div>
      <aside className="settings-aside panel">
        <span className="section-icon">
          <ShieldCheck size={22} />
        </span>
        <h3>A thoughtful layer of protection.</h3>
        <p>
          Each role sees the information it needs. Employee schedules,
          management notes, and payroll data are kept in separate permission
          boundaries.
        </p>
        <Badge tone={store.live ? "green" : "amber"}>
          {store.live ? "Supabase connected" : "Local demonstration"}
        </Badge>
        <hr />
        <small>
          {store.live
            ? "Roles are assigned on the server. Changes are checked by Row Level Security."
            : "Demo data is stored in this browser and shared between demo roles. Use fictional data here."}
        </small>
      </aside>
    </div>
  );
}
