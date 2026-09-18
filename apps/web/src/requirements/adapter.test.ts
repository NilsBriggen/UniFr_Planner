import { expect, it } from "vitest";
import { createPlan, parsePlan, duplicateScenario } from "../planner/domain";
import * as adapter from "./adapter";
const makePlan = () =>
  createPlan({
    id: "p",
    scenarioId: "s",
    name: "Degree",
    programme: "CS",
    startTerm: "AS-2024",
    semesterCount: 6,
    targetEcts: 180,
  });
it("leaves legacy guest plans unchanged and requires explicit template selection", () => {
  const plan = makePlan();
  expect(adapter.evaluatePlanRequirements(plan)).toBeNull();
  expect(parsePlan(JSON.stringify(plan))).toEqual(plan);
});
it("pins templates and retains scenario-specific substitutions through JSON and duplication", () => {
  const plan = adapter.bindProgramme(makePlan(), {
    code: "CS-120",
    version: "2024.1",
    cohort: 2024,
  });
  const nodeId = "CS-120@2024.1/SIN.01023";
  plan.scenarios[0].courses.push({
    id: "transfer",
    code: "TRANSFER",
    titles: { en: "Transfer" },
    ects: 6,
    status: "completed",
    semester: null,
    pinned: false,
    offering: null,
  });
  const edited = adapter.setRequirementEvidence(plan, {
    overrides: [
      {
        kind: "substitution",
        nodeId,
        courseId: "transfer",
        reason: "Personal record",
      },
    ],
    completedChecklist: [],
  });
  const loaded = parsePlan(JSON.stringify(edited));
  expect(adapter.evaluatePlanRequirements(loaded)?.earned).toBe(6);
  expect(
    adapter.evaluatePlanRequirements(
      duplicateScenario(loaded, "alt", "Alternative"),
    )?.earned,
  ).toBe(6);
  expect(loaded.requirements?.templates[0].version).toBe("2024.1");
  expect(() =>
    adapter.bindProgramme(loaded, {
      code: "CS-120",
      version: "2026.1",
      cohort: 2024,
    }),
  ).toThrow();
});
it("combines major and minor without silently migrating and validates imported evidence", () => {
  const plan = adapter.bindProgramme(
    adapter.bindProgramme(makePlan(), {
      code: "CS-120",
      version: "2024.1",
      cohort: 2024,
    }),
    { code: "BI-CS-60", version: "2024.1", cohort: 2024 },
  );
  expect(adapter.evaluatePlanRequirements(plan)?.children).toHaveLength(2);
  expect(() =>
    adapter.bindProgramme(plan, {
      code: "CS-120",
      version: "2025.1",
      cohort: 2025,
    }),
  ).toThrow();
  expect(() =>
    parsePlan(
      JSON.stringify({
        ...plan,
        requirements: {
          cohort: 2024,
          templates: [{ code: "CS-120", version: "2024.1" }],
          unexpected: true,
        },
      }),
    ),
  ).toThrow();
  const invalid = {
    ...plan,
    scenarios: [
      {
        ...plan.scenarios[0],
        requirementEvidence: {
          overrides: [
            { kind: "substitution", nodeId: "x", courseId: "x", reason: "" },
          ],
          completedChecklist: [],
        },
      },
    ],
  };
  expect(() => parsePlan(JSON.stringify(invalid))).toThrow();
});
