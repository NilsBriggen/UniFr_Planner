/** No IO, clock, framework or catalogue dependency. All evidence is supplied by callers. */
export type Localized = { de: string; fr: string; en: string };
export type ReviewStatus = "verified" | "needs_clarification" | "draft";
export type Citation = {
  url: string;
  title: string;
  revisionDate: string | null;
  section: string;
  cohort: string;
  retrievedAt: string;
};
type NodeBase = {
  id: string;
  title: Localized;
  explanation: Localized;
  citations: readonly Citation[];
  reviewStatus: ReviewStatus;
  minCredits?: number;
  maxCredits?: number;
  allowReuse?: boolean;
};
export type RequirementNode = NodeBase &
  (
    | { kind: "all_of" | "one_of"; children: readonly RequirementNode[] }
    | { kind: "course" | "project" | "credit_pool"; codes: readonly string[] }
    | { kind: "course_count"; codes: readonly string[]; minCourses: number }
    | { kind: "checklist" }
  );
export type ProgrammeTemplate = {
  code: string;
  version: string;
  degree: "bachelor" | "master";
  faculty: string;
  totalEcts: number;
  cohortFrom: number;
  cohortTo: number;
  title: Localized;
  sources: readonly Citation[];
  reviewStatus: ReviewStatus;
  root: RequirementNode;
};
export type CourseRecord = {
  id: string;
  code: string;
  ects: number | null;
  status: "completed" | "current" | "planned" | "unscheduled";
};
export type PersonalOverride = {
  kind: "allocation" | "substitution";
  courseId: string;
  nodeId: string;
  reason: string;
};
export type EvaluationOptions = {
  overrides?: readonly PersonalOverride[];
  completedChecklist?: readonly string[];
  choices?: Readonly<Record<string, string>>;
};
export type Allocation = {
  courseId: string;
  code: string;
  credits: number | null;
  status: CourseRecord["status"];
  override?: PersonalOverride;
};
export type RequirementResult = {
  node: RequirementNode;
  status:
    | "complete"
    | "in_progress"
    | "covered"
    | "missing"
    | "needs_clarification";
  earned: number;
  inProgress: number;
  planned: number;
  remaining: number;
  remainingToEarn: number;
  remainingCourses: number;
  allocations: Allocation[];
  children: RequirementResult[];
  selectedChildId?: string;
  explanations: Localized[];
};
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const positive = (n: number) => Number.isFinite(n) && n >= 0;
export function flattenRequirements(root: RequirementNode): RequirementNode[] {
  return [
    root,
    ...("children" in root ? root.children.flatMap(flattenRequirements) : []),
  ];
}
function validateTree(root: RequirementNode) {
  const nodes = flattenRequirements(root);
  if (new Set(nodes.map((n) => n.id)).size !== nodes.length)
    throw new Error("duplicate requirement id");
  for (const n of nodes) {
    if (n.minCredits !== undefined && !positive(n.minCredits))
      throw new Error("invalid minimum");
    if (
      n.maxCredits !== undefined &&
      (!positive(n.maxCredits) || n.maxCredits < (n.minCredits ?? 0))
    )
      throw new Error("invalid maximum");
    if ("children" in n && !n.children.length)
      throw new Error("empty requirement group");
    if (
      n.kind === "course_count" &&
      (!Number.isInteger(n.minCourses) || n.minCourses < 1)
    )
      throw new Error("invalid course count");
    if (
      n.reviewStatus === "verified" &&
      (!n.citations.length ||
        n.citations.some(
          (c) =>
            !c.title ||
            !c.section ||
            !c.cohort ||
            !c.retrievedAt ||
            !c.revisionDate ||
            !c.url.startsWith("https://"),
        ))
    )
      throw new Error("verified rule requires complete citations");
  }
  return nodes;
}
export function publishTemplate(input: ProgrammeTemplate): ProgrammeTemplate {
  validateTree(input.root);
  if (
    !positive(input.totalEcts) ||
    input.cohortFrom > input.cohortTo ||
    !input.version
  )
    throw new Error("invalid template");
  if (
    input.reviewStatus === "verified" &&
    flattenRequirements(input.root).some((n) => n.reviewStatus !== "verified")
  )
    throw new Error("unreviewed child");
  const copy: ProgrammeTemplate = JSON.parse(JSON.stringify(input));
  const freeze = (value: unknown): void => {
    if (value && typeof value === "object") {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  };
  freeze(copy);
  return copy;
}
export function resolveTemplate(
  templates: readonly ProgrammeTemplate[],
  ref: { code: string; version: string; cohort: number },
): ProgrammeTemplate {
  const matches = templates.filter(
    (t) =>
      t.code === ref.code &&
      t.version === ref.version &&
      ref.cohort >= t.cohortFrom &&
      ref.cohort <= t.cohortTo,
  );
  if (matches.length !== 1)
    throw new Error("template revision or cohort unavailable");
  return matches[0];
}
export function evaluateRequirements(
  root: RequirementNode,
  records: readonly CourseRecord[],
  options: EvaluationOptions = {},
): RequirementResult {
  const nodes = validateTree(root);
  if (
    new Set(records.map((c) => c.id)).size !== records.length ||
    new Set(records.map((c) => c.code)).size !== records.length
  )
    throw new Error("duplicate course record");
  if (records.some((c) => c.ects !== null && !positive(c.ects)))
    throw new Error("invalid credits");
  const overrides = options.overrides ?? [];
  if (
    (options.completedChecklist ?? []).some(
      (id) => !nodes.some((n) => n.id === id && n.kind === "checklist"),
    )
  )
    throw new Error("invalid completed duty");
  if (new Set(overrides.map((o) => o.courseId)).size !== overrides.length)
    throw new Error("conflicting personal allocations");
  for (const o of overrides) {
    const n = nodes.find((n) => n.id === o.nodeId),
      c = records.find((c) => c.id === o.courseId);
    if (
      !n ||
      !("codes" in n) ||
      !c ||
      !o.reason.trim() ||
      (o.kind === "allocation" && !n.codes.includes(c.code))
    )
      throw new Error("invalid personal allocation");
  }
  for (const [id, choice] of Object.entries(options.choices ?? {})) {
    const node = nodes.find((n) => n.id === id);
    if (node?.kind !== "one_of" || !node.children.some((n) => n.id === choice))
      throw new Error("invalid alternative");
  }
  const statusOrder = { completed: 0, current: 1, planned: 2, unscheduled: 3 };
  const courses = [...records].sort(
    (a, b) =>
      statusOrder[a.status] - statusOrder[b.status] ||
      a.code.localeCompare(b.code, "en"),
  );
  // Reserve narrow compulsory leaves globally, so an earlier broad pool cannot steal them.
  function reserve(
    subtree: RequirementNode,
    parent: ReadonlyMap<string, string>,
  ): Map<string, string> {
    const reserved = new Map(parent);
    function walk(n: RequirementNode) {
      if (n.kind === "one_of") return;
      if (n.kind === "course" || n.kind === "project") {
        const c = courses.find(
          (c) => n.codes.includes(c.code) && !reserved.has(c.id),
        );
        if (c) reserved.set(c.id, n.id);
      } else if ("children" in n) n.children.forEach(walk);
    }
    walk(subtree);
    for (const o of overrides) reserved.set(o.courseId, o.nodeId);
    return reserved;
  }
  const totals = (allocations: Allocation[], status: CourseRecord["status"]) =>
    round(
      allocations
        .filter((a) => a.status === status)
        .reduce((s, a) => s + (a.credits ?? 0), 0),
    );
  function visit(
    node: RequirementNode,
    used: Set<string>,
    reserved: ReadonlyMap<string, string>,
  ): RequirementResult {
    let children: RequirementResult[] = [],
      allocations: Allocation[] = [],
      selectedChildId: string | undefined;
    if ("children" in node) {
      if (node.kind === "one_of") {
        const candidates = node.children.map((child) => {
          const branchUsed = new Set(used);
          return {
            result: visit(child, branchUsed, reserve(child, reserved)),
            used: branchUsed,
          };
        });
        const rank = {
          complete: 4,
          in_progress: 3,
          covered: 2,
          missing: 1,
          needs_clarification: 0,
        };
        const selected = options.choices?.[node.id];
        const best = selected
          ? candidates.find((c) => c.result.node.id === selected)!
          : [...candidates].sort(
              (a, b) =>
                rank[b.result.status] - rank[a.result.status] ||
                b.result.earned +
                  b.result.inProgress +
                  b.result.planned -
                  a.result.earned -
                  a.result.inProgress -
                  a.result.planned,
            )[0];
        selectedChildId = best.result.node.id;
        best.used.forEach((id) => used.add(id));
        // Only the selected alternative contributes; unselected branches remain visible as alternatives in node.children.
        children = [best.result];
      } else children = node.children.map((n) => visit(n, used, reserved));
      const unique = new Map(
        children.flatMap((c) => c.allocations).map((a) => [a.courseId, a]),
      );
      allocations = [...unique.values()];
    } else if ("codes" in node) {
      let credits = 0;
      for (const c of courses) {
        const override = overrides.find((o) => o.courseId === c.id);
        if (c.status === "unscheduled" || (used.has(c.id) && !node.allowReuse))
          continue;
        if (override && override.nodeId !== node.id) continue;
        if (
          !override &&
          !node.allowReuse &&
          reserved.has(c.id) &&
          reserved.get(c.id) !== node.id
        )
          continue;
        if (
          !node.codes.includes(c.code) &&
          !(override?.kind === "substitution" && override.nodeId === node.id)
        )
          continue;
        const enough =
          node.kind === "course_count"
            ? allocations.length >= node.minCourses &&
              credits >= (node.minCredits ?? 0)
            : node.kind === "course" || node.kind === "project"
              ? allocations.length > 0
              : allocations.length > 0 && credits >= (node.minCredits ?? 0);
        if (enough && !override) continue;
        allocations.push({
          courseId: c.id,
          code: c.code,
          credits: c.ects,
          status: c.status,
          ...(override ? { override } : {}),
        });
        credits = round(credits + (c.ects ?? 0));
        used.add(c.id);
      }
    }
    const earned = totals(allocations, "completed"),
      inProgress = totals(allocations, "current"),
      planned = totals(allocations, "planned");
    const total = round(earned + inProgress + planned);
    const min = node.minCredits ?? 0;
    const minCount =
      node.kind === "course_count"
        ? node.minCourses
        : node.kind === "course" || node.kind === "project"
          ? 1
          : 0;
    const dutyDone =
      node.kind !== "checklist" ||
      (options.completedChecklist ?? []).includes(node.id);
    const enough = (credits: number, count: number) =>
      credits >= min && count >= minCount && dutyDone;
    const childSatisfied = (statuses: RequirementResult["status"][]) =>
      children.every((c) => statuses.includes(c.status));
    const complete =
      enough(
        earned,
        allocations.filter((a) => a.status === "completed").length,
      ) && childSatisfied(["complete"]);
    const current =
      enough(
        earned + inProgress,
        allocations.filter((a) => a.status !== "planned").length,
      ) && childSatisfied(["complete", "in_progress"]);
    const covered =
      enough(total, allocations.length) &&
      childSatisfied(["complete", "in_progress", "covered"]);
    const unknown =
      node.reviewStatus !== "verified" ||
      allocations.some((a) => a.credits === null) ||
      children.some((c) => c.status === "needs_clarification") ||
      (node.maxCredits !== undefined && total > node.maxCredits);
    return {
      node,
      status: unknown
        ? "needs_clarification"
        : complete
          ? "complete"
          : current
            ? "in_progress"
            : covered
              ? "covered"
              : "missing",
      earned,
      inProgress,
      planned,
      remaining: Math.max(
        round(min - total),
        children.reduce((s, c) => s + c.remaining, 0),
        0,
      ),
      remainingToEarn: Math.max(
        round(min - earned),
        children.reduce((s, c) => s + c.remainingToEarn, 0),
        0,
      ),
      remainingCourses: Math.max(minCount - allocations.length, 0),
      allocations,
      children,
      selectedChildId,
      explanations: [node.explanation],
    };
  }
  return visit(root, new Set(), reserve(root, new Map()));
}
