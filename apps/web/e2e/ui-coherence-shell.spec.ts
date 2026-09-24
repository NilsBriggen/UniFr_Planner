import { expect, test } from "@playwright/test";
import { configuredStudyPlan, importStudyPlan } from "./studies-helpers";

test("study tabs stay on one phone row and reveal the active destination", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await importStudyPlan(page, configuredStudyPlan(), "en");
  await page.goto("/plan");
  const tabs = page.locator(".study-navigation");
  const links = tabs.getByRole("link");
  await expect(links).toHaveCount(3);
  const positions = await links.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, left: rect.left, right: rect.right };
    }),
  );
  expect(new Set(positions.map((position) => position.top)).size).toBe(1);
  await page.goto("/plan/completed");
  await expect
    .poll(() =>
      tabs.evaluate((element) => {
        const active = element.querySelector('[aria-current="page"]')!;
        const nav = element.getBoundingClientRect();
        const item = active.getBoundingClientRect();
        return item.left >= nav.left - 1 && item.right <= nav.right + 1;
      }),
    )
    .toBe(true);
});

test("the phone plan picker has a visible label and the full option name", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const plan = configuredStudyPlan();
  plan.name = "Computer Science and Business Informatics";
  await importStudyPlan(page, plan, "en");
  await page.goto("/plan");
  const picker = page.locator(".plan-switcher");
  await expect(picker.locator("span")).toBeVisible();
  await expect(picker.locator("select")).toHaveAttribute("title", plan.name);
  await expect(picker.locator("option:checked")).toHaveText(plan.name);
});
