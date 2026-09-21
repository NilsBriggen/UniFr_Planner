import { expect, test } from "@playwright/test";

const administratorToken = process.env.UNIFR_E2E_ADMIN_TOKEN;

test.skip(
  !administratorToken,
  "deployed operations acceptance requires UNIFR_E2E_ADMIN_TOKEN",
);

test("protected operations UI loads deployed schedule, monitoring and history without retaining its token", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("unifr.language", "en"));
  const unauthenticated = await page.request.get(
    "http://127.0.0.1:4173/api/v1/admin/operations",
  );
  expect(unauthenticated.status()).toBe(401);
  expect(unauthenticated.headers()["cache-control"]).toBe("no-store");

  await page.goto("/admin");
  const input = page.getByLabel("Administrator token", { exact: true });
  await input.fill(administratorToken!);
  await page.getByRole("button", { name: "Load operations" }).click();

  await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
  await expect(page.getByText("daily 05:00 (backup first)")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Monitoring and next runs" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Job history" }),
  ).toBeVisible();
  await expect(page.getByText(/catalogue · rejected/).first()).toBeVisible();
  await expect(input).toHaveValue("");
  expect(
    await page.evaluate(
      (token) =>
        JSON.stringify({
          local: Object.fromEntries(Object.entries(localStorage)),
          session: Object.fromEntries(Object.entries(sessionStorage)),
        }).includes(token),
      administratorToken!,
    ),
  ).toBe(false);

  await page.getByRole("button", { name: "Clear operations" }).click();
  await expect(page.getByRole("heading", { name: "Schedule" })).toHaveCount(0);
});
