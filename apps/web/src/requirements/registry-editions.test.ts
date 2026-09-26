import { expect, it } from "vitest";
import previousEdition from "../../../../packages/domain/src/recipe-editions/2026-27.1.json";
import {
  recipeRegistry,
  recipeRegistryForSelection,
  withCurrentDisplayNames,
} from "../../../../packages/domain/src/registry";
import {
  composeDegree,
  type DegreeSelection,
  type RecipeRegistry,
} from "../../../../packages/domain/src/recipes";

function selection(edition: string): DegreeSelection {
  return {
    structureId: "ba-120-60",
    components: [
      {
        slotId: "major",
        programmeId: "bachelor-digitinf-informatics",
        variantId: "major-120",
        startSemester: "AS-2026",
        recipeVersion: edition,
      },
      {
        slotId: "minor",
        programmeId: "bachelor-sci-mathematics",
        variantId: "minor-60",
        startSemester: "AS-2026",
        recipeVersion: edition,
      },
    ],
  };
}

it("retains the exact prior edition for existing plans without silently upgrading their rules", () => {
  const old = selection("2026-27.1");
  const archived = recipeRegistryForSelection(old);
  expect(archived.edition).toBe("2026-27.1");
  expect(archived).not.toBe(recipeRegistry);
  expect(Object.isFrozen(archived.programmes)).toBe(true);
  expect(composeDegree(archived, old).targetEcts).toBe(180);
  expect(recipeRegistryForSelection(selection(recipeRegistry.edition))).toBe(
    recipeRegistry,
  );
});

it("rejects unknown or mixed editions instead of composing a different curriculum", () => {
  expect(() => recipeRegistryForSelection(selection("unknown"))).toThrow(
    /edition/,
  );
  const mixed = selection("2026-27.1");
  mixed.components[1].recipeVersion = recipeRegistry.edition;
  expect(() => recipeRegistryForSelection(mixed)).toThrow(/edition/);
});

const withoutNames = (registry: RecipeRegistry): RecipeRegistry => ({
  ...registry,
  programmes: registry.programmes.map((programme) => {
    const copy = { ...programme };
    delete copy.titles;
    delete copy.aliases;
    return copy;
  }),
});

it("gives archived editions the current official names without touching their rules", () => {
  const archived = recipeRegistryForSelection(selection("2026-27.1"));
  const raw = previousEdition as unknown as RecipeRegistry;
  const current = new Map(recipeRegistry.programmes.map((p) => [p.id, p]));
  expect(raw.programmes.some((p) => p.titles || p.aliases)).toBe(false);
  expect(withoutNames(archived)).toEqual(raw);
  expect(Object.isFrozen(archived.programmes[0])).toBe(true);
  expect(archived.programmes.filter((p) => p.titles).length).toBeGreaterThan(0);
  for (const programme of archived.programmes) {
    const latest = current.get(programme.id)!;
    expect(programme.title).toBe(latest.title);
    expect(programme.titles).toEqual(latest.titles);
    expect(programme.aliases).toEqual(latest.aliases);
  }
});

it("only lends names to archived programmes whose English title is unchanged", () => {
  const [a, b, c] = withoutNames(recipeRegistry).programmes;
  const current = {
    ...recipeRegistry,
    programmes: [
      { ...a, titles: { de: "A (de)", fr: "A (fr)" }, aliases: ["AA"] },
      { ...b, title: "Renamed", titles: { de: "B (de)" } },
      { ...c, titles: { de: "C (de)" } },
    ],
  };
  const archive = {
    ...recipeRegistry,
    edition: "old",
    programmes: [a, b, { ...c, titles: { de: "Own" } }],
  };
  const overlaid = withCurrentDisplayNames(archive, current);
  expect(overlaid.edition).toBe("old");
  expect(overlaid.structures).toBe(archive.structures);
  expect(overlaid.programmes[0]).toMatchObject({
    titles: { de: "A (de)", fr: "A (fr)" },
    aliases: ["AA"],
  });
  expect(overlaid.programmes[1]).toBe(b);
  expect(overlaid.programmes[2].titles).toEqual({ de: "Own" });
  expect(a.titles).toBeUndefined();
});
