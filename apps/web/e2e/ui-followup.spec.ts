import { expect, test, type Page } from "@playwright/test";
import { createPlan, fromOffering, type Plan } from "../src/planner/domain";
import {
  publishedCourses,
  publishedStatus,
} from "../src/planner/published-fixture";
import { attendanceChoice } from "../src/planner/attendance";

async function seed(page: Page, plans: Plan[], activeId: string) {
  await page.goto("/");
  await page.evaluate(
    async ({ plans, activeId }) => {
      const request = indexedDB.open("unifr-planner", 3);
      await new Promise<void>((resolve, reject) => {
        request.onupgradeneeded = () => {
          const db = request.result;
          for (const name of ["plans", "preferences", "revisions"])
            if (!db.objectStoreNames.contains(name))
              db.createObjectStore(
                name,
                name === "plans" ? { keyPath: "id" } : undefined,
              );
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
      const db = request.result,
        tx = db.transaction(["plans", "preferences"], "readwrite");
      for (const plan of plans) tx.objectStore("plans").put(plan);
      tx.objectStore("preferences").put(activeId, "activeId");
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { plans, activeId },
  );
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
});
test("catalogue header switches restore each plan context and keep explicit links", async ({
  page,
}) => {
  const plans = ["A", "B", "C"].map((id) =>
    createPlan({
      id,
      scenarioId: id + "-s",
      name: id,
      programme: id,
      startTerm: "AS-2026",
      semesterCount: 4,
      targetEcts: 180,
    }),
  );
  await page.route("**/api/v1/**", async (route) => {
    const data = route.request().url().includes("/terms")
      ? {
          status: publishedStatus,
          terms: ["AS-2026", "SS-2027"],
          faculties: ["Psychology", "Biology"],
          languages: ["en", "de", "fr"],
          levels: [],
        }
      : { status: publishedStatus, items: [], total: 0, offset: 0, limit: 20 };
    await route.fulfill({ json: data });
  });
  await seed(page, plans, "A");
  const a = "term=AS-2026&faculty=Psychology&language=fr&focus=all",
    b = "term=SS-2027&faculty=Biology&language=de";
  await page.evaluate(
    (b) => sessionStorage.setItem("unifr.catalogueContext:B:B-s", b),
    b,
  );
  await page.goto("/catalogue?" + a);
  await expect(page.locator(".filter-chips")).toContainText("Psychology");
  await page.getByLabel("Current plan").selectOption("B");
  await expect(page).toHaveURL("/catalogue?" + b);
  await expect(page.locator(".filter-chips")).toContainText("Biology");
  await expect(page.locator(".filter-chips")).toContainText("de");
  await page.getByLabel("Current plan").selectOption("A");
  await expect(page).toHaveURL("/catalogue?" + a);
  await expect(page.locator(".filter-chips")).toContainText("Psychology");
  await page.getByLabel("Current plan").selectOption("C");
  await expect(page).toHaveURL("/catalogue?term=AS-2026");
  await page.goto("/catalogue?term=SS-2027&faculty=Biology&language=en");
  await expect(page.locator(".filter-chips")).toContainText("Biology");
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("unifr.catalogueContext:B:B-s"),
    ),
  ).toBe(b);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("unifr.catalogueContext:A:A-s"),
    ),
  ).toBe(a);
});
test("setup Back and Review retain the edited name and part-time horizon after reload", async ({
  page,
}) => {
  await page.goto("/setup");
  await page
    .getByLabel("Main programme", { exact: true })
    .selectOption("bachelor-ius-law");
  await page.getByLabel("Degree structure").selectOption("ba-180");
  await page.getByRole("button", { name: "Review and start" }).click();
  await page.getByText("Optional settings", { exact: true }).click();
  await page.getByLabel("Plan name", { exact: true }).fill("My part-time law");
  await page.getByLabel("Number of semesters").fill("12");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Review and start" }).click();
  const options = page.locator("details.setup-options");
  if ((await options.getAttribute("open")) === null)
    await options.locator("summary").click();
  await expect(page.getByLabel("Plan name", { exact: true })).toHaveValue(
    "My part-time law",
  );
  await expect(page.getByLabel("Number of semesters")).toHaveValue("12");
  await page
    .getByRole("button", { name: "Start planning", exact: true })
    .click();
  await expect(page).toHaveURL(/\/catalogue\?/);
  await page.reload();
  await expect(page.getByLabel("Current plan")).toContainText(
    "My part-time law",
  );
  expect(
    await page.evaluate(async () => {
      const request = indexedDB.open("unifr-planner", 3);
      const db = await new Promise<IDBDatabase>((resolve) => {
        request.onsuccess = () => resolve(request.result);
      });
      const read = db.transaction("plans").objectStore("plans").getAll();
      const plans = await new Promise<Plan[]>((resolve) => {
        read.onsuccess = () => resolve(read.result);
      });
      db.close();
      return plans[0].semesters.length;
    }),
  ).toBe(12);
});
test("spring recurrence leads preview and changed attendance is visible with the editor closed", async ({
  page,
}, info) => {
  const c = publishedCourses()[0],
    o = c.offerings[0];
  o.terms = ["AS-2026", "SS-2027"];
  c.offerings = [o];
  o.meetings = [
    {
      ...o.meetings[0],
      starts_at: "2026-09-21T08:00:00Z",
      ends_at: "2026-09-21T09:00:00Z",
      recurrence: "FREQ=WEEKLY;COUNT=30",
    },
  ];
  await page.route("**/api/v1/**", async (route) =>
    route.fulfill({
      json: route.request().url().includes("/status/catalogue")
        ? publishedStatus
        : route.request().url().includes("/courses/")
          ? c
          : {
              status: publishedStatus,
              items: [c],
              total: 1,
              offset: 0,
              limit: 20,
            },
    }),
  );
  const plan = createPlan({
    id: "p",
    scenarioId: "s",
    name: "Attendance plan",
    programme: "Law",
    startTerm: "AS-2026",
    semesterCount: 4,
    targetEcts: 180,
  });
  o.meetings.push({ ...o.meetings[0], location: "Other room" });
  const saved = fromOffering(o, "c", "snapshot", false);
  saved.semester = "AS-2026";
  saved.status = "planned";
  saved.attendance = attendanceChoice(saved, [1]);
  saved.offering!.meetings[1].location = "Changed room";
  plan.scenarios[0].courses = [saved];
  await seed(page, [plan], plan.id);
  await page.goto("/catalogue/" + c.code + "?term=SS-2027");
  await page
    .getByRole("button", { name: "View published meeting dates", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".meeting-list time").first()).toHaveAttribute(
    "datetime",
    "2027-02-01T09:00:00Z",
  );
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByText("Other published terms", { exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    dialog.locator('time[datetime="2026-09-21T08:00:00Z"]').first(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("spring-published-dates.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "View published meeting dates",
      exact: true,
    }),
  ).toBeFocused();
  await page.goto("/semester/AS-2026");
  const warning = page
    .getByRole("alert")
    .filter({ hasText: "Published sessions changed" });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Programming");
  await expect(page.locator(".attendance-controls")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.screenshot({
    path: info.outputPath("stale-attendance-closed.png"),
    fullPage: true,
  });
});
