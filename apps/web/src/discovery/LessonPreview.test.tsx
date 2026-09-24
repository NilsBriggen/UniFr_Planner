import { expect, it } from "vitest";
import { render } from "@testing-library/react";
import { OfferingAdvice } from "./LessonPreview";
import type { Assessment } from "./engine";

it("presents lesson times and timetable fit before programme assignment detail", () => {
  const assessment = {
    match: "subject",
    recommended: false,
    requirementTitles: [],
    sourceAssignments: [
      {
        programme: "Computer Science 120",
        version: "2022_1/V_01",
        paths: ["2nd-3rd year", "BSc Computer Science"],
      },
    ],
    sourceApplicabilityUnconfirmed: false,
    contributionEcts: 0,
    selectedStatus: null,
    prerequisiteState: "satisfied",
    calendar: { events: [], unresolved: [] },
    attendanceStale: false,
    conflictCounts: { internal: 0, hard: 0, travel: 0, unavailable: 0 },
    fit: "fits",
    reviewState: "reviewed",
  } as unknown as Assessment;
  const { container } = render(
    <OfferingAdvice assessment={assessment} language="en" />,
  );
  const lesson = container.querySelector(".lesson-preview")!;
  const fit = container.querySelector(".fit-note.fits")!;
  const match = container.querySelector(".match-note")!;
  const assignments = container.querySelector(".source-assignments")!;
  expect(
    lesson.compareDocumentPosition(fit) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    fit.compareDocumentPosition(match) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    match.compareDocumentPosition(assignments) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});
