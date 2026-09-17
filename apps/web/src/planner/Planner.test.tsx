import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import App from "../App";
import { PlanStore } from "./storage";
import { createPlan } from "./domain";

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
});
afterEach(() => vi.unstubAllGlobals());
const mount = (path = "/setup") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
it("opens a semester belonging to the active degree from the main navigation", async () => {
  const plan = createPlan({
    id: "future",
    scenarioId: "s",
    name: "Future degree",
    programme: "CS",
    startTerm: "SS-2027",
    semesterCount: 6,
    targetEcts: 180,
  });
  await new PlanStore(indexedDB).save(plan);
  mount("/plan");
  await screen.findByRole("heading", { name: "Future degree" });
  expect(
    within(screen.getByRole("navigation")).getByRole("link", {
      name: "Semester",
    }),
  ).toHaveAttribute("href", "/semester/SS-2027");
});
it("shows only unavailable intervals in the selected semester calendar", async () => {
  const plan = createPlan({
    id: "p",
    scenarioId: "s",
    name: "Degree",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
  plan.scenarios[0].unavailable = [
    {
      id: "a",
      label: "Work autumn",
      start: "2026-09-21T10:00:00Z",
      end: "2026-09-21T11:00:00Z",
    },
    {
      id: "b",
      label: "Work spring",
      start: "2027-03-21T10:00:00Z",
      end: "2027-03-21T11:00:00Z",
    },
  ];
  await new PlanStore(indexedDB).save(plan);
  const app = mount("/semester/AS-2026");
  await screen.findByRole("heading", { name: "Schedule check" });
  const calendar = within(
    app.container.querySelector(".screen-calendar") as HTMLElement,
  );
  expect(calendar.getByText("Work autumn")).toBeVisible();
  expect(calendar.queryByText("Work spring")).not.toBeInTheDocument();
});
it("creates a guest degree, records completion, duplicates independently and restores after remount", async () => {
  const user = userEvent.setup();
  const app = mount();
  await waitFor(() => expect(screen.getByLabelText("Plan name")).toBeEnabled());
  await user.type(await screen.findByLabelText("Plan name"), "CS degree");
  await user.type(screen.getByLabelText("Programme"), "Informatics");
  await user.click(screen.getByRole("button", { name: "Create local plan" }));
  await screen.findByRole("heading", { name: "CS degree" });
  await user.type(screen.getByLabelText("Course title"), "Prior mathematics");
  await user.type(screen.getByLabelText("Course code"), "MATH0");
  await user.type(screen.getByLabelText("Completed ECTS"), "6");
  await user.click(
    screen.getByRole("button", { name: "Add completed course" }),
  );
  await screen.findByText("Prior mathematics");
  expect(
    within(screen.getByRole("region", { name: "Completed" })).getByText(
      "Prior mathematics",
    ),
  ).toBeVisible();
  expect(
    within(screen.getByRole("region", { name: "Unscheduled" })).queryByText(
      "Prior mathematics",
    ),
  ).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("New scenario name"), "Alternative");
  await user.click(screen.getByRole("button", { name: "Duplicate scenario" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Scenario")).toHaveDisplayValue("Alternative"),
  );
  const stored = await new PlanStore(indexedDB).load();
  expect(stored.plans[0].scenarios).toHaveLength(2);
  expect(stored.plans[0].scenarios[0].courses[0].ects).toBe(6);
  app.unmount();
  mount("/plan");
  await screen.findByText("Prior mathematics");
  expect(screen.getByLabelText("Scenario")).toHaveDisplayValue("Alternative");
});
it("validates imports and previews before adding a new plan", async () => {
  const user = userEvent.setup();
  mount("/plan");
  const json = await screen.findByLabelText("Plan JSON");
  await user.type(json, "not json");
  await user.click(screen.getByRole("button", { name: "Preview import" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid plan");
  await user.clear(json);
  const plan = createPlan({
    id: "original",
    scenarioId: "main",
    name: "Imported degree",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
  await user.click(json);
  await user.paste(JSON.stringify(plan));
  await user.click(screen.getByRole("button", { name: "Preview import" }));
  expect(
    await screen.findByRole("heading", { name: "Import preview" }),
  ).toBeVisible();
  expect((await new PlanStore(indexedDB).load()).plans).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Add as new plan" }));
  await screen.findByRole("heading", { name: "Imported degree" });
  const stored = await new PlanStore(indexedDB).load();
  expect(stored.plans[0].id).not.toBe("original");
});
