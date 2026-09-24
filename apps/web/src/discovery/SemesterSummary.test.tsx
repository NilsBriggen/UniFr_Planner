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

it("separates dated external course pairs from source, travel and unavailable conflicts", () => {
  const meeting = {
    starts_at: "2026-09-21T08:00:00Z",
    ends_at: "2026-09-21T09:00:00Z",
    location: "A",
    unresolved: false,
    cancelled: false,
    excluded_dates: [],
    additional_dates: [],
    note: "",
  };
  course.offering!.meetings = [meeting, { ...meeting, location: "B" }];
  const other = structuredClone(course);
  other.id = "external";
  other.offering!.meetings = [meeting];
  plan.scenarios[0].courses = [course, other];
  plan.scenarios[0].unavailable = [
    {
      id: "work",
      label: "Work",
      start: "2026-09-21T08:30:00Z",
      end: "2026-09-21T09:00:00Z",
    },
  ];
  render(
    <MemoryRouter>
      <SemesterSummary term="AS-2026" language="en" />
    </MemoryRouter>,
  );
  const summary = screen.getByRole("complementary").querySelector("summary")!;
  expect(summary).toHaveTextContent(
    "1 affected course pairs · 2 dated collisions",
  );
  expect(summary).toHaveTextContent("1 internal source overlaps");
  expect(summary).toHaveTextContent("3 Personal unavailable period");
});
