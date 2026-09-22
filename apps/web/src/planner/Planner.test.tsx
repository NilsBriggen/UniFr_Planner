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
it("warns about unreadable records without hiding a usable saved plan", async () => {
  const plan = createPlan({
    id: "good",
    scenarioId: "s",
    name: "Recovered degree",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
  await new PlanStore(indexedDB).save(plan, null);
  await new Promise<void>((resolve) => {
    const open = indexedDB.open("unifr-planner");
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("plans", "readwrite");
      tx.objectStore("plans").put({ id: "bad", schemaVersion: 99 });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
  });
  mount("/plan");
  await screen.findByRole("heading", { name: "Recovered degree" });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Some saved plans could not be opened",
  );
  expect(
    screen.getByRole("button", { name: "Export plan JSON" }),
  ).toBeEnabled();
});
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
  await new PlanStore(indexedDB).save(plan, null);
  mount("/plan");
  await screen.findByRole("heading", { name: "Future degree" });
  expect(
    within(
      screen.getByRole("navigation", { name: "Main navigation" }),
    ).getByRole("link", {
      name: "Timetable",
    }),
  ).toHaveAttribute("href", "/semester/SS-2027");
});

it("expands only the planning semester and keeps tools in one disclosure", async () => {
  const plan = createPlan({
    id: "focus",
    scenarioId: "s",
    name: "Focused plan",
    programme: "CS",
    startTerm: "AS-2026",
    planningSemester: "SS-2027",
    semesterCount: 3,
    targetEcts: 180,
  });
  plan.scenarios[0].courses.push(
    {
      id: "known",
      code: "KNOWN",
      titles: { en: "Known course" },
      ects: 6,
      status: "planned",
      semester: "SS-2027",
      pinned: false,
      offering: null,
    },
    {
      id: "unknown",
      code: "UNKNOWN",
      titles: { en: "Unknown course" },
      ects: null,
      status: "planned",
      semester: "AS-2027",
      pinned: false,
      offering: null,
    },
  );
  await new PlanStore(indexedDB).save(plan, null);
  mount("/plan");
  const planning = await screen.findByRole("group", { name: /SS-2027/ });
  expect(within(planning).getByText("Known course")).toBeVisible();
  const other = screen.getByRole("group", { name: /AS-2027/ });
  expect(other).not.toHaveAttribute("open");
  expect(within(other).queryByText("Unknown course")).not.toBeVisible();
  expect(within(other).getByText(/0 ECTS · 1 Unknown ECTS/)).toBeVisible();
  expect(
    screen.getByRole("group", { name: "Plan settings and backups" }),
  ).not.toHaveAttribute("open");
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
  await new PlanStore(indexedDB).save(plan, null);
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
  let app = mount();
  await user.click(
    await screen.findByRole("button", {
      name: "My programme or combination is missing",
    }),
  );
  await waitFor(() => expect(screen.getByLabelText("Plan name")).toBeEnabled());
  await user.clear(await screen.findByLabelText("Plan name"));
  await user.type(screen.getByLabelText("Plan name"), "CS degree");
  await user.clear(screen.getByLabelText("Programme"));
  await user.type(screen.getByLabelText("Programme"), "Informatics");
  await user.click(screen.getByRole("button", { name: "Start planning" }));
  await waitFor(async () =>
    expect((await new PlanStore(indexedDB).load()).plans).toHaveLength(1),
  );
  app.unmount();
  app = mount("/plan");
  await screen.findByRole("heading", { name: "CS degree" });
  await user.type(screen.getByLabelText("Course title"), "Prior mathematics");
  await user.type(screen.getByLabelText("Course code"), "MATH0");
  await user.type(screen.getByLabelText("Completed ECTS"), "6");
  await user.click(
    screen.getByRole("button", { name: "Add completed course" }),
  );
  await screen.findByText("Prior mathematics");
  const completed = screen.getByRole("group", { name: "Completed" });
  await user.click(
    within(completed).getByRole("heading", { name: "Completed" }),
  );
  expect(within(completed).getByText("Prior mathematics")).toBeVisible();
  expect(
    within(screen.getByRole("group", { name: "Unscheduled" })).queryByText(
      "Prior mathematics",
    ),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("heading", { name: "Plan settings and backups" }),
  );
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
it("creates a configured degree atomically with its derived credits and component starts", async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByLabelText("Faculty");
  await user.selectOptions(
    screen.getByLabelText("Faculty"),
    "science-medicine",
  );
  await user.selectOptions(
    screen.getByLabelText("Main programme"),
    "bachelor-digitinf-informatics",
  );
  await waitFor(() =>
    expect(screen.getByText("Variant / track: 120 ECTS")).toBeVisible(),
  );
  await user.selectOptions(
    screen.getByLabelText("Degree structure"),
    "ba-120-60",
  );
  await user.selectOptions(
    screen.getByLabelText("Minor · 60 ECTS"),
    "bachelor-digitinf-businessinformatics/minor-60",
  );
  await user.click(
    screen.getByLabelText("This component started in a different semester"),
  );
  await user.selectOptions(
    screen.getByLabelText("Minor · 60 ECTS · Starting semester · Season"),
    "SS",
  );
  await user.clear(
    screen.getByLabelText("Minor · 60 ECTS · Starting semester · Year"),
  );
  await user.type(
    screen.getByLabelText("Minor · 60 ECTS · Starting semester · Year"),
    "2027",
  );
  await user.click(screen.getByRole("button", { name: "Review and start" }));
  await user.clear(screen.getByLabelText("Plan name"));
  await user.type(screen.getByLabelText("Plan name"), "My informatics degree");
  await user.click(screen.getByRole("button", { name: "Start planning" }));
  const stored = (await new PlanStore(indexedDB).load()).plans;
  expect(stored).toHaveLength(1);
  expect(stored[0].targetEcts).toBe(180);
  expect(stored[0].degreeSelection?.components[1].startSemester).toBe(
    "SS-2027",
  );
  expect(stored[0].programme).toContain("Informatics");
});

it("keeps manual setup explicit and requires its programme and ECTS", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(
    await screen.findByRole("button", {
      name: "My programme or combination is missing",
    }),
  );
  expect(screen.getByLabelText("Programme")).toBeRequired();
  expect(screen.getByLabelText("Degree target (ECTS)")).toBeRequired();
  expect(screen.getByLabelText("Degree")).not.toBeVisible();
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
