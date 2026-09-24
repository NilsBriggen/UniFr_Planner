import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import AttendanceControls from "./AttendanceControls";
import type { Selection } from "./domain";
import { calendarFor } from "./calendar";
const course: Selection = {
  id: "c",
  code: "C",
  titles: { en: "Statistics" },
  ects: 6,
  status: "planned",
  semester: "AS-2026",
  pinned: false,
  offering: {
    source_id: "s",
    terms: ["AS-2026"],
    meetings: ["Cours", "Exercice"].map((note) => ({
      starts_at: "2026-09-21T08:00:00Z",
      ends_at: "2026-09-21T09:00:00Z",
      location: note,
      note,
      cancelled: false,
      unresolved: false,
      excluded_dates: [],
      additional_dates: [],
    })),
    meeting_state: "resolved",
    source_url: "https://www.unifr.ch",
    snapshot_id: "s",
    development_fixture: false,
  },
};
it("student can explicitly omit a session and restore the full source schedule", async () => {
  function Harness() {
    const [value, setValue] = useState(course);
    return (
      <>
        <AttendanceControls
          course={value}
          language="en"
          disabled={false}
          onChange={(attendance) => setValue({ ...value, attendance })}
        />
        <output>{calendarFor([value], "AS-2026", "en").events.length}</output>
      </>
    );
  }
  render(<Harness />);
  const user = userEvent.setup();
  await user.click(screen.getByText("Choose personal attendance"));
  await user.click(screen.getByRole("checkbox", { name: /Exercice/ }));
  expect(screen.getByRole("status")).toHaveTextContent("1");
  expect(screen.getByText(/Personal attendance assumption/)).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Include all published sessions" }),
  );
  expect(screen.getByRole("status")).toHaveTextContent("2");
});
