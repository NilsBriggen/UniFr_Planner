import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { messages } from "../src/i18n";
import { plannerMessages } from "../src/planner/messages";
import { catchupMessages } from "../src/planner/catchup-messages";

for (const language of ["de", "fr", "en"] as const) {
  test(`returning student can resume and switch plans in ${language}`, async ({
    page,
  }) => {
    const t = messages[language],
      p = plannerMessages[language];
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    await page.goto("/setup");
    await expect(
      page.getByRole("combobox", {
        name: catchupMessages[language].studyStart,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("spinbutton", { name: p.startYear, exact: true }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    for (const name of ["First degree", "Second degree"]) {
      await page.goto("/setup");
      await page.getByLabel(p.planName, { exact: true }).fill(name);
      await page
        .getByLabel(p.programme, { exact: true })
        .fill("Computer Science");
      await page.getByRole("button", { name: p.create, exact: true }).click();
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("main")).toBeFocused();
    }
    await page.goto("/");
    await page.getByRole("link", { name: t.resume, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Second degree", exact: true }),
    ).toBeVisible();
    const switcher = page
      .locator("header")
      .getByRole("combobox", { name: t.planLabel });
    await expect(switcher).toBeVisible();
    await switcher.selectOption({ label: "First degree" });
    await expect(
      page.getByRole("heading", { name: "First degree", exact: true }),
    ).toBeVisible();
    await page.goto("/semester/SS-2027");
    await expect(
      page
        .getByRole("navigation")
        .getByRole("link", { name: t.semesterNav, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.goto("/catalogue");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page
      .getByRole("navigation")
      .getByRole("link", { name: t.plan, exact: true })
      .click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole("main")).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
