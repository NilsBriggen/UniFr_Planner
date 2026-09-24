import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import AttendanceControls from "./AttendanceControls";
import { publishedPlan } from "./published-fixture";
import { attendanceChoice } from "./attendance";
import { calendarFor } from "./calendar";
import {
  exportManifest,
  weeklyWorkbook,
  type WeeklyExport,
} from "./weekly-export";
import { weeklyPrintHtml } from "./weekly-print";
import { scopedPrintHtml } from "./scoped-print";
import { timetableMessages } from "./timetable-messages";

it.each([false, true])(
  "exposes stale=%s attendance in the closed editor and all export coverage",
  async (stale) => {
    const course = publishedPlan().scenarios[0].courses[0];
    course.offering!.meetings = [
      course.offering!.meetings[0],
      { ...course.offering!.meetings[0], location: "Alternative room" },
    ];
    course.attendance = attendanceChoice(course, [1]);
    if (stale) course.offering!.meetings[1].location = "Changed room";
    const before = JSON.stringify(course);
    render(
      <AttendanceControls
        course={course}
        language="en"
        disabled={false}
        onChange={vi.fn()}
      />,
    );
    expect(document.querySelector("details")).not.toHaveAttribute("open");
    if (stale) {
      expect(screen.getByRole("alert")).toBeVisible();
      expect(screen.getByRole("alert")).toHaveTextContent(course.titles.en!);
      expect(screen.getByRole("alert")).toHaveTextContent(
        timetableMessages.en.stale,
      );
    } else expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const calendar = calendarFor([course], "AS-2026", "en");
    const input: WeeklyExport = {
      name: "Plan",
      term: "AS-2026",
      monday: "2026-09-21",
      courses: [course],
      events: calendar.events,
      language: "en",
      unresolved: true,
    };
    const reason = stale
      ? timetableMessages.en.stale
      : timetableMessages.en.provisional;
    expect(exportManifest(input)[0]).toMatchObject({
      reason,
      reasonKind: stale ? "stale-attendance" : "provisional-attendance",
    });
    expect(weeklyPrintHtml(input)).toContain(reason);
    expect(scopedPrintHtml(input, "agenda")).toContain(reason);
    expect(scopedPrintHtml(input, "roster")).toContain(reason);
    const workbook = await weeklyWorkbook(input);
    expect(workbook.worksheets.at(-1)!.getCell("D3").value).toBe(reason);
    expect(calendar.events).toHaveLength(stale ? 2 : 1);
    expect(JSON.stringify(course)).toBe(before);
  },
);

it("keeps the stale-choice notice visible if the changed source has removed every meeting", () => {
  const course = publishedPlan().scenarios[0].courses[0];
  course.attendance = attendanceChoice(course, [0]);
  course.offering!.meetings = [];
  render(
    <AttendanceControls
      course={course}
      language="en"
      disabled={false}
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    timetableMessages.en.stale,
  );
});
