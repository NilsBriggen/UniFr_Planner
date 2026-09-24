import { printSourceNote } from "./print-source";
import { exportManifest, type WeeklyExport } from "./weekly-export";
import { escapeHtml as e, openPrintHtml } from "./weekly-print";
import { timetableMessages } from "./timetable-messages";
import { shareMessages } from "../sharing/messages";
import { plannerMessages } from "./messages";
import { type CalendarEvent, zone } from "./calendar";
import type { Plan } from "./domain";
import { activeScenario } from "./domain";
import type { Language } from "../i18n";
function documentHtml(
  name: string,
  scope: string,
  language: Language,
  body: string,
  sourceNote?: string,
) {
  const x = timetableMessages[language];
  const heading = `${name} · ${scope}`;
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${e(heading)}</title><style>@page{size:A4 portrait;margin:15mm;@bottom-right{content:counter(page) " / " counter(pages);font:9px Arial;color:#536271}}body{font:12px/1.4 Arial,sans-serif;color:#172b3a;max-width:900px;margin:24px auto}h1{font-size:22px}h2{font-size:16px}table{width:100%;border-collapse:collapse;table-layout:fixed}td,th{padding:7px;text-align:left;border-bottom:1px solid #adb8c0;overflow-wrap:anywhere;vertical-align:top}tr{break-inside:avoid}thead{display:table-header-group}.context{font-size:10px;color:#364652}.evidence{break-before:page}button{padding:10px;font:inherit}.warning{font-weight:bold}@media print{body{margin:0;max-width:none}.tools{display:none}h2{break-after:avoid}}</style></head><body><div class="tools"><button id="print">${e(shareMessages[language].print)}</button> A4 ${e(x.portrait)} · Letter ${e(x.portrait)}</div><h1>${e(heading)}</h1><p class="context">Europe/Zurich · ${e(x.generated)} ${new Date().toISOString().slice(0, 10)} · ${e(sourceNote ?? x.unpublished)}</p>${body}</body></html>`;
}
export function scopedPrintHtml(
  input: WeeklyExport & { cancelled?: CalendarEvent[] },
  scope: "agenda" | "roster",
) {
  const x = timetableMessages[input.language],
    t = shareMessages[input.language];
  const manifest = exportManifest(input),
    conflicts = input.conflicts ?? [];
  const title = (id: string) => {
    const course = input.courses.find((c) => c.id === id);
    return (
      course?.titles[input.language] ?? course?.titles.en ?? course?.code ?? id
    );
  };
  const pairs = new Set(
    conflicts
      .filter((c) => c.kind === "hard")
      .map((c) => [c.first, c.second].sort().join("|")),
  ).size;
  const summary = `<p class="warning">${pairs} ${e(x.pairs)} · ${conflicts.filter((c) => c.kind !== "internal").length} ${e(x.collisions)} · ${conflicts.filter((c) => c.kind === "internal").length} ${e(x.internalCount)}</p>`;
  const missing = manifest.filter((m) =>
    ["unknown-dates", "provisional-attendance", "stale-attendance"].includes(
      m.reasonKind,
    ),
  );
  const unknown = missing.length
    ? `<h2>${e(x.manifest)}</h2><ul>${missing.map((m) => `<li>${e(m.title)} · ${e(m.course.code)} · ${m.course.ects ?? "?"} ECTS · ${e(m.reason)}</li>`).join("")}</ul>`
    : "";
  const date = (v: string) =>
    new Intl.DateTimeFormat(input.language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: zone,
    }).format(new Date(v));
  const head = `<thead><tr><th colspan="4">${e(input.name)} · ${e(input.term)} · Europe/Zurich</th></tr><tr><th>${e(t.date)}</th><th>${e(t.course)}</th><th>${e(t.room)}</th><th>${e(x.source)}</th></tr></thead>`;
  const rows = (events: CalendarEvent[]) =>
    events
      .map(
        (event) =>
          `<tr><td>${e(date(event.start))}<br>– ${e(date(event.end))}</td><td>${e(event.title)}<br>${e(event.sessionType ?? "")}</td><td>${e(event.location || x.roomUnknown)}</td><td>${event.sourceUrl && /^https?:\/\//i.test(event.sourceUrl) ? `<a href="${e(event.sourceUrl)}">${e(x.source)}</a>` : ""}</td></tr>`,
      )
      .join("");
  const roster = `<table><thead><tr><th colspan="4">${e(input.name)} · ${e(input.term)}</th></tr><tr><th>${e(t.course)}</th><th>Code</th><th>ECTS</th><th>${e(x.source)}</th></tr></thead><tbody>${manifest.map((m) => `<tr><td>${e(m.title)}</td><td>${e(m.course.code)}</td><td>${m.course.ects ?? "?"}</td><td>${e(m.course.offering?.source_url ?? "")}</td></tr>`).join("")}</tbody></table>`;
  const evidence = conflicts.length
    ? `<section class="evidence"><h2>${e(x.evidence)}</h2><table><thead><tr><th>${e(input.name)} · ${e(input.term)}</th><th>${e(t.conflicts)}</th></tr></thead><tbody>${conflicts.map((c) => `<tr data-conflict><td>${e(date(c.start))}</td><td>${e(c.kind === "internal" ? x.internal : plannerMessages[input.language][c.kind])} · ${e(title(c.first))}${c.first !== c.second ? ` / ${e(title(c.second))}` : ""}</td></tr>`).join("")}</tbody></table></section>`
    : "";
  return documentHtml(
    input.name,
    `${scope === "agenda" ? x.agenda : x.roster} · ${input.term}`,
    input.language,
    scope === "agenda"
      ? `${summary}${unknown}<table>${head}<tbody>${rows(input.events)}</tbody></table>${input.cancelled?.length ? `<h2>${e(plannerMessages[input.language].cancelled)}</h2><table>${head}<tbody>${rows(input.cancelled)}</tbody></table>` : ""}${evidence}`
      : `${unknown}${roster}`,
    printSourceNote(
      manifest.map((m) => m.course),
      input.language,
      input.sourceStatus,
    ),
  );
}
export function printRoster(
  plan: Plan,
  language: Language,
  term: string | null,
  includeEmpty = false,
) {
  const x = timetableMessages[language],
    courses = activeScenario(plan).courses;
  const terms = term ? [term] : [...plan.semesters, "completed", "unscheduled"];
  const body = terms
    .map((value) => ({
      value,
      courses: courses.filter((c) =>
        value === "completed"
          ? c.status === "completed"
          : value === "unscheduled"
            ? c.semester === null && c.status !== "completed"
            : c.semester === value && c.status !== "completed",
      ),
    }))
    .filter((g) => includeEmpty || g.courses.length)
    .map(
      (g) =>
        `<h2>${e(g.value)}</h2><table><thead><tr><th>${e(plan.name)} · ${e(g.value)}</th><th>Code</th><th>ECTS</th></tr></thead><tbody>${g.courses.map((c) => `<tr><td>${e(c.titles[language] ?? c.titles.en ?? c.code)}</td><td>${e(c.code)}</td><td>${c.ects ?? "?"}</td></tr>`).join("")}</tbody></table>`,
    )
    .join("");
  openPrintHtml(
    documentHtml(plan.name, `${x.roster} · ${term ?? x.whole}`, language, body),
  );
}
