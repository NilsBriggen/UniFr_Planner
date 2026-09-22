import { chooseManualSetup } from "./studies-helpers";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("a student adds courses from a semester and opens the saved weekly timetable", async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  await page.goto("/");
  await page.getByRole("link", { name: "Start planning", exact: true }).click();
  await chooseManualSetup(page);
  await page.getByLabel("Plan name", { exact: true }).fill("My CS semester");
  await page.getByLabel("Programme", { exact: true }).fill("Computer Science");
  await page.getByLabel("Entry year", { exact: true }).fill("2026");
  await page.getByRole("button", { name: "Create local plan" }).click();
  await expect(page).toHaveURL(/catalogue\?term=AS-2026$/);
  await page.goto("/plan");
  const semester = page.getByRole("region", { name: "AS-2026", exact: true });
  await semester
    .getByRole("link", { name: "Add courses", exact: true })
    .click();
  await expect(page).toHaveURL(/catalogue\?term=AS-2026$/);
  const algebra = page
    .locator(".course-results > li")
    .filter({ has: page.getByRole("heading", { name: /Algebra/ }) });
  await expect(algebra.getByLabel("Semester", { exact: true })).toHaveValue(
    "AS-2026",
  );
  await algebra
    .getByRole("button", { name: "Add to plan", exact: true })
    .click();
  await expect(algebra.getByRole("status")).toContainText("AS-2026");
  await algebra
    .getByRole("link", { name: "View weekly timetable", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Week", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(".calendar-week").getByText("Algebra", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".calendar-week")).toContainText("Monday");
  await page.reload();
  await expect(
    page.locator(".calendar-week").getByText("Algebra", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Semester", { exact: true })).toHaveValue(
    "AS-2026",
  );
  await page.screenshot({
    path: info.outputPath("weekly-timetable.png"),
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByLabel("Semester", { exact: true }).selectOption("SS-2027");
  await expect(page).toHaveURL(/semester\/SS-2027$/);
  await expect(page.locator(".calendar-week .calendar-event")).toHaveCount(0);
  await expect(
    page.getByText("No conflicts in known dated meetings.", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Degree plan", exact: true })
    .click();
  await expect(semester.getByText("Algebra", { exact: true })).toBeVisible();
  await expect(semester).toContainText("6 ECTS");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("degree-plan.png"),
    fullPage: true,
  });
});

test("starting from a course returns to that course after creating a plan", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  await page.goto("/catalogue/DEMO-001?term=AS-2026");
  await page
    .getByRole("link", {
      name: "Create a plan to add this course",
      exact: true,
    })
    .click();
  await chooseManualSetup(page);
  await page.getByLabel("Plan name", { exact: true }).fill("From a course");
  await page.getByLabel("Programme", { exact: true }).fill("Computer Science");
  await page.getByLabel("Entry year", { exact: true }).fill("2026");
  await page.getByRole("button", { name: "Create local plan" }).click();
  await expect(page).toHaveURL(/catalogue\/DEMO-001\?term=AS-2026$/);
  await page.getByRole("button", { name: "Add to plan", exact: true }).click();
  await page
    .getByRole("link", { name: "View weekly timetable", exact: true })
    .click();
  await expect(
    page.locator(".calendar-week").getByText("Algebra", { exact: true }),
  ).toBeVisible();
});
