import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { plannerMessages } from "../src/planner/messages";
import { setupMessages } from "../src/planner/setupMessages";
import { requirementMessages } from "../src/requirements/messages";
import { recipeMessages } from "../src/requirements/recipeMessages";
import { discoveryMessages } from "../src/discovery/messages";
import { catchupMessages } from "../src/planner/catchup-messages";
import { createPlan, type Plan } from "../src/planner/domain";
import {
  chooseComputerScience,
  importStudyPlan,
  openPlanTools,
} from "./studies-helpers";
import type { Language } from "../src/i18n";

async function catalogue(page: Page) {
  const data = await (
    await page.request.get("/api/v1/catalogue/courses?term=AS-2026")
  ).json();
  const source = data.items[0].offerings[0];
  const items = ["UE-SIN.01023", "UNRELATED"].map((code, index) => {
    const titles = {
      en: index ? "Unrelated course" : "Introduction to programming",
    };
    return {
      code,
      titles,
      offerings: [
        {
          ...source,
          course: { code, titles },
          source_id: `studies-${index}`,
          ects: 6,
          prerequisites: "None",
          terms: ["AS-2026"],
        },
      ],
    };
  });
  await page.route("**/api/v1/catalogue/discovery?**", (route) =>
    route.fulfill({ json: { status: data.status, items } }),
  );
  await page.route("**/api/v1/catalogue/courses?**", (route) =>
    route.fulfill({
      json: { ...data, items, total: items.length, offset: 0, limit: 20 },
    }),
  );
}

async function expectSemester(
  page: Page,
  label: string,
  language: Language,
  season: string,
  year: string,
) {
  const part = {
    en: { season: "Season", year: "Year" },
    de: { season: "Jahreszeit", year: "Jahr" },
    fr: { season: "Saison", year: "Année" },
  }[language];
  await expect(
    page.getByLabel(`${label} · ${part.season}`, { exact: true }),
  ).toHaveValue(season);
  await expect(
    page.getByLabel(`${label} · ${part.year}`, { exact: true }),
  ).toHaveValue(year);
}

async function exportPlan(
  page: Page,
  language: Language = "en",
): Promise<Plan> {
  const t = plannerMessages[language];
  await page.goto("/plan");
  await expect(page.locator(".save-status")).toHaveText(t.saved);
  await openPlanTools(page, language);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: t.exportJson, exact: true }).click();
  return JSON.parse(await readFile((await (await download).path())!, "utf8"));
}

for (const language of ["en", "de", "fr"] as const) {
  test(`configured studies drive recommendations and requirements in ${language}`, async ({
    page,
  }, info) => {
    const p = plannerMessages[language],
      s = setupMessages[language],
      r = recipeMessages[language],
      d = discoveryMessages[language];
    await page.addInitScript(
      (lang) => localStorage.setItem("unifr.language", lang),
      language,
    );
    await catalogue(page);
    await page.goto("/setup");
    await chooseComputerScience(page, language, "AS-2026", "SS-2027");
    await expect(page.locator(".setup-review")).toContainText("180 ECTS");
    await page.screenshot({
      path: info.outputPath("studies-preview.png"),
      fullPage: true,
    });
    await page.getByText(s.optional, { exact: true }).click();
    await page
      .getByLabel(p.planName, { exact: true })
      .fill("Configured degree");
    await expect(page.locator(".setup-review")).toContainText("180 ECTS");
    await page.getByRole("button", { name: s.back, exact: true }).click();
    await expectSemester(
      page,
      `${r.minor} · 60 ECTS · ${r.semester}`,
      language,
      "SS",
      "2027",
    );
    await page.getByRole("button", { name: s.continue, exact: true }).click();
    await page.getByText(s.optional, { exact: true }).click();
    await page
      .getByLabel(p.planName, { exact: true })
      .fill("Configured degree");
    await page.getByRole("button", { name: s.start, exact: true }).click();
    await expect(page).toHaveURL(/catalogue\?term=AS-2026&focus=programme$/);
    await expect(
      page.getByRole("button", { name: d.recommended, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".course-results > li")).toHaveCount(1);
    const programming = page.locator(".course-results > li").first();
    await expect(programming).toContainText("UE-SIN.01023");
    await expect(
      programming.locator(".recommendation-contribution"),
    ).toContainText("6");
    await page.screenshot({
      path: info.outputPath("degree-recommendation.png"),
      fullPage: true,
    });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await programming
      .getByRole("button", { name: p.addToSemester, exact: true })
      .click();
    const overview = page.getByRole("complementary", {
      name: d.overview,
      exact: true,
    });
    await expect(overview).toContainText("6 ECTS");
    await expect(page.locator(".course-results > li")).toHaveCount(0);
    await expect(page.getByText(d.noMatches).first()).toBeVisible();
    await page.getByRole("button", { name: d.all, exact: true }).click();
    await expect(page.locator(".course-results > li")).toHaveCount(2);
    await page.goto("/requirements");
    await page
      .getByRole("button", {
        name: {
          en: "Edit studies",
          de: "Studium bearbeiten",
          fr: "Modifier les études",
        }[language],
        exact: true,
      })
      .click();
    await expectSemester(
      page,
      `${r.minor} · 60 ECTS · ${r.semester}`,
      language,
      "SS",
      "2027",
    );
    await page.reload();
    await page
      .getByRole("button", {
        name: {
          en: "Edit studies",
          de: "Studium bearbeiten",
          fr: "Modifier les études",
        }[language],
        exact: true,
      })
      .click();
    await expect(page.getByLabel(r.main, { exact: true })).toHaveValue(
      "bachelor-digitinf-informatics",
    );
    const saved = await exportPlan(page, language);
    expect(saved.degreeSelection?.components[1].startSemester).toBe("SS-2027");
    expect(saved.targetEcts).toBe(180);
    expect(saved.scenarios[0].courses).toHaveLength(1);
    expect(saved.scenarios[0].courses[0].semester).toBe("AS-2026");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("existing unconfigured plans remain usable and keep their courses when studies are added", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  const plan = createPlan({
    id: "existing",
    scenarioId: "main",
    name: "Existing degree",
    programme: "Computer Science",
    startTerm: "AS-2024",
    planningSemester: "AS-2026",
    semesterCount: 8,
    targetEcts: 180,
  });
  plan.scenarios[0].courses.push({
    id: "completed",
    code: "SIN.01023",
    titles: { en: "Prior programming" },
    ects: 6,
    semester: "AS-2024",
    status: "completed",
    pinned: true,
    offering: null,
  });
  await catalogue(page);
  await importStudyPlan(page, plan);
  const completed = page.getByRole("group", {
    name: "Completed",
    exact: true,
  });
  await completed.locator(":scope > summary").click();
  await expect(completed).toContainText("Prior programming");
  await page.goto("/catalogue?term=AS-2026");
  await expect(
    page.getByRole("button", {
      name: discoveryMessages.en.recommended,
      exact: true,
    }),
  ).toHaveCount(0);
  await page.goto("/requirements#study-configuration");
  await chooseComputerScience(page, "en", "AS-2024");
  await page
    .getByRole("button", { name: recipeMessages.en.save, exact: true })
    .click();
  await expect(
    page.getByRole("list", { name: requirementMessages.en.title, exact: true }),
  ).toBeVisible();
  const saved = await exportPlan(page);
  expect(saved.degreeSelection).toBeDefined();
  expect(saved.scenarios).toEqual(plan.scenarios);
  expect(saved.semesters).toEqual(plan.semesters);
  expect(saved.planningSemester).toBe("AS-2026");
  await page.goto("/catalogue?term=AS-2026");
  await expect(
    page.getByRole("button", {
      name: discoveryMessages.en.recommended,
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".course-results > li")).toHaveCount(0);
});

test("a configured continuing student reaches semester recommendations after catch-up", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  await catalogue(page);
  await page.goto("/setup");
  await chooseComputerScience(page, "en", "AS-2024");
  await page.getByText(setupMessages.en.optional, { exact: true }).click();
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("Continuing configured degree");
  await page
    .getByRole("button", { name: setupMessages.en.start, exact: true })
    .click();
  await expect(page).toHaveURL(/\/plan\/completed/);
  await page
    .getByRole("link", { name: catchupMessages.en.later, exact: true })
    .click();
  await expect(page).toHaveURL(/catalogue\?term=AS-2026&focus=programme$/);
  await expect(page.locator(".course-results > li")).toHaveCount(1);
});
