import { chooseManualSetup } from "./studies-helpers";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("semester discovery explains lesson times and updates its overview as courses are added", async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  await page.goto("/setup");
  await chooseManualSetup(page, "en");
  await page.getByLabel("Plan name", { exact: true }).fill("CS + BI semester");
  await page
    .getByLabel("Programme", { exact: true })
    .fill("Computer Science + Business Informatics");
  await page.getByLabel("Study start · Year", { exact: true }).fill("2026");
  await page.getByRole("button", { name: "Start planning" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Courses", exact: true })
    .click();
  const overview = page.getByRole("complementary", { name: "Your semester" });
  await expect(overview).toBeVisible();
  const openOverview = async () => {
    const disclosure = overview.locator("details");
    if ((await disclosure.getAttribute("open")) === null)
      await disclosure.locator("summary").click();
  };
  await expect(page).toHaveURL(/term=AS-2026/);
  const algebra = page
    .locator(".course-results > li")
    .filter({ has: page.getByRole("heading", { name: /Algebra/ }) });
  if (info.project.name === "phone") {
    const firstResult = await algebra.boundingBox();
    expect(firstResult!.y).toBeLessThan(844 - 64);
  }
  await openOverview();
  await expect(algebra.locator(".lesson-preview")).toContainText("12:00");
  await expect(algebra.locator(".lesson-preview")).toContainText("PER 21");
  await algebra
    .getByRole("button", { name: "Add to semester", exact: true })
    .click();
  await expect(overview).toContainText("6 ECTS");
  await expect(overview).toContainText("Algebra");
  await page.getByLabel("Hide added courses", { exact: true }).click();
  await expect(algebra).toHaveCount(0);
  await expect(overview).toContainText("Algebra");
  await page.getByLabel("Hide added courses", { exact: true }).click();
  await expect(algebra).toBeVisible();
  await page.getByRole("button", { name: "All courses", exact: true }).click();
  const ecology = page
    .locator(".course-results > li")
    .filter({ has: page.getByRole("heading", { name: /Ecology/ }) });
  await expect(ecology).toContainText("Clashes with");
  await page.getByLabel("Only courses that fit", { exact: true }).click();
  await expect(
    page.getByLabel("Only courses that fit", { exact: true }),
  ).toBeChecked();
  await expect(ecology).toHaveCount(0);
  await expect(algebra).toBeVisible();
  await expect(page.locator(".course-results")).not.toContainText(
    "Research seminar",
  );
  await page.getByLabel("Only courses that fit", { exact: true }).click();
  await expect(
    page.getByLabel("Only courses that fit", { exact: true }),
  ).not.toBeChecked();
  await ecology
    .getByRole("button", { name: "Add to semester", exact: true })
    .click();
  await expect(overview).toContainText("15 ECTS");
  await expect(overview).toContainText("Time conflict");
  await expect(
    overview.getByRole("link", { name: "Improve this schedule", exact: true }),
  ).toHaveAttribute("href", "/suggestions");
  await page.screenshot({
    path: info.outputPath("assisted-catalogue.png"),
    fullPage: true,
  });
  await page
    .locator(".discovery-semester")
    .evaluate((el) => el.scrollIntoView());
  await page.screenshot({
    path: info.outputPath("assisted-discovery-viewport.png"),
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await overview
    .getByRole("link", { name: "View weekly timetable", exact: true })
    .click();
  await expect(page.locator(".timetable-grid")).toBeVisible();
  const events = page.locator(".timetable-grid .calendar-event");
  await expect(events).toHaveCount(2);
  const first = await events.nth(0).boundingBox();
  const second = await events.nth(1).boundingBox();
  expect(Math.abs(first!.x - second!.x)).toBeGreaterThan(10);
  await expect(events.first()).toContainText("Time conflict");
  await page.screenshot({
    path: info.outputPath("assisted-timetable.png"),
    fullPage: true,
  });
  await page
    .locator(".timetable-scroll")
    .screenshot({ path: info.outputPath("assisted-week-grid.png") });
  if (info.project.name === "phone") {
    const grid = page.locator(".timetable-scroll");
    await grid.evaluate((el) => {
      el.scrollLeft = 500;
    });
    const ruler = await page.locator(".timetable-hours").boundingBox();
    const frame = await grid.boundingBox();
    expect(Math.abs(ruler!.x - frame!.x)).toBeLessThan(3);
    const corner = await page.locator(".timetable-corner").boundingBox();
    const monday = await page
      .locator(".timetable-day-heading")
      .first()
      .boundingBox();
    expect(Math.abs(corner!.x - frame!.x)).toBeLessThan(3);
    expect(monday!.x + monday!.width).toBeLessThan(frame!.x);
    await grid.screenshot({
      path: info.outputPath("assisted-week-scrolled.png"),
    });
  }
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
  await page.reload();
  await expect(page.locator(".timetable-grid .calendar-event")).toHaveCount(2);
  await page.getByRole("link", { name: "Add courses", exact: true }).click();
  await openOverview();
  await overview
    .getByRole("button", {
      name: "Remove from semester · DEMO-002",
      exact: true,
    })
    .click();
  await expect(overview).toContainText("6 ECTS");
  await expect(overview).not.toContainText("Ecology");
  await page.getByRole("button", { name: "All courses", exact: true }).click();
  await ecology
    .getByRole("button", { name: "Add to semester", exact: true })
    .click();
  await expect(overview).toContainText("15 ECTS");
  await expect(overview.locator(".selected-courses li")).toHaveCount(2);
  await page
    .getByLabel("Planning semester", { exact: true })
    .selectOption("SS-2027");
  await expect(page).toHaveURL(/term=SS-2027/);
  await expect(overview).toContainText("0 ECTS");
  await page
    .getByRole("button", { name: "Remove: Semester · SS-2027", exact: true })
    .click();
  await expect(page).toHaveURL(/scope=all/);
  await expect(page.locator(".discovery-semester")).toContainText(
    "Browsing the course catalogue. Academic contribution has not been established.",
  );
  await expect(algebra).toBeVisible();
});

// Published lesson fixtures represent this teaching week; keep assertions stable as time advances.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-22T12:00:00Z"));
});
