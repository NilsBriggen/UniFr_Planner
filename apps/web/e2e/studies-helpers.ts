import { expect, type Page } from "@playwright/test";
import { recipeRegistry } from "../../../packages/domain/src/registry";
import { createPlan, type Plan } from "../src/planner/domain";
import { bindDegreeSelection } from "../src/requirements/adapter";
import { plannerMessages } from "../src/planner/messages";
import { setupMessages } from "../src/planner/setupMessages";
import { recipeMessages } from "../src/requirements/recipeMessages";
import type { Language } from "../src/i18n";

export function configuredStudyPlan(
  name = "Computer Science with Business Informatics",
) {
  return bindDegreeSelection(
    createPlan({
      id: "study-browser",
      scenarioId: "main",
      name,
      programme: "Old free-text label",
      startTerm: "AS-2026",
      planningSemester: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    }),
    {
      structureId: "ba-120-60",
      components: [
        {
          slotId: "major",
          programmeId: "bachelor-digitinf-informatics",
          variantId: "major-120",
          startSemester: "AS-2026",
          recipeVersion: recipeRegistry.edition,
        },
        {
          slotId: "minor",
          programmeId: "bachelor-digitinf-businessinformatics",
          variantId: "minor-60",
          startSemester: "AS-2026",
          recipeVersion: recipeRegistry.edition,
        },
      ],
    },
  );
}

/** Import through the real UI when the test concerns an existing plan. */
export async function importStudyPlan(
  page: Page,
  plan: Plan,
  language: Language = "en",
) {
  const t = plannerMessages[language];
  await page.goto("/plan");
  await page.getByLabel(t.json, { exact: true }).fill(JSON.stringify(plan));
  await page.getByRole("button", { name: t.preview, exact: true }).click();
  await page
    .getByRole("button", { name: t.confirmImport, exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: plan.name, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".save-status")).toHaveText(t.saved);
}

export async function chooseManualSetup(page: Page, language: Language = "en") {
  await page
    .getByRole("button", {
      name: setupMessages[language].manualFallback,
      exact: true,
    })
    .click();
}

export async function chooseComputerScience(
  page: Page,
  language: Language = "en",
  start = "AS-2026",
  minorStart = start,
) {
  const t = recipeMessages[language];
  await page
    .getByLabel(t.main, { exact: true })
    .selectOption("bachelor-digitinf-informatics");
  await expect(page.getByLabel(t.variant, { exact: true })).toHaveValue(
    "major-120",
  );
  await page.getByLabel(t.structure, { exact: true }).selectOption("ba-120-60");
  await page
    .getByLabel(`${t.major} · ${t.semester}`, { exact: true })
    .fill(start);
  await page
    .getByLabel(`${t.minor} · 60 ECTS`, { exact: true })
    .selectOption("bachelor-digitinf-businessinformatics/minor-60");
  await page
    .getByLabel(`${t.minor} · 60 ECTS · ${t.semester}`, { exact: true })
    .fill(minorStart);
  await page.getByRole("button", { name: t.preview, exact: true }).click();
}
