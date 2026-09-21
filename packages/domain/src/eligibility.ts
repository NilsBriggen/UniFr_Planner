import {
  canonicalCourseCode,
  evaluateRequirements,
  type CourseRecord,
  type EvaluationOptions,
  type RequirementNode,
  type RequirementResult,
} from "./requirements";
import type { ResolvedDegree } from "./recipes";

export type CatalogueAssignment = {
  programme: string;
  version: string;
  paths: readonly string[];
};
export type EligibilityCourse = CourseRecord & {
  semester?: string | null;
  offering?: {
    snapshot_id: string;
    source_url: string;
    assignments?: readonly CatalogueAssignment[];
  } | null;
};
const localized = (en: string) => ({ de: en, fr: en, en });
const term = (value: string) =>
  Number(value.slice(3)) * 2 + Number(value.startsWith("AS"));

/** Uses the offering retained with a selected course, never the latest catalogue head. */
export function resolveRecipeEligibility(
  degree: ResolvedDegree,
  courses: readonly EligibilityCourse[],
  root: RequirementNode = degree.root,
): RequirementNode {
  const resolve = (node: RequirementNode): RequirementNode => {
    if ("children" in node) {
      const children = node.children.map(resolve);
      return { ...node, children };
    }
    const selector = degree.poolSelectors[node.id];
    if (!selector || !("codes" in node)) return { ...node };
    const allowed = (code: string) =>
      !selector.excludeCodes?.some(
        (c) => canonicalCourseCode(c) === canonicalCourseCode(code),
      ) &&
      (selector.allowCodes === undefined ||
        selector.allowCodes.some(
          (c) => canonicalCourseCode(c) === canonicalCourseCode(code),
        ));
    const matched = courses
      .filter(
        (c) =>
          c.offering?.snapshot_id &&
          c.offering.source_url.startsWith("https://") &&
          c.offering.assignments?.some(
            (a) =>
              a.programme === selector.programme &&
              a.version === selector.version &&
              a.paths.includes(selector.path),
          ),
      )
      .map((c) => c.code);
    const codes = [
      ...new Set(
        [...node.codes, ...matched].filter(allowed).map(canonicalCourseCode),
      ),
    ].sort();
    return {
      ...node,
      codes,
      reviewStatus: codes.length ? node.reviewStatus : "needs_clarification",
    };
  };
  return resolve(root);
}

/** Prerequisites affect completion status while keeping reported credit evidence visible. */
export function evaluateRecipeRequirements(
  degree: ResolvedDegree,
  courses: readonly EligibilityCourse[],
  options: EvaluationOptions = {},
  root: RequirementNode = degree.root,
): RequirementResult {
  const result = evaluateRequirements(
    resolveRecipeEligibility(degree, courses, root),
    courses,
    options,
  );
  const all = new Map<string, RequirementResult>();
  const visit = (r: RequirementResult) => {
    all.set(r.node.id, r);
    r.children.forEach(visit);
  };
  visit(result);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const allocations = (
    r: RequirementResult,
  ): RequirementResult["allocations"] => [
    ...r.allocations,
    ...r.children.flatMap(allocations),
  ];
  for (const rule of degree.prerequisites) {
    const target = all.get(rule.nodeId);
    if (!target) continue;
    const attempts = allocations(target)
      .map((a) => courseById.get(a.courseId))
      .filter((c): c is EligibilityCourse => !!c);
    if (!attempts.length) continue;
    const satisfied = rule.requires.every((id) => {
      const prior = all.get(id);
      if (!prior) return false;
      if (prior.status === "complete") return true;
      if (
        prior.status !== "covered" ||
        attempts.some((c) => c.status !== "planned" || !c.semester)
      )
        return false;
      const before = allocations(prior).map((a) => courseById.get(a.courseId));
      return (
        before.length > 0 &&
        before.every(
          (c) =>
            c &&
            (c.status === "completed" ||
              (c.semester &&
                attempts.every((t) => term(c.semester!) < term(t.semester!)))),
        )
      );
    });
    if (!satisfied) {
      const message = localized(
        `The prerequisite for ${target.node.title.en} is not satisfied by completed work or an earlier planned semester.`,
      );
      target.status = "needs_clarification";
      target.explanations.push(message);
      result.status = "needs_clarification";
      result.explanations.push(message);
    }
  }
  const propagate = (r: RequirementResult): boolean => {
    const unresolved =
      r.children.map(propagate).some(Boolean) ||
      r.status === "needs_clarification";
    if (unresolved) r.status = "needs_clarification";
    return unresolved;
  };
  propagate(result);
  return result;
}
