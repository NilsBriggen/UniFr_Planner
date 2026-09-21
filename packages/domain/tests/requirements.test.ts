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
  it.each([
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ])(
    "leaves surplus evidence unused for record permutation %s,%s,%s",
    (...order) => {
      const records = [course("A", 3), course("B", 6), course("C", 3)];
      const children = [
        { ...pool("first", ["A", "B"], 6), maxCredits: 6 },
        { ...pool("second", ["B", "C"], 3), maxCredits: 3 },
      ];
      for (const siblings of [children, [...children].reverse()]) {
        const result = evaluate(
          all(...siblings),
          order.map((i) => records[i]),
        );
        expect(result).toMatchObject({
          status: "complete",
          earned: 9,
          remaining: 0,
        });
        expect(
          Object.fromEntries(
            result.children.map((c) => [
              c.node.id,
              c.allocations.map((a) => a.code),
            ]),
          ),
        ).toEqual({ first: ["B"], second: ["C"] });
        expect(evaluate(all(...siblings), records.slice(1)).status).toBe(
          "complete",
        );
      }
    },
  );
  it("can omit competing surplus evidence instead of forcing it into either pool", () => {
    const result = evaluate(
      all(
        { ...pool("first", ["A", "B"], 6), maxCredits: 6 },
        { ...pool("second", ["A", "C"], 3), maxCredits: 3 },
      ),
      [course("A", 9), course("B", 6), course("C", 3)],
    );
    expect(result).toMatchObject({ status: "complete", earned: 9 });
    expect(result.allocations.map((a) => a.code)).toEqual(["B", "C"]);
  });
  it("can omit evidence from a reusable pool while another requirement still needs it", () => {
    const result = evaluate(
      all(
        { ...pool("reusable", ["A", "B"], 6), maxCredits: 6, allowReuse: true },
        pool("required", ["A"], 3),
      ),
      [course("A", 3), course("B", 6)],
    );
    expect(result).toMatchObject({ status: "complete", earned: 9 });
    expect(result.children[0].allocations.map((a) => a.code)).toEqual(["B"]);
    expect(result.children[1].allocations.map((a) => a.code)).toEqual(["A"]);
  });
  it("can select a smaller automatic alternative to respect its ancestor maximum", () => {
    const root = {
      ...all({
        ...base,
        id: "choice",
        kind: "one_of" as const,
        children: [
          { ...pool("larger", ["A"], 9), kind: "course" as const },
          { ...pool("smaller", ["B"], 6), kind: "course" as const },
        ],
      }),
      minCredits: 6,
      maxCredits: 6,
    };
    expect(evaluate(root, [course("A", 9), course("B", 6)])).toMatchObject({
      status: "complete",
      earned: 6,
    });
  });
  it.each(["allocation", "substitution"] as const)(
    "keeps explicit %s evidence binding when it prevents an exact fit",
    (kind) => {
      const result = evaluate(
        all(
          { ...pool("first", ["A", "B"], 6), maxCredits: 6 },
          { ...pool("second", ["B", "C"], 3), maxCredits: 3 },
        ),
        [course("A", 3), course("B", 6), course("C", 3)],
        {
          overrides: [
            {
              kind,
              courseId: "A",
              nodeId: "first",
              reason: "Binding approved evidence",
            },
          ],
        },
      );
      expect(result.status).toBe("needs_clarification");
      expect(result.children[0]).toMatchObject({
        status: "needs_clarification",
        earned: 9,
      });
      expect(result.children[0].allocations[0]).toMatchObject({
        courseId: "A",
        override: { kind, reason: "Binding approved evidence" },
      });
    },
  );
  it("keeps true maximum and unknown-credit ambiguity instead of hiding all automatic evidence", () => {
    expect(
      evaluate({ ...pool("max", ["A", "B"], 6), maxCredits: 6 }, [
        course("A", 9),
        course("B", 12),
      ]),
    ).toMatchObject({ status: "needs_clarification" });
    expect(
      evaluate(pool("unknown", ["A", "B"]), [
        { ...course("A"), ects: null },
        { ...course("B"), ects: null },
      ]),
    ).toMatchObject({ status: "needs_clarification" });
  });
  it("selects a sufficient equivalent while leaving surplus attempts unused", () => {
    const result = evaluate(
      all(
        { ...pool("required", ["A", "B"], 6), kind: "course", maxCredits: 6 },
        { ...pool("other", ["A", "C"], 3), maxCredits: 3 },
      ),
      [course("A", 9), course("B", 6), course("C", 3)],
    );
    expect(result).toMatchObject({ status: "complete", earned: 9 });
    expect(result.children[0].allocations.map((a) => a.code)).toEqual(["B"]);
  });
  it("finds an exact fractional subset without splitting a record", () => {
    const result = evaluate(
      all(
        { ...pool("first", ["A", "B"], 4.5), maxCredits: 4.5 },
        { ...pool("second", ["B", "C"], 1.5), maxCredits: 1.5 },
      ),
      [course("A", 1.5), course("B", 4.5), course("C", 1.5)],
    );
    expect(result).toMatchObject({ status: "complete", earned: 6 });
    expect(result.allocations.map((a) => [a.code, a.credits])).toEqual([
      ["B", 4.5],
      ["C", 1.5],
    ]);
  });
  it("accounts for the unused option in the competing-signature preflight", () => {
    const records = Array.from({ length: 8 }, (_, i) => course(`C${i}`, i + 1));
    const codes = records.map((record) => record.code);
    expect(() =>
      evaluate(
        all(pool("first", codes, 18), pool("second", codes, 18)),
        records,
      ),
    ).toThrow("requirement allocation search limit exceeded");
  });
  it("bounds subset searches for single-eligible records and for reusable leaves", () => {
    const records = Array.from({ length: 13 }, (_, i) =>
      course(`C${i}`, i + 1),
    );
    expect(() =>
      evaluate(
        pool(
          "single",
          records.map((record) => record.code),
        ),
        records,
      ),
    ).toThrow("requirement allocation search limit exceeded");
    const repeated = Array.from({ length: 13 }, (_, i) => ({
      ...pool(`reuse-${i}`),
      allowReuse: true,
    }));
    expect(() =>
      evaluate(all(...repeated), [course("A"), course("B")]),
    ).toThrow("requirement allocation search limit exceeded");
  });
  it("prunes only dominated omissions for a large disjoint compulsory programme", () => {
    const records = Array.from({ length: 100 }, (_, i) => course(`C${i}`));
    const result = evaluate(
      all(
        ...records.map((record) => ({
          ...pool(record.code, [record.code]),
          kind: "course" as const,
        })),
      ),
      records,
    );
    expect(result).toMatchObject({
      status: "complete",
      earned: 600,
      remaining: 0,
    });
  });
  it.each([false, true])(
    "resolves competing credit pools independently of sibling order, reverse=%s",
    (reverse) => {
      const children = [pool("broad", ["A", "B"]), pool("narrow", ["A"])];
      const result = evaluate(
        all(...(reverse ? children.reverse() : children)),
        [course("A"), course("B")],
      );
      expect(result).toMatchObject({
        status: "complete",
        earned: 12,
        remaining: 0,
      });
      expect(
        Object.fromEntries(
          result.children.map((child) => [
            child.node.id,
            child.allocations.map((a) => a.code),
          ]),
        ),
      ).toEqual({ broad: ["B"], narrow: ["A"] });
    },
  );
  it.each([false, true])(
    "finds a global assignment for overlapping equivalent-course leaves, reverse=%s",
    (reverse) => {
      const children: RequirementNode[] = [
        { ...pool("flexible", ["A", "B"]), kind: "course" },
        { ...pool("required", ["A"]), kind: "course" },
      ];
      const result = evaluate(
        all(...(reverse ? children.reverse() : children)),
        [course("A"), course("B")],
      );
      expect(result).toMatchObject({ status: "complete", earned: 12 });
      expect(
        result.children
          .find((c) => c.node.id === "flexible")
          ?.allocations.map((a) => a.code),
      ).toEqual(["B"]);
    },
  );
  it("backtracks across fractional pools with equally broad eligibility", () => {
    const result = evaluate(
      all(
        pool("first", ["A", "B", "C"], 6),
        pool("second", ["A", "B", "C"], 4.5),
      ),
      [course("A", 4.5), course("B", 3), course("C", 3)],
    );
    expect(result).toMatchObject({
      status: "complete",
      earned: 10.5,
      remaining: 0,
    });
    expect(result.children[0].allocations.map((a) => a.code)).toEqual([
      "B",
      "C",
    ]);
  });
  it("does not collapse equal-credit records across a differently weighted candidate", () => {
    const result = evaluate(
      all(
        { ...pool("first", ["A", "B", "C"], 6), maxCredits: 6 },
        { ...pool("second", ["A", "B", "C"], 3), maxCredits: 3 },
      ),
      [course("A", 3), course("B", 6), course("C", 3)],
    );
    expect(result.status).toBe("complete");
    expect(result.children[0].allocations.map((a) => a.code)).toEqual(["B"]);
    expect(result.children[1].allocations.map((a) => a.code)).toEqual(["A"]);
  });
  it.each([
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ])(
    "resolves three-way competition for sibling permutation %s,%s,%s",
    (...order) => {
      const children = [
        pool("first", ["A", "B"]),
        pool("second", ["A", "C"]),
        pool("third", ["A", "C"]),
      ];
      const root = all(...order.map((index) => children[index]));
      const records = [course("A"), course("B"), course("C")];
      const result = evaluate(root, records);
      expect(result).toMatchObject({
        status: "complete",
        earned: 18,
        remaining: 0,
      });
      expect(
        Object.fromEntries(
          result.children.map((c) => [
            c.node.id,
            c.allocations.map((a) => a.code),
          ]),
        ),
      ).toEqual({ first: ["B"], second: ["A"], third: ["C"] });
      expect(evaluate(root, records.reverse())).toEqual(result);
    },
  );
  it.each(["current", "planned"] as const)(
    "keeps %s progress distinct while resolving competing pools",
    (status) => {
      const result = evaluate(
        all(pool("broad", ["A", "B"]), pool("narrow", ["A"])),
        [course("A"), course("B", 6, status)],
      );
      expect(result).toMatchObject({
        status: status === "current" ? "in_progress" : "covered",
        earned: 6,
        remaining: 0,
        remainingToEarn: 6,
      });
    },
  );
  it("keeps an explicit personal allocation even when another assignment could complete the tree", () => {
    const result = evaluate(
      all(pool("broad", ["A", "B"]), pool("narrow", ["A"])),
      [course("A"), course("B")],
      {
        overrides: [
          {
            kind: "allocation",
            courseId: "A",
            nodeId: "broad",
            reason: "Personal choice",
          },
        ],
      },
    );
    expect(result.status).toBe("missing");
    expect(result.children[0].allocations[0]).toMatchObject({
      courseId: "A",
      override: { reason: "Personal choice" },
    });
    expect(result.children[1].allocations).toEqual([]);
  });
  it("resolves a course-count requirement competing with a credit pool", () => {
    const result = evaluate(
      all(pool("broad", ["A", "B", "C"]), {
        ...pool("count", ["A", "B"], 0),
        kind: "course_count",
        minCourses: 2,
      }),
      [course("A", 3), course("B", 3), course("C")],
    );
    expect(result).toMatchObject({ status: "complete", earned: 12 });
    expect(result.children[1].allocations.map((a) => a.code)).toEqual([
      "A",
      "B",
    ]);
  });
  it.each([false, true])(
    "does not double-count scarce evidence unless reuse=%s",
    (allowReuse) => {
      const result = evaluate(
        all(pool("first", ["A"]), { ...pool("second", ["A"]), allowReuse }),
        [course("A")],
      );
      expect(result).toMatchObject({
        status: allowReuse ? "complete" : "missing",
        earned: 6,
        remaining: allowReuse ? 0 : 6,
      });
    },
  );
  it("groups many interchangeable competing records without enumerating their permutations", () => {
    const codes = Array.from(
      { length: 40 },
      (_, index) => `C${String(index).padStart(2, "0")}`,
    );
    const result = evaluate(
      all(pool("first", codes, 120), pool("second", codes, 120)),
      codes.map((code) => course(code)),
    );
    expect(result).toMatchObject({
      status: "complete",
      earned: 240,
      remaining: 0,
    });
    expect(result.children.map((child) => child.allocations.length)).toEqual([
      20, 20,
    ]);
  }, 1000);
  it.each([16, 40, 100])(
    "rejects an excessive exact search with %s distinct signatures instead of returning partial progress",
    (count) => {
      const records = Array.from({ length: count }, (_, index) =>
        course(`C${index}`, index + 1),
      );
      const codes = records.map((record) => record.code);
      expect(() =>
        evaluate(
          all(pool("first", codes, 68), pool("second", codes, 68)),
          records,
        ),
      ).toThrow("requirement allocation search limit exceeded");
    },
  );
  it.each([false, true])(
    "resolves a nested competing pool with reuse=%s",
    (allowReuse) => {
      const result = evaluate(
        all(pool("broad", ["A", "B"]), {
          ...all({ ...pool("narrow", ["A"]), allowReuse }),
          id: "nested",
        }),
        [course("A"), course("B")],
      );
      expect(result.status).toBe("complete");
      expect(
        result.children[1].children[0].allocations.map((a) => a.code),
      ).toEqual(["A"]);
      expect(result.earned).toBe(allowReuse ? 6 : 12);
    },
  );
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
