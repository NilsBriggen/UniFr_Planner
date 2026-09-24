import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { PlanStore } from "./storage";
import {
  publishedCourses,
  publishedPlan,
  publishedStatus,
} from "./published-fixture";

beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());
it("keeps an unchanged catalogue check in a compact disclosure and errors prominent", async () => {
  localStorage.setItem("unifr.language", "en");
  await new PlanStore(indexedDB).save(publishedPlan(), null);
  let fail = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (fail) throw new Error("offline");
      return Response.json({
        items: publishedCourses(),
        total: 2,
        offset: 0,
        limit: 100,
        status: publishedStatus,
      });
    }),
  );
  render(
    <MemoryRouter initialEntries={["/plan"]}>
      <App />
    </MemoryRouter>,
  );
  const sourceStatus = await screen.findByText(/Catalogue status/);
  expect(sourceStatus).toBeVisible();
  const disclosure = sourceStatus.closest("details");
  expect(disclosure).not.toHaveAttribute("open");
  const unchanged = await within(disclosure!).findByText(
    /No changes to your saved courses/,
  );
  expect(unchanged).not.toBeVisible();
  await userEvent.click(sourceStatus);
  expect(unchanged).toBeVisible();
  const button = screen.getByRole("button", {
    name: "Check catalogue updates",
  });
  expect(button.closest(".no-print")).not.toBeNull();
  fail = true;
  await userEvent.click(button);
  expect(
    await screen.findByText(/Catalogue updates could not be checked/),
  ).toBeVisible();
  expect(
    screen.queryByText(/No changes to your saved courses/),
  ).not.toBeInTheDocument();
});
for (const [language, title, refresh] of [
  [
    "en",
    "Published catalogue changes affect this plan",
    "Check catalogue updates",
  ],
  ["de", "Katalogänderungen betreffen diesen Plan", "Katalogänderungen prüfen"],
  [
    "fr",
    "Des changements du catalogue concernent ce plan",
    "Vérifier les changements du catalogue",
  ],
] as const)
  it(`flags only affected choices in ${language} after an overnight refresh without changing the saved plan`, async () => {
    localStorage.setItem("unifr.language", language);
    const plan = publishedPlan();
    await new PlanStore(indexedDB).save(plan, null);
    const courses = publishedCourses();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          items: courses,
          total: 2,
          offset: 0,
          limit: 100,
          status: publishedStatus,
        }),
      ),
    );
    const mount = () =>
      render(
        <MemoryRouter initialEntries={["/plan"]}>
          <App />
        </MemoryRouter>,
      );
    const view = mount();
    await userEvent.click(
      await screen.findByText(
        /Catalogue status|Katalogstatus|État du catalogue/,
      ),
    );
    const refreshButton = screen.getByRole("button", { name: refresh });
    expect(
      screen.queryByRole("heading", { name: title }),
    ).not.toBeInTheDocument();
    courses[0].offerings[0].meetings[0].starts_at = "2026-09-21T08:30:00Z";
    await userEvent.click(refreshButton);
    const notice = await screen.findByRole("region", { name: title });
    expect(
      within(notice).getByRole("link", { name: /SIN.01023/ }),
    ).toHaveAttribute("href", "/catalogue/SIN.01023");
    expect(notice).not.toHaveTextContent("SIN.01024");
    expect((await new PlanStore(indexedDB).load()).plans[0]).toEqual(plan);
    view.unmount();
    mount();
    expect(await screen.findByRole("region", { name: title })).toBeVisible();
    expect((await new PlanStore(indexedDB).load()).plans[0]).toEqual(plan);
  });
