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
  await page.addInitScript(() => localStorage.setItem("unifr.language", "de"));
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
  await page.addInitScript(() => localStorage.setItem("unifr.language", "de"));
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

test("compact navigation keeps localized labels intact and focused content above it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addInitScript(() => localStorage.setItem("unifr.language", "de"));
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Hauptnavigation" });
  const expandedTextStyles = `
    html { font-size: 150% !important; }
    .navigation, .navigation * {
      letter-spacing: 0.12em !important;
      line-height: 1.5 !important;
      word-spacing: 0.16em !important;
    }
  `;
  for (const label of ["Stundenplan", "Kurse", "Mein Studium"]) {
    const text = navigation
      .getByRole("link", { name: label })
      .locator("span")
      .last();
    expect(
      await text.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return new Set(
          [...range.getClientRects()].map((rect) => Math.round(rect.top)),
        ).size;
      }),
      `${label} should remain on one line`,
    ).toBe(1);
  }

  await page.addStyleTag({ content: expandedTextStyles });
  await expect
    .poll(() =>
      navigation.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      })),
    )
    .toEqual({ clientWidth: 320, scrollWidth: 320 });
  await expect
    .poll(() =>
      navigation.evaluate(
        (element) =>
          Number.parseFloat(
            getComputedStyle(document.documentElement).scrollPaddingBottom,
          ) >= element.getBoundingClientRect().height,
      ),
    )
    .toBe(true);
  for (const link of await navigation.getByRole("link").all()) {
    const contained = await link.evaluate((element) => {
      const linkRect = element.getBoundingClientRect();
      const navRect = element.parentElement!.getBoundingClientRect();
      return linkRect.left >= navRect.left && linkRect.right <= navRect.right;
    });
    expect(contained).toBe(true);
  }

  await page.goto("/catalogue");
  await page.addStyleTag({ content: expandedTextStyles });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const nav = document.querySelector(".navigation")!;
        const height = nav.getBoundingClientRect().height;
        return {
          clears:
            Number.parseFloat(
              getComputedStyle(document.documentElement).scrollPaddingBottom,
            ) >= height,
          wrapped: height > 76,
        };
      }),
    )
    .toEqual({ clears: true, wrapped: true });
  const course = page.locator(".course-results h2 a").nth(8);
  await expect(course).toBeVisible();
  await course.evaluate((element) =>
    element.scrollIntoView({ block: "end", inline: "nearest" }),
  );
  await course.focus();
  const clearance = await page.evaluate(() => {
    const focused = document.activeElement!.getBoundingClientRect();
    const nav = document.querySelector(".navigation")!.getBoundingClientRect();
    return {
      focusedBottom: focused.bottom,
      navigationTop: nav.top,
      scrollPaddingBottom: Number.parseFloat(
        getComputedStyle(document.documentElement).scrollPaddingBottom,
      ),
      navigationHeight: nav.height,
    };
  });
  expect(clearance.focusedBottom).toBeLessThanOrEqual(clearance.navigationTop);
  expect(clearance.scrollPaddingBottom).toBeGreaterThanOrEqual(
    clearance.navigationHeight,
  );
});

for (const [locale, expected] of [
  ["de-CH", "de"],
  ["fr-CH", "fr"],
  ["en-US", "en"],
] as const) {
  test(`browser language ${locale} initializes the shell and saved choice takes precedence`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ baseURL, locale });
    try {
      const page = await context.newPage();
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("lang", expected);
      expect(await page.evaluate(() => navigator.language)).toBe(locale);
      await page.getByRole("button", { name: "Français", exact: true }).click();
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      expect(
        await page.evaluate(() => localStorage.getItem("unifr.language")),
      ).toBe("fr");
    } finally {
      await context.close();
    }
  });
}
