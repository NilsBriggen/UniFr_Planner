import {
  evaluateRequirements,
  type EvaluationOptions,
  type RequirementResult,
} from "../../../../packages/domain/src/requirements";
import {
  evaluatePlanRequirements,
  evaluateAdditionalRequirements,
} from "./adapter";
import { activeScenario, type Plan } from "../planner/domain";

export const resultNodes = (
  result: RequirementResult | null,
): RequirementResult[] =>
  result ? [result, ...result.children.flatMap(resultNodes)] : [];
export const selectedChoices = (
  ...roots: (RequirementResult | null)[]
): NonNullable<EvaluationOptions["choices"]> =>
  Object.fromEntries(
    roots
      .flatMap(resultNodes)
      // An empty allocator default is not a user choice. Only retain branches
      // supported by selected course records or a completed checklist duty.
      .filter(
        (r) =>
          r.selectedChildId &&
          resultNodes(r).some(
            (n) =>
              n.allocations.length > 0 ||
              (n.node.kind === "checklist" && n.status === "complete"),
          ),
      )
      .map((r) => [r.node.id, r.selectedChildId!]),
  );

/** One evaluator for discovery and proposed timetable changes. A fixture tree is
 * supported only when the plan has no pinned academic configuration. */
export function evaluatePlanningRequirements(
  plan: Plan,
  choices?: EvaluationOptions["choices"],
  fixture?: RequirementResult | null,
) {
  if (plan.degreeSelection || plan.requirements)
    return {
      degree: evaluatePlanRequirements(plan, choices),
      additional: evaluateAdditionalRequirements(plan, choices),
    };
  return {
    degree: fixture
      ? evaluateRequirements(fixture.node, activeScenario(plan).courses, {
          ...activeScenario(plan).requirementEvidence,
          choices,
        })
      : null,
    additional: null,
  };
}
