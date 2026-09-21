import { expect, it } from "vitest";
import {
  discoverCourses,
  filterDiscovery,
  lessonGroups,
  offeringKey,
} from "./engine";
import { createPlan, fromOffering } from "../planner/domain";
import {
  publicOffering,
  publishedPlan,
  publishedCourses,
} from "../planner/published-fixture";
import type { Course } from "../api/client";
const plan = () =>
  createPlan({
    id: "p",
    scenarioId: "s",
    name: "My degree",
    programme: "Computer Science + Business Informatics",
    startTerm: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
function course(
  code: string,
  title: string,
  start = "2026-09-21T08:00:00Z",
  end = "2026-09-21T09:00:00Z",
): Course {
  const selection = fromOffering(
    publishedCourses()[0].offerings[0],
    code.replaceAll(".", "-"),
    "test",
    false,
  );
  selection.code = code;
  selection.titles = { en: title };
  selection.offering!.source_id = code;
  selection.offering!.meetings = [
    {
      starts_at: start,
      ends_at: end,
      location: "PER 21",
      unresolved: false,
      cancelled: false,
      excluded_dates: [],
      additional_dates: [],
      note: "",
    },
  ];
  return {
    code,
    titles: selection.titles,
    offerings: [publicOffering(selection)],
  };
}
it("uses the complete result set for programme discovery before pagination", () => {
  const all = Array.from({ length: 25 }, (_, n) =>
    course(`X-${n}`, `Unrelated ${n}`),
  );
  all.push(course("SIN.10000", "Algorithms"));
  const result = discoverCourses(plan(), all, "AS-2026", "en");
  expect(
    filterDiscovery(result, {
      programme: true,
      fits: false,
      hideAdded: false,
    }).map((c) => c.code),
  ).toEqual(["SIN.10000"]);
  expect(result.assessments.get(offeringKey(all[25].offerings[0]))?.match).toBe(
    "subject",
  );
});
it("uses pinned curriculum codes rather than a free-text guess when requirements are configured", () => {
  const configured = publishedPlan();
  configured.scenarios[0].courses = [];
  const recognized = course("UE-SIN.01023", "Programming");
  const guessed = course("UNLISTED", "Algebra");
  const result = discoverCourses(
    configured,
    [guessed, recognized],
    "AS-2026",
    "en",
  );
  expect(
    result.assessments.get(offeringKey(recognized.offerings[0]))?.match,
  ).toBe("requirements");
  expect(
    result.assessments.get(offeringKey(guessed.offerings[0]))?.match,
  ).toBeNull();
});
it("filters alternative offerings individually and compares dated intervals", () => {
  const p = plan();
  const selected = course("SAVED", "Saved course");
  p.scenarios[0].courses = [
    {
      ...fromOffering(selected.offerings[0], "saved", "test", false),
      semester: "AS-2026",
      status: "planned",
    },
  ];
  const conflicting = course(
    "NEW",
    "Programming",
    "2026-09-21T08:30:00Z",
    "2026-09-21T09:30:00Z",
  );
  const differentDate = course(
    "NEW",
    "Programming",
    "2026-09-28T08:30:00Z",
    "2026-09-28T09:30:00Z",
  ).offerings[0];
  differentDate.source_id = "later-date";
  conflicting.offerings.push(differentDate);
  const result = discoverCourses(p, [conflicting], "AS-2026", "en");
  expect(
    result.assessments.get(offeringKey(conflicting.offerings[0]))?.conflicts,
  ).toEqual(["Saved course"]);
  expect(
    filterDiscovery(result, {
      programme: false,
      fits: true,
      hideAdded: false,
    })[0].offerings.map((o) => o.source_id),
  ).toEqual(["later-date"]);
});
it("does not call unknown dates or an incomplete existing timetable a fit", () => {
  const p = plan();
  const unknown = course("UNKNOWN", "Algorithms");
  unknown.offerings[0].meetings = [];
  const resolved = course("KNOWN", "Programming");
  let result = discoverCourses(p, [unknown, resolved], "AS-2026", "en");
  expect(
    filterDiscovery(result, {
      programme: false,
      fits: true,
      hideAdded: false,
    }).map((c) => c.code),
  ).toEqual(["KNOWN"]);
  p.scenarios[0].courses = [
    {
      ...fromOffering(unknown.offerings[0], "unknown", "test", false),
      status: "planned",
      semester: "AS-2026",
    },
  ];
  result = discoverCourses(p, [resolved], "AS-2026", "en");
  expect(
    filterDiscovery(result, { programme: false, fits: true, hideAdded: false }),
  ).toEqual([]);
});
it("honours busy periods and recognises already selected canonical course codes", () => {
  const p = plan(),
    candidate = course("UE-SIN.01023", "Programming");
  p.scenarios[0].courses = [
    {
      ...fromOffering(candidate.offerings[0], "saved", "test", false),
      code: "SIN.01023",
      status: "planned",
      semester: "AS-2026",
    },
  ];
  p.scenarios[0].unavailable = [
    {
      id: "work",
      label: "Work",
      start: "2026-09-21T08:30:00Z",
      end: "2026-09-21T10:00:00Z",
    },
  ];
  const result = discoverCourses(p, [candidate], "AS-2026", "en");
  const assessment = result.assessments.get(
    offeringKey(candidate.offerings[0]),
  )!;
  expect(assessment.selected).toBe(true);
  expect(assessment.conflicts).toEqual(["Work"]);
  expect(
    filterDiscovery(result, { programme: false, fits: false, hideAdded: true }),
  ).toEqual([]);
  p.scenarios[0].courses[0].status = "unscheduled";
  p.scenarios[0].courses[0].semester = null;
  expect(
    filterDiscovery(discoverCourses(p, [candidate], "AS-2026", "en"), {
      programme: false,
      fits: false,
      hideAdded: true,
    }),
  ).toHaveLength(1);
});
it("shows overnight dates honestly and groups only matching weekday/time/room", () => {
  const groups = lessonGroups(
    [
      {
        id: "a",
        owner: "a",
        title: "Night",
        start: "2026-09-21T21:00:00Z",
        end: "2026-09-22T01:00:00Z",
        location: "PER",
      },
      {
        id: "b",
        owner: "a",
        title: "Night",
        start: "2026-09-28T21:00:00Z",
        end: "2026-09-29T01:00:00Z",
        location: "PER",
      },
    ],
    "en",
  );
  expect(groups).toHaveLength(1);
  expect(groups[0].time).toContain("Tue");
  expect(groups[0].dates).toHaveLength(2);
});
