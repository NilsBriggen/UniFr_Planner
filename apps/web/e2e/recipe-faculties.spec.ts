import { test, expect } from "@playwright/test";
import { createPlan } from "../src/planner/domain";
import { plannerMessages } from "../src/planner/messages";
import { recipeMessages } from "../src/requirements/recipeMessages";
const cases = [
  ["theology", "bachelor", "bachelor-theo-theology", "major-180", "ba-180"],
  ["law", "bachelor", "bachelor-ius-law", "major-180", "ba-180"],
  ["ses", "bachelor", "bachelor-eco-management", "major-180", "ba-180"],
  [
    "humanities",
    "master",
    "master-phi-philosophy",
    "major-90",
    "ma-90-optional-minor-30",
  ],
  [
    "education",
    "bachelor",
    "bachelor-pedpsy-specialeducation",
    "major-180",
    "ba-180",
  ],
  [
    "science-medicine",
    "master",
    "master-sci-biochemistry",
    "major-120",
    "ma-120",
  ],
  ["interfaculty", "master", "master-int-digitalsociety", "major-90", "ma-90"],
];
test("every faculty can save and reopen a sourced degree with visible review gaps", async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  const p = plannerMessages.en,
    t = recipeMessages.en;
  const plan = createPlan({
    id: "faculty-browser",
    scenarioId: "main",
    name: "Faculty coverage",
    programme: "Degree",
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
  for (const [faculty, degree, programme, variant, structure] of cases) {
    await page.getByLabel(t.degree, { exact: true }).selectOption(degree);
    await page.getByLabel(t.faculty, { exact: true }).selectOption(faculty);
    await page.getByLabel(t.main, { exact: true }).selectOption(programme);
    await page.getByLabel(t.variant, { exact: true }).selectOption(variant);
    await page.getByLabel(t.structure, { exact: true }).selectOption(structure);
    await page.getByRole("button", { name: t.preview, exact: true }).click();
    await expect(page.getByText(t.incomplete, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: t.save, exact: true }).click();
    await expect(
      page.getByRole("list", { name: "Study requirements", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: t.save, exact: true }),
    ).toBeEnabled();
    await page.reload();
    await expect(page.getByLabel(t.main, { exact: true })).toHaveValue(
      programme,
    );
    await expect(
      page.getByRole("heading", { name: t.gaps, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (faculty === "law")
      await page.screenshot({
        path: info.outputPath("law-degree.png"),
        fullPage: true,
      });
  }
});
