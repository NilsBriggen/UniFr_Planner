import { Temporal } from "@js-temporal/polyfill";
import { termRange } from "./calendar";

export type CalendarView = { view: "week" | "day" | "agenda"; date: string };

export function defaultCalendarDate(
  term: string,
  dates: string[],
  today: string,
) {
  const range = termRange(term);
  if (today >= range.start && today <= range.end) return today;
  return (
    dates
      .filter((date) => date >= range.start && date <= range.end)
      .sort()[0] ?? range.start
  );
}

export function readCalendarView(
  raw: string | null,
  term: string,
): CalendarView {
  const fallback: CalendarView = { view: "week", date: "" };
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    if (!["week", "day", "agenda"].includes(value.view)) return fallback;
    if (value.date === "") return { view: value.view, date: "" };
    if (
      typeof value.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.date)
    )
      return fallback;
    Temporal.PlainDate.from(value.date, { overflow: "reject" });
    const range = termRange(term);
    return value.date >= range.start && value.date <= range.end
      ? { view: value.view, date: value.date }
      : fallback;
  } catch {
    return fallback;
  }
}
