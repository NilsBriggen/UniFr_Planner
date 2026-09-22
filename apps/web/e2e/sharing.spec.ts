import {
  chooseManualSetup,
  configuredStudyPlan,
  openPlanTools,
} from "./studies-helpers";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { createPlan } from "../src/planner/domain";
import { plannerMessages } from "../src/planner/messages";
import { accountMessages } from "../src/accounts/messages";

test("the account creator can resume ownership in a fresh browser without sharing edit secrets", async ({
  page,
  browser,
}, info) => {
  const username = `share_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
  const password = "sharing test account password 123";
  const origin = new URL(info.project.use.baseURL!).origin;
  await page.goto("/settings");
  const identity = await page.evaluate(
    async ({ username, password }) => {
      const response = await fetch("/api/v1/account/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (response.status !== 201) throw new Error("Test registration failed");
      return response.json();
    },
    { username, password },
  );
  const snapshot = configuredStudyPlan("Account-owned share");
  const shared = await page.evaluate(async (snapshot) => {
    const response = await fetch("/api/v1/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot, ownerKey: "x".repeat(43) }),
    });
    if (response.status !== 201) throw new Error("Test share creation failed");
    return response.json();
  }, snapshot);
  const other = await browser.newContext({
    baseURL: origin,
    viewport: info.project.use.viewport,
  });
  await other.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  const owner = await other.newPage();
  try {
    await owner.goto(`/shared/${shared.id}`);
    await expect(
      owner.getByRole("heading", { name: "Account-owned share", exact: true }),
    ).toBeVisible();
    await expect(
      owner.getByRole("button", { name: "Edit original", exact: true }),
    ).toHaveCount(0);
    await owner.goto("/settings");
    await owner
      .getByLabel(accountMessages.en.username, { exact: true })
      .fill(username);
    await owner
      .getByLabel(accountMessages.en.password, { exact: true })
      .fill(password);
    await owner
      .getByRole("button", { name: accountMessages.en.submit, exact: true })
      .click();
    await expect(owner.getByText(username, { exact: true })).toBeVisible();
    await owner.goto(`/shared/${shared.id}`);
    await owner
      .getByRole("button", { name: "Edit original", exact: true })
      .click();
    await expect(owner.locator(".timetable-grid")).toBeVisible();
    await owner
      .getByLabel("Travel buffer (minutes)", { exact: true })
      .fill("25");
    await expect
      .poll(
        async () =>
          (
            await (
              await owner.request.get(`/api/v1/shares/${shared.id}`)
            ).json()
          ).snapshot.scenarios[0].travelMinutes,
      )
      .toBe(25);
    expect(
      (await (await owner.request.get(`/api/v1/shares/${shared.id}`)).json())
        .snapshot.degreeSelection,
    ).toEqual(snapshot.degreeSelection);
    await owner
      .getByRole("button", { name: "Share plan", exact: true })
      .click();
    owner.once("dialog", (dialog) => dialog.accept());
    await owner
      .getByRole("button", { name: "Stop sharing", exact: true })
      .click();
    await expect(
      owner.getByRole("button", { name: "Create share link", exact: true }),
    ).toBeVisible();
  } finally {
    expect(
      await page.evaluate(
        async ({ password, accountId }) => {
          return (
            await fetch("/api/v1/account", {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                "X-Unifr-Account": accountId,
              },
              body: JSON.stringify({ password }),
            })
          ).status;
        },
        { password, accountId: identity.accountId },
      ),
    ).toBe(204);
    await other.close();
  }
});

test("share owner updates automatically while another guest can only import a copy", async ({
  page,
  browser,
}, info) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  await page.goto("/setup");
  await chooseManualSetup(page);
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("Shared CS semester");
  await page
    .getByLabel("Programme", { exact: true })
    .fill("Computer Science + Business Informatics");
  await page.getByLabel("Study start · Year", { exact: true }).fill("2026");
  await page
    .getByRole("button", { name: "Start planning", exact: true })
    .click();
  await expect(page).toHaveURL(/catalogue/);
  await page.goto("/plan");
  await expect(
    page
      .getByRole("heading", { name: "Shared CS semester", exact: true })
      .first(),
  ).toBeVisible();
  await page.goto("/catalogue?term=AS-2026");
  const algebra = page
    .locator(".course-results > li")
    .filter({ has: page.getByRole("heading", { name: /Algebra/ }) });
  await algebra
    .getByRole("button", { name: "Add to semester", exact: true })
    .click();
  await algebra
    .getByRole("link", { name: "View weekly timetable", exact: true })
    .click();
  await page.getByRole("button", { name: "Share plan", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Create share link", exact: true })
    .click();
  const link = await page
    .getByLabel("Read-only share link", { exact: true })
    .inputValue();
  expect(link).toMatch(/\/shared\/[A-Za-z0-9_-]{43}$/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath("share-dialog.png") });
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const guest = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: info.project.use.viewport,
  });
  await guest.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  const recipient = await guest.newPage();
  try {
    await recipient.goto(link);
    await expect(
      recipient.getByRole("heading", {
        name: "Shared CS semester",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      recipient.getByRole("button", { name: "Edit original", exact: true }),
    ).toHaveCount(0);
    await expect(recipient.locator(".shared-course-list li")).toHaveCount(1);
    expect(
      (await new AxeBuilder({ page: recipient }).analyze()).violations,
    ).toEqual([]);
    await recipient.screenshot({
      path: info.outputPath("shared-plan.png"),
      fullPage: true,
    });
    const apiPath = new URL(link).pathname.replace(
      "/shared/",
      "/api/v1/shares/",
    );
    const publicPlan = await (await recipient.request.get(apiPath)).json();
    expect(publicPlan.canManage).toBe(false);
    expect(
      (
        await recipient.request.put(apiPath, {
          headers: { Origin: new URL(link).origin },
          data: {
            revision: publicPlan.revision,
            snapshot: publicPlan.snapshot,
          },
        })
      ).status(),
    ).toBe(403);
    await page.goto("/plan");
    await page
      .getByRole("button", { name: "Pin course · DEMO-001", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await recipient.request.get(apiPath)).json()).snapshot
            .scenarios[0].courses[0].pinned,
      )
      .toBe(true);
    await recipient.reload();
    await recipient
      .getByRole("button", { name: "Import as my plan", exact: true })
      .click();
    await expect(
      recipient.locator(".timetable-grid .calendar-event"),
    ).toHaveCount(1);
    await recipient.goto("/plan");
    await recipient
      .getByRole("button", { name: "Unpin course · DEMO-001", exact: true })
      .click();
    expect(
      (await (await recipient.request.get(apiPath)).json()).snapshot
        .scenarios[0].courses[0].pinned,
    ).toBe(true);
    // Simulate losing network after a local save, then retry without losing that save.
    await page.route("**/api/v1/shares/*", (route) => route.abort());
    await page
      .getByRole("button", { name: "Unpin course · DEMO-001", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "share link could not update" }),
    ).toBeVisible();
    await page.unroute("**/api/v1/shares/*");
    await page.getByRole("button", { name: "Share plan", exact: true }).click();
    await page
      .getByRole("button", { name: "Retry update", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await recipient.request.get(apiPath)).json()).snapshot
            .scenarios[0].courses[0].pinned,
      )
      .toBe(false);
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Stop sharing", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Create share link", exact: true }),
    ).toBeVisible();
    await recipient.goto(link);
    await expect(recipient.getByRole("alert")).toContainText("unavailable");
  } finally {
    await guest.close();
  }
});

test("the selected week downloads as an editable workbook and a complete landscape printout", async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  await page.goto("/setup");
  await chooseManualSetup(page);
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("My weekly printout");
  await page.getByLabel("Programme", { exact: true }).fill("Computer Science");
  await page.getByLabel("Study start · Year", { exact: true }).fill("2026");
  await page
    .getByRole("button", { name: "Start planning", exact: true })
    .click();
  await expect(page).toHaveURL(/catalogue/);
  await page.goto("/plan");
  await expect(
    page
      .getByRole("heading", { name: "My weekly printout", exact: true })
      .first(),
  ).toBeVisible();
  await page.goto("/catalogue/DEMO-001?term=AS-2026");
  await page
    .getByRole("button", { name: "Add to semester", exact: true })
    .click();
  await page
    .getByRole("link", { name: "View weekly timetable", exact: true })
    .click();
  await page
    .getByLabel(plannerMessages.en.date, { exact: true })
    .fill("2026-09-21");
  await page.locator(".calendar-exports > summary").click();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download Excel", exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("unifr-AS-2026-2026-09-21.xlsx");
  await download.saveAs(info.outputPath("weekly-plan.xlsx"));
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    new Uint8Array(await readFile(info.outputPath("weekly-plan.xlsx"))).buffer,
  );
  expect(workbook.getWorksheet("Lesson list")!.getCell("D4").value).toBe(
    "Algebra",
  );
  const popupEvent = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Print week / save PDF", exact: true })
    .click();
  const popup = await popupEvent;
  await expect(
    popup.getByRole("heading", { name: "My weekly printout" }),
  ).toBeVisible();
  await expect(popup.locator(".lesson-list")).toContainText("Algebra");
  await popup.emulateMedia({ media: "print" });
  await popup.pdf({
    path: info.outputPath("weekly-print.pdf"),
    preferCSSPageSize: true,
    printBackground: true,
  });
  await popup.screenshot({
    path: info.outputPath("weekly-print.png"),
    fullPage: true,
  });
  await popup.close();
});

test("a continuing student's shared plan opens and imports the planning semester with earned credits intact", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  await page.goto("/");
  const snapshot = createPlan({
    id: "continuing-share",
    scenarioId: "main",
    name: "Continuing student share",
    programme: "CS",
    startTerm: "AS-2024",
    planningSemester: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
  snapshot.scenarios[0].courses.push({
    id: "earned",
    code: "MANUAL-test-earned",
    titles: { en: "Earlier completed course" },
    ects: 5,
    semester: "AS-2024",
    status: "completed",
    pinned: false,
    offering: null,
  });
  const ownerKey = (
    crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "")
  ).slice(0, 43);
  const shared = await page.evaluate(
    async ({ snapshot, ownerKey }) => {
      const response = await fetch("/api/v1/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot, ownerKey }),
      });
      if (response.status !== 201) throw new Error("Test share failed");
      return response.json();
    },
    { snapshot, ownerKey },
  );
  try {
    await page.goto(`/shared/${shared.id}`);
    await expect(
      page.getByRole("combobox", { name: "Semester", exact: true }),
    ).toHaveValue("AS-2026");
    await expect(page.locator(".shared-course-list li")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Import as my plan", exact: true })
      .click();
    await expect(page).toHaveURL(/\/semester\/AS-2026$/);
    await page.goto("/plan");
    const completed = page.getByRole("group", {
      name: "Completed",
      exact: true,
    });
    await completed.locator(":scope > summary").click();
    await expect(completed).toContainText("Earlier completed course");
    await openPlanTools(page);
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: plannerMessages.en.exportJson, exact: true })
      .click();
    const copy = JSON.parse(
      await readFile((await (await download).path())!, "utf8"),
    );
    expect(copy.planningSemester).toBe("AS-2026");
    expect(copy.semesters[0]).toBe("AS-2024");
    expect(copy.scenarios[0].courses[0].ects).toBe(5);
  } finally {
    await page.evaluate(
      async ({ id, ownerKey }) => {
        const response = await fetch(`/api/v1/shares/${id}`, {
          method: "DELETE",
          headers: { "X-Unifr-Share-Key": ownerKey },
        });
        if (response.status !== 204)
          throw new Error("Test share cleanup failed");
      },
      { id: shared.id, ownerKey },
    );
  }
});

// Published lesson fixtures represent this teaching week; keep assertions stable as time advances.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-22T12:00:00Z"));
});
