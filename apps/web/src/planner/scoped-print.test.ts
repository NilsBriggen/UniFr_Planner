import { expect, it } from "vitest";
import { scopedPrintHtml } from "./scoped-print";
import type { WeeklyExport } from "./weekly-export";
const input: WeeklyExport = {
  name: "My plan",
  term: "AS-2026",
  monday: "2026-09-21",
  language: "en",
  unresolved: false,
  courses: [],
  events: [
    {
      id: "first",
      owner: "a",
      title: "First lesson",
      start: "2026-09-21T08:00:00Z",
      end: "2026-09-21T09:00:00Z",
      location: "A",
    },
    {
      id: "last",
      owner: "a",
      title: "Final lesson",
      start: "2026-12-21T08:00:00Z",
      end: "2026-12-21T09:00:00Z",
      location: "B",
    },
  ],
};
it("full semester agenda leads with a compact summary and preserves dated evidence after all events", () => {
  const html = scopedPrintHtml(
    {
      ...input,
      conflicts: Array.from({ length: 96 }, () => ({
        kind: "hard",
        first: "a",
        second: "b",
        start: "2026-09-21T08:00:00Z",
      })),
    },
    "agenda",
  );
  expect(html).toContain("96 dated collisions");
  expect(html.indexOf("First lesson")).toBeLessThan(
    html.indexOf("Dated conflict evidence"),
  );
  expect(html.indexOf("Final lesson")).toBeLessThan(
    html.indexOf("Dated conflict evidence"),
  );
  expect(html.match(/data-conflict/g)).toHaveLength(96);
  expect(html).not.toContain("Check catalogue");
});
it("selected-term roster excludes courses from other terms and lists full titles and credits", () => {
  const course = (id: string, term: string) => ({
    id,
    code: id,
    titles: { en: id + " full title" },
    ects: 6,
    status: "planned" as const,
    semester: term,
    pinned: false,
    offering: null,
  });
  const html = scopedPrintHtml(
    {
      ...input,
      courses: [course("Current", "AS-2026"), course("Other", "SS-2027")],
    },
    "roster",
  );
  expect(html).toContain("Current full title");
  expect(html).toContain("6");
  expect(html).not.toContain("Other full title");
});
