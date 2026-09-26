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
  await openPlanJson(page, language);
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

export async function openPlanTools(page: Page, language: Language = "en") {
  const tools = page.locator("details.plan-tools");
  await expect(tools).toHaveAccessibleName(plannerMessages[language].planTools);
  if ((await tools.getAttribute("open")) === null) {
    await tools.locator(":scope > summary").click();
  }
  return tools;
}

/**
 * Course-scope buttons are a row on desktop but a collapsed disclosure on phones,
 * which closes again after each choice.
 */
export async function discoveryScope(page: Page, name: string) {
  await expect(page.locator(".discovery-controls")).toBeVisible();
  const mobile = page.locator("details.discovery-scopes-mobile");
  if (
    (await mobile.isVisible()) &&
    (await mobile.getAttribute("open")) === null
  ) {
    await mobile.locator(":scope > summary").click();
    await expect(mobile).toHaveAttribute("open", "");
  }
  return page.getByRole("button", { name, exact: true });
}

/** Result filters such as "Hide added courses" live in a collapsed disclosure. */
export async function openResultOptions(page: Page) {
  const options = page.locator("details.discovery-options");
  if ((await options.getAttribute("open")) === null) {
    await options.locator(":scope > summary").click();
    await expect(options).toHaveAttribute("open", "");
  }
  return options;
}

export async function openPlanJson(page: Page, language: Language = "en") {
  await expect(page.locator(".save-status")).not.toHaveText(
    plannerMessages[language].loading,
  );
  const nested = page.locator("details.plan-tools details.import-advanced");
  const advanced = (await nested.count())
    ? nested
    : page.locator("details.import-advanced");
  if (await nested.count()) await openPlanTools(page, language);
  if ((await advanced.getAttribute("open")) === null) {
    await advanced.locator("summary").first().click();
    await expect(advanced).toHaveAttribute("open", "");
  }
}

export async function chooseManualSetup(page: Page, language: Language = "en") {
  await page
    .getByRole("button", {
      name: setupMessages[language].manualFallback,
      exact: true,
    })
    .click();
  await page
    .getByText(setupMessages[language].optional, { exact: true })
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
  const variant = page.getByLabel(t.variant, { exact: true });
  if (await variant.count()) await variant.selectOption("major-120");
  const structure = page.getByLabel(t.structure, { exact: true });
  if (await structure.count()) await structure.selectOption("ba-120-60");
  await fillSemester(page, `${t.major} · ${t.semester}`, start, language);
  await page
    .getByLabel(`${t.minor} · 60 ECTS`, { exact: true })
    .selectOption("bachelor-digitinf-businessinformatics/minor-60");
  if (minorStart !== start) {
    await page.getByLabel(t.differentStart, { exact: true }).check();
    await fillSemester(
      page,
      `${t.minor} · 60 ECTS · ${t.semester}`,
      minorStart,
      language,
    );
  }
  const setupContinue = page.getByRole("button", {
    name: setupMessages[language].continue,
    exact: true,
  });
  await (
    (await setupContinue.count())
      ? setupContinue
      : page.getByRole("button", { name: t.preview, exact: true })
  ).click();
}

export async function fillSemester(
  page: Page,
  label: string,
  term: string,
  language: Language = "en",
) {
  const [season, year] = term.split("-");
  const part = {
    en: { season: "Season", year: "Year" },
    de: { season: "Jahreszeit", year: "Jahr" },
    fr: { season: "Saison", year: "Année" },
  }[language];
  await page
    .getByLabel(`${label} · ${part.season}`, { exact: true })
    .selectOption(season);
  await page.getByLabel(`${label} · ${part.year}`, { exact: true }).fill(year);
}
