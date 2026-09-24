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

it("puts the offering action before assignment details and keeps other source assignments available", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
  const plan = createPlan({
    id: "assignment-plan",
    scenarioId: "s",
    name: "Study",
    programme: "Computer Science",
    startTerm: "AS-2026",
    semesterCount: 2,
    targetEcts: 180,
  });
  plan.degreeSelection = {
    structureId: "ba-120-60",
    components: [
      {
        slotId: "major",
        programmeId: "bachelor-digitinf-informatics",
        variantId: "major-120",
        startSemester: "AS-2026",
        recipeVersion: "2026-27.1",
      },
    ],
  };
  await new PlanStore(indexedDB).save(plan, null);
  const course = publishedCourses()[0];
  course.offerings[0].assignments = [
    { programme: "Other programme", version: "old", paths: ["Other path"] },
    {
      programme: "Computer Science 120",
      version: "2022_1/V_01",
      paths: ["2nd-3rd year", "BSc Computer Science"],
    },
  ];
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
  const article = (await screen.findByText("Other programme")).closest(
    "article",
  )!;
  const action = article.querySelector(".course-detail-primary-actions")!;
  const assignments = article.querySelector(".assignment-context")!;
  expect(
    action.compareDocumentPosition(assignments) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  await waitFor(() =>
    expect(screen.getByText("Computer Science 120")).toBeVisible(),
  );
  const other = screen.getByText("Other programme");
  const disclosure = other.closest("details")!;
  expect(disclosure).not.toHaveAttribute("open");
  expect(disclosure.querySelector("summary")).toHaveTextContent("1");
  await userEvent.click(disclosure.querySelector("summary")!);
  expect(other).toBeVisible();
});

it("keeps optional discovery controls collapsed while preserving their choices", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
  await new PlanStore(indexedDB).save(publishedPlan(), null);
  const courses = publishedCourses();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) =>
      Response.json(
        request.url.includes("/terms")
          ? { terms: ["AS-2026"], faculties: [], languages: [], levels: [] }
          : {
              status: publishedStatus,
              items: courses,
              offset: 0,
              limit: 20,
              total: courses.length,
            },
      ),
    ),
  );
  render(
    <MemoryRouter initialEntries={["/catalogue?term=AS-2026&focus=all&fits=1"]}>
      <App />
    </MemoryRouter>,
  );
  const optional = await screen.findByText("Prefer curriculum stage");
  const disclosure = optional.closest("details")!;
  expect(disclosure).not.toHaveAttribute("open");
  expect(
    screen.getAllByRole("button", { name: "All courses" })[0],
  ).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(disclosure.querySelector("summary")!);
  expect(screen.getByLabelText("Prefer curriculum stage")).toBeVisible();
  expect(screen.getByLabelText("Only courses that fit")).toBeChecked();
});

it("shows a published meeting preview on cards without a study plan", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
  const courses = publishedCourses();
  courses[0].offerings[0].schedule_summary = "Tuesday 10:15, Room 101";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) =>
      Response.json(
        request.url.includes("/terms")
          ? { terms: ["AS-2026"], faculties: [], languages: [], levels: [] }
          : {
              status: publishedStatus,
              items: courses,
              offset: 0,
              limit: 20,
              total: courses.length,
            },
      ),
    ),
  );
  render(
    <MemoryRouter initialEntries={["/catalogue"]}>
      <App />
    </MemoryRouter>,
  );
  expect(await screen.findByText("Tuesday 10:15, Room 101")).toBeVisible();
});

it("keeps unsubmitted filter choices while changing discovery scope", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
  await new PlanStore(indexedDB).save(publishedPlan(), null);
  const page = {
    status: publishedStatus,
    items: publishedCourses(),
    offset: 0,
    limit: 20,
    total: 2,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) =>
      Response.json(
        request.url.includes("/terms")
          ? {
              terms: ["AS-2026"],
              faculties: ["Faculty of Science and Medicine, Mathematics"],
              languages: ["en"],
              levels: ["Bachelor"],
            }
          : page,
      ),
    ),
  );
  render(
    <MemoryRouter initialEntries={["/catalogue?term=AS-2026&focus=programme"]}>
      <App />
    </MemoryRouter>,
  );
  await userEvent.click(await screen.findByRole("button", { name: "Filters" }));
  await userEvent.selectOptions(
    screen.getByLabelText("Faculty / domain"),
    "Faculty of Science and Medicine, Mathematics",
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Study level"),
    "Bachelor",
  );
  await userEvent.click(
    screen.getAllByRole("button", { name: "All courses" })[0],
  );
  expect(screen.getByLabelText("Faculty / domain")).toHaveValue(
    "Faculty of Science and Medicine, Mathematics",
  );
  expect(screen.getByLabelText("Study level")).toHaveValue("Bachelor");
  expect(screen.getByText("Filters not applied")).toBeVisible();
});

it("extends a short plan to a published offering term before adding it", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
  const plan = createPlan({
    id: "short",
    scenarioId: "s",
    name: "Short plan",
    programme: "Economics",
    startTerm: "AS-2026",
    semesterCount: 1,
    targetEcts: 180,
  });
  await new PlanStore(indexedDB).save(plan, null);
  const courses = publishedCourses();
  for (const course of courses)
    for (const offering of course.offerings) offering.terms = ["SS-2027"];
  const page = {
    status: publishedStatus,
    items: courses,
    offset: 0,
    limit: 20,
    total: courses.length,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) =>
      Response.json(
        request.url.includes("/terms")
          ? { terms: ["SS-2027"], faculties: [], languages: [], levels: [] }
          : page,
      ),
    ),
  );
  render(
    <MemoryRouter initialEntries={["/catalogue?term=SS-2027&focus=all"]}>
      <App />
    </MemoryRouter>,
  );
  const extend = await screen.findAllByRole("button", {
    name: "Add Spring 2027 to this plan",
  });
  await userEvent.click(extend[0]);
  await waitFor(async () =>
    expect((await new PlanStore(indexedDB).load()).plans[0].semesters).toEqual([
      "AS-2026",
      "SS-2027",
    ]),
  );
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
