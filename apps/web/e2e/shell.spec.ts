import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createHash } from "node:crypto";

test("shell is accessible in each language and every navigation destination opens", async ({
  page,
}) => {
  await page.goto("/");
  for (const language of ["Deutsch", "Français", "English"]) {
    await page.getByRole("button", { name: language, exact: true }).click();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  }
  for (const path of [
    "/setup",
    "/plan",
    "/semester/HS-2026",
    "/catalogue",
    "/requirements",
    "/settings",
    "/admin",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("logo stays unchanged and the responsive shell has a visual baseline", async ({
  page,
  request,
}, testInfo) => {
  const response = await request.get("/unifr-logo.png");
  expect(
    createHash("sha256")
      .update(await response.body())
      .digest("hex"),
  ).toBe("25b77cd630c0719122273e085269bea29df9806ecbd24a3dd1b64d4de23b1ab1");
  await page.goto("/");
  const logo = page.getByRole("img", {
    name: "Universität Freiburg / Université de Fribourg",
  });
  const box = await logo.boundingBox();
  expect(box!.width / box!.height).toBeCloseTo(500 / 82, 1);
  await expect(page).toHaveScreenshot("home.png", { animations: "disabled" });
  await page.goto("/semester/HS-2026");
  await page.getByRole("button", { name: "Tag", exact: true }).click();
  await expect(
    page.getByText("Keine Veranstaltungen für diesen Tag."),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("semester-day.png", {
    animations: "disabled",
  });
  await testInfo.attach("semester", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("keyboard skip link reaches the main content and controls have touch targets", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Zum Inhalt" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  for (const control of await page
    .locator("button:visible, select:visible, nav a:visible")
    .all()) {
    const box = await control.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});
