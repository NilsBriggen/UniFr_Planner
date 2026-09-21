import { describe, expect, it } from "vitest";
import { resolveRecipeEligibility } from "../src/eligibility";
import { assertRecipeRegistry, composeDegree } from "../src/recipes";
import type {
  RecipeRegistry,
  DegreeSelection,
  CombinationRule,
} from "../src/recipes";
import { evaluateRequirements, flattenRequirements } from "../src/requirements";
import type { RequirementNode } from "../src/requirements";
const label = { de: "Test", fr: "Test", en: "Test" };
const citation = {
  url: "https://www.unifr.ch/test",
  title: "Test regulation",
  revisionDate: "2026-01-01",
  section: "1",
  cohort: "2026",
  retrievedAt: "2026-09-21",
};
const pool = (
  id = "pool",
  codes = ["A"],
  minCredits = 120,
): RequirementNode => ({
  id,
  title: label,
  explanation: label,
  citations: [citation],
  reviewStatus: "verified",
  kind: "credit_pool",
  codes,
  minCredits,
});
function registry(): RecipeRegistry {
  return {
    schemaVersion: 1,
    edition: "2026.1",
    sources: [
      {
        id: "s",
        url: citation.url,
        title: citation.title,
        revisionDate: citation.revisionDate,
        retrievedAt: citation.retrievedAt,
        reviewStatus: "verified",
      },
    ],
    structures: [
      {
        id: "ba",
        degree: "bachelor",
        slots: [
          { id: "main", role: "major", ects: 120 },
          { id: "minor", role: "minor", ects: 60 },
          {
            id: "extra",
            role: "supplement",
            ects: 30,
            optional: true,
            countsTowardDegree: false,
          },
        ],
      },
    ],
    programmes: [
      {
        id: "a",
        subject: "a",
        faculty: "science",
        degree: "bachelor",
        title: "A",
        sourceIds: ["s"],
        reviewStatus: "verified",
        gaps: [],
        combinationPolicy: "listed",
        allowedMinors: ["b"],
        variants: [
          {
            id: "120",
            role: "major",
            ects: 120,
            structureIds: ["ba"],
            requirements: pool(),
            reviewStatus: "verified",
            gaps: [],
            applicableFrom: "AS-2026",
            applicableTo: "SS-2028",
            curriculumVersion: "v1",
          },
        ],
      },
      {
        id: "b",
        subject: "b",
        faculty: "arts",
        degree: "bachelor",
        title: "B",
        sourceIds: ["s"],
        reviewStatus: "verified",
        gaps: [],
        variants: [
          {
            id: "60",
            role: "minor",
            ects: 60,
            requirements: pool("pool", ["B"], 60),
            reviewStatus: "verified",
            gaps: [],
            applicableFrom: "SS-2025",
            applicableTo: "SS-2028",
          },
        ],
      },
      {
        id: "c",
        subject: "c",
        faculty: "arts",
        degree: "bachelor",
        title: "C",
        sourceIds: ["s"],
        reviewStatus: "verified",
        gaps: [],
        variants: [
          {
            id: "30",
            role: "supplement",
            ects: 30,
            requirements: pool("pool", ["C"], 30),
            reviewStatus: "verified",
            gaps: [],
            applicableFrom: "AS-2026",
          },
        ],
      },
    ],
    combinationRules: [],
    coverage: [
      {
        sourceUrl: citation.url,
        title: "A",
        degree: "bachelor",
        programmeId: "a",
        disposition: "recipe",
      },
    ],
  };
}
function selection(): DegreeSelection {
  return {
    structureId: "ba",
    components: [
      {
        slotId: "main",
        programmeId: "a",
        variantId: "120",
        startSemester: "AS-2026",
        recipeVersion: "2026.1",
      },
      {
        slotId: "minor",
        programmeId: "b",
        variantId: "60",
        startSemester: "SS-2025",
        recipeVersion: "2026.1",
      },
    ],
  };
}
const extra = {
  slotId: "extra",
  programmeId: "c",
  variantId: "30",
  startSemester: "AS-2026",
  recipeVersion: "2026.1",
};
const rule = (
  actions: CombinationRule["actions"],
  id = "r",
): CombinationRule => ({
  id,
  when: { major: "a", components: ["b"] },
  sourceIds: ["s"],
  reviewStatus: "verified",
  explanation: "Test combination",
  actions,
});
describe("recipe composer", () => {
  it("composes independently dated fixed components with qualified immutable requirements", () => {
    const r = registry(),
      s = selection(),
      before = JSON.stringify(r);
    const result = composeDegree(r, s);
    expect(result.status).toBe("allowed");
    expect(result.targetEcts).toBe(180);
    expect(result.additionalEcts).toBe(0);
    expect(flattenRequirements(result.root).map((n) => n.id)).toContain(
      "a/120@2026.1/pool",
    );
    expect(evaluateRequirements(result.root, []).remaining).toBe(180);
    expect(JSON.stringify(r)).toBe(before);
  });
  it("keeps optional supplementary credits outside degree evaluation", () => {
    const r = registry(),
      s = selection();
    s.components.push(extra);
    const result = composeDegree(r, s);
    expect(result.targetEcts).toBe(180);
    expect(result.additionalEcts).toBe(30);
    expect(result.additionalRoot).toBeDefined();
    const records = [
      { id: "a", code: "A", ects: 120, status: "completed" as const },
      { id: "b", code: "B", ects: 60, status: "completed" as const },
      { id: "c", code: "C", ects: 30, status: "completed" as const },
    ];
    expect(evaluateRequirements(result.root, records)).toMatchObject({
      status: "complete",
      earned: 180,
    });
    expect(evaluateRequirements(result.additionalRoot!, records).earned).toBe(
      30,
    );
  });
  it("never reuses a course between counted components", () => {
    const r = registry();
    r.programmes[1].variants[0].requirements = pool("pool", ["A"], 60);
    const result = evaluateRequirements(composeDegree(r, selection()).root, [
      { id: "a", code: "A", ects: 120, status: "completed" },
    ]);
    expect(result.status).toBe("missing");
    expect(result.earned).toBe(120);
    expect(result.remaining).toBeGreaterThanOrEqual(60);
  });
  it.each([
    "edition",
    "missing",
    "duplicate",
    "role",
    "credits",
    "degree",
    "structure",
    "semester",
    "range",
    "unknown",
  ])("rejects invalid selection: %s", (kind) => {
    const r = registry(),
      s = selection();
    if (kind === "edition") s.components[0].recipeVersion = "latest";
    if (kind === "missing") s.components.pop();
    if (kind === "duplicate") s.components.push({ ...s.components[0] });
    if (kind === "role") r.programmes[0].variants[0].role = "minor";
    if (kind === "credits") r.programmes[0].variants[0].ects = 90;
    if (kind === "degree") r.programmes[0].degree = "master";
    if (kind === "structure") {
      r.structures.push({
        id: "other",
        degree: "bachelor",
        slots: [{ id: "main", role: "major", ects: 120 }],
      });
      r.programmes[0].variants[0].structureIds = ["other"];
    }
    if (kind === "semester") s.components[0].startSemester = "2026";
    if (kind === "range") s.components[1].startSemester = "AS-2024";
    if (kind === "unknown") s.components[0].programmeId = "missing";
    expect(() => composeDegree(r, s)).toThrow();
  });
  it("exposes missing requirements, sources, applicability, and unknown combination evidence", () => {
    for (const kind of [
      "requirements",
      "sources",
      "dates",
      "policy",
      "review",
      "gaps",
    ]) {
      const r = registry(),
        p = r.programmes[0];
      if (kind === "requirements") {
        delete p.variants[0].requirements;
        p.variants[0].reviewStatus = "needs_clarification";
        p.variants[0].gaps = ["Curriculum missing"];
      }
      if (kind === "sources") p.sourceIds = [];
      if (kind === "dates") {
        delete p.variants[0].applicableFrom;
        delete p.variants[0].applicableTo;
      }
      if (kind === "policy") p.combinationPolicy = "unknown";
      if (kind === "review") p.reviewStatus = "draft";
      if (kind === "gaps") p.gaps = ["Unresolved approval"];
      const result = composeDegree(r, selection());
      expect(result.status, kind).toBe("needs_clarification");
      expect(result.issues.length).toBeGreaterThan(0);
      expect(evaluateRequirements(result.root, []).status, kind).toBe(
        "needs_clarification",
      );
    }
  });
  it("resolves inherited fields without upgrading an unresolved ancestor", () => {
    const r = registry();
    r.programmes[0].variants.push({
      id: "copy",
      role: "major",
      ects: 120,
      extends: "a/120",
      reviewStatus: "verified",
      gaps: [],
    });
    const s = selection();
    s.components[0].variantId = "copy";
    expect(composeDegree(r, s).status).toBe("allowed");
    r.programmes[0].variants[0].reviewStatus = "needs_clarification";
    r.programmes[0].variants[0].gaps = ["Ancestor gap"];
    expect(composeDegree(r, s).status).toBe("needs_clarification");
  });
  it("applies every matching rule and intersects pools without mutation", () => {
    const r = registry();
    r.programmes[0].variants[0].requirements = pool("pool", ["A", "B", "C"]);
    r.combinationRules = [
      rule([
        {
          kind: "restrict_pool",
          component: "a",
          nodeId: "pool",
          codes: ["A", "B"],
        },
      ]),
      rule(
        [
          {
            kind: "restrict_pool",
            component: "a",
            nodeId: "pool",
            codes: ["B", "C"],
          },
        ],
        "r2",
      ),
    ];
    const before = JSON.stringify(r),
      result = composeDegree(r, selection());
    expect(result.appliedRules).toEqual(["r", "r2"]);
    expect(
      flattenRequirements(result.root).find(
        (n) => n.id === "a/120@2026.1/pool",
      ),
    ).toMatchObject({ codes: ["B"] });
    expect(JSON.stringify(r)).toBe(before);
  });
  it("respects variant-specific replacement actions and detects contradictory replacements", () => {
    const r = registry();
    r.programmes[0].variants.push({
      ...r.programmes[0].variants[0],
      id: "other",
    });
    r.combinationRules = [
      rule([
        {
          kind: "replace_requirements",
          component: "a",
          variantId: "other",
          requirements: pool("new", ["X"]),
        },
      ]),
    ];
    expect(
      flattenRequirements(composeDegree(r, selection()).root).some((n) =>
        n.id.endsWith("/new"),
      ),
    ).toBe(false);
    r.combinationRules.push(
      rule(
        [
          {
            kind: "replace_requirements",
            component: "a",
            requirements: pool("new", ["X"]),
          },
        ],
        "r2",
      ),
      rule(
        [
          {
            kind: "replace_requirements",
            component: "a",
            requirements: pool("new", ["Y"]),
          },
        ],
        "r3",
      ),
    );
    expect(() => composeDegree(r, selection())).toThrow(/conflict|contradict/i);
  });
  it("allows a specific combination exception without overriding any explicit prohibition", () => {
    const r = registry();
    r.programmes[0].allowedMinors = [];
    expect(composeDegree(r, selection()).status).toBe("prohibited");
    r.combinationRules = [rule([{ kind: "allow_combination" }])];
    expect(composeDegree(r, selection()).status).toBe("allowed");
    r.combinationRules.push(
      rule([{ kind: "prohibit", reason: "Separate incompatibility" }], "ban"),
    );
    expect(composeDegree(r, selection()).status).toBe("prohibited");
  });
  it("does not use unverified exceptions to certify combinations or supplement as required minor", () => {
    const r = registry();
    r.programmes[0].combinationPolicy = "unknown";
    r.combinationRules = [rule([{ kind: "allow_combination" }])];
    r.combinationRules[0].reviewStatus = "draft";
    expect(composeDegree(r, selection()).status).toBe("needs_clarification");
    r.combinationRules = [
      rule([
        { kind: "require_component", subject: "c", role: "minor", ects: 30 },
      ]),
    ];
    const s = selection();
    s.components.push(extra);
    expect(composeDegree(r, s).status).toBe("prohibited");
  });
  it("rejects duplicate subjects unless a reviewed rule explicitly allows them", () => {
    const r = registry();
    r.programmes[1].subject = "a";
    r.programmes[0].allowedMinors = ["a"];
    expect(composeDegree(r, selection()).status).toBe("prohibited");
    r.combinationRules = [rule([{ kind: "allow_combination" }])];
    expect(composeDegree(r, selection()).status).toBe("allowed");
  });
});
describe("recipe registry validation", () => {
  it("validates a small registry without a hardcoded programme count", () =>
    expect(() => assertRecipeRegistry(registry())).not.toThrow());
  it.each([
    "programme",
    "source",
    "slot",
    "variant",
    "structure",
    "rule",
    "extends",
    "cycle",
    "credits",
    "review",
    "coverage",
    "coverage_reason",
    "action_ref",
    "allowed_subject",
  ])("rejects invalid registry: %s", (kind) => {
    const r = registry();
    if (kind === "programme") r.programmes.push(r.programmes[0]);
    if (kind === "source") r.programmes[0].sourceIds = ["missing"];
    if (kind === "slot") r.structures[0].slots.push(r.structures[0].slots[0]);
    if (kind === "variant")
      r.programmes[0].variants.push(r.programmes[0].variants[0]);
    if (kind === "structure")
      r.programmes[0].variants[0].structureIds = ["missing"];
    if (kind === "rule") r.combinationRules = [rule([], "r"), rule([], "r")];
    if (kind === "extends") r.programmes[0].variants[0].extends = "a/missing";
    if (kind === "cycle") r.programmes[0].variants[0].extends = "a/120";
    if (kind === "credits") r.structures[0].slots[0].ects = Number.NaN;
    if (kind === "review") r.programmes[0].reviewStatus = "invalid" as never;
    if (kind === "coverage") r.coverage[0].programmeId = "missing";
    if (kind === "coverage_reason")
      r.coverage.push({
        sourceUrl: citation.url,
        title: "Gap",
        degree: "master",
        disposition: "source_gap",
      });
    if (kind === "action_ref")
      r.combinationRules = [
        rule([
          {
            kind: "restrict_pool",
            component: "missing",
            nodeId: "pool",
            codes: [],
          },
        ]),
      ];
    if (kind === "allowed_subject") r.programmes[0].allowedMinors = ["missing"];
    expect(() => assertRecipeRegistry(r)).toThrow();
  });
  it("rejects impossible compulsory credit sums unless explicitly recorded as unresolved", () => {
    const r = registry(),
      v = r.programmes[0].variants[0];
    v.requirements = {
      ...pool(),
      kind: "all_of",
      minCredits: 120,
      maxCredits: 120,
      children: [pool("x", ["X"], 90), pool("y", ["Y"], 60)],
    };
    expect(() => assertRecipeRegistry(r)).toThrow(/credit/i);
    v.reviewStatus = "needs_clarification";
    v.gaps = ["Compulsory sum exceeds published target"];
    expect(() => assertRecipeRegistry(r)).not.toThrow();
    expect(composeDegree(r, selection()).status).toBe("needs_clarification");
  });
});

describe("catalogue evidence contracts", () => {
  it("qualifies inherited selectors and prerequisites, preserving runtime pool restrictions", () => {
    const r = registry(),
      v = r.programmes[0].variants[0];
    v.requirements = {
      ...pool("root"),
      kind: "all_of",
      children: [pool("first", ["A"], 60), pool("later", ["B"], 60)],
    };
    v.poolSelectors = {
      later: {
        programme: "catalogue-a",
        version: "2026",
        path: "root/electives",
        excludeCodes: ["X"],
      },
    };
    v.prerequisites = [{ nodeId: "later", requires: ["first"] }];
    r.programmes[0].variants.push({
      id: "copy",
      role: "major",
      ects: 120,
      extends: "a/120",
      reviewStatus: "verified",
      gaps: [],
    });
    const s = selection();
    s.components[0].variantId = "copy";
    r.combinationRules = [
      rule([
        {
          kind: "restrict_pool",
          component: "a",
          nodeId: "later",
          codes: ["B", "C"],
        },
      ]),
      rule(
        [
          {
            kind: "restrict_pool",
            component: "a",
            nodeId: "later",
            codes: ["C", "D"],
          },
        ],
        "r2",
      ),
    ];
    const result = composeDegree(r, s);
    expect(result.poolSelectors).toEqual({
      "a/copy@2026.1/later": {
        programme: "catalogue-a",
        version: "2026",
        path: "root/electives",
        excludeCodes: ["X"],
        allowCodes: ["C"],
      },
    });
    expect(result.prerequisites).toEqual([
      { nodeId: "a/copy@2026.1/later", requires: ["a/copy@2026.1/first"] },
    ]);
    expect(v.poolSelectors.later).not.toHaveProperty("allowCodes");
  });
  it.each([
    "selector",
    "selector_kind",
    "prerequisite",
    "prerequisite_dependency",
  ])("rejects invalid catalogue node references: %s", (kind) => {
    const r = registry(),
      v = r.programmes[0].variants[0];
    if (kind === "selector")
      v.poolSelectors = {
        missing: { programme: "a", version: "v1", path: "root" },
      };
    if (kind === "selector_kind") {
      v.requirements = { ...pool(), kind: "course", codes: ["A"] };
      v.poolSelectors = {
        pool: { programme: "a", version: "v1", path: "root" },
      };
    }
    if (kind === "prerequisite")
      v.prerequisites = [{ nodeId: "missing", requires: ["pool"] }];
    if (kind === "prerequisite_dependency")
      v.prerequisites = [{ nodeId: "pool", requires: ["missing"] }];
    expect(() => assertRecipeRegistry(r)).toThrow();
  });
  it("cannot upgrade unreviewed programme ancestors through cross-programme inheritance", () => {
    const r = registry();
    r.programmes[0].variants.push({
      id: "copy",
      role: "major",
      ects: 120,
      extends: "c/30",
      reviewStatus: "verified",
      gaps: [],
    });
    r.programmes[2].reviewStatus = "draft";
    const s = selection();
    s.components[0].variantId = "copy";
    expect(composeDegree(r, s).status).toBe("needs_clarification");
  });
});

describe("fail-closed boundaries", () => {
  it("rejects unknown restriction-node references at registry validation", () => {
    const r = registry();
    r.combinationRules = [
      rule([
        {
          kind: "restrict_pool",
          component: "a",
          nodeId: "absent",
          codes: ["A"],
        },
      ]),
    ];
    expect(() => assertRecipeRegistry(r)).toThrow(/pool|node/i);
  });
  it("rejects prerequisite cycles", () => {
    const r = registry(),
      v = r.programmes[0].variants[0];
    v.requirements = {
      ...pool(),
      kind: "all_of",
      children: [pool("x", ["X"], 60), pool("y", ["Y"], 60)],
    };
    v.prerequisites = [
      { nodeId: "x", requires: ["y"] },
      { nodeId: "y", requires: ["x"] },
    ];
    expect(() => assertRecipeRegistry(r)).toThrow(/cycl/i);
  });
  it("never reports unexplained teaching-subject combinations as allowed", () => {
    const r = registry();
    r.structures[0].slots[0].role = "teaching_subject";
    r.structures[0].slots[1].role = "teaching_subject";
    r.programmes[0].variants[0].role = "teaching_subject";
    r.programmes[1].variants[0].role = "teaching_subject";
    expect(composeDegree(r, selection()).status).toBe("needs_clarification");
    r.combinationRules = [
      {
        ...rule([{ kind: "allow_combination" }]),
        when: { components: ["a", "b"] },
      },
    ];
    expect(composeDegree(r, selection()).status).toBe("allowed");
  });
  it("does not let an exception for one minor permit an unrelated minor", () => {
    const r = registry();
    r.programmes[0].allowedMinors = [];
    r.structures[0].slots.push({ id: "minor2", role: "minor", ects: 30 });
    r.programmes[2].variants[0].role = "minor";
    const s = selection();
    s.components.push({ ...extra, slotId: "minor2" });
    r.combinationRules = [rule([{ kind: "allow_combination" }])];
    expect(composeDegree(r, s).status).toBe("prohibited");
  });
  it("keeps a supplementary source gap from making a fulfilled degree incomplete", () => {
    const r = registry(),
      s = selection();
    s.components.push(extra);
    delete r.programmes[2].variants[0].requirements;
    r.programmes[2].variants[0].reviewStatus = "needs_clarification";
    r.programmes[2].variants[0].gaps = ["Supplement curriculum missing"];
    const result = composeDegree(r, s);
    expect(result.status).toBe("needs_clarification");
    expect(
      evaluateRequirements(result.root, [
        { id: "a", code: "A", ects: 120, status: "completed" },
        { id: "b", code: "B", ects: 60, status: "completed" },
      ]).status,
    ).toBe("complete");
    expect(evaluateRequirements(result.additionalRoot!, []).status).toBe(
      "needs_clarification",
    );
  });
});

describe("publication completeness", () => {
  it("rejects verified variants without requirement evidence", () => {
    const r = registry();
    delete r.programmes[0].variants[0].requirements;
    expect(() => assertRecipeRegistry(r)).toThrow(/verified|requirement/i);
    r.programmes[0].variants[0].reviewStatus = "needs_clarification";
    r.programmes[0].variants[0].gaps = ["Curriculum not transcribed"];
    expect(() => assertRecipeRegistry(r)).not.toThrow();
    expect(composeDegree(r, selection()).status).toBe("needs_clarification");
  });
  it("rejects verified empty requirement groups", () => {
    const r = registry();
    r.programmes[0].variants[0].requirements = {
      ...pool(),
      kind: "all_of",
      children: [],
    };
    expect(() => assertRecipeRegistry(r)).toThrow(/empty|requirement/i);
  });
});

describe("independent composition review regressions", () => {
  it("requires evidence for distinct teaching variants of the same programme", () => {
    const r = registry(),
      s = selection();
    r.structures[0].slots[0].role = "teaching_subject";
    r.structures[0].slots[1].role = "teaching_subject";
    r.programmes[0].variants[0].role = "teaching_subject";
    r.programmes[0].variants.push({
      ...r.programmes[1].variants[0],
      role: "teaching_subject",
    });
    s.components[1].programmeId = "a";
    const result = composeDegree(r, s);
    expect(result.status).toBe("needs_clarification");
    expect(result.root.reviewStatus).toBe("needs_clarification");
    r.combinationRules = [
      { ...rule([{ kind: "allow_combination" }]), when: { components: ["a"] } },
    ];
    expect(composeDegree(r, s).status).toBe("allowed");
  });
  it("rejects replacement credit demand above the selected component target", () => {
    const r = registry();
    r.combinationRules = [
      rule([
        {
          kind: "replace_requirements",
          component: "a",
          requirements: pool("replacement", ["X"], 150),
        },
      ]),
    ];
    expect(() => composeDegree(r, selection())).toThrow(/credit/i);
  });
  it("rejects a replacement maximum below the selected component target", () => {
    const r = registry();
    r.combinationRules = [
      rule([
        {
          kind: "replace_requirements",
          component: "a",
          requirements: { ...pool("replacement", ["X"], 90), maxCredits: 90 },
        },
      ]),
    ];
    expect(() => composeDegree(r, selection())).toThrow(/credit/i);
  });
  it("exposes documented replacement credit discrepancies as unresolved", () => {
    const r = registry();
    r.programmes[0].variants[0].reviewStatus = "needs_clarification";
    r.programmes[0].variants[0].gaps = [
      "Combination replacement totals 150 ECTS against the 120 ECTS slot",
    ];
    r.combinationRules = [
      rule([
        {
          kind: "replace_requirements",
          component: "a",
          requirements: pool("replacement", ["X"], 150),
        },
      ]),
    ];
    const result = composeDegree(r, selection());
    expect(result.status).toBe("needs_clarification");
    expect(result.root.reviewStatus).toBe("needs_clarification");
    expect(result.issues.some((issue) => /credit/i.test(issue))).toBe(true);
    expect(evaluateRequirements(result.root, []).status).toBe(
      "needs_clarification",
    );
  });
  it.each(["same", "different"])(
    "discards original selector/prerequisite metadata after %s-ID replacement",
    (kind) => {
      const r = registry(),
        v = r.programmes[0].variants[0];
      v.requirements = {
        ...pool("root"),
        kind: "all_of",
        children: [pool("first", ["A"], 60), pool("later", ["B"], 60)],
      };
      v.poolSelectors = {
        later: { programme: "catalogue-a", version: "2026", path: "electives" },
      };
      v.prerequisites = [{ nodeId: "later", requires: ["first"] }];
      const replacement =
        kind === "same"
          ? {
              ...pool("root"),
              kind: "all_of" as const,
              children: [pool("first", ["X"], 60), pool("later", ["Y"], 60)],
            }
          : pool("replacement", ["X"], 120);
      r.combinationRules = [
        rule([
          {
            kind: "replace_requirements",
            component: "a",
            requirements: replacement,
          },
        ]),
      ];
      const result = composeDegree(r, selection());
      expect(result.poolSelectors).toEqual({});
      expect(result.prerequisites).toEqual([]);
      const original = evaluateRequirements(result.root, [
        { id: "a", code: "A", ects: 60, status: "completed" },
        { id: "b", code: "B", ects: 60, status: "completed" },
      ]);
      expect(original.children[0].earned).toBe(0);
    },
  );
  it("rejects a restriction referring to a node discarded by replacement", () => {
    const r = registry();
    r.combinationRules = [
      rule([
        {
          kind: "replace_requirements",
          component: "a",
          requirements: pool("replacement", ["X"], 120),
        },
        { kind: "restrict_pool", component: "a", nodeId: "pool", codes: ["A"] },
      ]),
    ];
    expect(() => composeDegree(r, selection())).toThrow(/pool/i);
  });
});

it("does not broaden replacement codes from original authoritative catalogue assignments", () => {
  const r = registry(),
    v = r.programmes[0].variants[0];
  v.poolSelectors = {
    pool: { programme: "catalogue-a", version: "2026", path: "electives" },
  };
  const courses = [
    {
      id: "new",
      code: "Y",
      ects: 120,
      status: "completed" as const,
      offering: {
        snapshot_id: "captured",
        source_url: "https://www.unifr.ch/timetable",
        assignments: [
          { programme: "catalogue-a", version: "2026", paths: ["electives"] },
        ],
      },
    },
  ];
  const nodeId = "a/120@2026.1/pool";
  const codes = (tree: RequirementNode) => {
    const node = flattenRequirements(tree).find((n) => n.id === nodeId)!;
    return "codes" in node ? node.codes : [];
  };
  // Positive control: the same authoritative assignment expands the original recipe.
  expect(
    codes(resolveRecipeEligibility(composeDegree(r, selection()), courses)),
  ).toContain("Y");
  r.combinationRules = [
    rule([
      {
        kind: "replace_requirements",
        component: "a",
        requirements: pool("pool", ["X"], 120),
      },
    ]),
  ];
  expect(
    codes(resolveRecipeEligibility(composeDegree(r, selection()), courses)),
  ).toEqual(["X"]);
});
