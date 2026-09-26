import { expect, it } from "vitest";
import { recipeRegistry } from "../../../../packages/domain/src/registry";
import type {
  DegreeSelection,
  ResolvedDegree,
} from "../../../../packages/domain/src/recipes";
import { createPlan, type Plan } from "../planner/domain";
import { degreeProgrammeLabel, studyLabel } from "./study-summary";

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

function plan(degreeSelection: DegreeSelection): Plan {
  return {
    ...createPlan({
      id: "plan",
      scenarioId: "scenario",
      name: "Plan",
      programme: "Saved programme label",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    }),
    degreeSelection,
  };
}

it.each(["2026-27.1", recipeRegistry.edition])(
  "labels %s selections with the official programme names of each language",
  (edition) => {
    const saved = plan(selection(edition));
    expect(studyLabel(saved, "de")).toBe("Informatik + Mathematik");
    expect(studyLabel(saved, "fr")).toBe("Informatique + Mathématiques");
    expect(studyLabel(saved, "en")).toBe("Computer Science + Mathematics");
  },
);

it("keeps the saved label when the selection's edition is unavailable", () => {
  expect(studyLabel(plan(selection("unknown")), "de")).toBe(
    "Saved programme label",
  );
});

it("bounds the degree label even for long official names", () => {
  const teacher = {
    ...selection(recipeRegistry.edition).components[0],
    programmeId: "master-teach-teacheredu1-2",
    variantId: "major-106",
  };
  const degree = {
    selection: {
      structureId: "ma",
      components: [1, 2, 3, 4, 5].map((n) => ({ ...teacher, slotId: `s${n}` })),
    },
  } as ResolvedDegree;
  for (const language of ["de", "fr", "en"] as const) {
    const label = degreeProgrammeLabel(degree, language);
    expect(label).toHaveLength(200);
    expect(label.startsWith(studyLabel(plan(teacherOnly()), language))).toBe(
      true,
    );
  }
  function teacherOnly(): DegreeSelection {
    return { structureId: "ma", components: [teacher] };
  }
});
