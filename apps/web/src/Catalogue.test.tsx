import { afterEach, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { PlanStore } from "./planner/storage";
import { createPlan } from "./planner/domain";
import {
  publishedCourses,
  publishedPlan,
  publishedStatus,
} from "./planner/published-fixture";

afterEach(() => vi.unstubAllGlobals());

it("preserves source line breaks in course detail text", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
  const course = publishedCourses()[0];
  const offering = course.offerings[0];
  offering.assessment =
    "Winter session\nDate: 18 January\nResit session\nDate: 24 August";
  offering.prerequisites = "First course\nSecond course";
  offering.recurrence_summary = "Tuesday 08:15\nWednesday 11:15";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) =>
      Response.json(
        request.url.endsWith("/status/catalogue") ? publishedStatus : course,
      ),
    ),
  );
  render(
    <MemoryRouter initialEntries={[`/catalogue/${course.code}`]}>
      <App />
    </MemoryRouter>,
  );
  for (const value of [
    offering.assessment,
    offering.prerequisites,
    offering.recurrence_summary,
  ]) {
    expect(await screen.findByText(value.replaceAll("\n", " "))).toHaveClass(
      "source-text",
    );
  }
});

it("shows an imported UE code as already added when the plan has its curriculum code", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
  const manual = publishedPlan();
  for (const course of manual.scenarios[0].courses) course.offering = null;
  await new PlanStore(indexedDB).save(manual, null);
  const course = publishedCourses()[0];
  course.code = "UE-SIN.01023";
  course.offerings[0].course.code = course.code;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) =>
      Response.json(
        request.url.endsWith("/status/catalogue") ? publishedStatus : course,
      ),
    ),
  );
  render(
    <MemoryRouter initialEntries={["/catalogue/UE-SIN.01023"]}>
      <App />
    </MemoryRouter>,
  );
  expect(
    await screen.findAllByRole("button", { name: "Remove from semester" }),
  ).not.toHaveLength(0);
  expect(screen.queryByLabelText("Semester")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("keeps advanced filters closed while retaining URL filter chips", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
  const page = {
    status: publishedStatus,
    items: publishedCourses(),
    offset: 0,
    limit: 20,
    total: 2,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) => {
      if (request.url.includes("/terms"))
        return Response.json({
          ...page,
          terms: ["AS-2026"],
          faculties: ["Science"],
          languages: ["en"],
          levels: ["Bachelor"],
        });
      return Response.json(page);
    }),
  );
  render(
    <MemoryRouter initialEntries={["/catalogue?faculty=Science"]}>
      <App />
    </MemoryRouter>,
  );
  const toggle = await screen.findByRole("button", { name: "Filters" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(
    screen.getByRole("button", { name: "Remove: Faculty / domain · Science" }),
  ).toBeVisible();
  await userEvent.click(toggle);
  expect(screen.getByLabelText("Faculty / domain")).toBeVisible();
});

it("keeps unsubmitted filter choices while changing discovery scope", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
  await new PlanStore(indexedDB).save(publishedPlan(), null);
  const page = { status: publishedStatus, items: publishedCourses(), offset: 0, limit: 20, total: 2 };
  vi.stubGlobal("fetch", vi.fn(async (request: Request) => Response.json(
    request.url.includes("/terms")
      ? { terms: ["AS-2026"], faculties: ["Faculty of Science and Medicine, Mathematics"], languages: ["en"], levels: ["Bachelor"] }
      : page,
  )));
  render(<MemoryRouter initialEntries={["/catalogue?term=AS-2026&focus=programme"]}><App /></MemoryRouter>);
  await userEvent.click(await screen.findByRole("button", { name: "Filters" }));
  await userEvent.selectOptions(screen.getByLabelText("Faculty / domain"), "Faculty of Science and Medicine, Mathematics");
  await userEvent.selectOptions(screen.getByLabelText("Study level"), "Bachelor");
  await userEvent.click(screen.getByRole("button", { name: "All courses" }));
  expect(screen.getByLabelText("Faculty / domain")).toHaveValue("Faculty of Science and Medicine, Mathematics");
  expect(screen.getByLabelText("Study level")).toHaveValue("Bachelor");
  expect(screen.getByText("Filters not applied")).toBeVisible();
});

it("extends a short plan to a published offering term before adding it", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
  const plan = createPlan({ id: "short", scenarioId: "s", name: "Short plan", programme: "Economics", startTerm: "AS-2026", semesterCount: 1, targetEcts: 180 });
  await new PlanStore(indexedDB).save(plan, null);
  const courses = publishedCourses();
  for (const course of courses) for (const offering of course.offerings) offering.terms = ["SS-2027"];
  const page = { status: publishedStatus, items: courses, offset: 0, limit: 20, total: courses.length };
  vi.stubGlobal("fetch", vi.fn(async (request: Request) => Response.json(
    request.url.includes("/terms")
      ? { terms: ["SS-2027"], faculties: [], languages: [], levels: [] }
      : page,
  )));
  render(<MemoryRouter initialEntries={["/catalogue?term=SS-2027&focus=all"]}><App /></MemoryRouter>);
  const extend = await screen.findAllByRole("button", { name: "Add Spring 2027 to this plan" });
  await userEvent.click(extend[0]);
  await waitFor(async () => expect((await new PlanStore(indexedDB).load()).plans[0].semesters).toEqual(["AS-2026", "SS-2027"]));
});

it("keeps stale and rejected catalogue explanations distinct", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
  const course = publishedCourses()[0];
  const status = {
    ...publishedStatus,
    stale: true,
    published_at: "2026-09-01T10:00:00Z",
    latest_sync_outcome: "success",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) =>
      Response.json(
        request.url.endsWith("/status/catalogue") ? status : course,
      ),
    ),
  );
  render(
    <MemoryRouter initialEntries={[`/catalogue/${course.code}`]}>
      <App />
    </MemoryRouter>,
  );
  const warning = await screen.findByText(/Stale ·/);
  await userEvent.click(warning.closest("summary")!);
  expect(screen.getByText(/This catalogue snapshot is older/)).toBeVisible();
  expect(
    screen.queryByText(/The source changed during import or validation failed/),
  ).not.toBeInTheDocument();
});
