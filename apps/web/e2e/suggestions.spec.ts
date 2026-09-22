import { openPlanJson, openPlanTools } from "./studies-helpers";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { suggestionMessages } from "../src/suggestions/messages";
import { plannerMessages } from "../src/planner/messages";
import { createExample } from "../src/suggestions/seed";

const savedPlans = (page: Page) =>
  page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("unifr-planner");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      return await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction("plans").objectStore("plans").getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });

for (const language of ["de", "fr", "en"] as const) {
  test(`suggestions ${language}: exact requirement impacts remain reviewable and reversible`, async ({
    page,
  }, info) => {
    const t = suggestionMessages[language],
      p = plannerMessages[language];
    const plan = createExample("impact", "Requirement impact");
    plan.scenarios[0].courses[0].ects = 4;
    plan.scenarios.push({
      ...structuredClone(plan.scenarios[0]),
      id: "other",
      name: "Preserved scenario",
    });
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    await page.goto("/plan");
    await openPlanJson(page, language);
    await page.getByLabel(p.json, { exact: true }).fill(JSON.stringify(plan));
    await page.getByRole("button", { name: p.preview, exact: true }).click();
    await page
      .getByRole("button", { name: p.confirmImport, exact: true })
      .click();
    await openPlanTools(page, language);
    await page.getByRole("link", { name: t.nav, exact: true }).click();
    const original = await savedPlans(page);
    await page
      .getByRole("list", { name: t.nav, exact: true })
      .getByRole("button")
      .first()
      .click();
    const comparison = page.getByRole("region", { name: t.comparison });
    const impacts = comparison.getByRole("list", { name: t.impacts });
    await expect(impacts).toContainText(
      plan.scenarios[0].courses[0].titles[language],
    );
    await expect(impacts).toContainText(`${t.remainingCredits}: 2 → 0`);
    await expect(impacts).toContainText(`${t.missingCourses}: 0 → 0`);
    await expect(impacts).toContainText(`${t.allocatedCredits}: 4 → 6`);
    expect(await savedPlans(page)).toEqual(original);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await comparison.screenshot({
      path: info.outputPath("requirement-impact.png"),
    });
    await comparison.getByRole("checkbox", { name: t.confirm }).check();
    await comparison
      .getByRole("button", { name: t.apply, exact: true })
      .click();
    await expect(page.getByText(t.applied, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: t.undo, exact: true }).click();
    await expect(page.getByText(t.undone, { exact: true })).toBeVisible();
    expect(await savedPlans(page)).toEqual(original);
  });
  test(`suggestions ${language}: dated comparison, uncertainty, apply, reload undo and Axe`, async ({
    page,
  }, info) => {
    const t = suggestionMessages[language];
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    await page.goto("/plan");
    await page.getByRole("link", { name: t.nav, exact: true }).click();
    await expect(page.getByRole("heading", { name: t.title })).toBeVisible();
    await expect(page.getByText(t.noData, { exact: true })).toBeVisible();
    await expect(page.getByText(t.noPlan, { exact: true })).toBeVisible();
    await expect(page.getByText(t.demo, { exact: true })).toHaveCount(0);
    expect(await savedPlans(page)).toEqual([]);
    await page.getByRole("button", { name: t.example, exact: true }).click();
    await expect(page.getByText(t.demo, { exact: true })).toBeVisible();
    const list = page.getByRole("list", { name: t.nav, exact: true });
    await expect(list).toBeVisible();
    const original = await savedPlans(page);
    const unknown = list
      .getByRole("listitem")
      .filter({ hasText: t.warnings.calendar });
    await unknown.getByRole("button").click();
    let comparison = page.getByRole("region", { name: t.comparison });
    await expect(
      comparison.getByText(t.warnings.calendar).last(),
    ).toBeVisible();
    await expect(
      comparison.getByRole("button", { name: t.apply, exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: t.comparison }),
    ).toBeFocused();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await comparison.screenshot({
      path: info.outputPath("suggestion-uncertainty.png"),
    });
    await comparison
      .getByRole("button", { name: t.cancel, exact: true })
      .click();
    const compare = list.getByRole("button").first();
    await compare.focus();
    await page.keyboard.press("Enter");
    comparison = page.getByRole("region", { name: t.comparison });
    await expect(comparison.getByText(t.why, { exact: true })).toBeVisible();
    await expect(
      comparison.getByText(t.uncertainty, { exact: true }),
    ).toBeVisible();
    await expect(
      comparison.getByText(t.warnings.requirements, { exact: true }),
    ).toBeVisible();
    await expect(comparison.locator(".suggestion-conflicts")).toContainText(
      "1 → 0",
    );
    expect(await savedPlans(page)).toEqual(original);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await comparison.screenshot({
      path: info.outputPath("suggestion-comparison.png"),
    });
    await comparison.getByRole("checkbox", { name: t.confirm }).check();
    const apply = comparison.getByRole("button", {
      name: t.apply,
      exact: true,
    });
    await apply.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText(t.applied, { exact: true })).toBeVisible();
    expect(await savedPlans(page)).not.toEqual(original);
    await page.reload();
    await page.getByRole("button", { name: t.undo, exact: true }).click();
    await expect(page.getByText(t.undone, { exact: true })).toBeVisible();
    expect(await savedPlans(page)).toEqual(original);
    await page.getByText(new RegExp(t.rejections)).click();
    await expect(
      page.getByText(`${t.reasons.prerequisite} · DEMO-PRE`, { exact: true }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });

  test(`suggestions ${language}: distinguishes unavailable data from all candidates pinned`, async ({
    page,
  }) => {
    const t = suggestionMessages[language],
      p = plannerMessages[language];
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    const plan = createExample("pinned", "Pinned example");
    plan.scenarios[0].courses.forEach((c) => {
      c.pinned = true;
    });
    await page.goto("/plan");
    await openPlanJson(page, language);
    await page.getByLabel(p.json, { exact: true }).fill(JSON.stringify(plan));
    await page.getByRole("button", { name: p.preview, exact: true }).click();
    await page
      .getByRole("button", { name: p.confirmImport, exact: true })
      .click();
    await openPlanTools(page, language);
    await page.getByRole("link", { name: t.nav, exact: true }).click();
    await expect(page.getByText(t.noSafe, { exact: true })).toBeVisible();
    await page.goto("/plan");
    plan.programme = "Real degree";
    await openPlanJson(page, language);
    await page.getByLabel(p.json, { exact: true }).fill(JSON.stringify(plan));
    await page.getByRole("button", { name: p.preview, exact: true }).click();
    await page
      .getByRole("button", { name: p.confirmImport, exact: true })
      .click();
    await openPlanTools(page, language);
    await page.getByRole("link", { name: t.nav, exact: true }).click();
    await expect(page.getByText(t.noData, { exact: true })).toBeVisible();
    await expect(page.getByText(t.noSafe, { exact: true })).toHaveCount(0);
  });
}
