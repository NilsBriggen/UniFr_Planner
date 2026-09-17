import { describe, expect, it } from "vitest";
import {
  expandMeetings,
  detectConflicts,
  exportCalendar,
  calendarFor,
  localInstant,
} from "./calendar";
import type { Meeting } from "../api/client";
import ICAL from "ical.js";

const meeting = (
  start = "2026-09-21T10:00:00+02:00",
  end = "2026-09-21T11:00:00+02:00",
  extra: Partial<Meeting> = {},
): Meeting => ({
  starts_at: start,
  ends_at: end,
  location: "PER 21",
  cancelled: false,
  unresolved: false,
  excluded_dates: [],
  additional_dates: [],
  note: "",
  ...extra,
});
const range = { start: "2026-09-01", end: "2026-12-31" };
const events = (id: string, meetings: Meeting[]) =>
  expandMeetings(id, id, meetings, range);

describe("actual-date calendar", () => {
  it.each([
    "BYMONTH=13",
    "BYMONTH=0",
    "BYMONTHDAY=32",
    "BYDAY=0MO",
    "BYDAY=54MO",
    "BYDAY=XX",
    "BYSETPOS=367",
    "BYWEEKNO=54",
    "BYYEARDAY=367",
    "BYMONTH=1.5",
    "COUNT=3",
    "UNTIL=20260230T000000Z",
  ])(
    "keeps malformed recurrence %s unresolved across conflict and ICS boundaries",
    (field) => {
      const result = events("bad", [
        meeting(undefined, undefined, {
          recurrence: `FREQ=WEEKLY;COUNT=2;${field}`,
        }),
      ]);
      expect(result.unresolved).toEqual(["bad:0"]);
      expect(result.events).toEqual([]);
      expect(detectConflicts(result.events, [], 0)).toEqual([]);
      expect(() => exportCalendar(result, "2026-09-01T00:00:00Z")).toThrow(
        /unresolved/,
      );
    },
  );
  it("resolves complete recurrence metadata even when catalogue filtering marked it unresolved", () => {
    const course = {
      id: "c",
      code: "c",
      titles: { en: "Course" },
      ects: 6,
      status: "planned" as const,
      semester: "AS-2026",
      pinned: false,
      offering: {
        source_id: "1",
        terms: ["AS-2026"],
        meetings: [
          meeting(undefined, undefined, { recurrence: "FREQ=WEEKLY;COUNT=2" }),
        ],
        meeting_state: "unresolved" as const,
        source_url: "https://www.unifr.ch",
        snapshot_id: "snapshot",
        development_fixture: false,
      },
    };
    expect(calendarFor([course], "AS-2026", "en").events).toHaveLength(2);
    expect(calendarFor([course], "AS-2026", "en").unresolved).toEqual([]);
  });
  it("rejects a zero recurrence interval instead of silently omitting occurrences", () => {
    expect(
      events("a", [
        meeting(undefined, undefined, {
          recurrence: "FREQ=WEEKLY;INTERVAL=0;COUNT=3",
        }),
      ]).unresolved,
    ).toHaveLength(1);
  });
  it("rejects DST gaps and repeated wall times, and refuses to reuse dated offerings in future semesters", () => {
    expect(() => localInstant("2026-03-29T02:30")).toThrow();
    expect(() => localInstant("2026-10-25T02:30")).toThrow();
    const course = {
      id: "c",
      code: "c",
      titles: { en: "Course" },
      ects: 6,
      status: "planned" as const,
      semester: "SS-2027",
      pinned: false,
      offering: {
        source_id: "1",
        terms: ["AS-2026"],
        meetings: [meeting()],
        meeting_state: "resolved" as const,
        source_url: "https://www.unifr.ch",
        snapshot_id: "snapshot",
        development_fixture: false,
      },
    };
    expect(calendarFor([course], "SS-2027", "en")).toEqual({
      events: [],
      cancelled: [],
      unresolved: ["c"],
    });
    expect(
      calendarFor([{ ...course, semester: "AS-2026" }], "HS-2026", "en").events,
    ).toHaveLength(1);
  });
  it("distinguishes same weekday at different dates from a real overlap", () => {
    const a = events("a", [meeting()]);
    const b = events("b", [
      meeting("2026-09-28T10:00:00+02:00", "2026-09-28T11:00:00+02:00"),
    ]);
    expect(detectConflicts([...a.events, ...b.events], [], 0)).toEqual([]);
    expect(
      detectConflicts(
        [...a.events, ...events("b", [meeting()]).events],
        [],
        0,
      )[0].kind,
    ).toBe("hard");
  });
  it("expands alternating weeks, exceptions, additions and keyed cancelled overrides", () => {
    const master = meeting(undefined, undefined, {
      source_uid: "uid",
      recurrence: "FREQ=WEEKLY;INTERVAL=2;COUNT=4",
      excluded_dates: ["2026-10-05T10:00:00+02:00"],
      additional_dates: ["2026-09-23"],
    });
    const cancelled = meeting(
      "2026-10-19T10:00:00+02:00",
      "2026-10-19T11:00:00+02:00",
      {
        source_uid: "uid",
        recurrence_id: "2026-10-19T10:00:00+02:00",
        cancelled: true,
      },
    );
    const result = events("a", [master, cancelled]);
    expect(result.unresolved).toEqual([]);
    expect(result.events.map((event) => event.start)).toEqual([
      "2026-09-21T08:00:00Z",
      "2026-09-23T08:00:00Z",
      "2026-11-02T09:00:00Z",
    ]);
    expect(result.cancelled).toHaveLength(1);
    const opposite = events("b", [
      meeting("2026-09-28T10:00:00+02:00", "2026-09-28T11:00:00+02:00", {
        recurrence: "FREQ=WEEKLY;INTERVAL=2;COUNT=3",
      }),
    ]);
    expect(
      detectConflicts([...result.events, ...opposite.events], [], 0),
    ).toEqual([]);
  });
  it("handles moved occurrences, daily block courses and cross-midnight overlap", () => {
    const result = events("a", [
      meeting(undefined, undefined, {
        source_uid: "x",
        recurrence: "FREQ=DAILY;COUNT=3",
      }),
      meeting("2026-09-23T14:00:00+02:00", "2026-09-23T15:00:00+02:00", {
        source_uid: "x",
        recurrence_id: "2026-09-22T10:00:00+02:00",
      }),
    ]);
    expect(result.events).toHaveLength(3);
    expect(result.events.map((e) => e.start)).toContain("2026-09-23T12:00:00Z");
    const night = events("night", [
      meeting("2026-09-21T23:30:00+02:00", "2026-09-22T01:00:00+02:00"),
    ]);
    const next = events("next", [
      meeting("2026-09-22T00:30:00+02:00", "2026-09-22T02:00:00+02:00"),
    ]);
    expect(
      detectConflicts([...night.events, ...next.events], [], 0)[0].kind,
    ).toBe("hard");
  });
  it("keeps missing, invalid, ambiguous DST, unsupported or unbounded timings unresolved", () => {
    for (const value of [
      meeting(undefined, undefined, {
        starts_at: null,
        ends_at: null,
        unresolved: true,
      }),
      meeting("2026-09-21T11:00:00+02:00", "2026-09-21T10:00:00+02:00"),
      meeting(undefined, undefined, {
        recurrence: "FREQ=SECONDLY;COUNT=9999999",
      }),
      meeting(undefined, undefined, { recurrence: "FREQ=WEEKLY" }),
      meeting(undefined, undefined, {
        recurrence_id: "2026-09-21T10:00:00+02:00",
      }),
    ]) {
      expect(events("a", [value]).unresolved).toHaveLength(1);
    }
    expect(
      events("a", [
        meeting(undefined, undefined, {
          cancelled: true,
          starts_at: null,
          ends_at: null,
        }),
      ]).events,
    ).toEqual([]);
  });
  it("detects personal unavailable periods and travel gaps without treating touching meetings as overlaps", () => {
    const a = events("a", [meeting()]);
    const b = events("b", [
      meeting("2026-09-21T11:00:00+02:00", "2026-09-21T12:00:00+02:00", {
        location: "MIS",
      }),
    ]);
    expect(detectConflicts([...a.events, ...b.events], [], 0)).toEqual([]);
    expect(detectConflicts([...a.events, ...b.events], [], 15)[0].kind).toBe(
      "travel",
    );
    const busy = [
      {
        id: "busy",
        label: "Work",
        start: "2026-09-21T08:30:00Z",
        end: "2026-09-21T09:30:00Z",
      },
    ];
    expect(detectConflicts(a.events, busy, 0)[0].kind).toBe("unavailable");
  });
  it("exports parseable UTC ICS with dated instances, cancellation, escaping, CRLF and UTF-8 folding", () => {
    const result = expandMeetings(
      "a",
      "Algèbre, matrices; test\n" + "é".repeat(70),
      [
        meeting(undefined, undefined, { recurrence: "FREQ=WEEKLY;COUNT=2" }),
        meeting("2026-10-01T10:00:00+02:00", "2026-10-01T11:00:00+02:00", {
          cancelled: true,
        }),
      ],
      range,
    );
    const text = exportCalendar(result, "2026-09-01T00:00:00Z");
    const parsed = new ICAL.Component(ICAL.parse(text));
    expect(parsed.getAllSubcomponents("vevent")).toHaveLength(3);
    expect(
      parsed
        .getAllSubcomponents("vevent")[0]
        .getFirstPropertyValue("dtstart")!
        .toString(),
    ).toBe("2026-09-21T08:00:00Z");
    expect(
      parsed.getAllSubcomponents("vevent")[2].getFirstPropertyValue("status"),
    ).toBe("CANCELLED");
    expect(
      parsed.getAllSubcomponents("vevent")[0].getFirstPropertyValue("summary"),
    ).toContain("Algèbre, matrices; test\n");
    expect(text).toContain("\r\n");
    expect(
      text
        .split("\r\n")
        .every((line) => new TextEncoder().encode(line).length <= 75),
    ).toBe(true);
    expect(() =>
      exportCalendar(
        { ...result, unresolved: ["missing"] },
        "2026-09-01T00:00:00Z",
      ),
    ).toThrow(/unresolved/);
  });
});
