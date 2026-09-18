import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createPlan } from "../src/planner/domain";
import { requirementMessages } from "../src/requirements/messages";
import { plannerMessages } from "../src/planner/messages";

for (const language of ["de", "fr", "en"] as const)
  test(`requirements ${language}: allocations, source evidence, reload, keyboard and Axe`, async ({
    page,
  }, info) => {
    const t = requirementMessages[language],
      planner = plannerMessages[language];
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    const plan = createPlan({
      id: "requirements",
      scenarioId: "main",
      name: "Requirements degree",
      programme: "CS",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    });
    plan.scenarios[0].courses = [
      {
        id: "intro",
        code: "SIN.01023",
        titles: { en: "Introduction" },
        ects: 6,
        status: "completed",
        semester: null,
        pinned: false,
        offering: null,
      },
      {
        id: "transfer",
        code: "TRANSFER",
        titles: { en: "Transfer" },
        ects: 5,
        status: "planned",
        semester: "AS-2026",
        pinned: false,
        offering: null,
      },
    ];
    await page.goto("/plan");
    await page
      .getByLabel(planner.json, { exact: true })
      .fill(JSON.stringify(plan));
    await page
      .getByRole("button", { name: planner.preview, exact: true })
      .click();
    await page
      .getByRole("button", { name: planner.confirmImport, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: plan.name, exact: true }),
    ).toBeVisible();
    await page.goto("/requirements");
    await page.getByRole("button", { name: t.add, exact: true }).click();
    const tree = page.getByRole("list", { name: t.title, exact: true });
    await expect(tree).toBeVisible();
    await expect(tree).toContainText(t.complete);
    await expect(tree).toContainText(t.needs_clarification);
    await page.getByLabel(t.course, { exact: true }).selectOption("transfer");
    await page
      .getByLabel(t.requirement, { exact: true })
      .selectOption("CS-120@2026.1/SIN.01021");
    await page
      .getByLabel(t.reason, { exact: true })
      .fill("Personal advisor reference 42");
    const save = page.getByRole("button", { name: t.save, exact: true });
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("Personal advisor reference 42", { exact: true }),
    ).toBeVisible();
    await expect(tree).toContainText(t.covered);
    await expect(tree).toContainText(t.override);
    const source = tree.getByText(t.sources, { exact: true }).first();
    await source.focus();
    await page.keyboard.press("Enter");
    await expect(tree.getByRole("link").first()).toHaveAttribute(
      "href",
      "https://cdn.unifr.ch/scimed/plans/current/Plan_BSc_IN_fr.pdf",
    );
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
    await page.screenshot({
      path: info.outputPath("requirements.png"),
      fullPage: true,
    });
    await page.reload();
    await expect(
      page.getByText("Personal advisor reference 42", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(t.cohort, { exact: true })).toBeDisabled();
    await page
      .getByRole("button", { name: `${t.remove} · transfer`, exact: true })
      .click();
    await expect(
      page.getByText("Personal advisor reference 42", { exact: true }),
    ).toHaveCount(0);
    await expect(tree).not.toContainText(t.covered);
  });
