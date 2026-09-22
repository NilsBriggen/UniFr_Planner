import { afterEach, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SemesterSummary from "./SemesterSummary";
import { publishedPlan } from "../planner/published-fixture";

const plan = publishedPlan();
plan.scenarios[0].courses = [plan.scenarios[0].courses[0]];
const course = plan.scenarios[0].courses[0];
course.ects = null;
course.offering!.meeting_state = "unresolved";
course.offering!.meetings = [];
vi.mock("../planner/context", () => ({
  usePlans: () => ({ plan, busy: false, save: vi.fn() }),
}));
afterEach(() => vi.unstubAllGlobals());

it("keeps unknown credits and dates visible when the phone summary is collapsed", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  render(
    <MemoryRouter>
      <SemesterSummary term="AS-2026" language="en" />
    </MemoryRouter>,
  );
  const summary = screen.getByRole("complementary").querySelector("summary")!;
  expect(summary.parentElement).not.toHaveAttribute("open");
  expect(summary).toHaveTextContent("0 ECTS");
  expect(summary).toHaveTextContent("1 Unknown ECTS");
  expect(summary).toHaveTextContent("1 Courses with unresolved dates");
});
