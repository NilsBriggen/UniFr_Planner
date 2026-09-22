import { describe, expect, it } from "vitest";
import {
  activeScenario,
  addCourse,
  createPlan,
  currentSemester,
  planningSemester,
  planSchema,
  recordCompleted,
  type Selection,
} from "./domain";
const make = () =>
  createPlan({
    id: "p",
    scenarioId: "s",
    name: "Degree",
    programme: "CS",
    startTerm: "AS-2024",
    semesterCount: 6,
    targetEcts: 180,
  });
const course = (code = "SIN.001"): Selection => ({
  id: "c",
  code,
  titles: { en: "History" },
  ects: 5,
  status: "completed",
  semester: "AS-2024",
  pinned: false,
  offering: null,
});
describe("planning semester and completed catch-up", () => {
  it("uses Zurich term boundaries including January and changes no cohort", () => {
    expect(currentSemester(new Date("2026-01-31T22:59:00Z"))).toBe("AS-2025");
    expect(currentSemester(new Date("2026-01-31T23:00:00Z"))).toBe("SS-2026");
    expect(currentSemester(new Date("2026-07-31T22:00:00Z"))).toBe("AS-2026");
    const p = make();
    expect(planningSemester(p, new Date("2026-09-22"))).toBe("AS-2026");
    expect(p.semesters[0]).toBe("AS-2024");
    expect(planningSemester(p, new Date("2020-01-01"))).toBe("AS-2024");
    expect(planningSemester(p, new Date("2030-01-01"))).toBe("SS-2027");
  });
  it("accepts explicit in-plan planning term and rejects a term outside it", () => {
    const p = make();
    expect(planningSemester({ ...p, planningSemester: "SS-2025" })).toBe(
      "SS-2025",
    );
    expect(
      planSchema.safeParse({ ...p, planningSemester: "AS-2030" }).success,
    ).toBe(false);
    expect(
      planSchema.parse({ ...p, schemaVersion: 1, planningSemester: "SS-2025" })
        .planningSemester,
    ).toBe("SS-2025");
  });
  it("requires explicit replacement for canonical duplicates and respects pins atomically", () => {
    const p = addCourse(make(), { ...course(), status: "planned" });
    expect(() =>
      recordCompleted(p, [{ ...course("UE-SIN.001"), id: "new" }]),
    ).toThrow();
    const saved = recordCompleted(
      p,
      [{ ...course("UE-SIN.001"), id: "new" }],
      ["c"],
    );
    expect(activeScenario(saved).courses).toHaveLength(1);
    expect(activeScenario(saved).courses[0]).toMatchObject({
      id: "c",
      status: "completed",
      semester: "AS-2024",
    });
    const pinned = addCourse(make(), { ...course(), pinned: true });
    expect(() =>
      recordCompleted(pinned, [{ ...course("UE-SIN.001"), id: "new" }], ["c"]),
    ).toThrow(/pinned/);
    expect(activeScenario(p).courses[0].status).toBe("planned");
  });
});
