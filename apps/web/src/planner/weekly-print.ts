import { layoutWeek, courseColour } from "./week-layout";
import { shareMessages } from "../sharing/messages";
import {
  weekColours,
  minuteText,
  weekDate,
  type WeeklyExport,
} from "./weekly-export";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
export function weeklyPrintHtml(input: WeeklyExport) {
  const t = shareMessages[input.language],
    week = layoutWeek(input.events, input.monday);
  const total = week.endMinute - week.startMinute;
  const hours = Array.from(
    { length: total / 60 + 1 },
    (_, i) =>
      `<span style="top:${((i * 60) / total) * 100}%">${minuteText(week.startMinute + i * 60)}</span>`,
  ).join("");
  const days = week.days
    .map(
      (day) =>
        `<section class="day"><h2>${escape(weekDate(day.date, input.language))}</h2><div class="events">${day.lessons
          .map((lesson) => {
            const course = input.courses.find(
              (c) => c.id === lesson.event.owner,
            );
            return `<article style="top:${((lesson.startMinute - week.startMinute) / total) * 100}%;height:${((lesson.endMinute - lesson.startMinute) / total) * 100}%;left:${(lesson.lane / lesson.lanes) * 100}%;width:${100 / lesson.lanes}%;background:#${weekColours[courseColour(course?.code ?? lesson.event.owner)]}"><b>${escape(lesson.event.title)}</b><span>${minuteText(lesson.startMinute)}–${minuteText(lesson.endMinute)}</span><span>${escape(lesson.event.location)}</span></article>`;
          })
          .join("")}</div></section>`,
    )
    .join("");
  const rows = week.days
    .flatMap((day) =>
      day.lessons.map(
        (lesson) =>
          `<tr><td>${escape(weekDate(day.date, input.language))}</td><td>${minuteText(lesson.startMinute)}–${minuteText(lesson.endMinute)}</td><td>${escape(lesson.event.title)}</td><td>${escape(lesson.event.location)}</td></tr>`,
      ),
    )
    .join("");
  return `<!doctype html><html lang="${input.language}"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${escape(input.name)} · ${input.monday}</title><style>
  @page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172b3a;margin:24px;background:#f5f7f8}h1{font-size:24px;color:#0a3859;margin:0 0 6px}p{font-size:12px;line-height:1.5}button{font:inherit;padding:12px 18px;background:#0a3859;color:white;border:0;border-radius:5px;cursor:pointer}.tools{display:flex;align-items:center;gap:16px;margin-bottom:20px}.sheet{max-width:1120px;margin:auto;background:white;padding:24px}.subtitle{margin:0 0 16px;color:#536271}.week{display:grid;grid-template-columns:44px repeat(7,minmax(0,1fr));border:1px solid #d8e0e6}.day{border-left:1px solid #d8e0e6;min-width:0}.day h2{font-size:11px;height:38px;margin:0;padding:8px;background:#f1f4f6}.events,.ruler{position:relative;height:390px;background:repeating-linear-gradient(to bottom,transparent 0,transparent calc(${(390 * 60) / total}px - 1px),#e4eaf0 calc(${(390 * 60) / total}px - 1px),#e4eaf0 ${(390 * 60) / total}px)}.ruler{margin-top:38px;background:none}.ruler span{position:absolute;font-size:9px;padding-left:3px;transform:translateY(-50%)}.ruler span:first-child{transform:none}.ruler span:last-child{transform:translateY(-100%)}article{position:absolute;border:1px solid white;border-left:3px solid #638197;padding:4px;overflow:hidden;font-size:9px;line-height:1.3;print-color-adjust:exact;-webkit-print-color-adjust:exact}article span{display:block}article b{display:block;overflow-wrap:anywhere}.notes{height:48px;border-bottom:1px solid #d8e0e6;margin-top:14px;font-size:11px}.warning{color:#7b5015}.lesson-list{margin-top:30px}.lesson-list h2{font-size:20px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{text-align:left;padding:10px;border-bottom:1px solid #d8e0e6}th{color:#0a3859}tr{break-inside:avoid}thead{display:table-header-group}footer{font-size:10px;color:#536271;margin-top:16px}@media print{body{background:white;margin:0}.tools{display:none}.sheet{padding:0;max-width:none}.calendar-sheet{break-after:page}.lesson-list{margin-top:0}.week,.calendar-sheet{break-inside:avoid}body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><div class="tools"><button id="print">${escape(t.print)}</button><span>${escape(t.printHelp)}</span></div><main class="sheet"><section class="calendar-sheet"><h1>${escape(input.name)}</h1><p class="subtitle">${escape(t.weekly)} · ${input.monday} – ${week.days[6].date} · ${escape(input.term)} · Europe/Zurich</p>${input.unresolved ? `<p class="warning">${escape(t.missingDates)}</p>` : ""}<div class="week"><div class="ruler">${hours}</div>${days}</div><div class="notes">${escape(t.notes)}</div><footer>UniFr Planner · ${escape(t.printNote)}</footer></section><section class="lesson-list"><h2>${escape(t.lessons)}</h2>${rows ? `<table><thead><tr><th>${escape(t.date)}</th><th>${escape(t.time)}</th><th>${escape(t.course)}</th><th>${escape(t.room)}</th></tr></thead><tbody>${rows}</tbody></table>` : `<p>${escape(t.noEvents)}</p>`}</section></main></body></html>`;
}
export function printWeek(input: WeeklyExport) {
  const preview = window.open("", "_blank");
  if (!preview) throw new Error("Print window blocked");
  preview.opener = null;
  preview.document.open();
  preview.document.write(weeklyPrintHtml(input));
  preview.document.close();
  preview.document.getElementById("print")!.onclick = () => preview.print();
  preview.focus();
}
