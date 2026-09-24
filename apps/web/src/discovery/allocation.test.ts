import { expect, it, vi } from "vitest";
import type { RequirementNode } from "../../../../packages/domain/src/requirements";
// Reviewed synthetic curriculum isolates allocator behaviour from source gaps.
vi.mock("../../../../packages/domain/src/registry", async (original) => {
  const source =
    await original<typeof import("../../../../packages/domain/src/registry")>();
  const recipeRegistry = structuredClone(
    source.recipeRegistryForSelection({
      structureId: "ba-180",
      components: [
        {
          slotId: "major",
          programmeId: "bachelor-ius-law",
          variantId: "major-180",
          startSemester: "AS-2026",
          recipeVersion: "2026-27.1",
        },
      ],
    }),
  );
  const leaf = (
    id: string,
    kind: "course" | "credit_pool" = "course",
    codes = [id],
  ): RequirementNode => ({
    id,
    kind,
    codes,
    minCredits: 6,
    reviewStatus: "verified",
    citations: [
      {
        url: "https://example.org/curriculum",
        title: "Fixture",
        revisionDate: "2026-01-01",
        section: "1",
        cohort: "2026",
        retrievedAt: "2026-09-01",
      },
    ],
    title: { en: id, de: id, fr: id },
    explanation: { en: id, de: id, fr: id },
  });
  const group = (
    id: string,
    children: RequirementNode[],
    kind: "all_of" | "one_of" = "all_of",
  ): RequirementNode => ({
    ...leaf(id),
    kind,
    children,
  });
  const major = recipeRegistry.programmes
    .find((p) => p.id === "bachelor-ius-law")!
    .variants.find((v) => v.id === "major-180")!;
  major.requirements = group("root", [
    leaf("FIRST"),
    leaf("LATER"),
    leaf("POOL", "credit_pool", []),
    group("choice", [leaf("A"), leaf("B")], "one_of"),
  ]);
  major.poolSelectors = {
    POOL: { programme: "law", version: "2026", path: "electives" },
  };
  major.prerequisites = [{ nodeId: "LATER", requires: ["FIRST"] }];
  const extra = recipeRegistry.programmes
    .find((p) => p.id === "bachelor-digitinf-businessinformatics")!
    .variants.find((v) => v.id === "minor-60")!;
  extra.requirements = group("extra", [leaf("FIRST"), leaf("EXTRA")]);
  return {
    ...source,
    recipeRegistryForSelection: (
      selection: Parameters<typeof source.recipeRegistryForSelection>[0],
    ) =>
      selection.components.every(
        (component) => component.recipeVersion === "2026-27.1",
      )
        ? recipeRegistry
        : source.recipeRegistryForSelection(selection),
  };
});
import {
  bindDegreeSelection,
  evaluatePlanRequirements,
} from "../requirements/adapter";
import { createPlan, fromOffering, type Plan } from "../planner/domain";
import { publicOffering, publishedCourses } from "../planner/published-fixture";
import { discoverCourses, offeringKey } from "./engine";
import {
  evaluatePlanningRequirements,
  selectedChoices,
} from "../requirements/planning";
import type { Course } from "../api/client";

function plan(extra = false) {
  return bindDegreeSelection(
    createPlan({
      id: "p",
      scenarioId: "s",
      name: "Test",
      programme: "Law",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    }),
    {
      structureId: extra ? "ba-180-extra-60" : "ba-180",
      components: [
        {
          slotId: "major",
          programmeId: "bachelor-ius-law",
          variantId: "major-180",
          startSemester: "AS-2026",
          recipeVersion: "2026-27.1",
        },
        ...(extra
          ? [
              {
                slotId: "extra",
                programmeId: "bachelor-digitinf-businessinformatics",
                variantId: "minor-60",
                startSemester: "AS-2026",
                recipeVersion: "2026-27.1",
              },
            ]
          : []),
      ],
    },
  );
}
function course(code: string, assigned = false): Course {
  const selection = fromOffering(
    publishedCourses()[0].offerings[0],
    code,
    "test",
    false,
  );
  selection.code = code;
  selection.ects = 6;
  const offering = publicOffering(selection);
  offering.source_id = code;
  if (assigned)
    offering.assignments = [
      { programme: "law", version: "2026", paths: ["electives"] },
    ];
  return { code, titles: { en: code }, offerings: [offering] };
}
function assess(p: Plan, c: Course) {
  const result = discoverCourses(p, [c], "AS-2026", "en");
  expect(result.requirementError).toBe(false);
  return result.assessments.get(offeringKey(c.offerings[0]))!;
}
function saved(
  p: Plan,
  c: Course,
  status: "planned" | "completed" = "completed",
) {
  p.scenarios[0].courses.push({
    ...fromOffering(c.offerings[0], c.code, "test", false),
    status,
    semester: status === "completed" ? null : "AS-2026",
  });
}
it("requires exact catalogue assignment metadata and removes fulfilled pools", () => {
  const p = plan();
  expect(assess(p, course("POOL-A")).recommended).toBe(false);
  expect(assess(p, course("POOL-A", true))).toMatchObject({
    recommended: true,
    recommendationKind: "elective",
    contributionEcts: 6,
  });
  const wrong = course("POOL-A", true);
  wrong.offerings[0].assignments[0].version = "2025";
  expect(assess(p, wrong).match).toBeNull();
  saved(p, course("POOL-A", true));
  expect(assess(p, course("POOL-B", true))).toMatchObject({
    match: "requirements",
    recommended: true,
    contributionEcts: 6,
  });
  // The local pool is fulfilled, but its extra credits remain useful until the
  // degree's own 180-credit obligation is covered.
  const large = course("POOL-FULL", true);
  large.offerings[0].ects = 156;
  saved(p, large);
  saved(p, course("FIRST"));
  saved(p, course("LATER"));
  saved(p, course("A"));
  expect(evaluatePlanRequirements(p)?.remaining).toBe(0);
  expect(assess(p, course("POOL-B", true)).recommended).toBe(false);
});
it("excludes explicit unmet prerequisites and labels unparsed prose unknown", () => {
  const p = plan();
  expect(assess(p, course("LATER"))).toMatchObject({
    recommended: false,
    prerequisiteState: "unmet",
  });
  saved(p, course("FIRST"));
  expect(assess(p, course("LATER"))).toMatchObject({
    recommended: true,
    prerequisiteState: "satisfied",
  });
  const unknown = course("LATER");
  unknown.offerings[0].prerequisites = "Familiarity with FIRST is helpful";
  expect(assess(p, unknown)).toMatchObject({
    recommended: true,
    prerequisiteState: "unknown",
  });
});
it("holds the existing one_of choice instead of silently switching branches", () => {
  const p = plan();
  saved(p, course("B"));
  expect(assess(p, course("A"))).toMatchObject({
    match: "requirements",
    recommended: false,
  });
  const initial = evaluatePlanRequirements(p)!;
  const evaluation = evaluatePlanningRequirements(p, selectedChoices(initial));
  expect(evaluation.degree?.remaining).toBe(initial.remaining);
});
it("separates additional studies and never counts one record twice", () => {
  const p = plan(true);
  expect(assess(p, course("FIRST"))).toMatchObject({
    recommendationKind: "required",
    contributionEcts: 6,
  });
  expect(assess(p, course("EXTRA"))).toMatchObject({
    recommendationKind: "additional",
    contributionEcts: 6,
  });
  saved(p, course("FIRST"));
  const result = evaluatePlanningRequirements(p);
  expect(result.degree?.earned).toBe(6);
  expect(result.additional?.earned).toBe(0);
});
it("reports unknown credits without inventing a contribution", () => {
  const c = course("FIRST");
  c.offerings[0].ects = null;
  expect(assess(plan(), c)).toMatchObject({
    recommended: true,
    contributionEcts: null,
    reviewState: "needs_clarification",
  });
});

it("uses refreshed assignment eligibility in schedule-improvement degree impact", async () => {
  const { generateSuggestions } = await import("../suggestions/engine");
  const p = plan();
  saved(p, course("POOL-A", true), "planned");
  const replacement = course("POOL-B", true);
  const candidate = fromOffering(
    replacement.offerings[0],
    "replacement",
    "test",
    false,
  );
  const result = generateSuggestions({
    plan: p,
    requirements: evaluatePlanRequirements(p),
    catalogue: [
      {
        course: candidate,
        prerequisites: [],
        languages: ["en"],
        equivalentTo: [],
        evidence: "Published catalogue assignments",
      },
    ],
  });
  const suggestion = result.suggestions.find(
    (s) => s.after.code === "POOL-B" && s.after.semester === "AS-2026",
  )!;
  expect(suggestion).toBeDefined();
  expect(suggestion.route).toBe("elective");
  expect(suggestion.uncertainty).not.toContain("requirementLoss");
  expect(suggestion.requirementsAfter?.planned).toBe(6);
});

it("allows every unfilled one_of alternative and carries ancestor review gaps", () => {
  const p = plan();
  expect(selectedChoices(evaluatePlanRequirements(p))).toEqual({});
  for (const code of ["A", "B"])
    expect(assess(p, course(code))).toMatchObject({
      recommended: true,
      recommendationKind: "required",
      contributionEcts: 6,
    });
  expect(assess(p, course("POOL-A", true)).recommendationKind).toBe("elective");
  expect(evaluatePlanRequirements(p)?.status).toBe("needs_clarification");
  expect(assess(p, course("FIRST")).reviewState).toBe("needs_clarification");
});

it("adds pool progress without stealing a completed compulsory allocation", () => {
  const p = plan();
  // FIRST is eligible both for its compulsory leaf and for the catalogue pool.
  saved(p, course("FIRST", true));
  saved(p, course("POOL-A", true));
  const before = evaluatePlanningRequirements(p);
  const candidate = course("POOL-B", true);
  expect(assess(p, candidate)).toMatchObject({
    recommended: true,
    contributionEcts: 6,
  });
  saved(p, candidate, "planned");
  const after = evaluatePlanningRequirements(p, selectedChoices(before.degree));
  const flatten = (
    r: NonNullable<typeof before.degree>,
  ): NonNullable<typeof before.degree>[] => [r, ...r.children.flatMap(flatten)];
  const afterNodes = flatten(after.degree!);
  for (const old of flatten(before.degree!)) {
    const current = afterNodes.find((r) => r.node.id === old.node.id)!;
    expect(current.remaining).toBeLessThanOrEqual(old.remaining);
    expect(current.remainingCourses).toBeLessThanOrEqual(old.remainingCourses);
  }
  expect(
    afterNodes
      .find((r) => r.node.id.endsWith("/FIRST"))
      ?.allocations.map((a) => a.code),
  ).toEqual(["FIRST"]);
});

it("retains one_of evidence supplied by a completed checklist duty", async () => {
  const { evaluateRequirements } = await import(
    "../../../../packages/domain/src/requirements"
  );
  const base = {
    title: { en: "Duty", de: "Duty", fr: "Duty" },
    explanation: { en: "Duty", de: "Duty", fr: "Duty" },
    citations: [
      {
        url: "https://example.org/rule",
        title: "Rule",
        revisionDate: "2026-01-01",
        section: "1",
        cohort: "2026",
        retrievedAt: "2026-09-01",
      },
    ],
    reviewStatus: "verified" as const,
  };
  const root: RequirementNode = {
    ...base,
    id: "choice",
    kind: "one_of",
    children: [
      { ...base, id: "a", kind: "checklist" },
      { ...base, id: "b", kind: "checklist" },
    ],
  };
  expect(
    selectedChoices(
      evaluateRequirements(root, [], { completedChecklist: ["b"] }),
    ),
  ).toEqual({ choice: "b" });
  expect(selectedChoices(evaluateRequirements(root, []))).toEqual({});
});
