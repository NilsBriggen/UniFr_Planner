import { expect, it } from "vitest";
import { evaluateRecipeRequirements } from "../src/eligibility";
import type { ResolvedDegree } from "../src/recipes";
import type { RequirementNode } from "../src/requirements";
const l = (en: string) => ({ de: en, fr: en, en });
const citation = {
  url: "https://www.unifr.ch/plan",
  title: "Plan",
  revisionDate: "2026-01-01",
  section: "M1",
  cohort: "2026",
  retrievedAt: "2026-09-21",
};
const pool: RequirementNode = {
  id: "pool",
  kind: "credit_pool",
  codes: [],
  minCredits: 6,
  title: l("Pool"),
  explanation: l("Reviewed selector"),
  reviewStatus: "verified",
  citations: [citation],
};
const resolved = (): ResolvedDegree => ({
  root: {
    id: "degree",
    kind: "all_of",
    children: [pool],
    minCredits: 6,
    title: l("Degree"),
    explanation: l("Degree"),
    reviewStatus: "verified",
    citations: [citation],
  },
  selection: { structureId: "x", components: [] },
  targetEcts: 6,
  additionalEcts: 0,
  status: "allowed",
  issues: [],
  appliedRules: [],
  poolSelectors: { pool: { programme: "Degree", version: "2026", path: "M1" } },
  prerequisites: [],
  resolvedComponents: [],
});
const course = (version = "2026", path = "M1") => ({
  id: "course",
  code: "UE-ABC.1",
  ects: 6,
  status: "completed" as const,
  semester: null,
  offering: {
    snapshot_id: "old-snapshot",
    source_url: "https://www.unifr.ch/timetable/course",
    assignments: [{ programme: "Degree", version, paths: [path] }],
  },
});

it("uses exact persisted plan/version/module evidence, including historical offerings", () => {
  const degree = resolved();
  expect(evaluateRecipeRequirements(degree, [course()]).status).toBe(
    "complete",
  );
  expect(evaluateRecipeRequirements(degree, [course("2025")]).status).toBe(
    "needs_clarification",
  );
  expect(
    evaluateRecipeRequirements(degree, [course("2026", "M10")]).earned,
  ).toBe(0);
  expect(pool).toMatchObject({ codes: [] });
  expect(degree.poolSelectors.pool).toEqual({
    programme: "Degree",
    version: "2026",
    path: "M1",
  });
});
it("applies both exclusions and an explicit empty allow list", () => {
  const degree = resolved();
  degree.poolSelectors.pool.excludeCodes = ["ABC.1"];
  expect(evaluateRecipeRequirements(degree, [course()]).earned).toBe(0);
  degree.poolSelectors.pool.excludeCodes = [];
  degree.poolSelectors.pool.allowCodes = [];
  expect(evaluateRecipeRequirements(degree, [course()]).earned).toBe(0);
});
it("refuses unsourced assignment evidence and never infers eligibility from titles", () => {
  const value = course();
  value.offering.source_url = "";
  expect(evaluateRecipeRequirements(resolved(), [value]).earned).toBe(0);
  expect(
    evaluateRecipeRequirements(resolved(), [{ ...course(), offering: null }])
      .earned,
  ).toBe(0);
  expect(evaluateRecipeRequirements(resolved(), []).status).toBe(
    "needs_clarification",
  );
});
it("blocks a completed dependent course when its prerequisite is not completed", () => {
  const prerequisite: RequirementNode = {
    ...pool,
    id: "prior",
    kind: "course",
    codes: ["PRIOR"],
  };
  const dependent: RequirementNode = {
    ...pool,
    id: "dependent",
    kind: "course",
    codes: ["ABC.1"],
  };
  const degree = resolved();
  degree.poolSelectors = {};
  degree.prerequisites = [{ nodeId: "dependent", requires: ["prior"] }];
  degree.root = {
    ...degree.root,
    kind: "all_of",
    children: [prerequisite, dependent],
    minCredits: 12,
  };
  const result = evaluateRecipeRequirements(degree, [course()]);
  expect(result.children[1].status).toBe("needs_clarification");
  expect(result.explanations.some((x) => x.en.includes("prerequisite"))).toBe(
    true,
  );
  expect(
    evaluateRecipeRequirements(degree, [
      course(),
      { ...course(), id: "prior", code: "PRIOR" },
    ]).status,
  ).toBe("complete");
});
it("only propagates uncertainty from the chosen alternative", () => {
  const degree = resolved();
  degree.root = {
    ...degree.root,
    kind: "one_of",
    children: [{ ...pool, id: "fixed", codes: ["ABC.1"] }, pool],
  };
  const courses = [{ ...course(), offering: null }];
  expect(
    evaluateRecipeRequirements(degree, courses, {
      choices: { degree: "fixed" },
    }).status,
  ).toBe("complete");
  expect(
    evaluateRecipeRequirements(degree, courses, { choices: { degree: "pool" } })
      .status,
  ).toBe("needs_clarification");
});
