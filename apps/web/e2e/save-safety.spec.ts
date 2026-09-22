import { expect, test, type Page } from "@playwright/test";
import { chooseManualSetup } from "./studies-helpers";

async function saved(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("unifr-planner");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      return await new Promise<
        { id: string; scenarios: { courses: { code: string }[] }[] }[]
      >((resolve, reject) => {
        const req = db.transaction("plans").objectStore("plans").getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  });
}
async function create(page: Page) {
  await page.goto("/setup");
  await chooseManualSetup(page);
  await page.getByLabel("Plan name", { exact: true }).fill("Two tabs");
  await page.getByLabel("Programme", { exact: true }).fill("Computer Science");
  await page.getByLabel("Study start · Year", { exact: true }).fill("2026");
  await page.getByRole("button", { name: "Start planning" }).click();
  await expect(page).toHaveURL(/catalogue/);
}

test("two stale tabs retain both course edits through separate-plan recovery", async ({
  context,
  page,
}, info) => {
  await context.addInitScript(() => {
    localStorage.setItem("unifr.language", "en");
    // Deterministically simulate missed notifications (offline/suspended tab).
    Object.defineProperty(window, "BroadcastChannel", { value: undefined });
    const add = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, ...args: unknown[]) => {
      if (type !== "focus") Reflect.apply(add, window, [type, ...args]);
    }) as typeof window.addEventListener;
  });
  await create(page);
  await page.goto("/catalogue/DEMO-001?term=AS-2026");
  const other = await context.newPage();
  await other.goto("/catalogue/DEMO-002?term=AS-2026");
  const add = (p: Page) =>
    p.getByRole("button", { name: "Add to semester", exact: true });
  await expect(add(page)).toBeEnabled();
  await expect(add(other)).toBeEnabled();
  await add(page).click();
  await expect
    .poll(async () =>
      (await saved(page))[0].scenarios[0].courses.map((c) => c.code),
    )
    .toEqual(["DEMO-001"]);
  await add(other).click();
  await expect(
    other.getByRole("heading", { name: "This plan changed in another tab" }),
  ).toBeVisible();
  await other.screenshot({
    path: info.outputPath("plan-conflict.png"),
    fullPage: true,
  });
  expect(
    (await saved(other))[0].scenarios[0].courses.map((c) => c.code),
  ).toEqual(["DEMO-001"]);
  await other
    .getByRole("button", { name: "Save my version as a separate plan" })
    .click();
  await expect.poll(async () => (await saved(other)).length).toBe(2);
  const plans = await saved(other);
  expect(new Set(plans.map((p) => p.id)).size).toBe(2);
  expect(
    plans.map((p) => p.scenarios[0].courses.map((c) => c.code)).sort(),
  ).toEqual([["DEMO-001"], ["DEMO-002"]]);
  await other.reload();
  expect(await saved(other)).toEqual(plans);
});

test("another tab refreshes its committed plan after a successful save", async ({
  context,
  page,
}) => {
  await context.addInitScript(() =>
    localStorage.setItem("unifr.language", "en"),
  );
  await create(page);
  const other = await context.newPage();
  await other.goto("/plan");
  await expect(
    other.getByRole("heading", { name: "Two tabs", exact: true }),
  ).toBeVisible();
  await page.goto("/catalogue/DEMO-001?term=AS-2026");
  await page
    .getByRole("button", { name: "Add to semester", exact: true })
    .click();
  await expect(
    other.getByRole("heading", { name: "Algebra", exact: true }),
  ).toBeVisible();
});
