"use client";
import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Copy,
  Send,
  CalendarDays,
  AlertTriangle,
  SlidersHorizontal,
} from "lucide-react";
import { WorkspaceStore } from "@/lib/use-workspace";
import { Shift } from "@/lib/types";
import {
  addDays,
  addMonths,
  calendarDays,
  today,
  weekStart,
  labelDate,
  timeLabel,
  hours,
  bounds,
} from "@/lib/time";
import { Avatar, Badge, n } from "./ui";
import { Editor } from "./editor";
export function conflicts(shifts: Shift[], zone: string) {
  const ids = new Set<string>();
  for (let i = 0; i < shifts.length; i++)
    for (let j = i + 1; j < shifts.length; j++) {
      const a = shifts[i],
        b = shifts[j];
      if (a.employee_id !== b.employee_id) continue;
      try {
        const x = bounds(a.date, a.start, a.end, zone),
          y = bounds(b.date, b.start, b.end, zone);
        if (x.start < y.end && y.start < x.end) {
          ids.add(a.id);
          ids.add(b.id);
        }
      } catch {
        ids.add(a.id);
        ids.add(b.id);
      }
    }
  return ids;
}
export default function Schedule({
  store,
  edit,
  compact = false,
}: {
  store: WorkspaceStore;
  edit: (e: Editor) => void;
  compact?: boolean;
}) {
  const d = store.data!,
    employee = store.role === "employee",
    current = today(d.settings.timezone);
  const [date, setDate] = useState(current),
    [view, setView] = useState<"month" | "week" | "day">(
      employee ? "month" : "week",
    ),
    [person, setPerson] = useState("all"),
    [department, setDepartment] = useState("all"),
    [shiftTime, setShiftTime] = useState("all");
  const start =
    view === "month"
      ? date.slice(0, 8) + "01"
      : view === "week"
        ? weekStart(date)
        : date;
  const end =
    view === "month"
      ? addDays(addMonths(start, 1), -1)
      : view === "week"
        ? addDays(start, 6)
        : start;
  const days =
    view === "month"
      ? calendarDays(date)
      : view === "week"
        ? Array.from({ length: 7 }, (_, i) => addDays(start, i))
        : [date];
  const visible = d.shifts.filter(
    (s) =>
      (!employee ||
        (s.employee_id === store.employeeId &&
          s.status === "published" &&
          d.schedule_days.some(
            (x) => x.date === s.date && x.status === "published",
          ))) &&
      (person === "all" || s.employee_id === person) &&
      (department === "all" ||
        d.employees.find((e) => e.id === s.employee_id)?.department ===
          department) &&
      (shiftTime === "all" ||
        (shiftTime === "morning" ? s.start < "12:00" : s.start >= "12:00")),
  );
  const conflictIds = useMemo(
    () => conflicts(d.shifts, d.settings.timezone),
    [d.shifts, d.settings.timezone],
  );
  const scoped = visible.filter((s) => s.date >= start && s.date <= end),
    total = scoped.reduce(
      (sum, s) =>
        sum +
        hours(s.date, s.start, s.end, s.break_minutes, d.settings.timezone),
      0,
    );
  const move = (delta: number) =>
    setDate(
      view === "month"
        ? addMonths(date, delta)
        : addDays(date, delta * (view === "week" ? 7 : 1)),
    );
  const members = d.employees.filter(
    (e) =>
      (e.active || scoped.some((s) => s.employee_id === e.id)) &&
      (person === "all" || person === e.id) &&
      (department === "all" || e.department === department),
  );
  async function drop(e: React.DragEvent, day: string, employeeId?: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain"),
      s = d.shifts.find((x) => x.id === id);
    if (!s || employee) return;
    try {
      await store.save("shifts", {
        ...s,
        date: day,
        employee_id: employeeId || s.employee_id,
        status: "draft",
      });
    } catch (e) {
      store.setError((e as Error).message);
    }
  }
  function card(s: Shift) {
    const p = d.employees.find((e) => e.id === s.employee_id);
    return (
      <button
        key={s.id}
        className={
          "shift-card " + s.status + (conflictIds.has(s.id) ? " conflict" : "")
        }
        style={
          { "--shift-color": p?.color || "#7c7cd0" } as React.CSSProperties
        }
        disabled={employee}
        draggable={!employee}
        onDragStart={(e) => e.dataTransfer.setData("text/plain", s.id)}
        onClick={() => {
          if (!employee) edit({ kind: "shift", record: s });
        }}
        aria-label={
          (employee ? "Shift for " : "Edit shift for ") +
          p?.name +
          " on " +
          s.date +
          " " +
          timeLabel(s.start) +
          " to " +
          timeLabel(s.end)
        }
      >
        <span className="shift-name">
          {!employee && p?.name}
          {conflictIds.has(s.id) && <AlertTriangle size={12} />}
        </span>
        <span className="shift-time">
          {timeLabel(s.start)} – {timeLabel(s.end)}
        </span>
        {view !== "month" && (
          <small>
            {n(
              hours(
                s.date,
                s.start,
                s.end,
                s.break_minutes,
                d.settings.timezone,
              ),
            )}
            h · {s.status}
          </small>
        )}
      </button>
    );
  }
  return (
    <section className={"panel schedule-panel " + (compact ? "compact" : "")}>
      <div className="schedule-toolbar">
        <div className="date-nav">
          <button
            className="icon-button"
            onClick={() => move(-1)}
            aria-label="Previous period"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="icon-button"
            onClick={() => move(1)}
            aria-label="Next period"
          >
            <ChevronRight size={17} />
          </button>
          <h2>
            {view === "month"
              ? labelDate(date, { month: "long", year: "numeric" })
              : view === "week"
                ? labelDate(start) +
                  " – " +
                  labelDate(end, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : labelDate(date, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
          </h2>
          <button className="button small" onClick={() => setDate(current)}>
            Today
          </button>
        </div>
        <div className="segmented">
          {(["month", "week", "day"] as const).map((v) => (
            <button
              key={v}
              className={v === view ? "active" : ""}
              onClick={() => setView(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {!employee && (
        <div className="schedule-filters">
          <div className="filter-group">
            <SlidersHorizontal size={16} />
            <select
              aria-label="Filter schedule by employee"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
            >
              <option value="all">All team members</option>
              {d.employees.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter schedule by department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="all">All departments</option>
              {[...new Set(d.employees.map((e) => e.department))].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <select
              aria-label="Filter by shift time"
              value={shiftTime}
              onChange={(e) => setShiftTime(e.target.value)}
            >
              <option value="all">All shift times</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon / night</option>
            </select>
          </div>
          <div className="filter-actions">
            <button
              className="button small"
              onClick={() => edit({ kind: "duplicate", from: weekStart(date) })}
            >
              <Copy size={14} />
              Copy week
            </button>
            <button
              className="button small primary"
              onClick={() => edit({ kind: "publish", from: start, to: end })}
            >
              <Send size={14} />
              Publish
            </button>
          </div>
        </div>
      )}
      <div className="schedule-legend">
        <span>
          <i className="legend-dot purple" /> {scoped.length} shifts
        </span>
        <span>
          <i className="legend-dot green" /> {n(total)} scheduled hours
        </span>
        {!employee && (
          <>
            <span>
              <i className="legend-dot amber" />
              Draft
            </span>
            <span>
              <i className="legend-dot gray" />
              Pending
            </span>
            {conflictIds.size > 0 && (
              <Badge tone="red">{conflictIds.size} conflicting shifts</Badge>
            )}
          </>
        )}
        <span className="timezone">
          {d.settings.timezone.replaceAll("_", " ")}
        </span>
      </div>
      {view === "month" ? (
        <div className="month-calendar">
          <div className="weekdays">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => (
              <span key={x}>{x}</span>
            ))}
          </div>
          <div className="month-grid">
            {days.map((day) => {
              const shifts = visible.filter((s) => s.date === day),
                published = d.schedule_days.some(
                  (s) => s.date === day && s.status === "published",
                ),
                inMonth = day.slice(0, 7) === date.slice(0, 7);
              return (
                <div
                  key={day}
                  className={
                    "month-cell " +
                    (!inMonth ? "outside " : "") +
                    (day === current ? "today " : "")
                  }
                  onDragOver={(e) => {
                    if (!employee) e.preventDefault();
                  }}
                  onDrop={(e) => void drop(e, day)}
                >
                  <div className="day-number">
                    <span>{Number(day.slice(-2))}</span>
                    {!employee && (
                      <button
                        className="day-add"
                        aria-label={"Add shift on " + day}
                        onClick={() => edit({ kind: "shift", date: day })}
                      >
                        <Plus size={13} />
                      </button>
                    )}
                  </div>
                  {employee && !published ? (
                    <div className="pending-label">PENDING</div>
                  ) : shifts.length ? (
                    <>
                      {shifts.slice(0, employee ? 5 : 2).map(card)}
                      {shifts.length > 2 && !employee && (
                        <button
                          className="more-shifts"
                          onClick={() => {
                            setDate(day);
                            setView("day");
                          }}
                        >
                          +{shifts.length - 2} more shifts
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="off-label">
                      {published ? "Day off" : "No shifts"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="week-scroll">
          <div
            className={"week-table " + (view === "day" ? "day-view" : "")}
            style={{ "--days": days.length } as React.CSSProperties}
          >
            <div className="week-corner">TEAM MEMBER</div>
            {days.map((day) => (
              <div
                key={day}
                className={"week-date " + (day === current ? "current" : "")}
              >
                <span>{labelDate(day, { weekday: "short" })}</span>
                <strong>{Number(day.slice(-2))}</strong>
                {!employee &&
                  d.settings.minimum_staff > 0 &&
                  new Set(
                    d.shifts
                      .filter((s) => s.date === day)
                      .map((s) => s.employee_id),
                  ).size < d.settings.minimum_staff && (
                    <small className="understaffed">Low coverage</small>
                  )}
              </div>
            ))}
            {(employee
              ? members.filter((p) => p.id === store.employeeId)
              : members
            ).map((p) => (
              <div className="week-row" key={p.id}>
                <div className="week-person">
                  <Avatar name={p.name} color={p.color} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.department}</small>
                  </span>
                </div>
                {days.map((day) => {
                  const list = visible.filter(
                      (s) => s.date === day && s.employee_id === p.id,
                    ),
                    published = d.schedule_days.some(
                      (s) => s.date === day && s.status === "published",
                    );
                  return (
                    <div
                      key={day}
                      className={
                        "week-cell " + (day === current ? "current" : "")
                      }
                      onDragOver={(e) => {
                        if (!employee) e.preventDefault();
                      }}
                      onDrop={(e) => void drop(e, day, p.id)}
                    >
                      {list.length ? (
                        list.map(card)
                      ) : employee ? (
                        <span className="off-label">
                          {published ? "Day off" : "PENDING"}
                        </span>
                      ) : (
                        <button
                          className="empty-shift"
                          onClick={() =>
                            edit({ kind: "shift", date: day, employeeId: p.id })
                          }
                          aria-label={"Add shift on " + day}
                        >
                          <Plus size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="schedule-footer">
        <span>
          <CalendarDays size={14} />
          {employee
            ? "Published dates without shifts are days off. Unpublished dates are pending."
            : "Drag a shift to move it. Changes stay draft until published."}
        </span>
        <span>
          {labelDate(start)} — {labelDate(end)}
        </span>
      </div>
    </section>
  );
}
