import { expect, test } from "@playwright/test";
import { configuredStudyPlan, importStudyPlan } from "./studies-helpers";

test("plan and timetable put study content before compact exports", async ({
  page,
}, info) => {
  await page.clock.setFixedTime(new Date("2026-09-22T12:00:00Z"));
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  await importStudyPlan(page, configuredStudyPlan());
  await page.goto("/catalogue/DEMO-001?term=AS-2026");
  await page
    .getByRole("button", { name: "Add to semester", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove from semester", exact: true }),
  ).toBeVisible();
  await page.goto("/plan");
  const exports = page.locator("details.plan-exports");
  await expect(exports).toBeVisible();
  await expect(exports).not.toHaveAttribute("open");
  const summary = page.locator(".plan-summary");
  const semester = page.locator(".planning-semester > summary");
  await expect(semester).toContainText("1 course");
  await expect(semester).not.toContainText("1 courses");
  expect((await summary.boundingBox())!.y).toBeLessThan(
    (await exports.boundingBox())!.y,
  );
  expect((await semester.boundingBox())!.y).toBeLessThan(
    (await exports.boundingBox())!.y,
  );
  await page.screenshot({
    path: info.outputPath("degree-plan.png"),
    fullPage: true,
  });
  await exports.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(exports).toHaveAttribute("open", "");
  await expect(exports.getByRole("button")).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("degree-exports.png"),
    fullPage: true,
  });
  const rosterEvent = page.waitForEvent("popup");
  await exports.getByRole("button").first().click();
  const roster = await rosterEvent;
  await expect(roster.locator("body")).toContainText("DEMO-001");
  await expect(roster.locator("body")).toContainText("AS-2026");
  await roster.close();

  if (info.project.name === "desktop")
    await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/semester/AS-2026");
  const downloads = page.locator("details.calendar-exports");
  await expect(downloads).not.toHaveAttribute("open");
  await expect(page.locator(".semester-overview-stats")).toContainText(
    "1 course selected",
  );
  const firstLesson = page.locator(".calendar-week .calendar-event").first();
  await expect(firstLesson).toBeVisible();
  if (info.project.name === "desktop")
    expect((await firstLesson.boundingBox())!.y).toBeLessThan(768);
  expect((await firstLesson.boundingBox())!.y).toBeLessThan(
    (await downloads.boundingBox())!.y,
  );
  await expect(
    page
      .locator(".workspace-heading")
      .getByRole("button", { name: "Print week / save PDF", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("weekly-timetable.png"),
    fullPage: true,
  });
  const printEvent = page.waitForEvent("popup");
  await page
    .locator(".workspace-heading")
    .getByRole("button", { name: "Print week / save PDF", exact: true })
    .click();
  const print = await printEvent;
  await expect(print.locator(".week-key")).toContainText("Algebra");
  await expect(print.locator(".tools")).toContainText("Landscape A4");
  expect((await print.locator(".tools").innerText()).match(/A4/g)).toHaveLength(
    1,
  );
  await print.close();
  await page.locator(".segmented").getByRole("button", { name: "Day" }).click();
  await expect(
    page
      .locator(".workspace-heading")
      .getByRole("button", { name: "Print week / save PDF", exact: true }),
  ).toBeVisible();
  await downloads.locator(":scope > summary").click();
  for (const name of [
    "Download Excel",
    "Print week / save PDF",
    "Export semester ICS",
  ]) {
    await expect(
      downloads.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  }
  await expect(
    downloads.getByRole("button", { name: /Semester agenda/ }),
  ).toBeVisible();
  await expect(
    downloads.getByRole("button", { name: /Course \/ ECTS list/ }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("timetable-exports.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
