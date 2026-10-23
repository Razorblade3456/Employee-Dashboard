import { Data, Employee, Shift, TimeEntry } from "./types";
import { addDays, today, weekStart } from "./time";
export const demoEmployeeId = "10000000-0000-4000-8000-000000000001";
const eid = (n: number) =>
  "10000000-0000-4000-8000-" + String(n).padStart(12, "0");
export function demoData(): Data {
  const date = today(),
    first = date.slice(0, 8) + "01",
    monday = weekStart(date);
  const people = [
    ["Alex Morgan", "Operations", "Team lead", "#7073d1"],
    ["Olivia Chen", "Design", "Product designer", "#df9968"],
    ["James Wilson", "Operations", "Associate", "#70a08a"],
    ["Sofia Martinez", "Customer success", "Specialist", "#b586bd"],
    ["Noah Williams", "Operations", "Associate", "#749abe"],
    ["Emma Davis", "Design", "Designer", "#c592a0"],
    ["Liam Anderson", "Customer success", "Specialist", "#b5a16c"],
    ["Ava Thompson", "Operations", "Coordinator", "#8798ae"],
  ];
  const employees: Employee[] = people.map(
    ([name, department, title, color], i) => ({
      id: eid(i + 1),
      name,
      email: name.toLowerCase().replace(" ", ".") + "@gather.example",
      department,
      title,
      color,
      active: true,
    }),
  );
  const shifts: Shift[] = [],
    schedule_days: Data["schedule_days"] = [];
  for (let i = 0; i < 28; i++) {
    const d = addDays(first, i),
      status = i < 14 ? "published" : i < 24 ? "draft" : "pending";
    schedule_days.push({ id: crypto.randomUUID(), date: d, status });
    if (status === "pending") continue;
    employees.forEach((e, j) => {
      if ((i + j) % 7 < 5)
        shifts.push({
          id: crypto.randomUUID(),
          employee_id: e.id,
          date: d,
          start: j % 3 === 0 ? "08:00" : j % 3 === 1 ? "09:00" : "10:00",
          end: j % 3 === 0 ? "16:30" : j % 3 === 1 ? "17:30" : "18:30",
          break_minutes: 30,
          status,
        });
    });
  }
  const time_entries: TimeEntry[] = [];
  employees.forEach((e, j) => {
    for (let i = 0; i < 5; i++)
      time_entries.push({
        id: crypto.randomUUID(),
        employee_id: e.id,
        date: addDays(monday, i),
        start: "08:00",
        end: i === 4 && j % 3 === 0 ? "19:00" : "16:30",
        break_minutes: 30,
        adjustment_minutes: 0,
        adjustment_reason: "",
        approved: i < 4,
      });
  });
  return {
    employees,
    shifts,
    schedule_days,
    time_entries,
    pay_rates: employees.map((e, i) => ({
      id: crypto.randomUUID(),
      employee_id: e.id,
      hourly_rate: 22 + i * 2.5,
      effective_date: "2020-01-01",
    })),
    notes: [
      {
        id: crypto.randomUUID(),
        employee_id: eid(2),
        kind: "Schedule change",
        body: "Olivia is covering the morning shift next Tuesday. Coverage confirmed.",
        created_at: new Date().toISOString(),
      },
      {
        id: crypto.randomUUID(),
        employee_id: eid(3),
        kind: "Late arrival",
        body: "Arrived 15 minutes late. Transit delay; team coverage maintained.",
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
    rules: {
      id: "company",
      location: "Company policy · configure before use",
      weekly_threshold: 40,
      daily_threshold: 0,
      double_threshold: 0,
      overtime_multiplier: 1.5,
      double_multiplier: 2,
      week_starts: 1,
    },
    settings: {
      id: "company",
      name: "Gather Studio",
      timezone: "America/Los_Angeles",
      minimum_staff: 3,
    },
    audit: [],
  };
}
