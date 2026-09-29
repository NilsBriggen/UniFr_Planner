import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { configuredStudyPlan, importStudyPlan } from "./studies-helpers";

test("search stays usable while a complete 3750-course index finds a match beyond page one", async ({
  page,
}, info) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  const fixture = await (
    await page.request.get("/api/v1/catalogue/courses?term=AS-2026")
  ).json();
  const template = fixture.items[0].offerings[0];
  const items = Array.from({ length: 3750 }, (_, index) => {
    const code =
      index === 3749 ? "SIN.01023" : `FILL-${String(index).padStart(4, "0")}`;
    const titles = {
      en:
        index === 3749
          ? "Programming beyond the first page"
          : `Unrelated course ${index}`,
    };
    return {
      code,
      titles,
      offerings: [
        {
          ...template,
          source_id: String(900000 + index),
          course: { code, titles },
          faculty_domain: "Other",
          meetings: [],
          meeting_state: "unresolved",
          prerequisites: "",
        },
      ],
    };
  });
  let releaseIndex!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseIndex = resolve;
  });
  const reads: string[] = [];
  await page.route("**/api/v1/catalogue/discovery?**", async (route) => {
    reads.push(route.request().url());
    await gate;
    await route.fulfill({ json: { status: fixture.status, items } });
  });
  await page.route("**/api/v1/catalogue/courses?**", (route) =>
    route.fulfill({
      json: {
        ...fixture,
        items: items.slice(0, 20),
        total: 3750,
        offset: 0,
        limit: 20,
      },
    }),
  );
  await page.route("**/api/v1/catalogue/courses/SIN.01023", (route) =>
    route.fulfill({ json: items.at(-1) }),
  );
  await importStudyPlan(page, configuredStudyPlan("Large catalogue"));
  const started = Date.now();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Courses", exact: true })
    .click();
  const search = page.getByRole("searchbox");
  await search.fill("typed while matches load");
  const usableMs = Date.now() - started;
  expect(usableMs).toBeLessThan(3000);
  await expect(
    page.getByText("Finding programme matches and checking lesson times…"),
  ).toBeVisible();
  releaseIndex();
  await expect(
    page.getByRole("heading", { name: /Programming beyond the first page/ }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".course-results > li")).toHaveCount(1);
  await expect(search).toHaveValue("typed while matches load");
  expect(
    reads.every((url) => new URL(url).searchParams.get("term") === "AS-2026"),
  ).toBe(true);
  const initialReads = reads.length;
  const returnTimes: number[] = [];
  for (let visit = 0; visit < 3; visit++) {
    await page
      .getByRole("heading", { name: /Programming beyond the first page/ })
      .getByRole("link")
      .click();
    await expect(page.locator(".course-detail")).toBeVisible();
    const back = page.getByRole("link", { name: "Back to catalogue" });
    const returning = Date.now();
    await back.click();
    await expect(page.locator(".course-results > li")).toHaveCount(1);
    returnTimes.push(Date.now() - returning);
    expect(reads).toHaveLength(initialReads);
  }
  // A saved selection must update the analysis without downloading the index.
  const selectionTimes: number[] = [];
  for (let selection = 0; selection < 3; selection++) {
    const selecting = Date.now();
    await page
      .locator(".course-results")
      .getByRole("button", { name: "Add to semester", exact: true })
      .click();
    await expect(page.locator(".selected-courses > li")).toHaveCount(1);
    // Selected requirements are no longer outstanding recommendations.
    await expect(page.locator(".result-count")).toHaveText("0 courses");
    selectionTimes.push(Date.now() - selecting);
    if (selection < 2) {
      const summary = page.locator(".semester-summary-disclosure");
      if ((await summary.getAttribute("open")) === null)
        await summary.locator("summary").click();
      await page.locator(".selected-courses").getByRole("button").click();
      await expect(page.locator(".course-results > li")).toHaveCount(1);
    }
  }
  expect(reads).toHaveLength(initialReads);
  expect(Math.max(...returnTimes)).toBeLessThan(1500);
  expect(Math.max(...selectionTimes.slice(1))).toBeLessThan(2000);
  await writeFile(
    info.outputPath("catalogue-usability.json"),
    JSON.stringify({
      courses: 3750,
      usableMs,
      returnTimes,
      selectionTimes,
      discoveryReads: reads.length,
    }),
  );
  await info.attach("catalogue-usability", {
    body: JSON.stringify({
      courses: 3750,
      usableMs,
      returnTimes,
      selectionTimes,
      discoveryReads: reads.length,
    }),
    contentType: "application/json",
  });
});

test("a catalogue timeout keeps search editable and retry recovers", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("unifr.language", "en");
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = () => timeout(150);
  });
  let fail = true;
  await page.route("**/api/v1/catalogue/courses?**", async (route) => {
    if (fail) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.abort();
    } else await route.continue();
  });
  await page.goto("/catalogue?term=AS-2026");
  await page.getByRole("searchbox").fill("still editable");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: /Algebra/ })).toBeVisible();
});
