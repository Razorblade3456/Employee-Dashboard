"use client";
import { useState } from "react";
import { Copy, Trash2, Save, AlertCircle } from "lucide-react";
import { Employee, Shift, Note, TimeEntry, PayRate, uid } from "@/lib/types";
import { WorkspaceStore } from "@/lib/use-workspace";
import { today, addDays } from "@/lib/time";
import { Modal } from "./ui";
export type Editor =
  | { kind: "shift"; record?: Shift; date?: string; employeeId?: string }
  | { kind: "employee"; record?: Employee }
  | { kind: "note"; record?: Note }
  | { kind: "time"; record?: TimeEntry }
  | { kind: "rate"; employeeId: string }
  | { kind: "publish"; from: string; to: string }
  | { kind: "duplicate"; from: string };
export default function EditorDialog({
  editor,
  store,
  close,
}: {
  editor: Editor;
  store: WorkspaceStore;
  close: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [scheduleStatus, setScheduleStatus] = useState<
      "draft" | "published" | "pending"
    >("published");
  const d = store.data!;
  const kind = editor.kind;
  const record = "record" in editor ? editor.record : undefined;
  const date = today(d.settings.timezone);
  const people = d.employees.filter(
    (e) => e.active || e.id === (record as Shift)?.employee_id,
  );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget),
      s = (k: string) => String(f.get(k) || ""),
      num = (k: string) => Number(f.get(k) || 0);
    try {
      if (kind === "shift") {
        const value: Shift = {
          id: record?.id || uid(),
          employee_id: s("employee_id"),
          date: s("date"),
          start: s("start"),
          end: s("end"),
          break_minutes: num("break_minutes"),
          status: "draft",
        };
        await store.save("shifts", value);
      } else if (kind === "employee") {
        const old = record as Employee | undefined;
        if (
          old?.active &&
          f.get("active") !== "on" &&
          !f.get("confirm_deactivate")
        )
          throw Error(
            "Confirm deactivation to preserve history and revoke schedule access.",
          );
        await store.save("employees", {
          id: old?.id || uid(),
          name: s("name"),
          email: s("email").toLowerCase(),
          department: s("department"),
          title: s("title"),
          active: f.get("active") === "on",
          color: old?.color || "#7677d2",
          ...(old?.user_id ? { user_id: old.user_id } : {}),
        });
      } else if (kind === "note") {
        await store.save("notes", {
          id: uid(),
          employee_id: s("employee_id"),
          kind: s("note_kind") as Note["kind"],
          body: s("body").trim(),
          created_at: new Date().toISOString(),
        });
      } else if (kind === "time") {
        await store.save("time_entries", {
          id: record?.id || uid(),
          employee_id: s("employee_id"),
          date: s("date"),
          start: s("start"),
          end: s("end"),
          break_minutes: num("break_minutes"),
          adjustment_minutes: num("adjustment_minutes"),
          adjustment_reason: s("adjustment_reason"),
          approved: f.get("approved") === "on",
        });
      } else if (kind === "rate") {
        const value: PayRate = {
          id:
            d.pay_rates.find(
              (rate) =>
                rate.employee_id === editor.employeeId &&
                rate.effective_date === s("effective_date"),
            )?.id || uid(),
          employee_id: editor.employeeId,
          hourly_rate: num("hourly_rate"),
          effective_date: s("effective_date"),
        };
        if (!Number.isFinite(value.hourly_rate) || value.hourly_rate <= 0)
          throw Error("Enter a positive rate.");
        await store.save("pay_rates", value);
      } else if (kind === "publish") {
        if (s("from") > s("to"))
          throw Error("End date must follow start date.");
        await store.publish(s("from"), s("to"), scheduleStatus);
      } else if (kind === "duplicate") {
        const from = editor.from,
          target = s("target");
        if (target <= addDays(from, 6) && addDays(target, 6) >= from)
          throw Error("Choose a non-overlapping target week.");
        const shifts = d.shifts.filter(
          (sh) => sh.date >= from && sh.date <= addDays(from, 6),
        );
        if (!shifts.length)
          throw Error("There are no shifts in this week to copy.");
        if (store.live) {
          const { error } = await (
            await import("@/lib/supabase")
          ).supabase!.rpc("duplicate_week", { p_from: from, p_target: target });
          if (error) throw error;
          await store.reload();
        } else
          for (const shift of shifts) {
            const offset = Math.round(
              (Date.parse(shift.date) - Date.parse(from)) / 86400000,
            );
            await store.save("shifts", {
              ...shift,
              id: uid(),
              date: addDays(target, offset),
              status: "draft",
            });
          }
        store.notify("Week copied as draft");
      }
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }
  async function deleteShift() {
    if (kind !== "shift" || !record) return;
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    try {
      await store.remove("shifts", record.id);
      close();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function copy() {
    if (kind !== "shift" || !record) return;
    try {
      await store.save("shifts", {
        ...(record as Shift),
        id: uid(),
        status: "draft",
      });
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const shiftRecord = record as Shift | TimeEntry | undefined;
  return (
    <Modal
      title={
        kind === "publish"
          ? "Schedule visibility"
          : kind === "duplicate"
            ? "Give next week a head start"
            : kind === "rate"
              ? "Update hourly rate"
              : (record ? "Edit " : "Add ") +
                ({
                  shift: "shift",
                  employee: "team member",
                  note: "operational note",
                  time: "time entry",
                }[kind] || "")
      }
      onClose={close}
    >
      <form onSubmit={submit} className="editor-form">
        {kind === "employee" ? (
          <>
            <div className="form-pair">
              <label>
                Full name
                <input
                  name="name"
                  defaultValue={(record as Employee)?.name}
                  required
                  maxLength={100}
                />
              </label>
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  defaultValue={(record as Employee)?.email}
                  required
                />
              </label>
            </div>
            <div className="form-pair">
              <label>
                Department
                <input
                  name="department"
                  defaultValue={
                    (record as Employee)?.department || "Operations"
                  }
                  required
                  maxLength={60}
                />
              </label>
              <label>
                Job title
                <input
                  name="title"
                  defaultValue={(record as Employee)?.title}
                  required
                  maxLength={80}
                />
              </label>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="active"
                defaultChecked={(record as Employee)?.active ?? true}
              />
              Active team member
            </label>
            {(record as Employee)?.active && (
              <label className="checkbox-label">
                <input type="checkbox" name="confirm_deactivate" />
                Confirm if deactivating this team member
              </label>
            )}
            <p className="fine-print">
              Deactivating preserves historical schedules and time entries. The
              employee signs up with this email; their verified account is
              linked automatically. A deactivated employee loses schedule
              access.
            </p>
          </>
        ) : null}
        {["shift", "time", "note"].includes(kind) && (
          <label>
            Team member
            <select
              name="employee_id"
              required
              defaultValue={
                shiftRecord?.employee_id ||
                ("employeeId" in editor ? editor.employeeId : undefined) ||
                people[0]?.id
              }
            >
              {people.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {(kind === "shift" || kind === "time") && (
          <>
            <div className="form-pair">
              <label>
                Date
                <input
                  type="date"
                  name="date"
                  defaultValue={
                    shiftRecord?.date ||
                    ("date" in editor ? editor.date : date) ||
                    date
                  }
                  required
                />
              </label>
              <label>
                Unpaid break (minutes)
                <input
                  type="number"
                  name="break_minutes"
                  min={0}
                  max={600}
                  step={1}
                  defaultValue={shiftRecord?.break_minutes ?? 30}
                  required
                />
              </label>
            </div>
            <div className="form-pair">
              <label>
                Start time
                <input
                  name="start"
                  type="time"
                  defaultValue={shiftRecord?.start.slice(0, 5) || "09:00"}
                  required
                />
              </label>
              <label>
                End time
                <input
                  name="end"
                  type="time"
                  defaultValue={shiftRecord?.end.slice(0, 5) || "17:30"}
                  required
                />
              </label>
            </div>
            <p className="fine-print">
              Times use {d.settings.timezone}. An end before the start means
              overnight. Ambiguous daylight-saving times require an unambiguous
              clock time.
            </p>
            {kind === "shift" && (
              <p className="notice">
                <AlertCircle size={16} /> Saved as draft. Publish the date range
                when you’re ready for employees to see it.
              </p>
            )}
            {kind === "time" && (
              <>
                <div className="form-pair">
                  <label>
                    Adjustment (minutes)
                    <input
                      name="adjustment_minutes"
                      type="number"
                      min={-480}
                      max={480}
                      step={1}
                      defaultValue={
                        (record as TimeEntry)?.adjustment_minutes || 0
                      }
                    />
                  </label>
                  <label>
                    Adjustment reason
                    <input
                      name="adjustment_reason"
                      maxLength={500}
                      defaultValue={
                        (record as TimeEntry)?.adjustment_reason || ""
                      }
                    />
                  </label>
                </div>
                <label className="checkbox-label">
                  <input
                    name="approved"
                    type="checkbox"
                    defaultChecked={(record as TimeEntry)?.approved || false}
                  />
                  Approve actual hours for payroll estimates
                </label>
              </>
            )}
          </>
        )}
        {kind === "note" && (
          <>
            <label>
              Note type
              <select name="note_kind">
                {["General", "Call-off", "Late arrival", "Schedule change"].map(
                  (x) => (
                    <option key={x}>{x}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              What happened?
              <textarea
                name="body"
                required
                minLength={3}
                maxLength={3000}
                placeholder="Add a little context for the team…"
              />
            </label>
            <p className="fine-print">
              Visible only to management. Timestamped automatically.
            </p>
          </>
        )}
        {kind === "rate" && (
          <>
            <p className="muted">
              Set an effective-dated rate for{" "}
              {d.employees.find((e) => e.id === editor.employeeId)?.name}.
              Earlier pay rates stay in the history.
            </p>
            <div className="form-pair">
              <label>
                Hourly rate ($)
                <input
                  name="hourly_rate"
                  type="number"
                  min=".01"
                  max="10000"
                  step=".01"
                  required
                />
              </label>
              <label>
                Effective from
                <input
                  name="effective_date"
                  type="date"
                  defaultValue={date}
                  required
                />
              </label>
            </div>
          </>
        )}
        {kind === "publish" && (
          <>
            <label>
              Schedule status
              <select
                value={scheduleStatus}
                onChange={(e) =>
                  setScheduleStatus(e.target.value as typeof scheduleStatus)
                }
              >
                <option value="published">
                  Published · visible to employees
                </option>
                <option value="draft">Draft · still being planned</option>
                <option value="pending">Pending · not yet scheduled</option>
              </select>
            </label>
            <p className="muted">
              Published shifts are visible to employees. Draft and pending dates
              remain hidden. Published dates without a shift are days off.
            </p>
            <div className="form-pair">
              <label>
                From
                <input
                  name="from"
                  type="date"
                  defaultValue={editor.from}
                  required
                />
              </label>
              <label>
                Through
                <input
                  name="to"
                  type="date"
                  defaultValue={editor.to}
                  required
                />
              </label>
            </div>
            <label className="checkbox-label">
              <input type="checkbox" required />
              I’ve reviewed the schedule and want to apply this status to these
              dates.
            </label>
          </>
        )}
        {kind === "duplicate" && (
          <>
            <p className="muted">
              Copy all team shifts from {editor.from} through{" "}
              {addDays(editor.from, 6)}. Existing shifts are kept; overlaps will
              be flagged.
            </p>
            <label>
              Target week starts
              <input
                name="target"
                type="date"
                defaultValue={addDays(editor.from, 7)}
                required
              />
            </label>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {confirm && (
          <p className="form-error">
            Delete this shift permanently? Select “Confirm delete” to continue.
          </p>
        )}
        <div className="modal-actions">
          {kind === "shift" && record && (
            <>
              <button
                type="button"
                className="button danger"
                disabled={busy}
                onClick={deleteShift}
              >
                <Trash2 size={15} />
                {confirm ? "Confirm delete" : "Delete"}
              </button>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={copy}
              >
                <Copy size={15} />
                Copy
              </button>
            </>
          )}
          <span className="flex-spacer" />
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? (
              "Saving…"
            ) : kind === "publish" ? (
              scheduleStatus === "published" ? (
                "Publish schedule"
              ) : (
                "Apply " + scheduleStatus
              )
            ) : kind === "duplicate" ? (
              "Copy week"
            ) : (
              <>
                <Save size={15} />
                Save changes
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
