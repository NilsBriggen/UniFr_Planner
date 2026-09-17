import { Temporal } from "@js-temporal/polyfill";
import { RRule } from "rrule";
import type { Meeting } from "../api/client";
import type { Selection, Unavailable } from "./domain";

export const zone = "Europe/Zurich";
export type CalendarEvent = {
  id: string;
  owner: string;
  title: string;
  start: string;
  end: string;
  location: string;
};
export type CalendarResult = {
  events: CalendarEvent[];
  cancelled: CalendarEvent[];
  unresolved: string[];
};
export type DateRange = { start: string; end: string };
export type Conflict = {
  kind: "hard" | "travel" | "unavailable";
  first: string;
  second: string;
  start: string;
};
export const localInstant = (local: string) =>
  Temporal.PlainDateTime.from(local)
    .toZonedDateTime(zone, { disambiguation: "reject" })
    .toInstant()
    .toString();
export const localDate = (value: string) =>
  Temporal.Instant.from(value)
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
const floating = (value: Temporal.PlainDateTime) =>
  new Date(`${value.toString()}Z`);
const plain = (value: Date) =>
  Temporal.PlainDateTime.from(value.toISOString().replace(/Z$/, ""));
const instant = (value: string) => Temporal.Instant.from(value);
const key = (value: string, time: Temporal.PlainTime) =>
  value.length === 10
    ? localInstant(`${value}T${time}`)
    : instant(value).toString();

/** Expand bounded source recurrences in Zurich wall time, then compare instants.
 * Unsupported/high-frequency/unbounded rules are explicitly unresolved. */
export function expandMeetings(
  owner: string,
  title: string,
  meetings: Meeting[],
  range: DateRange,
): CalendarResult {
  const result: CalendarResult = { events: [], cancelled: [], unresolved: [] };
  const lower = Temporal.PlainDate.from(range.start).toZonedDateTime(
    zone,
  ).epochMilliseconds;
  const upper = Temporal.PlainDate.from(range.end)
    .add({ days: 1 })
    .toZonedDateTime(zone).epochMilliseconds;
  if (upper <= lower || upper - lower > 370 * 86400000)
    throw new Error("invalid calendar range");
  const masters = meetings.filter((m) => m.recurrence && !m.recurrence_id);
  const overrides = meetings.filter((m) => m.recurrence_id);
  for (const [index, meeting] of meetings.entries()) {
    if (meeting.recurrence_id) {
      if (
        !meeting.source_uid ||
        masters.filter((m) => m.source_uid === meeting.source_uid).length !== 1
      )
        result.unresolved.push(`${owner}:${index}`);
      continue;
    }
    if (meeting.cancelled && (!meeting.starts_at || !meeting.ends_at)) continue;
    try {
      if (meeting.unresolved || !meeting.starts_at || !meeting.ends_at)
        throw new Error("missing time");
      const start = instant(meeting.starts_at)
        .toZonedDateTimeISO(zone)
        .toPlainDateTime();
      const end = instant(meeting.ends_at)
        .toZonedDateTimeISO(zone)
        .toPlainDateTime();
      const duration = end.since(start, { largestUnit: "days" });
      if (
        instant(meeting.ends_at).epochMilliseconds <=
          instant(meeting.starts_at).epochMilliseconds ||
        duration.sign <= 0
      )
        throw new Error("invalid interval");
      let dates = [start];
      if (meeting.recurrence) {
        const raw = meeting.recurrence.replace(/^RRULE:/, "");
        if (
          !/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;|$)/.test(raw) ||
          !/(^|;)(COUNT|UNTIL)=/.test(raw) ||
          /BY(SECOND|MINUTE|HOUR)=/.test(raw)
        )
          throw new Error("unsupported recurrence");
        const options = RRule.parseString(raw);
        if (
          options.interval !== undefined &&
          (!Number.isInteger(options.interval) || options.interval < 1)
        )
          throw new Error("invalid recurrence interval");
        if (
          options.count !== undefined &&
          options.count !== null &&
          (!Number.isInteger(options.count) || options.count < 1)
        )
          throw new Error("invalid recurrence count");
        if (options.count && options.count > 2000)
          throw new Error("excessive recurrence");
        if (options.until && /UNTIL=\d{8}T\d{6}Z/.test(raw))
          options.until = floating(
            instant(options.until.toISOString())
              .toZonedDateTimeISO(zone)
              .toPlainDateTime(),
          );
        const rule = new RRule({ ...options, dtstart: floating(start) });
        let count = 0;
        dates = rule
          .between(
            floating(start),
            floating(
              Temporal.PlainDate.from(range.end)
                .add({ days: 1 })
                .toPlainDateTime(),
            ),
            true,
            () => ++count <= 2000,
          )
          .map(plain);
        if (count > 2000) throw new Error("excessive recurrence");
      }
      const exclusions = new Set(
        meeting.excluded_dates.map((d) => key(d, start.toPlainTime())),
      );
      const replacements = new Map<string, Meeting>();
      if (meeting.source_uid)
        for (const override of overrides.filter(
          (o) => o.source_uid === meeting.source_uid,
        )) {
          const k = key(override.recurrence_id!, start.toPlainTime());
          if (replacements.has(k)) throw new Error("ambiguous override");
          replacements.set(k, override);
        }
      const starts = new Map(dates.map((d) => [localInstant(d.toString()), d]));
      for (const value of meeting.additional_dates) {
        const valueKey = key(value, start.toPlainTime());
        starts.set(
          valueKey,
          instant(valueKey).toZonedDateTimeISO(zone).toPlainDateTime(),
        );
      }
      for (const k of replacements.keys())
        starts.set(k, instant(k).toZonedDateTimeISO(zone).toPlainDateTime());
      const accepted: CalendarEvent[] = [];
      const cancelled: CalendarEvent[] = [];
      for (const [k, date] of starts) {
        const replacement = replacements.get(k);
        if (exclusions.has(k) && !replacement) continue;
        const chosen = replacement ?? meeting;
        if (chosen.unresolved) throw new Error("unresolved override");
        const a = replacement
          ? instant(replacement.starts_at ?? k).toString()
          : k;
        const b = replacement
          ? instant(
              replacement.ends_at ??
                localInstant(date.add(duration).toString()),
            ).toString()
          : localInstant(date.add(duration).toString());
        if (
          Date.parse(b) <= Date.parse(a) ||
          (replacement &&
            !replacement.cancelled &&
            (!replacement.starts_at || !replacement.ends_at))
        )
          throw new Error("invalid override");
        if (Date.parse(a) >= upper || Date.parse(b) <= lower) continue;
        const item = {
          id: `${owner}-${index}-${k}`,
          owner,
          title,
          start: a,
          end: b,
          location: chosen.location,
        };
        (chosen.cancelled ? cancelled : accepted).push(item);
      }
      result.events.push(...accepted);
      result.cancelled.push(...cancelled);
    } catch {
      result.unresolved.push(`${owner}:${index}`);
    }
  }
  result.events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  result.cancelled.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return result;
}
export function detectConflicts(
  events: CalendarEvent[],
  unavailable: Unavailable[],
  travelMinutes: number,
): Conflict[] {
  if (
    !Number.isFinite(travelMinutes) ||
    travelMinutes < 0 ||
    travelMinutes > 180
  )
    throw new Error("invalid travel buffer");
  const found: Conflict[] = [];
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start),
  );
  for (const [i, a] of sorted.entries()) {
    for (const b of sorted.slice(i + 1)) {
      const gap = Date.parse(b.start) - Date.parse(a.end);
      if (gap >= travelMinutes * 60000 && gap >= 0) break;
      if (a.id === b.id) continue;
      if (gap < 0)
        found.push({
          kind: "hard",
          first: a.owner,
          second: b.owner,
          start: b.start,
        });
      else if (a.location !== b.location || !a.location)
        found.push({
          kind: "travel",
          first: a.owner,
          second: b.owner,
          start: b.start,
        });
    }
    for (const busy of unavailable) {
      if (
        Date.parse(a.start) < Date.parse(busy.end) &&
        Date.parse(busy.start) < Date.parse(a.end)
      )
        found.push({
          kind: "unavailable",
          first: a.owner,
          second: busy.id,
          start: a.start,
        });
    }
  }
  return found;
}
export const canonicalTerm = (value: string) =>
  value.replace(/^HS-/, "AS-").replace(/^FS-/, "SS-");
export function termRange(value: string): DateRange {
  const normalized = canonicalTerm(value);
  if (!/^(AS|SS)-20\d{2}$/.test(normalized))
    throw new Error("invalid semester");
  const year = Number(normalized.slice(3));
  return normalized.startsWith("AS")
    ? { start: `${year}-08-01`, end: `${year + 1}-01-31` }
    : { start: `${year}-02-01`, end: `${year}-07-31` };
}
export function calendarFor(
  courses: Selection[],
  term: string,
  language: string,
): CalendarResult {
  const result: CalendarResult = { events: [], cancelled: [], unresolved: [] };
  for (const course of courses.filter(
    (c) => c.semester === canonicalTerm(term) && c.status !== "completed",
  )) {
    if (
      !course.offering ||
      !course.offering.terms.some(
        (t) => canonicalTerm(t) === canonicalTerm(term),
      ) ||
      course.offering.meetings.length === 0
    ) {
      result.unresolved.push(course.id);
      continue;
    }
    // Catalogue availability filtering deliberately marks all recurrences as
    // unresolved. Here, individual meeting metadata is actually expanded and
    // validated; its coarse filter flag is not proof that timestamps are absent.
    const expanded = expandMeetings(
      course.id,
      course.titles[language] ?? course.titles.en ?? course.code,
      course.offering.meetings,
      termRange(term),
    );
    result.events.push(...expanded.events);
    result.cancelled.push(...expanded.cancelled);
    result.unresolved.push(...expanded.unresolved);
  }
  result.events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return result;
}
const escapeText = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r/g, "");
function fold(line: string): string {
  let output = "",
    length = 0;
  for (const char of line) {
    const bytes = new TextEncoder().encode(char).length;
    if (length + bytes > 75) {
      output += "\r\n ";
      length = 1;
    }
    output += char;
    length += bytes;
  }
  return output;
}
const stamp = (s: string) =>
  instant(s).toString({ smallestUnit: "second" }).replace(/[-:]/g, "");
/** UTC instances replace RRULEs so the bounded export exactly matches the
 * evaluated semester calendar, including DST and source overrides. */
export function exportCalendar(
  result: CalendarResult,
  exportedAt: string,
): string {
  if (result.unresolved.length)
    throw new Error("unresolved schedules prevent complete export");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UniFr Planner//Guest semester//EN",
    "CALSCALE:GREGORIAN",
  ];
  for (const [items, status] of [
    [result.events, "CONFIRMED"],
    [result.cancelled, "CANCELLED"],
  ] as const)
    for (const item of items) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${escapeText(item.id)}@unifr-planner.local`,
        `DTSTAMP:${stamp(exportedAt)}`,
        `DTSTART:${stamp(item.start)}`,
        `DTEND:${stamp(item.end)}`,
        `SUMMARY:${escapeText(item.title)}`,
        `LOCATION:${escapeText(item.location)}`,
        `STATUS:${status}`,
        "END:VEVENT",
      );
    }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
