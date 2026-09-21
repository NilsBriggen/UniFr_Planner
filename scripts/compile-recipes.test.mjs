import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileRecipes } from "./compile-recipes.mjs";

const source = {
  id: "official",
  url: "https://www.unifr.ch/example",
  title: "Example",
  retrievedAt: "2026-09-21",
  revisionDate: null,
  reviewStatus: "draft",
};
const base = {
  schemaVersion: 1,
  edition: "test.1",
  sources: [source],
  structures: [
    {
      id: "ba",
      degree: "bachelor",
      slots: [{ id: "major", role: "major", ects: 180 }],
    },
  ],
  programmes: [
    {
      id: "example",
      subject: "example",
      faculty: "law",
      degree: "bachelor",
      title: "Example",
      sourceIds: ["official"],
      reviewStatus: "needs_clarification",
      gaps: ["Curriculum not reviewed"],
      variants: [
        {
          id: "major-180",
          role: "major",
          ects: 180,
          structureIds: ["ba"],
          reviewStatus: "needs_clarification",
          gaps: ["Curriculum not reviewed"],
        },
      ],
    },
  ],
  combinationRules: [],
  coverage: [
    {
      sourceUrl: source.url,
      title: "Example",
      degree: "bachelor",
      programmeId: "example",
      disposition: "recipe",
    },
  ],
};

test("compiles YAML deterministically and distinguishes source gaps from malformed data", async () => {
  const compiled = await compileRecipes(JSON.stringify(base));
  assert.equal(compiled.registry.programmes.length, 1);
  assert.equal(compiled.report.fullyReviewed, 0);
  assert.equal(compiled.report.programmesWithGaps, 1);
  assert.deepEqual(await compileRecipes(JSON.stringify(base)), compiled);
});
test("rejects duplicate YAML keys and unknown fields instead of silently ignoring authoring mistakes", async () => {
  await assert.rejects(
    compileRecipes("schemaVersion: 1\nschemaVersion: 2\n"),
    /duplicate|unique/i,
  );
  await assert.rejects(
    compileRecipes(JSON.stringify({ ...base, programes: [] })),
    /additional|programes/i,
  );
});
test("rejects missing source references and fake reviewed empty requirements", async () => {
  const invalid = structuredClone(base);
  invalid.programmes[0].sourceIds = ["missing"];
  await assert.rejects(compileRecipes(JSON.stringify(invalid)), /source/i);
  const empty = structuredClone(base);
  empty.programmes[0].reviewStatus = "verified";
  empty.programmes[0].gaps = [];
  empty.programmes[0].variants[0].reviewStatus = "verified";
  empty.programmes[0].variants[0].gaps = [];
  await assert.rejects(
    compileRecipes(JSON.stringify(empty)),
    /requirement|verified/i,
  );
});
test("the shipped registry accounts for every captured catalogue entry", async () => {
  const yaml = await readFile(
    new URL("../data/programmes/recipes.yaml", import.meta.url),
    "utf8",
  );
  const { registry, report } = await compileRecipes(yaml);
  const inventory = JSON.parse(
    await readFile(
      new URL("../data/programmes/catalogue-inventory.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    new Set(registry.coverage.map((c) => c.sourceUrl)),
    new Set(inventory.entries.map((c) => c.url)),
  );
  const faculties = new Set(registry.programmes.map((p) => p.faculty));
  for (const faculty of [
    "theology",
    "law",
    "ses",
    "humanities",
    "education",
    "science-medicine",
  ])
    assert.ok(faculties.has(faculty));
  assert.ok(registry.programmes.some((p) => p.degree === "master"));
  assert.ok(report.programmesWithGaps > 0);
});
test("coverage follows resolved evidence, applicability and inherited uncertainty", async () => {
  const input = structuredClone(base),
    programme = input.programmes[0],
    variant = programme.variants[0];
  input.sources[0].reviewStatus = "verified";
  programme.reviewStatus = variant.reviewStatus = "verified";
  programme.gaps = variant.gaps = [];
  const words = { de: "Course", fr: "Course", en: "Course" };
  variant.requirements = {
    id: "course",
    title: words,
    explanation: words,
    kind: "credit_pool",
    minCredits: 180,
    codes: ["A"],
    reviewStatus: "needs_clarification",
    citations: [],
  };
  let result = await compileRecipes(JSON.stringify(input));
  assert.equal(result.report.fullyReviewed, 0);
  assert.equal(result.report.programmesWithGaps, 1);
  assert.equal(result.report.gaps.length, 1);
  variant.requirements.reviewStatus = "verified";
  variant.requirements.citations = [
    {
      url: source.url,
      title: "Plan",
      section: "1",
      cohort: "2026",
      retrievedAt: "2026-09-21",
      revisionDate: "2026-01-01",
    },
  ];
  assert.equal(
    (await compileRecipes(JSON.stringify(input))).report.fullyReviewed,
    0,
  );
  variant.applicableFrom = "AS-2026";
  assert.equal(
    (await compileRecipes(JSON.stringify(input))).report.fullyReviewed,
    1,
  );
  programme.variants.push({
    id: "minor-180",
    role: "minor",
    ects: 180,
    reviewStatus: "verified",
    gaps: [],
    extends: "example/major-180",
  });
  assert.equal(
    (await compileRecipes(JSON.stringify(input))).report.fullyReviewed,
    1,
  );
  variant.requirements.reviewStatus = "needs_clarification";
  assert.equal(
    (await compileRecipes(JSON.stringify(input))).report.fullyReviewed,
    0,
  );
});
