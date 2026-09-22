import { describe, expect, it } from "vitest";
import { defaultCalendarDate, readCalendarView } from "./calendar-view";

describe("calendar presentation preferences", () => {
  it("opens today during the semester even when teaching started earlier", () => {
    expect(defaultCalendarDate("AS-2026", ["2026-09-14"], "2026-09-22")).toBe(
      "2026-09-22",
    );
  });
  it("uses the first meeting outside the semester, then its start if empty", () => {
    expect(
      defaultCalendarDate(
        "SS-2027",
        ["2027-03-02", "2027-02-23"],
        "2026-09-22",
      ),
    ).toBe("2027-02-23");
    expect(defaultCalendarDate("SS-2027", [], "2026-09-22")).toBe("2027-02-01");
  });
  it("restores valid choices and rejects corrupt or out-of-semester dates", () => {
    expect(
      readCalendarView('{"view":"day","date":"2026-10-01"}', "AS-2026"),
    ).toEqual({ view: "day", date: "2026-10-01" });
    expect(
      readCalendarView('{"view":"week","date":"2026-02-31"}', "AS-2026"),
    ).toEqual({ view: "week", date: "" });
    expect(
      readCalendarView('{"view":"month","date":"2026-10-01"}', "AS-2026"),
    ).toEqual({ view: "week", date: "" });
    expect(readCalendarView("broken", "AS-2026")).toEqual({
      view: "week",
      date: "",
    });
  });
});
