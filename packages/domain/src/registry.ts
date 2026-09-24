import data from "./recipe-registry.json";
import previousEdition from "./recipe-editions/2026-27.1.json";
import type { DegreeSelection, RecipeRegistry } from "./recipes";

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Produced by the offline schema-checked compiler; runtime does no YAML parsing. */
export const recipeRegistry: RecipeRegistry = freeze(
  data as unknown as RecipeRegistry,
);

const archivedRegistries: Readonly<Record<string, RecipeRegistry>> = freeze({
  "2026-27.1": previousEdition as unknown as RecipeRegistry,
});

/** Existing plans retain their source edition until the student explicitly migrates. */
export function recipeRegistryForSelection(
  selection: DegreeSelection,
): RecipeRegistry {
  const editions = [
    ...new Set(
      selection.components.map((component) => component.recipeVersion),
    ),
  ];
  if (editions.length !== 1)
    throw new Error(
      "Mixed or missing recipe editions require explicit migration",
    );
  const edition = editions[0];
  const registry =
    edition === recipeRegistry.edition
      ? recipeRegistry
      : archivedRegistries[edition];
  if (!registry) throw new Error(`Recipe edition unavailable: ${edition}`);
  return registry;
}
