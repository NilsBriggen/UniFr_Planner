import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import App from "../App";
import { PlanStore } from "./storage";
import { activeScenario, createPlan } from "./domain";

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const mount = (path = "/plan/completed") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
async function seed() {
  const plan = createPlan({
    id: "p",
    scenarioId: "s",
    name: "Degree",
    programme: "CS",
    startTerm: "AS-2024",
    planningSemester: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
  await new PlanStore(indexedDB).save(plan, null);
  return plan;
}
const offering = {
  course: { code: "HIST.1", titles: { en: "Historical mathematics" } },
  source_id: "historic",
  terms: ["AS-2024"],
  ects: 5,
  assignments: [],
  meetings: [],
  meeting_state: "unresolved",
  source_url: "https://example.org/archive",
  snapshot_id: "archive-2024",
};
function archive() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request | string) => {
      const url = typeof request === "string" ? request : request.url;
      if (url.includes("/terms?scope=history"))
        return new Response(
          JSON.stringify({
            coverage: [
              {
                term: "AS-2024",
                status: "available",
                snapshot_id: "archive-2024",
              },
              { term: "SS-2025", status: "pending" },
            ],
          }),
        );
      if (url.includes("scope=history"))
        return new Response(
          JSON.stringify({
            items: [{ ...offering.course, offerings: [offering] }],
            total: 1,
            offset: 0,
            limit: 20,
            status: { development_fixture: false, snapshot_id: "current-2026" },
          }),
        );
      return new Response("{}", { status: 503 });
    }),
  );
}
it("sets start and planning separately, extends semester range and offers skippable catch-up", async () => {
  archive();
  const user = userEvent.setup();
  mount("/setup?returnTo=%2Fcatalogue%3Fterm%3DAS-2026");
  await user.click(
    await screen.findByRole("button", {
      name: "My programme or combination is missing",
    }),
  );
  await waitFor(() => expect(screen.getByLabelText("Plan name")).toBeEnabled());
  await user.clear(screen.getByLabelText("Plan name"));
  await user.type(screen.getByLabelText("Plan name"), "My degree");
  await user.clear(screen.getByLabelText("Programme"));
  await user.type(screen.getByLabelText("Programme"), "CS");
  await user.clear(screen.getByLabelText("Study start · Year"));
  await user.type(screen.getByLabelText("Study start · Year"), "2024");
  await user.selectOptions(screen.getByLabelText("Study start · Season"), "AS");
  await user.selectOptions(
    screen.getByLabelText("Planning semester · Season"),
    "AS",
  );
  await user.clear(screen.getByLabelText("Planning semester · Year"));
  await user.type(screen.getByLabelText("Planning semester · Year"), "2026");
  await user.clear(screen.getByLabelText("Number of semesters"));
  await user.type(screen.getByLabelText("Number of semesters"), "2");
  await user.click(screen.getByRole("button", { name: "Start planning" }));
  await screen.findByRole("heading", { name: "Record completed courses" });
  expect(screen.getByRole("link", { name: "Resume later" })).toHaveAttribute(
    "href",
    "/catalogue?term=AS-2026",
  );
  const saved = (await new PlanStore(indexedDB).load()).plans[0];
  expect(saved.semesters).toHaveLength(5);
  expect(saved.semesters[0]).toBe("AS-2024");
  expect(saved.planningSemester).toBe("AS-2026");
  expect(activeScenario(saved).courses).toHaveLength(0);
});
it("saves reviewed history provenance and manual ECTS, then edits and removes the manual record", async () => {
  await seed();
  archive();
  const user = userEvent.setup();
  const app = mount();
  await user.click(
    await screen.findByRole("checkbox", { name: /Historical mathematics/ }),
  );
  await user.click(
    screen.getByRole("button", { name: "Review selected courses" }),
  );
  await user.clear(
    screen.getByLabelText("Earned ECTS · Historical mathematics"),
  );
  await user.type(
    screen.getByLabelText("Earned ECTS · Historical mathematics"),
    "6",
  );
  await user.click(
    screen.getByRole("button", { name: "Save completed courses" }),
  );
  await screen.findByRole("heading", { name: "Historical mathematics" });
  await user.type(
    screen.getByLabelText("Course title"),
    "Earlier language course",
  );
  await user.type(screen.getByLabelText("Completed ECTS"), "3");
  await user.click(
    screen.getByRole("button", { name: "Add completed course" }),
  );
  await screen.findByText("No course code · 3 ECTS");
  let saved = (await new PlanStore(indexedDB).load()).plans[0];
  expect(activeScenario(saved).courses[0]).toMatchObject({
    semester: "AS-2024",
    status: "completed",
    ects: 6,
    offering: { snapshot_id: "archive-2024", source_id: "historic" },
  });
  expect(activeScenario(saved).courses[1]).toMatchObject({
    semester: null,
    status: "completed",
    ects: 3,
    offering: null,
  });
  expect(activeScenario(saved).courses[1].code).toMatch(/^MANUAL-/);
  app.unmount();
  mount();
  await screen.findByRole("heading", { name: "Earlier language course" });
  await user.click(
    screen.getByRole("button", { name: "Edit · Earlier language course" }),
  );
  await user.clear(screen.getByLabelText("Completed ECTS"));
  await user.type(screen.getByLabelText("Completed ECTS"), "4");
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText("No course code · 4 ECTS");
  await user.click(
    screen.getByRole("button", { name: "Remove · Earlier language course" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Earlier language course" }),
    ).not.toBeInTheDocument(),
  );
  saved = (await new PlanStore(indexedDB).load()).plans[0];
  expect(activeScenario(saved).courses).toHaveLength(1);
});
it("keeps manual values after persistence failure while archive is offline", async () => {
  await seed();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const user = userEvent.setup();
  mount();
  await screen.findByText(/The archive could not be loaded/);
  await user.type(screen.getByLabelText("Course title"), "Must remain");
  await user.type(screen.getByLabelText("Completed ECTS"), "4");
  vi.spyOn(PlanStore.prototype, "save").mockRejectedValueOnce(
    new Error("quota"),
  );
  await user.click(
    screen.getByRole("button", { name: "Add completed course" }),
  );
  await screen.findByText(
    "The change could not be saved. Check the values and try again.",
  );
  expect(screen.getByLabelText("Course title")).toHaveValue("Must remain");
  expect(screen.getByLabelText("Completed ECTS")).toHaveValue(4);
  expect(
    activeScenario((await new PlanStore(indexedDB).load()).plans[0]).courses,
  ).toHaveLength(0);
  await user.click(
    screen.getByRole("button", { name: "Add completed course" }),
  );
  await screen.findByRole("heading", { name: "Must remain" });
  expect(screen.getByLabelText("Course title")).toHaveValue("");
});
it("requires explicit manual completion of an existing code and prevents double credit", async () => {
  const plan = await seed();
  const baseline = structuredClone(plan);
  plan.scenarios[0].courses.push({
    id: "existing",
    code: "SIN.001",
    titles: { en: "Existing" },
    ects: 6,
    semester: "AS-2026",
    status: "planned",
    pinned: false,
    offering: null,
  });
  await new PlanStore(indexedDB).save(plan, baseline);
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const user = userEvent.setup();
  mount();
  await user.type(
    await screen.findByLabelText("Course title"),
    "Passed existing",
  );
  await user.type(screen.getByLabelText("Course code"), "UE-SIN.001");
  await user.type(screen.getByLabelText("Completed ECTS"), "5");
  await user.click(
    screen.getByRole("button", { name: "Add completed course" }),
  );
  expect(
    activeScenario((await new PlanStore(indexedDB).load()).plans[0]).courses[0]
      .status,
  ).toBe("planned");
  await user.click(
    screen.getByRole("button", { name: "Mark existing course completed" }),
  );
  await waitFor(() =>
    expect(
      within(
        screen.getByRole("region", { name: "Recorded completed courses" }),
      ).getByText("Earned ECTS: 5 ECTS"),
    ).toBeVisible(),
  );
  const records = activeScenario(
    (await new PlanStore(indexedDB).load()).plans[0],
  ).courses;
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    id: "existing",
    status: "completed",
    ects: 5,
  });
});

it("distinguishes importing archives and resumes the chosen term without claiming completion", async () => {
  await seed();
  archive();
  const user = userEvent.setup();
  const app = mount();
  await screen.findByRole("checkbox", { name: /Historical mathematics/ });
  const archiveRegion = within(
    screen.getByRole("region", { name: "Search archived courses" }),
  );
  await user.selectOptions(archiveRegion.getByLabelText("Semester"), "SS-2025");
  await screen.findByText(/This semester’s archive is being prepared/);
  expect(screen.getByLabelText("Course title")).toBeEnabled();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(
    activeScenario((await new PlanStore(indexedDB).load()).plans[0]).courses,
  ).toHaveLength(0);
  app.unmount();
  mount();
  await screen.findByText(/This semester’s archive is being prepared/);
  expect(
    within(
      screen.getByRole("region", { name: "Search archived courses" }),
    ).getByLabelText("Semester"),
  ).toHaveValue("SS-2025");
});

it("requires a deliberate archive checkbox to complete an existing selection and respects a pinned course", async () => {
  const plan = await seed();
  const baseline = structuredClone(plan);
  plan.scenarios[0].courses.push({
    id: "existing",
    code: "HIST.1",
    titles: { en: "Existing maths" },
    ects: 5,
    semester: "AS-2026",
    status: "planned",
    pinned: true,
    offering: null,
  });
  await new PlanStore(indexedDB).save(plan, baseline);
  archive();
  const user = userEvent.setup();
  const app = mount();
  expect(
    await screen.findByRole("checkbox", { name: /Historical mathematics/ }),
  ).toBeDisabled();
  expect(screen.getByText(/This course is pinned/)).toBeVisible();
  app.unmount();
  const pinnedBaseline = structuredClone(plan);
  plan.scenarios[0].courses[0].pinned = false;
  await new PlanStore(indexedDB).save(plan, pinnedBaseline);
  mount();
  const checkbox = await screen.findByRole("checkbox", {
    name: /Mark existing course completed/,
  });
  expect(
    activeScenario((await new PlanStore(indexedDB).load()).plans[0]).courses[0]
      .status,
  ).toBe("planned");
  await user.click(checkbox);
  await user.click(
    screen.getByRole("button", { name: "Review selected courses" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Save completed courses" }),
  );
  await screen.findByRole("heading", { name: "Historical mathematics" });
  const records = activeScenario(
    (await new PlanStore(indexedDB).load()).plans[0],
  ).courses;
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    id: "existing",
    status: "completed",
    semester: "AS-2024",
    offering: { snapshot_id: "archive-2024" },
  });
});

it("shows term-specific archive availability, retains a failed-refresh archive, and explains recheck", async () => {
  await seed();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request | string) => {
      const url = typeof request === "string" ? request : request.url;
      if (url.includes("/terms?scope=history"))
        return new Response(
          JSON.stringify({
            coverage: [
              {
                term: "AS-2024",
                status: "failed",
                checked_at: "2026-09-20T10:00:00+00:00",
                refresh_failed: false,
              },
              {
                term: "SS-2025",
                status: "available",
                snapshot_id: "archive-2025",
                checked_at: "2026-09-21T10:00:00+00:00",
                refresh_failed: true,
              },
            ],
          }),
        );
      if (url.includes("scope=history"))
        return new Response(
          JSON.stringify({
            items: [
              {
                ...offering.course,
                offerings: [
                  {
                    ...offering,
                    terms: ["SS-2025"],
                    snapshot_id: "archive-2025",
                  },
                ],
              },
            ],
            total: 1,
            offset: 0,
            limit: 20,
            status: { development_fixture: false, snapshot_id: "archive-2025" },
          }),
        );
      return new Response("{}", { status: 503 });
    }),
  );
  const user = userEvent.setup();
  mount();
  const archiveRegion = await screen.findByRole("region", {
    name: "Search archived courses",
  });
  expect(
    await within(archiveRegion).findByText(/AS-2024.*Retrieval failed/),
  ).toBeVisible();
  expect(
    within(archiveRegion).getByText(
      /SS-2025.*Published archive retained after refresh failed/,
    ),
  ).toBeVisible();
  expect(
    within(archiveRegion).getByRole("button", { name: "Recheck availability" }),
  ).toBeVisible();
  expect(
    within(archiveRegion).getByText(
      /Rechecking does not rerun the server archive import/,
    ),
  ).toBeVisible();
  await user.selectOptions(
    within(archiveRegion).getByLabelText("Semester"),
    "SS-2025",
  );
  expect(
    await within(archiveRegion).findByRole("checkbox", {
      name: /Historical mathematics/,
    }),
  ).toBeEnabled();
});

it("saves approximate prior-study context without creating a completed course or earned credits", async () => {
  await seed();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const user = userEvent.setup();
  const app = mount();
  await user.type(
    await screen.findByLabelText("Prior institution"),
    "University elsewhere",
  );
  await user.type(screen.getByLabelText("Study period"), "2021–2024");
  await user.type(screen.getByLabelText("Approximate ECTS"), "90");
  await user.selectOptions(
    screen.getByLabelText("Recognition status"),
    "recognition_pending",
  );
  await user.type(
    screen.getByLabelText("Context notes"),
    "Transcript requested",
  );
  await user.click(
    screen.getByRole("button", { name: "Save prior-study context" }),
  );
  expect(
    await screen.findByText(/University elsewhere.*90 ECTS/),
  ).toBeVisible();
  const saved = (await new PlanStore(indexedDB).load()).plans[0];
  expect(activeScenario(saved).courses).toHaveLength(0);
  expect(activeScenario(saved).priorStudy).toMatchObject([
    {
      institution: "University elsewhere",
      period: "2021–2024",
      approximateEcts: 90,
      status: "recognition_pending",
      notes: "Transcript requested",
    },
  ]);
  app.unmount();
  mount();
  expect(
    await screen.findByText(/University elsewhere.*90 ECTS/),
  ).toBeVisible();
});

it("retries a temporary archive read failure without clearing manual entry", async () => {
  await seed();
  let termsCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request | string) => {
      const url = typeof request === "string" ? request : request.url;
      if (url.includes("/terms?scope=history")) {
        termsCalls += 1;
        if (termsCalls === 1) throw new Error("temporary network failure");
        return new Response(
          JSON.stringify({
            coverage: [
              {
                term: "AS-2024",
                status: "available",
                snapshot_id: "archive-2024",
                refresh_failed: false,
              },
            ],
          }),
        );
      }
      if (url.includes("scope=history"))
        return new Response(
          JSON.stringify({
            items: [{ ...offering.course, offerings: [offering] }],
            total: 1,
            offset: 0,
            limit: 20,
            status: { development_fixture: false, snapshot_id: "archive-2024" },
          }),
        );
      return new Response("{}", { status: 503 });
    }),
  );
  const user = userEvent.setup();
  mount();
  await screen.findByRole("button", { name: "Retry loading" });
  await user.type(screen.getByLabelText("Course title"), "Manual draft");
  await user.click(screen.getByRole("button", { name: "Retry loading" }));
  expect(
    await screen.findByRole("checkbox", { name: /Historical mathematics/ }),
  ).toBeEnabled();
  expect(screen.getByLabelText("Course title")).toHaveValue("Manual draft");
});

it("retries only course loading when coverage is already published", async () => {
  await seed();
  let termsCalls = 0;
  let courseCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request | string) => {
      const url = typeof request === "string" ? request : request.url;
      if (url.includes("/terms?scope=history")) {
        termsCalls += 1;
        return new Response(
          JSON.stringify({
            coverage: [
              {
                term: "AS-2024",
                status: "available",
                snapshot_id: "archive-2024",
                refresh_failed: false,
              },
            ],
          }),
        );
      }
      if (url.includes("scope=history")) {
        courseCalls += 1;
        if (courseCalls === 1) throw new Error("temporary read failure");
        return new Response(
          JSON.stringify({
            items: [{ ...offering.course, offerings: [offering] }],
            total: 1,
            offset: 0,
            limit: 20,
            status: { development_fixture: false, snapshot_id: "archive-2024" },
          }),
        );
      }
      return new Response("{}", { status: 503 });
    }),
  );
  const user = userEvent.setup();
  mount();
  await user.click(
    await screen.findByRole("button", { name: "Retry loading" }),
  );
  expect(
    await screen.findByRole("checkbox", { name: /Historical mathematics/ }),
  ).toBeEnabled();
  expect(termsCalls).toBe(1);
  expect(courseCalls).toBe(2);
});
