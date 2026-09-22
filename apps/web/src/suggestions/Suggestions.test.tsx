import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { PlanStore } from "../planner/storage";
import { createExample } from "./seed";
import { suggestionMessages } from "./messages";
import {
  publishedCourses,
  publishedPlan,
  publishedStatus,
} from "../planner/published-fixture";

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
});
afterEach(() => vi.unstubAllGlobals());
it("loads published alternatives for the selected CS plus BI plan and preserves the pinned course", async () => {
  const plan = publishedPlan();
  await new PlanStore(indexedDB).save(plan);
  const courses = publishedCourses();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        terms: ["AS-2026", "SS-2027"],
        items: courses,
        total: 2,
        offset: 0,
        limit: 100,
        status: publishedStatus,
      }),
    ),
  );
  render(
    <MemoryRouter initialEntries={["/suggestions"]}>
      <App />
    </MemoryRouter>,
  );
  await userEvent.click(
    (await screen.findAllByRole("button", { name: /Compare/ }))[0],
  );
  const comparison = screen.getByRole("region", {
    name: "Compare this change",
  });
  expect(comparison).toHaveTextContent("alternative-programming");
  expect(comparison).toHaveTextContent("1 → 0");
  expect(comparison).toHaveTextContent("published-2");
  await userEvent.click(within(comparison).getByRole("checkbox"));
  courses[0].offerings[1].meetings[0].starts_at = "2026-09-21T12:00:00Z";
  courses[0].offerings[1].meetings[0].ends_at = "2026-09-21T13:00:00Z";
  await userEvent.click(
    screen.getByRole("button", { name: "Check catalogue updates" }),
  );
  const refreshed = await screen.findByRole("region", {
    name: "Compare this change",
  });
  expect(within(refreshed).getByRole("checkbox")).not.toBeChecked();
  await userEvent.click(within(refreshed).getByRole("checkbox"));
  await userEvent.click(
    within(refreshed).getByRole("button", { name: "Apply this change" }),
  );
  await screen.findByText(
    "Change saved. Your previous plan is available with Undo.",
  );
  const saved = (await new PlanStore(indexedDB).load()).plans[0];
  expect(saved.scenarios[0].courses[1]).toEqual(plan.scenarios[0].courses[1]);
  expect(saved.scenarios[0].courses[0].offering?.source_id).toBe(
    "alternative-programming",
  );
  expect(saved.requirements).toEqual(plan.requirements);
});
for (const [language, remaining, courses] of [
  ["en", "Remaining ECTS", "Missing courses"],
  ["de", "Fehlende ECTS", "Fehlende Kurse"],
  ["fr", "ECTS restants", "Cours manquants"],
] as const)
  it(`shows localized affected requirements and exact before/after quantities in ${language}`, async () => {
    localStorage.setItem("unifr.language", language);
    const plan = createExample("impact", "Impact");
    plan.scenarios[0].courses[0].ects = 4;
    await new PlanStore(indexedDB).save(plan);
    render(
      <MemoryRouter initialEntries={["/suggestions"]}>
        <App />
      </MemoryRouter>,
    );
    const t = suggestionMessages[language];
    await userEvent.click(
      (
        await screen.findAllByRole("button", { name: new RegExp(t.compare) })
      )[0],
    );
    const comparison = screen.getByRole("region", { name: t.comparison });
    const changes = within(comparison).getByRole("list", {
      name: {
        en: "Requirement changes",
        de: "Änderungen an Anforderungen",
        fr: "Évolution des exigences",
      }[language],
    });
    expect(changes).toHaveTextContent(
      plan.scenarios[0].courses[0].titles[language],
    );
    expect(changes).toHaveTextContent(`${remaining}: 2 → 0`);
    expect(changes).toHaveTextContent(`${courses}: 0 → 0`);
    expect((await new PlanStore(indexedDB).load()).plans[0]).toEqual(plan);
  });
it("opens an explicit seeded example, compares without saving, applies and undoes after reload", async () => {
  const mount = () =>
    render(
      <MemoryRouter initialEntries={["/suggestions"]}>
        <App />
      </MemoryRouter>,
    );
  let view = mount();
  const example = await screen.findByRole("button", {
    name: "Open a separate example plan",
  });
  await waitFor(() => expect(example).toBeEnabled());
  await userEvent.click(example);
  await screen.findAllByRole("button", { name: /Compare/ });
  for (const route of [
    "Alternative offering",
    "Equivalent course",
    "Eligible elective",
    "Later semester",
  ])
    expect(screen.getByRole("list", { name: "Suggestions" })).toHaveTextContent(
      route,
    );
  const store = new PlanStore(indexedDB),
    original = (await store.load()).plans[0];
  await userEvent.click(screen.getAllByRole("button", { name: /Compare/ })[0]);
  const comparison = screen.getByRole("region", {
    name: "Compare this change",
  });
  expect(within(comparison).getByText("Uncertainty and limits")).toBeVisible();
  expect(within(comparison).getByText(/Why this position/)).toBeVisible();
  expect((await store.load()).plans[0]).toEqual(original);
  expect(
    within(comparison).getByRole("button", { name: "Apply this change" }),
  ).toBeDisabled();
  await userEvent.click(within(comparison).getByRole("checkbox"));
  await userEvent.click(
    within(comparison).getByRole("button", { name: "Apply this change" }),
  );
  await screen.findByText(
    "Change saved. Your previous plan is available with Undo.",
  );
  expect((await store.load()).plans[0]).not.toEqual(original);
  view.unmount();
  view = mount();
  await userEvent.click(
    await screen.findByRole("button", { name: "Undo last suggestion" }),
  );
  await screen.findByText("Previous plan restored exactly.");
  expect((await store.load()).plans[0]).toEqual(original);
  view.unmount();
});
