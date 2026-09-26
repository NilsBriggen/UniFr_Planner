import { render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { recipeRegistryForSelection } from "../../../../packages/domain/src/registry";
import {
  composeDegree,
  type DegreeSelection,
} from "../../../../packages/domain/src/recipes";
import type { Language } from "../i18n";
import { recipeMessages } from "./recipeMessages";
import ReviewGaps from "./ReviewGaps";

// Plans on the archived edition receive current official names by programme id.
const selection: DegreeSelection = {
  structureId: "ba-120-60",
  components: [
    {
      slotId: "major",
      programmeId: "bachelor-digitinf-informatics",
      variantId: "major-120",
      startSemester: "AS-2026",
      recipeVersion: "2026-27.1",
    },
    {
      slotId: "minor",
      programmeId: "bachelor-digitinf-businessinformatics",
      variantId: "minor-60",
      startSemester: "AS-2026",
      recipeVersion: "2026-27.1",
    },
  ],
};

it.each([
  ["de", "Informatik", "Wirtschaftsinformatik"],
  ["fr", "Informatique", "Informatique de gestion"],
  ["en", "Computer Science", "Business Informatics"],
] as [Language, string, string][])(
  "names review gap groups with official %s programme names",
  (language, major, minor) => {
    const degree = composeDegree(
      recipeRegistryForSelection(selection),
      selection,
    );
    render(<ReviewGaps degree={degree} language={language} />);
    const review = screen.getByRole("region", {
      name: recipeMessages[language].gaps,
    });
    expect(within(review).getByRole("heading", { name: major })).toBeVisible();
    expect(within(review).getByRole("heading", { name: minor })).toBeVisible();
  },
);
