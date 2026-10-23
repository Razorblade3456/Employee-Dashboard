"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Layers,
  LayoutDashboard,
  CalendarDays,
  Users,
  StickyNote,
  Clock3,
  Wallet,
  Settings,
  ChevronsUpDown,
  ChevronRight,
  ArrowUpRight,
  Plus,
  Search,
  Bell,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  HelpCircle,
  Check,
  Send,
  ArrowRight,
  AlertTriangle,
  CalendarCheck2,
  ShieldCheck,
  Coffee,
} from "lucide-react";
import { useWorkspace } from "@/lib/use-workspace";
import { Role } from "@/lib/types";
import {
  today,
  addDays,
  weekStart,
  labelDate,
  hours,
  timeLabel,
  bounds,
} from "@/lib/time";
import {
  Avatar,
  Badge,
  Metric,
  PanelTitle,
  TextLink,
  Empty,
  Modal,
  n,
} from "./ui";
import Login from "./login";
import Schedule, { conflicts } from "./schedule";
import EditorDialog, { Editor } from "./editor";
import { Team, Notes, Timesheets, Payroll } from "./data-views";
import SettingsView from "./settings";
type Tab =
  | "overview"
  | "schedule"
  | "team"
  | "notes"
  | "timesheets"
  | "payroll"
  | "settings";
const titles: Record<Tab, string> = {
  overview: "Overview",
  schedule: "Schedule",
  team: "People",
  notes: "Team notes",
  timesheets: "Timesheets",
  payroll: "Payroll",
  settings: "Settings",
};
const nav = [
  {
    id: "overview" as Tab,
    label: "Overview",
    icon: LayoutDashboard,
    roles: ["employee", "manager", "accountant"],
  },
  {
    id: "schedule" as Tab,
    label: "Schedule",
    icon: CalendarDays,
    roles: ["employee", "manager"],
  },
  { id: "team" as Tab, label: "People", icon: Users, roles: ["manager"] },
  {
    id: "notes" as Tab,
    label: "Team notes",
    icon: StickyNote,
    roles: ["manager"],
  },
  {
    id: "timesheets" as Tab,
    label: "Timesheets",
    icon: Clock3,
    roles: ["manager", "accountant"],
  },
  {
    id: "payroll" as Tab,
    label: "Payroll",
    icon: Wallet,
    roles: ["accountant"],
  },
];
export default function Workspace() {
  const store = useWorkspace(),
    [tab, setTab] = useState<Tab>("overview"),
    [dark, setDark] = useState(false),
    [editor, setEditor] = useState<Editor | null>(null),
    [mobile, setMobile] = useState(false),
    [roleMenu, setRoleMenu] = useState(false),
    [overlay, setOverlay] = useState<"search" | "activity" | "help" | null>(
      null,
    ),
    [query, setQuery] = useState("");
  useEffect(() => {
    setDark(localStorage.getItem("gather-theme") === "dark");
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  function toggle() {
    setDark((v) => {
      localStorage.setItem("gather-theme", !v ? "dark" : "light");
      return !v;
    });
  }
  useEffect(() => {
    setTab("overview");
    setEditor(null);
    setRoleMenu(false);
  }, [store.role]);
  const closeEditor = useCallback(() => setEditor(null), []);
  function navigate(t: Tab) {
    setTab(t);
    setMobile(false);
    setOverlay(null);
  }
  if (store.loading)
    return (
      <div className="loading-screen">
        <span className="brand-mark">
          <Layers size={24} />
        </span>
        <p>Getting your workspace ready…</p>
      </div>
    );
  if (!store.role || !store.data)
    return (
      <>
        <Login store={store} dark={dark} toggle={toggle} />
        {store.error && (
          <div className="toast error" role="alert">
            {store.error}
          </div>
        )}
      </>
    );
  const d = store.data,
    role = store.role,
    employee = role === "employee",
    accountant = role === "accountant",
    date = today(d.settings.timezone),
    own = d.employees.find((e) => e.id === store.employeeId),
    name = employee
      ? own?.name || "Your workspace"
      : store.live
        ? store.accountName
        : accountant
          ? "Jordan Lee"
          : "Taylor Brooks",
    roleName = role[0].toUpperCase() + role.slice(1),
    allowed = nav.filter((n) => n.roles.includes(role));
  const upcoming = d.shifts
    .filter(
      (s) =>
        s.date >= date &&
        bounds(s.date, s.start, s.end, d.settings.timezone).start >=
          Date.now() &&
        (!employee ||
          (s.employee_id === store.employeeId &&
            s.status === "published" &&
            d.schedule_days.some(
              (x) => x.date === s.date && x.status === "published",
            ))),
    )
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const conflictIds =
    role === "manager" ? conflicts(d.shifts, d.settings.timezone) : new Set();
  const pending = d.schedule_days.filter(
    (s) => s.status !== "published",
  ).length;
  return (
    <div className={"app " + (mobile ? "mobile-open" : "")}>
      <a className="skip-link" href="#workspace-main">
        Skip to workspace
      </a>
      {mobile && (
        <button
          className="sidebar-scrim"
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
        />
      )}
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-mark">
            <Layers size={21} />
          </span>
          gather<span className="brand-dot">.</span>
        </a>
        <button
          className="workspace-switch"
          onClick={() => {
            if (!store.live) setRoleMenu(!roleMenu);
            else setOverlay("help");
          }}
          aria-expanded={roleMenu}
        >
          <span className="workspace-symbol">g.</span>
          <span>
            <strong>{d.settings.name}</strong>
            <small>{roleName} workspace</small>
          </span>
          <ChevronsUpDown size={15} />
        </button>
        {roleMenu && (
          <div className="role-menu">
            <small>DEMO PERSPECTIVE</small>
            {(["manager", "employee", "accountant"] as Role[]).map((r) => (
              <button key={r} onClick={() => store.chooseRole(r)}>
                {r[0].toUpperCase() + r.slice(1)}
                {role === r && <Check size={14} />}
              </button>
            ))}
          </div>
        )}
        <span className="nav-label">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {allowed.map((item) => (
            <button
              key={item.id}
              className={"nav-item " + (tab === item.id ? "selected" : "")}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              {item.label}
              {item.id === "notes" && d.notes.length > 0 && (
                <span className="nav-count">{d.notes.length}</span>
              )}
              {item.id === "schedule" && role === "manager" && pending > 0 && (
                <span className="nav-indicator" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-stars">✧</span>
            <strong>A little more in sync.</strong>
            <p>
              {employee
                ? "Your workday, all in one place."
                : "Great teams start with a little clarity."}
            </p>
            <button onClick={() => setOverlay("help")}>
              Meet your workspace <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className={"nav-item " + (tab === "settings" ? "selected" : "")}
            onClick={() => navigate("settings")}
          >
            <Settings size={18} />
            Settings
          </button>
          <button className="nav-item" onClick={() => setOverlay("help")}>
            <HelpCircle size={18} />
            Help & getting started
          </button>
          <div className="sidebar-user">
            <Avatar name={name} />
            <span>
              <strong>{name}</strong>
              <small>{roleName}</small>
            </span>
            <button
              className="icon-button"
              onClick={() => void store.signOut()}
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            onClick={() => setMobile(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{titles[tab]}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="quick-search"
              onClick={() => setOverlay("search")}
            >
              <Search size={16} />
              <span>Jump to…</span>
              <kbd>⌕</kbd>
            </button>
            <span className={"connection " + (store.live ? "" : "demo")}>
              <i />
              {store.live ? "Connected" : "Local demo"}
            </span>
            <button
              className="icon-button"
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={toggle}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="icon-button notification-button"
              aria-label="View workspace activity"
              onClick={() => setOverlay("activity")}
            >
              <Bell size={18} />
              {(pending > 0 || d.audit.length > 0) && <i />}
            </button>
            <Avatar name={name} size="small" />
          </div>
        </header>
        <main id="workspace-main" className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {tab === "overview"
                  ? "YOUR DAY, AT A GLANCE"
                  : roleName.toUpperCase() + " WORKSPACE"}
              </span>
              <h1>
                {tab === "overview"
                  ? employee
                    ? "Your workday, made clear."
                    : accountant
                      ? "A clearer view of every hour."
                      : "A good day starts here."
                  : tab === "schedule"
                    ? employee
                      ? "Your schedule. Less guesswork."
                      : "A little planning. A lot of possibility."
                    : tab === "team"
                      ? "The people behind the work."
                      : tab === "notes"
                        ? "Nothing slips through the cracks."
                        : tab === "timesheets"
                          ? "Every hour, accounted for."
                          : tab === "payroll"
                            ? "Pay with a little more clarity."
                            : "The way your team works."}
                <span className="heading-spark">
                  {tab === "overview" ? "✧" : ""}
                </span>
              </h1>
              <p>
                {tab === "overview"
                  ? "Welcome back, " +
                    name.split(" ")[0] +
                    ". " +
                    (employee
                      ? "Here’s what’s ahead for you."
                      : accountant
                        ? "Here’s how this pay period is coming together."
                        : "Here’s how your team is coming together.")
                  : "A considered space for " +
                    (tab === "schedule"
                      ? "your team’s time."
                      : tab === "team"
                        ? "every member of your team."
                        : tab === "notes"
                          ? "the context that matters."
                          : tab === "timesheets"
                            ? "actual hours, breaks, and approvals."
                            : tab === "payroll"
                              ? "approved time and estimated gross pay."
                              : "your workspace preferences.")}
              </p>
            </div>
            <div className="page-heading-actions">
              {role === "manager" && ["overview", "schedule"].includes(tab) && (
                <button
                  className="button primary"
                  onClick={() => setEditor({ kind: "shift", date })}
                >
                  <Plus size={16} />
                  Create shift
                </button>
              )}
              {(tab === "overview" || employee) && (
                <span className="today-label">
                  <CalendarDays size={15} />
                  {labelDate(date, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
          </div>
          {!store.live && (
            <div className="demo-banner">
              <span>
                <i className="live-dot" />
                You’re exploring a local demo. Changes stay in this browser.
              </span>
              <button onClick={() => setRoleMenu(!roleMenu)}>
                Switch perspective <ArrowRight size={13} />
              </button>
            </div>
          )}
          {store.error && (
            <div className="notice warning" role="alert">
              <AlertTriangle size={17} />
              {store.error}
              <button
                className="icon-button"
                onClick={() => store.setError("")}
                aria-label="Dismiss error"
              >
                <X size={15} />
              </button>
            </div>
          )}
          {tab === "overview" &&
            (accountant ? (
              <Payroll store={store} edit={setEditor} overview />
            ) : (
              <>
                <Overview
                  store={store}
                  upcoming={upcoming}
                  conflictCount={conflictIds.size}
                  navigate={navigate}
                  edit={setEditor}
                />
                {employee && (
                  <Schedule store={store} edit={setEditor} compact />
                )}
              </>
            ))}
          {tab === "schedule" && <Schedule store={store} edit={setEditor} />}
          {tab === "team" && role === "manager" && (
            <Team store={store} edit={setEditor} />
          )}
          {tab === "notes" && role === "manager" && (
            <Notes store={store} edit={setEditor} />
          )}
          {tab === "timesheets" && role !== "employee" && (
            <Timesheets store={store} edit={setEditor} />
          )}
          {tab === "payroll" && accountant && (
            <Payroll store={store} edit={setEditor} />
          )}
          {tab === "settings" && <SettingsView store={store} />}
          <footer className="workspace-footer">
            <span>
              <Layers size={13} />
              Gather · A better workday.
            </span>
            <span>
              {store.live
                ? "Database permissions enforced"
                : "Sample workspace · browser storage"}
              <i /> {d.settings.timezone.replaceAll("_", " ")}
            </span>
          </footer>
        </main>
      </div>
      {editor && (
        <EditorDialog
          key={JSON.stringify(editor)}
          editor={editor}
          store={store}
          close={closeEditor}
        />
      )}
      {overlay && (
        <Modal
          title={
            overlay === "search"
              ? "Find your way"
              : overlay === "activity"
                ? "Workspace activity"
                : "Welcome to Gather"
          }
          onClose={() => setOverlay(null)}
        >
          {overlay === "search" ? (
            <>
              <label className="search-field command-search">
                <Search size={18} />
                <input
                  autoFocus
                  placeholder="Find a page or team member…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search workspace"
                />
              </label>
              <div className="command-list">
                {[
                  ...allowed,
                  { id: "settings" as Tab, label: "Settings", icon: Settings },
                ]
                  .filter((x) =>
                    x.label.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((x) => (
                    <button key={x.id} onClick={() => navigate(x.id)}>
                      <x.icon size={18} />
                      {x.label}
                      <ArrowRight size={15} />
                    </button>
                  ))}
                {role !== "employee" &&
                  query &&
                  d.employees
                    .filter((e) =>
                      e.name.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((e) => (
                      <button
                        key={e.id}
                        onClick={() => {
                          setOverlay(null);
                          setEditor(
                            role === "manager"
                              ? { kind: "employee", record: e }
                              : { kind: "rate", employeeId: e.id },
                          );
                        }}
                      >
                        <Avatar name={e.name} color={e.color} />
                        {e.name}
                        <PencilIcon />
                      </button>
                    ))}
              </div>
            </>
          ) : overlay === "activity" ? (
            <div className="activity-modal">
              {role === "manager" && (
                <p className="notice">
                  <CalendarDays size={17} />
                  {pending} schedule dates are waiting to be published.
                </p>
              )}
              {employee ? (
                <p className="notice">
                  Your schedule refreshes automatically when published changes
                  arrive. Unpublished dates remain pending.
                </p>
              ) : d.audit.length ? (
                d.audit.slice(0, 12).map((a) => (
                  <div className="activity-item" key={a.id}>
                    <span className="live-dot" />
                    <span>
                      <strong>
                        {a.action} · {a.entity.replaceAll("_", " ")}
                      </strong>
                      <small>
                        {new Date(a.created_at).toLocaleString("en-US", {
                          timeZone: d.settings.timezone,
                        })}
                      </small>
                    </span>
                  </div>
                ))
              ) : (
                <Empty
                  title="A fresh start"
                  body="Changes to schedules and payroll will be recorded here."
                />
              )}
            </div>
          ) : (
            <div className="help-content">
              <span className="section-icon">
                <Layers size={26} />
              </span>
              <h3>A calmer place to bring work together.</h3>
              <p>
                Managers plan and publish schedules, keep team records, and
                review actual time. Employees see only their published schedule.
                Accountants manage pay rates and estimate gross pay from
                approved actual hours.
              </p>
              <div className="notice">
                {store.live
                  ? "Your Supabase connection is active. Role access is enforced by database policies."
                  : "This is a local demo with fictional sample data. The role switcher is for exploring; it is not an authentication boundary."}
              </div>
              <p>
                To connect real accounts and persistent storage, follow the
                project README and run the Supabase migration. The initial role
                setup requires a verified account, a private server secret, and
                the role setup code.
              </p>
              <p className="fine-print">
                Payroll totals are estimates before tax and deductions.
                Configure company policy before use. Demo data remains on the
                exact browser and origin you are using.
              </p>
              <button
                className="button primary"
                onClick={() => navigate("settings")}
              >
                Open settings <ArrowRight size={15} />
              </button>
            </div>
          )}
        </Modal>
      )}
      {store.message && (
        <div className="toast" role="status">
          <span>
            <Check size={16} />
          </span>
          {store.message}
        </div>
      )}
    </div>
  );
}
function PencilIcon() {
  return <ArrowUpRight size={15} />;
}
function Overview({
  store,
  upcoming,
  conflictCount,
  navigate,
  edit,
}: {
  store: ReturnType<typeof useWorkspace>;
  upcoming: import("@/lib/types").Shift[];
  conflictCount: number;
  navigate: (t: Tab) => void;
  edit: (e: Editor) => void;
}) {
  const d = store.data!,
    employee = store.role === "employee",
    date = today(d.settings.timezone),
    start = weekStart(date),
    end = addDays(start, 6);
  const all = employee
    ? d.shifts.filter(
        (s) =>
          s.employee_id === store.employeeId &&
          s.status === "published" &&
          d.schedule_days.some(
            (day) => day.date === s.date && day.status === "published",
          ),
      )
    : d.shifts;
  const week = all.filter((s) => s.date >= start && s.date <= end),
    total = week.reduce(
      (sum, s) =>
        sum +
        hours(s.date, s.start, s.end, s.break_minutes, d.settings.timezone),
      0,
    ),
    now = Date.now(),
    working = new Set(
      d.shifts
        .filter((s) => {
          try {
            const b = bounds(s.date, s.start, s.end, d.settings.timezone);
            return b.start <= now && b.end > now;
          } catch {
            return false;
          }
        })
        .map((s) => s.employee_id),
    );
  const todayShifts = all.filter((s) => s.date === date),
    active = d.employees.filter((e) => e.active).length,
    pending = d.schedule_days.filter((s) => s.status !== "published").length;
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i)),
    daily = days.map((day) =>
      week
        .filter((s) => s.date === day)
        .reduce(
          (sum, s) =>
            sum +
            hours(s.date, s.start, s.end, s.break_minutes, d.settings.timezone),
          0,
        ),
    );
  const next = upcoming[0];
  const publishedOff = d.schedule_days.filter(
    (day) =>
      day.status === "published" &&
      day.date >= start &&
      day.date <= end &&
      !all.some((s) => s.date === day.date),
  ).length;
  return (
    <>
      <div className="metrics-grid">
        {employee ? (
          <>
            <Metric
              label="Next shift"
              value={next ? labelDate(next.date) : "Stay tuned"}
              detail={
                next
                  ? timeLabel(next.start) + " – " + timeLabel(next.end)
                  : "New dates are being planned"
              }
              icon={<CalendarDays size={18} />}
              accent
            />
            <Metric
              label="Hours this week"
              value={
                <>
                  {n(total)}
                  <em>hrs</em>
                </>
              }
              detail={week.length + " published shifts"}
              icon={<Clock3 size={18} />}
            />
            <Metric
              label="Days off this week"
              value={publishedOff}
              detail="Confirmed published days off"
              icon={<Coffee size={18} />}
            />
            <Metric
              label="Month at a glance"
              value={
                n(
                  all
                    .filter((s) => s.date.slice(0, 7) === date.slice(0, 7))
                    .reduce(
                      (sum, s) =>
                        sum +
                        hours(
                          s.date,
                          s.start,
                          s.end,
                          s.break_minutes,
                          d.settings.timezone,
                        ),
                      0,
                    ),
                ) + "h"
              }
              detail="Published scheduled hours"
              icon={<CalendarCheck2 size={18} />}
            />
          </>
        ) : (
          <>
            <Metric
              label="Scheduled today"
              value={
                <>
                  {new Set(todayShifts.map((s) => s.employee_id)).size}
                  <em>/ {active}</em>
                </>
              }
              detail={working.size + " team members currently on shift"}
              icon={<Users size={18} />}
              accent
            />
            <Metric
              label="Hours this week"
              value={
                <>
                  {n(total)}
                  <em>hrs</em>
                </>
              }
              detail={week.length + " shifts across your team"}
              icon={<Clock3 size={18} />}
            />
            <Metric
              label="Awaiting publication"
              value={
                <>
                  {pending}
                  <em>dates</em>
                </>
              }
              detail="A little planning left to do"
              icon={<CalendarDays size={18} />}
            />
            <Metric
              label="Scheduling conflicts"
              value={conflictCount}
              detail={
                conflictCount
                  ? "Overlapping shifts need a look"
                  : "Looking good. No overlaps."
              }
              icon={<AlertTriangle size={18} />}
            />
          </>
        )}
      </div>
      <div className="overview-grid">
        <section className="panel hours-panel">
          <PanelTitle
            title={
              employee ? "Your week, in balance" : "The rhythm of your week"
            }
            description={labelDate(start) + " – " + labelDate(end)}
            action={<Badge tone="purple">Scheduled hours</Badge>}
          />
          <div className="chart-summary">
            <strong>
              {n(total)}
              <small> hrs</small>
            </strong>
            <span>
              {employee
                ? "A little room for work. A little room for life."
                : "A clear picture of the days ahead."}
            </span>
          </div>
          <div className="weekly-chart">
            <div className="chart-y">
              <span>{Math.ceil(Math.max(...daily, 8))}h</span>
              <span>{Math.ceil(Math.max(...daily, 8) / 2)}h</span>
              <span>0h</span>
            </div>
            <div className="chart-bars">
              {days.map((day, i) => (
                <div
                  className={"chart-column " + (day === date ? "current" : "")}
                  key={day}
                >
                  <div className="chart-track">
                    <i
                      style={{
                        height:
                          Math.max(
                            2,
                            (daily[i] / Math.max(...daily, 8)) * 100,
                          ) + "%",
                      }}
                      title={n(daily[i]) + " scheduled hours"}
                    >
                      <span>{n(daily[i])}h</span>
                    </i>
                  </div>
                  <span>{labelDate(day, { weekday: "short" })}</span>
                  <small>{Number(day.slice(-2))}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-footer">
            <span>
              <i className="legend-dot purple" />
              Scheduled hours
            </span>
            <TextLink onClick={() => navigate("schedule")}>
              Explore schedule
            </TextLink>
          </div>
        </section>
        <section className="panel upcoming-panel">
          <PanelTitle
            title="Coming up next"
            description={
              employee
                ? "Your next published shifts"
                : "A little heads-up for the team"
            }
            action={
              <span className="section-icon small">
                <CalendarDays size={17} />
              </span>
            }
          />
          <div className="upcoming-list">
            {upcoming.slice(0, 4).map((s) => {
              const p = d.employees.find((p) => p.id === s.employee_id);
              return (
                <button
                  key={s.id}
                  onClick={() =>
                    employee
                      ? navigate("schedule")
                      : edit({ kind: "shift", record: s })
                  }
                >
                  <span className="upcoming-date">
                    <small>
                      {labelDate(s.date, { month: "short" }).toUpperCase()}
                    </small>
                    <strong>{Number(s.date.slice(-2))}</strong>
                  </span>
                  <span className="upcoming-info">
                    <strong>
                      {employee ? "Your scheduled shift" : p?.name}
                    </strong>
                    <small>
                      {timeLabel(s.start)} – {timeLabel(s.end)} ·{" "}
                      {p?.department}
                    </small>
                  </span>
                  <span className={"tiny-status " + s.status} />
                </button>
              );
            })}
            {!upcoming.length && (
              <Empty
                title="You’re all caught up"
                body="New published shifts will appear here."
              />
            )}
          </div>
          <TextLink onClick={() => navigate("schedule")}>
            View full schedule
          </TextLink>
        </section>
      </div>
      {!employee && (
        <div className="two-column">
          <section className="panel">
            <PanelTitle
              title="Your team, in motion"
              description={
                working.size
                  ? "On shift right now"
                  : "Scheduled today · " + labelDate(date)
              }
              action={
                <TextLink onClick={() => navigate("team")}>All people</TextLink>
              }
            />
            <div className="on-shift-list">
              {d.employees
                .filter((e) =>
                  working.size
                    ? working.has(e.id)
                    : todayShifts.some((s) => s.employee_id === e.id),
                )
                .slice(0, 4)
                .map((p) => (
                  <div key={p.id}>
                    <Avatar name={p.name} color={p.color} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {p.title} · {p.department}
                      </small>
                    </span>
                    <Badge tone={working.has(p.id) ? "green" : "purple"}>
                      {working.has(p.id) ? "On shift" : "Scheduled"}
                    </Badge>
                  </div>
                ))}
            </div>
            {!todayShifts.length && !working.size && (
              <Empty
                title="A quiet day on the calendar"
                body="Create a shift when you’re ready to plan."
              />
            )}
          </section>
          <section className="panel notes-preview">
            <PanelTitle
              title="A note for the next person"
              description="Recent management updates"
              action={
                <TextLink onClick={() => navigate("notes")}>All notes</TextLink>
              }
            />
            {d.notes
              .slice()
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 2)
              .map((note) => (
                <div className="note-preview" key={note.id}>
                  <span className="note-dot" />
                  <div>
                    <strong>
                      {note.kind}
                      <small>
                        {
                          d.employees.find((e) => e.id === note.employee_id)
                            ?.name
                        }
                      </small>
                    </strong>
                    <p>{note.body}</p>
                  </div>
                </div>
              ))}
            {!d.notes.length && (
              <Empty
                title="Nothing to catch up on"
                body="Keep the next manager in the loop with a note."
              />
            )}
          </section>
        </div>
      )}
    </>
  );
}
