import { printSourceNote } from "./print-source";
import { layoutWeek, courseColour } from "./week-layout";
import { shareMessages } from "../sharing/messages";
import { timetableMessages } from "./timetable-messages";
import {
  weekColours,
  minuteText,
  weekDate,
  exportManifest,
  type WeeklyExport,
} from "./weekly-export";
import { detectConflicts, localDate } from "./calendar";
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
const e = escapeHtml;
export function weeklyPrintHtml(input: WeeklyExport) {
  const t = shareMessages[input.language],
    x = timetableMessages[input.language],
    week = layoutWeek(input.events, input.monday);
  const total = week.endMinute - week.startMinute;
  const lessons = week.days.flatMap((d) => d.lessons);
  // One reference per course (event owner): lecture, exercises, every weekday and
  // both halves of an overnight event share it. Numbered by first appearance.
  const owners = [...new Set(lessons.map((l) => l.event.owner))];
  const label = (owner: string) => `S${owners.indexOf(owner) + 1}`;
  const reference = (lesson: (typeof lessons)[number]) =>
    label(lesson.event.owner);
  const manifest = exportManifest(input);
  const conflicts = (
    input.conflicts ?? detectConflicts(input.events, [], 0)
  ).filter(
    (c) =>
      localDate(c.start) >= input.monday &&
      localDate(c.start) <= week.days[6].date,
  );
  const summary = `${conflicts.filter((c) => c.kind !== "internal").length} ${x.collisions} · ${conflicts.filter((c) => c.kind === "internal").length} ${x.internalCount}`;
  // Dense weeks use one page per teaching day. Every page keeps true time geometry
  // and its own complete key; a small box never has to contain a long course title.
  // References stay week-wide, so a course keeps its label on every day page.
  const groups = !lessons.length
    ? []
    : lessons.length > 14
      ? week.days.filter((d) => d.lessons.length).map((d) => [d])
      : [week.days];
  const pages = groups
    .map((days) => {
      const hours = Array.from(
        { length: total / 60 + 1 },
        (_, i) =>
          `<span style="top:${((i * 60) / total) * 100}%">${minuteText(week.startMinute + i * 60)}</span>`,
      ).join("");
      const grid = days
        .map(
          (day) =>
            `<section class="day"><h2>${e(weekDate(day.date, input.language))}</h2><div class="events">${day.lessons.map((lesson) => `<article style="top:${((lesson.startMinute - week.startMinute) / total) * 100}%;height:${((lesson.endMinute - lesson.startMinute) / total) * 100}%;left:${(lesson.lane / lesson.lanes) * 100}%;width:${100 / lesson.lanes}%;background:#${weekColours[courseColour(lesson.event.owner)]}">${reference(lesson)}</article>`).join("")}</div></section>`,
        )
        .join("");
      // One entry per course on this page, in ascending reference order. Its slots
      // stay inline, so the key is no taller than one line per lesson.
      const key = owners
        .map((owner) => {
          const slots = days.flatMap((d) =>
            d.lessons
              .filter((l) => l.event.owner === owner)
              .map((l) => ({ date: d.date, l })),
          );
          if (!slots.length) return "";
          return `<li><b>${label(owner)}</b> ${e(slots[0].l.event.title)} · ${slots.map(({ date, l }) => `${e(weekDate(date, input.language, { weekday: "short" }))} ${minuteText(l.startMinute)}–${minuteText(l.endMinute)} · ${e(l.event.location || x.roomUnknown)}${l.event.sessionType ? ` · ${e(l.event.sessionType)}` : ""}`).join("; ")}</li>`;
        })
        .join("");
      return `<section class="calendar-sheet"><h1>${e(input.name)}</h1><p class="subtitle">${e(x.week)} · ${input.monday} – ${week.days[6].date} · ${e(input.term)} · Europe/Zurich</p><p class="warning">${e(summary)}${input.unresolved ? ` · ${e(t.missingDates)}` : ""}</p><div class="page-layout ${days.length === 1 ? "single-day" : ""}"><div class="week" style="grid-template-columns:40px repeat(${days.length},minmax(0,1fr))"><div class="ruler">${hours}</div>${grid}</div><div class="week-key"><h2>${e(x.key)}</h2><ol>${key}</ol></div></div><footer>UniFr Planner · ${e(x.generated)} ${new Date().toISOString().slice(0, 10)} · ${e(input.term)} · ${e(
        printSourceNote(
          manifest.map((m) => m.course),
          input.language,
          input.sourceStatus,
        ),
      )}</footer></section>`;
    })
    .join("");
  const rows = week.days
    .flatMap((day) =>
      day.lessons.map(
        (l) =>
          `<tr><td>${reference(l)} · ${e(weekDate(day.date, input.language))}</td><td>${minuteText(l.startMinute)}–${minuteText(l.endMinute)}</td><td>${e(l.event.title)}${l.event.sessionType ? `<br>${e(l.event.sessionType)}` : ""}</td><td>${e(l.event.location || x.roomUnknown)}</td></tr>`,
      ),
    )
    .join("");
  const credits = manifest.reduce((n, m) => n + (m.course.ects ?? 0), 0);
  const coverage = manifest.length
    ? `<h2>${e(x.manifest)}</h2><p>${credits} ECTS${manifest.some((m) => m.course.ects === null) ? " + ?" : ""} · ${e(x.credits)}</p><table><thead><tr><th>${e(t.course)}</th><th>Code</th><th>ECTS</th><th>${e(x.manifest)}</th></tr></thead><tbody>${manifest.map((m) => `<tr><td>${e(m.title)}</td><td>${e(m.course.code)}</td><td>${m.course.ects ?? "?"}</td><td>${e(m.reason)}<br>${e(m.course.offering?.source_url ?? "")}</td></tr>`).join("")}</tbody></table>`
    : "";
  return `<!doctype html><html lang="${input.language}"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${e(input.name)} · ${e(x.week)} · ${input.term} · ${input.monday}</title><style>
 @page{size:A4 landscape;margin:10mm;@bottom-right{content:counter(page) " / " counter(pages);font:9px Arial;color:#536271}}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172b3a;margin:24px;background:#f5f7f8}h1{font-size:20px;margin:0 0 5px}h2{font-size:13px;margin:7px 0}p{font-size:11px;line-height:1.35;margin:5px 0}button{font:inherit;padding:12px 18px}.tools{display:flex;gap:16px;margin-bottom:20px}.sheet{max-width:1100px;margin:auto;background:white;padding:24px}.subtitle{color:#364652}.week{display:grid;border:1px solid #778896}.day{border-left:1px solid #a5afb6;min-width:0}.day h2{font-size:10px;height:32px;margin:0;padding:6px;background:#f1f4f6}.events,.ruler{position:relative;height:280px}.events{background:repeating-linear-gradient(to bottom,transparent 0,transparent calc(${(280 * 60) / total}px - 1px),#dce2e8 calc(${(280 * 60) / total}px - 1px),#dce2e8 ${(280 * 60) / total}px)}.ruler{margin-top:32px}.ruler span{position:absolute;font-size:9px;transform:translateY(-50%)}.ruler span:first-child{transform:none}.ruler span:last-child{transform:translateY(-100%)}article{position:absolute;border:1px solid #667b88;padding:1px;font-size:11px;line-height:1;font-weight:bold;print-color-adjust:exact}.week-key ol{list-style:none;padding:0;margin:0;columns:2;column-gap:20px}.week-key li{font-size:10px;line-height:1.3;padding:3px 0;break-inside:avoid;overflow-wrap:anywhere}.single-day{display:grid;grid-template-columns:1fr 2fr;gap:20px}.single-day .week-key ol{columns:1}.single-day .week-key li{font-size:12px;padding:5px 0}.warning{font-weight:bold}.lesson-list{margin-top:24px}table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}td,th{text-align:left;padding:7px;border-bottom:1px solid #b6c0c8;overflow-wrap:anywhere}tr{break-inside:avoid}thead{display:table-header-group}footer{font-size:9px;margin-top:10px}.calendar-sheet{margin-bottom:28px}@media print{body{background:white;margin:0}.tools{display:none}.sheet{padding:0;max-width:none}.calendar-sheet{break-after:page;break-inside:avoid;margin:0}.lesson-list{margin:0}}
 </style></head><body><div class="tools"><button id="print">${e(t.print)}</button><span>${e(t.printHelp)}</span></div><main class="sheet">${pages}<section class="lesson-list"><h1>${e(input.name)} · ${e(input.term)} · ${input.monday}</h1><h2>${e(t.lessons)}</h2>${rows ? `<table><thead><tr><th colspan="4">${e(input.name)} · ${e(input.term)} · ${input.monday} · Europe/Zurich</th></tr><tr><th>${e(t.date)}</th><th>${e(t.time)}</th><th>${e(t.course)}</th><th>${e(t.room)}</th></tr></thead><tbody>${rows}</tbody></table>` : `<p>${e(t.noEvents)}</p>`}${coverage}</section></main></body></html>`;
}
export function openPrintHtml(html: string) {
  const preview = window.open("", "_blank");
  if (!preview) throw new Error("Print window blocked");
  preview.opener = null;
  preview.document.open();
  preview.document.write(html);
  preview.document.close();
  preview.document.getElementById("print")!.onclick = () => preview.print();
  preview.focus();
}
export function printWeek(input: WeeklyExport) {
  openPrintHtml(weeklyPrintHtml(input));
}
