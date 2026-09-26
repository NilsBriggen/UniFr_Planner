import { expect, it } from "vitest";
import type { CalendarEvent } from "./calendar";
import type { WeeklyExport } from "./weekly-export";
import { weeklyPrintHtml } from "./weekly-print";

const week = (
  events: CalendarEvent[],
  language: WeeklyExport["language"] = "en",
): WeeklyExport => ({
  name: "Printed week",
  term: "AS-2026",
  monday: "2026-09-21",
  language,
  courses: [],
  unresolved: false,
  events,
});
const event = (
  id: string,
  owner: string,
  title: string,
  date: string,
  hour: number,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent => ({
  id,
  owner,
  title,
  start: `${date}T${String(hour).padStart(2, "0")}:15:00Z`,
  end: `${date}T${String(hour + 1).padStart(2, "0")}:45:00Z`,
  location: "",
  ...extra,
});
const parse = (html: string) =>
  new DOMParser().parseFromString(html, "text/html");
const texts = (root: ParentNode, selector: string) =>
  [...root.querySelectorAll(selector)].map((node) => node.textContent);
const maths = [
  event("math-cours", "math", "Analyse I", "2026-09-21", 8, {
    location: "PER 08",
    sessionType: "Cours",
  }),
  event("alg", "alg", "Algèbre", "2026-09-22", 8, { location: "B201" }),
  event("math-exercices", "math", "Analyse I", "2026-09-24", 11, {
    location: "PER 11",
    sessionType: "Exercices",
  }),
];

it("a course keeps one print reference across weekdays and session types", () => {
  const doc = parse(weeklyPrintHtml(week(maths)));
  expect(texts(doc, ".calendar-sheet .events article")).toEqual([
    "S1",
    "S2",
    "S1",
  ]);
  expect(doc.querySelector(".week-key h2")?.textContent).toBe(
    "Course key · full details",
  );
  expect(texts(doc, ".week-key li")).toEqual([
    "S1 Analyse I · Mon 10:15–11:45 · PER 08 · Cours; Thu 13:15–14:45 · PER 11 · Exercices",
    "S2 Algèbre · Tue 10:15–11:45 · B201",
  ]);
  const rows = texts(doc, ".lesson-list table tbody tr > td:first-child");
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatch(/^S1 · Monday/);
  expect(rows[1]).toMatch(/^S2 · Tuesday/);
  expect(rows[2]).toMatch(/^S1 · Thursday/);
});

it.each([
  ["de", "Kursschlüssel · vollständige Angaben", "S1 Analyse I · Mo 10:15"],
  ["fr", "Repères des cours · détails complets", "S1 Analyse I · lun. 10:15"],
] as const)(
  "the %s key names courses with short weekdays",
  (language, heading, line) => {
    const doc = parse(weeklyPrintHtml(week(maths, language)));
    expect(doc.querySelector(".week-key h2")?.textContent).toBe(heading);
    expect(doc.querySelector(".week-key li")?.textContent).toContain(line);
  },
);

it("different courses with identical titles keep different references", () => {
  const doc = parse(
    weeklyPrintHtml(
      week([
        event(
          "a",
          "UE-L18.00438",
          "Acoustique et organologie",
          "2026-09-21",
          8,
        ),
        event(
          "b",
          "UE-L18.00423",
          "Acoustique et organologie",
          "2026-09-23",
          8,
        ),
      ]),
    ),
  );
  expect(texts(doc, ".events article")).toEqual(["S1", "S2"]);
  expect(texts(doc, ".week-key li")).toEqual([
    "S1 Acoustique et organologie · Mon 10:15–11:45 · Room not published",
    "S2 Acoustique et organologie · Wed 10:15–11:45 · Room not published",
  ]);
});

it("a busy period never shares a reference with a course", () => {
  const doc = parse(
    weeklyPrintHtml(
      week([
        event("course", "course", "Algèbre", "2026-09-21", 8),
        event("busy", "busy", "Work", "2026-09-21", 12, {
          location: "Unavailable",
        }),
        event("course-2", "course", "Algèbre", "2026-09-22", 8),
      ]),
    ),
  );
  expect(texts(doc, ".events article")).toEqual(["S1", "S2", "S1"]);
  expect(texts(doc, ".week-key li")).toHaveLength(2);
  expect(doc.querySelectorAll(".week-key li")[1].textContent).toBe(
    "S2 Work · Mon 14:15–15:45 · Unavailable",
  );
});

it("dense weeks keep each course's reference on every day page and list keys in ascending order", () => {
  const fillers = ["2026-09-23", "2026-09-24", "2026-09-25"].flatMap(
    (date, day) =>
      [6, 9, 12, 15].map((hour, slot) =>
        event(
          `filler-${day}-${slot}`,
          `f${day}${slot}`,
          `Filler ${day}${slot}`,
          date,
          hour,
        ),
      ),
  );
  const doc = parse(
    weeklyPrintHtml(
      week([
        event("a-mon", "a", "Course A", "2026-09-21", 6),
        event("b-mon", "b", "Course B", "2026-09-21", 9),
        // Tuesday meets B before A, so page order and reference order differ.
        event("b-tue", "b", "Course B", "2026-09-22", 6),
        event("a-tue", "a", "Course A", "2026-09-22", 9),
        ...fillers,
      ]),
    ),
  );
  const sheets = [...doc.querySelectorAll(".calendar-sheet")];
  expect(sheets).toHaveLength(5);
  expect(texts(sheets[0], ".events article")).toEqual(["S1", "S2"]);
  expect(texts(sheets[1], ".events article")).toEqual(["S2", "S1"]);
  expect(texts(sheets[1], ".week-key li")).toEqual([
    "S1 Course A · Tue 11:15–12:45 · Room not published",
    "S2 Course B · Tue 08:15–09:45 · Room not published",
  ]);
  for (const sheet of sheets) {
    const numbers = texts(sheet, ".week-key li b").map((label) =>
      Number(label!.slice(1)),
    );
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(numbers).toEqual(
      [...new Set(texts(sheet, ".events article"))]
        .map((label) => Number(label!.slice(1)))
        .sort((a, b) => a - b),
    );
  }
  expect(texts(sheets[4], ".week-key li b")).toEqual([
    "S11",
    "S12",
    "S13",
    "S14",
  ]);
});
