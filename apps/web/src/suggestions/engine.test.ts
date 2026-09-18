import { describe, expect, it } from "vitest";
import { activeScenario, createPlan, type Selection } from "../planner/domain";
import {
  evaluateRequirements,
  type RequirementNode,
} from "../../../../packages/domain/src/requirements";
import {
  generateSuggestions,
  compareRank,
  applySuggestion,
  undoRevision,
  type CatalogueCandidate,
  type Rank,
} from "./engine";

const title = {
  en: "Required course",
  de: "Pflichtkurs",
  fr: "Cours obligatoire",
};
const citation = {
  url: "https://example.org/rule",
  title: "Test rule",
  revisionDate: "2026-01-01",
  section: "1",
  cohort: "2026",
  retrievedAt: "2026-09-01",
};
export function course(id: string, start = "09", term = "AS-2026"): Selection {
  const day = term === "SS-2027" ? "2027-03-01" : "2026-09-21";
  return {
    id,
    code: id,
    titles: title,
    ects: 6,
    status: "planned",
    semester: term,
    pinned: false,
    offering: {
      source_id: id,
      terms: [term],
      source_url: "https://example.org/catalogue",
      snapshot_id: "seed",
      development_fixture: true,
      meeting_state: "resolved",
      meetings: [
        {
          starts_at: `${day}T${start}:00:00Z`,
          ends_at: `${day}T${Number(start) + 1}:00:00Z`,
          location: "A",
          unresolved: false,
          cancelled: false,
          excluded_dates: [],
          additional_dates: [],
          note: "",
        },
      ],
    },
  };
}
const entry = (
  c: Selection,
  extra: Partial<CatalogueCandidate> = {},
): CatalogueCandidate => ({
  course: c,
  languages: ["en"],
  prerequisites: [],
  equivalentTo: [],
  evidence: "Seed catalogue revision 1",
  ...extra,
});
function setup() {
  const plan = createPlan({
    id: "p",
    scenarioId: "s",
    name: "Degree",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 2,
    targetEcts: 12,
  });
  plan.scenarios[0].courses = [course("A"), course("B")];
  const alternative = course("A", "11");
  alternative.offering!.source_id = "A-alternative";
  const root: RequirementNode = {
    id: "required",
    kind: "course",
    codes: ["A"],
    minCredits: 6,
    title,
    explanation: title,
    reviewStatus: "verified",
    citations: [citation],
  };
  return {
    plan,
    catalogue: [entry(alternative)],
    requirements: evaluateRequirements(root, activeScenario(plan).courses),
  };
}

describe("candidate generation and hard constraints", () => {
  it("preserves the supplied one_of choice even when automatic evaluation would prefer another branch", () => {
    const input = setup();
    const root: RequirementNode = {
      ...input.requirements.node,
      id: "choice",
      kind: "one_of",
      children: [
        input.requirements.node,
        {
          ...input.requirements.node,
          id: "chosen",
          kind: "course",
          codes: ["NOT-YET"],
        },
      ],
    };
    input.requirements = evaluateRequirements(
      root,
      activeScenario(input.plan).courses,
      { choices: { choice: "chosen" } },
    );
    expect(input.requirements.selectedChildId).toBe("chosen");
    const suggestion = generateSuggestions(input).suggestions[0];
    expect(suggestion.requirementsAfter?.selectedChildId).toBe("chosen");
    expect(suggestion.requirementsAfter?.children[0].remaining).toBe(6);
    expect(suggestion.advanced).toEqual([]);
  });
  it("warns about a new maxCredits violation even when the rule already needs clarification", () => {
    const input = setup();
    input.requirements = evaluateRequirements(
      {
        ...input.requirements.node,
        kind: "credit_pool",
        codes: ["A"],
        minCredits: 6,
        maxCredits: 6,
        reviewStatus: "draft",
      },
      activeScenario(input.plan).courses,
    );
    input.catalogue[0].course.ects = 8;
    const suggestion = generateSuggestions(input).suggestions[0];
    expect(suggestion.requirementsAfter?.status).toBe("needs_clarification");
    expect(suggestion.uncertainty).toContain("requirementLoss");
    expect(suggestion.impacts[0].before.planned).toBe(6);
    expect(suggestion.impacts[0].after.planned).toBe(8);
  });
  it("rejects conflicting same-identity source records independently of input order", () => {
    const input = setup();
    const conflicting = structuredClone(input.catalogue[0]);
    conflicting.prerequisites = ["UNMET"];
    for (const pair of [
      [input.catalogue[0], conflicting],
      [conflicting, input.catalogue[0]],
    ]) {
      const result = generateSuggestions({ ...input, catalogue: pair });
      expect(result.suggestions).toEqual([]);
      expect(result.rejected).toEqual([
        {
          id: JSON.stringify(["A", "A", "A-alternative", "AS-2026"]),
          reason: "sourceConflict",
          detail: "A",
        },
      ]);
      expect(result.availability).toBe("noSafe");
    }
    conflicting.prerequisites = [];
    conflicting.evidence = "";
    expect(
      generateSuggestions({
        ...input,
        catalogue: [input.catalogue[0], conflicting],
      }),
    ).toEqual(
      generateSuggestions({
        ...input,
        catalogue: [conflicting, input.catalogue[0]],
      }),
    );
    expect(
      generateSuggestions({
        ...input,
        catalogue: [input.catalogue[0], conflicting],
      }).rejected[0].reason,
    ).toBe("sourceConflict");
  });
  it("repairs a dated real clash by changing only its offering, deterministically and without mutation", () => {
    const input = setup(),
      before = JSON.stringify(input);
    const result = generateSuggestions(input);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].route).toBe("alternative");
    expect(result.suggestions[0].rank[0]).toBe(1);
    expect(result.suggestions[0].conflictsAfter).toEqual([]);
    expect(result.suggestions[0].before.offering?.source_id).toBe("A");
    expect(result.suggestions[0].after.offering?.source_id).toBe(
      "A-alternative",
    );
    expect(generateSuggestions(input)).toEqual(result);
    expect(JSON.stringify(input)).toBe(before);
  });
  it("never moves a pinned course", () => {
    const input = setup();
    input.plan.scenarios[0].courses[0].pinned = true;
    expect(generateSuggestions(input).suggestions).toHaveLength(0);
    expect(generateSuggestions(input).rejected.map((r) => r.reason)).toContain(
      "pinned",
    );
  });
  it("explains unsatisfied and unknown prerequisites; only prior completed records satisfy them", () => {
    const input = setup();
    input.catalogue[0].prerequisites = ["B"];
    expect(generateSuggestions(input).rejected[0]).toMatchObject({
      reason: "prerequisite",
      detail: "B",
    });
    input.plan.scenarios[0].courses[1].status = "completed";
    expect(generateSuggestions(input).suggestions).toHaveLength(0); // same term is not prior
    input.plan.scenarios[0].courses[1].semester = null;
    expect(generateSuggestions(input).suggestions).toHaveLength(1);
    input.catalogue[0].prerequisites = null;
    expect(generateSuggestions(input).rejected[0].reason).toBe(
      "prerequisiteUnknown",
    );
  });
  it("requires a real offering in an allowed term and source evidence", () => {
    const input = setup();
    input.catalogue[0].course.offering!.terms = ["AS-2030"];
    expect(generateSuggestions(input).suggestions).toHaveLength(0);
    input.catalogue[0].course.offering!.terms = ["AS-2026"];
    input.catalogue[0].evidence = "";
    expect(generateSuggestions(input).rejected[0].reason).toBe("sourceMissing");
  });
  it("rejects a new hard clash even when the number of clashes is unchanged", () => {
    const input = setup();
    input.plan.scenarios[0].courses.push(course("C", "11"));
    expect(generateSuggestions(input).suggestions).toHaveLength(0);
    expect(generateSuggestions(input).rejected[0].reason).toBe("newConflict");
  });
  it("keeps unknown calendars uncertain and does not claim a proven repair", () => {
    const input = setup();
    input.catalogue[0].course.offering!.meetings = [];
    const suggestion = generateSuggestions(input).suggestions[0];
    expect(suggestion.uncertainty).toContain("calendar");
    expect(suggestion.rank[0]).toBe(0);
  });
  it("never treats non-cancelled meetings outside the offered term as a proven clash repair", () => {
    const input = setup();
    input.catalogue[0].course.offering!.terms = ["SS-2027"];
    const suggestion = generateSuggestions(input).suggestions[0];
    expect(suggestion.uncertainty).toContain("calendar");
    expect(suggestion.rank[0]).toBe(0);
  });
  it("checks cross-semester overlaps at a boundary rather than isolating the semester calendars", () => {
    const input = setup();
    const other = course("C", "11", "SS-2027");
    other.offering!.meetings[0].starts_at = "2027-01-31T23:00:00Z";
    other.offering!.meetings[0].ends_at = "2027-02-01T02:00:00Z";
    input.plan.scenarios[0].courses.push(other);
    input.catalogue[0].course.offering!.meetings[0].starts_at =
      "2027-01-31T22:00:00Z";
    input.catalogue[0].course.offering!.meetings[0].ends_at =
      "2027-02-01T01:00:00Z";
    expect(generateSuggestions(input).suggestions).toHaveLength(0);
    expect(generateSuggestions(input).rejected[0].reason).toBe("newConflict");
  });
  it("generates source-supported equivalents, eligible electives and later terms only", () => {
    const input = setup();
    const root: RequirementNode = {
      ...input.requirements.node,
      kind: "credit_pool",
      codes: ["A", "E"],
    };
    input.requirements = evaluateRequirements(
      root,
      activeScenario(input.plan).courses,
    );
    input.catalogue = [
      entry(course("X", "11"), { equivalentTo: ["A"] }),
      entry(course("E", "12")),
      entry(course("A", "13", "SS-2027")),
      entry(course("UNRELATED", "15")),
    ];
    expect(
      generateSuggestions(input)
        .suggestions.map((s) => s.route)
        .sort(),
    ).toEqual(["elective", "equivalent", "later"]);
    expect(
      generateSuggestions(input).suggestions.find(
        (s) => s.route === "equivalent",
      )?.uncertainty,
    ).toContain("requirementLoss");
    expect(
      generateSuggestions(input).suggestions.find((s) => s.route === "later")
        ?.after.semester,
    ).toBe("SS-2027");
  });
  it("retains unverified rules and personal override uncertainty", () => {
    const input = setup();
    input.plan.scenarios[0].requirementEvidence = {
      overrides: [
        {
          kind: "substitution",
          courseId: "A",
          nodeId: "required",
          reason: "Personal approval",
        },
      ],
      completedChecklist: [],
    };
    input.requirements = evaluateRequirements(
      { ...input.requirements.node, reviewStatus: "draft" },
      activeScenario(input.plan).courses,
      activeScenario(input.plan).requirementEvidence,
    );
    const suggestion = generateSuggestions(input).suggestions[0];
    expect(suggestion.uncertainty).toContain("requirements");
    expect(suggestion.uncertainty).toContain("override");
    expect(suggestion.requirementsAfter?.status).toBe("needs_clarification");
  });
  it("refuses replacements that invalidate an allocation or reinterpret a substitution", () => {
    const input = setup();
    input.plan.scenarios[0].requirementEvidence = {
      overrides: [
        {
          kind: "substitution",
          courseId: "A",
          nodeId: "required",
          reason: "A only",
        },
      ],
      completedChecklist: [],
    };
    input.catalogue = [entry(course("X", "11"), { equivalentTo: ["A"] })];
    expect(generateSuggestions(input).rejected[0].reason).toBe(
      "overrideChange",
    );
  });
  it("distinguishes absent catalogue from no safe suggestion", () => {
    expect(
      generateSuggestions({ ...setup(), catalogue: [] }).availability,
    ).toBe("noData");
    const input = setup();
    input.plan.scenarios[0].courses[0].pinned = true;
    expect(generateSuggestions(input).availability).toBe("noSafe");
  });
});

describe("strict ranking", () => {
  it("ranks the same catalogue identically when its input order is reversed", () => {
    const input = setup();
    const other = course("A", "12");
    other.offering!.source_id = "second";
    input.catalogue.push(entry(other));
    expect(generateSuggestions(input)).toEqual(
      generateSuggestions({
        ...input,
        catalogue: [...input.catalogue].reverse(),
      }),
    );
  });
  it("counts desired free days independently of unavailable periods", () => {
    const input = setup();
    const preferences = {
      languages: [],
      freeDays: [1],
      highPriorityNodeIds: [],
    };
    expect(
      generateSuggestions({ ...input, preferences }).suggestions[0].rank[4],
    ).toBe(-2);
    expect(generateSuggestions(input).suggestions[0].rank[4]).toBe(0);
  });
  it("advances a high-priority elective gap only when that requirement is prioritized", () => {
    const input = setup();
    input.requirements = evaluateRequirements(
      {
        ...input.requirements.node,
        kind: "credit_pool",
        codes: ["A"],
        minCredits: 8,
      },
      activeScenario(input.plan).courses,
    );
    input.catalogue[0].course.ects = 8;
    expect(generateSuggestions(input).suggestions[0].rank[1]).toBe(0);
    expect(
      generateSuggestions({
        ...input,
        preferences: {
          languages: [],
          freeDays: [],
          highPriorityNodeIds: ["required"],
        },
      }).suggestions[0].rank[1],
    ).toBe(2);
  });
  for (let criterion = 0; criterion < 6; criterion++)
    it(`criterion ${criterion + 1} wins over every lower criterion`, () => {
      const higher: Rank = [0, 0, 0, 0, 0, 0],
        lower: Rank = [0, 0, 0, 0, 0, 0];
      higher[criterion] = 1;
      for (let i = criterion + 1; i < 6; i++) lower[i] = 10000;
      expect(
        compareRank({ rank: higher, id: "z" }, { rank: lower, id: "a" }),
      ).toBeLessThan(0);
    });
  it("breaks all ties by stable identifier", () => {
    const rank: Rank = [1, 2, 3, 4, 5, 6];
    expect(compareRank({ rank, id: "a" }, { rank, id: "b" })).toBeLessThan(0);
  });
  it("computes priority gaps, ECTS target, language, unavailable/free day and gaps/travel from evidence", () => {
    const input = setup();
    input.requirements = evaluateRequirements(
      { ...input.requirements.node, minCredits: 8 },
      activeScenario(input.plan).courses,
    );
    input.catalogue[0].course.ects = 8;
    input.plan.targetEcts = 14;
    input.plan.scenarios[0].unavailable = [
      {
        id: "busy",
        label: "Work",
        start: "2026-09-21T11:00:00Z",
        end: "2026-09-21T12:00:00Z",
      },
    ];
    const suggestion = generateSuggestions({
      ...input,
      preferences: {
        languages: ["en"],
        freeDays: [1],
        highPriorityNodeIds: ["required"],
      },
    }).suggestions[0];
    expect(suggestion.rank[1]).toBeGreaterThan(0);
    expect(suggestion.rank[2]).toBe(0);
    expect(suggestion.rank[3]).toBe(1);
    expect(suggestion.rank[4]).toBeLessThan(0);
    expect(suggestion.rank[5]).toBeLessThan(0);
    expect(suggestion.advanced.map((r) => r.node.id)).toContain("required");
    expect(suggestion.ectsDelta).toBe(2);
  });
});

describe("reviewable revisions", () => {
  it("applies a new revision, preserving every scenario and restores the exact prior state", () => {
    const input = setup();
    input.plan.scenarios.push({
      ...structuredClone(input.plan.scenarios[0]),
      id: "other",
      name: "Other",
    });
    const original = structuredClone(input.plan);
    const suggestion = generateSuggestions(input).suggestions[0];
    const revision = applySuggestion(input.plan, suggestion);
    expect(revision.after).not.toEqual(original);
    expect(revision.after.scenarios[1]).toEqual(original.scenarios[1]);
    expect(revision.before).toEqual(original);
    expect(undoRevision(revision.after, revision)).toEqual(original);
    expect(input.plan).toEqual(original);
  });
  it("rejects stale apply and stale undo so later edits are never overwritten", () => {
    const input = setup(),
      suggestion = generateSuggestions(input).suggestions[0];
    const revision = applySuggestion(input.plan, suggestion);
    const changed = { ...input.plan, name: "Renamed" };
    expect(() => applySuggestion(changed, suggestion)).toThrow("stale");
    expect(() =>
      undoRevision({ ...revision.after, name: "Changed" }, revision),
    ).toThrow("stale");
  });
});
