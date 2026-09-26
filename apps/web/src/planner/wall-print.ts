import { Temporal } from "@js-temporal/polyfill";
import type { Language } from "../i18n";
import { selectedMeetings } from "./attendance";
import { calendarFor, localDate } from "./calendar";
import { countLabel } from "./countLabels";
import { printSourceNote } from "./print-source";
import { semesterLabel } from "./SemesterField";
import { timetableMessages } from "./timetable-messages";
import {
  annotationText,
  buildTypicalWeek,
  TYPICAL_REFERENCE_MONDAY,
  type TypicalSlot,
} from "./typical-week";
import { courseColour, layoutWeek, type WeekLesson } from "./week-layout";
import {
  minuteText,
  weekColours,
  weekDate,
  type WeeklyExport,
} from "./weekly-export";
import { escapeHtml, openPrintHtml } from "./weekly-print";

/** Course accents of the screen timetable (timetable.css .course-colour-*),
 * paired with weekColours as fills. */
export const weekAccents = ["216D91", "42764E", "96621F", "87586D", "527B7B"];

/** Millimetre geometry of the sheet. A4 landscape with 8 mm margins leaves
 * 281 × 194 mm; the sheet keeps a few millimetres of slack so printer margins
 * or rounding never push it onto a second page. */
export const WALL_MM = {
  width: 278,
  height: 190,
  header: 12,
  dayHead: 8,
  /** Day heads with an all-day line. */
  dayHeadAllDay: 11,
  footer: 13,
  rowGap: 1,
  ruler: 9,
  /** No lane is narrower; wider overlaps collapse into one list block. */
  minLane: 16,
  laneGap: 0.6,
  /** Accent bar, right border and padding across a block. */
  chrome: 2.05,
  /** Borders and padding down a block. */
  pad: 1.2,
  /** One line of text plus padding; shorter slots are drawn this tall. */
  minBlock: 4.5,
} as const;
/** Grid hours shown at least, so a single class never fills the whole page. */
export const MIN_WINDOW_MINUTES = 240;
const LINE_HEIGHT = 1.12,
  MM_PER_PT = 25.4 / 72,
  /** Rounding reserve inside every block. */
  SLACK = 0.25;
const FONT = { title: 9, narrowTitle: 8, time: 7.5, narrowTime: 7, detail: 7 };
export const lineMm = (pt: number) => pt * LINE_HEIGHT * MM_PER_PT;
export const gridMm = (dayHead: number) =>
  WALL_MM.height -
  WALL_MM.header -
  dayHead -
  WALL_MM.footer -
  3 * WALL_MM.rowGap;

// Advance widths of Arial/Helvetica (Liberation Sans matches them) in 1/1000 em.
const advance = new Map<string, number>();
for (const [chars, width] of [
  ["'", 191],
  ["ijl", 222],
  ["|", 260],
  [" ,.:;!/ftI·[]", 278],
  ["-()r", 333],
  ['"', 355],
  ["ckszvxyJ", 500],
  ["abdeghnopqu0123456789–_L?$", 556],
  ["×+=<>~", 584],
  ["FTZ", 611],
  ["ABEKPSVXY&", 667],
  ["CDHNRUw", 722],
  ["GOQ", 778],
  ["mM", 833],
  ["%", 889],
  ["W", 944],
] as const)
  for (const char of chars) advance.set(char, width);
/** Estimated printed width; bold letters run about 8% wider. */
export function textMm(text: string, pt: number, bold = false) {
  let units = 0;
  for (const char of text.normalize("NFD").replace(/\p{M}/gu, "")) {
    const width = advance.get(char) ?? 600;
    units +=
      bold && /\p{L}/u.test(char)
        ? width * 1.08
        : bold && char === ":"
          ? 333
          : width;
  }
  return (units / 1000) * pt * MM_PER_PT;
}
const fits = (text: string, pt: number, bold: boolean, widthMm: number) =>
  textMm(text, pt, bold) * 1.03 <= widthMm;

export type WallLine =
  | { kind: "title"; text: string; lines: 1 | 2; prefix?: string }
  | { kind: "time" | "mark" | "detail" | "one"; text: string };
export type WallBlockLines = { narrow: boolean; lines: WallLine[] };

function roomText(slot: TypicalSlot, widthMm: number, language: Language) {
  const x = timetableMessages[language],
    { mode, list } = slot.rooms;
  if (slot.personal) return "";
  if (mode === "none") return x.roomUnknown;
  if (mode === "one") return list[0];
  if (mode === "varies") return `${list[0]} (${x.wallRoomVaries})`;
  const both = list.join(" / ");
  return list.length <= 2 && fits(both, FONT.detail, false, widthMm)
    ? both
    : x.wallRooms.replace("{count}", String(list.length));
}

/** What fits inside one block, filled in order: title line 1, time with its
 * mark, the mark (or the dates a short mark omits) on its own line, title
 * line 2, room, session type. The time and the "not every week" mark are
 * never dropped. */
export function blockLines(
  slot: TypicalSlot,
  widthMm: number,
  heightMm: number,
  language: Language,
): WallBlockLines {
  const inner = widthMm - WALL_MM.chrome;
  let budget = heightMm - WALL_MM.pad - SLACK;
  const narrow = !fits(slot.timeLabel, FONT.time, true, inner);
  const titlePt = narrow ? FONT.narrowTitle : FONT.title,
    timePt = narrow ? FONT.narrowTime : FONT.time;
  const title = lineMm(titlePt),
    time = lineMm(timePt),
    detail = lineMm(FONT.detail);
  const full = annotationText(slot.annotation, language, "full"),
    short = annotationText(slot.annotation, language, "short");
  const { from, until } = slot.annotation;
  let timeText = slot.timeLabel,
    mark = "",
    dates = "";
  if (full && fits(`${timeText} · ${full}`, timePt, true, inner))
    timeText = `${timeText} · ${full}`;
  else if (full) {
    if (fits(`${timeText} · ${short}`, timePt, true, inner))
      timeText = `${timeText} · ${short}`;
    else mark = fits(full, timePt, true, inner) ? full : short;
    // The dates a shortened mark leaves out, e.g. "17.09.–26.11." after "6×".
    const range = from && until ? `${dayMonth(from)}–${dayMonth(until)}` : "";
    if (
      mark !== full &&
      range &&
      !short.includes(range) &&
      fits(range, timePt, true, inner)
    )
      dates = range;
  }
  const required = title + time + (mark ? time : 0);
  if (budget >= required) {
    budget -= required;
    const heading: WallLine = { kind: "title", text: slot.title, lines: 1 };
    const lines: WallLine[] = [heading, { kind: "time", text: timeText }];
    if (mark) lines.push({ kind: "mark", text: mark });
    if (dates && budget >= time) {
      lines.push({ kind: "mark", text: dates });
      budget -= time;
    }
    if (budget >= title && !fits(slot.title, titlePt, true, inner)) {
      heading.lines = 2;
      budget -= title;
    }
    for (const text of [
      roomText(slot, inner, language),
      slot.sessionTypes.join(" / "),
    ]) {
      if (!text) continue;
      if (budget < detail) break;
      lines.push({ kind: "detail", text });
      budget -= detail;
    }
    return { narrow, lines };
  }
  // Too short for a separate mark line: the mark leads the title instead.
  if (mark && budget >= title + time)
    return {
      narrow,
      lines: [
        { kind: "title", text: slot.title, lines: 1, prefix: short },
        { kind: "time", text: slot.timeLabel },
      ],
    };
  return {
    narrow,
    lines: [
      {
        kind: "one",
        text: [minuteText(slot.startMinute), short, slot.title]
          .filter(Boolean)
          .join(" "),
      },
    ],
  };
}

const e = escapeHtml;
const round = (value: number) => Math.round(value * 1000) / 1000;
const dayMonth = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}.`;
const swissDate = (date: string) => `${dayMonth(date)}${date.slice(0, 4)}`;
const clock = (minute: number) =>
  minuteText(minute > 1440 ? minute - 1440 : minute);
const kindRank = { weekly: 0, biweekly: 1, count: 2 } as const;

/** Overlap clusters, swept exactly like layoutWeek assigns its lanes. */
function clusters(lessons: readonly WeekLesson[]) {
  const groups: WeekLesson[][] = [];
  let end = -1;
  for (const lesson of lessons) {
    if (!groups.length || lesson.startMinute >= end) {
      groups.push([]);
      end = -1;
    }
    groups.at(-1)!.push(lesson);
    end = Math.max(end, lesson.endMinute);
  }
  return groups;
}

/** A one-page A4 landscape sheet of the typical semester week, meant to hang
 * at home: every class and personal commitment that recurs, with its details
 * inside the block and anything irregular listed in the footer. */
export function wallPrintHtml(input: WeeklyExport, generated = new Date()) {
  const language = input.language,
    x = timetableMessages[language];
  const courses = input.courses.filter(
    (c) => c.semester === input.term && c.status !== "completed",
  );
  const typical = buildTypicalWeek(input.events, input.term, {
    courseIds: new Set(input.courses.map((c) => c.id)),
  });
  const week = layoutWeek(typical.events, TYPICAL_REFERENCE_MONDAY);
  const slotOf = new Map(typical.slots.map((slot) => [slot.id, slot]));
  const days = week.days
    .map((day, index) => ({ ...day, weekday: index + 1 }))
    .filter((day) => day.weekday <= 5 || day.lessons.length);
  const lessons = days.flatMap((day) => day.lessons);
  let start = lessons.length
      ? Math.floor(Math.min(...lessons.map((l) => l.startMinute)) / 60) * 60
      : 480,
    end = lessons.length
      ? Math.ceil(Math.max(...lessons.map((l) => l.endMinute)) / 60) * 60
      : 1080;
  if (end - start < MIN_WINDOW_MINUTES) {
    end = Math.min(1440, start + MIN_WINDOW_MINUTES);
    start = end - MIN_WINDOW_MINUTES;
  }
  const allDayOf = (weekday: number) =>
    typical.allDay.filter((entry) => entry.weekdays.includes(weekday));
  const dayHead = days.some((day) => allDayOf(day.weekday).length)
    ? WALL_MM.dayHeadAllDay
    : WALL_MM.dayHead;
  const grid = gridMm(dayHead),
    perMinute = grid / (end - start);
  const column = (WALL_MM.width - WALL_MM.ruler) / days.length;
  // Blocks are positioned inside the day's padding box, after its left border.
  const inside = column - 0.2;
  const maxLanes = Math.max(1, Math.floor(column / WALL_MM.minLane));
  const colourOf = (slot: TypicalSlot) =>
    courseColour(
      input.courses.find((c) => c.id === slot.owner)?.code ?? slot.owner,
    );
  const reference = (weekday: number) =>
    Temporal.PlainDate.from(TYPICAL_REFERENCE_MONDAY)
      .add({ days: weekday - 1 })
      .toString();
  const weekdayName = (weekday: number, format: "long" | "short") =>
    weekDate(reference(weekday), language, { weekday: format });

  const placement = (from: number, to: number) => {
    const height = Math.max(WALL_MM.minBlock, (to - from) * perMinute);
    return {
      top: Math.min((from - start) * perMinute, grid - height),
      height,
    };
  };
  const renderBlock = (lesson: WeekLesson) => {
    const slot = slotOf.get(lesson.event.id)!;
    const { top, height } = placement(lesson.startMinute, lesson.endMinute);
    const width = inside / lesson.lanes - WALL_MM.laneGap;
    const content = blockLines(slot, width, height, language);
    const classes = [
      "wall-block",
      slot.personal ? "personal" : `course-colour-${colourOf(slot)}`,
      ...(slot.annotation.kind === "weekly" ? [] : ["not-weekly"]),
      ...(content.narrow ? ["narrow"] : []),
    ].join(" ");
    const html = content.lines
      .map((line) =>
        line.kind === "title"
          ? `<b class="t${line.lines}">${line.prefix ? `<em>${e(line.prefix)}</em> ` : ""}${e(line.text)}</b>`
          : `<span class="${line.kind}">${e(line.text)}</span>`,
      )
      .join("");
    return `<article class="${classes}" style="top:${round(top)}mm;height:${round(height)}mm;left:calc(${round((lesson.lane / lesson.lanes) * 100)}% + ${WALL_MM.laneGap / 2}mm);width:calc(${round(100 / lesson.lanes)}% - ${WALL_MM.laneGap}mm)">${html}</article>`;
  };
  const renderStack = (group: readonly WeekLesson[]) => {
    const from = Math.min(...group.map((l) => l.startMinute)),
      to = Math.max(...group.map((l) => l.endMinute));
    const { top, height } = placement(from, to);
    const items = group
      .map((lesson) => slotOf.get(lesson.event.id)!)
      .sort(
        (a, b) =>
          a.startMinute - b.startMinute ||
          kindRank[a.annotation.kind] - kindRank[b.annotation.kind] ||
          a.title.localeCompare(b.title),
      );
    const capacity = Math.max(
      1,
      Math.floor((height - WALL_MM.pad - SLACK) / lineMm(FONT.detail)),
    );
    const shown =
      items.length <= capacity ? items : items.slice(0, capacity - 1);
    const lines = shown.map(
      (slot) =>
        `<span class="stack-line"><i class="chip ${slot.personal ? "chip-personal" : `course-colour-${colourOf(slot)}`}"></i>${e(
          [
            slot.timeLabel,
            annotationText(slot.annotation, language, "short"),
            slot.title,
          ]
            .filter(Boolean)
            .join(" "),
        )}</span>`,
    );
    if (shown.length < items.length)
      lines.push(
        `<span class="stack-line">${e(x.wallMore.replace("{count}", String(items.length - shown.length)))}</span>`,
      );
    return `<article class="wall-stack" style="top:${round(top)}mm;height:${round(height)}mm">${lines.join("")}</article>`;
  };

  const hours = Array.from(
    { length: (end - start) / 60 + 1 },
    (_, i) => start + i * 60,
  );
  // Borders would shrink the positioned box, so the frame is drawn as lines.
  const hourLines = hours
    .map(
      (minute) =>
        `<i class="hour" style="top:${round(Math.min((minute - start) * perMinute, grid - 0.2))}mm"></i>`,
    )
    .join("");
  const heads = days
    .map((day) => {
      const slots = typical.slots.filter((s) => s.weekday === day.weekday);
      const regular = slots.filter((s) => s.annotation.kind !== "count");
      const basis = regular.length ? regular : slots;
      const summary = basis.length
        ? `${minuteText(Math.min(...basis.map((s) => s.startMinute)))}–${clock(Math.max(...basis.map((s) => s.endMinute)))}`
        : x.wallNothingFixed;
      const allDay = allDayOf(day.weekday)
        .map((entry) => {
          const mark = annotationText(entry.annotation, language, "full");
          return mark ? `${entry.label} (${mark})` : entry.label;
        })
        .join(" · ");
      return `<div class="day-head"><b>${e(weekdayName(day.weekday, "long"))}</b><small>${e(summary)}</small>${allDay ? `<span class="all-day">${e(`${x.wallAllDay}: ${allDay}`)}</span>` : ""}</div>`;
    })
    .join("");
  const body = days
    .map((day) => {
      const blocks = clusters(day.lessons)
        .map((group) =>
          group[0].lanes > maxLanes
            ? renderStack(group)
            : group.map(renderBlock).join(""),
        )
        .join("");
      return `<section class="wall-day">${hourLines}${blocks}</section>`;
    })
    .join("");
  const ruler = `<div class="wall-ruler">${hours
    .map(
      (minute) =>
        `<span style="top:${round((minute - start) * perMinute)}mm">${minuteText(minute)}</span>`,
    )
    .join("")}</div>`;

  const notes: [string, string][] = [];
  const runs = typical.otherDates.flatMap((group) =>
    group.runs.map((run) => ({ title: group.title, run })),
  );
  const other: string[] = [];
  let previous: string | undefined;
  for (const { title, run } of runs.slice(0, 8)) {
    const text = `${weekDate(run.from, language, { weekday: "short" })} ${dayMonth(run.from)}${run.to === run.from ? "" : `–${weekDate(run.to, language, { weekday: "short" })} ${dayMonth(run.to)}`} ${run.timeLabel}`;
    if (title === previous) other[other.length - 1] += `, ${text}`;
    else other.push(`${title} ${text}`);
    previous = title;
  }
  if (runs.length > 8)
    other.push(x.wallMore.replace("{count}", String(runs.length - 8)));
  if (typical.personalOneOffs)
    other.push(
      `${x.wallPersonal}: ${typical.personalOneOffs} ${countLabel(language, "oneOff", typical.personalOneOffs)}`,
    );
  if (other.length) notes.push([x.wallOtherDates, other.join("; ")]);
  if (typical.breakRuns.length)
    notes.push([
      x.wallNoClassWeeks,
      typical.breakRuns
        .map((run) => `${dayMonth(run.from)}–${dayMonth(run.to)}`)
        .join(", "),
    ]);
  const unknown = courses.filter((course) =>
    calendarFor([course], input.term, language).unresolved.some(
      (id) => !id.endsWith(":attendance"),
    ),
  );
  if (unknown.length)
    notes.push([
      x.unknown,
      unknown
        .map((c) => c.titles[language] ?? c.titles.en ?? c.code)
        .join(", "),
    ]);
  const away = typical.absences.filter((a) => !a.recurring),
    regularly = typical.absences.filter((a) => a.recurring);
  if (away.length)
    notes.push([
      x.wallAway,
      away
        .map(
          (a) =>
            `${a.label} ${dayMonth(a.start)}${a.end === a.start ? "" : `–${dayMonth(a.end)}`}`,
        )
        .join(", "),
    ]);
  if (regularly.length)
    notes.push([
      x.wallRegularlyAway,
      regularly
        .map(({ label, recurring }) => {
          const [from, to] = recurring!.timeLabel.split("–");
          const mark = annotationText(recurring!.annotation, language, "full");
          return `${label} ${weekdayName(recurring!.weekday, "short")} ${from}–${weekdayName(recurring!.endWeekday, "short")} ${to}${mark ? ` (${mark})` : ""}`;
        })
        .join(", "),
    ]);
  if (typical.slots.some((slot) => slot.internalOverlap))
    notes.push(["", x.wallOverlapNote]);
  const attendance = courses.map(selectedMeetings);
  if (attendance.some((a) => a.stale)) notes.push(["", x.wallStale]);
  else if (attendance.some((a) => a.unresolved))
    notes.push(["", x.wallAttendance]);

  const head = `<header class="wall-head"><h1>${e(input.name)}</h1><strong>${e(`${x.typicalWeek} · ${semesterLabel(input.term, language)}`)}</strong>${typical.span ? `<p>${typical.span.weeks} ${e(countLabel(language, "classWeek", typical.span.weeks))} · ${swissDate(typical.span.firstDate)}–${swissDate(typical.span.lastDate)}</p>` : ""}</header>`;
  const legend = `<p class="wall-legend"><span><i class="chip course-colour-0"></i>${e(x.wallClass)}</span><span><i class="chip chip-personal"></i>${e(x.wallPersonal)}</span><span><i class="bar"></i>${e(x.wallNotWeekly)}</span><span>${e(x.wallCountKey)}</span><span>${e(x.wallBlank)}</span></p>`;
  const footer = `<footer class="wall-foot">${legend}<p class="wall-notes">${notes
    .map(
      ([label, text]) =>
        `<span>${label ? `<b>${e(label)}:</b> ` : ""}${e(text)}</span>`,
    )
    .join(" · ")}</p><p class="wall-meta">${e(
    [
      x.wallHolidays,
      "UniFr Planner",
      `${x.generated} ${swissDate(localDate(generated.toISOString()))}`,
      printSourceNote(courses, language, input.sourceStatus),
    ].join(" · "),
  )}</p></footer>`;
  const main = typical.slots.length
    ? `<div class="wall-corner"></div>${heads}${ruler}${body}`
    : `<p class="wall-empty">${e(x.wallEmpty)}</p>`;
  const palette = weekColours
    .map(
      (fill, i) =>
        `.course-colour-${i}{--fill:#${fill};--accent:#${weekAccents[i]}}`,
    )
    .join("");
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${e(`${input.name} · ${x.typicalWeek} · ${semesterLabel(input.term, language)}`)}</title><style>
@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}html{-webkit-text-size-adjust:100%;text-size-adjust:100%}html,body{margin:0;padding:0}body{font:8pt/${LINE_HEIGHT} Arial,Helvetica,"Liberation Sans",sans-serif;color:#10222e;background:#e9edf0}.tools{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:16px;font:14px/1.4 Arial,sans-serif}.tools button{font:inherit;padding:10px 16px}
.wall-sheet{width:${WALL_MM.width}mm;height:${WALL_MM.height}mm;overflow:hidden;margin:0 auto 24px;background:#fff;box-shadow:0 1mm 4mm rgba(16,34,46,.25);display:grid;grid-template-columns:${WALL_MM.ruler}mm repeat(${days.length},minmax(0,1fr));grid-template-rows:${WALL_MM.header}mm ${dayHead}mm minmax(0,1fr) ${WALL_MM.footer}mm;row-gap:${WALL_MM.rowGap}mm;break-inside:avoid;page-break-inside:avoid}
.wall-head{grid-column:1/-1;min-width:0;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) auto;align-content:end;column-gap:4mm;padding:0 1mm .8mm;border-bottom:.3mm solid #10222e}.wall-head h1{margin:0;font-size:14pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wall-head strong{align-self:end;font-size:10pt;white-space:nowrap}.wall-head p{grid-column:1/-1;margin:0;font-size:8pt;color:#364652;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.day-head{min-width:0;overflow:hidden;padding:.4mm 1mm 0;border-left:.2mm solid #9aa5ad}.day-head b{display:block;font-size:10pt;text-transform:capitalize;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.day-head small,.day-head .all-day{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.day-head small{font-size:7.5pt;font-weight:bold;color:#364652}.day-head .all-day{font-size:7pt}
.wall-ruler,.wall-day{position:relative;min-width:0}.wall-ruler span{position:absolute;right:1mm;font-size:6.5pt;transform:translateY(-50%)}.wall-ruler span:first-child{transform:none}.wall-ruler span:last-child{transform:translateY(-100%)}.wall-day{overflow:hidden;border-left:.2mm solid #9aa5ad}.hour{position:absolute;left:0;right:0;border-top:.2mm solid #d3dade}.hour:first-child,.hour:nth-child(${hours.length}){border-color:#9aa5ad}
.wall-block,.wall-stack{position:absolute;overflow:hidden;border:.25mm solid #667b88;border-left:1.2mm solid var(--accent);padding:.35mm .25mm .35mm .35mm;border-radius:.6mm;background:var(--fill)}.wall-block.not-weekly{border-left-style:dashed}.wall-block.personal{background:repeating-linear-gradient(45deg,#fff 0 .9mm,#dde2e6 .9mm 1.5mm);border-color:#33414b;border-top-style:dotted;border-right-style:dotted;border-bottom-style:dotted}
.wall-block b,.wall-block span{display:block;overflow:hidden}.wall-block b{font-size:${FONT.title}pt;overflow-wrap:anywhere;hyphens:auto}.wall-block b.t1{white-space:nowrap;text-overflow:ellipsis}.wall-block b.t2{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;max-height:${round(2 * lineMm(FONT.title))}mm}.wall-block b em{font-style:normal}.wall-block span{white-space:nowrap;text-overflow:ellipsis;font-size:${FONT.detail}pt}.wall-block .time,.wall-block .mark,.wall-block .one{font-size:${FONT.time}pt;font-weight:bold;font-variant-numeric:tabular-nums}.wall-block.narrow b{font-size:${FONT.narrowTitle}pt}.wall-block.narrow b.t2{max-height:${round(2 * lineMm(FONT.narrowTitle))}mm}.wall-block.narrow .time,.wall-block.narrow .mark,.wall-block.narrow .one{font-size:${FONT.narrowTime}pt}
.wall-stack{left:${WALL_MM.laneGap / 2}mm;right:${WALL_MM.laneGap / 2}mm;--accent:#667b88;--fill:#fff;border-left-style:double}.stack-line{display:block;font-size:${FONT.detail}pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chip{display:inline-block;width:2.2mm;height:2.2mm;margin-right:.8mm;vertical-align:-.3mm;border:.25mm solid var(--accent);background:var(--fill)}.chip-personal{--accent:#33414b;border-style:dotted;background:repeating-linear-gradient(45deg,#fff 0 .5mm,#aab3ba .5mm .8mm)}.bar{display:inline-block;width:0;height:2.4mm;margin-right:.8mm;vertical-align:-.4mm;border-left:1.2mm dashed #216d91}
.wall-foot{grid-column:1/-1;min-width:0;overflow:hidden;padding:.6mm 1mm 0;border-top:.3mm solid #10222e;font-size:7pt}.wall-foot p{margin:0}.wall-legend{display:flex;gap:3.5mm;white-space:nowrap;overflow:hidden}.wall-notes{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-height:${round(2 * lineMm(7))}mm}.wall-meta{font-size:6.5pt;color:#364652;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wall-corner{min-width:0}.wall-empty{grid-column:1/-1;grid-row:2/4;align-self:center;margin:0;text-align:center;font-size:14pt}${palette}
@media screen and (max-width:1100px){.wall-sheet{zoom:.7}}@media screen and (max-width:760px){.wall-sheet{zoom:.36}}@media print{body{background:#fff}.tools{display:none}.wall-sheet{margin:0;box-shadow:none}}
</style></head><body><div class="tools"><button id="print">${e(x.printDocument)}</button><span>${e(x.wallHelp)}</span></div><main class="wall-sheet">${head}${main}${footer}</main></body></html>`;
}
export function printWall(input: WeeklyExport) {
  openPrintHtml(wallPrintHtml(input));
}
