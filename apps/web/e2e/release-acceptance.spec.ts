import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { accountMessages } from "../src/accounts/messages";
import { plannerMessages } from "../src/planner/messages";
import { recipeMessages } from "../src/requirements/recipeMessages";
import { requirementMessages } from "../src/requirements/messages";
import { suggestionMessages } from "../src/suggestions/messages";
import { activeScenario, type Plan } from "../src/planner/domain";
import { evaluatePlanRequirements } from "../src/requirements/adapter";
import type { CoursePage } from "../src/api/client";

// One connected scenario against either config. Only the source-boundary
// alternative and overnight responses are simulated, never a suggestion or plan
// mutation. Programme packs, rendered UI, persistence and account APIs are real.
const p = plannerMessages.en,
  r = requirementMessages.en;
const a = accountMessages.en,
  s = suggestionMessages.en;
const term = "AS-2026";

async function exportPlan(page: Page): Promise<Plan> {
  // Navigating during IndexedDB's pending transaction can abort that save.
  if (new URL(page.url()).pathname !== "/settings")
    await expect(page.locator(".save-status")).toHaveText(p.saved);
  await page.goto("/plan");
  await expect(page.locator(".save-status")).toHaveText(p.saved);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: p.exportJson, exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, "utf8"));
}

async function createStudentPlan(page: Page) {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  await page.goto("/setup");
  await page
    .getByLabel(p.planName, { exact: true })
    .fill("Release acceptance student");
  await page
    .getByLabel(p.programme, { exact: true })
    .fill("CS + Business Informatics");
  await page.getByLabel(`${p.startTerm} · Year`, { exact: true }).fill("2026");
  await page.getByRole("button", { name: p.create, exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Release acceptance student",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/requirements");
  await page.getByText(recipeMessages.en.legacy, { exact: true }).click();
  await page.getByLabel(r.cohort, { exact: true }).selectOption("2026");
  for (const code of ["CS-120", "BI-CS-60"]) {
    await page
      .getByLabel(r.programme, { exact: true })
      .selectOption(`${code}@2026.1`);
    await page.getByRole("button", { name: r.add, exact: true }).click();
    await expect(page.locator(".save-status")).toHaveText(p.saved);
  }
  await page.goto("/plan");
  for (const [code, title, credits] of [
    ["SIN.01023", "Introduction to programming", "6"],
    ["SIN.01021", "Networks", "5"],
  ]) {
    await page.getByLabel(p.courseCode, { exact: true }).fill(code);
    await page.getByLabel(p.courseTitle, { exact: true }).fill(title);
    await page.getByLabel(p.completedEcts, { exact: true }).fill(credits);
    await page
      .getByRole("button", { name: p.addCompleted, exact: true })
      .click();
    await expect(
      page.getByRole("article", { name: `${code} · ${title}`, exact: true }),
    ).toBeVisible();
  }
  for (const code of ["DEMO-001", "DEMO-005"]) {
    await page.goto(`/catalogue/${code}`);
    await page.getByRole("button", { name: p.add, exact: true }).click();
    await expect(
      page.getByRole("button", { name: p.added, exact: true }),
    ).toBeDisabled();
    await page.goto("/plan");
    await page
      .getByLabel(`${p.semester} · ${code}`, { exact: true })
      .selectOption(term);
    await expect(page.locator(".save-status")).toHaveText(p.saved);
  }
  await page
    .getByRole("button", { name: `${p.pin} · DEMO-001`, exact: true })
    .click();
  await expect(
    page.getByLabel(`${p.semester} · DEMO-001`, { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: `${p.unpin} · DEMO-001`, exact: true }),
  ).toBeVisible();
  return exportPlan(page);
}

async function assertStudentProgress(page: Page, plan: Plan) {
  expect(plan.requirements).toEqual({
    cohort: 2026,
    templates: [
      { code: "CS-120", version: "2026.1" },
      { code: "BI-CS-60", version: "2026.1" },
    ],
  });
  expect(
    activeScenario(plan)
      .courses.filter((c) => c.status === "completed")
      .map((c) => [c.code, c.ects]),
  ).toEqual([
    ["SIN.01023", 6],
    ["SIN.01021", 5],
  ]);
  const progress = evaluatePlanRequirements(plan)!;
  expect(progress.earned).toBe(11);
  // CS validation packages total 123 despite the advertised 120; the unresolved
  // 123 + 60 requirement tree must remain visible, not be flattened to 180.
  expect(progress.remainingToEarn).toBe(172);
  await page.goto("/requirements");
  const summary = page.locator(".requirement-progress").first();
  await expect(
    summary
      .locator("div")
      .filter({ has: page.getByText(r.earned, { exact: true }) }),
  ).toHaveText(`${r.earned}11 ECTS`);
  await expect(
    summary
      .locator("div")
      .filter({ has: page.getByText(r.toEarn, { exact: true }) }),
  ).toHaveText(`${r.toEarn}172 ECTS`);
  // Tentative BI applicability must not be presented as an approved regulation.
  await expect(page.locator(".requirement-status").first()).toHaveText(
    r.needs_clarification,
  );
}

async function assertWeek(page: Page, starts: string[], conflicts: number) {
  await page.goto(`/semester/${term}`);
  await expect(page.locator(".calendar-check li")).toHaveCount(conflicts);
  if (conflicts)
    await expect(page.locator(".calendar-check li")).toContainText(p.hard);
  else await expect(page.getByText(p.clear, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: p.week, exact: true }).click();
  await expect(page.locator(".calendar-week .calendar-event")).toHaveCount(
    starts.length,
  );
  expect(
    await page
      .locator(".calendar-week .calendar-event time:first-of-type")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("datetime")),
      ),
  ).toEqual(starts);
}

test("connected release: CS/BI credits, conflict, pinned alternative, weekly progress, overnight flag and account sync", async ({
  page,
  browser,
  baseURL,
}, info) => {
  test.setTimeout(90_000);
  const original = await createStudentPlan(page);
  await assertStudentProgress(page, original);
  const originalCourses = activeScenario(original).courses;
  const pinned = originalCourses.find((c) => c.code === "DEMO-001")!;
  const movable = originalCourses.find((c) => c.code === "DEMO-005")!;
  expect(pinned.pinned).toBe(true);
  expect(pinned.offering?.source_id).toBe("990001");
  expect(movable.offering?.source_id).toBe("990005");
  const first = pinned.offering!.meetings[0],
    second = movable.offering!.meetings[0];
  // Independently establish overlap without calling the detector under test.
  expect(Date.parse(first.starts_at!)).toBeLessThan(
    Date.parse(second.ends_at!),
  );
  expect(Date.parse(second.starts_at!)).toBeLessThan(
    Date.parse(first.ends_at!),
  );
  await assertWeek(page, ["2026-09-21T10:00:00Z", "2026-09-21T10:00:00Z"], 1);
  await page.screenshot({
    path: info.outputPath("connected-before.png"),
    fullPage: true,
  });

  const response = await page.request.get(
    "/api/v1/catalogue/courses?offset=0&limit=100",
  );
  expect(response.status()).toBe(200);
  const published: CoursePage = await response.json();
  const candidateCourse = published.items.find(
    (course) => course.code === "DEMO-005",
  )!;
  expect(candidateCourse).toBeDefined();
  const alternative = structuredClone(candidateCourse.offerings[0]);
  alternative.source_id = "990105";
  alternative.prerequisites = "None";
  alternative.source_url =
    "https://www.unifr.ch/timetable/en/course.html?show=990105";
  alternative.meetings[0].starts_at = "2026-09-21T12:00:00Z";
  alternative.meetings[0].ends_at = "2026-09-21T13:00:00Z";
  candidateCourse.offerings.push(alternative);
  let overnight = false;
  await page.route("**/api/v1/catalogue/courses?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("offset") !== "0") return route.continue();
    const next = structuredClone(published);
    if (overnight) {
      next.status.snapshot_id = "release-overnight-fixture";
      const changed = next.items.find((course) => course.code === "DEMO-001")!
        .offerings[0];
      changed.meetings[0].starts_at = "2026-09-21T13:00:00Z";
      changed.meetings[0].ends_at = "2026-09-21T14:00:00Z";
    }
    await route.fulfill({ json: next });
  });
  await page.goto("/suggestions");
  const choices = page.getByRole("list", { name: s.nav, exact: true });
  await expect(choices).toBeVisible();
  await choices.getByRole("button").first().click();
  const comparison = page.getByRole("region", { name: s.comparison });
  await expect(comparison).toContainText("990105");
  await expect(
    comparison.getByRole("heading", { name: s.why, exact: true }),
  ).toBeVisible();
  await expect(comparison.locator(".suggestion-conflicts")).toContainText(
    "1 → 0",
  );
  await comparison
    .getByRole("checkbox", { name: s.confirm, exact: true })
    .check();
  await comparison.getByRole("button", { name: s.apply, exact: true }).click();
  await expect(page.getByText(s.applied, { exact: true })).toBeVisible();
  const applied = await exportPlan(page);
  expect(
    activeScenario(applied).courses.find((c) => c.id === pinned.id),
  ).toEqual(pinned);
  const replaced = activeScenario(applied).courses.find(
    (c) => c.id === movable.id,
  )!;
  expect(replaced.offering?.source_id).toBe("990105");
  expect(replaced.code).toBe(movable.code);
  expect(replaced.ects).toBe(movable.ects);
  expect(
    Date.parse(replaced.offering!.meetings[0].starts_at!),
  ).toBeGreaterThanOrEqual(Date.parse(first.ends_at!));
  await assertStudentProgress(page, applied);
  await assertWeek(page, ["2026-09-21T10:00:00Z", "2026-09-21T12:00:00Z"], 0);
  await page.screenshot({
    path: info.outputPath("connected-compatible-week.png"),
    fullPage: true,
  });

  await page.goto("/plan");
  const changes = page.getByRole("region", {
    name: "Published catalogue changes affect this plan",
    exact: true,
  });
  await expect(changes).toHaveCount(0);
  overnight = true;
  const changedResponse = page.waitForResponse(
    async (res) =>
      res.url().includes("/api/v1/catalogue/courses?") &&
      res.request().method() === "GET" &&
      (await res.json()).status?.snapshot_id === "release-overnight-fixture",
  );
  await page
    .getByRole("button", { name: "Check catalogue updates", exact: true })
    .click();
  expect((await (await changedResponse).json()).status.snapshot_id).toBe(
    "release-overnight-fixture",
  );
  await expect(changes.getByRole("link", { name: /DEMO-001/ })).toHaveAttribute(
    "href",
    "/catalogue/DEMO-001",
  );
  expect(await exportPlan(page)).toEqual(applied);
  await expect(changes).toBeVisible();
  await page.reload();
  await expect(changes).toBeVisible();
  expect(await exportPlan(page)).toEqual(applied);
  await page.screenshot({
    path: info.outputPath("connected-overnight-flag.png"),
    fullPage: true,
  });

  const username = `rel_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const password = "Release acceptance synthetic password 123";
  await page.goto("/settings");
  await page.getByRole("button", { name: a.register, exact: true }).click();
  await page.getByLabel(a.username, { exact: true }).fill(username);
  await page.getByLabel(a.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: a.submit, exact: true }).click();
  await expect(page.locator(".account-plans li")).toHaveCount(1);
  await page.getByRole("button", { name: a.saved, exact: true }).click();
  const secondContext = await browser.newContext({ baseURL });
  try {
    await page.goto("/plan");
    await page
      .getByRole("button", { name: `${p.pin} · DEMO-005`, exact: true })
      .click();
    const synced = await exportPlan(page);
    await page.goto("/settings");
    const write = page.waitForResponse(
      (res) =>
        res.request().method() === "PUT" &&
        res.url().includes("/api/v1/account/plans/"),
    );
    await page.getByRole("button", { name: a.sync, exact: true }).click();
    expect((await write).status()).toBe(200);
    // Use the real browser's secure-cookie handling on the local HTTP origin.
    const cloudResponse = await page.evaluate(async () => {
      const response = await fetch("/api/v1/account/plans");
      return { status: response.status, data: await response.json() };
    });
    expect(cloudResponse.status).toBe(200);
    const cloud = cloudResponse.data.plans;
    expect(cloud).toHaveLength(1);
    expect(cloud[0].revision).toBe(2);
    expect({ ...cloud[0].snapshot, id: synced.id }).toEqual(synced);
    const second = await secondContext.newPage();
    await second.addInitScript(() =>
      localStorage.setItem("unifr.language", "en"),
    );
    await second.goto("/settings");
    await second.getByLabel(a.username, { exact: true }).fill(username);
    await second.getByLabel(a.password, { exact: true }).fill(password);
    await second.getByRole("button", { name: a.submit, exact: true }).click();
    await expect(second.locator(".account-plans li")).toHaveCount(1);
    await second.getByRole("button", { name: a.download, exact: true }).click();
    await expect(second.getByText(a.copied, { exact: true })).toBeVisible();
    const restored = await exportPlan(second);
    expect(restored.id).not.toBe(synced.id);
    expect({ ...restored, id: synced.id }).toEqual(synced);
    await second.reload();
    expect(await exportPlan(second)).toEqual(restored);
    await assertStudentProgress(second, restored);
    await assertWeek(
      second,
      ["2026-09-21T10:00:00Z", "2026-09-21T12:00:00Z"],
      0,
    );
    await info.attach("synced-plan-content.json", {
      body: JSON.stringify(cloud[0], null, 2),
      contentType: "application/json",
    });
    if (process.env.UNIFR_RELEASE_KEEP_ACCOUNT) {
      const identityPath = info.outputPath("restore-student-identity.json");
      await writeFile(
        identityPath,
        JSON.stringify(
          { username, planId: cloud[0].id, snapshot: cloud[0].snapshot },
          null,
          2,
        ),
      );
      await info.attach("restore-student-identity.json", {
        path: identityPath,
        contentType: "application/json",
      });
    }
  } finally {
    await secondContext.close();
    // Remove only this test's newly-created account and its synthetic plans.
    if (!process.env.UNIFR_RELEASE_KEEP_ACCOUNT) {
      await page.goto("/settings");
      await page.getByRole("button", { name: a.remove, exact: true }).click();
      await page.getByLabel(a.password, { exact: true }).fill(password);
      await page.getByRole("button", { name: a.confirm, exact: true }).click();
      await expect(page.getByLabel(a.username, { exact: true })).toBeVisible();
    }
  }
});
