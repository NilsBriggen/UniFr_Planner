import {
  composeDegree,
  type DegreeSelection,
  type ResolvedDegree,
} from "../../../../packages/domain/src/recipes";
import { recipeRegistry } from "../../../../packages/domain/src/registry";
import {
  evaluateRecipeRequirements,
  resolveRecipeEligibility,
} from "../../../../packages/domain/src/eligibility";
import { programmeTemplates } from "../../../../packages/domain/src/programmes";
import {
  evaluateRequirements,
  flattenRequirements,
  resolveTemplate,
  type RequirementNode,
  type RequirementResult,
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
  if (plan.degreeSelection)
    throw new Error(
      "Clear the recipe selection before choosing an archived programme.",
    );
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
  const degree = resolvedPlanDegree(plan);
  if (degree)
    return resolveRecipeEligibility(degree, activeScenario(plan).courses);
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
export function resolvedPlanDegree(plan: Plan): ResolvedDegree | null {
  return plan.degreeSelection
    ? composeDegree(recipeRegistry, plan.degreeSelection)
    : null;
}
export function bindDegreeSelection(
  plan: Plan,
  selection: DegreeSelection,
): Plan {
  const degree = composeDegree(recipeRegistry, selection);
  if (degree.status === "prohibited") throw new Error(degree.issues.join("; "));
  if (
    JSON.stringify(plan.degreeSelection) !== JSON.stringify(selection) &&
    plan.scenarios.some(
      (s) =>
        s.requirementEvidence &&
        (s.requirementEvidence.overrides.length ||
          s.requirementEvidence.completedChecklist.length),
    )
  )
    throw new Error(
      "Clear requirement evidence in all scenarios before changing programmes. Courses and timetable remain available.",
    );
  const { requirements: _legacy, ...rest } = plan;
  void _legacy;
  return planSchema.parse({
    ...rest,
    schemaVersion: 2,
    degreeSelection: selection,
    targetEcts: degree.targetEcts,
  });
}
function recipeEvidence(
  plan: Plan,
  degree: ResolvedDegree,
  root: RequirementNode,
) {
  const evidence = activeScenario(plan).requirementEvidence;
  if (!evidence) return undefined;
  const all = new Set(
    [
      ...flattenRequirements(degree.root),
      ...(degree.additionalRoot
        ? flattenRequirements(degree.additionalRoot)
        : []),
    ].map((n) => n.id),
  );
  if (
    [
      ...evidence.overrides.map((o) => o.nodeId),
      ...evidence.completedChecklist,
    ].some((id) => !all.has(id))
  )
    throw new Error(
      "Unknown requirement evidence. Clear stale evidence before continuing.",
    );
  const ids = new Set(flattenRequirements(root).map((n) => n.id));
  return {
    overrides: evidence.overrides.filter((o) => ids.has(o.nodeId)),
    completedChecklist: evidence.completedChecklist.filter((id) => ids.has(id)),
  };
}
function degreeCourses(plan: Plan, degree: ResolvedDegree) {
  const additionalIds = new Set(
    degree.additionalRoot
      ? flattenRequirements(degree.additionalRoot).map((n) => n.id)
      : [],
  );
  const reserved = new Set(
    activeScenario(plan)
      .requirementEvidence?.overrides.filter((o) => additionalIds.has(o.nodeId))
      .map((o) => o.courseId),
  );
  return activeScenario(plan).courses.filter((c) => !reserved.has(c.id));
}
export function evaluateAdditionalRequirements(plan: Plan) {
  const degree = resolvedPlanDegree(plan);
  if (!degree?.additionalRoot) return null;
  const counted = evaluatePlanRequirements(plan)!;
  const used = new Set<string>();
  const visit = (result: RequirementResult) => {
    result.allocations.forEach((a) => used.add(a.courseId));
    result.children.forEach(visit);
  };
  visit(counted);
  const countedIds = new Set(flattenRequirements(degree.root).map((n) => n.id));
  for (const override of activeScenario(plan).requirementEvidence?.overrides ??
    [])
    if (countedIds.has(override.nodeId)) used.add(override.courseId);
  return evaluateRecipeRequirements(
    degree,
    activeScenario(plan).courses.filter((c) => !used.has(c.id)),
    recipeEvidence(plan, degree, degree.additionalRoot),
    degree.additionalRoot,
  );
}
export function evaluatePlanRequirements(plan: Plan) {
  const degree = resolvedPlanDegree(plan);
  if (degree)
    return evaluateRecipeRequirements(
      degree,
      degreeCourses(plan, degree),
      recipeEvidence(plan, degree, degree.root),
    );
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
  evaluateAdditionalRequirements(next);
  return next;
}
