import { expect, it } from "vitest";
import { recipeRegistry } from "../../../../packages/domain/src/registry";
import { majorProgrammes, slotOptions } from "./recipeOptions";
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
