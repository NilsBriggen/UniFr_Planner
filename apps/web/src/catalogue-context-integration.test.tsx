import Catalogue from "./Catalogue";
import { PlanProvider, usePlans } from "./planner/context";
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import App from "./App";
import { PlanStore } from "./planner/storage";
import { createPlan } from "./planner/domain";
import { publishedStatus } from "./planner/published-fixture";
import {
  catalogueLinkFor,
  rememberCatalogueContext,
} from "./discovery/catalogueContext";
afterEach(() => vi.unstubAllGlobals());
function Navigation() {
  const location = useLocation(),
    navigate = useNavigate();
  return (
    <>
      <output data-testid="url">
        {location.pathname}
        {location.search}
      </output>
      <button
        onClick={() =>
          navigate("/catalogue?term=SS-2027&faculty=Biology&language=en")
        }
      >
        Explicit link
      </button>
    </>
  );
}
it("restores distinct catalogue contexts on A to B to A, new plan and explicit navigation", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
  const store = new PlanStore(indexedDB);
  const plans = ["A", "B", "C"].map((id) =>
    createPlan({
      id,
      scenarioId: id + "-s",
      name: id,
      programme: id,
      startTerm: "AS-2026",
      semesterCount: 4,
      targetEcts: 180,
    }),
  );
  for (const plan of plans) await store.save(plan, null);
  await store.select("A");
  const a = "term=AS-2026&faculty=Psychology&language=fr&focus=all";
  const b = "term=SS-2027&faculty=Biology&language=de";
  rememberCatalogueContext(
    "A",
    "A-s",
    new URLSearchParams("term=SS-2027&language=de"),
  );
  rememberCatalogueContext("B", "B-s", new URLSearchParams(b));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) =>
      Response.json(
        request.url.includes("/terms")
          ? {
              status: publishedStatus,
              terms: ["AS-2026", "SS-2027"],
              faculties: ["Psychology", "Biology"],
              languages: ["en", "de", "fr"],
              levels: [],
            }
          : {
              status: publishedStatus,
              items: [],
              total: 0,
              offset: 0,
              limit: 20,
            },
      ),
    ),
  );
  render(
    <MemoryRouter initialEntries={["/catalogue?" + a]}>
      <Navigation />
      <App />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Current plan")).toHaveValue("A"),
  );
  await waitFor(() =>
    expect(document.querySelector(".filter-chips")).toHaveTextContent(
      "Psychology",
    ),
  );
  fireEvent.change(screen.getByLabelText("Current plan"), {
    target: { value: "B" },
  });
  await waitFor(() =>
    expect(screen.getByTestId("url")).toHaveTextContent("/catalogue?" + b),
  );
  expect(catalogueLinkFor("A", "A-s")).toBe("/catalogue?" + a);
  expect(catalogueLinkFor("B", "B-s")).toBe("/catalogue?" + b);
  await waitFor(() =>
    expect(document.querySelector(".filter-chips")).toHaveTextContent(
      "Biology",
    ),
  );
  expect(document.querySelector(".filter-chips")).toHaveTextContent("de");
  fireEvent.change(screen.getByLabelText("Current plan"), {
    target: { value: "A" },
  });
  await waitFor(() =>
    expect(screen.getByTestId("url")).toHaveTextContent("/catalogue?" + a),
  );
  fireEvent.change(screen.getByLabelText("Current plan"), {
    target: { value: "C" },
  });
  await waitFor(() =>
    expect(screen.getByTestId("url").textContent).toBe(
      "/catalogue?term=AS-2026",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Explicit link" }));
  await waitFor(() =>
    expect(catalogueLinkFor("C", "C-s")).toBe(
      "/catalogue?term=SS-2027&faculty=Biology&language=en",
    ),
  );
});

function ScenarioControl() {
  const { plan, save, ready } = usePlans();
  return (
    <button
      disabled={!ready || !plan}
      onClick={() => {
        if (plan)
          void save({
            ...plan,
            activeScenarioId:
              plan.activeScenarioId === "s" ? "alternative" : "s",
          });
      }}
    >
      Switch scenario
    </button>
  );
}
it("restores the destination scenario before persisting the catalogue route", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  const plan = createPlan({
    id: "scenarios",
    scenarioId: "s",
    name: "Scenarios",
    programme: "P",
    startTerm: "AS-2026",
    semesterCount: 4,
    targetEcts: 180,
  });
  plan.scenarios.push({
    ...plan.scenarios[0],
    id: "alternative",
    name: "Alternative",
  });
  await new PlanStore(indexedDB).save(plan, null);
  const first = "term=AS-2026&language=fr",
    second = "term=SS-2027&language=de";
  rememberCatalogueContext(plan.id, "alternative", new URLSearchParams(second));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) =>
      Response.json(
        request.url.includes("/terms")
          ? {
              status: publishedStatus,
              terms: ["AS-2026", "SS-2027"],
              faculties: [],
              languages: ["en", "de", "fr"],
              levels: [],
            }
          : {
              status: publishedStatus,
              items: [],
              total: 0,
              offset: 0,
              limit: 20,
            },
      ),
    ),
  );
  render(
    <MemoryRouter initialEntries={["/catalogue?" + first]}>
      <PlanProvider>
        <Navigation />
        <ScenarioControl />
        <Catalogue language="en" />
      </PlanProvider>
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(catalogueLinkFor(plan.id, "s")).toBe("/catalogue?" + first),
  );
  fireEvent.click(screen.getByRole("button", { name: "Switch scenario" }));
  await waitFor(() =>
    expect(screen.getByTestId("url")).toHaveTextContent("/catalogue?" + second),
  );
  expect(catalogueLinkFor(plan.id, "s")).toBe("/catalogue?" + first);
  fireEvent.click(screen.getByRole("button", { name: "Switch scenario" }));
  await waitFor(() =>
    expect(screen.getByTestId("url")).toHaveTextContent("/catalogue?" + first),
  );
  expect(catalogueLinkFor(plan.id, "alternative")).toBe("/catalogue?" + second);
});
