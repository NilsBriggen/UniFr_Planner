import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { accountMessages } from "../src/accounts/messages";
import { plannerMessages } from "../src/planner/messages";
import { createPlan } from "../src/planner/domain";

for (const language of ["de", "fr", "en"] as const) {
  test(`private account, two-device conflict, recovery and deletion ${language}`, async ({
    page,
    browser,
  }, testInfo) => {
    const t = accountMessages[language],
      p = plannerMessages[language];
    const username = `u_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const password = "a private account password 123";
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    await page.goto("/plan");
    const guest = createPlan({
      id: "guest",
      scenarioId: "main",
      name: "My private degree",
      programme: "CS",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    });
    await page.getByLabel(p.json, { exact: true }).fill(JSON.stringify(guest));
    await page.getByRole("button", { name: p.preview, exact: true }).click();
    await page
      .getByRole("button", { name: p.confirmImport, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "My private degree", exact: true }),
    ).toBeVisible();
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: t.title })).toBeVisible();
    await expect(page.getByRole("button", { name: t.submit })).toBeEnabled();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole("button", { name: t.register, exact: true }).focus();
    await page.keyboard.press("Enter");
    await page.getByLabel(t.username, { exact: true }).fill(username);
    await page.getByLabel(t.password, { exact: true }).fill(password);
    await page.getByRole("button", { name: t.submit }).focus();
    await page.keyboard.press("Enter");
    const recovery = await page.locator(".account-recovery code").innerText();
    expect(recovery.length).toBeGreaterThanOrEqual(32);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator(".account-plans li")).toHaveCount(1);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("account-recovery.png"),
      fullPage: true,
    });
    // Screenshots intentionally contain only synthetic test credentials.
    await page.getByRole("button", { name: t.saved }).click();
    await expect(page.locator(".account-recovery")).toHaveCount(0);
    const initial = await page.evaluate(async () =>
      (await fetch("/api/v1/account/plans")).json(),
    );
    const serverPlan = initial.plans[0];

    const other = await browser.newContext({
      baseURL: "http://127.0.0.1:4173",
    });
    try {
      const second = await other.newPage();
      await second.addInitScript(
        (lang) => localStorage.setItem("unifr.language", lang),
        language,
      );
      await second.goto("/settings");
      await second.getByLabel(t.username, { exact: true }).fill(username);
      await second.getByLabel(t.password, { exact: true }).fill(password);
      await second.getByRole("button", { name: t.submit }).click();
      await expect(second.locator(".account-plans li")).toHaveCount(1);
      await second.getByRole("button", { name: t.download }).click();
      await expect(second.getByText(t.copied, { exact: true })).toBeVisible();
      // A realistic second device write changes the complete scenario snapshot.
      const changed = structuredClone(serverPlan.snapshot);
      changed.scenarios[0].travelMinutes = 45;
      const updated = await second.evaluate(
        async ({ id, snapshot }) =>
          (
            await fetch(`/api/v1/account/plans/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ revision: 1, snapshot }),
            })
          ).status,
        { id: serverPlan.id, snapshot: changed },
      );
      expect(updated).toBe(200);
      await page.getByRole("button", { name: t.sync, exact: true }).click();
      await expect(page.getByText(t.conflict, { exact: true })).toBeVisible();
      await expect(page.locator(".account-plans li")).toHaveCount(2);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath("account-conflict.png"),
        fullPage: true,
      });
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: t.exported }).click();
      const archive = JSON.parse(
        await readFile((await (await download).path())!, "utf8"),
      );
      expect(archive.schemaVersion).toBe(1);
      expect(archive.plans).toHaveLength(2);
      expect(
        archive.plans
          .map(
            (value: typeof serverPlan) =>
              value.snapshot.scenarios[0].travelMinutes,
          )
          .sort(),
      ).toEqual([0, 45]);
      expect(JSON.stringify(archive)).not.toContain(password);
      expect(JSON.stringify(archive)).not.toContain(recovery);
      await page.getByRole("button", { name: t.logout }).click();
      await page.getByRole("button", { name: t.recover, exact: true }).click();
      await page.getByLabel(t.username, { exact: true }).fill(username);
      await page.getByLabel(t.password, { exact: true }).fill(password + "new");
      await page.getByLabel(t.recovery, { exact: true }).fill(recovery);
      await page.getByRole("button", { name: t.submit }).click();
      await expect(page.locator(".account-recovery code")).toBeVisible();
      expect(await page.locator(".account-recovery code").innerText()).not.toBe(
        recovery,
      );
      expect(
        await second.evaluate(
          async () => (await fetch("/api/v1/account/session")).status,
        ),
      ).toBe(401);
      await page.getByRole("button", { name: t.saved }).click();
      await page.getByRole("button", { name: t.remove, exact: true }).click();
      await page.getByLabel(t.password, { exact: true }).fill(password + "new");
      await page.getByRole("button", { name: t.confirm }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByLabel(t.username, { exact: true })).toBeVisible();
      expect(
        await page.evaluate(
          async () => (await fetch("/api/v1/account/session")).status,
        ),
      ).toBe(401);
      await page.goto("/plan");
      await expect(
        page.getByRole("heading", { name: "My private degree", exact: true }),
      ).toBeVisible();
    } finally {
      await other.close();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
