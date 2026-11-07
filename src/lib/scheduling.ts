import { Shift } from "./types";
import { bounds } from "./time";
/** Group by employee and sweep sorted intervals; historical records are bounded once. */
export function conflicts(shifts: Shift[], zone: string) {
  const ids = new Set<string>();
  const groups = new Map<
    string,
    Array<{ id: string; start: number; end: number }>
  >();
  for (const shift of shifts) {
    try {
      const span = bounds(shift.date, shift.start, shift.end, zone);
      const list = groups.get(shift.employee_id) ?? [];
      list.push({ id: shift.id, ...span });
      groups.set(shift.employee_id, list);
    } catch {
      ids.add(shift.id);
    }
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.start - b.start);
    let active: typeof list = [];
    for (const item of list) {
      active = active.filter((a) => a.end > item.start);
      for (const other of active) {
        ids.add(other.id);
        ids.add(item.id);
      }
      active.push(item);
    }
  }
  return ids;
}
