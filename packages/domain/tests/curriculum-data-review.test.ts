import { describe, expect, it } from "vitest";
import registryJson from "../src/recipe-registry.json";
import {
  composeDegree,
  type RecipeRegistry,
  type DegreeSelection,
} from "../src/recipes";
import {
  evaluateRecipeRequirements,
  resolveRecipeEligibility,
} from "../src/eligibility";
import {
  evaluateRequirements,
  flattenRequirements,
  type RequirementNode,
} from "../src/requirements";
const registry = registryJson as RecipeRegistry;
const component = (
  slotId: string,
  programmeId: string,
  variantId: string,
  startSemester = "AS-2026",
) => ({
  slotId,
  programmeId,
  variantId,
  startSemester,
  recipeVersion: registry.edition,
});
const csMath: DegreeSelection = {
  structureId: "ba-120-60",
  components: [
    component("major", "bachelor-digitinf-informatics", "major-120"),
    component("minor", "bachelor-sci-mathematics", "minor-60"),
  ],
};
const programme = (id: string) => registry.programmes.find((p) => p.id === id)!;
const variant = (id: string, v: string) =>
  programme(id).variants.find((x) => x.id === v)!;
const find = (root: RequirementNode, id: string) =>
  flattenRequirements(root).find(
    (n) => n.id === id || n.id.endsWith("/" + id),
  )!;
const record = (code: string, ects: number) => ({
  id: code,
  code,
  ects,
  status: "completed" as const,
});
const leafSum = (n: RequirementNode): number =>
  "children" in n
    ? n.children.reduce((sum, c) => sum + leafSum(c), 0)
    : (n.minCredits ?? 0);

describe("2026 public-source curriculum review", () => {
  it("counts exact first-year Math60 units in CS+Math, excludes discrete maths and retains adviser compensation", () => {
    const degree = composeDegree(registry, csMath);
    const nodes = flattenRequirements(degree.root);
    expect(degree.appliedRules).toContain("cs-math60-discrete-compensation");
    expect(nodes.some((n) => n.id.endsWith("/SMA.01303"))).toBe(false);
    const math = find(degree.root, "math60");
    expect(leafSum(math)).toBe(60);
    expect(find(math, "math60-options").minCredits).toBe(11);
    for (const code of ["SMA.01104", "SMA.01204"]) {
      const n = find(math, code);
      expect(n).toBeDefined();
      expect(evaluateRequirements(n, [record("UE-" + code, 7)]).status).toBe(
        "complete",
      );
      expect(evaluateRequirements(n, [record("SMA.00104", 3)]).status).toBe(
        "missing",
      );
    }
    expect(
      evaluateRequirements(math, [
        record("SMA.01303", 5),
        record("SMA.02131", 7),
      ]).earned,
    ).toBe(0);
    expect(degree.status).toBe("needs_clarification");
  });
  it("preserves the ordinary Math60 total and rejects unreviewed entrant cohorts and editions", () => {
    const math = variant("bachelor-sci-mathematics", "minor-60").requirements!;
    expect(leafSum(math)).toBe(60);
    expect(find(math, "math60-options").minCredits).toBe(6);
    expect(find(math, "SMA.01303").minCredits).toBe(5);
    for (const startSemester of ["AS-2025", "AS-2027"]) {
      const s = structuredClone(csMath);
      s.components[1].startSemester = startSemester;
      expect(() => composeDegree(registry, s)).toThrow(/applicability/);
    }
    const s = structuredClone(csMath);
    s.components[1].recipeVersion = "2099.1";
    expect(() => composeDegree(registry, s)).toThrow(/recipe version/);
  });
  it("maps French thesis, colloquium, writing and counselling once across equivalent languages", () => {
    const root = variant(
      "bachelor-pedpsy-psychology",
      "major-180",
    ).requirements!;
    for (const [de, fr, credits] of [
      ["L25.00133", "L25.00134", 15],
      ["L25.01028", "L25.01029", 3],
      ["L25.01084", "L25.01083", 6],
      ["L25.00042", "L25.01056", 6],
    ] as const) {
      const n = flattenRequirements(root).find(
        (n) => "codes" in n && n.codes.includes(fr),
      )!;
      expect(n).toBeDefined();
      expect(n.reviewStatus).toBe("verified");
      expect(
        evaluateRequirements(n, [record("UE-" + fr, credits)]).status,
      ).toBe("complete");
      const both = evaluateRequirements(n, [
        record(de, credits),
        record(fr, credits),
      ]);
      expect(both.earned).toBe(credits);
      expect(both.allocations).toHaveLength(1);
      expect(
        evaluateRequirements(n, [record("L25.99999", credits)]).status,
      ).toBe("missing");
    }
    expect(evaluateRequirements(root, []).status).toBe("needs_clarification");
    const m3 = find(root, "psy-m3");
    expect(m3.reviewStatus).toBe("needs_clarification");
    expect("codes" in m3 && m3.codes.includes("SPY.01011")).toBe(false);
    // French plan p.12: advanced research methods require an approved
    // intensive empirical thesis; a literature thesis does not qualify.
    const m8 = find(root, "psy-m8");
    expect(evaluateRequirements(m8, [record("L25.01116", 3)]).earned).toBe(0);
    expect(evaluateRequirements(m8, [record("L25.01115", 3)]).earned).toBe(0);
  });
  it("admits Law IUR I only for the exact course, full-time curriculum version and module", () => {
    const degree = composeDegree(registry, {
      structureId: "ba-180",
      components: [component("major", "bachelor-ius-law", "major-180")],
    });
    const roman = {
      ...record("UE-DDR.00353", 9),
      semester: "AS-2026",
      offering: {
        snapshot_id: "review-fixture",
        source_url: "https://www.unifr.ch/timetable/en/course.html?show=133902",
        assignments: [
          { programme: "Law 180", version: "20221107", paths: ["IUR I"] },
        ],
      },
    };
    const good = find(resolveRecipeEligibility(degree, [roman]), "law-iur-1-4");
    expect(evaluateRequirements(good, [roman]).status).toBe("complete");
    for (const assignment of [
      {
        programme: "Part-time Law Studies 180",
        version: "20221107",
        paths: ["IUR I"],
      },
      { programme: "Law 180", version: "20200101", paths: ["IUR I"] },
      { programme: "Law 180", version: "20221107", paths: ["IUR II"] },
    ]) {
      const bad = {
        ...roman,
        offering: { ...roman.offering, assignments: [assignment] },
      };
      const n = find(resolveRecipeEligibility(degree, [bad]), "law-iur-1-4");
      expect(evaluateRequirements(n, [bad]).earned).toBe(0);
    }
    const other = { ...roman, code: "DDR.00621", ects: 12 };
    expect(evaluateRequirements(good, [other]).earned).toBe(0);
    const iur = find(degree.root, "law-iur-1");
    expect(leafSum(iur)).toBe(63);
    expect(find(iur, "law-iur-1-7").minCredits).toBe(3);
    expect(evaluateRecipeRequirements(degree, [roman]).status).toBe(
      "needs_clarification",
    );
  });
  it("keeps MSc optional duties out of the standalone90 and preserves sourced unresolved validation", () => {
    const degree = composeDegree(registry, {
      structureId: "ma-90-optional-minor-30",
      components: [
        component("major", "master-digitinf-informatics", "major-90"),
      ],
    });
    expect(degree.targetEcts).toBe(90);
    expect(degree.issues.join(" ")).not.toMatch(
      /Master-level minor is a teaching/,
    );
    expect(leafSum(find(degree.root, "jmcs90"))).toBe(90);
    expect(find(degree.root, "jmcs-diversification").kind).toBe("checklist");
    expect(find(degree.root, "jmcs-assessment").reviewStatus).toBe(
      "needs_clarification",
    );
    expect(
      flattenRequirements(degree.root).some((n) =>
        n.id.includes("specialisation"),
      ),
    ).toBe(false);
  });
  it("keeps source-total contradictions and elective approval visible", () => {
    const cs = variant("bachelor-digitinf-informatics", "major-120");
    expect(cs.gaps.join(" ")).toContain("123");
    const bi = variant("bachelor-digitinf-businessinformatics", "major-180");
    expect(leafSum(bi.requirements!)).toBe(181.5);
    expect(bi.requirements!.minCredits).toBe(180);
    expect(bi.requirements!.reviewStatus).toBe("needs_clarification");
    const econ = variant("master-eco-economics", "major-90");
    expect(leafSum(econ.requirements!)).toBe(90);
    expect(find(econ.requirements!, "economics-electives").minCredits).toBe(58);
  });
  it("separates ordinary CH60 from teaching warnings and refuses conditional lab eligibility without evidence", () => {
    const p = programme("bachelor-sci-chemistry"),
      v = variant(p.id, "minor-60"),
      root = v.requirements!;
    expect(p.gaps.join(" ")).not.toContain("Teaching-track minor");
    expect(variant(p.id, "major-120-teaching").gaps.join(" ")).toContain(
      "Teaching-track minor",
    );
    expect(leafSum(root)).toBe(60);
    expect(
      evaluateRequirements(find(root, "SCH.01054"), [record("SCH.01054", 3)])
        .status,
    ).toBe("complete");
    for (const code of ["SCH.02235", "SCH.02350", "SCH.01024"]) {
      expect(evaluateRequirements(root, [record(code, 8)]).earned).toBe(0);
    }
    expect(evaluateRequirements(root, [record("SCH.03142", 3)]).status).toBe(
      "needs_clarification",
    );
  });
  it("maps Biology table courses, preserves120 and does not invent an absent course equivalence", () => {
    const root = variant("bachelor-sci-biology", "major-120").requirements!;
    expect(leafSum(root)).toBe(120);
    for (const [code, credits] of [
      ["SBL.00045", 3],
      ["SBL.00074", 5],
      ["SBL.00057", 1.5],
      ["SBL.00015", 3],
    ] as const) {
      expect(
        evaluateRequirements(find(root, code), [record(code, credits)]).status,
      ).toBe("complete");
    }
    expect(evaluateRequirements(root, [record("SBL.00069", 3)]).earned).toBe(0);
    expect(evaluateRequirements(root, []).status).toBe("needs_clarification");
  });
  it("separates History120 and German60 modules, non-credit duties and forbidden combinations", () => {
    const selection: DegreeSelection = {
      structureId: "ba-120-60",
      components: [
        component("major", "bachelor-hist-history", "major-120"),
        component("minor", "bachelor-lang-german", "minor-60"),
      ],
    };
    const degree = composeDegree(registry, selection);
    expect(degree.status).not.toBe("prohibited");
    expect(leafSum(find(degree.root, "history120"))).toBe(120);
    expect(leafSum(find(degree.root, "german60"))).toBe(60);
    expect(find(degree.root, "german-library-training").kind).toBe("checklist");
    expect(
      flattenRequirements(degree.root).some((n) =>
        n.title.en.toLowerCase().includes("latin"),
      ),
    ).toBe(false);
    const prohibited = structuredClone(selection);
    prohibited.components[1] = component(
      "minor",
      "bachelor-hist-contemporaryhistory",
      "minor-60",
    );
    expect(composeDegree(registry, prohibited).status).toBe("prohibited");
  });
});
