import { expect, it, vi } from "vitest";
import { flattenRequirements } from "../../../../packages/domain/src/requirements";
import { createPlan } from "../planner/domain";

// A deliberate overlap is a positive control for the cross-root allocator.
// Production Law data lacks eligible course codes, so add one only to this
// isolated registry fixture to exercise natural allocation as well as overrides.
vi.mock("../../../../packages/domain/src/registry", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../../../../packages/domain/src/registry")
    >();
  const oldSelection = {
    structureId: "ba-180-extra-60",
    components: [
      {
        slotId: "major",
        programmeId: "bachelor-ius-law",
        variantId: "major-180",
        startSemester: "AS-2026",
        recipeVersion: "2026-27.1",
      },
    ],
  };
  const recipeRegistry = structuredClone(
    original.recipeRegistryForSelection(oldSelection),
  );
  const law = recipeRegistry.programmes.find(
    (p) => p.id === "bachelor-ius-law",
  )!;
  const root = law.variants.find((v) => v.id === "major-180")!.requirements!;
  const visit = (node: typeof root): void => {
    if (node.id === "law-iur-1-1" && "codes" in node)
      node.codes = ["EIG.00036"];
    if ("children" in node) node.children.forEach(visit);
  };
  visit(root);
  return {
    ...original,
    recipeRegistryForSelection: (selection: typeof oldSelection) =>
      selection.components[0]?.recipeVersion === "2026-27.1"
        ? recipeRegistry
        : original.recipeRegistryForSelection(selection),
  };
});
import {
  bindDegreeSelection,
  resolvedPlanDegree,
  evaluatePlanRequirements,
  evaluateAdditionalRequirements,
  setRequirementEvidence,
} from "./adapter";

it("reserves natural diploma allocations once, while explicit additional allocation takes precedence", () => {
  let plan = bindDegreeSelection(
    createPlan({
      id: "overlap",
      scenarioId: "s",
      name: "Overlap",
      programme: "Law",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    }),
    {
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
    },
  );
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
  expect(evaluatePlanRequirements(plan)?.earned).toBe(6);
  expect(evaluateAdditionalRequirements(plan)?.earned).toBe(0);
  const degree = resolvedPlanDegree(plan)!;
  const extra = flattenRequirements(degree.additionalRoot!).find(
    (n) => "codes" in n && n.codes.includes("EIG.00036"),
  )!;
  expect(extra).toBeDefined();
  plan = setRequirementEvidence(plan, {
    overrides: [
      {
        kind: "allocation",
        courseId: "accounting",
        nodeId: extra.id,
        reason: "Allocation to the additional programme",
      },
    ],
    completedChecklist: [],
  });
  expect(evaluatePlanRequirements(plan)?.earned).toBe(0);
  expect(evaluateAdditionalRequirements(plan)?.earned).toBe(6);
  const clean = {
    ...plan,
    scenarios: plan.scenarios.map((s) => ({
      ...s,
      requirementEvidence: { overrides: [], completedChecklist: [] },
    })),
  };
  expect(evaluatePlanRequirements(clean)?.earned).toBe(6);
  expect(evaluateAdditionalRequirements(clean)?.earned).toBe(0);
});
