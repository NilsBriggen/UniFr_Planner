import data from "./recipe-registry.json";
import type { RecipeRegistry } from "./recipes";

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
