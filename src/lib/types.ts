export type Role = "employee" | "manager" | "accountant";
export type Status = "draft" | "published" | "pending";
export interface Employee {
  id: string;
  name: string;
  email: string;
  department: string;
  title: string;
  active: boolean;
  color: string;
  user_id?: string | null;
}
export interface Shift {
  id: string;
  employee_id: string;
  date: string;
  start: string;
  end: string;
  break_minutes: number;
  status: Status;
}
export interface ScheduleDay {
  id: string;
  date: string;
  status: Status;
}
export interface Note {
  id: string;
  employee_id: string;
  kind: "Call-off" | "Late arrival" | "Schedule change" | "General";
  body: string;
  created_at: string;
}
export interface TimeEntry {
  id: string;
  employee_id: string;
  date: string;
  start: string;
  end: string;
  break_minutes: number;
  adjustment_minutes: number;
  adjustment_reason: string;
  approved: boolean;
}
export interface PayRate {
  id: string;
  employee_id: string;
  hourly_rate: number;
  effective_date: string;
}
export interface Rules {
  id: string;
  location: string;
  weekly_threshold: number;
  daily_threshold: number;
  double_threshold: number;
  overtime_multiplier: number;
  double_multiplier: number;
  week_starts: number;
}
export interface Settings {
  id: string;
  name: string;
  timezone: string;
  minimum_staff: number;
}
export interface Audit {
  id: string;
  action: string;
  entity: string;
  actor: string;
  created_at: string;
}
export interface Data {
  employees: Employee[];
  shifts: Shift[];
  schedule_days: ScheduleDay[];
  notes: Note[];
  time_entries: TimeEntry[];
  pay_rates: PayRate[];
  rules: Rules;
  settings: Settings;
  audit: Audit[];
}
export type Table =
  | "employees"
  | "shifts"
  | "schedule_days"
  | "notes"
  | "time_entries"
  | "pay_rates";
export const uid = () => crypto.randomUUID();
