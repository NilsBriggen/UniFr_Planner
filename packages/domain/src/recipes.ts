/** Pure recipe composition. Publication metadata is never evidence of a student's achievement. */
import { courseCodeIn, flattenRequirements } from "./requirements";
import type {
  Citation,
  Localized,
  RequirementNode,
  ReviewStatus,
} from "./requirements";
export type { ReviewStatus } from "./requirements";
export type ComponentRole =
  | "major"
  | "minor"
  | "specialisation"
  | "supplement"
  | "training"
  | "teaching_subject";
export type RecipeSource = {
  id: string;
  url: string;
  title: string;
  retrievedAt: string;
  revisionDate: string | null;
  sha256?: string;
  contentSha256?: string;
  archive?: string;
  reviewStatus: ReviewStatus;
};
export type StructureSlot = {
  id: string;
  role: ComponentRole;
  ects: number;
  optional?: boolean;
  countsTowardDegree?: boolean;
  subjects?: string[];
};
export type DegreeStructure = {
  id: string;
  degree: "bachelor" | "master";
  slots: StructureSlot[];
};
export type RecipePoolSelector = {
  programme: string;
  version: string;
  path: string;
  excludeCodes?: string[];
  allowCodes?: string[];
};
export type RecipePrerequisite = { nodeId: string; requires: string[] };
export type ProgrammeVariant = {
  id: string;
  role: ComponentRole;
  ects: number;
  structureIds?: string[];
  requirements?: RequirementNode;
  extends?: string;
  reviewStatus: ReviewStatus;
  gaps: string[];
  applicableFrom?: string;
  applicableTo?: string;
  curriculumVersion?: string;
  poolSelectors?: Record<string, RecipePoolSelector>;
  prerequisites?: RecipePrerequisite[];
};
export type ProgrammeRecipe = {
  id: string;
  subject: string;
  faculty: string;
  degree: "bachelor" | "master";
  title: string;
  titles?: Partial<Localized>;
  sourceIds: string[];
  reviewStatus: ReviewStatus;
  gaps: string[];
  variants: ProgrammeVariant[];
  aliases?: string[];
  combinationPolicy?: "listed" | "unrestricted" | "unknown";
  allowedMinors?: string[];
  curriculumUrls?: string[];
  structureEvidence?: string;
};
export type SelectedComponent = {
  slotId: string;
  programmeId: string;
  variantId: string;
  startSemester: string;
  recipeVersion: string;
};
export type DegreeSelection = {
  structureId: string;
  components: SelectedComponent[];
};
export type CombinationAction =
  | {
      kind: "replace_requirements";
      component: string;
      variantId?: string;
      requirements: RequirementNode;
    }
  | {
      kind: "restrict_pool";
      component: string;
      variantId?: string;
      nodeId: string;
      codes: string[];
    }
  | {
      kind: "require_component";
      subject: string;
      role: ComponentRole;
      ects: number;
    }
  | { kind: "prohibit"; reason: string }
  | { kind: "allow_combination" };
export type CombinationRule = {
  id: string;
  when: { major?: string; majorVariant?: string; components?: string[] };
  sourceIds: string[];
  reviewStatus: ReviewStatus;
  explanation: string;
  actions: CombinationAction[];
};
export type CoverageEntry = {
  sourceUrl: string;
  title: string;
  degree: "bachelor" | "master";
  programmeId?: string;
  disposition: "recipe" | "alias" | "excluded" | "source_gap";
  reason?: string;
};
export type RecipeRegistry = {
  schemaVersion: 1;
  edition: string;
  sources: RecipeSource[];
  structures: DegreeStructure[];
  programmes: ProgrammeRecipe[];
  combinationRules: CombinationRule[];
  coverage: CoverageEntry[];
};
export type ResolvedDegree = {
  root: RequirementNode;
  additionalRoot?: RequirementNode;
  selection: DegreeSelection;
  targetEcts: number;
  additionalEcts: number;
  status: "allowed" | "prohibited" | "needs_clarification";
  issues: string[];
  appliedRules: string[];
  poolSelectors: Record<string, RecipePoolSelector>;
  prerequisites: RecipePrerequisite[];
  resolvedComponents: {
    selected: SelectedComponent;
    variant: ProgrammeVariant;
  }[];
};
const roles: ComponentRole[] = [
  "major",
  "minor",
  "specialisation",
  "supplement",
  "training",
  "teaching_subject",
];
const text = (s: string): Localized => ({ de: s, fr: s, en: s });
const clone = <T>(v: T): T => structuredClone(v);
function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
const nonempty = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;
const url = (v: unknown) =>
  typeof v === "string" && /^https?:\/\/[^\s/]+/.test(v);
function review(value: unknown) {
  check(
    ["verified", "draft", "needs_clarification"].includes(value as string),
    "Invalid reviewStatus",
  );
}
function credits(value: number) {
  check(Number.isFinite(value) && value > 0, "Invalid positive credits");
}
function unique(values: string[], what: string) {
  check(
    values.every(nonempty) && new Set(values).size === values.length,
    `Duplicate or empty ${what}`,
  );
}
function semester(value: string): number {
  check(/^(AS|SS)-\d{4}$/.test(value), `Invalid semester: ${value}`);
  return Number(value.slice(3)) * 2 + Number(value.startsWith("AS"));
}
function degree(value: string) {
  check(value === "bachelor" || value === "master", "Invalid degree");
}
function gapList(gaps: string[]) {
  check(Array.isArray(gaps) && gaps.every(nonempty), "Invalid gaps");
}
export function resolveRecipeVariants(
  registry: RecipeRegistry,
): Map<string, ProgrammeVariant> {
  const raw = new Map<string, ProgrammeVariant>(
    registry.programmes.flatMap((p) =>
      p.variants.map((v) => [`${p.id}/${v.id}`, v] as const),
    ),
  );
  const result = new Map<string, ProgrammeVariant>(),
    visiting = new Set<string>();
  function resolve(key: string): ProgrammeVariant {
    if (result.has(key)) return result.get(key)!;
    check(!visiting.has(key), `Cyclic extends: ${key}`);
    const v = raw.get(key);
    check(v, `Missing extends reference: ${key}`);
    visiting.add(key);
    const base = v.extends ? resolve(v.extends) : undefined;
    const owner = registry.programmes.find((p) => p.id === key.split("/")[0])!;
    const resolved = { ...v, gaps: [...v.gaps, ...owner.gaps] };
    if (owner.reviewStatus !== "verified" || !owner.sourceIds.length)
      resolved.reviewStatus = "needs_clarification";
    for (const field of [
      "requirements",
      "structureIds",
      "curriculumVersion",
      "applicableFrom",
      "applicableTo",
      "poolSelectors",
      "prerequisites",
    ] as const) {
      if (resolved[field] === undefined && base?.[field] !== undefined)
        Object.assign(resolved, { [field]: base[field] });
    }
    if (base) {
      resolved.gaps = [...new Set([...base.gaps, ...resolved.gaps])];
      if (base.reviewStatus !== "verified")
        resolved.reviewStatus = "needs_clarification";
    }
    visiting.delete(key);
    result.set(key, resolved);
    return resolved;
  }
  raw.forEach((_, key) => resolve(key));
  return result;
}
/** Minimum compulsory demand. Alternatives contribute only their smallest branch. */
function minimumDemand(node: RequirementNode): number {
  const child =
    "children" in node && node.children.length
      ? node.kind === "one_of"
        ? Math.min(...node.children.map(minimumDemand))
        : node.children
            .filter((n) => !n.allowReuse)
            .reduce((sum, n) => sum + minimumDemand(n), 0)
      : 0;
  return Math.max(node.minCredits ?? 0, child);
}
function validateRequirements(
  root: RequirementNode,
  unresolved: boolean,
): void {
  const nodes = flattenRequirements(root);
  unique(
    nodes.map((n) => n.id),
    "requirement id",
  );
  for (const n of nodes) {
    review(n.reviewStatus);
    check(
      !("children" in n) ||
        n.children.length > 0 ||
        n.reviewStatus !== "verified",
      `Verified empty requirement group: ${n.id}`,
    );
    check(
      [
        "all_of",
        "one_of",
        "course",
        "project",
        "credit_pool",
        "course_count",
        "checklist",
      ].includes(n.kind),
      "Invalid requirement kind",
    );
    for (const amount of [n.minCredits, n.maxCredits])
      if (amount !== undefined)
        check(
          Number.isFinite(amount) && amount >= 0,
          "Invalid requirement credits",
        );
    check(
      unresolved ||
        n.maxCredits === undefined ||
        minimumDemand(n) <= n.maxCredits,
      `Contradictory compulsory credit bounds: ${n.id}`,
    );
    if (n.kind === "course_count")
      check(
        Number.isInteger(n.minCourses) && n.minCourses > 0,
        "Invalid course count",
      );
    if ("codes" in n)
      check(
        Array.isArray(n.codes) && n.codes.every(nonempty),
        "Invalid eligible codes",
      );
    check(Array.isArray(n.citations), "Missing requirement citations");
  }
}
export function assertRecipeRegistry(registry: RecipeRegistry): void {
  check(
    registry.schemaVersion === 1 && nonempty(registry.edition),
    "Invalid registry version",
  );
  unique(
    registry.sources.map((s) => s.id),
    "source id",
  );
  unique(
    registry.structures.map((s) => s.id),
    "structure id",
  );
  unique(
    registry.programmes.map((p) => p.id),
    "programme id",
  );
  unique(
    registry.combinationRules.map((r) => r.id),
    "combination rule id",
  );
  const sources = new Set(registry.sources.map((s) => s.id)),
    programmes = new Map(registry.programmes.map((p) => [p.id, p]));
  const subjects = new Set(registry.programmes.map((p) => p.subject)),
    structures = new Set(registry.structures.map((s) => s.id));
  const refs = (ids: string[]) => {
    unique(ids, "source reference");
    ids.forEach((id) => check(sources.has(id), `Unknown source: ${id}`));
  };
  for (const s of registry.sources) {
    review(s.reviewStatus);
    check(
      url(s.url) && nonempty(s.title) && nonempty(s.retrievedAt),
      `Invalid source: ${s.id}`,
    );
  }
  for (const s of registry.structures) {
    degree(s.degree);
    check(s.slots.length > 0, "Empty degree structure");
    unique(
      s.slots.map((slot) => slot.id),
      "slot id",
    );
    for (const slot of s.slots) {
      credits(slot.ects);
      check(roles.includes(slot.role), "Invalid slot role");
      for (const id of slot.subjects ?? [])
        check(subjects.has(id), `Unknown slot subject: ${id}`);
    }
  }
  for (const p of registry.programmes) {
    degree(p.degree);
    review(p.reviewStatus);
    gapList(p.gaps);
    refs(p.sourceIds);
    check(
      nonempty(p.subject) &&
        nonempty(p.title) &&
        nonempty(p.faculty) &&
        !p.id.includes("/"),
      `Invalid programme: ${p.id}`,
    );
    check(
      p.combinationPolicy === undefined ||
        ["listed", "unrestricted", "unknown"].includes(p.combinationPolicy),
      "Invalid combination policy",
    );
    for (const id of p.allowedMinors ?? [])
      check(subjects.has(id), `Unknown allowed minor subject: ${id}`);
    unique(
      p.variants.map((v) => v.id),
      "variant id",
    );
    for (const v of p.variants) {
      review(v.reviewStatus);
      gapList(v.gaps);
      credits(v.ects);
      check(
        roles.includes(v.role) && !v.id.includes("/"),
        "Invalid variant role/id",
      );
    }
  }
  const variants = resolveRecipeVariants(registry);
  for (const p of registry.programmes)
    for (const raw of p.variants) {
      const v = variants.get(`${p.id}/${raw.id}`)!;
      for (const id of v.structureIds ?? [])
        check(structures.has(id), `Unknown structure: ${id}`);
      if (v.applicableFrom !== undefined) semester(v.applicableFrom);
      if (v.applicableTo !== undefined) semester(v.applicableTo);
      if (v.applicableFrom && v.applicableTo)
        check(
          semester(v.applicableFrom) <= semester(v.applicableTo),
          "Invalid applicability range",
        );
      check(
        v.requirements || (v.reviewStatus !== "verified" && v.gaps.length > 0),
        `Missing requirements need unresolved review and gaps: ${p.id}/${v.id}`,
      );
      validateCatalogueRefs(
        v.requirements,
        v.poolSelectors ?? {},
        v.prerequisites ?? [],
      );
      if (v.requirements) {
        const unresolved =
          (v.reviewStatus === "needs_clarification" && v.gaps.length > 0) ||
          (p.reviewStatus === "needs_clarification" && p.gaps.length > 0);
        validateRequirements(v.requirements, unresolved);
        check(
          unresolved || minimumDemand(v.requirements) <= v.ects,
          `Compulsory credits exceed variant: ${p.id}/${v.id}`,
        );
      }
    }
  for (const r of registry.combinationRules) {
    review(r.reviewStatus);
    refs(r.sourceIds);
    check(nonempty(r.explanation), "Missing rule explanation");
    for (const id of [
      ...(r.when.components ?? []),
      ...(r.when.major ? [r.when.major] : []),
    ])
      check(programmes.has(id), `Unknown rule programme: ${id}`);
    if (r.when.majorVariant)
      check(
        r.when.major && variants.has(`${r.when.major}/${r.when.majorVariant}`),
        "Unknown major variant",
      );
    for (const action of r.actions) {
      check(
        [
          "replace_requirements",
          "restrict_pool",
          "require_component",
          "prohibit",
          "allow_combination",
        ].includes(action.kind),
        "Invalid combination action",
      );
      if ("component" in action) {
        check(
          programmes.has(action.component),
          `Unknown action component: ${action.component}`,
        );
        if (action.variantId)
          check(
            variants.has(`${action.component}/${action.variantId}`),
            "Unknown action variant",
          );
      }
      if (action.kind === "replace_requirements")
        validateRequirements(action.requirements, false);
      if (action.kind === "restrict_pool") {
        check(
          nonempty(action.nodeId) &&
            Array.isArray(action.codes) &&
            action.codes.every(nonempty),
          "Invalid pool restriction",
        );
        const possibleTrees = programmes
          .get(action.component)!
          .variants.filter(
            (v) => !action.variantId || v.id === action.variantId,
          )
          .map(
            (v) => variants.get(`${action.component}/${v.id}`)!.requirements,
          );
        for (const candidateRule of registry.combinationRules)
          for (const replacement of candidateRule.actions)
            if (
              replacement.kind === "replace_requirements" &&
              replacement.component === action.component &&
              (!action.variantId ||
                !replacement.variantId ||
                action.variantId === replacement.variantId)
            )
              possibleTrees.push(replacement.requirements);
        check(
          possibleTrees.some(
            (tree) =>
              tree &&
              flattenRequirements(tree).some(
                (n) => n.id === action.nodeId && "codes" in n,
              ),
          ),
          `Unknown restriction pool node: ${action.nodeId}`,
        );
      }
      if (action.kind === "require_component") {
        check(
          subjects.has(action.subject) && roles.includes(action.role),
          "Invalid required component",
        );
        credits(action.ects);
      }
      if (action.kind === "prohibit")
        check(nonempty(action.reason), "Missing prohibition reason");
    }
  }
  for (const c of registry.coverage) {
    degree(c.degree);
    check(url(c.sourceUrl) && nonempty(c.title), "Invalid coverage URL/title");
    check(
      ["recipe", "alias", "excluded", "source_gap"].includes(c.disposition),
      "Invalid coverage disposition",
    );
    if (c.disposition === "recipe" || c.disposition === "alias")
      check(
        c.programmeId && programmes.has(c.programmeId),
        "Unknown coverage programme",
      );
    else
      check(nonempty(c.reason), "Coverage exclusions and gaps require reasons");
  }
}
function validateCatalogueRefs(
  root: RequirementNode | undefined,
  selectors: Record<string, RecipePoolSelector>,
  prerequisites: RecipePrerequisite[],
): void {
  const nodes = new Map(
    (root ? flattenRequirements(root) : []).map((n) => [n.id, n]),
  );
  for (const [id, selector] of Object.entries(selectors)) {
    const node = nodes.get(id);
    check(
      node && ["credit_pool", "course_count"].includes(node.kind),
      `Unknown or invalid selector node: ${id}`,
    );
    check(
      nonempty(selector.programme) &&
        nonempty(selector.version) &&
        nonempty(selector.path),
      `Invalid catalogue selector: ${id}`,
    );
    for (const codes of [selector.excludeCodes, selector.allowCodes])
      if (codes !== undefined)
        check(
          Array.isArray(codes) && codes.every(nonempty),
          `Invalid selector codes: ${id}`,
        );
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string): void {
    check(!visiting.has(id), `Cyclic prerequisites: ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    prerequisites
      .filter((p) => p.nodeId === id)
      .flatMap((p) => p.requires)
      .forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  for (const prerequisite of prerequisites) {
    check(
      nodes.has(prerequisite.nodeId) &&
        prerequisite.requires.length > 0 &&
        prerequisite.requires.every(
          (id) => nodes.has(id) && id !== prerequisite.nodeId,
        ),
      `Invalid prerequisite node: ${prerequisite.nodeId}`,
    );
  }
  prerequisites.forEach((p) => visit(p.nodeId));
}
function completeCitation(c: Citation): boolean {
  return (
    c.url.startsWith("https://") &&
    !!(c.title && c.section && c.cohort && c.retrievedAt && c.revisionDate)
  );
}
function unresolvedTree(
  id: string,
  ects: number,
  title: string,
): RequirementNode {
  return {
    id,
    title: text(title),
    explanation: text("Requirement evidence needs clarification"),
    kind: "credit_pool",
    codes: [],
    minCredits: ects,
    reviewStatus: "needs_clarification",
    citations: [],
  };
}
function qualify(
  root: RequirementNode,
  prefix: string,
  issues: string[],
): RequirementNode {
  const node = clone(root);
  node.id = `${prefix}/${node.id}`;
  if (
    node.reviewStatus !== "verified" ||
    !node.citations.length ||
    node.citations.some((c) => !completeCitation(c))
  ) {
    node.reviewStatus = "needs_clarification";
    issues.push(`Unresolved requirement evidence: ${node.id}`);
  }
  if (
    node.maxCredits !== undefined &&
    node.maxCredits < (node.minCredits ?? 0)
  ) {
    delete node.maxCredits;
    node.reviewStatus = "needs_clarification";
  }
  if ("children" in node) {
    if (!node.children.length) {
      issues.push(`Missing requirement children: ${node.id}`);
      return unresolvedTree(node.id, node.minCredits ?? 0, node.title.en);
    }
    node.children = node.children.map((n) => qualify(n, prefix, issues));
  }
  return node;
}
function group(
  id: string,
  title: string,
  children: RequirementNode[],
  ects: number,
  unresolved: boolean,
  citations: Citation[] = [],
): RequirementNode {
  if (!children.length) return unresolvedTree(id, ects, title);
  const evidence = citations.length
    ? citations
    : children.flatMap((n) => [...n.citations]);
  return {
    id,
    title: text(title),
    explanation: text(title),
    kind: "all_of",
    children,
    minCredits: ects,
    reviewStatus:
      unresolved ||
      !evidence.length ||
      evidence.some((c) => !completeCitation(c))
        ? "needs_clarification"
        : "verified",
    citations: evidence,
  };
}
export function composeDegree(
  registry: RecipeRegistry,
  selection: DegreeSelection,
): ResolvedDegree {
  assertRecipeRegistry(registry);
  const structure = registry.structures.find(
    (s) => s.id === selection.structureId,
  );
  check(structure, "Unknown selected structure");
  unique(
    selection.components.map((c) => c.slotId),
    "selected slot",
  );
  unique(
    selection.components.map((c) => `${c.programmeId}/${c.variantId}`),
    "selected component",
  );
  for (const slot of structure.slots)
    check(
      slot.optional || selection.components.some((c) => c.slotId === slot.id),
      `Missing required slot: ${slot.id}`,
    );
  const variants = resolveRecipeVariants(registry),
    issues: string[] = [];
  const components = selection.components.map((selected) => {
    check(
      selected.recipeVersion === registry.edition,
      `Unavailable recipe version: ${selected.recipeVersion}`,
    );
    const slot = structure.slots.find((s) => s.id === selected.slotId);
    check(slot, `Unknown selected slot: ${selected.slotId}`);
    const programme = registry.programmes.find(
      (p) => p.id === selected.programmeId,
    );
    check(programme, `Unknown selected programme: ${selected.programmeId}`);
    const variant = variants.get(`${programme.id}/${selected.variantId}`);
    check(variant, `Unknown selected variant: ${selected.variantId}`);
    check(
      programme.degree === structure.degree &&
        slot.role === variant.role &&
        slot.ects === variant.ects,
      `Degree/role/credits mismatch: ${slot.id}`,
    );
    check(
      !slot.subjects || slot.subjects.includes(programme.subject),
      `Subject unavailable in slot: ${slot.id}`,
    );
    check(
      !variant.structureIds || variant.structureIds.includes(structure.id),
      `Variant unavailable in structure: ${slot.id}`,
    );
    const start = semester(selected.startSemester);
    check(
      !variant.applicableFrom || start >= semester(variant.applicableFrom),
      `Starting semester before applicability: ${slot.id}`,
    );
    check(
      !variant.applicableTo || start <= semester(variant.applicableTo),
      `Starting semester after applicability: ${slot.id}`,
    );
    const local: string[] = [];
    if (!variant.applicableFrom && !variant.applicableTo)
      local.push(`Missing applicability dates: ${programme.id}/${variant.id}`);
    if (
      programme.reviewStatus !== "verified" ||
      variant.reviewStatus !== "verified"
    )
      local.push(`Unresolved programme review: ${programme.id}/${variant.id}`);
    local.push(
      ...programme.gaps.map((g) => `${programme.id}: ${g}`),
      ...variant.gaps.map((g) => `${programme.id}/${variant.id}: ${g}`),
    );
    if (!programme.sourceIds.length)
      local.push(`Missing programme sources: ${programme.id}`);
    return {
      selected,
      slot,
      programme,
      variant,
      local,
      selectors: clone(variant.poolSelectors ?? {}),
      prerequisites: clone(variant.prerequisites ?? []),
      tree: variant.requirements ? clone(variant.requirements) : undefined,
    };
  });
  let prohibited = false;
  const matching = registry.combinationRules.filter((r) => {
    const main = components.find(
      (c) => c.programme.id === r.when.major && c.slot.role === "major",
    );
    return (
      (!r.when.major || !!main) &&
      (!r.when.majorVariant || main?.variant.id === r.when.majorVariant) &&
      (r.when.components ?? []).every((id) =>
        components.some((c) => c.programme.id === id),
      )
    );
  });
  const trustworthy = (r: CombinationRule) =>
    r.reviewStatus === "verified" && r.sourceIds.length > 0;
  const explicitlyAllowed = (ids: string[]) =>
    matching.some(
      (r) =>
        trustworthy(r) &&
        r.actions.some((a) => a.kind === "allow_combination") &&
        ids.every(
          (id) => r.when.major === id || r.when.components?.includes(id),
        ),
    );
  // Explicitly scoped exceptions can override a programme's general discovery list,
  // but cannot remove a separate rule's prohibition.
  for (const major of components.filter((c) => c.slot.role === "major"))
    for (const minor of components.filter((c) => c.slot.role === "minor")) {
      if (explicitlyAllowed([major.programme.id, minor.programme.id])) continue;
      if (major.programme.combinationPolicy === "listed") {
        if (!major.programme.allowedMinors?.includes(minor.programme.subject)) {
          prohibited = true;
          issues.push(
            `Minor not permitted: ${major.programme.id} + ${minor.programme.id}`,
          );
        }
      } else if (
        major.programme.combinationPolicy !== "unrestricted" ||
        !major.programme.sourceIds.length
      )
        issues.push(
          `Unknown combination permission: ${major.programme.id} + ${minor.programme.id}`,
        );
    }
  for (let i = 0; i < components.length; i++)
    for (const b of components.slice(i + 1)) {
      const a = components[i];
      if (
        a.slot.countsTowardDegree !== false &&
        b.slot.countsTowardDegree !== false &&
        !(
          [a.slot.role, b.slot.role].includes("major") &&
          [a.slot.role, b.slot.role].includes("minor")
        ) &&
        !explicitlyAllowed([a.programme.id, b.programme.id])
      )
        issues.push(
          `Unknown combination permission: ${a.programme.id} + ${b.programme.id}`,
        );
      if (
        a.programme.subject === b.programme.subject &&
        [a.slot.role, b.slot.role].includes("major") &&
        [a.slot.role, b.slot.role].includes("minor") &&
        !explicitlyAllowed([a.programme.id, b.programme.id])
      ) {
        prohibited = true;
        issues.push(`Duplicate major/minor subject: ${a.programme.subject}`);
      }
    }
  const replacements = new Map<string, string>();
  // Replacements precede every restriction so rule order cannot discard an earlier restriction.
  for (const r of matching) {
    if (!trustworthy(r)) issues.push(`Unresolved combination rule: ${r.id}`);
    for (const action of r.actions) {
      if (action.kind === "prohibit") {
        prohibited = true;
        issues.push(action.reason);
      }
      if (
        action.kind === "require_component" &&
        !components.some(
          (c) =>
            c.programme.subject === action.subject &&
            c.slot.role === action.role &&
            c.variant.ects === action.ects &&
            (action.role === "supplement" ||
              c.slot.countsTowardDegree !== false),
        )
      ) {
        prohibited = true;
        issues.push(
          `Required component missing: ${action.subject} ${action.role} ${action.ects} ECTS`,
        );
      }
      if (action.kind !== "replace_requirements") continue;
      for (const c of components.filter(
        (c) =>
          c.programme.id === action.component &&
          (!action.variantId || action.variantId === c.variant.id),
      )) {
        const key = c.selected.slotId,
          payload = JSON.stringify(action.requirements);
        check(
          !replacements.has(key) || replacements.get(key) === payload,
          `Conflicting requirement replacements: ${key}`,
        );
        replacements.set(key, payload);
        c.tree = clone(action.requirements);
        // Replacement is a complete requirement contract. Catalogue expansion and
        // prerequisite metadata belong to the old tree, even if IDs are reused.
        c.selectors = {};
        c.prerequisites = [];
      }
    }
  }
  for (const r of matching)
    for (const action of r.actions)
      if (action.kind === "restrict_pool") {
        for (const c of components.filter(
          (c) =>
            c.programme.id === action.component &&
            (!action.variantId || action.variantId === c.variant.id),
        )) {
          const node =
            c.tree &&
            flattenRequirements(c.tree).find((n) => n.id === action.nodeId);
          check(
            node && "codes" in node,
            `Unknown restriction pool: ${action.component}/${action.nodeId}`,
          );
          node.codes = node.codes.filter((code) =>
            courseCodeIn(action.codes, code),
          );
          const selector = c.selectors[action.nodeId];
          if (selector)
            selector.allowCodes =
              selector.allowCodes === undefined
                ? [...action.codes]
                : selector.allowCodes.filter((code) =>
                    courseCodeIn(action.codes, code),
                  );
        }
      }
  const globalUnresolved = issues.length > 0;
  const counted: RequirementNode[] = [],
    additional: RequirementNode[] = [];
  let targetEcts = 0,
    additionalEcts = 0;
  const poolSelectors: Record<string, RecipePoolSelector> = {},
    prerequisites: RecipePrerequisite[] = [];
  for (const c of components) {
    const prefix = `${c.programme.id}/${c.variant.id}@${registry.edition}`;
    if (c.tree) {
      const documentedGap =
        c.variant.reviewStatus !== "verified" && c.variant.gaps.length > 0;
      validateRequirements(c.tree, documentedGap);
      const compatible =
        minimumDemand(c.tree) <= c.variant.ects &&
        (c.tree.maxCredits === undefined ||
          c.tree.maxCredits >= c.variant.ects);
      check(
        compatible || documentedGap,
        `Composed requirement credits incompatible with slot: ${c.selected.slotId}`,
      );
      if (!compatible)
        c.local.push(
          `Composed requirement credit discrepancy: ${c.programme.id}/${c.variant.id} (${c.variant.ects} ECTS slot)`,
        );
    }
    validateCatalogueRefs(c.tree, c.selectors, c.prerequisites);
    for (const [id, selector] of Object.entries(c.selectors))
      poolSelectors[`${prefix}/${id}`] = selector;
    prerequisites.push(
      ...c.prerequisites.map((p) => ({
        nodeId: `${prefix}/${p.nodeId}`,
        requires: p.requires.map((id) => `${prefix}/${id}`),
      })),
    );
    if (!c.tree)
      c.local.push(`Missing requirements: ${c.programme.id}/${c.variant.id}`);
    const tree = c.tree
      ? qualify(c.tree, prefix, c.local)
      : unresolvedTree(
          `${prefix}/unresolved`,
          c.variant.ects,
          c.programme.title,
        );
    const wrapper = group(
      prefix,
      c.programme.title,
      [tree],
      c.variant.ects,
      c.local.length > 0,
    );
    issues.push(...c.local);
    if (c.slot.countsTowardDegree === false) {
      additional.push(wrapper);
      additionalEcts += c.variant.ects;
    } else {
      counted.push(wrapper);
      targetEcts += c.variant.ects;
    }
  }
  const root = group(
    `degree:${structure.id}@${registry.edition}`,
    `${structure.degree}: ${structure.id}`,
    counted,
    targetEcts,
    globalUnresolved || counted.some((c) => c.reviewStatus !== "verified"),
  );
  const additionalRoot = additional.length
    ? group(
        `additional:${structure.id}@${registry.edition}`,
        "Additional obligations",
        additional,
        additionalEcts,
        additional.some((c) => c.reviewStatus !== "verified"),
      )
    : undefined;
  if (!counted.length) issues.push("No degree-counting components selected");
  return {
    root,
    poolSelectors,
    prerequisites,
    resolvedComponents: components.map((c) => ({
      selected: clone(c.selected),
      variant: clone(c.variant),
    })),
    ...(additionalRoot ? { additionalRoot } : {}),
    selection: clone(selection),
    targetEcts,
    additionalEcts,
    status: prohibited
      ? "prohibited"
      : issues.length
        ? "needs_clarification"
        : "allowed",
    issues: [...new Set(issues)],
    appliedRules: matching.map((r) => r.id),
  };
}
