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
  function candidates(node: RequirementNode): CourseRecord[] {
    if (!("codes" in node)) return [];
    const personal = new Set(
      overrides.filter((o) => o.nodeId === node.id).map((o) => o.courseId),
    );
    const single = node.kind === "course" || node.kind === "project";
    const sufficient = (c: CourseRecord) =>
      c.ects !== null &&
      c.ects >= (node.minCredits ?? 0) &&
      (node.maxCredits === undefined || c.ects <= node.maxCredits);
    return courses
      .filter(
        (c) =>
          c.status !== "unscheduled" &&
          (single && personal.size > 0
            ? personal.has(c.id)
            : node.codes.includes(c.code) || personal.has(c.id)),
      )
      .sort(
        (a, b) =>
          Number(personal.has(b.id)) - Number(personal.has(a.id)) ||
          (single ? Number(sufficient(b)) - Number(sufficient(a)) : 0),
      );
  }
  const candidatesByNode = new Map(nodes.map((n) => [n.id, candidates(n)]));
  const rank = {
    complete: 4,
    in_progress: 3,
    covered: 2,
    missing: 1,
    needs_clarification: 0,
  };
  const totals = (allocations: Allocation[], status: CourseRecord["status"]) =>
    round(
      allocations
        .filter((a) => a.status === status)
        .reduce((s, a) => s + (a.credits ?? 0), 0),
    );
  type Demand = { amount: number; codes: string[]; reusable: boolean };
  type RemainingField = "remaining" | "remainingToEarn";
  // Credit obligations that explicitly allow reuse may share the same outstanding
  // evidence. Keep allocated record identities separate from hypothetical credits.
  function combineDemands(demands: Demand[]): number {
    const buckets = demands.filter((d) => !d.reusable).map((d) => ({ ...d }));
    for (const demand of demands.filter((d) => d.reusable)) {
      let remaining = demand.amount;
      for (const bucket of [...buckets]) {
        if (remaining <= 0) break;
        const intersection = bucket.codes.filter((code) =>
          demand.codes.includes(code),
        );
        if (!intersection.length) continue;
        const shared = Math.min(bucket.amount, remaining);
        if (shared < bucket.amount)
          buckets.push({ ...bucket, amount: round(bucket.amount - shared) });
        bucket.amount = shared;
        bucket.codes = intersection;
        remaining = round(remaining - shared);
      }
      if (remaining > 0) buckets.push({ ...demand, amount: remaining });
    }
    return round(buckets.reduce((sum, d) => sum + d.amount, 0));
  }
  function demandsFor(
    result: RequirementResult,
    field: RemainingField,
  ): Demand[] {
    if (result.children.length) {
      const demands = result.children.flatMap((c) => demandsFor(c, field));
      const extra = round(result[field] - combineDemands(demands));
      return extra > 0
        ? [...demands, { amount: extra, codes: [], reusable: false }]
        : demands;
    }
    let remaining = result[field];
    const demands: Demand[] = [];
    if (field === "remainingToEarn") {
      for (const allocation of result.allocations.filter(
        (a) => a.status !== "completed",
      )) {
        const amount = Math.min(remaining, allocation.credits ?? 0);
        if (amount > 0)
          demands.push({
            amount,
            codes: [`record:${allocation.courseId}`],
            reusable: !!result.node.allowReuse,
          });
        remaining = round(remaining - amount);
      }
    }
    if (remaining > 0)
      demands.push({
        amount: remaining,
        codes:
          "codes" in result.node
            ? result.node.codes.map((code) => `code:${code}`)
            : [],
        reusable: !!result.node.allowReuse,
      });
    return demands;
  }
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
            result: visit(child, branchUsed, reserved),
            used: branchUsed,
          };
        });
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
                  a.result.planned ||
                a.result.node.id.localeCompare(b.result.node.id, "en"),
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
      for (const c of candidatesByNode.get(node.id)!) {
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
        // A reusable requirement never claims exclusive ownership, even when
        // it appears before the ordinary sibling that will also use the record.
        if (!node.allowReuse) used.add(c.id);
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
        combineDemands(children.flatMap((c) => demandsFor(c, "remaining"))),
        0,
      ),
      remainingToEarn: Math.max(
        round(min - earned),
        combineDemands(
          children.flatMap((c) => demandsFor(c, "remainingToEarn")),
        ),
        0,
      ),
      remainingCourses: Math.max(minCount - allocations.length, 0),
      allocations,
      children,
      selectedChildId,
      explanations: [node.explanation],
    };
  }
  // Allocate exclusive ownership before rendering results. Greedy reservations
  // cannot solve overlapping pools, equivalent courses, or fractional bundles.
  // Explicit personal allocations are fixed; reusable leaves never compete.
  const owners = new Map(overrides.map((o) => [o.courseId, o.nodeId]));
  const eligibleNodes = new Set<string>();
  function collectEligible(node: RequirementNode) {
    eligibleNodes.add(node.id);
    if ("children" in node) {
      const choice = options.choices?.[node.id];
      node.children
        .filter((child) => !choice || child.id === choice)
        .forEach(collectEligible);
    }
  }
  collectEligible(root);
  const leaves = nodes
    .filter((n) => "codes" in n && eligibleNodes.has(n.id))
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
  type OwnershipGroup = { records: CourseRecord[]; owners: string[] };
  const competing: OwnershipGroup[] = [];
  let previousKey: string | undefined;
  for (const record of courses) {
    if (owners.has(record.id)) {
      previousKey = undefined;
      continue;
    }
    const eligible = leaves.filter((n) =>
      candidatesByNode.get(n.id)!.some((c) => c.id === record.id),
    );
    const exclusive = eligible.filter((n) => !n.allowReuse).map((n) => n.id);
    if (exclusive.length < 2) {
      if (exclusive.length) owners.set(record.id, exclusive[0]);
      previousKey = undefined;
      continue;
    }
    // Only consecutive equivalent candidates are interchangeable: an intervening
    // differently weighted record can change a leaf's greedy stopping point.
    // Reusable leaves choose evidence independently, so retain record identity
    // there to preserve the unique-record totals of parent groups.
    const key = JSON.stringify([
      record.status,
      record.ects,
      eligible.map((n) => n.id),
      eligible.some((n) => n.allowReuse) ? record.id : null,
    ]);
    if (key === previousKey) competing.at(-1)!.records.push(record);
    else competing.push({ records: [record], owners: exclusive });
    previousKey = key;
  }
  // Bound synchronous browser work before searching, not after returning a
  // plausible partial result. Untrusted/custom packs may have exponentially
  // many distinct competing signatures. Callers already handle domain errors;
  // an over-budget tree must remain unevaluated instead of claiming a deficit.
  const evaluationSize =
    nodes.length +
    [...candidatesByNode.values()].reduce((sum, list) => sum + list.length, 0);
  const searchLimit = Math.max(
    1,
    Math.min(4096, Math.floor(250_000 / evaluationSize)),
  );
  let distributions = 1;
  for (const group of competing) {
    let choices = 1;
    for (let i = 1; i < group.owners.length; i++) {
      choices = Math.round((choices * (group.records.length + i)) / i);
      if (choices * distributions > searchLimit)
        throw new Error("requirement allocation search limit exceeded");
    }
    distributions *= choices;
  }
  // The objective is global progress, then compulsory-course progress, then
  // earned/current/planned evidence. Stable IDs and course ordering break ties,
  // never the presentation order of siblings or the caller's record order.
  function score(result: RequirementResult): number[] {
    const descendants: RequirementResult[] = [];
    function collect(r: RequirementResult) {
      if (r.children.length) r.children.forEach(collect);
      else descendants.push(r);
    }
    collect(result);
    return [
      rank[result.status],
      -result.remaining,
      -descendants.reduce((sum, r) => sum + r.remainingCourses, 0),
      -result.remainingToEarn,
      descendants
        .filter((r) => r.node.kind === "course" || r.node.kind === "project")
        .reduce((sum, r) => sum + rank[r.status], 0),
      descendants.reduce((sum, r) => sum + rank[r.status], 0),
      result.earned,
      result.inProgress,
      result.planned,
    ];
  }
  let best: RequirementResult | undefined;
  let bestScore: number[] = [];
  function search(index: number): void {
    if (index === competing.length) {
      const result = visit(root, new Set(), owners);
      const candidateScore = score(result);
      const difference = candidateScore.findIndex((n, i) => n !== bestScore[i]);
      if (
        !best ||
        (difference >= 0 && candidateScore[difference] > bestScore[difference])
      ) {
        best = result;
        bestScore = candidateScore;
      }
      return;
    }
    const group = competing[index];
    // Enumerate counts, not permutations of equivalent records: m records and
    // k eligible owners have C(m+k-1,k-1) distributions, instead of k**m.
    // Different eligibility/credit groups multiply. The preflight rejects
    // excessive work explicitly; every accepted search is exhaustive.
    function distribute(ownerIndex: number, start: number): void {
      const last = ownerIndex === group.owners.length - 1;
      for (let count = group.records.length - start; count >= 0; count--) {
        for (let i = start; i < start + count; i++)
          owners.set(group.records[i].id, group.owners[ownerIndex]);
        if (last) search(index + 1);
        else distribute(ownerIndex + 1, start + count);
        if (last) break;
      }
    }
    distribute(0, 0);
  }
  search(0);
  return best!;
}
