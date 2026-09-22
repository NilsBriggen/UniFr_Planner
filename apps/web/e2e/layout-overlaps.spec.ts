import { expect, test } from "@playwright/test";
import { configuredStudyPlan, importStudyPlan } from "./studies-helpers";

for (const language of ["de", "fr", "en"] as const) {
  test(`semester summary never covers its next control in ${language}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    await importStudyPlan(page, configuredStudyPlan(), language);
    await page.goto("/catalogue?term=AS-2026");
    const summary = page.locator(".semester-summary");
    const disclosure = summary.locator("details").first();
    await expect(summary).toBeVisible();
    for (const width of [320, 390, 680]) {
      await page.setViewportSize({ width, height: 844 });
      for (const open of [false, true]) {
        if (((await disclosure.getAttribute("open")) !== null) !== open) {
          await disclosure.locator(":scope > summary").click();
        }
        await expect
          .poll(
            async () => {
              const card = await summary.boundingBox();
              const next = await page
                .locator(".discovery-semester")
                .boundingBox();
              return next!.y - (card!.y + card!.height);
            },
            {
              message: `${width}px: the ${open ? "expanded" : "collapsed"} card must leave a gap before the semester control`,
            },
          )
          .toBeGreaterThanOrEqual(8);
      }
    }
  });

  test(`calendar semester labels fit their controls in ${language}`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-09-22T12:00:00Z"));
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    await importStudyPlan(page, configuredStudyPlan(), language);
    await page.goto("/semester/AS-2026");
    const select = page.locator(".calendar-term select");
    await expect(select).toBeVisible();
    for (const width of [320, 390, 680, 768]) {
      await page.setViewportSize({ width, height: 844 });
      const dimensions = await select.evaluate((element) => {
        const style = getComputedStyle(element);
        const context = document.createElement("canvas").getContext("2d")!;
        context.font = style.font;
        return {
          required:
            context.measureText(
              (element as HTMLSelectElement).selectedOptions[0].textContent ??
                "",
            ).width +
            parseFloat(style.paddingLeft) +
            parseFloat(style.paddingRight) +
            20,
          available: element.clientWidth,
        };
      });
      expect(
        dimensions.available,
        `Full semester label at ${width}px`,
      ).toBeGreaterThanOrEqual(dimensions.required);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
  test(`requirement headings and override fields stay separate in ${language}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    await importStudyPlan(page, configuredStudyPlan(), language);
    await page.goto("/requirements");
    await expect(page.locator(".requirement-title").first()).toBeVisible();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const heading of await page
        .locator(".requirement-title:visible")
        .all()) {
        const title = await heading.locator("strong").boundingBox();
        const status = await heading
          .locator(".requirement-status")
          .boundingBox();
        expect(
          status!.y,
          `Status badge below title at ${width}px`,
        ).toBeGreaterThanOrEqual(title!.y + title!.height);
      }
      const form = page
        .locator("form.planner-form")
        .filter({ has: page.locator('select[name="node"]') });
      const overlaps = await form.evaluate((element) => {
        const controls = [...element.children].filter((child) =>
          child.checkVisibility(),
        );
        const result: string[] = [];
        for (let i = 0; i < controls.length; i++) {
          for (let j = i + 1; j < controls.length; j++) {
            const a = controls[i].getBoundingClientRect(),
              b = controls[j].getBoundingClientRect();
            if (
              Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
            ) {
              result.push(
                `${controls[i].tagName} overlaps ${controls[j].tagName}`,
              );
            }
          }
        }
        return result;
      });
      expect(overlaps, `Override form at ${width}px`).toEqual([]);
    }
  });
}
