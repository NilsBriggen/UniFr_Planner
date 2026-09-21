import { expect, it } from "vitest";
import { createPlan, importAsNew } from "../planner/domain";
import { shareSnapshot } from "./model";
it("shares only the active scenario and requires explicit inclusion of personal periods", () => {
  const plan = createPlan({
    id: "a",
    scenarioId: "s",
    name: "CS",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
  plan.scenarios[0].unavailable.push({
    id: "private",
    label: "Doctor",
    start: "2026-09-21T10:00:00Z",
    end: "2026-09-21T11:00:00Z",
  });
  plan.scenarios[0].requirementEvidence = {
    overrides: [],
    completedChecklist: ["private note"],
  };
  plan.scenarios.push({
    ...plan.scenarios[0],
    id: "other",
    name: "Private alternative",
  });
  const shared = shareSnapshot(plan, false);
  expect(shared.scenarios).toHaveLength(1);
  expect(shared.scenarios[0].unavailable).toEqual([]);
  expect(shared.scenarios[0].requirementEvidence).toBeUndefined();
  expect(shareSnapshot(plan, true).scenarios[0].unavailable).toHaveLength(1);
  const copy = importAsNew(shared, "new-owner", "My copy");
  expect(copy.id).not.toBe(plan.id);
  expect(plan.scenarios).toHaveLength(2);
  expect(plan.scenarios[0].unavailable).toHaveLength(1);
});
