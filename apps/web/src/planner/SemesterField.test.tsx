import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SemesterField, semesterLabel } from "./SemesterField";

it("edits a canonical semester through semantic season and year controls", () => {
  const onChange = vi.fn();
  render(
    <SemesterField
      label="Planning semester"
      value="AS-2026"
      onChange={onChange}
      language="en"
    />,
  );

  fireEvent.change(screen.getByLabelText("Planning semester · Season"), {
    target: { value: "SS" },
  });
  expect(onChange).toHaveBeenCalledWith("SS-2026");

  fireEvent.change(screen.getByLabelText("Planning semester · Year"), {
    target: { value: "2027" },
  });
  expect(onChange).toHaveBeenCalledWith("AS-2027");
});

it("localizes canonical semester labels", () => {
  expect(semesterLabel("AS-2026", "en")).toBe("Autumn 2026");
  expect(semesterLabel("SS-2027", "de")).toBe("Frühling 2027");
  expect(semesterLabel("AS-2028", "fr")).toBe("Automne 2028");
});
