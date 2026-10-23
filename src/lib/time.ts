import { Temporal } from "@js-temporal/polyfill";
export function today(zone = "America/Los_Angeles") {
  return Temporal.Now.zonedDateTimeISO(zone).toPlainDate().toString();
}
export function addDays(date: string, days: number) {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}
export function addMonths(date: string, months: number) {
  return Temporal.PlainDate.from(date)
    .add({ months })
    .with({ day: 1 })
    .toString();
}
export function weekStart(date: string, start = 1) {
  const d = Temporal.PlainDate.from(date);
  return d.subtract({ days: ((d.dayOfWeek % 7) - start + 7) % 7 }).toString();
}
export function calendarDays(date: string) {
  const first = Temporal.PlainDate.from(date).with({ day: 1 });
  const start = weekStart(first.toString());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function labelDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
    ...options,
    timeZone: "UTC",
  });
}
export function timeLabel(time: string) {
  const [h, m] = time.split(":").map(Number);
  return (
    (h % 12 || 12) +
    (m ? ":" + String(m).padStart(2, "0") : "") +
    (h < 12 ? "a" : "p")
  );
}
export function bounds(date: string, start: string, end: string, zone: string) {
  const a = Temporal.ZonedDateTime.from(date + "T" + start + "[" + zone + "]", {
    disambiguation: "reject",
  });
  const endDate = end <= start ? addDays(date, 1) : date;
  const b = Temporal.ZonedDateTime.from(
    endDate + "T" + end + "[" + zone + "]",
    { disambiguation: "reject" },
  );
  return {
    start: Number(a.epochMilliseconds),
    end: Number(b.epochMilliseconds),
  };
}
export function hours(
  date: string,
  start: string,
  end: string,
  pause: number,
  zone: string,
) {
  const b = bounds(date, start, end, zone);
  return Math.max(0, (b.end - b.start) / 3600000 - pause / 60);
}
export function validDuration(
  date: string,
  start: string,
  end: string,
  pause: number,
  zone: string,
) {
  try {
    const b = bounds(date, start, end, zone);
    return (
      b.end > b.start &&
      b.end - b.start <= 25 * 3600000 &&
      pause >= 0 &&
      pause < (b.end - b.start) / 60000
    );
  } catch {
    return false;
  }
}
