import { recipeRegistry } from "../../../../packages/domain/src/registry";
import {
  foldSearch,
  programmeNames,
  type ProgrammeRecipe,
  type ProgrammeVariant,
  type RecipeRegistry,
  type StructureSlot,
} from "../../../../packages/domain/src/recipes";
export function inheritedStructures(
  programme: ProgrammeRecipe,
  variant: ProgrammeVariant,
  registry: RecipeRegistry = recipeRegistry,
): string[] {
  if (variant.structureIds) return variant.structureIds;
  if (!variant.extends) return [];
  const [pid, vid] = variant.extends.split("/");
  const parent = registry.programmes.find((p) => p.id === pid);
  const pv = parent?.variants.find((v) => v.id === vid);
  return parent && pv ? inheritedStructures(parent, pv, registry) : [];
}
export function majorProgrammes(
  degree: string,
  faculty: string,
  registry: RecipeRegistry = recipeRegistry,
) {
  return registry.programmes.filter(
    (p) =>
      p.degree === degree &&
      (!faculty || p.faculty === faculty) &&
      p.variants.some((v) => v.role === "major"),
  );
}
/** Folded words; punctuation separates them too ("l’art", "Pedagogy / Psychology"). */
const searchWords = (value: string) =>
  foldSearch(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
/**
 * Programmes whose official names (every language), aliases, subject or id contain every
 * query word: a title equal to the query first, then titles that start with it. Secondary
 * labels (faculty names) count only when nothing matches by name. An empty query keeps the
 * list as it is.
 */
export function searchProgrammes(
  programmes: ProgrammeRecipe[],
  query: string,
  secondaryLabels: (programme: ProgrammeRecipe) => string[] = () => [],
): ProgrammeRecipe[] {
  const words = searchWords(query);
  if (!words.length) return programmes;
  const primary = (p: ProgrammeRecipe) => [
    ...programmeNames(p),
    p.subject,
    p.id,
  ];
  const matching = (labels: (p: ProgrammeRecipe) => string[]) =>
    programmes.filter((p) => {
      const text = labels(p).flatMap(searchWords).join(" ");
      return words.every((word) => text.includes(word));
    });
  const matches = matching(primary);
  if (!matches.length)
    return matching((p) => [...primary(p), ...secondaryLabels(p)]);
  const start = words.join(" ");
  const rank = (p: ProgrammeRecipe) => {
    const titles = programmeNames({ title: p.title, titles: p.titles }).map(
      (name) => searchWords(name).join(" "),
    );
    if (titles.includes(start)) return 0;
    return titles.some((title) => title.startsWith(start)) ? 1 : 2;
  };
  // The sort is stable, so equal ranks keep the registry order.
  return [...matches].sort((a, b) => rank(a) - rank(b));
}
export function slotOptions(
  slot: StructureSlot,
  major: ProgrammeRecipe,
  registry: RecipeRegistry = recipeRegistry,
) {
  return registry.programmes
    .filter(
      (p) =>
        p.degree === major.degree &&
        (!slot.subjects || slot.subjects.includes(p.subject)) &&
        (slot.role !== "minor" ||
          !major.allowedMinors ||
          major.allowedMinors.includes(p.subject)),
    )
    .flatMap((p) =>
      p.variants
        .filter((v) => v.role === slot.role && v.ects === slot.ects)
        .map((v) => ({ programme: p, variant: v })),
    );
}
