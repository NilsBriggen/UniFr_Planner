import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createPlan } from "../src/planner/domain";
import { recipeMessages } from "../src/requirements/recipeMessages";
import { plannerMessages } from "../src/planner/messages";
import { requirementMessages } from "../src/requirements/messages";

for (const language of ["de", "fr", "en"] as const)
  test(`recipe chooser ${language}: independent minor semester, exception, reopen and accessible layout`, async ({
    page,
  }, info) => {
    const t = recipeMessages[language],
      p = plannerMessages[language];
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    const plan = createPlan({
      id: "recipe-browser",
      scenarioId: "main",
      name: "Computer Science with Business Informatics",
      programme: "CS",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    });
    await page.goto("/plan");
    await page.getByLabel(p.json, { exact: true }).fill(JSON.stringify(plan));
    await page.getByRole("button", { name: p.preview, exact: true }).click();
    await page
      .getByRole("button", { name: p.confirmImport, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: plan.name, exact: true }),
    ).toBeVisible();
    await page.goto("/requirements");
    await page
      .getByLabel(t.faculty, { exact: true })
      .selectOption("science-medicine");
    await page
      .getByLabel(t.main, { exact: true })
      .selectOption("bachelor-digitinf-informatics");
    await page.getByLabel(t.variant, { exact: true }).selectOption("major-120");
    await page
      .getByLabel(t.structure, { exact: true })
      .selectOption("ba-120-60");
    const minor = `${t.minor} · 60 ECTS`;
    await page
      .getByLabel(minor, { exact: true })
      .selectOption("bachelor-digitinf-businessinformatics/minor-60");
    await page
      .getByLabel(`${minor} · ${t.semester}`, { exact: true })
      .fill("SS-2027");
    await page.getByRole("button", { name: t.preview, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: t.rules, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: t.gaps, exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: t.save, exact: true }).click();
    await expect(
      page.getByRole("list", {
        name: requirementMessages[language].title,
        exact: true,
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel(`${minor} · ${t.semester}`, { exact: true }),
    ).toHaveValue("SS-2027");
    await expect(
      page.getByRole("heading", { name: t.gaps, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath("recipe-degree.png"),
      fullPage: true,
    });
  });
