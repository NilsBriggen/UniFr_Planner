import { describe, expect, it } from "vitest";
import { recipeRegistry } from "../../../../packages/domain/src/registry";
import type { ProgrammeRecipe } from "../../../../packages/domain/src/recipes";
import {
  majorProgrammes,
  searchProgrammes,
  slotOptions,
} from "./recipeOptions";
import { recipeMessages } from "./recipeMessages";

const bachelors = majorProgrammes("bachelor", "");
const ids = (programmes: ProgrammeRecipe[]) => programmes.map((p) => p.id);
const facultyNames = (programme: ProgrammeRecipe) =>
  (["de", "fr", "en"] as const).map(
    (language) =>
      recipeMessages[language].faculties[
        programme.faculty as keyof typeof recipeMessages.en.faculties
      ],
  );

describe("programme search", () => {
  it("keeps the list and its order for an empty query", () => {
    expect(searchProgrammes(bachelors, "")).toBe(bachelors);
    expect(searchProgrammes(bachelors, "   ")).toBe(bachelors);
  });

  it.each([
    ["math", ["bachelor-sci-mathematics"]],
    ["Mathematik", ["bachelor-sci-mathematics"]],
    ["MATHÉMATIQUES", ["bachelor-sci-mathematics"]],
    ["mathematiques", ["bachelor-sci-mathematics"]],
    ["Géographie", ["bachelor-sci-geography"]],
    ["computer science", ["bachelor-digitinf-informatics"]],
    ["science  computer", ["bachelor-digitinf-informatics"]],
    ["Pedagogy/Psychology", ["bachelor-pedpsy-educationpsychology"]],
    ["BWL", ["bachelor-eco-management"]],
    ["vwl", ["bachelor-eco-economics"]],
    ["zzzz", []],
  ])("finds %j by any official name, alias or subject", (query, expected) => {
    expect(ids(searchProgrammes(bachelors, query))).toEqual(expected);
  });

  it("needs every word of the query", () => {
    expect(ids(searchProgrammes(bachelors, "law part"))).toEqual([
      "bachelor-ius-lawparttime",
    ]);
  });

  it("ranks an exact title, then titles starting with the query", () => {
    expect(ids(searchProgrammes(bachelors, "psycho"))).toEqual([
      "bachelor-pedpsy-psychology",
      "bachelor-pedpsy-educationpsychology",
    ]);
    expect(ids(searchProgrammes(bachelors, "Informatik"))).toEqual([
      "bachelor-digitinf-informatics",
      "bachelor-digitinf-businessinformatics",
    ]);
    expect(ids(searchProgrammes(bachelors, "informatique"))).toEqual([
      "bachelor-digitinf-informatics",
      "bachelor-digitinf-businessinformatics",
    ]);
    for (const query of ["histoire de l’art", "Histoire de l'art"])
      expect(searchProgrammes(bachelors, query)[0].id).toBe(
        "bachelor-artmus-arthistory",
      );
  });

  it("uses faculty names only when no programme name matches", () => {
    const science = searchProgrammes(
      bachelors,
      "Naturwissenschaft",
      facultyNames,
    );
    expect(science.length).toBeGreaterThan(1);
    expect(science.every((p) => p.faculty === "science-medicine")).toBe(true);
    expect(searchProgrammes(bachelors, "Naturwissenschaft")).toEqual([]);
    // "Theologie" names one programme, so the Theology faculty does not add the others.
    expect(ids(searchProgrammes(bachelors, "Theologie", facultyNames))).toEqual(
      ["bachelor-theo-theology"],
    );
    const history = searchProgrammes(
      bachelors,
      "Lettres histoire",
      facultyNames,
    );
    expect(ids(history)).toContain("bachelor-hist-history");
    expect(history.every((p) => p.faculty === "humanities")).toBe(true);
  });
});
it("excludes minor-only programmes and offers each faculty group", () => {
  for (const faculty of [
    "theology",
    "law",
    "ses",
    "humanities",
    "education",
    "science-medicine",
    "interfaculty",
  ]) {
    const available = [
      ...majorProgrammes("bachelor", faculty),
      ...majorProgrammes("master", faculty),
    ];
    expect(available.length).toBeGreaterThan(0);
    expect(
      available.every((p) => p.variants.some((v) => v.role === "major")),
    ).toBe(true);
  }
  const minorOnly = recipeRegistry.programmes.filter(
    (p) => !p.variants.some((v) => v.role === "major"),
  );
  expect(minorOnly.length).toBeGreaterThan(0);
  expect(
    majorProgrammes("bachelor", "").some((p) => minorOnly.includes(p)),
  ).toBe(false);
});
it("limits fixed Law minor to the correct role, credit size and degree", () => {
  const major = recipeRegistry.programmes.find((p) =>
    p.variants.some((v) => v.structureIds?.includes("ba-120-law-60")),
  )!;
  const slot = recipeRegistry.structures
    .find((s) => s.id === "ba-120-law-60")!
    .slots.find((s) => s.role === "minor")!;
  const options = slotOptions(slot, major);
  expect(options.length).toBeGreaterThan(0);
  expect(
    options.every(
      (o) =>
        o.programme.subject === "law" &&
        o.programme.degree === "bachelor" &&
        o.variant.ects === 60 &&
        o.variant.role === "minor",
    ),
  ).toBe(true);
});
