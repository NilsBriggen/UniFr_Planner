import { expect, it } from "vitest";
import { createPlan, parsePlan, type Selection } from "./domain";
import { attendanceChoice, selectedMeetings } from "./attendance";
import { calendarFor, detectConflicts } from "./calendar";
const session = (note: string, location: string) => ({
  starts_at: "2026-09-21T08:00:00Z",
  ends_at: "2026-09-21T09:00:00Z",
  note,
  location,
  unresolved: false,
  cancelled: false,
  excluded_dates: [],
  additional_dates: [],
});
const course: Selection = {
  id: "c",
  code: "C",
  titles: { en: "Statistics" },
  ects: 6,
  status: "planned",
  semester: "AS-2026",
  pinned: false,
  offering: {
    source_id: "s",
    terms: ["AS-2026"],
    meetings: [session("Cours", "A"), session("Exercice", "B")],
    meeting_state: "resolved",
    source_url: "https://www.unifr.ch",
    snapshot_id: "s",
    development_fixture: false,
  },
};
it("personal attendance exclusion affects calendar but remains provisional and retains source sessions", () => {
  const chosen = { ...course, attendance: attendanceChoice(course, [1]) };
  expect(selectedMeetings(chosen).meetings).toHaveLength(1);
  expect(chosen.offering!.meetings).toHaveLength(2);
  expect(calendarFor([chosen], "AS-2026", "en").events).toHaveLength(1);
  expect(calendarFor([chosen], "AS-2026", "en").unresolved).toContain(
    "c:attendance",
  );
});
it("changed source invalidates exclusions and restores every session", () => {
  const changed = {
    ...course,
    attendance: attendanceChoice(course, [1]),
    offering: {
      ...course.offering!,
      meetings: [session("Cours", "A"), session("Exercice", "C")],
    },
  };
  expect(selectedMeetings(changed)).toMatchObject({
    stale: true,
    unresolved: true,
  });
  expect(selectedMeetings(changed).meetings).toHaveLength(2);
});
it("distinguishes internal ambiguity without suppressing required sessions or external overlaps", () => {
  const events = calendarFor([course], "AS-2026", "en").events;
  expect(events).toHaveLength(2);
  expect(events[1]).toMatchObject({
    sessionType: "Exercice",
    sourceUrl: "https://www.unifr.ch",
  });
  expect(detectConflicts(events, [], 0)[0].kind).toBe("internal");
  expect(
    detectConflicts(
      [...events, { ...events[0], id: "other", owner: "robotics" }],
      [],
      0,
    ).filter((c) => c.kind === "hard"),
  ).toHaveLength(2);
});
it("round trips optional attendance and prior-study context while accepting legacy plans", () => {
  const plan = createPlan({
    id: "p",
    scenarioId: "s",
    name: "P",
    programme: "P",
    startTerm: "AS-2026",
    semesterCount: 2,
    targetEcts: 180,
  });
  expect(parsePlan(JSON.stringify(plan))).toEqual(plan);
  plan.scenarios[0].courses = [
    { ...course, attendance: attendanceChoice(course, [1]) },
  ];
  plan.scenarios[0].priorStudy = [
    {
      id: "prior",
      institution: "University",
      period: "2024–2025",
      approximateEcts: 30,
      status: "recognition_pending",
      notes: "No credit recognition asserted",
    },
  ];
  expect(parsePlan(JSON.stringify(plan))).toEqual(plan);
});
it("groups only matching published type, local weekday, time and room for a provisional multi-date choice", async () => {
  const { attendanceSeries } = await import("./attendance");
  const repeat = {
    ...course,
    offering: {
      ...course.offering!,
      meetings: [
        ...course.offering!.meetings,
        {
          ...course.offering!.meetings[1],
          starts_at: "2026-09-28T08:00:00Z",
          ends_at: "2026-09-28T09:00:00Z",
        },
      ],
    },
  };
  expect(attendanceSeries(repeat).map((s) => s.indices)).toEqual([[0], [1, 2]]);
});
