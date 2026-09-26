import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { programmeTitle } from "../../../packages/domain/src/recipes";
import { recipeRegistry } from "../../../packages/domain/src/registry";
import type { Language } from "../src/i18n";
import { countLabel } from "../src/planner/countLabels";
import { setupMessages } from "../src/planner/setupMessages";
import { recipeMessages } from "../src/requirements/recipeMessages";

const queries = {
  en: { computerScience: "computer science", matches: 1, psychology: "psy" },
  de: { computerScience: "Informatik", matches: 2, psychology: "Psychologie" },
  fr: { computerScience: "informatique", matches: 2, psychology: "psycho" },
} as const;

function pickName(id: string, language: Language) {
  const programme = recipeRegistry.programmes.find((p) => p.id === id)!;
  const faculty = programme.faculty as keyof typeof recipeMessages.en.faculties;
  return `${programmeTitle(programme, language)} · ${recipeMessages[language].faculties[faculty]}`;
}

for (const language of ["de", "fr", "en"] as const) {
  test(`programme search shows visible results and keeps Enter on setup in ${language}`, async ({
    page,
  }, info) => {
    const t = recipeMessages[language],
      s = setupMessages[language],
      q = queries[language];
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    await page.goto("/setup");
    const search = page.getByRole("searchbox", { name: t.search, exact: true });
    const main = page.getByLabel(t.main, { exact: true });
    const status = page.locator(".recipe-search-status");
    const results = page.getByRole("list", {
      name: t.searchResults,
      exact: true,
    });
    await expect(main).toBeEnabled();
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toBeEmpty();

    await search.fill(q.computerScience);
    await expect(status).toHaveText(
      `${q.matches} ${countLabel(language, "programme", q.matches)}`,
    );
    const computerScience = results.getByRole("button", {
      name: pickName("bachelor-digitinf-informatics", language),
      exact: true,
    });
    // The results are on the page, not only inside the closed select.
    await expect(computerScience).toBeVisible();
    await expect(main).toHaveValue("");
    await computerScience.click();
    await expect(main).toHaveValue("bachelor-digitinf-informatics");
    await expect(computerScience).toHaveAttribute("aria-pressed", "true");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);

    await search.fill(q.psychology);
    await results
      .getByRole("button", {
        name: pickName("bachelor-pedpsy-psychology", language),
        exact: true,
      })
      .click();
    await expect(main).toHaveValue("bachelor-pedpsy-psychology");
    // The selection is complete, so an unhandled Enter would submit the step.
    await expect(
      page.getByRole("button", { name: s.continue, exact: true }),
    ).toBeEnabled();
    await search.fill("zzzz");
    await expect(status).toHaveText(t.noProgrammeMatch);
    await search.press("Enter");
    await expect(page).toHaveURL(/\/setup$/);
    await expect(
      page.getByRole("heading", { name: s.studies, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: s.settings, exact: true }),
    ).toHaveCount(0);
    await expect(main).toHaveValue("bachelor-pedpsy-psychology");

    await page.setViewportSize({ width: 390, height: 844 });
    await search.fill(q.computerScience);
    await expect(computerScience).toBeVisible();
    const boxes = await page
      .locator(".recipe-programme-picker")
      .evaluate((picker) =>
        [
          'input[type="search"]',
          ".recipe-search-status",
          "select",
          ".recipe-search-results",
        ].map((selector) => {
          const r = picker.querySelector(selector)!.getBoundingClientRect();
          return { selector, top: r.top, bottom: r.bottom, left: r.left };
        }),
      );
    // At phone width search, count, select and quick picks stack without overlapping.
    for (let i = 1; i < boxes.length; i++)
      expect(
        boxes[i].top,
        `${boxes[i].selector} below ${boxes[i - 1].selector}`,
      ).toBeGreaterThanOrEqual(boxes[i - 1].bottom - 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`setup-search-${language}-390.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1366, height: 900 });
    await expect(computerScience).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`setup-search-${language}-1366.png`),
      fullPage: true,
    });
  });
}
