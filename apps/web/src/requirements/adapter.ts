import { programmeTemplates } from "../../../../packages/domain/src/programmes";
import {
  evaluateRequirements,
  resolveTemplate,
  type RequirementNode,
} from "../../../../packages/domain/src/requirements";
import {
  activeScenario,
  planSchema,
  updateScenario,
  type Plan,
  type Scenario,
} from "../planner/domain";

export function bindProgramme(
  plan: Plan,
  ref: { code: string; version: string; cohort: number },
): Plan {
  resolveTemplate(programmeTemplates, ref);
  if (plan.requirements && plan.requirements.cohort !== ref.cohort)
    throw new Error("explicit cohort migration required");
  return planSchema.parse({
    ...plan,
    requirements: {
      cohort: ref.cohort,
      templates: [
        ...(plan.requirements?.templates ?? []),
        { code: ref.code, version: ref.version },
      ],
    },
  });
}
export function requirementTree(plan: Plan): RequirementNode | null {
  if (!plan.requirements) return null;
  const children = plan.requirements.templates.map((ref) => {
    const template = resolveTemplate(programmeTemplates, {
      ...ref,
      cohort: plan.requirements!.cohort,
    });
    const prefix = `${ref.code}@${ref.version}/`;
    const qualify = (n: RequirementNode): RequirementNode => ({
      ...n,
      id: prefix + n.id,
      ...("children" in n ? { children: n.children.map(qualify) } : {}),
    });
    return qualify(template.root);
  });
  return {
    id: "degree",
    kind: "all_of",
    children,
    minCredits: plan.targetEcts,
    title: {
      de: "Ausgewählte Studienprogramme",
      fr: "Programmes sélectionnés",
      en: "Selected programmes",
    },
    explanation: {
      de: "Persönliche Planung mit einzeln fixierten Quellenrevisionen. Die Zulässigkeit der Kombination ist nicht bestätigt.",
      fr: "Planification personnelle avec révisions fixées individuellement. L’admissibilité de la combinaison n’est pas confirmée.",
      en: "Personal planning with individually pinned source revisions. Eligibility of this programme combination is unconfirmed.",
    },
    citations: children.flatMap((n) => n.citations),
    reviewStatus: "needs_clarification",
  };
}
export function evaluatePlanRequirements(plan: Plan) {
  const root = requirementTree(plan);
  if (!root) return null;
  const scenario = activeScenario(plan);
  return evaluateRequirements(
    root,
    scenario.courses,
    scenario.requirementEvidence,
  );
}
export function setRequirementEvidence(
  plan: Plan,
  evidence: NonNullable<Scenario["requirementEvidence"]>,
): Plan {
  const next = updateScenario(plan, (s) => ({
    ...s,
    requirementEvidence: evidence,
  }));
  // Refuse stale node/course references instead of silently dropping an override.
  evaluatePlanRequirements(next);
  return next;
}
