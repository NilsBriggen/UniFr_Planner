import {
  courseCodeIn,
  type RequirementResult,
  type ReviewStatus,
} from "../../../../packages/domain/src/requirements";
import { activeScenario, isManualCode, type Plan } from "../planner/domain";

export type ReconciliationRow = {
  courseId: string;
  code: string;
  title: string;
  status: string;
  ects: number | null;
  requirement: string | null;
  mappedEcts: number;
  unallocatedEcts: number | null;
  confidence: "model_verified" | "provisional" | "unmapped";
  reason:
    | "mapped"
    | "additional"
    | "unscheduled"
    | "unknown_ects"
    | "evidence_pending"
    | "allocation_unresolved"
    | "unmapped";
};

export function reconcileCredits(
  plan: Plan,
  result: RequirementResult,
  additional?: RequirementResult | null,
  language: "en" | "de" | "fr" = "en",
) {
  const allResults = (root: RequirementResult): RequirementResult[] => [
    root,
    ...root.children.flatMap(allResults),
  ];
  const primary = allResults(result);
  const extra = additional ? allResults(additional) : [];
  const mapped = new Map<
    string,
    {
      credits: number | null;
      requirement: string;
      review: ReviewStatus;
      additional: boolean;
    }
  >();
  for (const [nodes, outside] of [
    [primary, false],
    [extra, true],
  ] as const)
    for (const node of nodes.filter((n) => n.children.length === 0))
      for (const allocation of node.allocations)
        if (!mapped.has(allocation.courseId))
          mapped.set(allocation.courseId, {
            credits: allocation.credits,
            requirement: node.node.title[language] || node.node.title.en,
            review: node.node.reviewStatus,
            additional: outside,
          });
  const courses = activeScenario(plan).courses;
  const leaves = [...primary, ...extra].filter((node) => "codes" in node.node);
  const rows: ReconciliationRow[] = courses.map((course) => {
    const allocation = mapped.get(course.id);
    const contribution = allocation?.additional
      ? 0
      : (allocation?.credits ?? 0);
    const ects = course.ects;
    return {
      courseId: course.id,
      code: course.code,
      title:
        course.titles[language] ??
        Object.values(course.titles)[0] ??
        course.code,
      status: course.status,
      ects,
      requirement: allocation?.requirement ?? null,
      mappedEcts: contribution,
      unallocatedEcts: ects === null ? null : Math.max(0, ects - contribution),
      confidence:
        !allocation || allocation.additional
          ? "unmapped"
          : allocation.review === "verified"
            ? "model_verified"
            : "provisional",
      reason:
        ects === null
          ? "unknown_ects"
          : allocation?.additional
            ? "additional"
            : allocation
              ? "mapped"
              : course.status === "unscheduled"
                ? "unscheduled"
                : course.status === "completed" && isManualCode(course.code)
                  ? "evidence_pending"
                  : leaves.some(
                        (node) =>
                          "codes" in node.node &&
                          courseCodeIn(node.node.codes, course.code),
                      )
                    ? "allocation_unresolved"
                    : "unmapped",
    };
  });
  const sum = (
    items: ReconciliationRow[],
    value: (row: ReconciliationRow) => number,
  ) =>
    Math.round(items.reduce((total, row) => total + value(row), 0) * 1e6) / 1e6;
  return {
    recordedCompletedEcts: sum(
      rows.filter((row) => row.status === "completed"),
      (row) => row.ects ?? 0,
    ),
    selectedEcts: sum(
      rows.filter((row) => row.status !== "completed"),
      (row) => row.ects ?? 0,
    ),
    mappedEcts: sum(rows, (row) => row.mappedEcts),
    unallocatedEcts: sum(
      rows.filter((row) => row.status !== "completed"),
      (row) => row.unallocatedEcts ?? 0,
    ),
    unallocatedSelectedEcts: sum(
      rows.filter((row) => row.status !== "completed"),
      (row) => row.unallocatedEcts ?? 0,
    ),
    unallocatedCompletedEcts: sum(
      rows.filter((row) => row.status === "completed"),
      (row) => row.unallocatedEcts ?? 0,
    ),
    unknownEctsCount: rows.filter((row) => row.ects === null).length,
    confirmedRemaining: null,
    rows,
  };
}
