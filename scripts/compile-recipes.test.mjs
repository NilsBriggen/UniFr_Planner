import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  academicDigest,
  academicProjection,
  compileRecipes,
} from "./compile-recipes.mjs";

/**
 * Released editions are immutable for academic content. Display metadata (programme
 * titles/aliases, uncited sources) may be corrected in place; anything else needs a new
 * edition, which adds its own pin deliberately.
 */
const academicPins = {
  "2026-27.2":
    "036808d44a88296a2fe5c443801ce6c6ce8f5fb443606c7c5a6f57cb0274a345",
};

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
test("the current edition's academic content matches its pinned digest", async () => {
  const { registry } = await compileRecipes(
    await readFile(
      new URL("../data/programmes/recipes.yaml", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(
    academicPins[registry.edition],
    `Pin the academic digest of new edition ${registry.edition}`,
  );
  assert.equal(academicDigest(registry), academicPins[registry.edition]);
});
test("official German and French names equal the reviewed names manifest", async () => {
  const { registry } = await compileRecipes(
    await readFile(
      new URL("../data/programmes/recipes.yaml", import.meta.url),
      "utf8",
    ),
  );
  const manifest = JSON.parse(
    await readFile(
      new URL(
        "../data/programmes/reviews/2026-09-26-programme-names.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(manifest.edition, registry.edition);
  assert.equal(manifest.academicRulesChanged, false);
  assert.equal(manifest.documents.length, registry.programmes.length * 2);
  const reviewed = new Map(
    manifest.documents
      .filter((d) => d.status === "resolved")
      .map((d) => [`${d.programmeId}/${d.lang}`, d.name]),
  );
  const unresolved = new Set(
    manifest.unresolved.map((u) => `${u.programmeId}/${u.lang}`),
  );
  for (const programme of registry.programmes) {
    assert.equal(programme.titles?.en, undefined, programme.id);
    for (const language of ["de", "fr"]) {
      const key = `${programme.id}/${language}`;
      // Every programme is named in both languages unless the review left it unresolved.
      assert.notEqual(reviewed.has(key), unresolved.has(key), key);
      assert.equal(programme.titles?.[language], reviewed.get(key), key);
    }
  }
});
test("rejects malformed programme names and search aliases", async () => {
  for (const names of [
    { titles: { de: "Beispiel (bachelor)" } },
    { titles: { fr: " Exemple" } },
    { titles: { de: "Beispiel | Studies" } },
    { aliases: ["Ex", "ex"] },
    { aliases: ["Example"] },
    { titles: { de: "Beispiel" }, aliases: ["beispiel"] },
  ]) {
    const input = structuredClone(base);
    Object.assign(input.programmes[0], names);
    await assert.rejects(
      compileRecipes(JSON.stringify(input)),
      /programme (titles|aliases)/,
    );
  }
  const named = structuredClone(base);
  Object.assign(named.programmes[0], {
    titles: { de: "Beispiel", fr: "Exemple: « modèle »" },
    aliases: ["Ex"],
  });
  const { registry } = await compileRecipes(JSON.stringify(named));
  assert.deepEqual(registry.programmes[0].titles, named.programmes[0].titles);
});
test("the academic digest ignores display metadata but not academic changes", async () => {
  const { registry } = await compileRecipes(JSON.stringify(base));
  const digest = academicDigest(registry);
  const named = structuredClone(registry);
  named.programmes[0].titles = { de: "Beispiel", fr: "Exemple" };
  named.programmes[0].aliases = ["Ex"];
  named.sources.push({ ...source, id: "names", url: "https://x.test/names" });
  assert.equal(academicDigest(named), digest);
  assert.equal(academicProjection(named).sources.length, 1);
  for (const change of [
    (r) => (r.programmes[0].title = "Other"),
    (r) => (r.programmes[0].variants[0].ects = 120),
    (r) => (r.sources[0].sha256 = "0".repeat(64)),
    (r) => (r.structures[0].slots[0].ects = 120),
    (r) => (r.coverage[0].disposition = "alias"),
  ]) {
    const changed = structuredClone(registry);
    change(changed);
    assert.notEqual(academicDigest(changed), digest);
  }
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
