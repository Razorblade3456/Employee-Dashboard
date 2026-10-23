"use client";
import { useMemo, useState } from "react";
import {
  Search,
  Plus,
  ArrowUpRight,
  Download,
  Check,
  Clock3,
  FileText,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { WorkspaceStore } from "@/lib/use-workspace";
import { Editor } from "./editor";
import { Avatar, Badge, Empty, PanelTitle, Metric, money, n } from "./ui";
import {
  today,
  weekStart,
  addDays,
  addMonths,
  labelDate,
  timeLabel,
  hours,
} from "@/lib/time";
import { calculatePayroll, exportCsv } from "@/lib/payroll";
export function Team({
  store,
  edit,
}: {
  store: WorkspaceStore;
  edit: (e: Editor) => void;
}) {
  const [search, setSearch] = useState(""),
    [department, setDepartment] = useState("all"),
    [status, setStatus] = useState("active");
  const d = store.data!;
  const employees = d.employees.filter(
    (p) =>
      (p.name + " " + p.email).toLowerCase().includes(search.toLowerCase()) &&
      (department === "all" || p.department === department) &&
      (status === "all" || p.active === (status === "active")),
  );
  return (
    <section className="panel">
      <PanelTitle
        title="Good people. One team."
        description={
          d.employees.filter((p) => p.active).length +
          " active team members across " +
          new Set(d.employees.map((p) => p.department)).size +
          " departments"
        }
        action={
          <button
            className="button primary"
            onClick={() => edit({ kind: "employee" })}
          >
            <Plus size={16} />
            Add team member
          </button>
        }
      />
      <div className="table-filters">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Search employees"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="all">All departments</option>
          {[...new Set(d.employees.map((e) => e.department))].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="Employee status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="active">Active members</option>
          <option value="inactive">Inactive members</option>
          <option value="all">All members</option>
        </select>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>TEAM MEMBER</th>
              <th>DEPARTMENT</th>
              <th>ROLE</th>
              <th>STATUS</th>
              {store.live && d.pay_rates.length > 0 && <th>RATE / HR</th>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {employees.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="person-cell">
                    <Avatar name={p.name} color={p.color} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>{p.email}</small>
                    </span>
                  </div>
                </td>
                <td>{p.department}</td>
                <td>{p.title}</td>
                <td>
                  <Badge tone={p.active ? "green" : "neutral"}>
                    {p.active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                {store.live && d.pay_rates.length > 0 && (
                  <td>
                    {(() => {
                      const rate = d.pay_rates
                        .filter(
                          (r) =>
                            r.employee_id === p.id &&
                            r.effective_date <= today(d.settings.timezone),
                        )
                        .sort((a, b) =>
                          b.effective_date.localeCompare(a.effective_date),
                        )[0];
                      return rate ? money(rate.hourly_rate) : "—";
                    })()}
                  </td>
                )}
                <td>
                  <button
                    className="icon-button"
                    aria-label={"Edit " + p.name}
                    onClick={() => edit({ kind: "employee", record: p })}
                  >
                    <Pencil size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!employees.length && (
        <Empty
          title="No team members found"
          body="Try another search or add your first team member."
        />
      )}
      <div className="table-footer">
        {employees.length} team members · Historical records stay with your
        workspace.
      </div>
    </section>
  );
}
export function Notes({
  store,
  edit,
}: {
  store: WorkspaceStore;
  edit: (e: Editor) => void;
}) {
  const [person, setPerson] = useState("all"),
    [kind, setKind] = useState("all");
  const d = store.data!,
    notes = d.notes
      .filter(
        (x) =>
          (person === "all" || x.employee_id === person) &&
          (kind === "all" || x.kind === kind),
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <>
      <section className="panel">
        <PanelTitle
          title="The details that keep things moving."
          description="Private operational notes, shared only with management."
          action={
            <button
              className="button primary"
              onClick={() => edit({ kind: "note" })}
            >
              <Plus size={16} />
              New note
            </button>
          }
        />
        <div className="table-filters">
          <select
            aria-label="Filter notes by employee"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          >
            <option value="all">All team members</option>
            {d.employees.map((e) => (
              <option value={e.id} key={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter note type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">All note types</option>
            {["Call-off", "Late arrival", "Schedule change", "General"].map(
              (x) => (
                <option key={x}>{x}</option>
              ),
            )}
          </select>
          <Badge>
            <ShieldCheck size={12} />
            Management only
          </Badge>
        </div>
        <div className="notes-grid">
          {notes.map((note) => {
            const p = d.employees.find((x) => x.id === note.employee_id);
            return (
              <article className="note-card" key={note.id}>
                <div className="note-heading">
                  <Avatar
                    name={p?.name || "Former employee"}
                    color={p?.color}
                  />
                  <div>
                    <strong>{p?.name || "Former employee"}</strong>
                    <small>
                      {new Date(note.created_at).toLocaleString("en-US", {
                        timeZone: d.settings.timezone,
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </small>
                  </div>
                  <Badge
                    tone={
                      note.kind === "Call-off"
                        ? "red"
                        : note.kind === "Late arrival"
                          ? "amber"
                          : "purple"
                    }
                  >
                    {note.kind}
                  </Badge>
                </div>
                <p>{note.body}</p>
              </article>
            );
          })}
        </div>
        {!notes.length && (
          <Empty
            title="A fresh page"
            body="Add a call-off, schedule change, or anything the next manager should know."
          />
        )}
      </section>
    </>
  );
}
export function Timesheets({
  store,
  edit,
}: {
  store: WorkspaceStore;
  edit: (e: Editor) => void;
}) {
  const d = store.data!,
    [person, setPerson] = useState("all"),
    [approval, setApproval] = useState("all"),
    [from, setFrom] = useState(weekStart(today(d.settings.timezone))),
    [to, setTo] = useState(addDays(weekStart(today(d.settings.timezone)), 6)),
    [error, setError] = useState("");
  const entries = d.time_entries
    .filter(
      (e) =>
        (person === "all" || e.employee_id === person) &&
        (approval === "all" || e.approved === (approval === "approved")) &&
        e.date >= from &&
        e.date <= to,
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = entries.reduce(
    (sum, e) =>
      sum +
      hours(e.date, e.start, e.end, e.break_minutes, d.settings.timezone) +
      e.adjustment_minutes / 60,
    0,
  );
  async function approve(id: string) {
    const e = d.time_entries.find((e) => e.id === id)!;
    try {
      await store.save("time_entries", { ...e, approved: !e.approved });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="panel">
      <PanelTitle
        title="Actual hours. A clear record."
        description="Clock times are entered by authorized staff. Only approved entries contribute to pay."
        action={
          <button
            className="button primary"
            onClick={() => edit({ kind: "time" })}
          >
            <Plus size={16} />
            Add time entry
          </button>
        }
      />
      <div className="table-filters">
        <select
          aria-label="Timesheet employee"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
        >
          <option value="all">All team members</option>
          {d.employees.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Approval status"
          value={approval}
          onChange={(e) => setApproval(e.target.value)}
        >
          <option value="all">All entries</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending review</option>
        </select>
        <label className="inline-field">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="inline-field">
          To
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      {from > to && (
        <p className="form-error">Choose an end date after the start date.</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>TEAM MEMBER</th>
              <th>DATE</th>
              <th>CLOCK IN / OUT</th>
              <th>BREAK</th>
              <th>ACTUAL HOURS</th>
              <th>STATUS</th>
              <th>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const p = d.employees.find((p) => p.id === e.employee_id);
              return (
                <tr key={e.id}>
                  <td>
                    <div className="person-cell">
                      <Avatar name={p?.name || "?"} color={p?.color} />
                      <strong>{p?.name}</strong>
                    </div>
                  </td>
                  <td>{labelDate(e.date)}</td>
                  <td>
                    {timeLabel(e.start)} — {timeLabel(e.end)}
                    {e.end <= e.start && <small> (+1 day)</small>}
                  </td>
                  <td>{e.break_minutes}m</td>
                  <td>
                    <strong>
                      {n(
                        hours(
                          e.date,
                          e.start,
                          e.end,
                          e.break_minutes,
                          d.settings.timezone,
                        ) +
                          e.adjustment_minutes / 60,
                      )}
                      h
                    </strong>
                    {e.adjustment_minutes !== 0 && (
                      <small className="adjustment" title={e.adjustment_reason}>
                        {e.adjustment_minutes > 0 ? "+" : ""}
                        {e.adjustment_minutes}m adjusted
                      </small>
                    )}
                  </td>
                  <td>
                    <Badge tone={e.approved ? "green" : "amber"}>
                      {e.approved ? "Approved" : "In review"}
                    </Badge>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="icon-button"
                        onClick={() => edit({ kind: "time", record: e })}
                        aria-label={
                          "Edit time entry for " + p?.name + " " + e.date
                        }
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="button small"
                        onClick={() => void approve(e.id)}
                      >
                        {e.approved ? (
                          "Reopen"
                        ) : (
                          <>
                            <Check size={14} />
                            Approve
                          </>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!entries.length && (
        <Empty
          title="No time entries in this window"
          body="Choose another period or enter actual clock times."
        />
      )}
      <div className="table-footer">
        <span>{entries.length} entries</span>
        <strong>{n(total)} actual hours in view</strong>
      </div>
    </section>
  );
}
export function Payroll({
  store,
  edit,
  overview = false,
}: {
  store: WorkspaceStore;
  edit: (e: Editor) => void;
  overview?: boolean;
}) {
  const d = store.data!,
    current = today(d.settings.timezone),
    [from, setFrom] = useState(weekStart(current)),
    [to, setTo] = useState(addDays(weekStart(current), 6)),
    [person, setPerson] = useState("all"),
    [department, setDepartment] = useState("all"),
    [period, setPeriod] = useState("week");
  const rows = useMemo(
    () =>
      calculatePayroll(
        d.time_entries,
        d.pay_rates,
        d.rules,
        d.settings.timezone,
        from,
        to,
      ),
    [d, from, to],
  );
  const people = d.employees.filter(
    (e) =>
      (e.active || rows.some((r) => r.employee_id === e.id)) &&
      (person === "all" || person === e.id) &&
      (department === "all" || e.department === department),
  );
  const shown = rows.filter((r) => people.some((e) => e.id === r.employee_id));
  const total = shown.reduce(
    (a, r) => ({
      regular: a.regular + r.regular,
      ot: a.ot + r.overtime + r.double,
      gross: a.gross + r.gross,
      otPay: a.otPay + r.overtimePay,
      pending: a.pending + r.pending,
    }),
    { regular: 0, ot: 0, gross: 0, otPay: 0, pending: 0 },
  );
  function preset(v: string) {
    setPeriod(v);
    if (v === "week") {
      setFrom(weekStart(current));
      setTo(addDays(weekStart(current), 6));
    }
    if (v === "biweekly") {
      setFrom(addDays(weekStart(current), -7));
      setTo(addDays(weekStart(current), 6));
    }
    if (v === "month") {
      const first = current.slice(0, 8) + "01";
      setFrom(first);
      setTo(addDays(addMonths(first, 1), -1));
    }
  }
  const [exporting, setExporting] = useState(false);
  async function downloadWorkbook() {
    setExporting(true);
    try {
      const { downloadExcel } = await import("@/lib/excel-export");
      await downloadExcel(d, store.role!, {
        from,
        to,
        employeeIds: people.map((p) => p.id),
      });
      store.notify("Excel workbook downloaded");
    } catch (e) {
      store.setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  function download() {
    const header = [
      "Employee",
      "Department",
      "From",
      "To",
      "Regular hours",
      "Overtime hours",
      "Double-time hours",
      "Regular pay",
      "Premium pay",
      "Estimated gross USD",
      "Unapproved hours",
      "Missing rate",
    ];
    exportCsv("gather-payroll-" + from + "-to-" + to + ".csv", [
      header,
      ...people.map((p) => {
        const r = rows.find((r) => r.employee_id === p.id);
        return [
          p.name,
          p.department,
          from,
          to,
          r?.regular.toFixed(2) || 0,
          r?.overtime.toFixed(2) || 0,
          r?.double.toFixed(2) || 0,
          r?.regularPay.toFixed(2) || 0,
          r?.overtimePay.toFixed(2) || 0,
          r?.gross.toFixed(2) || 0,
          r?.pending.toFixed(2) || 0,
          r?.missingRate ? "YES" : "No",
        ];
      }),
    ]);
  }
  return (
    <>
      <div className="metrics-grid">
        <Metric
          label="Estimated gross pay"
          value={money(total.gross)}
          detail="Approved actual hours only"
          icon={<span>$</span>}
          accent
        />
        <Metric
          label="Regular hours"
          value={
            <>
              {n(total.regular)}
              <em>hrs</em>
            </>
          }
          detail="Within configured thresholds"
          icon={<Clock3 size={18} />}
        />
        <Metric
          label="Premium hours"
          value={
            <>
              {n(total.ot)}
              <em>hrs</em>
            </>
          }
          detail="Overtime + double time"
          icon={<ArrowUpRight size={18} />}
        />
        <Metric
          label="Overtime expense"
          value={money(total.otPay)}
          detail={n(total.pending) + " hours awaiting approval"}
          icon={<FileText size={18} />}
        />
      </div>
      <section className="panel">
        <PanelTitle
          title="Payroll, with perspective."
          description="Estimates before taxes and deductions. Missing rates must be resolved before relying on totals."
          action={
            <div className="export-actions">
              <button
                className="button primary"
                onClick={() => void downloadWorkbook()}
                disabled={exporting}
              >
                <Download size={16} />
                {exporting ? "Preparing…" : "Export Excel"}
              </button>
              <button className="button" onClick={download}>
                <Download size={16} />
                CSV
              </button>
            </div>
          }
        />
        <div className="table-filters">
          <select
            aria-label="Pay period"
            value={period}
            onChange={(e) => preset(e.target.value)}
          >
            <option value="week">This week</option>
            <option value="biweekly">Two-week period</option>
            <option value="month">This month</option>
            <option value="custom">Custom dates</option>
          </select>
          <label className="inline-field">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPeriod("custom");
              }}
            />
          </label>
          <label className="inline-field">
            To
            <input
              type="date"
              min={from}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPeriod("custom");
              }}
            />
          </label>
          <select
            aria-label="Payroll employee"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          >
            <option value="all">All employees</option>
            {d.employees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Payroll department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="all">All departments</option>
            {[...new Set(d.employees.map((e) => e.department))].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        {from > to && (
          <p className="form-error">End date must follow start date.</p>
        )}
        {shown.some((r) => r.missingRate) && (
          <p className="notice warning">
            <AlertTriangle size={16} />
            One or more approved entries have no effective pay rate. Their pay
            is excluded from totals.
          </p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>TEAM MEMBER</th>
                <th>RATE / HR</th>
                <th>REGULAR</th>
                <th>OVERTIME</th>
                <th>DOUBLE TIME</th>
                <th>EST. GROSS</th>
                <th>REVIEW</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => {
                const r = rows.find((r) => r.employee_id === p.id),
                  rate = d.pay_rates
                    .filter(
                      (r) => r.employee_id === p.id && r.effective_date <= to,
                    )
                    .sort((a, b) =>
                      b.effective_date.localeCompare(a.effective_date),
                    )[0];
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="person-cell">
                        <Avatar name={p.name} color={p.color} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>{p.department}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      {rate ? (
                        money(rate.hourly_rate)
                      ) : (
                        <Badge tone="amber">Set rate</Badge>
                      )}
                    </td>
                    <td>{n(r?.regular || 0)}h</td>
                    <td>{n(r?.overtime || 0)}h</td>
                    <td>{n(r?.double || 0)}h</td>
                    <td>
                      <strong>{money(r?.gross || 0)}</strong>
                      {r?.missingRate && (
                        <small className="form-error">Incomplete</small>
                      )}
                    </td>
                    <td>
                      <Badge tone={r?.pending ? "amber" : "green"}>
                        {r?.pending ? n(r.pending) + "h pending" : "Reviewed"}
                      </Badge>
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={"Set rate for " + p.name}
                        onClick={() => edit({ kind: "rate", employeeId: p.id })}
                      >
                        <Pencil size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!people.length && (
          <Empty
            title="No matching employees"
            body="Try another department or employee filter."
          />
        )}
        <div className="table-footer">
          <span>
            {people.length} employees · {d.rules.location}
          </span>
          <strong>Estimated gross {money(total.gross)}</strong>
        </div>
      </section>
      {overview && (
        <div className="two-column">
          <section className="panel">
            <PanelTitle
              title="Payroll by employee"
              description="Approved pay estimates for this period"
            />
            <div className="bar-chart">
              {shown
                .sort((a, b) => b.gross - a.gross)
                .slice(0, 6)
                .map((r) => {
                  const p = d.employees.find((p) => p.id === r.employee_id)!;
                  return (
                    <div className="bar-row" key={r.employee_id}>
                      <span>{p.name.split(" ")[0]}</span>
                      <div>
                        <i
                          style={{
                            width:
                              (total.gross
                                ? (r.gross /
                                    Math.max(...shown.map((r) => r.gross))) *
                                  100
                                : 0) + "%",
                            background: p.color,
                          }}
                        />
                      </div>
                      <strong>{money(r.gross)}</strong>
                    </div>
                  );
                })}
            </div>
          </section>
          <section className="panel">
            <PanelTitle
              title="A clear path to review"
              description="Your payroll checklist"
            />
            <div className="checklist">
              <p>
                <span
                  className={
                    "check-circle " + (!total.pending ? "complete" : "")
                  }
                >
                  {!total.pending ? <Check size={15} /> : <Clock3 size={15} />}
                </span>
                <span>
                  <strong>Approve actual hours</strong>
                  <small>{n(total.pending)} hours still in review</small>
                </span>
              </p>
              <p>
                <span className="check-circle complete">
                  <Check size={15} />
                </span>
                <span>
                  <strong>Use effective-dated pay rates</strong>
                  <small>Historical rates remain available</small>
                </span>
              </p>
              <p>
                <span className="check-circle">
                  <ShieldCheck size={15} />
                </span>
                <span>
                  <strong>Review company overtime policy</strong>
                  <small>
                    Configure thresholds and multipliers in Settings
                  </small>
                </span>
              </p>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
