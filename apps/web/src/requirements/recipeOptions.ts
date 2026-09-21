import { recipeRegistry } from "../../../../packages/domain/src/registry";
import type {
  ProgrammeRecipe,
  ProgrammeVariant,
  StructureSlot,
} from "../../../../packages/domain/src/recipes";
export function inheritedStructures(
  programme: ProgrammeRecipe,
  variant: ProgrammeVariant,
): string[] {
  if (variant.structureIds) return variant.structureIds;
  if (!variant.extends) return [];
  const [pid, vid] = variant.extends.split("/");
  const parent = recipeRegistry.programmes.find((p) => p.id === pid);
  const pv = parent?.variants.find((v) => v.id === vid);
  return parent && pv ? inheritedStructures(parent, pv) : [];
}
export function majorProgrammes(degree: string, faculty: string) {
  return recipeRegistry.programmes.filter(
    (p) =>
      p.degree === degree &&
      (!faculty || p.faculty === faculty) &&
      p.variants.some((v) => v.role === "major"),
  );
}
export function slotOptions(slot: StructureSlot, major: ProgrammeRecipe) {
  return recipeRegistry.programmes
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
