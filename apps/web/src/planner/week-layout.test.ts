import { expect, it } from "vitest";
import { layoutWeek } from "./week-layout";
import type { CalendarEvent } from "./calendar";
const event = (id: string, start: string, end: string): CalendarEvent => ({
  id,
  owner: id,
  title: id,
  location: "PER",
  start,
  end,
});
it("positions Zurich times and gives overlapping lessons separate lanes", () => {
  const week = layoutWeek(
    [
      event("a", "2026-09-21T08:00:00Z", "2026-09-21T10:00:00Z"),
      event("b", "2026-09-21T09:00:00Z", "2026-09-21T11:00:00Z"),
      event("c", "2026-09-21T11:00:00Z", "2026-09-21T12:00:00Z"),
    ],
    "2026-09-21",
  );
  expect(
    week.days[0].lessons.map((l) => [
      l.startMinute,
      l.endMinute,
      l.lane,
      l.lanes,
    ]),
  ).toEqual([
    [600, 720, 0, 2],
    [660, 780, 1, 2],
    [780, 840, 0, 1],
  ]);
});
it("opens a late class week one hour before its first lesson", () => {
  const week = layoutWeek(
    [event("noon", "2026-09-21T10:00:00Z", "2026-09-21T11:00:00Z")],
    "2026-09-21",
  );
  expect(week.days[0].lessons[0].startMinute).toBe(12 * 60);
  expect(week.startMinute).toBe(11 * 60);
  expect(layoutWeek([], "2026-09-21").startMinute).toBe(8 * 60);
});
it("splits overnight lessons at local midnight and retains weekend sessions", () => {
  const week = layoutWeek(
    [
      event("night", "2026-09-25T21:00:00Z", "2026-09-26T01:00:00Z"),
      event("outside", "2026-09-28T08:00:00Z", "2026-09-28T09:00:00Z"),
    ],
    "2026-09-21",
  );
  expect(week.days[4].lessons.map((l) => [l.startMinute, l.endMinute])).toEqual(
    [[1380, 1440]],
  );
  expect(week.days[5].lessons.map((l) => [l.startMinute, l.endMinute])).toEqual(
    [[0, 180]],
  );
  expect(week.days.flatMap((d) => d.lessons)).toHaveLength(2);
  expect(week.startMinute).toBe(0);
  expect(week.endMinute).toBe(1440);
});
it("shares a lane at touching boundaries and handles three-way overlap", () => {
  const week = layoutWeek(
    [
      event("a", "2026-09-21T08:00:00Z", "2026-09-21T10:00:00Z"),
      event("b", "2026-09-21T08:30:00Z", "2026-09-21T09:00:00Z"),
      event("c", "2026-09-21T08:45:00Z", "2026-09-21T09:15:00Z"),
      event("d", "2026-09-21T09:00:00Z", "2026-09-21T09:30:00Z"),
    ],
    "2026-09-21",
  );
  expect(week.days[0].lessons.map((l) => l.lane)).toEqual([0, 1, 2, 1]);
  expect(week.days[0].lessons.every((l) => l.lanes === 3)).toBe(true);
});
