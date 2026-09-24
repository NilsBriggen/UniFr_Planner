import { recipeRegistryForSelection } from "../../../../packages/domain/src/registry";
import { programmeTemplates } from "../../../../packages/domain/src/programmes";
import type {
  DegreeSelection,
  ResolvedDegree,
} from "../../../../packages/domain/src/recipes";
import type { Language } from "../i18n";
import type { Plan } from "../planner/domain";

function selectionLabel(selection: DegreeSelection, language: Language) {
  const registry = recipeRegistryForSelection(selection);
  return selection.components
    .map((component) => {
      const programme = registry.programmes.find(
        (entry) => entry.id === component.programmeId,
      );
      return (
        programme?.titles?.[language] ??
        programme?.title ??
        component.programmeId
      );
    })
    .join(" + ");
}

export function degreeProgrammeLabel(
  degree: ResolvedDegree,
  language: Language,
) {
  return selectionLabel(degree.selection, language).slice(0, 200);
}

/** Display follows the saved academic selection; the free-text label is legacy metadata. */
export function studyLabel(plan: Plan, language: Language): string {
  if (plan.degreeSelection)
    return selectionLabel(plan.degreeSelection, language);
  if (plan.requirements) {
    return plan.requirements.templates
      .map((reference) => {
        const programme = programmeTemplates.find(
          (entry) =>
            entry.code === reference.code &&
            entry.version === reference.version,
        );
        return programme?.title[language] ?? reference.code;
      })
      .join(" + ");
  }
  return plan.programme;
}

export function hasStudyConfiguration(plan: Plan): boolean {
  return !!(plan.degreeSelection || plan.requirements);
}
