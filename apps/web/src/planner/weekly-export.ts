import { Temporal } from "@js-temporal/polyfill";
import type { Language } from "../i18n";
import { type CalendarEvent, zone } from "./calendar";
import { type Selection } from "./domain";
import { layoutWeek, courseColour } from "./week-layout";
import { shareMessages } from "../sharing/messages";

export type WeeklyExport = {
  name: string;
  term: string;
  monday: string;
  events: CalendarEvent[];
  courses: Selection[];
  language: Language;
  unresolved: boolean;
};
export const weekColours = ["E1EEF5", "E7F1E5", "FAF0DA", "F1E8ED", "E1EFEE"];
export const minuteText = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(Math.floor(minute % 60)).padStart(2, "0")}`;
export function weekDate(
  date: string,
  language: Language,
  options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "short",
  },
) {
  return new Intl.DateTimeFormat(language, {
    timeZone: "UTC",
    ...options,
  }).format(new Date(`${date}T12:00:00Z`));
}
export function excelDate(date: string, minute = 0) {
  const day = Temporal.PlainDate.from(date);
  return (
    (Date.UTC(day.year, day.month - 1, day.day) - Date.UTC(1899, 11, 30)) /
      86400000 +
    minute / 1440
  );
}
export async function weeklyWorkbook(input: WeeklyExport) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UniFr Planner";
  workbook.created = new Date();
  const t = shareMessages[input.language],
    week = layoutWeek(input.events, input.monday);
  const sheet = workbook.addWorksheet(t.weekly, {
    views: [{ state: "frozen", xSplit: 1, ySplit: 5, showGridLines: false }],
  });
  sheet.columns = [
    { width: 10 },
    ...Array.from({ length: 7 }, () => ({ width: 26 })),
  ];
  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.35,
      bottom: 0.35,
      header: 0.1,
      footer: 0.1,
    },
  };
  sheet.mergeCells("A1:H1");
  sheet.getCell("A1").value = input.name;
  sheet.getRow(1).height = 30;
  sheet.getCell("A1").font = {
    name: "Arial",
    size: 20,
    bold: true,
    color: { argb: "FF0A3859" },
  };
  sheet.mergeCells("A2:H2");
  sheet.getCell("A2").value =
    `${t.weekly} · ${input.monday} – ${week.days[6].date} · ${input.term} · ${zone}`;
  sheet.mergeCells("A3:H3");
  sheet.getCell("A3").value = input.unresolved ? t.missingDates : t.notesHelp;
  sheet.getRow(3).height = 32;
  sheet.getCell("A3").alignment = { wrapText: true, vertical: "middle" };
  sheet.getCell("A5").value = t.time;
  week.days.forEach((day, i) => {
    sheet.getCell(4, i + 2).value = weekDate(day.date, input.language, {
      weekday: "long",
    });
    sheet.getCell(5, i + 2).value = excelDate(day.date);
    sheet.getCell(5, i + 2).numFmt = "dd.mm.yyyy";
  });
  for (const row of [4, 5]) {
    sheet.getRow(row).height = 23;
    for (let col = 1; col <= 8; col++) {
      const cell = sheet.getCell(row, col);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0A3859" },
      };
      cell.font = {
        name: "Arial",
        size: 11,
        bold: true,
        color: { argb: "FFFFFFFF" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }
  }
  const rows = (week.endMinute - week.startMinute) / 15;
  for (let offset = 0; offset < rows; offset++) {
    const row = 6 + offset,
      minute = week.startMinute + offset * 15;
    sheet.getRow(row).height = 13;
    const time = sheet.getCell(row, 1);
    time.value = minute / 1440;
    time.numFmt = "hh:mm";
    time.font = { name: "Arial", size: 9, color: { argb: "FF536271" } };
    week.days.forEach((day, dayIndex) => {
      const cell = sheet.getCell(row, dayIndex + 2);
      const active = day.lessons.filter(
        (l) => l.startMinute < minute + 15 && l.endMinute > minute,
      );
      cell.font = { name: "Arial", size: 10, color: { argb: "FF172B3A" } };
      cell.alignment = { wrapText: true, vertical: "top" };
      cell.border = {
        bottom: {
          style: minute % 60 === 45 ? "thin" : "hair",
          color: { argb: "FFD8E0E6" },
        },
        right: { style: "thin", color: { argb: "FFD8E0E6" } },
      };
      if (active.length) {
        const course = input.courses.find(
          (c) => c.id === active[0].event.owner,
        );
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb: `FF${active.length > 1 ? "F8E5E3" : weekColours[courseColour(course?.code ?? active[0].event.owner)]}`,
          },
        };
      }
    });
  }
  for (const [dayIndex, day] of week.days.entries()) {
    const occupied = new Set<number>();
    for (const lesson of day.lessons) {
      const first =
        6 + Math.floor((lesson.startMinute - week.startMinute) / 15);
      const last = 5 + Math.ceil((lesson.endMinute - week.startMinute) / 15);
      const overlaps = day.lessons.some(
        (other) =>
          other !== lesson &&
          other.startMinute < lesson.endMinute &&
          other.endMinute > lesson.startMinute,
      );
      const label = `${minuteText(lesson.startMinute)}–${minuteText(lesson.endMinute)}\n${lesson.event.title}${lesson.event.location ? `\n${lesson.event.location}` : ""}`;
      const cell = sheet.getCell(first, dayIndex + 2);
      if (
        !overlaps &&
        !Array.from({ length: last - first + 1 }, (_, i) => first + i).some(
          (row) => occupied.has(row),
        )
      ) {
        if (last > first)
          sheet.mergeCells(first, dayIndex + 2, last, dayIndex + 2);
        cell.value = label;
        for (let row = first; row <= last; row++) occupied.add(row);
      } else {
        cell.value = cell.value ? `${cell.value}\n${label}` : label;
        sheet.getRow(first).height = Math.max(
          sheet.getRow(first).height ?? 13,
          String(cell.value).split("\n").length * 12,
        );
        cell.note = t.overlap;
      }
    }
  }
  const notesRow = rows + 7;
  sheet.mergeCells(notesRow, 1, notesRow, 8);
  sheet.getCell(notesRow, 1).value = t.notes;
  sheet.getCell(notesRow, 1).font = {
    name: "Arial",
    bold: true,
    size: 12,
    color: { argb: "FF0A3859" },
  };
  for (let row = notesRow + 1; row <= notesRow + 3; row++) {
    sheet.mergeCells(row, 1, row, 8);
    sheet.getRow(row).height = 22;
    sheet.getCell(row, 1).border = {
      bottom: { style: "thin", color: { argb: "FFD8E0E6" } },
    };
  }
  sheet.pageSetup.printArea = `A1:H${notesRow + 3}`;
  const list = workbook.addWorksheet(t.lessons, {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  list.columns = [12, 12, 12, 48, 30, 20, 55].map((width) => ({ width }));
  list.mergeCells("A1:G1");
  list.getCell("A1").value = `${input.name} · ${input.monday} · ${zone}`;
  list.getRow(1).height = 28;
  list.mergeCells("A2:G2");
  list.getCell("A2").value = input.unresolved ? t.missingDates : t.notesHelp;
  list.getCell("A2").alignment = { wrapText: true };
  list.getRow(2).height = 30;
  list.addRow([
    t.date,
    t.start,
    t.end,
    t.course,
    t.room,
    t.conflicts,
    t.source,
  ]);
  for (const day of week.days)
    for (const lesson of day.lessons) {
      const course = input.courses.find((c) => c.id === lesson.event.owner);
      const conflict = day.lessons.some(
        (other) =>
          other !== lesson &&
          other.startMinute < lesson.endMinute &&
          other.endMinute > lesson.startMinute,
      );
      const row = list.addRow([
        excelDate(day.date),
        lesson.startMinute / 1440,
        lesson.endMinute / 1440,
        lesson.event.title,
        lesson.event.location,
        conflict ? t.overlap : "",
        course?.offering?.source_url ?? "",
      ]);
      row.getCell(1).numFmt = "dd.mm.yyyy";
      row.getCell(2).numFmt = "hh:mm";
      row.getCell(3).numFmt = "[hh]:mm";
      row.height = 42;
      row.alignment = {
        wrapText: true,
        vertical: "middle",
        horizontal: "left",
        indent: 1,
      };
      for (const column of [1, 2, 3])
        row.getCell(column).alignment = {
          vertical: "middle",
          horizontal: "center",
        };
      row.eachCell((cell) => {
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFD8E0E6" } },
        };
        if (row.number % 2 === 0)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF3F6F8" },
          };
      });
    }
  for (let row = 1; row <= list.rowCount; row++)
    list.getRow(row).font = {
      name: "Arial",
      size: row === 1 ? 16 : 11,
      bold: row <= 3,
      color: { argb: "FF172B3A" },
    };
  list.getRow(3).height = 34;
  list.getRow(3).eachCell((cell) => {
    cell.alignment = {
      wrapText: true,
      vertical: "middle",
      horizontal: "left",
      indent: 1,
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0A3859" },
    };
    cell.font = {
      name: "Arial",
      size: 11,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
  });
  list.autoFilter = { from: "A3", to: `G${Math.max(3, list.rowCount)}` };
  list.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: "1:3",
  };
  return workbook;
}
export async function downloadWeek(input: WeeklyExport) {
  const workbook = await weeklyWorkbook(input);
  const data = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(data)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `unifr-${input.term}-${input.monday}.xlsx`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
