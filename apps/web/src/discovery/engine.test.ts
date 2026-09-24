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
it("requires configuration and never guesses recommendations from programme text", () => {
  const result = discoverCourses(
    plan(),
    [course("SIN.10000", "Algorithms")],
    "AS-2026",
    "en",
  );
  expect(result.hasProgramme).toBe(false);
  expect(
    filterDiscovery(result, { programme: true, fits: false, hideAdded: false }),
  ).toEqual([]);
});
it("uses the complete result set before pagination", () => {
  const configured = publishedPlan();
  configured.scenarios[0].courses = [];
  const all = Array.from({ length: 25 }, (_, n) =>
    course(`X-${n}`, `Unrelated ${n}`),
  );
  all.push(course("SIN.01023", "Programming"));
  const result = discoverCourses(configured, all, "AS-2026", "en");
  expect(
    filterDiscovery(result, {
      programme: true,
      fits: false,
      hideAdded: false,
    }).map((c) => c.code),
  ).toEqual(["SIN.01023"]);
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

it("shows published dates for an out-of-horizon offering without claiming target fit", () => {
  const p = createPlan({ id: "p", scenarioId: "s", name: "Short", programme: "Study", startTerm: "AS-2026", semesterCount: 1, targetEcts: 180 });
  const spring = course("FUTURE", "Big Data", "2027-03-01T08:00:00Z", "2027-03-01T10:00:00Z");
  spring.offerings[0].terms = ["SS-2027"];
  const result = discoverCourses(p, [spring], "SS-2027", "en");
  const assessment = result.assessments.get(offeringKey(spring.offerings[0]))!;
  expect(assessment.calendar.events).toHaveLength(1);
  expect(assessment.fit).toBe("unknown");
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

it("keeps completed canonical aliases visible as matches but never recommends them", () => {
  const p = publishedPlan();
  p.scenarios[0].courses = [p.scenarios[0].courses[0]];
  p.scenarios[0].courses[0].status = "completed";
  const c = course("UE-SIN.01023", "Programming");
  const a = discoverCourses(p, [c], "AS-2026", "en").assessments.get(
    offeringKey(c.offerings[0]),
  )!;
  expect(a.match).toBe("requirements");
  expect(a.recommended).toBe(false);
  expect(a.selectedStatus).toBe("completed");
  expect(a.contributionEcts).toBe(0);
});
it("retains an unscheduled record identity and its substitution evidence", () => {
  const p = publishedPlan();
  const saved = p.scenarios[0].courses[0];
  p.scenarios[0].courses = [
    { ...saved, status: "unscheduled", semester: null },
  ];
  const c = course("UE-SIN.01023", "Programming");
  const a = discoverCourses(p, [c], "AS-2026", "en").assessments.get(
    offeringKey(c.offerings[0]),
  )!;
  expect(a.recommended).toBe(true);
  expect(a.selected).toBe(false);
  expect(a.contributionEcts).toBeGreaterThan(0);
});
it("does not recommend a requirement already satisfied by a personal substitution", () => {
  const p = publishedPlan();
  const saved = p.scenarios[0].courses[0];
  p.scenarios[0].courses = [
    { ...saved, code: "TRANSFER", status: "completed" },
  ];
  p.scenarios[0].requirementEvidence = {
    completedChecklist: [],
    overrides: [
      {
        kind: "substitution",
        courseId: saved.id,
        nodeId: "CS-120@2024.1/SIN.01023",
        reason: "Recognised transfer",
      },
    ],
  };
  const c = course("SIN.01023", "Programming");
  const result = discoverCourses(p, [c], "AS-2026", "en");
  expect(result.requirementError).toBe(false);
  expect(result.assessments.get(offeringKey(c.offerings[0]))?.recommended).toBe(
    false,
  );
});

it("uses the composed CS plus BI exception rather than the standalone BI table", async () => {
  const { bindDegreeSelection } = await import("../requirements/adapter");
  const p = bindDegreeSelection(plan(), {
    structureId: "ba-120-60",
    components: [
      {
        slotId: "major",
        programmeId: "bachelor-digitinf-informatics",
        variantId: "major-120",
        startSemester: "AS-2026",
        recipeVersion: "2026-27.1",
      },
      {
        slotId: "minor",
        programmeId: "bachelor-digitinf-businessinformatics",
        variantId: "minor-60",
        startSemester: "AS-2026",
        recipeVersion: "2026-27.1",
      },
    ],
  });
  const cs = course("SIN.01023", "Programming");
  const bi = course("EIG.00038", "Business Informatics II");
  const result = discoverCourses(p, [cs, bi], "AS-2026", "en");
  expect(result.requirementError).toBe(false);
  expect(
    result.assessments.get(offeringKey(cs.offerings[0]))?.recommended,
  ).toBe(true);
  // The CS-specific BI curriculum replaces Business Informatics II with other requirements.
  expect(
    result.assessments.get(offeringKey(bi.offerings[0]))?.match,
  ).toBeNull();
});

it("shows published programme assignments separately from reviewed requirement gains", async () => {
  const { bindDegreeSelection } = await import("../requirements/adapter");
  const p = bindDegreeSelection(plan(), { structureId: "ba-120-60", components: [
    { slotId: "major", programmeId: "bachelor-digitinf-informatics", variantId: "major-120", startSemester: "AS-2026", recipeVersion: "2026-27.1" },
    { slotId: "minor", programmeId: "bachelor-sci-mathematics", variantId: "minor-60", startSemester: "AS-2026", recipeVersion: "2026-27.1" },
  ] });
  const math = course("UE-SMA.01104", "Analysis II");
  math.offerings[0].assignments = [{ programme: "Mathematics 60 (MATH 60)", version: "2026_1/V_01", paths: ["Mathematics (MATH 60), minor 60 > Mathematics, minor MATH60, compulsory courses (from AS2026 on)"] }];
  const assessment = discoverCourses(p, [math], "SS-2027", "en").assessments.get(offeringKey(math.offerings[0]))!;
  expect(assessment.match).toBe("subject");
  expect(assessment.recommended).toBe(false);
  expect(assessment.sourceAssignments).toHaveLength(1);
  expect(filterDiscovery(discoverCourses(p, [math], "SS-2027", "en"), { programme: true, fits: false, hideAdded: false })).toHaveLength(1);
});

it("keeps newer Biology source assignments visible to an older transfer with an uncertainty flag", () => {
  const p = plan();
  p.degreeSelection = { structureId: "ba-120-60", components: [{ slotId: "major", programmeId: "bachelor-sci-biology", variantId: "major-120", startSemester: "AS-2024", recipeVersion: "2026-27.1" }] };
  const biology = course("UE-SBL.00015", "Biology field course");
  biology.offerings[0].assignments = [{ programme: "Biology 120", version: "2025_1/V_01", paths: ["BSc in Biology, Major, 2nd-3rd year (from AS2025 on)"] }];
  const result = discoverCourses(p, [biology], "AS-2026", "en");
  const assessment = result.assessments.get(offeringKey(biology.offerings[0]))!;
  expect(assessment.match).toBe("subject");
  expect(assessment.sourceApplicabilityUnconfirmed).toBe(true);
  expect(assessment.recommended).toBe(false);
});
