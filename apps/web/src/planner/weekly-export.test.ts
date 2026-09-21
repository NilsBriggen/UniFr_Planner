import { expect, it } from "vitest";
import { weeklyWorkbook, excelDate, type WeeklyExport } from "./weekly-export";
import { weeklyPrintHtml } from "./weekly-print";

const input: WeeklyExport = {
  name: "CS & BI <week>",
  term: "AS-2026",
  monday: "2026-09-21",
  language: "en",
  courses: [],
  unresolved: true,
  events: [
    {
      id: "one",
      owner: "one",
      title: '=HYPERLINK("https://example.org")',
      start: "2026-09-21T08:15:00Z",
      end: "2026-09-21T10:00:00Z",
      location: "PER 21",
    },
    {
      id: "two",
      owner: "two",
      title: "Algèbre",
      start: "2026-09-21T09:00:00Z",
      end: "2026-09-21T10:00:00Z",
      location: "B201",
    },
    {
      id: "night",
      owner: "night",
      title: "Night",
      start: "2026-09-22T21:30:00Z",
      end: "2026-09-22T23:30:00Z",
      location: "",
    },
    {
      id: "outside",
      owner: "outside",
      title: "Next week",
      start: "2026-09-28T08:00:00Z",
      end: "2026-09-28T09:00:00Z",
      location: "",
    },
  ],
};
it("exports a styled editable week with exact typed times, overlap, midnight splits and safe text", async () => {
  const workbook = await weeklyWorkbook(input);
  const data = await workbook.xlsx.writeBuffer();
  const { default: ExcelJS } = await import("exceljs");
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(data);
  expect(reopened.worksheets.map((s) => s.name)).toEqual([
    "Weekly plan",
    "Lesson list",
  ]);
  const list = reopened.worksheets[1];
  expect(list.rowCount).toBe(7); // header rows plus four split lessons
  const numeric = (address: string) => {
    const value = list.getCell(address).value;
    return value instanceof Date
      ? (value.getTime() - Date.UTC(1899, 11, 30)) / 86400000
      : value;
  };
  expect(numeric("A4")).toBe(excelDate("2026-09-21"));
  expect(numeric("B4")).toBeCloseTo(615 / 1440);
  expect(numeric("C6")).toBe(1); // midnight is 24:00, not a zero-length day
  expect(numeric("B7")).toBe(0);
  expect(list.getCell("D4").value).toBe(input.events[0].title);
  expect(list.getCell("D4").type).toBe(ExcelJS.ValueType.String);
  expect(list.getCell("F4").value).toBe("Overlapping lessons");
  expect(JSON.stringify(list.model)).not.toContain("Next week");
  const week = reopened.worksheets[0];
  expect(week.pageSetup.orientation).toBe("landscape");
  expect(week.views[0]).toMatchObject({
    state: "frozen",
    xSplit: 1,
    ySplit: 5,
  });
  week.getCell("H10").value = "My activity";
  expect(week.getCell("H10").value).toBe("My activity");
});
it("prints only the selected week, escapes source text and retains all exact lesson details", () => {
  const html = weeklyPrintHtml(input);
  expect(html).toContain("CS &amp; BI &lt;week&gt;");
  expect(html).toContain("10:15–12:00");
  expect(html).toContain("23:30–24:00");
  expect(html).toContain("00:00–01:30");
  expect(html).toContain("Algèbre");
  expect(html).not.toContain("Next week");
  expect(html).toContain("incomplete dates");
});
