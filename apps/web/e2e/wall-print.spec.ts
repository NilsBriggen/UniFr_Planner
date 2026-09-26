import { expect, test } from "@playwright/test";
import type { Language } from "../src/i18n";
import { attendanceChoice } from "../src/planner/attendance";
import { countLabel } from "../src/planner/countLabels";
import { createPlan, type Selection } from "../src/planner/domain";
import { plannerMessages } from "../src/planner/messages";
import { timetableMessages } from "../src/planner/timetable-messages";
import { shareMessages } from "../src/sharing/messages";
import { importStudyPlan } from "./studies-helpers";

type Meeting = NonNullable<Selection["offering"]>["meetings"][number];
const meeting = (
  date: string,
  from: string,
  to: string,
  note: string,
  location: string,
  recurrence?: string,
): Meeting => {
  // Autumn 2026 switches from CEST to CET after 25 October.
  const offset = date < "2026-10-25" ? "+02:00" : "+01:00";
  // Schema key order: the attendance fingerprint must survive the import.
  return {
    starts_at: `${date}T${from}:00${offset}`,
    ends_at: `${date}T${to}:00${offset}`,
    location,
    unresolved: false,
    cancelled: false,
    ...(recurrence ? { recurrence } : {}),
    excluded_dates: [],
    additional_dates: [],
    note,
  };
};
/** A local wall-clock series, so the times survive the DST change. */
const weekly = (
  date: string,
  from: string,
  to: string,
  note: string,
  location: string,
  count = 14,
  interval = 1,
) =>
  meeting(
    date,
    from,
    to,
    note,
    location,
    `FREQ=WEEKLY;INTERVAL=${interval};COUNT=${count}`,
  );
const course = (id: string, title: string, meetings: Meeting[]): Selection => ({
  id,
  code: `WALL.${id.toUpperCase()}`,
  titles: { en: title },
  ects: 3,
  status: "planned",
  semester: "AS-2026",
  pinned: false,
  offering: {
    source_id: id,
    terms: ["AS-2026"],
    meetings,
    meeting_state: "resolved",
    source_url: "https://www.unifr.ch",
    snapshot_id: "fixture",
    development_fixture: true,
  },
});

function densePlan() {
  const plan = createPlan({
    id: "wall-plan",
    scenarioId: "s",
    name: "Wall timetable · Autumn with a deliberately long plan name",
    programme: "Mathematics",
    startTerm: "AS-2026",
    planningSemester: "AS-2026",
    semesterCount: 2,
    targetEcts: 180,
  });
  const statistics = course("stats", "Statistique appliquée", [
    weekly("2026-09-18", "09:15", "11:00", "Cours", "PER 08"),
    weekly("2026-09-18", "11:15", "13:00", "Exercices groupe A", "PER 12"),
    weekly("2026-09-18", "11:15", "13:00", "Exercices groupe B", "PER 13"),
  ]);
  statistics.attendance = attendanceChoice(statistics, [2]);
  plan.scenarios[0].courses = [
    course(
      "maths",
      "Analyse I – fonctions d’une variable réelle et suites (cours avec exercices)",
      [
        weekly("2026-09-14", "10:15", "12:00", "Cours", "PER 08 Auditoire C"),
        weekly("2026-09-17", "13:15", "15:00", "Exercices", "PER 11 0.115"),
      ],
    ),
    course(
      "algo",
      "Algorithms and data structures for students of computer science and mathematics",
      [weekly("2026-09-15", "10:15", "12:00", "Lecture", "PER 21 A420")],
    ),
    course(
      "law",
      "Introduction au droit privé suisse et aux méthodes juridiques",
      [weekly("2026-09-15", "10:15", "12:00", "Cours", "MIS 03 3026")],
    ),
    course("econ", "Microeconomics", [
      weekly("2026-09-15", "11:15", "13:00", "Lecture", "PER 21 F130"),
    ]),
    ...[
      "Seminar in Swiss constitutional history",
      "Kolloquium Medienwissenschaft und digitale Öffentlichkeit",
      "Séminaire de philosophie médiévale",
      "Digital humanities workshop",
    ].map((title, i) =>
      course(`seminar${i}`, title, [
        weekly("2026-09-16", `14:1${i}`, "16:00", "Séminaire", `MIS 1${i}`),
      ]),
    ),
    course("evening", "Deutsch als Fremdsprache – Abendkurs", [
      weekly("2026-09-15", "18:15", "20:00", "Kurs", "MIS 04 4118"),
    ]),
    course("lab", "Laboratoire de chimie analytique", [
      weekly("2026-09-16", "08:15", "12:00", "TP", "PER 16", 7, 2),
    ]),
    // The irregular Thursday dates of the published detail.html course.
    course("art", "Histoire de l’art médiéval: images, objets et lieux", [
      ...[
        "2026-09-17",
        "2026-10-08",
        "2026-10-15",
        "2026-10-29",
        "2026-11-12",
        "2026-11-26",
      ].map((date) => meeting(date, "13:15", "17:00", "Cours", "MIS 10 0.13")),
      meeting("2026-12-04", "15:15", "17:00", "Cours", "MIS 10 0.13"),
      meeting("2026-12-11", "13:15", "17:00", "Cours", "MIS 10 0.13"),
    ]),
    statistics,
  ];
  plan.scenarios[0].unavailable = [
    {
      id: "dentist",
      label: "Dentist",
      start: "2026-10-07T09:00:00+02:00",
      end: "2026-10-07T10:00:00+02:00",
    },
    {
      id: "ski",
      label: "Ski week",
      start: "2026-12-12T00:00:00+01:00",
      end: "2026-12-19T00:00:00+01:00",
    },
  ];
  return plan;
}

test("the typical semester week prints on exactly one legible A4 landscape page", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await page.goto("/plan");
  await page.evaluate(() => localStorage.setItem("unifr.language", "en"));
  await page.reload();
  await importStudyPlan(page, densePlan());

  // A weekly job entered once through the repeat option.
  await page.goto("/semester/AS-2026");
  const t = plannerMessages.en;
  await page.locator(".availability-form > summary").click();
  await page.getByLabel(t.busyLabel, { exact: true }).fill("Work");
  await page.getByLabel(t.starts, { exact: true }).fill("2026-09-14T18:00");
  await page.getByLabel(t.ends, { exact: true }).fill("2026-09-14T22:00");
  await page.getByLabel(t.repeatUntil, { exact: true }).fill("2026-12-14");
  await page
    .locator(".availability-form")
    .getByRole("button", { name: t.addBusy, exact: true })
    .click();
  await expect(page.locator(".unavailable-list")).toContainText(
    "Work · Mon 18:00–22:00 · 14× (14.09.–14.12.)",
  );
  await expect(page.locator(".save-status")).toHaveText(t.saved);

  for (const language of ["en", "de", "fr"] satisfies Language[]) {
    const x = timetableMessages[language];
    await page.evaluate(
      (value) => localStorage.setItem("unifr.language", value),
      language,
    );
    await page.goto("/semester/AS-2026");
    await page.locator(".calendar-exports > summary").click();
    const exports = page.locator(".calendar-exports");
    // The only overlapping groups were narrowed by the attendance choice.
    await expect(exports.getByText(x.wallAttendanceHint)).toHaveCount(0);
    const popupEvent = page.waitForEvent("popup");
    await exports
      .getByRole("button", {
        name: `${shareMessages[language].wallPrint} · A4 ${x.landscape}`,
        exact: true,
      })
      .click();
    const popup = await popupEvent;
    await expect(popup.locator(".wall-sheet")).toHaveCount(1);
    await expect(popup.locator(".day-head")).toHaveCount(5);
    await expect(popup.locator(".wall-head strong")).toHaveText(
      `${x.typicalWeek} · ${{ en: "Autumn", de: "Herbst", fr: "Automne" }[language]} 2026`,
    );
    await expect(popup.locator(".wall-head p")).toHaveText(
      `14 ${countLabel(language, "classWeek", 14)} · 14.09.2026–18.12.2026`,
    );
    const sheet = popup.locator(".wall-sheet");
    await expect(sheet).toContainText(x.wallEvery2);
    await expect(sheet).toContainText("6×");
    await expect(sheet).toContainText("17.09.–26.11.");
    await expect(popup.locator(".wall-block.personal")).toHaveText([
      /^Work18:00–22:00$/,
    ]);
    await expect(popup.locator(".wall-stack .stack-line")).toHaveCount(4);
    await expect(popup.locator(".wall-notes")).toContainText(
      `${x.wallPersonal}: 1 ${countLabel(language, "oneOff", 1)}`,
    );
    await expect(popup.locator(".wall-notes")).toContainText(
      `${x.wallAway}: Ski week 12.12.–18.12.`,
    );
    await expect(popup.locator(".wall-notes")).toContainText(x.wallAttendance);
    const maths = popup.locator(".wall-block", { hasText: "Analyse I" });
    await expect(maths).toHaveCount(2);
    expect(await maths.nth(0).getAttribute("class")).toBe(
      await maths.nth(1).getAttribute("class"),
    );
    const html = await popup.content();
    for (const hidden of ["2001", "Dentist", "PER 13", "groupe B"])
      expect(html).not.toContain(hidden);

    await popup.emulateMedia({ media: "print" });
    const measured = await popup.evaluate(() => {
      const mm = 96 / 25.4;
      const boxes = [
        ...document.querySelectorAll<HTMLElement>(".wall-block, .wall-stack"),
      ].map((block) => {
        const box = block.getBoundingClientRect(),
          day = block.parentElement!.getBoundingClientRect();
        return {
          text: block.textContent,
          overflowY: block.scrollHeight - block.clientHeight,
          overflowX: block.scrollWidth - block.clientWidth,
          width: box.width / mm,
          inside:
            box.left >= day.left - 0.5 &&
            box.right <= day.right + 0.5 &&
            box.top >= day.top - 0.5 &&
            box.bottom <= day.bottom + 0.5,
        };
      });
      const fonts = [...document.querySelectorAll(".wall-sheet *")]
        .filter((element) =>
          [...element.childNodes].some(
            (node) => node.nodeType === 3 && node.textContent!.trim(),
          ),
        )
        .map((element) => ({
          text: element.textContent,
          pt: (parseFloat(getComputedStyle(element).fontSize) * 72) / 96,
        }));
      const sheet = document.querySelector(".wall-sheet")!;
      return {
        boxes,
        fonts,
        sheet: sheet.getBoundingClientRect().height / mm,
        overflow: sheet.scrollHeight - sheet.clientHeight,
      };
    });
    expect(measured.boxes.length).toBeGreaterThanOrEqual(12);
    for (const box of measured.boxes) {
      expect(box.overflowY, box.text!).toBeLessThanOrEqual(1);
      expect(box.overflowX, box.text!).toBeLessThanOrEqual(1);
      expect(box.width, box.text!).toBeGreaterThanOrEqual(15.95);
      expect(box.inside, box.text!).toBe(true);
    }
    for (const font of measured.fonts)
      expect(font.pt, font.text!).toBeGreaterThanOrEqual(6.49);
    expect(measured.sheet).toBeLessThanOrEqual(190.1);
    expect(measured.overflow).toBeLessThanOrEqual(1);

    const pdf = await popup.pdf({
      path: info.outputPath(`wall-${language}.pdf`),
      preferCSSPageSize: true,
      printBackground: true,
    });
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g)).toHaveLength(
      1,
    );
    await popup.screenshot({
      path: info.outputPath(`wall-${language}.png`),
      fullPage: true,
    });
    await popup.close();
  }
});
