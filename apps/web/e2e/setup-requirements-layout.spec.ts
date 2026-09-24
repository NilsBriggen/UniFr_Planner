import { expect, test } from "@playwright/test";
import { createPlan } from "../src/planner/domain";
import { importStudyPlan } from "./studies-helpers";

test("setup history choice stays a square checkbox with a full touch target", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/setup");
  await page
    .getByRole("button", { name: "My programme or combination is missing" })
    .click();
  const choice = page.getByLabel("I have completed courses to record now");
  const input = await choice.boundingBox();
  const label = await choice.locator("xpath=parent::label").boundingBox();
  expect(input).not.toBeNull();
  expect(label).not.toBeNull();
  expect(input!.width).toBeGreaterThanOrEqual(18);
  expect(input!.width).toBeLessThanOrEqual(22);
  expect(input!.height).toBeGreaterThanOrEqual(18);
  expect(input!.height).toBeLessThanOrEqual(22);
  expect(label!.height).toBeGreaterThanOrEqual(44);
  await choice.locator("xpath=parent::label").click();
  await expect(choice).toBeChecked();
  await page.screenshot({
    path: info.outputPath("setup-history-320.png"),
    fullPage: true,
  });
});

test("setup start help uses its own readable row above the review action", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/setup");
  const help = page.locator(".recipe-start-help");
  const action = page.getByRole("button", { name: "Review and start" });
  const helpBox = await help.boundingBox();
  const actionBox = await action.boundingBox();
  expect(helpBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(helpBox!.width).toBeGreaterThan(250);
  expect(actionBox!.y).toBeGreaterThan(helpBox!.y + helpBox!.height);
  await page.screenshot({
    path: info.outputPath("setup-390.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.screenshot({
    path: info.outputPath("setup-1366.png"),
    fullPage: true,
  });
});

test("requirements show all reconciliation fields in phone cards before a desktop table", async ({
  page,
}, info) => {
  const plan = createPlan({
    id: "responsive-requirements",
    scenarioId: "main",
    name: "Requirements",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
  plan.requirements = {
    cohort: 2026,
    templates: [{ code: "CS-120", version: "2026.1" }],
  };
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
  ];
  await importStudyPlan(page, plan, "en");
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/requirements");
  const reconciliation = page.getByRole("region", {
    name: "Credit reconciliation",
  });
  const card = page.locator(".reconciliation-card");
  await expect(card).toHaveCount(1);
  for (const label of [
    "Recorded / selected",
    "Modelled requirement",
    "Contribution",
    "Unallocated",
    "Why this differs",
  ]) {
    await expect(card).toContainText(label);
  }
  await expect(reconciliation.locator("table")).toBeHidden();
  await expect(
    page.getByRole("list", { name: "Study requirements" }),
  ).toBeVisible();
  expect(
    await page
      .locator(".requirement-tree")
      .first()
      .evaluate(
        (node) =>
          !!(
            node.compareDocumentPosition(
              document.querySelector(".credit-reconciliation")!,
            ) & Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
  ).toBe(true);
  await expect(
    page.getByText("Remaining requirement total cannot yet be confirmed.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("requirements-320.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("requirements-390.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  await expect(reconciliation.locator("table")).toBeVisible();
  await expect(card).toBeHidden();
  await page.screenshot({
    path: info.outputPath("requirements-1366.png"),
    fullPage: true,
  });
});
