import { describe, expect, it } from "vitest";
import * as domain from "./domain";

const setup = () =>
  domain.createPlan({
    id: "p1",
    scenarioId: "s1",
    name: "My degree",
    programme: "Informatics",
    startTerm: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
const course = () => ({
  id: "c1",
  code: "CS1",
  titles: { en: "Computing" },
  ects: 6,
  status: "planned" as const,
  semester: "AS-2026",
  pinned: false,
  offering: null,
});

describe("local degree plan", () => {
  it("rejects duplicate curriculum and public timetable code aliases", () => {
    const plan = domain.addCourse(setup(), { ...course(), code: "SIN.01023" });
    expect(() =>
      domain.addCourse(plan, {
        ...course(),
        id: "imported",
        code: "UE-SIN.01023",
      }),
    ).toThrow(/duplicate/);
  });
  it("rejects invalid personal intervals and inconsistent course status on import", () => {
    const plan = setup();
    expect(() =>
      domain.parsePlan(
        JSON.stringify({
          ...plan,
          scenarios: [
            {
              ...plan.scenarios[0],
              unavailable: [
                {
                  id: "busy",
                  label: "Work",
                  start: "2026-09-21T11:00:00Z",
                  end: "2026-09-21T10:00:00Z",
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      domain.addCourse(plan, { ...course(), status: "unscheduled" }),
    ).toThrow();
    expect(() =>
      domain.addCourse(plan, { ...course(), ects: Infinity }),
    ).toThrow();
  });
  it("creates a versioned six-semester plan without identity requirements", () => {
    const plan = setup();
    expect(plan.schemaVersion).toBe(2);
    expect(plan.semesters).toEqual([
      "AS-2026",
      "SS-2027",
      "AS-2027",
      "SS-2028",
      "AS-2028",
      "SS-2029",
    ]);
    expect(plan.scenarios[0].courses).toEqual([]);
    expect(domain.parsePlan(JSON.stringify(plan))).toEqual(plan);
  });
  it("duplicates and isolates scenarios and refuses a pinned move", () => {
    let plan = domain.addCourse(setup(), course());
    plan = domain.duplicateScenario(plan, "s2", "Alternative");
    plan = domain.setPinned(plan, "c1", true);
    expect(() =>
      domain.allocateCourse(plan, "c1", "SS-2027", "planned"),
    ).toThrow(/pinned/);
    expect(plan.scenarios[0].courses[0].pinned).toBe(false);
    plan = domain.setPinned(plan, "c1", false);
    plan = domain.allocateCourse(plan, "c1", "SS-2027", "planned");
    expect(plan.scenarios[0].courses[0].semester).toBe("AS-2026");
    expect(plan.scenarios[1].courses[0].semester).toBe("SS-2027");
    expect(() => domain.addCourse(plan, course())).toThrow(/duplicate/);
  });
  it("summarizes completed/current/planned/unscheduled and unknown ECTS separately", () => {
    let plan = domain.addCourse(setup(), {
      ...course(),
      status: "completed",
      semester: null,
    });
    plan = domain.addCourse(plan, {
      ...course(),
      id: "c2",
      code: "CS2",
      status: "current",
      ects: 9,
    });
    plan = domain.addCourse(plan, {
      ...course(),
      id: "c3",
      code: "CS3",
      ects: null,
      status: "unscheduled",
      semester: null,
    });
    expect(domain.summarize(plan.scenarios[0].courses)).toEqual({
      completed: 6,
      current: 9,
      planned: 0,
      unscheduled: 0,
      unknown: 1,
      hoursMin: 225,
      hoursMax: 270,
    });
  });
  it("validates imported versions, structure, semantic references, and bounds", () => {
    const plan = setup();
    for (const bad of [
      "{}",
      "no json",
      JSON.stringify({ ...plan, schemaVersion: 99 }),
      JSON.stringify({ ...plan, activeScenarioId: "missing" }),
      JSON.stringify({ ...plan, targetEcts: -1 }),
      JSON.stringify({
        ...plan,
        scenarios: [...plan.scenarios, plan.scenarios[0]],
      }),
    ]) {
      expect(() => domain.parsePlan(bad)).toThrow();
    }
    const invalid = { ...course(), semester: "AS-2099" };
    expect(() => domain.addCourse(plan, invalid)).toThrow();
    expect(() =>
      domain.parsePlan(JSON.stringify({ ...plan, unexpected: true })),
    ).toThrow();
  });
  it("migrates the documented v0 envelope without inventing data and imports with a new identity", () => {
    const plan = setup();
    const { activeScenarioId: _active, ...legacy } = plan;
    expect(_active).toBe("s1");
    const migrated = domain.parsePlan(
      JSON.stringify({ ...legacy, schemaVersion: 0 }),
    );
    expect(migrated).toEqual({ ...plan, schemaVersion: 1 });
    const imported = domain.importAsNew(plan, "p2", "Imported");
    expect(imported.id).toBe("p2");
    expect(imported.name).toBe("Imported");
    expect(plan.id).toBe("p1");
  });
});

it("keeps v1 legacy references intact and accepts only v2 recipes with unique slots", () => {
  const legacy = {
    ...setup(),
    schemaVersion: 1,
    requirements: {
      cohort: 2026,
      templates: [{ code: "CS-120", version: "2026.1" }],
    },
  };
  expect(domain.parsePlan(JSON.stringify(legacy))).toEqual(legacy);
  const degreeSelection = {
    structureId: "ba-120-60",
    components: [
      {
        slotId: "major",
        programmeId: "cs",
        variantId: "major-120",
        startSemester: "AS-2026",
        recipeVersion: "2026-27.1",
      },
      {
        slotId: "minor",
        programmeId: "bi",
        variantId: "minor-60",
        startSemester: "SS-2027",
        recipeVersion: "2026-27.1",
      },
    ],
  };
  const plan = { ...setup(), degreeSelection };
  expect(domain.parsePlan(JSON.stringify(plan))).toEqual(plan);
  expect(() =>
    domain.parsePlan(JSON.stringify({ ...legacy, degreeSelection })),
  ).toThrow();
  expect(() =>
    domain.parsePlan(
      JSON.stringify({ ...plan, requirements: legacy.requirements }),
    ),
  ).toThrow();
  expect(() =>
    domain.parsePlan(
      JSON.stringify({
        ...plan,
        degreeSelection: {
          ...degreeSelection,
          components: [
            degreeSelection.components[0],
            degreeSelection.components[0],
          ],
        },
      }),
    ),
  ).toThrow();
});
it("retains catalogue assignment history during copy, reschedule and JSON roundtrip", () => {
  const assignments = [
    { programme: "Computer Science", version: "2026", paths: ["Electives"] },
  ];
  const selected = domain.fromOffering(
    {
      languages: [],
      levels: [],
      lecturer: "",
      faculty_domain: "",
      schedule_summary: "",
      recurrence_summary: "",
      assessment: "",
      prerequisites: "",
      equivalents: "",
      calendar_url: null,
      listing_fingerprint: "",
      detail_hash: "",
      course: { code: "UE-SIN.1", titles: { en: "Course" } },
      source_id: "offer",
      snapshot_id: "snapshot-old",
      terms: ["AS-2026"],
      meetings: [],
      meeting_state: "unresolved",
      source_url: "https://example.org/course",
      ects: 6,
      assignments,
    },
    "offering",
    "snapshot-old",
    false,
  );
  const plan = domain.allocateCourse(
    domain.duplicateScenario(
      domain.addCourse(setup(), selected),
      "copy",
      "Copy",
    ),
    "offering",
    "SS-2027",
    "planned",
  );
  expect(
    domain.activeScenario(domain.parsePlan(JSON.stringify(plan))).courses[0]
      .offering?.assignments,
  ).toEqual(assignments);
});
