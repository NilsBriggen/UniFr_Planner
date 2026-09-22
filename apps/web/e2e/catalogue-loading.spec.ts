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
  await writeFile(
    info.outputPath("catalogue-usability.json"),
    JSON.stringify({ courses: 3750, usableMs, discoveryReads: reads.length }),
  );
  await info.attach("catalogue-usability", {
    body: JSON.stringify({
      courses: 3750,
      usableMs,
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
