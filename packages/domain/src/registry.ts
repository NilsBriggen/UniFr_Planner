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

/**
 * Programme names are display metadata keyed by stable programme id, not academic content.
 * An archived edition receives the current official names and search aliases wherever its
 * English title is unchanged; the archive itself (and every rule in it) stays untouched.
 */
export function withCurrentDisplayNames(
  archive: RecipeRegistry,
  current: RecipeRegistry = recipeRegistry,
): RecipeRegistry {
  const names = new Map(current.programmes.map((p) => [p.id, p]));
  return {
    ...archive,
    programmes: archive.programmes.map((programme) => {
      const named = names.get(programme.id);
      if (!named || named.title !== programme.title) return programme;
      return {
        ...programme,
        ...(!programme.titles && named.titles ? { titles: named.titles } : {}),
        ...(!programme.aliases && named.aliases
          ? { aliases: named.aliases }
          : {}),
      };
    }),
  };
}

// The overlay builds a copy, which is frozen together with the archive it wraps.
const archivedRegistries: Readonly<Record<string, RecipeRegistry>> = freeze({
  "2026-27.1": withCurrentDisplayNames(
    previousEdition as unknown as RecipeRegistry,
  ),
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
