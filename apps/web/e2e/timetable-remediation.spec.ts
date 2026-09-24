import { expect, test } from "@playwright/test";
import { createPlan } from "../src/planner/domain";
import { openPlanJson } from "./studies-helpers";
test("personal attendance, later weekday navigation and explicit semester print scope", async ({
  page,
  isMobile,
}, info) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  const plan = createPlan({
    id: "attendance-plan",
    scenarioId: "s",
    name: "Attendance review",
    programme: "Law",
    startTerm: "AS-2026",
    planningSemester: "AS-2026",
    semesterCount: 2,
    targetEcts: 180,
  });
  const meeting = (note: string, date: string, room: string) => ({
    starts_at: `${date}T15:15:00Z`,
    ends_at: `${date}T18:00:00Z`,
    note,
    location: room,
    unresolved: false,
    cancelled: false,
    excluded_dates: [],
    additional_dates: [],
  });
  plan.scenarios[0].courses = [
    {
      id: "law",
      code: "LAW",
      titles: {
        en: "A very long European law course title with institutions and judicial protection",
      },
      ects: 12,
      status: "planned",
      semester: "AS-2026",
      pinned: false,
      offering: {
        source_id: "s",
        terms: ["AS-2026"],
        meetings: [
          meeting("Cours", "2026-09-21", "A"),
          meeting("Exercice", "2026-09-21", "B"),
          meeting("Cours", "2026-09-25", "C"),
        ],
        meeting_state: "resolved",
        source_url: "https://www.unifr.ch",
        snapshot_id: "fixture",
        development_fixture: true,
      },
    },
  ];
  await page.goto("/plan");
  await openPlanJson(page, "en");
  await page
    .getByLabel("Plan JSON", { exact: true })
    .fill(JSON.stringify(plan));
  await page
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add as new plan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Attendance review", exact: true }),
  ).toBeVisible();
  await page.goto("/semester/AS-2026");
  await expect(page.locator(".timetable-event")).toHaveCount(3);
  const friday = page
    .locator(".week-day-overview")
    .getByRole("button", { name: "Fri · 1" });
  if (isMobile) await friday.tap();
  else {
    await friday.focus();
    await page.keyboard.press("Enter");
  }
  await expect(page.locator(".screen-calendar")).toContainText(
    "A very long European law course title with institutions and judicial protection",
  );
  await expect(page.locator(".screen-calendar")).toContainText("8:00 PM");
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByText("Choose personal attendance", { exact: true }).click();
  await page.getByRole("checkbox", { name: /Exercice/ }).click();
  await expect(page.locator(".timetable-event")).toHaveCount(2);
  await expect(page.getByText(/Personal attendance assumption/)).toBeVisible();
  await page.reload();
  await expect(page.locator(".timetable-event")).toHaveCount(2);
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", {
      name: "Semester agenda · all published dates · A4 portrait",
      exact: true,
    })
    .click();
  const popup = await popupPromise;
  await expect(popup.locator("body")).toContainText("Sep 25, 2026");
  await expect(popup.locator("body")).toContainText(
    "Personal attendance assumption",
  );
  await expect(popup.locator("body")).not.toContainText("Check catalogue");
  await popup.pdf({
    path: info.outputPath("semester-agenda.pdf"),
    preferCSSPageSize: true,
  });
  await popup.close();
  await page.screenshot({
    path: info.outputPath("calendar.png"),
    fullPage: true,
  });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/plan");
  const column = page.locator(".planning-semester");
  await expect(column).toBeVisible();
  const size = await column.boundingBox();
  const boardSize = await page.locator(".semester-board").boundingBox();
  expect(size!.width).toBeGreaterThan(boardSize!.width * 0.98);
  await page
    .getByRole("button", { name: "Add next semester", exact: true })
    .click();
  await expect(
    page.locator(".planning-term-control select option"),
  ).toHaveCount(3);
});
