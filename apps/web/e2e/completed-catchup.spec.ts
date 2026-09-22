import { chooseManualSetup } from "./studies-helpers";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("2024 study start plans 2026 and records historical plus manual completion durably", async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  await page.goto("/setup");
  await chooseManualSetup(page, "en");
  await page.getByLabel("Plan name", { exact: true }).fill("Continuing degree");
  await page.getByLabel("Programme", { exact: true }).fill("Computer Science");
  await page
    .getByLabel("Study start · Season", { exact: true })
    .selectOption("AS");
  await page.getByLabel("Study start · Year", { exact: true }).fill("2024");
  await page
    .getByLabel("Planning semester · Season", { exact: true })
    .selectOption("AS");
  await page
    .getByLabel("Planning semester · Year", { exact: true })
    .fill("2026");
  await page.getByRole("button", { name: "Start planning" }).click();
  await expect(page).toHaveURL(/\/plan\/completed/);
  const archive = page.getByRole("region", {
    name: "Search archived courses",
    exact: true,
  });
  await expect(archive.getByLabel("Semester", { exact: true })).toHaveValue(
    "AS-2024",
  );
  await archive
    .getByRole("checkbox", { name: /Historical programming/ })
    .check();
  await archive
    .getByRole("checkbox", { name: /Historical mathematics/ })
    .check();
  await page.getByRole("button", { name: "Review selected courses" }).click();
  await expect(
    page.getByRole("region", { name: "Review selected courses" }),
  ).toContainText("Earned ECTS: 11 ECTS");
  await page.getByRole("button", { name: "Save completed courses" }).click();
  const recorded = page.getByRole("region", {
    name: "Recorded completed courses",
  });
  await expect(
    recorded.getByRole("heading", { name: "Historical programming" }),
  ).toBeVisible();
  await page
    .getByLabel("Course title", { exact: true })
    .fill("Earlier language course");
  await page.getByLabel("Completed ECTS", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Add completed course" }).click();
  await expect(recorded).toContainText("Earned ECTS: 14 ECTS");
  await expect(recorded).toContainText("No course code");
  await expect(recorded).toContainText("Earlier / not specified");
  await page.reload();
  await expect(recorded).toContainText("Earned ECTS: 14 ECTS");
  await expect(
    archive.getByRole("checkbox", { name: /Historical programming/ }),
  ).toBeDisabled();
  await page.screenshot({
    path: info.outputPath("completed-course-catchup.png"),
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("link", { name: "Done", exact: true }).click();
  await expect(page).toHaveURL(/catalogue\?term=AS-2026$/);
  await page.goto("/plan");
  await expect(
    page.getByLabel("Planning semester", { exact: true }),
  ).toHaveValue("AS-2026");
  await expect(page.locator(".planning-semester")).toHaveAttribute(
    "aria-label",
    "Autumn 2026",
  );
  const completed = page.locator(
    'details.semester-column[aria-label="Completed"]',
  );
  await completed.locator("summary").click();
  await expect(completed).toContainText("Autumn 2024");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Timetable", exact: true })
    .click();
  await expect(page).toHaveURL(/\/semester\/AS-2026$/);
  await expect(page.locator(".calendar-week .calendar-event")).toHaveCount(0);
  await expect(page.locator(".semester-overview-stats")).toContainText(
    "0 ECTS",
  );
});

test("manual entry works when historical archive requests fail", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  await page.route("**/api/v1/catalogue/**", (route) => route.abort());
  await page.goto("/setup");
  await chooseManualSetup(page, "en");
  await page.getByLabel("Plan name", { exact: true }).fill("Offline archive");
  await page.getByLabel("Programme", { exact: true }).fill("CS");
  await page.getByLabel("Study start · Year", { exact: true }).fill("2024");
  await page
    .getByLabel("Planning semester · Year", { exact: true })
    .fill("2026");
  await page.getByRole("button", { name: "Start planning" }).click();
  await expect(
    page.getByText(
      "The archive could not be loaded. Manual entry remains available.",
    ),
  ).toBeVisible();
  await page
    .getByLabel("Course title", { exact: true })
    .fill("Offline completed course");
  await page.getByLabel("Completed ECTS", { exact: true }).fill("4");
  await page.getByRole("button", { name: "Add completed course" }).click();
  await expect(
    page.getByRole("region", { name: "Recorded completed courses" }),
  ).toContainText("Earned ECTS: 4 ECTS");
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Recorded completed courses" }),
  ).toContainText("Earned ECTS: 4 ECTS");
});
