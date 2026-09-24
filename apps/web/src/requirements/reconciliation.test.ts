import { expect, it } from "vitest";
import { createPlan } from "../planner/domain";
import { reconcileCredits } from "./reconciliation";
import type { RequirementResult } from "../../../../packages/domain/src/requirements";

const result = (
  allocations: RequirementResult["allocations"],
  reviewStatus: "draft" | "verified" = "draft",
): RequirementResult => ({
  node: {
    id: "major",
    kind: "credit_pool",
    codes: ["CS.1"],
    title: { en: "Major", de: "Hauptfach", fr: "Majeure" },
    explanation: { en: "", de: "", fr: "" },
    citations: [],
    reviewStatus,
    minCredits: 60,
  },
  status: reviewStatus === "verified" ? "missing" : "needs_clarification",
  earned: allocations
    .filter((a) => a.status === "completed")
    .reduce((n, a) => n + (a.credits ?? 0), 0),
  inProgress: 0,
  planned: allocations
    .filter((a) => a.status === "planned")
    .reduce((n, a) => n + (a.credits ?? 0), 0),
  remaining: 44,
  remainingToEarn: 60,
  remainingCourses: 0,
  allocations,
  children: [],
  explanations: [],
});

it("reconciles selected credits with provisional model mapping without losing unmatched courses", () => {
  const plan = createPlan({
    id: "p",
    scenarioId: "s",
    name: "A",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
  plan.scenarios[0].courses = [
    {
      id: "a",
      code: "CS.1",
      titles: { en: "Mapped" },
      ects: 16,
      status: "planned",
      semester: "AS-2026",
      pinned: false,
      offering: null,
    },
    {
      id: "b",
      code: "MATH.1",
      titles: { en: "Unmapped" },
      ects: 14,
      status: "planned",
      semester: "AS-2026",
      pinned: false,
      offering: null,
    },
  ];
  const view = reconcileCredits(
    plan,
    result([{ courseId: "a", code: "CS.1", credits: 16, status: "planned" }]),
  );
  expect(view.selectedEcts).toBe(30);
  expect(view.mappedEcts).toBe(16);
  expect(view.unallocatedEcts).toBe(14);
  expect(
    view.rows.map((r) => [
      r.title,
      r.mappedEcts,
      r.unallocatedEcts,
      r.confidence,
    ]),
  ).toEqual([
    ["Mapped", 16, 0, "provisional"],
    ["Unmapped", 0, 14, "unmapped"],
  ]);
  expect(view.confirmedRemaining).toBeNull();
});

it("counts an explicitly mapped completed course once and keeps context-only prior study outside the ledger", () => {
  const plan = createPlan({
    id: "p",
    scenarioId: "s",
    name: "B",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 6,
    targetEcts: 60,
  });
  plan.scenarios[0].courses = [
    {
      id: "a",
      code: "CS.1",
      titles: { en: "Passed" },
      ects: 6,
      status: "completed",
      semester: "AS-2026",
      pinned: false,
      offering: null,
    },
  ];
  const view = reconcileCredits(
    plan,
    result(
      [{ courseId: "a", code: "CS.1", credits: 6, status: "completed" }],
      "verified",
    ),
  );
  expect(view.recordedCompletedEcts).toBe(6);
  expect(view.selectedEcts).toBe(0);
  expect(view.mappedEcts).toBe(6);
  expect(view.unallocatedCompletedEcts).toBe(0);
  expect(view.rows).toHaveLength(1);
  expect(view.rows[0].confidence).toBe("model_verified");
});

it("keeps self-reported completed totals apart from unallocated selected credits", () => {
  const plan = createPlan({
    id: "p",
    scenarioId: "s",
    name: "B",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
  plan.scenarios[0].courses = [
    {
      id: "prior",
      code: "MANUAL-00000000-0000-0000-0000-000000000001",
      titles: { en: "Prior aggregate placeholder" },
      ects: 60,
      status: "completed",
      semester: null,
      pinned: false,
      offering: null,
    },
    {
      id: "selected",
      code: "CS.2",
      titles: { en: "New course" },
      ects: 22.5,
      status: "planned",
      semester: "AS-2026",
      pinned: false,
      offering: null,
    },
  ];
  const view = reconcileCredits(plan, result([]));
  expect(view.recordedCompletedEcts).toBe(60);
  expect(view.selectedEcts).toBe(22.5);
  expect(view.unallocatedSelectedEcts).toBe(22.5);
  expect(view.unallocatedCompletedEcts).toBe(60);
  expect(view.mappedEcts).toBe(0);
  expect(view.rows[0].reason).toBe("evidence_pending");
});

it("distinguishes a rule-matching course blocked by allocation from a missing mapping", () => {
  const plan = createPlan({
    id: "p",
    scenarioId: "s",
    name: "A",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
  plan.scenarios[0].courses = [
    {
      id: "matching",
      code: "CS.1",
      titles: { en: "Could match" },
      ects: 6,
      status: "planned",
      semester: "AS-2026",
      pinned: false,
      offering: null,
    },
  ];
  expect(reconcileCredits(plan, result([])).rows[0].reason).toBe(
    "allocation_unresolved",
  );
});
