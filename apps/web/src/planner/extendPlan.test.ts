import { expect, it } from "vitest";
import { createPlan, planSchema } from "./domain";
import { extendPlanToTerm } from "./extendPlan";

it("extends an existing plan through the requested term without changing scenarios", () => {
  const plan = createPlan({
    id: "p",
    scenarioId: "s",
    name: "Economics",
    programme: "Economics",
    startTerm: "AS-2025",
    semesterCount: 3,
    targetEcts: 180,
  });
  const scenario = plan.scenarios[0];
  const extended = extendPlanToTerm(plan, "SS-2027");
  expect(extended.semesters).toEqual([
    "AS-2025",
    "SS-2026",
    "AS-2026",
    "SS-2027",
  ]);
  expect(extended.scenarios[0]).toBe(scenario);
  expect(extended.id).toBe(plan.id);
  expect(planSchema.safeParse(extended).success).toBe(true);
  expect(extendPlanToTerm(extended, "SS-2027")).toBe(extended);
});

it("preserves the 24-term cap and rejects backward extension", () => {
  const plan = createPlan({
    id: "p",
    scenarioId: "s",
    name: "Part time",
    programme: "Study",
    startTerm: "AS-2025",
    semesterCount: 24,
    targetEcts: 180,
  });
  expect(() => extendPlanToTerm(plan, "AS-2037")).toThrow(RangeError);
  expect(() => extendPlanToTerm(plan, "SS-2025")).toThrow(RangeError);
});
