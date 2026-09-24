import { catalogueMessages } from "../src/catalogue-i18n";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const locales = [
  {
    name: "Deutsch",
    search: "Kurse suchen",
    submit: "Suchen",
    filter: "Filter",
    term: "Semester",
    preview: catalogueMessages.de.preview,
    unresolvedBody: catalogueMessages.de.unresolvedBody,
    close: "Schliessen",
    stale: "Entwicklungsbeispiele · kein aktueller UniFr-Katalog",
    unresolved: "Termine ungeklärt",
    back: "Zurück zum Katalog",
    source: "Offizielle Kursseite",
    remove: "Entfernen",
    next: "Weiter",
    title: "Algebra",
  },
  {
    name: "Français",
    search: "Rechercher des cours",
    submit: "Rechercher",
    filter: "Filtres",
    term: "Semestre",
    preview: catalogueMessages.fr.preview,
    unresolvedBody: catalogueMessages.fr.unresolvedBody,
    close: "Fermer",
    stale: "Exemples de développement · pas de catalogue UniFr actuel",
    unresolved: "Horaires non résolus",
    back: "Retour au catalogue",
    source: "Page officielle du cours",
    remove: "Supprimer",
    next: "Suivant",
    title: "Algèbre",
  },
  {
    name: "English",
    search: "Search courses",
    submit: "Search",
    filter: "Filters",
    term: "Semester",
    preview: catalogueMessages.en.preview,
    unresolvedBody: catalogueMessages.en.unresolvedBody,
    close: "Close",
    stale: "Development examples · not a current UniFr catalogue",
    unresolved: "Meeting times unresolved",
    back: "Back to catalogue",
    source: "Official course page",
    remove: "Remove",
    next: "Next",
    title: "Algebra",
  },
];

const exceptions = [
  {
    name: "Deutsch",
    excluded: "Ausgenommene Termine laut Quelle",
    added: "Zusätzliche Termine laut Quelle",
    override: "Ersetzter Termin laut Quelle",
    note: "Quellenausnahmen · Wiederholungen werden nicht aufgelöst.",
    preview: catalogueMessages.de.preview,
    unresolvedBody: catalogueMessages.de.unresolvedBody,
    unresolved: "Termine ungeklärt",
  },
  {
    name: "Français",
    excluded: "Dates exclues selon la source",
    added: "Dates supplémentaires selon la source",
    override: "Occurrence remplacée selon la source",
    note: "Exceptions de la source · les récurrences ne sont pas développées.",
    preview: catalogueMessages.fr.preview,
    unresolvedBody: catalogueMessages.fr.unresolvedBody,
    unresolved: "Horaires non résolus",
  },
  {
    name: "English",
    excluded: "Excluded dates from source",
    added: "Additional dates from source",
    override: "Replaced occurrence from source",
    note: "Source exceptions · recurrences are not expanded.",
    preview: catalogueMessages.en.preview,
    unresolvedBody: catalogueMessages.en.unresolvedBody,
    unresolved: "Meeting times unresolved",
  },
];

for (const locale of exceptions) {
  test(`source recurrence exceptions remain visible in detail and preview in ${locale.name}`, async ({
    page,
  }) => {
    await page.goto("/catalogue/DEMO-004");
    await page.getByRole("button", { name: locale.name, exact: true }).click();
    const detail = page.locator(".course-detail");
    for (const label of [locale.excluded, locale.added, locale.override])
      await expect(detail.getByText(label, { exact: true })).toBeVisible();
    for (const value of [
      "2026-09-16T10:15:00+02:00",
      "2026-09-18",
      "2026-09-23T10:15:00+02:00",
      "2026-09-28T10:15:00+02:00",
    ])
      await expect(detail.getByText(value, { exact: true })).toBeVisible();
    await expect(
      detail.getByText(locale.note, { exact: true }).first(),
    ).toBeVisible();
    await expect(
      detail.getByText(locale.unresolved, { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: locale.preview }).click();
    const dialog = page.getByRole("dialog");
    for (const label of [locale.excluded, locale.added, locale.override])
      await expect(dialog.getByText(label, { exact: true })).toBeVisible();
    for (const value of [
      "2026-09-16T10:15:00+02:00",
      "2026-09-18",
      "2026-09-23T10:15:00+02:00",
      "2026-09-28T10:15:00+02:00",
    ])
      await expect(dialog.getByText(value, { exact: true })).toBeVisible();
    await expect(
      dialog.getByText(locale.unresolved, { exact: true }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.keyboard.press("Escape");
  });
}

for (const locale of locales) {
  test(`catalogue DB search, chips, detail, overlay and Axe in ${locale.name}`, async ({
    page,
  }, testInfo) => {
    await page.goto("/catalogue");
    await page.getByRole("button", { name: locale.name, exact: true }).click();
    await expect(page.getByText(locale.stale, { exact: false })).toBeVisible();
    await page.getByRole("button", { name: locale.next, exact: true }).click();
    await expect(page.getByText("DEMO-024", { exact: false })).toBeVisible();
    await page.getByLabel(locale.search, { exact: true }).fill("Algebra");
    await page
      .getByRole("button", { name: locale.submit, exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: new RegExp(locale.title) }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("button", {
        name: new RegExp(locale.remove + ".*Algebra"),
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: locale.filter, exact: true })
      .click();
    await page
      .getByRole("combobox", { name: locale.term, exact: true })
      .selectOption("AS-2026");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("catalogue-filters.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: locale.submit, exact: true })
      .click();
    await page.getByRole("link", { name: new RegExp(locale.title) }).click();
    await expect(
      page.getByRole("link", { name: locale.source }),
    ).toHaveAttribute(
      "href",
      /https:\/\/www\.unifr\.ch\/timetable\/en\/course\.html\?show=/,
    );
    await page.getByRole("button", { name: locale.preview }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("Europe/Zurich");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    const previewPath = testInfo.outputPath("schedule-preview.png");
    await page.screenshot({ path: previewPath });
    await testInfo.attach("schedule-preview", {
      path: previewPath,
      contentType: "image/png",
    });
    await page.getByRole("button", { name: locale.close, exact: true }).click();
    await expect(
      page.getByRole("button", { name: locale.preview }),
    ).toBeFocused();
    await page.getByRole("link", { name: locale.back }).click();
    await expect(page.getByLabel(locale.search, { exact: true })).toHaveValue(
      "Algebra",
    );
    await page
      .getByRole("button", { name: new RegExp(locale.remove + ".*Algebra") })
      .click();
    await page.getByRole("link", { name: /DEMO-003/ }).click();
    await expect(
      page.getByText(locale.unresolved, { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: locale.preview }).click();
    await expect(
      page
        .getByRole("dialog")
        .locator(".schedule-warning")
        .getByText(locale.unresolvedBody, { exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const unresolvedPath = testInfo.outputPath("unresolved-course.png");
    await page.screenshot({ path: unresolvedPath, fullPage: true });
    await testInfo.attach("unresolved-course", {
      path: unresolvedPath,
      contentType: "image/png",
    });
  });
}

test("keyboard-only search and modal traps focus and restores it", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "de"));
  await page.goto("/catalogue");
  const search = page.getByLabel("Kurse suchen", { exact: true });
  await expect(search).toBeVisible();
  await search.focus();
  await expect(search).toBeFocused();
  await page.keyboard.type("Algebra");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: /Entfernen.*Algebra/ }),
  ).toBeVisible();
  for (
    let i = 0;
    i < 12 &&
    !(await page
      .getByRole("link", { name: /DEMO-001/ })
      .evaluate((el) => el === document.activeElement));
    i++
  )
    await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /DEMO-001/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  for (
    let i = 0;
    i < 12 &&
    !(await page
      .getByRole("button", { name: catalogueMessages.de.preview })
      .evaluate((el) => el === document.activeElement));
    i++
  )
    await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "Schliessen" })).toBeFocused();
  const dialogControls = page
    .getByRole("dialog")
    .locator(
      "button:visible, summary:visible, a:visible, input:visible, select:visible",
    );
  await page.keyboard.press("Shift+Tab");
  await expect(dialogControls.last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialogControls.first()).toBeFocused();
  for (let index = 1; index < (await dialogControls.count()); index++) {
    await page.keyboard.press("Tab");
    await expect(dialogControls.nth(index)).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(dialogControls.first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: catalogueMessages.de.preview }),
  ).toBeFocused();
  for (const control of await page
    .locator(
      "main button:visible, main input:visible, main select:visible, main a:visible",
    )
    .all()) {
    const box = await control.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});

test("invalid filter window keeps values editable and valid availability excludes unresolved courses", async ({
  page,
}) => {
  await page.goto(
    "/catalogue?faculty=Science&available_day=0&available_from=14:00&available_until=12:00",
  );
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Available from must be earlier than Available until.",
  );
  await expect(
    page.getByLabel("Available from", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByLabel("Available until", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByLabel("Available from", { exact: true }),
  ).toHaveAttribute("aria-describedby", "catalogue-filter-error");
  await expect(
    page.getByLabel("Available until", { exact: true }),
  ).toHaveAttribute("aria-describedby", "catalogue-filter-error");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Faculty / domain", exact: true }),
  ).toHaveValue("Science");
  await expect(
    page.getByRole("combobox", { name: "Available weekday", exact: true }),
  ).toHaveValue("0");
  await page.getByLabel("Available from", { exact: true }).fill("12:00");
  await page.getByLabel("Available until", { exact: true }).fill("13:00");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("link", { name: /DEMO-001/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /DEMO-003/ })).toHaveCount(0);
  await page
    .getByLabel("Search courses", { exact: true })
    .fill("no such course");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No matching courses" }),
  ).toBeVisible();
});

test("invalid ECTS range identifies both fields, suggests a correction and focuses the first", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  await page.goto("/catalogue");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const minimum = page.getByLabel("Minimum ECTS", { exact: true });
  const maximum = page.getByLabel("Maximum ECTS", { exact: true });
  await minimum.fill("10");
  await maximum.fill("5");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(minimum).toBeHidden();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Minimum ECTS must not exceed Maximum ECTS.",
  );
  await expect(minimum).toHaveAttribute("aria-invalid", "true");
  await expect(maximum).toHaveAttribute("aria-invalid", "true");
  await expect(minimum).toHaveAttribute(
    "aria-describedby",
    "catalogue-filter-error",
  );
  await expect(maximum).toHaveAttribute(
    "aria-describedby",
    "catalogue-filter-error",
  );
  await expect(minimum).toBeVisible();
  await expect(minimum).toBeFocused();
  await expect(page).toHaveURL(/\/catalogue$/);
});

test("real rejected database renders unavailable, never empty catalogue", async ({
  page,
}) => {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `http://127.0.0.1:${process.env.E2E_REJECTED_API_PORT ?? "8002"}${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
  for (const [name, unavailable, rejected] of [
    [
      "Deutsch",
      "Kein aktueller Kurskatalog verfügbar",
      catalogueMessages.de.rejected,
    ],
    [
      "Français",
      "Aucun catalogue actuel disponible",
      catalogueMessages.fr.rejected,
    ],
    [
      "English",
      "No current catalogue available",
      catalogueMessages.en.rejected,
    ],
  ]) {
    await page.goto("/catalogue");
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: unavailable }),
    ).toBeVisible();
    await expect(page.getByText(rejected, { exact: false })).toBeVisible();
    await expect(
      page.getByRole("list", { name: /courses|Kurse|cours/ }),
    ).toHaveCount(0);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  }
});
