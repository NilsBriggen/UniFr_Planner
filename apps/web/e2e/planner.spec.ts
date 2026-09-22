import {
  chooseManualSetup,
  openPlanJson,
  openPlanTools,
} from "./studies-helpers";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { plannerMessages } from "../src/planner/messages";
import { messages } from "../src/i18n";
import { createPlan } from "../src/planner/domain";
import { readFile } from "node:fs/promises";
import ICAL from "ical.js";
import { setupMessages } from "../src/planner/setupMessages";

for (const language of ["de", "fr", "en"] as const) {
  const t = plannerMessages[language],
    shell = messages[language];
  test(`guest recovery and malformed recurrence ${language}`, async ({
    page,
  }) => {
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    await page.goto("/plan");
    await openPlanJson(page, language);
    const imported = createPlan({
      id: "original",
      scenarioId: "main",
      name: "Recovery degree",
      programme: "CS",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    });
    imported.scenarios[0].courses = [
      {
        id: "invalid",
        code: "INVALID",
        titles: { en: "Invalid recurrence" },
        ects: 6,
        status: "planned",
        semester: "AS-2026",
        pinned: false,
        offering: {
          source_id: "fixture",
          terms: ["AS-2026"],
          meeting_state: "resolved",
          source_url: "https://www.unifr.ch",
          snapshot_id: "test",
          development_fixture: true,
          meetings: [
            {
              starts_at: "2026-09-21T10:00:00Z",
              ends_at: "2026-09-21T11:00:00Z",
              location: "PER",
              unresolved: false,
              cancelled: false,
              excluded_dates: [],
              additional_dates: [],
              note: "",
              recurrence: "FREQ=WEEKLY;COUNT=2;BYMONTH=13",
            },
          ],
        },
      },
    ];
    await page
      .getByLabel(t.json, { exact: true })
      .fill(JSON.stringify(imported));
    await page.getByRole("button", { name: t.preview, exact: true }).click();
    await page
      .getByRole("button", { name: t.confirmImport, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Recovery degree", exact: true }),
    ).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open("unifr-planner");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(["plans", "preferences"], "readwrite");
            tx.objectStore("plans").put({ id: "bad", schemaVersion: 99 });
            tx.objectStore("preferences").put("bad", "activeId");
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Recovery degree", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(t.unreadable);
    await openPlanTools(page, language);
    await expect(
      page.getByRole("button", { name: t.exportJson, exact: true }),
    ).toBeEnabled();
    await page.goto("/semester/AS-2026");
    await expect(page.locator(".calendar-check")).toContainText(t.unresolved);
    await expect(page.getByText(t.clear, { exact: true })).toHaveCount(0);
    await page.locator("details.calendar-exports > summary").click();
    await expect(
      page.getByRole("button", { name: t.exportIcs, exact: true }),
    ).toBeDisabled();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
  });
  test(`guest JSON import ${language}: validation, preview and independent backup`, async ({
    page,
  }) => {
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    await page.goto("/plan");
    await openPlanJson(page, language);
    await page.getByLabel(t.json, { exact: true }).fill('{"schemaVersion":99}');
    await page.getByRole("button", { name: t.preview, exact: true }).click();
    await expect(page.getByRole("alert")).toHaveText(t.invalid);
    const original = createPlan({
      id: "original",
      scenarioId: "main",
      name: "Imported degree",
      programme: "CS",
      startTerm: "AS-2026",
      semesterCount: 6,
      targetEcts: 180,
    });
    await page.getByLabel(t.file, { exact: true }).setInputFiles({
      name: "plan.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(original)),
    });
    await page.getByRole("button", { name: t.preview, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: t.importPreview, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Imported degree", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page
      .getByRole("button", { name: t.confirmImport, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Imported degree", exact: true }),
    ).toBeVisible();
    await openPlanTools(page, language);
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: t.exportJson, exact: true }).click();
    const downloaded = await downloading;
    const backup = JSON.parse(await readFile(await downloaded.path(), "utf8"));
    expect(backup.id).not.toBe(original.id);
    expect({ ...backup, id: original.id }).toEqual(original);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Imported degree", exact: true }),
    ).toBeVisible();
  });
  test(`guest planner ${language}: persistence, keyboard, conflicts, export and accessibility`, async ({
    page,
  }, info) => {
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    await page.goto("/setup");
    await chooseManualSetup(page, language);
    await page.getByLabel(t.planName, { exact: true }).fill("My degree");
    await page.getByLabel(t.programme, { exact: true }).fill("Informatics");
    await page
      .getByRole("button", {
        name: setupMessages[language].start,
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/catalogue/);
    await page.goto("/plan");
    await expect(
      page.getByRole("heading", { name: "My degree", exact: true }),
    ).toBeVisible();
    await page.goto("/catalogue/DEMO-001");
    await page
      .getByRole("button", { name: t.addToSemester, exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("6 ECTS");
    await page.goto("/plan");
    const allocation = page.getByLabel(`${t.semester} · DEMO-001`, {
      exact: true,
    });
    // Direct add assigns the planning semester immediately; opening the moved
    // course keeps keyboard rescheduling covered through the collapsed board.
    await allocation.selectOption("");
    await expect(page.locator(".save-status")).toHaveText(t.saved);
    const unscheduled = page.locator("details.semester-column", {
      has: page.getByRole("heading", { name: t.unscheduled, exact: true }),
    });
    await unscheduled.locator("summary").click();
    await allocation.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(allocation).toHaveValue("AS-2026");
    const pin = page.getByRole("button", {
      name: `${t.pin} · DEMO-001`,
      exact: true,
    });
    await pin.focus();
    await page.keyboard.press("Space");
    await expect(
      page.getByLabel(`${t.semester} · DEMO-001`, { exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: `${t.unpin} · DEMO-001`, exact: true })
      .click();
    await openPlanTools(page, language);
    await page.getByLabel(t.newScenario, { exact: true }).fill("Alternative");
    await page.getByRole("button", { name: t.duplicate, exact: true }).click();
    await expect(page.getByLabel(t.scenario, { exact: true })).toHaveValue(
      /.+/,
    );
    await page
      .getByLabel(`${t.semester} · DEMO-001`, { exact: true })
      .selectOption("SS-2027");
    await expect(page.getByText(t.future, { exact: true })).toBeVisible();
    await page
      .getByLabel(t.scenario, { exact: true })
      .selectOption({ label: "My degree" });
    await expect(
      page.getByLabel(`${t.semester} · DEMO-001`, { exact: true }),
    ).toHaveValue("AS-2026");
    await page.reload();
    await expect(
      page.getByLabel(`${t.semester} · DEMO-001`, { exact: true }),
    ).toHaveValue("AS-2026");
    await page
      .getByRole("group", { name: t.completed, exact: true })
      .locator(":scope > summary")
      .click();
    await page
      .getByLabel(t.courseTitle, { exact: true })
      .fill("Prior mathematics");
    await page.getByLabel(t.courseCode, { exact: true }).fill("MATH0");
    await page.getByLabel(t.completedEcts, { exact: true }).fill("6");
    await page
      .getByRole("button", { name: t.addCompleted, exact: true })
      .click();
    await expect(
      page.getByText("Prior mathematics", { exact: true }),
    ).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath("degree-board.png"),
      fullPage: true,
    });
    await page.goto("/semester/AS-2026");
    await expect(page.getByText(t.clear, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: t.day, exact: true }).click();
    await page.getByLabel(t.date, { exact: true }).fill("2026-09-21");
    await expect(
      page
        .locator(".screen-calendar")
        .getByText(language === "fr" ? "Algèbre" : "Algebra", { exact: true }),
    ).toBeVisible();
    await page.locator("details.availability-form > summary").click();
    await page.getByLabel(t.busyLabel, { exact: true }).fill("Work");
    await page.getByLabel(t.starts, { exact: true }).fill("2026-09-21T12:15");
    await page.getByLabel(t.ends, { exact: true }).fill("2026-09-21T12:45");
    await page.getByRole("button", { name: t.addBusy, exact: true }).click();
    await expect(page.locator(".calendar-check")).toContainText(t.unavailable);
    await page.locator("details.calendar-exports > summary").click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: t.exportIcs, exact: true }).click();
    const ics = await download;
    expect(ics.suggestedFilename()).toBe("semester-AS-2026.ics");
    const exported = new ICAL.Component(
      ICAL.parse(await readFile(await ics.path(), "utf8")),
    );
    expect(exported.getAllSubcomponents("vevent")).toHaveLength(2);
    expect(
      exported
        .getAllSubcomponents("vevent")[0]
        .getFirstPropertyValue("dtstart")!
        .toString(),
    ).toBe("2026-09-21T10:00:00Z");
    await page.getByRole("button", { name: t.week, exact: true }).click();
    await expect(page.locator(".calendar-day")).toHaveCount(7);
    await page.getByRole("button", { name: t.next, exact: true }).click();
    await expect(page.locator(".calendar-week .calendar-event")).toHaveCount(0);
    await page.getByRole("button", { name: t.previous, exact: true }).click();
    await expect(page.locator(".calendar-week .calendar-event")).toHaveCount(2);
    await page.screenshot({
      path: info.outputPath("semester-week.png"),
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: info.outputPath("semester-calendar.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".print-only")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: shell.nav }),
    ).toBeHidden();
    await page.screenshot({
      path: info.outputPath("semester-print.png"),
      fullPage: true,
    });
    await page.emulateMedia({ media: "screen" });
    await page.goto("/catalogue/DEMO-003");
    await page
      .getByRole("button", { name: t.addToSemester, exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("6 ECTS");
    await page.goto("/plan");
    await page
      .getByLabel(`${t.semester} · DEMO-003`, { exact: true })
      .selectOption("AS-2026");
    await expect(page.locator(".save-status")).toHaveText(t.saved);
    await page.goto("/semester/AS-2026");
    await expect(
      page.getByText(t.unresolvedHelp, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: t.exportIcs, exact: true }),
    ).toBeDisabled();
    await page.goto("/plan");
    await page
      .getByLabel(`${t.semester} · DEMO-003`, { exact: true })
      .selectOption("");
    await expect(page.locator(".save-status")).toHaveText(t.saved);
    await page.goto("/catalogue/DEMO-004");
    await page
      .getByRole("button", { name: t.addToSemester, exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("6 ECTS");
    await page.goto("/plan");
    await page
      .getByLabel(`${t.semester} · DEMO-004`, { exact: true })
      .selectOption("AS-2026");
    await expect(page.locator(".save-status")).toHaveText(t.saved);
    await page.goto("/semester/AS-2026");
    await page.locator("details.calendar-exports > summary").click();
    const recurrenceDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: t.exportIcs, exact: true }).click();
    const recurrenceIcs = new ICAL.Component(
      ICAL.parse(
        await readFile(await (await recurrenceDownload).path(), "utf8"),
      ),
    );
    const recurrenceDates = recurrenceIcs
      .getAllSubcomponents("vevent")
      .filter(
        (event) =>
          event.getFirstPropertyValue("summary") === "Example course 04",
      )
      .map((event) => event.getFirstPropertyValue("dtstart")!.toString());
    expect(recurrenceDates).toEqual([
      "2026-09-14T08:15:00Z",
      "2026-09-18T08:15:00Z",
      "2026-09-23T08:15:00Z",
      "2026-09-29T12:15:00Z",
      "2026-09-30T08:15:00Z",
    ]);
  });
}
