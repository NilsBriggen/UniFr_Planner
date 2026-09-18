import { expect, it } from "vitest";
import * as packs from "../src/programmes";
import { evaluateRequirements, flattenRequirements } from "../src/requirements";

it("publishes cohort-pinned CS and all five BI variants without inventing verification", () => {
  expect(packs.programmeTemplates).toHaveLength(18);
  for (const year of [2024, 2025, 2026]) {
    const templates = packs.programmeTemplates.filter(
      (t) => t.cohortFrom === year,
    );
    expect(templates.map((t) => t.totalEcts)).toEqual([
      120, 60, 30, 60, 33, 30,
    ]);
    expect(
      templates.every((t) => t.cohortTo === year && Object.isFrozen(t)),
    ).toBe(true);
    expect(
      templates.every((t) => t.reviewStatus === "needs_clarification"),
    ).toBe(true);
  }
});
it("preserves the 2026 course change and library duty difference without assumed equivalence", () => {
  const [old, current] = [2024, 2026].map(
    (year) =>
      packs.programmeTemplates.find(
        (t) => t.code === "CS-120" && t.cohortFrom === year,
      )!,
  );
  const oldNodes = flattenRequirements(old.root),
    newNodes = flattenRequirements(current.root);
  expect(
    oldNodes.some((n) => "codes" in n && n.codes.includes("SIN.06022")),
  ).toBe(true);
  expect(
    newNodes.some((n) => "codes" in n && n.codes.includes("SIN.06023")),
  ).toBe(true);
  expect(
    newNodes.some((n) => "codes" in n && n.codes.includes("SIN.06022")),
  ).toBe(false);
  expect(
    oldNodes.filter((n) => n.kind === "checklist").map((n) => n.id),
  ).not.toContain("library-1");
  expect(
    newNodes.filter((n) => n.kind === "checklist").map((n) => n.id),
  ).toContain("library-1");
});
it("shows verified course progress while blocking an unsupported degree-completion claim", () => {
  const template = packs.programmeTemplates[0];
  const result = evaluateRequirements(template.root, [
    { id: "intro", code: "SIN.01023", ects: 6, status: "completed" },
  ]);
  expect(result.earned).toBe(6);
  expect(result.status).toBe("needs_clarification");
  expect(result.children.find((n) => n.node.id === "SIN.01023")?.status).toBe(
    "complete",
  );
});
it("records each rule source and leaves unknown codes and revision dates unresolved", () => {
  for (const t of packs.programmeTemplates)
    for (const n of flattenRequirements(t.root)) {
      expect(n.citations.length).toBeGreaterThan(0);
      expect(
        n.citations.every(
          (c) =>
            c.url.startsWith("https://") &&
            c.section &&
            c.cohort &&
            c.retrievedAt === "2026-09-18",
        ),
      ).toBe(true);
      if (n.reviewStatus === "verified")
        expect(n.citations.every((c) => c.revisionDate !== null)).toBe(true);
    }
  const csMinor = packs.programmeTemplates.find((t) => t.code === "BI-CS-60")!;
  const nodes = flattenRequirements(csMinor.root);
  expect(nodes.find((n) => n.id === "bi-electives")?.minCredits).toBe(27);
  expect(
    nodes.some(
      (n) =>
        n.title.en === "Requirements Engineering for Information Systems" &&
        n.minCredits === 4.5,
    ),
  ).toBe(true);
  expect(packs.programmeInventory).toHaveLength(6);
  expect(packs.programmeInventory.every((p) => p.status === "backlog")).toBe(
    true,
  );
});
