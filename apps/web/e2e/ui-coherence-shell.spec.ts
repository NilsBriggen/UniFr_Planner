import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { messages } from "../src/i18n";
import { plannerMessages } from "../src/planner/messages";
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

test("the header New plan link needs a plan and never crowds the header", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  await page.goto("/plan");
  await expect(page.locator(".save-status")).toHaveText(
    plannerMessages.en.localHelp,
  );
  await expect(page.locator(".header-new-plan")).toHaveCount(0);
  await importStudyPlan(page, configuredStudyPlan(), "en");
  const picker = page.locator(".plan-switcher select");
  for (const [label, language] of [
    ["English", "en"],
    ["Deutsch", "de"],
    ["Français", "fr"],
  ] as const) {
    await page.getByRole("button", { name: label, exact: true }).click();
    const link = page
      .locator("header.header")
      .getByRole("link", { name: messages[language].newPlan, exact: true });
    // Tablet and phone headers have no room for it; My studies has the link.
    for (const width of [320, 390, 680, 768, 1000, 1001, 1440]) {
      await page.setViewportSize({ width, height: 740 });
      await expect(link).toBeVisible({ visible: width > 1000 });
      expect((await picker.boundingBox())!.width).toBeGreaterThanOrEqual(90);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await expect(link).toHaveAttribute("href", "/setup");
  }
  await picker.focus();
  await page.keyboard.press("Tab");
  await expect(
    page
      .locator("header.header")
      .getByRole("link", { name: messages.fr.newPlan, exact: true }),
  ).toBeFocused();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.locator(".header-new-plan")).toHaveCount(0);
});
