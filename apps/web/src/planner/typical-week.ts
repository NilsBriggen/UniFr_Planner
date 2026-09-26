import { Temporal } from "@js-temporal/polyfill";
import type { Language } from "../i18n";
import { localInstant, termRange, zone, type CalendarEvent } from "./calendar";
import { timetableMessages } from "./timetable-messages";
import { minuteText } from "./weekly-export";

/** A January week without a DST change. Typical slots are placed on it so
 * layoutWeek can lay them out; the date itself is never printed. */
export const TYPICAL_REFERENCE_MONDAY = "2001-01-01";
/** Series held in fewer distinct weeks are listed as dates, not drawn. */
export const MIN_GRID_WEEKS = 3;

export type TypicalAnnotation =
  | { kind: "weekly"; from?: string; until?: string }
  | { kind: "biweekly"; from?: string; until?: string }
  | { kind: "count"; count: number; from: string; until: string };
export type TypicalRooms = {
  /** "parallel": more than one room on the same date (merged groups). */
  mode: "one" | "varies" | "parallel" | "none";
  /** Distinct rooms, most frequent first. */
  list: string[];
};
export type TypicalPart = {
  startMinute: number;
  endMinute: number;
  timeLabel: string;
  sessionTypes: string[];
  annotation: TypicalAnnotation;
};
export type TypicalSlot = {
  id: string;
  /** Synthetic event on the reference week, clipped at 24:00. */
  event: CalendarEvent;
  owner: string;
  personal: boolean;
  title: string;
  /** 1 = Monday … 7 = Sunday, local. */
  weekday: number;
  /** Local wall-clock minutes; endMinute exceeds 1440 across midnight. */
  startMinute: number;
  endMinute: number;
  /** Real local times, e.g. "22:00–02:00". */
  timeLabel: string;
  sessionTypes: string[];
  rooms: TypicalRooms;
  weeks: string[];
  dates: string[];
  annotation: TypicalAnnotation;
  /** Sessions of one course overlap here and are drawn as one block. */
  internalOverlap: boolean;
  /** The merged series when overlapping series of one course were joined. */
  parts?: TypicalPart[];
};
export type TypicalSpan = {
  /** Medians of the recurring series' first and last weeks; a series that
   * starts or ends apart from them is marked "from" or "until". */
  firstWeek: string;
  lastWeek: string;
  /** The printed period: every recurring series that meets between the
   * medians, so a course running on after most others is not cut off. */
  firstDate: string;
  lastDate: string;
  /** Teaching weeks in the printed period. */
  weeks: number;
};
export type TypicalDate = {
  date: string;
  /** Later than date only for an event longer than a day, whose hours alone
   * would hide the days after the first. */
  endDate: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  timeLabel: string;
};
export type TypicalOtherDates = {
  owner: string;
  title: string;
  /** One entry per date, spanning every session of that date. */
  dates: TypicalDate[];
  /** Consecutive dates with the same times compressed into one range. */
  runs: { from: string; to: string; timeLabel: string }[];
};
export type TypicalAllDay = {
  label: string;
  weekday: number;
  /** Weekdays covered from 00:00 to 00:00. */
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  timeLabel: string;
  weeks: string[];
  dates: string[];
  annotation: TypicalAnnotation;
};
export type TypicalAbsence = {
  label: string;
  start: string;
  /** Last local date covered, inclusive. */
  end: string;
  recurring?: {
    weekday: number;
    endWeekday: number;
    timeLabel: string;
    annotation: TypicalAnnotation;
  };
};
export type TypicalWeek = {
  slots: TypicalSlot[];
  /** slots.map((slot) => slot.event), ready for layoutWeek. */
  events: CalendarEvent[];
  teachingWeeks: string[];
  holidayWeeks: string[];
  span?: TypicalSpan;
  /** Interior runs of weeks without recurring classes (Monday to Sunday). */
  breakRuns: { from: string; to: string; weeks: number }[];
  otherDates: TypicalOtherDates[];
  /** Personal dates that are not drawn; counted only, for privacy. */
  personalOneOffs: number;
  allDay: TypicalAllDay[];
  absences: TypicalAbsence[];
};
type ClassifyContext = {
  teaching: readonly string[];
  holidays: readonly string[];
  span?: { firstWeek: string; lastWeek: string };
};
type Occurrence = {
  event: CalendarEvent;
  personal: boolean;
  date: string;
  monday: string;
  weekday: number;
  startMinute: number;
  /** Wall-clock end relative to the start date. */
  endMinute: number;
  /** Weekdays covered completely from 00:00 to 00:00. */
  fullDays: number[];
};

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const addDays = (date: string, days: number) =>
  Temporal.PlainDate.from(date).add({ days }).toString();
const display = (label: string) =>
  label.normalize("NFC").trim().replace(/\s+/g, " ");
const labelKey = (label: string) => display(label).toLowerCase();
const shortDate = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}.`;
const endText = (minute: number) =>
  minuteText(
    minute > 1440 ? minute - 1440 * Math.floor((minute - 1) / 1440) : minute,
  );
const timeLabel = (start: number, end: number) =>
  `${minuteText(start)}–${endText(end)}`;
const weekdayAfter = (weekday: number, days: number) =>
  ((weekday - 1 + days) % 7) + 1;
const weeksOf = (items: readonly Occurrence[]) =>
  [...new Set(items.map((item) => item.monday))].sort();
const datesOf = (items: readonly Occurrence[]) =>
  [...new Set(items.map((item) => item.date))].sort();
const inclusiveEnd = (item: Occurrence) =>
  addDays(item.date, Math.floor((item.endMinute - 1) / 1440));
const byOccurrence = (a: Occurrence, b: Occurrence) =>
  Date.parse(a.event.start) - Date.parse(b.event.start) ||
  Date.parse(a.event.end) - Date.parse(b.event.end) ||
  order(a.event.id, b.event.id) ||
  order(a.event.owner, b.event.owner) ||
  order(a.event.title, b.event.title) ||
  order(a.event.location, b.event.location) ||
  order(a.event.sessionType ?? "", b.event.sessionType ?? "");

function occurrence(event: CalendarEvent, personal: boolean): Occurrence {
  const wallClock = (value: string) => {
    const local = Temporal.Instant.from(value).toZonedDateTimeISO(zone);
    // Seconds are dropped, so 23:59:45 stays 23:59 and never becomes 24:00.
    return { local, minute: local.hour * 60 + local.minute };
  };
  const start = wallClock(event.start),
    end = wallClock(event.end);
  const date = start.local.toPlainDate();
  const endMinute = Math.max(
    start.minute + 1,
    end.minute + 1440 * date.until(end.local.toPlainDate()).days,
  );
  const fullDays = new Set<number>();
  for (
    let day = start.minute === 0 ? 0 : 1;
    1440 * (day + 1) <= endMinute && fullDays.size < 7;
    day++
  )
    fullDays.add(weekdayAfter(start.local.dayOfWeek, day));
  return {
    event,
    personal,
    date: date.toString(),
    monday: date.subtract({ days: start.local.dayOfWeek - 1 }).toString(),
    weekday: start.local.dayOfWeek,
    startMinute: start.minute,
    endMinute,
    fullDays: [...fullDays].sort((a, b) => a - b),
  };
}

/** Weekly, every other week or a counted number of weeks, judged against the
 * weeks in which the student's recurring classes meet. Single skips (a public
 * holiday, Dies academicus) still read as weekly; inferred holiday weeks are
 * ignored, so a biweekly rhythm survives the Easter break. */
export function classifySeries(
  weeks: readonly string[],
  dates: readonly string[],
  context: ClassifyContext,
): TypicalAnnotation {
  const series = [...new Set(weeks)].sort(),
    days = [...new Set(dates)].sort();
  const teaching = new Set(context.teaching),
    holidays = new Set(context.holidays);
  const n = series.length;
  let skips = 0,
    skipRun = 0,
    breakPairs = 0,
    breakRun = 0,
    biweekly = n >= 3;
  for (let i = 1; i < n; i++) {
    const raw: string[] = [];
    for (
      let week = addDays(series[i - 1], 7);
      week < series[i];
      week = addDays(week, 7)
    )
      raw.push(week);
    const between = raw.filter((week) => !holidays.has(week));
    let run = 0,
      breaks = 0;
    for (const week of between) {
      if (teaching.has(week)) {
        skips++;
        skipRun = Math.max(skipRun, ++run);
        breaks = 0;
      } else {
        breakRun = Math.max(breakRun, ++breaks);
      }
    }
    if (between.some((week) => !teaching.has(week))) breakPairs++;
    if (raw.length > between.length ? between.length > 1 : between.length !== 1)
      biweekly = false;
  }
  const span = context.span;
  if (
    n >= 3 &&
    skips <= Math.floor(n / 5) &&
    skipRun <= 1 &&
    breakPairs <= Math.floor(n / 7) &&
    breakRun <= 2
  )
    return {
      kind: "weekly",
      ...(span && series[0] !== span.firstWeek ? { from: days[0] } : {}),
      ...(span && series.at(-1) !== span.lastWeek
        ? { until: days.at(-1) }
        : {}),
    };
  if (biweekly) {
    const inSpan = [...teaching]
      .filter(
        (week) => !span || (week >= span.firstWeek && week <= span.lastWeek),
      )
      .sort();
    const partial =
      inSpan.length > 0 &&
      (series[0] > inSpan[Math.min(1, inSpan.length - 1)] ||
        series.at(-1)! < inSpan[Math.max(0, inSpan.length - 2)]);
    return partial
      ? { kind: "biweekly", from: days[0], until: days.at(-1) }
      : { kind: "biweekly" };
  }
  return { kind: "count", count: n, from: days[0], until: days.at(-1)! };
}

/** The mark printed next to a slot's time; "" for a plain weekly slot.
 * Dates use the Swiss "dd.mm." form in every language. */
export function annotationText(
  annotation: TypicalAnnotation,
  language: Language,
  form: "full" | "short",
) {
  const x = timetableMessages[language];
  const range = (a: { from?: string; until?: string }) =>
    `${shortDate(a.from!)}–${shortDate(a.until!)}`;
  if (annotation.kind === "count")
    return form === "full"
      ? `${annotation.count}× · ${range(annotation)}`
      : `${annotation.count}×`;
  if (annotation.kind === "biweekly")
    return form === "short"
      ? x.wallEvery2Short
      : annotation.from && annotation.until
        ? `${x.wallEvery2} · ${range(annotation)}`
        : x.wallEvery2;
  if (annotation.from && annotation.until) return range(annotation);
  if (annotation.from) return `${x.wallFrom} ${shortDate(annotation.from)}`;
  if (annotation.until) return `${x.wallUntil} ${shortDate(annotation.until)}`;
  return "";
}

function sessionTypes(items: readonly Occurrence[]) {
  const weeks = new Map<string, Set<string>>();
  for (const item of items) {
    const type = item.event.sessionType?.trim();
    if (!type) continue;
    weeks.set(type, (weeks.get(type) ?? new Set()).add(item.monday));
  }
  // A type from a single week (one exam row) does not describe the slot.
  return [...weeks]
    .filter(([, seen]) => seen.size >= 2)
    .sort((a, b) => b[1].size - a[1].size)
    .map(([type]) => type);
}
function rooms(items: readonly Occurrence[]): TypicalRooms {
  const dates = new Map<string, Set<string>>(),
    perDate = new Map<string, Set<string>>();
  for (const item of items) {
    const room = item.event.location.trim();
    if (!room) continue;
    dates.set(room, (dates.get(room) ?? new Set()).add(item.date));
    perDate.set(item.date, (perDate.get(item.date) ?? new Set()).add(room));
  }
  const list = [...dates]
    .sort((a, b) => b[1].size - a[1].size)
    .map(([room]) => room);
  return {
    mode: !list.length
      ? "none"
      : [...perDate.values()].some((seen) => seen.size > 1)
        ? "parallel"
        : list.length === 1
          ? "one"
          : "varies",
    list,
  };
}
/** Differing rows of one series on the same date (parallel sessions). */
function parallelRows(items: readonly Occurrence[]) {
  const rows = new Map<string, Set<string>>();
  for (const item of items)
    rows.set(
      item.date,
      (rows.get(item.date) ?? new Set()).add(
        JSON.stringify([
          item.event.location.trim(),
          item.event.sessionType?.trim() ?? "",
        ]),
      ),
    );
  return [...rows.values()].some((seen) => seen.size > 1);
}

/** Courses whose own dated sessions overlap, e.g. unchosen parallel groups.
 * Identical duplicate rows are not counted. */
export function internalOverlapOwners(events: readonly CalendarEvent[]) {
  const owners = new Set<string>();
  const sorted = events
    .filter((event) => !event.personal)
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  for (const [i, a] of sorted.entries())
    for (const b of sorted.slice(i + 1)) {
      if (Date.parse(b.start) >= Date.parse(a.end)) break;
      if (
        a.owner === b.owner &&
        (a.start !== b.start ||
          a.end !== b.end ||
          a.location !== b.location ||
          a.sessionType !== b.sessionType)
      )
        owners.add(a.owner);
    }
  return [...owners].sort();
}

/** A typical semester week for a wall sheet. Series are keyed by course (or
 * normalized personal label) and local weekday and times, so DST never splits
 * them; session type and room are deliberately not part of the key. Teaching
 * weeks, holidays and the reference span are inferred from the recurring
 * classes themselves, because no lecture-period calendar exists. */
export function buildTypicalWeek(
  events: readonly CalendarEvent[],
  term: string,
  { courseIds }: { courseIds: ReadonlySet<string> },
): TypicalWeek {
  const range = termRange(term);
  const lower = Date.parse(localInstant(`${range.start}T00:00`)),
    upper = Date.parse(localInstant(`${addDays(range.end, 1)}T00:00`));
  // The shared page passes every personal period, not only this term's.
  const occurrences = events
    .filter(
      (event) =>
        Date.parse(event.start) < upper && Date.parse(event.end) > lower,
    )
    .map((event) =>
      occurrence(event, event.personal ?? !courseIds.has(event.owner)),
    )
    .sort(byOccurrence);
  const timed = new Map<string, Occurrence[]>(),
    long: Occurrence[] = [],
    courseDates: Occurrence[] = [];
  for (const item of occurrences) {
    const length = item.endMinute - item.startMinute;
    if (item.personal && (item.fullDays.length || length > 1440))
      long.push(item);
    else if (!item.personal && length > 1440) courseDates.push(item);
    else {
      const key = [
        item.personal
          ? `p|${labelKey(item.event.title)}`
          : `c|${item.event.owner}`,
        item.weekday,
        item.startMinute,
        item.endMinute,
      ].join("|");
      timed.set(key, [...(timed.get(key) ?? []), item]);
    }
  }
  const series = [...timed.values()];
  const recurring: Occurrence[][] = [];
  for (const items of series.filter((items) => !items[0].personal))
    if (weeksOf(items).length >= MIN_GRID_WEEKS) recurring.push(items);
    else courseDates.push(...items);

  const teachingWeeks = weeksOf(recurring.flat());
  let span: TypicalSpan | undefined,
    period: { from: string; to: string } | undefined;
  if (recurring.length) {
    // Medians keep a bridging course or January revision sessions from
    // marking every regular course "from" or "until".
    const firsts = recurring.map((items) => weeksOf(items)[0]).sort(),
      lasts = recurring.map((items) => weeksOf(items).at(-1)!).sort();
    const firstWeek = firsts[Math.floor((firsts.length - 1) / 2)],
      lastWeek = lasts[Math.floor(lasts.length / 2)];
    // The printed period covers every series that meets between the medians,
    // so a full-semester course is never cut off when most series end early;
    // disjoint outliers (bridging course, January revision) stay out.
    const covered = recurring
      .filter((items) => {
        const weeks = weeksOf(items);
        return weeks[0] <= lastWeek && weeks.at(-1)! >= firstWeek;
      })
      .flat();
    const from = weeksOf(covered)[0],
      to = weeksOf(covered).at(-1)!;
    period = { from, to };
    span = {
      firstWeek,
      lastWeek,
      firstDate: datesOf(covered)[0],
      lastDate: datesOf(covered).at(-1)!,
      weeks: teachingWeeks.filter((week) => week >= from && week <= to).length,
    };
  }
  const teaching = new Set(teachingWeeks);
  const runs: string[][] = [];
  if (teachingWeeks.length)
    for (
      let week = addDays(teachingWeeks[0], 7);
      week < teachingWeeks.at(-1)!;
      week = addDays(week, 7)
    ) {
      if (teaching.has(week)) continue;
      const run = runs.at(-1);
      if (run && addDays(run.at(-1)!, 7) === week) run.push(week);
      else runs.push([week]);
    }
  // Only a few short gaps in a full semester are read as holidays: at most one
  // per five weeks of the printed period, so a Thursday-only spring (Easter,
  // Ascension, Corpus Christi) keeps its holidays and a lone biweekly course
  // does not. Gaps before or after the period (a summer block, January
  // revision) come from outliers and never veto the rest; the period starts
  // and ends in teaching weeks, so a gap lies wholly inside or outside it.
  const inside = (run: string[]) =>
    !period || (run[0] > period.from && run[0] < period.to);
  const interior = runs.filter(inside);
  const spanned = (span?.weeks ?? 0) + interior.flat().length;
  const holidayWeeks =
    (span?.weeks ?? 0) >= 8 &&
    interior.length <= Math.max(1, Math.floor(spanned / 5)) &&
    interior.every((run) => run.length <= 3)
      ? runs.filter((run) => inside(run) || run.length <= 3).flat()
      : [];
  const context: ClassifyContext = {
    teaching: teachingWeeks,
    holidays: holidayWeeks,
    span,
  };
  // Personal series are cropped to the median span they are classified
  // against, so a commitment that runs all term never shows the edge of a
  // wider printed period as its own start or end.
  const inMedianSpan = (item: Occurrence) =>
    !span || (item.monday >= span.firstWeek && item.monday <= span.lastWeek);

  // Overlapping series of one course on one weekday become a single block:
  // at most one of them can be attended. Sequential sessions stay apart.
  const groups: Occurrence[][][] = [];
  const byDay = new Map<string, Occurrence[][]>();
  for (const items of recurring) {
    const key = `${items[0].event.owner}|${items[0].weekday}`;
    byDay.set(key, [...(byDay.get(key) ?? []), items]);
  }
  for (const list of byDay.values()) {
    list.sort(
      (a, b) =>
        a[0].startMinute - b[0].startMinute || a[0].endMinute - b[0].endMinute,
    );
    let current: Occurrence[][] = [],
      end = -1;
    for (const items of list) {
      if (current.length && items[0].startMinute >= end) {
        groups.push(current);
        current = [];
      }
      current.push(items);
      end = Math.max(end, items[0].endMinute);
    }
    groups.push(current);
  }
  let personalOneOffs = 0;
  for (const items of series.filter((items) => items[0].personal)) {
    const kept = items.filter(inMedianSpan);
    // Without a class span a recurring series is dropped, never "one-off".
    if (weeksOf(kept).length < MIN_GRID_WEEKS)
      personalOneOffs += datesOf(kept).length;
    else if (span) groups.push([kept]);
  }

  const slots = groups
    .map((parts) => {
      const items = parts.flat().sort(byOccurrence);
      const first = items[0];
      const startMinute = Math.min(...parts.map((p) => p[0].startMinute)),
        endMinute = Math.max(...parts.map((p) => p[0].endMinute));
      const weeks = weeksOf(items),
        dates = datesOf(items);
      return {
        owner: first.event.owner,
        personal: first.personal,
        title: first.personal ? display(first.event.title) : first.event.title,
        weekday: first.weekday,
        startMinute,
        endMinute,
        timeLabel: timeLabel(startMinute, endMinute),
        // Personal periods carry a placeholder location; never print it.
        sessionTypes: first.personal ? [] : sessionTypes(items),
        rooms: first.personal
          ? { mode: "none" as const, list: [] }
          : rooms(items),
        weeks,
        dates,
        annotation: classifySeries(weeks, dates, context),
        internalOverlap:
          !first.personal && (parts.length > 1 || parallelRows(items)),
        ...(parts.length > 1
          ? {
              parts: parts.map((part) => ({
                startMinute: part[0].startMinute,
                endMinute: part[0].endMinute,
                timeLabel: timeLabel(part[0].startMinute, part[0].endMinute),
                sessionTypes: sessionTypes(part),
                annotation: classifySeries(
                  weeksOf(part),
                  datesOf(part),
                  context,
                ),
              })),
            }
          : {}),
      };
    })
    .sort(
      (a, b) =>
        a.weekday - b.weekday ||
        a.startMinute - b.startMinute ||
        a.endMinute - b.endMinute ||
        Number(a.personal) - Number(b.personal) ||
        order(a.title, b.title) ||
        order(a.owner, b.owner),
    )
    .map((slot, index): TypicalSlot => {
      const id = `typical-${String(index).padStart(4, "0")}`;
      const day = Temporal.PlainDate.from(TYPICAL_REFERENCE_MONDAY).add({
        days: slot.weekday - 1,
      });
      return {
        id,
        event: {
          id,
          owner: slot.owner,
          title: slot.title,
          start: localInstant(`${day}T${minuteText(slot.startMinute)}`),
          // Only the first segment of a midnight-crossing slot is drawn; a
          // continuation at 00:00 would stretch the grid to the whole day.
          end:
            slot.endMinute >= 1440
              ? localInstant(`${day.add({ days: 1 })}T00:00`)
              : localInstant(`${day}T${minuteText(slot.endMinute)}`),
          location: slot.rooms.list[0] ?? "",
          ...(slot.sessionTypes.length
            ? { sessionType: slot.sessionTypes.join(" / ") }
            : {}),
          personal: slot.personal,
        },
        ...slot,
      };
    });

  const byOwner = new Map<string, Occurrence[]>();
  for (const item of courseDates)
    byOwner.set(item.event.owner, [
      ...(byOwner.get(item.event.owner) ?? []),
      item,
    ]);
  const otherDates = [...byOwner.values()]
    .map((items): TypicalOtherDates => {
      items.sort(byOccurrence);
      const byDate = new Map<string, TypicalDate>();
      for (const item of items) {
        const known = byDate.get(item.date);
        const startMinute = Math.min(
            known?.startMinute ?? item.startMinute,
            item.startMinute,
          ),
          endMinute = Math.max(known?.endMinute ?? 0, item.endMinute);
        // A session crossing midnight keeps one date; its hours show that.
        const days =
          endMinute - startMinute > 1440
            ? Math.floor((endMinute - 1) / 1440)
            : 0;
        byDate.set(item.date, {
          date: item.date,
          endDate: addDays(item.date, days),
          weekday: item.weekday,
          startMinute,
          endMinute,
          timeLabel: timeLabel(startMinute, endMinute),
        });
      }
      const dates = [...byDate.values()].sort((a, b) => order(a.date, b.date));
      const runs: TypicalOtherDates["runs"] = [];
      // Only single-day dates join a run; a longer event keeps its own range.
      const single = (day: TypicalDate) => day.endDate === day.date;
      for (const [i, day] of dates.entries()) {
        const run = runs.at(-1);
        if (
          run &&
          single(dates[i - 1]) &&
          single(day) &&
          run.timeLabel === day.timeLabel &&
          addDays(run.to, 1) === day.date
        )
          run.to = day.date;
        else
          runs.push({
            from: day.date,
            to: day.endDate,
            timeLabel: day.timeLabel,
          });
      }
      return {
        owner: items[0].event.owner,
        title: items[0].event.title,
        dates,
        runs,
      };
    })
    .sort(
      (a, b) =>
        order(a.dates[0].date, b.dates[0].date) ||
        order(a.title, b.title) ||
        order(a.owner, b.owner),
    );

  // Full-day personal periods never enter the grid: a 00:00–24:00 block would
  // stretch it. Recurring weekday ones head their day column instead.
  const longGroups = new Map<string, Occurrence[]>();
  for (const item of long) {
    const key = [
      labelKey(item.event.title),
      item.weekday,
      item.startMinute,
      item.endMinute - item.startMinute,
    ].join("|");
    longGroups.set(key, [...(longGroups.get(key) ?? []), item]);
  }
  const allDay: TypicalAllDay[] = [],
    absences = new Map<string, TypicalAbsence>();
  const lowerDate = period?.from ?? range.start,
    upperDate = period ? addDays(period.to, 6) : range.end;
  for (const items of longGroups.values()) {
    const kept = items.filter(inMedianSpan),
      weeks = weeksOf(kept);
    if (span && weeks.length >= MIN_GRID_WEEKS) {
      const first = kept[0],
        dates = datesOf(kept),
        label = display(first.event.title);
      const annotation = classifySeries(weeks, dates, context),
        text = timeLabel(first.startMinute, first.endMinute);
      if (first.fullDays.some((day) => day <= 5))
        allDay.push({
          label,
          weekday: first.weekday,
          weekdays: first.fullDays,
          startMinute: first.startMinute,
          endMinute: first.endMinute,
          timeLabel: text,
          weeks,
          dates,
          annotation,
        });
      else
        absences.set(`${labelKey(label)}|${dates[0]}|recurring`, {
          label,
          start: dates[0],
          end: kept.map(inclusiveEnd).sort().at(-1)!,
          recurring: {
            weekday: first.weekday,
            endWeekday: weekdayAfter(
              first.weekday,
              Math.floor((first.endMinute - 1) / 1440),
            ),
            timeLabel: text,
            annotation,
          },
        });
      continue;
    }
    for (const item of items) {
      const end = inclusiveEnd(item);
      if (item.date <= upperDate && end >= lowerDate)
        absences.set(`${labelKey(item.event.title)}|${item.date}|${end}`, {
          label: display(item.event.title),
          start: item.date,
          end,
        });
    }
  }

  return {
    slots,
    events: slots.map((slot) => slot.event),
    teachingWeeks,
    holidayWeeks,
    span,
    breakRuns: runs.map((run) => ({
      from: run[0],
      to: addDays(run.at(-1)!, 6),
      weeks: run.length,
    })),
    otherDates,
    personalOneOffs,
    allDay: allDay.sort(
      (a, b) =>
        a.weekday - b.weekday ||
        a.startMinute - b.startMinute ||
        order(a.label, b.label),
    ),
    absences: [...absences.values()].sort(
      (a, b) =>
        order(a.start, b.start) ||
        order(a.end, b.end) ||
        order(a.label, b.label),
    ),
  };
}
