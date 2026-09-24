import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { experienceMessages } from "../src/experience-messages";
import { messages } from "../src/i18n";
import { plannerMessages } from "../src/planner/messages";
import { catalogueMessages } from "../src/catalogue-i18n";
import { configuredStudyPlan, importStudyPlan } from "./studies-helpers";

test("timetable remembers its date and view after visiting another destination", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-22T12:00:00Z"));
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  await importStudyPlan(page, configuredStudyPlan());
  const t = plannerMessages.en;
  const x = experienceMessages.en;

  await page.goto("/semester/AS-2026");
  await page.getByRole("button", { name: t.next, exact: true }).click();
  await expect(page.getByLabel(t.date, { exact: true })).toHaveValue(
    "2026-09-29",
  );
  await page.getByRole("button", { name: x.thisWeek, exact: true }).click();
  await expect(page.getByLabel(t.date, { exact: true })).toHaveValue(
    "2026-09-22",
  );
  await page.getByRole("button", { name: t.day, exact: true }).click();
  await page.getByLabel(t.date, { exact: true }).fill("2026-10-06");
  await page
    .getByRole("navigation", { name: messages.en.nav })
    .getByRole("link", { name: x.courses, exact: true })
    .click();
  await page
    .getByRole("navigation", { name: messages.en.nav })
    .getByRole("link", { name: x.timetable, exact: true })
    .click();

  await expect(page).toHaveURL(/\/semester\/AS-2026$/);
  await expect(page.getByLabel(t.date, { exact: true })).toHaveValue(
    "2026-10-06",
  );
  await expect(
    page.getByRole("button", { name: t.day, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByLabel(t.date, { exact: true })).toHaveValue(
    "2026-10-06",
  );
  await expect(
    page.getByRole("button", { name: t.day, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/");
  await expect(page).toHaveURL(/\/semester\/AS-2026$/);
  await expect(page.getByLabel(t.date, { exact: true })).toHaveValue(
    "2026-10-06",
  );
});

test("the university logo returns to the home route", async ({ page }) => {
  await page.goto("/catalogue?q=Algebra");
  await page
    .getByRole("link", {
      name: "Universität Freiburg / Université de Fribourg",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("main h1")).toBeVisible();
});

test("course query and settled scroll position survive a detail round trip", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "de"));
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto("/catalogue?q=Example");
  const results = page.locator(".course-results > li");
  await expect(results.first()).toBeVisible();
  expect(await results.count()).toBeGreaterThanOrEqual(5);
  const target = results.nth(Math.min(14, (await results.count()) - 1));
  await target.scrollIntoViewIfNeeded();
  const savedScroll = await page.evaluate(() => window.scrollY);
  expect(savedScroll).toBeGreaterThan(100);

  const courseLink = target.locator("h2 a");
  const targetPath = await courseLink.getAttribute("href");
  await courseLink.click();
  await expect(page).toHaveURL(
    new RegExp(`${targetPath!.replace("?", "\\?")}$`),
  );
  await page.goBack();

  await expect(page).toHaveURL(/\/catalogue\?q=Example$/);
  await expect(results.first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThanOrEqual(savedScroll - 2);

  await target.locator("h2 a").click();
  await page
    .getByRole("link", { name: catalogueMessages.de.back, exact: true })
    .click();
  await expect(page).toHaveURL(/\/catalogue\?q=Example$/);
  await expect(results.first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThanOrEqual(savedScroll - 2);
});

for (const language of ["de", "fr", "en"] as const) {
  test(`weekly timetable has a complete heading hierarchy in ${language}`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-09-22T12:00:00Z"));
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    await importStudyPlan(page, configuredStudyPlan(), language);
    await page.goto("/semester/AS-2026");
    await expect(page.locator(".timetable-grid")).toBeVisible();
    expect(
      (await new AxeBuilder({ page }).withRules(["heading-order"]).analyze())
        .violations,
    ).toEqual([]);
  });
}
