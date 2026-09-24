import { expect, it } from "vitest";
import {
  recipeRegistry,
  recipeRegistryForSelection,
} from "../../../../packages/domain/src/registry";
import {
  composeDegree,
  type DegreeSelection,
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
