import { readFileSync } from "node:fs";
import { Temporal } from "@js-temporal/polyfill";
import { expect, it } from "vitest";
import type { Language } from "../i18n";
import { attendanceChoice } from "./attendance";
import { localDate, localInstant, type CalendarEvent } from "./calendar";
import type { Selection } from "./domain";
import { timetableMessages } from "./timetable-messages";
import {
  buildTypicalWeek,
  type TypicalAnnotation,
  type TypicalSlot,
} from "./typical-week";
import {
  blockLines,
  gridMm,
  textMm,
  WALL_MM,
  wallPrintHtml,
  weekAccents,
} from "./wall-print";
import { courseColour } from "./week-layout";
import { weekColours, type WeeklyExport } from "./weekly-export";

const addDays = (date: string, days: number) =>
  Temporal.PlainDate.from(date).add({ days }).toString();
/** Mondays of a 14-week autumn 2026 lecture period. */
const autumn = Array.from({ length: 14 }, (_, i) =>
  addDays("2026-09-14", 7 * i),
);
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
/** A course with one dated meeting in its semester. */
const course = (id: string, extra: Partial<Selection> = {}): Selection => {
  const term = extra.semester ?? "AS-2026",
    date = term === "AS-2026" ? "2026-09-14" : "2027-02-22";
  return {
    id,
    code: `CODE-${id}`,
    titles: { en: id },
    ects: 3,
    status: "planned",
    semester: term,
    pinned: false,
    offering: {
      source_id: id,
      terms: [term],
      meeting_state: "resolved",
      source_url: "https://www.unifr.ch",
      snapshot_id: "snapshot",
      development_fixture: false,
      meetings: [
        {
          starts_at: `${date}T08:15:00Z`,
          ends_at: `${date}T10:00:00Z`,
          location: "PER 08",
          unresolved: false,
          cancelled: false,
          excluded_dates: [],
          additional_dates: [],
          note: "",
        },
      ],
    },
    ...extra,
  };
};
const base: WeeklyExport = {
  name: "CS & BI <week>",
  term: "AS-2026",
  monday: "2026-09-21",
  language: "en",
  courses: [],
  unresolved: false,
  events: [],
};
/** Without explicit courses, every non-personal owner is a planned course. */
const sheet = (input: Partial<WeeklyExport>, generated?: Date) => {
  const courses =
    input.courses ??
    [
      ...new Set(
        (input.events ?? []).filter((e) => !e.personal).map((e) => e.owner),
      ),
    ].map((id) => course(id));
  const html = wallPrintHtml({ ...base, ...input, courses }, generated);
  return { html, doc: new DOMParser().parseFromString(html, "text/html") };
};
const blocks = (doc: Document, text: string) =>
  [...doc.querySelectorAll<HTMLElement>(".wall-block")].filter((block) =>
    block.textContent!.includes(text),
  );
const slot = (
  title: string,
  annotation: TypicalAnnotation,
  extra: Partial<TypicalSlot> = {},
): TypicalSlot => ({
  id: "typical-0000",
  event: session("x", "2001-01-01", "10:15", "12:00"),
  owner: "x",
  personal: false,
  title,
  weekday: 1,
  startMinute: 615,
  endMinute: 720,
  timeLabel: "10:15–12:00",
  sessionTypes: ["Cours"],
  rooms: { mode: "one", list: ["PER 08"] },
  weeks: [],
  dates: [],
  annotation,
  internalOverlap: false,
  ...extra,
});
const kinds = (lines: ReturnType<typeof blockLines>["lines"]) =>
  lines.map((line) => line.kind);

it.each<Language>(["en", "de", "fr"])(
  "prints exactly one landscape A4 sheet with a print button in %s",
  (language) => {
    const { html, doc } = sheet({
      language,
      events: series("maths", autumn, 1, "10:15", "12:00"),
      courses: [course("maths")],
    });
    expect(doc.querySelectorAll(".wall-sheet")).toHaveLength(1);
    expect(html).toContain("@page{size:A4 landscape;margin:8mm}");
    expect(doc.getElementById("print")).not.toBeNull();
    expect(html).toMatch(/\.tools button\{[^}]*min-height:44px/);
    const tools = doc.querySelector(".tools")!.textContent!;
    expect(tools.match(/A4/g)).toHaveLength(1);
    expect(tools).not.toContain("Letter");
    expect(html).toContain("minmax(0,1fr)");
    // The reference week the slots are laid out on is never printed.
    expect(html).not.toContain("2001");
    expect(doc.querySelector(".week-key, .lesson-list")).toBeNull();
  },
);

it("escapes plan names, course titles and personal labels", () => {
  const { html, doc } = sheet({
    events: [
      ...series("x", autumn, 1, "10:15", "12:00", {
        title: '<img src=x onerror="alert(1)">',
        location: "A & B",
      }),
      ...personal("Job <b>", autumn, 2, "18:00", "22:00"),
    ],
    courses: [course("x")],
  });
  expect(doc.querySelector("img, .wall-block b b")).toBeNull();
  expect(doc.querySelector("h1")!.textContent).toBe("CS & BI <week>");
  expect(html).toContain("CS &amp; BI &lt;week&gt;");
  expect(blocks(doc, '<img src=x onerror="alert(1)">')).toHaveLength(1);
  expect(blocks(doc, "A & B")).toHaveLength(1);
  expect(doc.querySelector(".personal")!.textContent).toContain("Job <b>");
});

it("marks slots that do not run every week in text and with a dashed bar", () => {
  const { doc } = sheet({
    events: [
      ...series("weekly", autumn, 1, "08:15", "10:00"),
      ...series(
        "biweekly",
        autumn.filter((_, i) => i % 2 === 0),
        2,
        "10:15",
        "12:00",
      ),
      ...[
        "2026-09-17",
        "2026-10-08",
        "2026-10-15",
        "2026-10-29",
        "2026-11-12",
        "2026-11-26",
      ].map((date) => session("irregular", date, "13:15", "17:00")),
      ...series("late", autumn.slice(2), 5, "10:15", "12:00"),
    ],
    courses: ["weekly", "biweekly", "irregular", "late"].map((id) =>
      course(id),
    ),
  });
  const [weekly] = blocks(doc, "weekly"),
    [biweekly] = blocks(doc, "biweekly"),
    [irregular] = blocks(doc, "irregular"),
    [late] = blocks(doc, "late");
  expect(weekly.querySelector(".time")!.textContent).toBe("08:15–10:00");
  expect(weekly.classList.contains("not-weekly")).toBe(false);
  expect(biweekly.textContent).toContain("10:15–12:00 · every 2 weeks");
  expect(biweekly.classList.contains("not-weekly")).toBe(true);
  expect(irregular.textContent).toContain("13:15–17:00 · 6× · 17.09.–26.11.");
  expect(irregular.classList.contains("not-weekly")).toBe(true);
  expect(late.textContent).toContain("10:15–12:00 · from 02.10.");
  expect(late.classList.contains("not-weekly")).toBe(false);
});

it("hatches personal commitments with their label and time only", () => {
  const { html, doc } = sheet({
    events: [
      ...series("maths", autumn, 1, "10:15", "12:00"),
      ...personal("Work", autumn, 1, "18:00", "22:00"),
      ...personal("Dentist", ["2026-10-05"], 3, "09:00", "10:00"),
    ],
    courses: [course("maths")],
  });
  const [work] = doc.querySelectorAll<HTMLElement>(".wall-block.personal");
  expect(doc.querySelectorAll(".wall-block.personal")).toHaveLength(1);
  expect(work.className).not.toMatch(/course-colour/);
  expect([...work.children].map((line) => line.textContent).join(" | ")).toBe(
    "Work | 18:00–22:00",
  );
  expect(doc.body.textContent).not.toContain("Personal unavailable period");
  expect(doc.body.textContent).not.toContain("Dentist");
  expect(doc.querySelector(".wall-notes")!.textContent).toContain(
    "Other commitment: 1 one-off date",
  );
  // Without a course colour the accent bar needs its own colour, or the whole
  // left border is dropped; dashed "not every week" must still win over dotted.
  expect(html).toContain(".wall-block.personal{--accent:#33414b;");
  expect(html.indexOf(".wall-block.not-weekly{")).toBeGreaterThan(
    html.indexOf(".wall-block.personal{"),
  );
});

it("colours classes like the screen timetable, by course code", () => {
  const maths = course("maths", { code: "MAT.01010" });
  const { html, doc } = sheet({
    events: [
      ...series("maths", autumn, 1, "10:15", "12:00", { sessionType: "Cours" }),
      ...series("maths", autumn, 4, "13:15", "15:00", {
        sessionType: "Exercices",
      }),
    ],
    courses: [maths],
  });
  const colour = `course-colour-${courseColour(maths.code)}`;
  expect(courseColour(maths.code)).not.toBe(courseColour(maths.id));
  expect(
    [...doc.querySelectorAll(".wall-block")].map((block) =>
      block.classList.contains(colour),
    ),
  ).toEqual([true, true]);
  weekColours.forEach((fill, i) => {
    expect(html).toContain(
      `.course-colour-${i}{--fill:#${fill};--accent:#${weekAccents[i]}}`,
    );
    const rule = readFileSync("src/planner/timetable.css", "utf8")
      .split(`.course-colour-${i} {`)[1]
      .split("}")[0]
      .toUpperCase();
    expect(rule).toContain(`#${weekAccents[i]};`);
    expect(rule).toContain(`#${fill};`);
  });
});

it("adds weekend columns only for slots drawn on the grid", () => {
  const weekday = series("maths", autumn, 1, "10:15", "12:00");
  const heads = (events: CalendarEvent[]) =>
    [...sheet({ events }).doc.querySelectorAll(".day-head b")].map(
      (head) => head.textContent,
    );
  expect(heads(weekday)).toEqual([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
  ]);
  expect(
    heads([...weekday, ...series("sat", autumn, 6, "09:15", "12:00")]),
  ).toEqual([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ]);
  // A two-date block course stays in the footer and adds no column.
  const block = sheet({
    events: [
      ...weekday,
      session("block", "2026-10-09", "09:15", "17:00"),
      session("block", "2026-10-10", "09:15", "17:00"),
    ],
  }).doc;
  expect(block.querySelectorAll(".day-head")).toHaveLength(5);
  expect(block.querySelector(".wall-notes")!.textContent).toContain(
    "Other dates: block Fri 09.10.–Sat 10.10. 09:15–17:00",
  );
});

it.each<[Language, string]>([
  ["en", "Other dates: block Fri 09.10.–Sat 10.10. 09:00–17:00"],
  ["de", "Weitere Termine: block Fr 09.10.–Sa 10.10. 09:00–17:00"],
  ["fr", "Autres dates: block ven. 09.10.–sam. 10.10. 09:00–17:00"],
])(
  "lists a course event longer than a day to its last date in %s",
  (language, text) => {
    const { doc } = sheet({
      language,
      events: [
        ...series("maths", autumn, 1, "10:15", "12:00"),
        {
          ...session("block", "2026-10-09", "09:00", "17:00"),
          end: localInstant("2026-10-10T17:00"),
        },
      ],
    });
    expect(doc.querySelector(".wall-notes")!.textContent).toContain(text);
  },
);

it("fits the hour window tightly to the typical week", () => {
  const ruler = (events: CalendarEvent[]) =>
    [...sheet({ events }).doc.querySelectorAll(".wall-ruler span")].map(
      (label) => label.textContent,
    );
  const day = ruler([
    ...series("a", autumn, 1, "08:15", "10:00"),
    ...series("b", autumn, 2, "18:15", "19:45"),
  ]);
  expect([day[0], day.at(-1), day.length]).toEqual(["08:00", "20:00", 13]);
  // A lone short class still gets a readable grid.
  expect(ruler(series("a", autumn, 1, "10:15", "12:00"))).toEqual([
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
  ]);
});

it("summarises each day neutrally and heads it with recurring all-day entries", () => {
  const { doc } = sheet({
    events: [
      ...series("a", autumn, 1, "08:15", "10:00"),
      ...series("b", autumn, 1, "15:15", "17:00"),
      // Twice in the term only: listed below, not in the day summary.
      session("rare", "2026-09-14", "18:15", "20:00"),
      session("rare", "2026-09-21", "18:15", "20:00"),
      ...personal("Internship", autumn, 3, "00:00", "00:00").map((event) => ({
        ...event,
        end: localInstant(`${addDays(localDate(event.start), 1)}T00:00`),
      })),
    ],
  });
  const heads = [...doc.querySelectorAll(".day-head")].map((head) =>
    [...head.children].map((line) => line.textContent),
  );
  expect(heads[0]).toEqual(["Monday", "08:15–17:00"]);
  expect(heads[1]).toEqual(["Tuesday", "No fixed commitments"]);
  // An all-day day is neither called free nor left blank.
  expect(heads[2]).toEqual(["Wednesday", "All day: Internship"]);
  expect(
    [...doc.querySelectorAll(".wall-day")].map(
      (day) => day.querySelectorAll(".wall-all-day").length,
    ),
  ).toEqual([0, 0, 1, 0, 0]);
});

it("lists irregular dates, breaks, missing dates, absences and notes in order", () => {
  const spring = Array.from({ length: 15 }, (_, i) =>
    addDays("2027-02-22", 7 * i),
  ).filter((week) => !["2027-03-29", "2027-04-05"].includes(week));
  const choice = course("chosen", { semester: "SS-2027" });
  choice.offering!.terms = ["SS-2027"];
  choice.offering!.meetings = [
    {
      ...choice.offering!.meetings[0],
      starts_at: "2027-02-22T09:15:00Z",
      ends_at: "2027-02-22T11:00:00Z",
    },
    {
      ...choice.offering!.meetings[0],
      starts_at: "2027-02-22T09:15:00Z",
      ends_at: "2027-02-22T11:00:00Z",
      location: "PER 21",
    },
  ];
  choice.attendance = attendanceChoice(choice, [1]);
  const { doc } = sheet(
    {
      term: "SS-2027",
      events: [
        ...series("chosen", spring, 1, "10:15", "12:00"),
        ...series("parallel", spring, 2, "10:15", "12:00"),
        ...series("parallel", spring, 2, "10:15", "12:00", {
          location: "PER 21",
        }).map((event, i) => ({ ...event, id: `parallel-b-${i}` })),
        session("block", "2027-03-05", "09:15", "17:00"),
        {
          id: "ski",
          owner: "ski",
          title: "Ski week",
          start: localInstant("2027-03-13T00:00"),
          end: localInstant("2027-03-20T00:00"),
          location: "",
          personal: true,
        },
      ],
      courses: [
        choice,
        course("parallel", { semester: "SS-2027" }),
        course("block", { semester: "SS-2027" }),
        course("missing", { semester: "SS-2027", offering: null }),
      ],
    },
    new Date("2027-02-10T12:00:00Z"),
  );
  const notes = [...doc.querySelectorAll(".wall-notes > span")].map(
    (note) => note.textContent,
  );
  expect(notes).toEqual([
    "Other dates: block Fri 05.03. 09:15–17:00",
    "Weeks without classes: 29.03.–11.04.",
    "Dates not published or incomplete: missing",
    "Away: Ski week 13.03.–19.03.",
    timetableMessages.en.wallOverlapNote,
    timetableMessages.en.wallAttendance,
  ]);
  expect(blocks(doc, "parallel")[0].textContent).toContain("PER 08 / PER 21");
  const meta = doc.querySelector(".wall-meta")!.textContent!;
  expect(meta).toMatch(
    /^Typical week: holidays, cancellations and one-off changes are not shown\. · UniFr Planner · Generated 10\.02\.2027 · /,
  );
  expect(doc.querySelector(".wall-legend")!.textContent).toBe(
    [
      "Class at university",
      "Other commitment",
      "Not every week",
      "6× = on 6 weeks only",
      "Blank = no fixed commitment",
    ].join(""),
  );
});

it.each<[Language, string, string]>([
  [
    "en",
    "Typical semester week · Autumn 2026",
    "14 weeks with classes · 14.09.2026–14.12.2026",
  ],
  [
    "de",
    "Typische Semesterwoche · Herbst 2026",
    "14 Wochen mit Unterricht · 14.09.2026–14.12.2026",
  ],
  [
    "fr",
    "Semaine type du semestre · Automne 2026",
    "14 semaines de cours · 14.09.2026–14.12.2026",
  ],
])(
  "heads the sheet with the term and teaching span in %s",
  (language, title, span) => {
    const { doc } = sheet({
      language,
      events: series("maths", autumn, 1, "10:15", "12:00"),
    });
    expect(doc.querySelector(".wall-head strong")!.textContent).toBe(title);
    expect(doc.querySelector(".wall-head p")!.textContent).toBe(span);
    expect(doc.title).toBe(`CS & BI <week> · ${title}`);
  },
);

it("heads the sheet with the whole period when most courses end early", () => {
  const { doc } = sheet({
    language: "de",
    events: [
      ...series("full", autumn, 1, "10:15", "12:00"),
      ...series("seven", autumn.slice(0, 7), 2, "10:15", "12:00"),
      ...series("six", autumn.slice(0, 6), 3, "10:15", "12:00"),
    ],
  });
  expect(doc.querySelector(".wall-head p")!.textContent).toBe(
    "14 Wochen mit Unterricht · 14.09.2026–14.12.2026",
  );
  expect(blocks(doc, "full")[0].textContent).toContain("bis 14.12.");
});

it("keeps an empty term on one sheet with an explanation", () => {
  const { doc } = sheet({
    events: [session("once", "2026-10-05", "10:15", "12:00")],
    courses: [course("once"), course("missing", { offering: null })],
  });
  expect(doc.querySelectorAll(".wall-sheet")).toHaveLength(1);
  expect(doc.querySelector(".wall-empty")!.textContent).toBe(
    timetableMessages.en.wallEmpty,
  );
  expect(doc.querySelector(".wall-block, .wall-stack, .day-head")).toBeNull();
  expect(doc.getElementById("print")).not.toBeNull();
  expect(doc.querySelector(".wall-notes")!.textContent).toBe(
    "Other dates: once Mon 05.10. 10:15–12:00 · Dates not published or incomplete: missing",
  );
  expect(doc.querySelector(".wall-head p")).toBeNull();
});

it("fills blocks by priority and never drops the time or the mark", () => {
  const column = (WALL_MM.width - WALL_MM.ruler) / 5 - 0.2;
  const wide = column - WALL_MM.laneGap,
    third = column / 3 - WALL_MM.laneGap;
  const grid = gridMm(WALL_MM.dayHead);
  const height = (minutes: number, window: number) => (grid * minutes) / window;
  const long = "Histoire de l’art médiéval et moderne en Suisse romande";
  const count: TypicalAnnotation = {
    kind: "count",
    count: 6,
    from: "2026-09-17",
    until: "2026-11-26",
  };

  // 45 minutes in a 12-hour window: title and time only.
  const short = blockLines(
    slot("Analysis", { kind: "weekly" }),
    wide,
    height(45, 720),
    "en",
  );
  expect(short).toEqual({
    narrow: false,
    lines: [
      { kind: "title", text: "Analysis", lines: 1 },
      { kind: "time", text: "10:15–12:00" },
    ],
  });

  // 1h45 in a 17-hour window: the session type goes first.
  const tall = blockLines(
    slot(long, count, { timeLabel: "13:15–17:00" }),
    wide,
    height(105, 1020),
    "en",
  );
  expect(tall.lines).toEqual([
    { kind: "title", text: long, lines: 2 },
    { kind: "time", text: "13:15–17:00 · 6× · 17.09.–26.11." },
    { kind: "detail", text: "PER 08" },
  ]);

  // Two lanes: "6×" joins the time and its dates follow on their own line.
  expect(
    blockLines(
      slot("Histoire", count, { timeLabel: "13:15–17:00" }),
      column / 2 - WALL_MM.laneGap,
      height(225, 720),
      "en",
    ).lines.slice(1, 3),
  ).toEqual([
    { kind: "time", text: "13:15–17:00 · 6×" },
    { kind: "mark", text: "17.09.–26.11." },
  ]);

  // Three lanes: smaller type, the mark gets its own short line.
  const lane = blockLines(
    slot(long, { kind: "biweekly" }),
    third,
    height(105, 720),
    "en",
  );
  expect(third).toBeGreaterThanOrEqual(WALL_MM.minLane);
  expect(lane.narrow).toBe(true);
  expect(kinds(lane.lines)).toEqual([
    "title",
    "time",
    "mark",
    "detail",
    "detail",
  ]);
  expect(lane.lines[0]).toMatchObject({ lines: 2 });
  expect(lane.lines[2]).toEqual({ kind: "mark", text: "every 2 wk" });
  expect(textMm("10:15–12:00", 7, true) * 1.03).toBeLessThan(
    third - WALL_MM.chrome,
  );

  // Too short for a mark line: the mark leads the title.
  expect(
    blockLines(slot(long, { kind: "biweekly" }), third, height(45, 720), "en")
      .lines,
  ).toEqual([
    { kind: "title", text: long, lines: 1, prefix: "every 2 wk" },
    { kind: "time", text: "10:15–12:00" },
  ]);

  // A sliver still shows the start, the mark and the title on one line.
  expect(
    blockLines(slot("Lab", count), wide, WALL_MM.minBlock, "de").lines,
  ).toEqual([{ kind: "one", text: "10:15 6× Lab" }]);
});

it("collapses more lanes than fit into one list block", () => {
  const four = ["a", "b", "c", "d"].flatMap((id, i) =>
    series(id, autumn, 3, `14:1${i}`, "16:00"),
  );
  const { doc } = sheet({ events: four });
  expect(doc.querySelectorAll(".wall-block")).toHaveLength(0);
  const [stack] = doc.querySelectorAll(".wall-stack");
  expect(
    [...stack.querySelectorAll(".stack-line")].map((line) => line.textContent),
  ).toEqual([
    "14:10–16:00 a",
    "14:11–16:00 b",
    "14:12–16:00 c",
    "14:13–16:00 d",
  ]);

  const three = sheet({ events: four.filter((e) => e.owner !== "d") }).doc;
  expect(three.querySelector(".wall-stack")).toBeNull();
  expect(
    [...three.querySelectorAll(".wall-block")].map((block) =>
      block.getAttribute("style")!.split(";").at(-1),
    ),
  ).toEqual(Array(3).fill("width:calc(33.333% - 0.6mm)"));

  // Beyond what the stack can list, the rest is counted.
  const crowd = sheet({
    events: [
      ...series("early", autumn, 1, "07:15", "08:00"),
      ...series("late", autumn, 1, "23:00", "23:45"),
      ...Array.from({ length: 9 }, (_, i) =>
        series(`c${i}`, autumn, 3, "10:15", "11:00"),
      ).flat(),
    ],
  }).doc;
  const lines = [...crowd.querySelectorAll(".wall-stack .stack-line")];
  expect(lines.at(-1)!.textContent).toMatch(/^\+\d+ more$/);
  expect(lines.length).toBeLessThan(9);
});

it.each<[Language, RegExp]>([
  ["en", /\b(you|your)\b/i],
  ["de", /\b(du|dein\w*|dich|dir)\b/i],
  ["fr", /\b(vous|votre|vos)\b/i],
])("addresses nobody on the %s sheet", (language, pronoun) => {
  const stale = course("stale");
  stale.offering!.meetings.push({
    ...stale.offering!.meetings[0],
    location: "PER 21",
  });
  stale.attendance = attendanceChoice(stale, [1]);
  stale.offering!.meetings[1].location = "Changed";
  const { doc } = sheet({
    language,
    events: [
      ...series("stale", autumn, 1, "10:15", "12:00"),
      ...personal("Work", autumn, 2, "18:00", "22:00"),
    ],
    courses: [stale, course("missing", { offering: null })],
  });
  const text = doc.body.textContent!;
  expect(text).toContain(timetableMessages[language].wallStale);
  expect(text).not.toContain(timetableMessages[language].stale);
  expect(text).not.toMatch(pronoun);
});

it("builds on the typical week without reading the dated flags", () => {
  const events = series("maths", autumn, 1, "10:15", "12:00");
  const typical = buildTypicalWeek(events, "AS-2026", {
    courseIds: new Set(["maths"]),
  });
  const { doc } = sheet({ events, unresolved: true });
  expect(doc.querySelectorAll(".wall-block")).toHaveLength(
    typical.slots.length,
  );
  expect(doc.body.textContent).not.toContain(
    "Some courses have unpublished or incomplete dates",
  );
});
