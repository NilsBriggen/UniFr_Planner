import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { PlanStore } from "./planner/storage";
import {
  publishedCourses,
  publishedPlan,
  publishedStatus,
} from "./planner/published-fixture";

afterEach(() => vi.unstubAllGlobals());

it("shows an imported UE code as already added when the plan has its curriculum code", async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.setItem("unifr.language", "en");
  const manual = publishedPlan();
  for (const course of manual.scenarios[0].courses) course.offering = null;
  await new PlanStore(indexedDB).save(manual);
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
  for (const button of await screen.findAllByRole("button", {
    name: "In this scenario",
  })) {
    expect(button).toBeDisabled();
  }
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
