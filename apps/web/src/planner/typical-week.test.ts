import { Temporal } from "@js-temporal/polyfill";
import { expect, it } from "vitest";
import type { Meeting } from "../api/client";
import { attendanceChoice } from "./attendance";
import {
  calendarFor,
  localDate,
  localInstant,
  zone,
  type CalendarEvent,
} from "./calendar";
import type { Selection } from "./domain";
import {
  annotationText,
  buildTypicalWeek,
  classifySeries,
  internalOverlapOwners,
  MIN_GRID_WEEKS,
  TYPICAL_REFERENCE_MONDAY,
  type TypicalAnnotation,
  type TypicalWeek,
} from "./typical-week";
import { layoutWeek } from "./week-layout";

const addDays = (date: string, days: number) =>
  Temporal.PlainDate.from(date).add({ days }).toString();
/** Mondays of a 14-week autumn 2026 lecture period. */
const autumn = Array.from({ length: 14 }, (_, i) =>
  addDays("2026-09-14", 7 * i),
);
/** Mondays of spring 2027 without the two Easter weeks (13 weeks). */
const easter = ["2027-03-29", "2027-04-05"];
const spring = Array.from({ length: 15 }, (_, i) =>
  addDays("2027-02-22", 7 * i),
).filter((week) => !easter.includes(week));

/** A session in Zurich wall time; an end before the start is the next day. */
const session = (
  owner: string,
  date: string,
  start: string,
  end: string,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  id: `${owner}-${date}-${start}`,
  owner,
  title: owner,
  start: localInstant(`${date}T${start}`),
  end: localInstant(`${end < start ? addDays(date, 1) : date}T${end}`),
  location: "PER 08",
  ...extra,
});
/** One session per listed week on a weekday (1 = Monday). */
const series = (
  owner: string,
  weeks: readonly string[],
  weekday: number,
  start: string,
  end: string,
  extra: Partial<CalendarEvent> = {},
) =>
  weeks.map((week) =>
    session(owner, addDays(week, weekday - 1), start, end, extra),
  );
/** Personal periods as the planner stores them: one id and owner each. */
const personal = (
  label: string,
  weeks: readonly string[],
  weekday: number,
  start: string,
  end: string,
) =>
  series(label, weeks, weekday, start, end).map((event, i) => ({
    ...event,
    id: `${label}-${i}`,
    owner: `${label}-${i}`,
    location: "Personal unavailable period",
    personal: true,
  }));
const base = [1, 2, 3, 4, 5].map((day) => `base-${day}`);
/** Weekly classes Monday to Friday, so the teaching weeks are known. */
const fullSchedule = (weeks: readonly string[]) =>
  [1, 2, 3, 4, 5].flatMap((day) =>
    series(`base-${day}`, weeks, day, "08:15", "10:00"),
  );
const build = (
  events: readonly CalendarEvent[],
  term = "AS-2026",
  owners: readonly string[] = [],
) =>
  buildTypicalWeek(events, term, {
    courseIds: new Set([...base, ...owners]),
  });
const slotOf = (week: TypicalWeek, owner: string) =>
  week.slots.filter((slot) => slot.owner === owner);
const texts = (annotation: TypicalAnnotation) =>
  (["en", "de", "fr"] as const).map((language) =>
    annotationText(annotation, language, "full"),
  );

it("keeps one weekly slot across the DST change in both semesters", () => {
  const analysis = series("analysis", autumn, 1, "10:15", "12:00");
  expect(analysis[0].start).toBe("2026-09-14T08:15:00Z");
  expect(analysis.at(-1)!.start).toBe("2026-12-14T09:15:00Z");
  const typical = build(analysis, "AS-2026", ["analysis"]);
  expect(typical.slots).toHaveLength(1);
  expect(typical.slots[0]).toMatchObject({
    weekday: 1,
    startMinute: 615,
    endMinute: 720,
    timeLabel: "10:15–12:00",
    annotation: { kind: "weekly" },
  });
  expect(typical.slots[0].annotation).toEqual({ kind: "weekly" });
  expect(texts(typical.slots[0].annotation)).toEqual(["", "", ""]);

  const algebra = series("algebra", spring, 3, "13:15", "15:00");
  expect(algebra.map((event) => event.start)).toEqual(
    expect.arrayContaining(["2027-03-24T12:15:00Z", "2027-04-14T11:15:00Z"]),
  );
  const springWeek = build(algebra, "SS-2027", ["algebra"]);
  expect(springWeek.slots).toHaveLength(1);
  expect(springWeek.slots[0]).toMatchObject({
    weekday: 3,
    timeLabel: "13:15–15:00",
    annotation: { kind: "weekly" },
  });
  expect(springWeek.slots[0].annotation).toEqual({ kind: "weekly" });
});

it("recognises every other week alone, in a full schedule and across Easter", () => {
  const seminar = series(
    "seminar",
    autumn.filter((_, i) => i % 2 === 0),
    2,
    "16:15",
    "18:00",
  );
  const alone = build(seminar, "AS-2026", ["seminar"]);
  // A lone biweekly course must not be mistaken for weekly with holidays.
  expect(alone.holidayWeeks).toEqual([]);
  expect(alone.breakRuns).toHaveLength(6);
  for (const typical of [
    alone,
    build([...fullSchedule(autumn), ...seminar], "AS-2026", ["seminar"]),
  ]) {
    const [slot] = slotOf(typical, "seminar");
    expect(slot.annotation).toEqual({ kind: "biweekly" });
    expect(texts(slot.annotation)).toEqual([
      "every 2 weeks",
      "alle 2 Wochen",
      "une semaine sur deux",
    ]);
  }
  for (const weeks of [
    [
      "2027-02-22",
      "2027-03-08",
      "2027-03-22",
      "2027-04-12",
      "2027-04-26",
      "2027-05-10",
      "2027-05-24",
    ],
    [
      "2027-03-01",
      "2027-03-15",
      "2027-04-12",
      "2027-04-26",
      "2027-05-10",
      "2027-05-24",
    ],
  ]) {
    const typical = build(
      [
        ...fullSchedule(spring),
        ...series("tutorial", weeks, 2, "16:15", "18:00"),
      ],
      "SS-2027",
      ["tutorial"],
    );
    expect(typical.holidayWeeks).toEqual(easter);
    expect(slotOf(typical, "tutorial")[0].annotation).toEqual({
      kind: "biweekly",
    });
  }
});

it("marks a late start and an early end against the reference span", () => {
  const typical = build(
    [
      ...fullSchedule(autumn),
      ...series("late", autumn.slice(2), 1, "13:15", "15:00"),
      ...series("early", autumn.slice(0, 10), 1, "15:15", "17:00"),
      ...series("both", autumn.slice(2, 10), 1, "17:15", "19:00"),
    ],
    "AS-2026",
    ["late", "early", "both"],
  );
  expect(typical.span).toEqual({
    firstWeek: "2026-09-14",
    lastWeek: "2026-12-14",
    firstDate: "2026-09-14",
    lastDate: "2026-12-18",
    weeks: 14,
  });
  const [late] = slotOf(typical, "late"),
    [early] = slotOf(typical, "early"),
    [both] = slotOf(typical, "both");
  expect(late.annotation).toEqual({ kind: "weekly", from: "2026-09-28" });
  expect(texts(late.annotation)).toEqual([
    "from 28.09.",
    "ab 28.09.",
    "dès le 28.09.",
  ]);
  expect(early.annotation).toEqual({ kind: "weekly", until: "2026-11-16" });
  expect(texts(early.annotation)).toEqual([
    "until 16.11.",
    "bis 16.11.",
    "jusqu’au 16.11.",
  ]);
  expect(texts(both.annotation)).toEqual([
    "28.09.–16.11.",
    "28.09.–16.11.",
    "28.09.–16.11.",
  ]);
  for (const slot of slotOf(typical, "base-1"))
    expect(slot.annotation).toEqual({ kind: "weekly" });
});

it("ignores outlier series when judging the span of regular courses", () => {
  const typical = build(
    [
      ...fullSchedule(autumn),
      ...series(
        "bridging",
        ["2026-08-24", "2026-08-31", "2026-09-07"],
        1,
        "13:15",
        "15:00",
      ),
      ...series(
        "revision",
        ["2027-01-11", "2027-01-18", "2027-01-25"],
        2,
        "13:15",
        "15:00",
      ),
    ],
    "AS-2026",
    ["bridging", "revision"],
  );
  expect(typical.span).toMatchObject({
    firstWeek: "2026-09-14",
    lastWeek: "2026-12-14",
    weeks: 14,
  });
  for (const owner of base)
    expect(slotOf(typical, owner)[0].annotation).toEqual({ kind: "weekly" });
  expect(texts(slotOf(typical, "bridging")[0].annotation)[0]).toBe(
    "24.08.–07.09.",
  );
  expect(typical.holidayWeeks).toEqual([
    "2026-12-21",
    "2026-12-28",
    "2027-01-04",
  ]);
});

it("keeps a full-semester course in the period when most series end early", () => {
  const typical = build(
    [
      ...series("full", autumn, 1, "10:15", "12:00"),
      ...series("seven", autumn.slice(0, 7), 2, "10:15", "12:00"),
      ...series("six", autumn.slice(0, 6), 3, "10:15", "12:00"),
      {
        id: "service",
        owner: "service",
        title: "Military service",
        start: localInstant("2026-11-16T00:00"),
        end: localInstant("2026-11-23T00:00"),
        location: "",
        personal: true,
      },
    ],
    "AS-2026",
    ["full", "seven", "six"],
  );
  // The medians still judge "from" and "until"; the printed period and its
  // week count cover the course that meets until 14.12.
  expect(typical.span).toEqual({
    firstWeek: "2026-09-14",
    lastWeek: "2026-10-26",
    firstDate: "2026-09-14",
    lastDate: "2026-12-14",
    weeks: 14,
  });
  expect(slotOf(typical, "full")[0].annotation).toEqual({
    kind: "weekly",
    until: "2026-12-14",
  });
  expect(slotOf(typical, "seven")[0].annotation).toEqual({ kind: "weekly" });
  // An absence while that course still meets stays on the sheet.
  expect(typical.absences).toEqual([
    { label: "Military service", start: "2026-11-16", end: "2026-11-22" },
  ]);
});

it("reads holidays and single skips as weekly, but three skips as a count", () => {
  const typical = build(
    [
      ...fullSchedule(spring),
      // Whit Monday; Ascension and Corpus Christi fall on Thursdays.
      ...series(
        "monday",
        spring.filter((week) => week !== "2027-05-17"),
        1,
        "10:15",
        "12:00",
      ),
      ...series(
        "thursday",
        spring.filter((week) => !["2027-05-03", "2027-05-24"].includes(week)),
        4,
        "10:15",
        "12:00",
      ),
    ],
    "SS-2027",
    ["monday", "thursday"],
  );
  expect(typical.teachingWeeks).toEqual(spring);
  expect(typical.holidayWeeks).toEqual(easter);
  expect(typical.breakRuns).toEqual([
    { from: "2027-03-29", to: "2027-04-11", weeks: 2 },
  ]);
  expect(typical.span).toEqual({
    firstWeek: "2027-02-22",
    lastWeek: "2027-05-31",
    firstDate: "2027-02-22",
    lastDate: "2027-06-04",
    weeks: 13,
  });
  expect(slotOf(typical, "monday")[0].annotation).toEqual({ kind: "weekly" });
  expect(slotOf(typical, "thursday")[0].annotation).toEqual({
    kind: "weekly",
  });

  const skipped = build(
    [
      ...fullSchedule(autumn),
      // Dies academicus: one skipped week.
      ...series(
        "dies",
        autumn.filter((week) => week !== "2026-11-16"),
        1,
        "13:15",
        "15:00",
      ),
      ...series(
        "three",
        autumn.filter((_, i) => ![2, 6, 10].includes(i)),
        1,
        "15:15",
        "17:00",
      ),
    ],
    "AS-2026",
    ["dies", "three"],
  );
  expect(slotOf(skipped, "dies")[0].annotation).toEqual({ kind: "weekly" });
  expect(slotOf(skipped, "three")[0].annotation).toEqual({
    kind: "count",
    count: 11,
    from: "2026-09-14",
    until: "2026-12-14",
  });
  expect(texts(slotOf(skipped, "three")[0].annotation)[0]).toBe(
    "11× · 14.09.–14.12.",
  );
});

it("reads a Thursday-only or Friday-only spring as weekly", () => {
  // Easter, Ascension and Corpus Christi; the Friday course also skips the
  // Good Friday week and the Friday after Ascension.
  const thursday = build(
    series(
      "thursday",
      spring.filter((week) => !["2027-05-03", "2027-05-24"].includes(week)),
      4,
      "10:15",
      "12:00",
    ),
    "SS-2027",
    ["thursday"],
  );
  expect(thursday.holidayWeeks).toEqual([
    ...easter,
    "2027-05-03",
    "2027-05-24",
  ]);
  expect(slotOf(thursday, "thursday")[0].annotation).toEqual({
    kind: "weekly",
  });
  const friday = build(
    series(
      "friday",
      spring.filter((week) => !["2027-03-22", "2027-05-03"].includes(week)),
      5,
      "10:15",
      "12:00",
    ),
    "SS-2027",
    ["friday"],
  );
  expect(friday.holidayWeeks).toEqual(["2027-03-22", ...easter, "2027-05-03"]);
  expect(slotOf(friday, "friday")[0].annotation).toEqual({ kind: "weekly" });
});

it("keeps Easter as a holiday when a summer block follows the lecture period", () => {
  const typical = build(
    [
      ...fullSchedule(spring),
      ...series(
        "tutorial",
        [
          "2027-02-22",
          "2027-03-08",
          "2027-03-22",
          "2027-04-12",
          "2027-04-26",
          "2027-05-10",
          "2027-05-24",
        ],
        2,
        "16:15",
        "18:00",
      ),
      ...series(
        "summer",
        ["2027-07-05", "2027-07-12", "2027-07-19"],
        6,
        "09:15",
        "12:00",
      ),
    ],
    "SS-2027",
    ["tutorial", "summer"],
  );
  expect(typical.breakRuns.at(-1)).toEqual({
    from: "2027-06-07",
    to: "2027-07-04",
    weeks: 4,
  });
  expect(typical.holidayWeeks).toEqual(easter);
  expect(slotOf(typical, "tutorial")[0].annotation).toEqual({
    kind: "biweekly",
  });
});

it("counts irregular published dates and lists short series as other dates", () => {
  // The Thursday and Friday dates of the detail.html fixture course.
  const detail = [
    ...[
      "2026-09-17",
      "2026-10-08",
      "2026-10-15",
      "2026-10-29",
      "2026-11-12",
      "2026-11-26",
    ].map((date) => session("detail", date, "13:15", "17:00")),
    session("detail", "2026-12-04", "15:15", "17:00"),
    session("detail", "2026-12-11", "13:15", "17:00"),
  ];
  for (const events of [detail, [...fullSchedule(autumn), ...detail]]) {
    const typical = build(events, "AS-2026", ["detail"]);
    const [slot] = slotOf(typical, "detail");
    expect(slot.annotation).toEqual({
      kind: "count",
      count: 6,
      from: "2026-09-17",
      until: "2026-11-26",
    });
    expect(annotationText(slot.annotation, "en", "full")).toBe(
      "6× · 17.09.–26.11.",
    );
    expect(annotationText(slot.annotation, "fr", "short")).toBe("6×");
    expect(typical.otherDates).toEqual([
      {
        owner: "detail",
        title: "detail",
        dates: [
          {
            date: "2026-12-04",
            weekday: 5,
            startMinute: 915,
            endMinute: 1020,
            timeLabel: "15:15–17:00",
          },
          {
            date: "2026-12-11",
            weekday: 5,
            startMinute: 795,
            endMinute: 1020,
            timeLabel: "13:15–17:00",
          },
        ],
        runs: [
          { from: "2026-12-04", to: "2026-12-04", timeLabel: "15:15–17:00" },
          { from: "2026-12-11", to: "2026-12-11", timeLabel: "13:15–17:00" },
        ],
      },
    ]);
  }

  // block.html: Friday and Saturday of one weekend, and two more Saturdays.
  const typical = build(
    [
      ...fullSchedule(autumn),
      session("block", "2026-10-09", "09:15", "12:00"),
      session("block", "2026-10-09", "13:15", "17:00"),
      session("block", "2026-10-10", "09:15", "17:00"),
      ...series("twice", ["2026-10-19", "2026-11-02"], 6, "09:15", "12:00"),
      ...series("thrice", autumn.slice(0, 3), 6, "09:15", "12:00"),
    ],
    "AS-2026",
    ["block", "twice", "thrice"],
  );
  expect(MIN_GRID_WEEKS).toBe(3);
  expect(
    typical.slots.filter((slot) => slot.weekday >= 6).map((s) => s.owner),
  ).toEqual(["thrice"]);
  const block = typical.otherDates.find((group) => group.owner === "block")!;
  expect(block.dates.map((day) => day.timeLabel)).toEqual([
    "09:15–17:00",
    "09:15–17:00",
  ]);
  expect(block.runs).toEqual([
    { from: "2026-10-09", to: "2026-10-10", timeLabel: "09:15–17:00" },
  ]);
  expect(typical.otherDates.map((group) => group.owner)).toEqual([
    "block",
    "twice",
  ]);
});

it("draws recurring personal periods and keeps one-offs off the grid", () => {
  const events = [
    ...fullSchedule(autumn),
    ...personal("Work", autumn, 1, "18:00", "22:00").map((event, i) => ({
      ...event,
      title: ["Work", "work ", "  WORK"][i % 3],
    })),
    ...personal("Work", autumn, 4, "14:00", "18:00").map((event) => ({
      ...event,
      id: `thursday-${event.id}`,
      owner: `thursday-${event.owner}`,
    })),
    // A long workday stays on the grid; only full days are absences.
    ...personal("Office", autumn, 2, "06:30", "19:30"),
    ...personal("Dentist", ["2026-10-05"], 2, "09:00", "10:00"),
    // Before the lecture period (dropped) and outside the term (ignored).
    ...personal(
      "Summer job",
      ["2026-08-03", "2026-08-10", "2026-08-17"],
      1,
      "09:00",
      "12:00",
    ),
    ...personal("Spring job", spring, 1, "09:00", "12:00"),
  ];
  const typical = build(events);
  const work = typical.slots.filter(
    (slot) => slot.personal && slot.title === "Work",
  );
  expect(work.map((slot) => [slot.weekday, slot.timeLabel])).toEqual([
    [1, "18:00–22:00"],
    [4, "14:00–18:00"],
  ]);
  expect(work[0]).toMatchObject({
    owner: "Work-0",
    personal: true,
    annotation: { kind: "weekly" },
    rooms: { mode: "none", list: [] },
    sessionTypes: [],
    internalOverlap: false,
  });
  expect(work[0].event).toMatchObject({ personal: true, location: "" });
  const office = typical.slots.find((slot) => slot.title === "Office")!;
  expect(office.timeLabel).toBe("06:30–19:30");
  expect(typical.allDay).toEqual([]);
  expect(typical.absences).toEqual([]);
  expect(
    typical.slots.filter((slot) => slot.personal).map((slot) => slot.title),
  ).toEqual(["Work", "Office", "Work"]);
  expect(typical.personalOneOffs).toBe(1);

  // Without the flag, periods are recognised because no course owns them.
  const unflagged = build(
    events.map((event) => ({ ...event, personal: undefined })),
  );
  expect(unflagged).toEqual(typical);
});

it("keeps full-day periods out of the grid as all-day lines or absences", () => {
  const typical = build([
    ...fullSchedule(autumn),
    ...personal("Internship", autumn, 3, "00:00", "00:00").map((event) => ({
      ...event,
      end: localInstant(`${addDays(localDate(event.start), 1)}T00:00`),
    })),
    ...personal("Weekend away", autumn, 5, "18:00", "18:00").map((event) => ({
      ...event,
      end: localInstant(`${addDays(localDate(event.start), 2)}T18:00`),
    })),
    {
      id: "ski",
      owner: "ski",
      title: "Ski week",
      start: localInstant("2026-10-03T00:00"),
      end: localInstant("2026-10-10T00:00"),
      location: "",
      personal: true,
    },
  ]);
  expect(typical.slots.filter((slot) => slot.personal)).toEqual([]);
  expect(typical.allDay).toEqual([
    {
      label: "Internship",
      weekday: 3,
      weekdays: [3],
      startMinute: 0,
      endMinute: 1440,
      timeLabel: "00:00–24:00",
      weeks: autumn,
      dates: autumn.map((week) => addDays(week, 2)),
      annotation: { kind: "weekly" },
    },
  ]);
  expect(typical.absences).toEqual([
    {
      label: "Weekend away",
      start: "2026-09-18",
      end: "2026-12-20",
      recurring: {
        weekday: 5,
        endWeekday: 7,
        timeLabel: "18:00–18:00",
        annotation: { kind: "weekly" },
      },
    },
    { label: "Ski week", start: "2026-10-03", end: "2026-10-09" },
  ]);
});

it("draws a midnight-crossing period once, clipped at 24:00", () => {
  const typical = build([
    ...fullSchedule(autumn),
    ...personal("Night shift", autumn, 2, "22:00", "02:00"),
  ]);
  const [night] = typical.slots.filter((slot) => slot.personal);
  expect(night).toMatchObject({
    weekday: 2,
    startMinute: 1320,
    endMinute: 1560,
    timeLabel: "22:00–02:00",
    annotation: { kind: "weekly" },
  });
  const week = layoutWeek(typical.events, TYPICAL_REFERENCE_MONDAY);
  expect(
    week.days[1].lessons.find((lesson) => lesson.event.id === night.id),
  ).toMatchObject({ startMinute: 1320, endMinute: 1440 });
  expect(week.days[2].lessons.some((lesson) => lesson.event.personal)).toBe(
    false,
  );
});

it("merges session types of one slot and overlapping series of one course", () => {
  const stats = autumn.map((week, i) =>
    session("stats", week, "10:15", "12:00", {
      sessionType: i === 13 ? "Examen" : i % 2 ? "Exercice" : "Cours",
    }),
  );
  const typical = build(
    [
      ...fullSchedule(autumn),
      ...stats,
      ...series("robotics", autumn, 1, "10:15", "12:00"),
      ...series("prob", autumn, 2, "10:15", "12:00", { sessionType: "Cours" }),
      ...series("prob", autumn, 2, "11:15", "13:00", {
        sessionType: "Exercice",
        location: "PER 11",
      }),
      ...series("seq", autumn, 3, "13:15", "15:00", { sessionType: "Cours" }),
      ...series("seq", autumn, 3, "15:15", "17:00", {
        sessionType: "Exercice",
      }),
      ...series("seq", autumn, 3, "17:00", "18:00", { sessionType: "Tutorat" }),
    ],
    "AS-2026",
    ["stats", "robotics", "prob", "seq"],
  );
  const [slot] = slotOf(typical, "stats");
  expect(slotOf(typical, "stats")).toHaveLength(1);
  expect(slot.sessionTypes).toEqual(["Cours", "Exercice"]);
  expect(slot.event.sessionType).toBe("Cours / Exercice");
  expect(slot.annotation).toEqual({ kind: "weekly" });
  expect(slot.internalOverlap).toBe(false);

  const [prob] = slotOf(typical, "prob");
  expect(slotOf(typical, "prob")).toHaveLength(1);
  expect(prob).toMatchObject({
    timeLabel: "10:15–13:00",
    internalOverlap: true,
    annotation: { kind: "weekly" },
    rooms: { mode: "parallel", list: ["PER 08", "PER 11"] },
    parts: [
      {
        timeLabel: "10:15–12:00",
        sessionTypes: ["Cours"],
        annotation: { kind: "weekly" },
      },
      {
        timeLabel: "11:15–13:00",
        sessionTypes: ["Exercice"],
        annotation: { kind: "weekly" },
      },
    ],
  });
  expect(slotOf(typical, "seq").map((s) => s.timeLabel)).toEqual([
    "13:15–15:00",
    "15:15–17:00",
    "17:00–18:00",
  ]);
  expect(slotOf(typical, "seq").some((s) => s.internalOverlap)).toBe(false);

  const week = layoutWeek(typical.events, TYPICAL_REFERENCE_MONDAY);
  const lanes = (day: number, owner: string) =>
    week.days[day].lessons.find((lesson) => lesson.event.owner === owner)!
      .lanes;
  expect(lanes(0, "stats")).toBe(2);
  expect(lanes(0, "robotics")).toBe(2);
  expect(lanes(1, "prob")).toBe(1);
});

const meeting = (
  start: string,
  end: string,
  note: string,
  location: string,
): Meeting => ({
  starts_at: start,
  ends_at: end,
  recurrence: "FREQ=WEEKLY;COUNT=14",
  location,
  note,
  unresolved: false,
  cancelled: false,
  excluded_dates: [],
  additional_dates: [],
});
const maths: Selection = {
  id: "maths",
  code: "MATH",
  titles: { en: "Analysis I" },
  ects: 6,
  status: "planned",
  semester: "AS-2026",
  pinned: false,
  offering: {
    source_id: "maths",
    terms: ["AS-2026"],
    meetings: [
      meeting(
        "2026-09-14T10:15:00+02:00",
        "2026-09-14T12:00:00+02:00",
        "Cours",
        "PER 08",
      ),
      meeting(
        "2026-09-17T13:15:00+02:00",
        "2026-09-17T15:00:00+02:00",
        "Exercice",
        "PER 11",
      ),
    ],
    meeting_state: "resolved",
    source_url: "https://www.unifr.ch",
    snapshot_id: "s",
    development_fixture: false,
  },
};
const fromCourse = (course: Selection) =>
  buildTypicalWeek(calendarFor([course], "AS-2026", "en").events, "AS-2026", {
    courseIds: new Set([course.id]),
  });

it("keeps a lecture and its exercise on other weekdays apart and applies attendance", () => {
  const all = fromCourse(maths);
  expect(
    all.slots.map((slot) => [slot.owner, slot.weekday, slot.timeLabel]),
  ).toEqual([
    ["maths", 1, "10:15–12:00"],
    ["maths", 4, "13:15–15:00"],
  ]);
  expect(all.slots.every((slot) => slot.title === "Analysis I")).toBe(true);
  expect(all.slots.some((slot) => slot.internalOverlap)).toBe(false);
  expect(all.slots.map((slot) => slot.annotation)).toEqual([
    { kind: "weekly" },
    { kind: "weekly" },
  ]);

  const chosen = { ...maths, attendance: attendanceChoice(maths, [1]) };
  expect(fromCourse(chosen).slots.map((slot) => slot.weekday)).toEqual([1]);

  // A changed source makes the choice stale, so every session returns.
  const stale = fromCourse({
    ...chosen,
    offering: {
      ...chosen.offering!,
      meetings: chosen.offering!.meetings.map((m, i) =>
        i === 1 ? { ...m, location: "PER 12" } : m,
      ),
    },
  });
  expect(stale.slots.map((slot) => slot.weekday)).toEqual([1, 4]);
  expect(stale.slots[1].rooms).toEqual({ mode: "one", list: ["PER 12"] });
});

it("reports parallel, varying, single and missing rooms", () => {
  const parallel = autumn.flatMap((week) => [
    session("groups", week, "10:15", "12:00", {
      id: `a-${week}`,
      sessionType: "Cours",
      location: "A",
    }),
    session("groups", week, "10:15", "12:00", {
      id: `b-${week}`,
      sessionType: "Exercice",
      location: "B",
    }),
  ]);
  const typical = build(
    [
      ...parallel,
      ...autumn.map((week, i) =>
        session("varies", addDays(week, 1), "10:15", "12:00", {
          location: i < 10 ? "PER 08" : "PER 11",
        }),
      ),
      ...autumn.map((week, i) =>
        session("tie", addDays(week, 2), "10:15", "12:00", {
          location: i % 2 ? "PER 08" : "PER 11",
        }),
      ),
      ...series("one", autumn, 4, "10:15", "12:00"),
      ...series("none", autumn, 5, "10:15", "12:00", { location: " " }),
    ],
    "AS-2026",
    ["groups", "varies", "tie", "one", "none"],
  );
  expect(slotOf(typical, "groups")).toHaveLength(1);
  expect(slotOf(typical, "groups")[0]).toMatchObject({
    rooms: { mode: "parallel", list: ["A", "B"] },
    sessionTypes: ["Cours", "Exercice"],
    internalOverlap: true,
  });
  expect(slotOf(typical, "varies")[0].rooms).toEqual({
    mode: "varies",
    list: ["PER 08", "PER 11"],
  });
  expect(slotOf(typical, "tie")[0].rooms.list[0]).toBe("PER 11");
  expect(slotOf(typical, "one")[0].rooms).toEqual({
    mode: "one",
    list: ["PER 08"],
  });
  expect(slotOf(typical, "none")[0].rooms).toEqual({ mode: "none", list: [] });
  expect(internalOverlapOwners(parallel)).toEqual(["groups"]);
});

it("finds only real overlaps within one course", () => {
  const cours = session("c", "2026-09-21", "10:15", "12:00");
  expect(
    internalOverlapOwners([
      cours,
      { ...cours, id: "duplicate" },
      session("other", "2026-09-21", "11:15", "13:00"),
      { ...session("c", "2026-09-21", "11:15", "12:15"), personal: true },
    ]),
  ).toEqual([]);
  expect(
    internalOverlapOwners([
      session("b", "2026-09-21", "13:15", "15:00"),
      session("a", "2026-09-21", "10:15", "12:00"),
      session("a", "2026-09-21", "11:45", "13:00"),
    ]),
  ).toEqual(["a"]);
});

it("counts duplicate rows once and handles a start at 23:59:45", () => {
  const duplicated = ["2026-09-21", "2026-09-28"].flatMap((date) => [
    session("dup", date, "10:15", "12:00"),
    session("dup", date, "10:15", "12:00", { id: `copy-${date}` }),
  ]);
  const late = personal("Late", autumn, 2, "00:30", "00:30").map((event) => ({
    ...event,
    start: Temporal.PlainDateTime.from(
      `${addDays(localDate(event.start), -1)}T23:59:45`,
    )
      .toZonedDateTime(zone)
      .toInstant()
      .toString(),
  }));
  let typical: TypicalWeek | undefined;
  expect(() => {
    typical = build(
      [...fullSchedule(autumn), ...duplicated, ...late],
      "AS-2026",
      ["dup"],
    );
  }).not.toThrow();
  expect(slotOf(typical!, "dup")).toEqual([]);
  expect(typical!.otherDates[0].dates).toHaveLength(2);
  expect(typical!.slots.find((slot) => slot.personal)).toMatchObject({
    weekday: 1,
    startMinute: 1439,
    timeLabel: "23:59–00:30",
  });
});

it("drops personal series and span without recurring classes", () => {
  const typical = build(
    [
      ...personal("Work", autumn, 1, "18:00", "22:00"),
      ...series("once", ["2026-09-21"], 1, "10:15", "12:00"),
    ],
    "AS-2026",
    ["once"],
  );
  expect(typical).toMatchObject({
    slots: [],
    events: [],
    teachingWeeks: [],
    holidayWeeks: [],
    breakRuns: [],
    personalOneOffs: 14,
  });
  expect(typical.span).toBeUndefined();
  expect(typical.otherDates.map((group) => group.owner)).toEqual(["once"]);
});

it("classifies series directly", () => {
  const context = {
    teaching: autumn,
    holidays: [],
    span: { firstWeek: autumn[0], lastWeek: autumn.at(-1)! },
  };
  const classify = (weeks: string[], teaching = autumn) =>
    classifySeries(weeks, weeks, { ...context, teaching });
  expect(classify(autumn)).toEqual({ kind: "weekly" });
  expect(classify(autumn.filter((_, i) => i !== 5))).toEqual({
    kind: "weekly",
  });
  // Two missed weeks in a row are not an occasional skip.
  expect(classify(autumn.filter((_, i) => i !== 5 && i !== 6))).toMatchObject({
    kind: "count",
    count: 12,
  });
  const odd = autumn.filter((_, i) => i % 2 === 1);
  expect(classify(odd, odd)).toEqual({ kind: "biweekly" });
  expect(classify(odd.slice(2), autumn)).toEqual({
    kind: "biweekly",
    from: "2026-10-19",
    until: "2026-12-14",
  });
  expect(classify(autumn.slice(0, 2))).toEqual({
    kind: "count",
    count: 2,
    from: "2026-09-14",
    until: "2026-09-21",
  });
});

it.each([
  [
    "en",
    [
      "from 28.09.",
      "until 20.11.",
      "28.09.–20.11.",
      "every 2 weeks",
      "every 2 wk",
      "every 2 weeks · 28.09.–20.11.",
      "6× · 28.09.–20.11.",
      "6×",
    ],
  ],
  [
    "de",
    [
      "ab 28.09.",
      "bis 20.11.",
      "28.09.–20.11.",
      "alle 2 Wochen",
      "alle 2 Wo.",
      "alle 2 Wochen · 28.09.–20.11.",
      "6× · 28.09.–20.11.",
      "6×",
    ],
  ],
  [
    "fr",
    [
      "dès le 28.09.",
      "jusqu’au 20.11.",
      "28.09.–20.11.",
      "une semaine sur deux",
      "1 sem. sur 2",
      "une semaine sur deux · 28.09.–20.11.",
      "6× · 28.09.–20.11.",
      "6×",
    ],
  ],
] as const)("writes annotation marks in %s", (language, expected) => {
  const from = "2026-09-28",
    until = "2026-11-20";
  expect([
    annotationText({ kind: "weekly", from }, language, "full"),
    annotationText({ kind: "weekly", until }, language, "short"),
    annotationText({ kind: "weekly", from, until }, language, "full"),
    annotationText({ kind: "biweekly" }, language, "full"),
    annotationText({ kind: "biweekly", from, until }, language, "short"),
    annotationText({ kind: "biweekly", from, until }, language, "full"),
    annotationText({ kind: "count", count: 6, from, until }, language, "full"),
    annotationText({ kind: "count", count: 6, from, until }, language, "short"),
  ]).toEqual(expected);
});

const everything = () => [
  ...fullSchedule(autumn),
  ...series(
    "seminar",
    autumn.filter((_, i) => i % 2 === 0),
    2,
    "16:15",
    "18:00",
  ),
  ...series("prob", autumn, 2, "10:15", "12:00", { sessionType: "Cours" }),
  ...series("prob", autumn, 2, "11:15", "13:00", { sessionType: "Exercice" }),
  session("block", "2026-10-09", "09:15", "17:00"),
  session("block", "2026-10-10", "09:15", "17:00"),
  ...personal("Work", autumn, 1, "18:00", "22:00"),
  ...personal("Night", autumn, 4, "22:00", "02:00"),
  ...personal("Dentist", ["2026-10-05"], 2, "09:00", "10:00"),
  ...personal("Internship", autumn, 3, "00:00", "00:00").map((event) => ({
    ...event,
    end: localInstant(`${addDays(localDate(event.start), 1)}T00:00`),
  })),
];

it("builds deterministic output from shuffled input", () => {
  const events = everything();
  const owners = ["seminar", "prob", "block"];
  const typical = build(events, "AS-2026", owners);
  const shuffled = [...events]
    .map((event, i) => ({ event, rank: (i * 7919) % events.length }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ event }) => event);
  expect(build(shuffled, "AS-2026", owners)).toEqual(typical);
  expect(build([...events].reverse(), "AS-2026", owners)).toEqual(typical);
  expect(typical.slots.map((slot) => slot.id)).toEqual(
    typical.slots.map((_, i) => `typical-${String(i).padStart(4, "0")}`),
  );
  expect(typical.events).toEqual(typical.slots.map((slot) => slot.event));
});

it("keeps the reference week out of everything but the synthetic events", () => {
  const typical = build(everything(), "AS-2026", ["seminar", "prob", "block"]);
  const visible = {
    ...typical,
    events: [],
    slots: typical.slots.map((slot) => ({ ...slot, event: null })),
  };
  expect(JSON.stringify(visible)).not.toContain("2001");
  for (const slot of typical.slots)
    for (const language of ["en", "de", "fr"] as const)
      expect(annotationText(slot.annotation, language, "full")).not.toContain(
        "2001",
      );
  for (const event of typical.events) {
    expect(localDate(event.start) >= TYPICAL_REFERENCE_MONDAY).toBe(true);
    expect(localDate(event.end) <= "2001-01-08").toBe(true);
    expect(Date.parse(event.end)).toBeGreaterThan(Date.parse(event.start));
  }
});
