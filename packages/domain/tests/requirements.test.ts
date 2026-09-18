import { describe, expect, it } from "vitest";
import * as engine from "../src/requirements";
import type {
  RequirementNode,
  CourseRecord,
  ProgrammeTemplate,
} from "../src/requirements";

const citation = {
  url: "https://www.unifr.ch/test",
  title: "Test-only regulation",
  revisionDate: "2026-01-01",
  section: "1",
  cohort: "2024–2026",
  retrievedAt: "2026-09-18",
};
const label = { de: "Test", fr: "Test", en: "Test" };
const base = {
  title: label,
  explanation: label,
  citations: [citation],
  reviewStatus: "verified" as const,
};
const pool = (
  id: string,
  codes = ["A", "B"],
  minCredits = 6,
): RequirementNode & { kind: "credit_pool" } => ({
  ...base,
  id,
  kind: "credit_pool",
  codes,
  minCredits,
});
const course = (
  code: string,
  ects = 6,
  status: CourseRecord["status"] = "completed",
): CourseRecord => ({ id: code, code, ects, status });
const all = (...children: RequirementNode[]): RequirementNode => ({
  ...base,
  id: "root",
  kind: "all_of",
  children,
});
const evaluate = (
  root: RequirementNode,
  courses: CourseRecord[],
  options = {},
) => engine.evaluateRequirements(root, courses, options);

it("exports a pure requirements evaluator", () =>
  expect(typeof engine.evaluateRequirements).toBe("function"));
describe("allocation and progress", () => {
  it("keeps reuse status and deficits independent of sibling presentation order", () => {
    const result = evaluate(
      all({ ...pool("reuse", ["A"]), allowReuse: true }, pool("first", ["A"])),
      [course("A", 6, "planned")],
    );
    expect(result).toMatchObject({
      status: "covered",
      planned: 6,
      remaining: 0,
      remainingToEarn: 6,
    });
    expect(result.children.map((c) => c.node.id)).toEqual(["reuse", "first"]);
  });
  it.each([
    ["A", "Z", false],
    ["A", "Z", true],
    ["Z", "A", false],
    ["Z", "A", true],
  ] as const)(
    "prioritises substitution %s to %s independent of input reversal %s",
    (original, replacement, reverse) => {
      const root: RequirementNode = {
        ...base,
        id: "required",
        kind: "course",
        codes: [original],
        minCredits: 6,
      };
      const records = [course(original), course(replacement)];
      const result = evaluate(root, reverse ? records.reverse() : records, {
        overrides: [
          {
            kind: "substitution",
            courseId: replacement,
            nodeId: "required",
            reason: "Approval",
          },
        ],
      });
      expect(result).toMatchObject({
        earned: 6,
        remaining: 0,
        status: "complete",
      });
      expect(result.allocations.map((a) => a.courseId)).toEqual([replacement]);
    },
  );
  it("uses only explicit combined substitution evidence for a course", () => {
    const root: RequirementNode = {
      ...base,
      id: "required",
      kind: "course",
      codes: ["A"],
      minCredits: 6,
    };
    const overrides = ["X", "Y"].map((courseId) => ({
      kind: "substitution",
      courseId,
      nodeId: "required",
      reason: "Two explicitly approved components",
    }));
    const result = evaluate(
      root,
      [course("A"), course("X", 3), course("Y", 3)],
      { overrides },
    );
    expect(result.earned).toBe(6);
    expect(result.allocations.map((a) => a.courseId)).toEqual(["X", "Y"]);
  });
  it.each([false, true])(
    "selects a sufficient equivalent without accumulating attempts, reverse=%s",
    (reverse) => {
      const root: RequirementNode = {
        ...base,
        id: "required",
        kind: "course",
        codes: ["A", "Z"],
        minCredits: 6,
      };
      const records = [course("A", 3), course("Z", 6)];
      const result = evaluate(root, reverse ? records.reverse() : records);
      expect(result).toMatchObject({ earned: 6, status: "complete" });
      expect(result.allocations.map((a) => a.courseId)).toEqual(["Z"]);
    },
  );
  it("reserves the sufficient equivalent before an earlier elective pool", () => {
    const root = all(pool("electives", ["A", "Z"], 3), {
      ...base,
      id: "required",
      kind: "course",
      codes: ["A", "Z"],
      minCredits: 6,
    });
    expect(evaluate(root, [course("A", 3), course("Z", 6)])).toMatchObject({
      earned: 9,
      status: "complete",
    });
  });
  it.each(["planned", "current", "completed"] as const)(
    "counts reused %s credit only once in both remaining views",
    (status) => {
      const result = evaluate(
        all(pool("first", ["A"]), {
          ...pool("reuse", ["A"]),
          allowReuse: true,
        }),
        [course("A", 6, status)],
      );
      expect(result.remaining).toBe(0);
      expect(result.remainingToEarn).toBe(status === "completed" ? 0 : 6);
      expect(result.status).toBe(
        status === "planned"
          ? "covered"
          : status === "current"
            ? "in_progress"
            : "complete",
      );
    },
  );
  it("shares an outstanding credit demand only when reuse and eligible codes overlap", () => {
    const reused = all(pool("first", ["A"]), {
      ...pool("reuse", ["A"]),
      allowReuse: true,
    });
    expect(evaluate(reused, []).remaining).toBe(6);
    expect(
      evaluate(
        all(pool("first", ["A"]), {
          ...pool("reuse", ["B"]),
          allowReuse: true,
        }),
        [],
      ).remaining,
    ).toBe(12);
    expect(
      evaluate({ ...reused, minCredits: 12 }, [course("A", 6, "planned")])
        .remainingToEarn,
    ).toBe(12);
  });
  it("never combines two under-credit equivalent attempts into one required course", () => {
    const root: RequirementNode = {
      ...base,
      id: "r",
      kind: "course",
      codes: ["A", "OLD-A"],
      minCredits: 6,
    };
    expect(evaluate(root, [course("A", 3), course("OLD-A", 3)])).toMatchObject({
      earned: 3,
      remaining: 3,
      status: "missing",
    });
  });
  it("separates earned, current, planned, and remaining with fractional ECTS", () => {
    const result = evaluate(pool("p", ["A", "B", "C", "D"], 18), [
      course("A", 4.5),
      course("B", 4.5, "current"),
      course("C", 4.5, "planned"),
      course("D", 6, "unscheduled"),
    ]);
    expect(result).toMatchObject({
      earned: 4.5,
      inProgress: 4.5,
      planned: 4.5,
      remaining: 4.5,
      remainingToEarn: 13.5,
      status: "missing",
    });
  });
  it("reserves compulsory courses before elective pools independent of sibling order", () => {
    const required: RequirementNode = {
      ...base,
      id: "required",
      kind: "course",
      codes: ["A"],
      minCredits: 6,
    };
    const result = evaluate(all(pool("elective"), required), [
      course("A"),
      course("B"),
    ]);
    expect(result.status).toBe("complete");
    expect(result.children[0].allocations.map((x) => x.courseId)).toEqual([
      "B",
    ]);
    expect(result.earned).toBe(12);
  });
  it("does not allocate a course twice across nested siblings", () => {
    const result = evaluate(
      all(pool("p"), { ...all(pool("q")), id: "nested" }),
      [course("A")],
    );
    expect(result.earned).toBe(6);
    expect(result.status).toBe("missing");
  });
  it("supports explicitly allowed reuse without inflating root earned credits", () => {
    const result = evaluate(
      all(pool("p"), { ...pool("q"), allowReuse: true }),
      [course("A")],
    );
    expect(result.status).toBe("complete");
    expect(result.earned).toBe(6);
  });
  it("chooses one alternative without consuming the other branch", () => {
    const root: RequirementNode = {
      ...base,
      id: "choice",
      kind: "one_of",
      children: [
        pool("sixty", ["X"], 60),
        all(pool("thirty-a", ["A"], 30), pool("thirty-b", ["B"], 30)),
      ],
    };
    expect(evaluate(root, [course("A", 30), course("B", 30)])).toMatchObject({
      earned: 60,
      status: "complete",
      selectedChildId: "root",
    });
    expect(evaluate(root, [course("X", 60)]).selectedChildId).toBe("sixty");
  });
  it("retains labelled manual allocations and substitutions with reasons", () => {
    const result = evaluate(
      all(pool("p"), pool("q")),
      [course("A"), course("EXTERNAL")],
      {
        overrides: [
          {
            kind: "allocation",
            courseId: "A",
            nodeId: "q",
            reason: "Personal allocation",
          },
          {
            kind: "substitution",
            courseId: "EXTERNAL",
            nodeId: "p",
            reason: "Advisor letter 2026-09-01",
          },
        ],
      },
    );
    expect(result.status).toBe("complete");
    expect(result.children[0].allocations[0]).toMatchObject({
      courseId: "EXTERNAL",
      override: { kind: "substitution", reason: "Advisor letter 2026-09-01" },
    });
    expect(result.children[1].allocations[0].courseId).toBe("A");
  });
  it("rejects stale, conflicting and ineligible manual allocations", () => {
    const root = all(pool("p"), pool("q"));
    expect(() =>
      evaluate(root, [course("X")], {
        overrides: [
          { kind: "allocation", courseId: "X", nodeId: "p", reason: "No" },
        ],
      }),
    ).toThrow();
    expect(() =>
      evaluate(root, [course("A")], {
        overrides: [
          {
            kind: "allocation",
            courseId: "A",
            nodeId: "missing",
            reason: "No",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      evaluate(root, [course("A")], {
        overrides: [
          { kind: "allocation", courseId: "A", nodeId: "p", reason: "One" },
          { kind: "allocation", courseId: "A", nodeId: "q", reason: "Two" },
        ],
      }),
    ).toThrow();
  });
  it("accepts rule-declared equivalents but counts repeated equivalents only once", () => {
    const root: RequirementNode = {
      ...base,
      id: "r",
      kind: "course",
      codes: ["A", "OLD-A"],
      minCredits: 6,
    };
    expect(evaluate(root, [course("OLD-A")]).status).toBe("complete");
    expect(evaluate(root, [course("OLD-A"), course("A")]).earned).toBe(6);
  });
  it("counts courses and non-credit duties independently from ECTS", () => {
    const root = all(
      { ...pool("count"), kind: "course_count", minCourses: 2, minCredits: 0 },
      { ...base, id: "duty", kind: "checklist" },
    );
    expect(
      evaluate(root, [course("A", 0), course("B", 0)], {
        completedChecklist: ["duty"],
      }).status,
    ).toBe("complete");
    expect(evaluate(root, [course("A", 0), course("B", 0)]).status).toBe(
      "missing",
    );
  });
  it("distinguishes planned coverage from completed work and project completion", () => {
    const root: RequirementNode = {
      ...base,
      id: "thesis",
      kind: "project",
      codes: ["P"],
      minCredits: 15,
    };
    expect(evaluate(root, [course("P", 15, "planned")]).status).toBe("covered");
    expect(evaluate(root, [course("P", 15, "current")]).status).toBe(
      "in_progress",
    );
    expect(evaluate(root, [course("P", 15)]).status).toBe("complete");
  });
  it("propagates unknown credits and source ambiguity instead of claiming completion", () => {
    expect(evaluate(pool("p"), [{ ...course("A"), ects: null }]).status).toBe(
      "needs_clarification",
    );
    expect(
      evaluate({ ...pool("p"), reviewStatus: "needs_clarification" }, [
        course("A"),
      ]).status,
    ).toBe("needs_clarification");
    expect(
      evaluate({ ...pool("p"), maxCredits: 6 }, [course("A", 9)]).status,
    ).toBe("needs_clarification");
  });
  it("rejects duplicate records and invalid credit values", () => {
    expect(() => evaluate(pool("p"), [course("A"), course("A")])).toThrow();
    expect(() => evaluate(pool("p"), [course("A", NaN)])).toThrow();
    expect(() => evaluate(pool("p"), [course("A", -1)])).toThrow();
  });
  it("does not reserve a course for an unselected alternative", () => {
    const required = (id: string): RequirementNode => ({
      ...base,
      id,
      kind: "course",
      codes: ["A"],
      minCredits: 6,
    });
    const root: RequirementNode = {
      ...base,
      id: "choice",
      kind: "one_of",
      children: [required("first"), required("second")],
    };
    expect(
      evaluate(root, [course("A")], { choices: { choice: "second" } }),
    ).toMatchObject({
      status: "complete",
      earned: 6,
      selectedChildId: "second",
    });
  });
  it("rejects unrecognised completed duties instead of silently discarding evidence", () => {
    expect(() =>
      evaluate(pool("p"), [], { completedChecklist: ["not-a-duty"] }),
    ).toThrow("invalid completed duty");
  });
  it("identifies malformed numeric and override inputs with domain errors", () => {
    expect(() => evaluate(pool("p"), [course("A", NaN)])).toThrow(
      "invalid credits",
    );
    expect(() => evaluate(pool("p"), [course("A"), course("A")])).toThrow(
      "duplicate course record",
    );
    expect(() =>
      evaluate(pool("p"), [course("X")], {
        overrides: [
          { kind: "allocation", courseId: "X", nodeId: "p", reason: "No" },
        ],
      }),
    ).toThrow("invalid personal allocation");
  });
});

it("publishes immutable revisions and enforces cohort and exact revision lookup", () => {
  const input: ProgrammeTemplate = {
    code: "TEST",
    version: "1",
    degree: "bachelor",
    faculty: "test",
    totalEcts: 120,
    cohortFrom: 2024,
    cohortTo: 2026,
    title: label,
    sources: [citation],
    reviewStatus: "verified",
    root: pool("r", ["A"], 120),
  };
  const original = engine.publishTemplate(input);
  input.root.title.en = "Changed";
  expect(original.root.title.en).toBe("Test");
  expect(Object.isFrozen(original.root)).toBe(true);
  const revision = engine.publishTemplate({
    ...input,
    version: "2",
    totalEcts: 123,
  });
  expect(
    engine.resolveTemplate([original, revision], {
      code: "TEST",
      version: "1",
      cohort: 2024,
    }),
  ).toBe(original);
  expect(() =>
    engine.resolveTemplate([original], {
      code: "TEST",
      version: "2",
      cohort: 2024,
    }),
  ).toThrow();
  expect(() =>
    engine.resolveTemplate([original], {
      code: "TEST",
      version: "1",
      cohort: 2023,
    }),
  ).toThrow();
  expect(() =>
    engine.publishTemplate({
      ...input,
      root: { ...input.root, citations: [] },
    }),
  ).toThrow();
});
