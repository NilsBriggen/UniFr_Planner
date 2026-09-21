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

const recipeSelection = {
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
      startSemester: "SS-2027",
      recipeVersion: "2026-27.1",
    },
  ],
};
it("pins an explicitly composed recipe and keeps component semesters through reopening", () => {
  const plan = adapter.bindDegreeSelection(makePlan(), recipeSelection);
  expect(plan.schemaVersion).toBe(2);
  expect(plan.targetEcts).toBe(180);
  expect(plan.requirements).toBeUndefined();
  const reopened = parsePlan(JSON.stringify(plan));
  expect(reopened.degreeSelection).toEqual(recipeSelection);
  expect(adapter.resolvedPlanDegree(reopened)?.appliedRules).not.toHaveLength(
    0,
  );
  expect(adapter.evaluatePlanRequirements(reopened)?.status).toBe(
    "needs_clarification",
  );
  expect(() =>
    adapter.bindDegreeSelection(plan, {
      ...recipeSelection,
      components: recipeSelection.components.map((c) => ({
        ...c,
        recipeVersion: "missing",
      })),
    }),
  ).toThrow();
});
it("refuses migration with evidence in any scenario until explicitly cleared", () => {
  const legacy = adapter.bindProgramme(makePlan(), {
    code: "CS-120",
    version: "2024.1",
    cohort: 2024,
  });
  legacy.scenarios[0].requirementEvidence = {
    overrides: [],
    completedChecklist: ["old-duty"],
  };
  expect(() => adapter.bindDegreeSelection(legacy, recipeSelection)).toThrow(
    /evidence/i,
  );
  expect(legacy.requirements?.templates[0].code).toBe("CS-120");
  expect(legacy.scenarios[0].requirementEvidence.completedChecklist).toEqual([
    "old-duty",
  ]);
});
it("separates additional requirements from the degree target and preserves v1 evidence verbatim", () => {
  const plan = adapter.bindDegreeSelection(makePlan(), {
    structureId: "ba-180-extra-30",
    components: [
      {
        slotId: "major",
        programmeId: "bachelor-ius-law",
        variantId: "major-180",
        startSemester: "AS-2026",
        recipeVersion: "2026-27.1",
      },
      {
        slotId: "extra",
        programmeId: "bachelor-digitinf-businessinformatics",
        variantId: "minor-30",
        startSemester: "SS-2027",
        recipeVersion: "2026-27.1",
      },
    ],
  });
  expect(plan.targetEcts).toBe(180);
  expect(adapter.resolvedPlanDegree(plan)?.additionalEcts).toBe(30);
  expect(adapter.evaluateAdditionalRequirements(plan)?.node.minCredits).toBe(
    30,
  );
  const legacy = {
    ...adapter.bindProgramme(makePlan(), {
      code: "CS-120",
      version: "2024.1",
      cohort: 2024,
    }),
    schemaVersion: 1 as const,
  };
  const before = adapter.evaluatePlanRequirements(legacy);
  const reopened = parsePlan(JSON.stringify(legacy));
  expect(reopened).toEqual(legacy);
  expect(adapter.evaluatePlanRequirements(reopened)).toEqual(before);
});

it("rejects known prohibited combinations without changing the saved plan", () => {
  const original = makePlan();
  expect(() =>
    adapter.bindDegreeSelection(original, {
      ...recipeSelection,
      components: [
        recipeSelection.components[0],
        {
          ...recipeSelection.components[1],
          programmeId: "bachelor-digitinf-informatics",
        },
      ],
    }),
  ).toThrow();
  expect(original.degreeSelection).toBeUndefined();
  expect(original.scenarios[0].courses).toEqual([]);
});
it("does not add credits for an empty optional minor", () => {
  const plan = adapter.bindDegreeSelection(makePlan(), {
    structureId: "ma-90-optional-minor-30",
    components: [
      {
        slotId: "major",
        programmeId: "master-digitinf-informatics",
        variantId: "major-90",
        startSemester: "AS-2026",
        recipeVersion: "2026-27.1",
      },
    ],
  });
  expect(plan.targetEcts).toBe(90);
  expect(adapter.resolvedPlanDegree(plan)?.additionalEcts).toBe(0);
});

it("allocates each course once across diploma and additional requirements, including explicit substitutions", () => {
  let plan = adapter.bindDegreeSelection(makePlan(), {
    structureId: "ba-180-extra-60",
    components: [
      {
        slotId: "major",
        programmeId: "bachelor-ius-law",
        variantId: "major-180",
        startSemester: "AS-2026",
        recipeVersion: "2026-27.1",
      },
      {
        slotId: "extra",
        programmeId: "bachelor-digitinf-businessinformatics",
        variantId: "minor-60",
        startSemester: "AS-2026",
        recipeVersion: "2026-27.1",
      },
    ],
  });
  plan.scenarios[0].courses.push({
    id: "accounting",
    code: "EIG.00036",
    titles: { en: "Accounting" },
    ects: 6,
    status: "completed",
    semester: null,
    pinned: false,
    offering: null,
  });
  const majorNode = "bachelor-ius-law/major-180@2026-27.1/law-iur-1-1";
  expect(adapter.evaluateAdditionalRequirements(plan)?.earned).toBe(6);
  plan = adapter.setRequirementEvidence(plan, {
    overrides: [
      {
        kind: "substitution",
        courseId: "accounting",
        nodeId: majorNode,
        reason: "Approved transfer",
      },
    ],
    completedChecklist: [],
  });
  expect(adapter.evaluatePlanRequirements(plan)?.earned).toBe(6);
  expect(adapter.evaluateAdditionalRequirements(plan)?.earned).toBe(0);
});
