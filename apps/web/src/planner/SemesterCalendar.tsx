import AttendanceControls from "./AttendanceControls";
import { timetableMessages } from "./timetable-messages";
import { scopedPrintHtml } from "./scoped-print";
import { openPrintHtml, printWeek } from "./weekly-print";
import { shareMessages } from "../sharing/messages";
import { semesterLabel } from "./SemesterField";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Temporal } from "@js-temporal/polyfill";
import { Button } from "../components";
import { messages, type Language } from "../i18n";
import {
  activeScenario,
  updateScenario,
  planningSemester,
  currentSemester,
} from "./domain";
import { usePlans } from "./context";
import {
  calendarFor,
  canonicalTerm,
  detectConflicts,
  exportCalendar,
  localDate,
  localInstant,
  termRange,
  zone,
  type CalendarEvent,
} from "./calendar";
import { plannerMessages } from "./messages";
import { Download, SaveStatus } from "./PlanControls";
import WeekTimetable from "./WeekTimetable";
import { discoveryMessages } from "../discovery/messages";
import SharePanel from "../sharing/SharePanel";
import WeeklyDownloads from "./WeeklyDownloads";
import { experienceMessages } from "../experience-messages";
import { defaultCalendarDate, readCalendarView } from "./calendar-view";
import { countLabel } from "./countLabels";

function EventCard({
  event,
  language,
  cancelled = false,
  compact = false,
}: {
  event: CalendarEvent;
  language: Language;
  cancelled?: boolean;
  compact?: boolean;
}) {
  const format = (value: string) =>
    new Intl.DateTimeFormat(language, {
      timeZone: zone,
      dateStyle:
        compact && localDate(event.start) === localDate(event.end)
          ? undefined
          : "medium",
      timeStyle: "short",
    }).format(new Date(value));
  return (
    <article className="calendar-event">
      <strong>{event.title}</strong>
      {cancelled && <strong>{plannerMessages[language].cancelled}</strong>}
      <p>
        <time dateTime={event.start}>{format(event.start)}</time> –{" "}
        <time dateTime={event.end}>{format(event.end)}</time>
      </p>
      <p>{event.location || timetableMessages[language].roomUnknown}</p>
      {event.sessionType && <p>{event.sessionType}</p>}
    </article>
  );
}
export default function SemesterCalendar({ language }: { language: Language }) {
  const { plan } = usePlans();
  const { term } = useParams();
  return plan ? (
    <Calendar
      key={`${plan.id}:${plan.activeScenarioId}:${term}`}
      language={language}
    />
  ) : null;
}
function Calendar({ language }: { language: Language }) {
  const { plan, busy, save, published } = usePlans();
  const navigate = useNavigate();
  const {
    term: parameter = plan ? planningSemester(plan) : currentSemester(),
  } = useParams();
  const term = canonicalTerm(parameter),
    t = plannerMessages[language];
  const scenario = plan ? activeScenario(plan) : undefined;
  const validTerm = plan?.semesters.includes(term);
  const calendar =
    scenario && validTerm
      ? calendarFor(scenario.courses, term, language)
      : { events: [], cancelled: [], unresolved: [] };
  const preferenceKey = `unifr.calendar:${plan?.id}:${scenario?.id}:${term}`;
  const [presentation, setPresentation] = useState(() => {
    try {
      return readCalendarView(sessionStorage.getItem(preferenceKey), term);
    } catch {
      return readCalendarView(null, term);
    }
  });
  const { view, date: selectedDate } = presentation;
  const setDate = (date: string) =>
    setPresentation((old) => ({ ...old, date }));
  const setView = (view: typeof presentation.view) =>
    setPresentation((old) => ({ ...old, view }));
  useEffect(() => {
    try {
      sessionStorage.setItem(preferenceKey, JSON.stringify(presentation));
    } catch {
      /* The timetable remains usable without presentation storage. */
    }
  }, [preferenceKey, presentation]);
  const x = experienceMessages[language];
  const [error, setError] = useState(false);
  const [printError, setPrintError] = useState(false);
  if (!plan || !scenario) return null;
  if (!validTerm)
    return (
      <section className="page">
        <h1>{messages[language].semester}</h1>
        <Link to="/plan">{messages[language].plan}</Link>
      </section>
    );
  const range = termRange(term);
  const busyEvents: CalendarEvent[] = scenario.unavailable
    .filter(
      (period) =>
        Date.parse(period.start) <
          Date.parse(
            localInstant(
              `${Temporal.PlainDate.from(range.end).add({ days: 1 })}T00:00`,
            ),
          ) &&
        Date.parse(period.end) >
          Date.parse(localInstant(`${range.start}T00:00`)),
    )
    .map((period) => ({
      ...period,
      owner: period.id,
      title: period.label,
      location: t.unavailable,
    }));
  const all = [...calendar.events, ...busyEvents].sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start),
  );
  const today = localDate(new Date().toISOString());
  const date =
    selectedDate ||
    defaultCalendarDate(
      term,
      all.map((event) => localDate(event.start)),
      today,
    );
  const plainDate = Temporal.PlainDate.from(date),
    monday = plainDate.subtract({ days: plainDate.dayOfWeek - 1 });
  const intersectsDay = (event: CalendarEvent, day: string) =>
    Date.parse(event.start) <
      Date.parse(
        localInstant(`${Temporal.PlainDate.from(day).add({ days: 1 })}T00:00`),
      ) && Date.parse(event.end) > Date.parse(localInstant(`${day}T00:00`));
  const conflicts = detectConflicts(
    calendar.events,
    scenario.unavailable,
    scenario.travelMinutes,
  );
  const name = (id: string) => {
    const course = scenario.courses.find((c) => c.id === id);
    return course
      ? (course.titles[language] ?? course.titles.en ?? course.code)
      : (scenario.unavailable.find((b) => b.id === id)?.label ?? id);
  };
  const shortDate = (day: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeZone: zone,
    }).format(new Date(`${day}T12:00:00Z`));
  const change = (next: typeof plan) => {
    void save(next).then((ok) => setError(!ok));
  };
  const exportBusy = busyEvents.filter(
    (event) =>
      localDate(event.start) <= range.end &&
      localDate(event.end) >= range.start,
  );
  const semesterCourses = scenario.courses.filter(
    (c) => c.semester === term && c.status !== "completed",
  );
  const unknownCredits = semesterCourses.filter((c) => c.ects === null).length;
  const tx = timetableMessages[language];
  const exportInput = {
    name: plan.name,
    sourceStatus: published.catalogue?.status,
    term,
    monday: monday.toString(),
    events: all,
    cancelled: calendar.cancelled,
    courses: semesterCourses,
    language,
    unresolved: calendar.unresolved.length > 0,
    conflicts,
  };
  const conflictGroups = new Map<string, typeof conflicts>();
  for (const conflict of conflicts) {
    const key = [
      conflict.kind,
      ...[conflict.first, conflict.second].sort(),
    ].join("|");
    conflictGroups.set(key, [...(conflictGroups.get(key) ?? []), conflict]);
  }
  const externalPairs = new Set(
    conflicts
      .filter((c) => c.kind === "hard")
      .map((c) => [c.first, c.second].sort().join("|")),
  ).size;
  return (
    <section className="page planner-page semester-page">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">
            {plan.name}
            {scenario.name !== plan.name && ` · ${scenario.name}`} ·{" "}
            {semesterLabel(term, language)}
          </p>
          <h1>{discoveryMessages[language].week}</h1>
          <SaveStatus language={language} />
        </div>
        <div className="workspace-actions no-print">
          <Button
            className="text-link"
            onClick={() => {
              setPrintError(false);
              try {
                printWeek(exportInput);
              } catch {
                setPrintError(true);
              }
            }}
          >
            {shareMessages[language].print}
          </Button>
          <SharePanel language={language} />
          <Link className="text-link" to="/plan">
            {messages[language].plan}
          </Link>
          <Link className="button primary" to={`/catalogue?term=${term}`}>
            <span aria-hidden="true">＋</span>
            {t.addCourses}
          </Link>
        </div>
      </header>
      {printError && <p role="alert">{shareMessages[language].exportError}</p>}
      <div className="semester-overview-stats">
        <span>
          <strong>
            {semesterCourses.reduce((sum, c) => sum + (c.ects ?? 0), 0)} ECTS
          </strong>
          {unknownCredits > 0 && ` + ${unknownCredits} ${t.unknown}`}
        </span>
        <span>
          {semesterCourses.length}{" "}
          {countLabel(language, "selected", semesterCourses.length)}
        </span>
        <span>
          {calendar.events.length}{" "}
          {countLabel(language, "meeting", calendar.events.length)} · {zone}
        </span>
        {conflicts.length > 0 && (
          <a className="schedule-indicator conflict" href="#schedule-check">
            {externalPairs} {tx.pairs} ·{" "}
            {conflicts.filter((c) => c.kind !== "internal").length}{" "}
            {tx.collisions} ·{" "}
            {conflicts.filter((c) => c.kind === "internal").length}{" "}
            {tx.internalCount}
          </a>
        )}
        {calendar.unresolved.length > 0 && (
          <a className="schedule-indicator unknown" href="#schedule-check">
            {t.unresolved} ·{" "}
            {new Set(calendar.unresolved.map((id) => id.split(":")[0])).size}
          </a>
        )}
      </div>
      {scenario.courses.some((course) => course.status === "unscheduled") && (
        <p className="schedule-warning">
          {t.unscheduledHelp} <Link to="/plan">{messages[language].plan}</Link>
        </p>
      )}
      <div className="calendar-panel">
        <div className="calendar-toolbar no-print">
          <div className="calendar-browse">
            <label className="calendar-term">
              <span className="visually-hidden">{t.semester}</span>
              <select
                aria-label={t.semester}
                value={term}
                onChange={(event) => {
                  setDate("");
                  navigate(`/semester/${event.target.value}`);
                }}
              >
                {plan.semesters.map((semester) => (
                  <option key={semester} value={semester}>
                    {semesterLabel(semester, language)}
                  </option>
                ))}
              </select>
            </label>
            {today >= range.start && today <= range.end && (
              <Button
                className="calendar-today"
                onClick={() => {
                  setDate(today);
                  setView("week");
                }}
              >
                {x.thisWeek}
              </Button>
            )}
            {view !== "agenda" && (
              <div className="calendar-date-navigation">
                {view === "week" && (
                  <Button
                    disabled={date <= range.start}
                    className="icon-button"
                    aria-label={t.previous}
                    title={t.previous}
                    onClick={() =>
                      setDate(
                        [
                          plainDate.subtract({ days: 7 }).toString(),
                          range.start,
                        ]
                          .sort()
                          .at(-1)!,
                      )
                    }
                  >
                    <svg
                      aria-hidden="true"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="m14 6-6 6 6 6" />
                    </svg>
                  </Button>
                )}
                <label className="date-label">
                  <span className="visually-hidden">{t.date}</span>
                  <input
                    aria-label={t.date}
                    type="date"
                    min={range.start}
                    max={range.end}
                    value={date}
                    onChange={(e) => {
                      if (
                        /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) &&
                        e.target.value >= range.start &&
                        e.target.value <= range.end
                      )
                        setDate(e.target.value);
                    }}
                  />
                </label>
                {view === "week" && (
                  <Button
                    disabled={date >= range.end}
                    className="icon-button"
                    aria-label={t.next}
                    title={t.next}
                    onClick={() =>
                      setDate(
                        [
                          plainDate.add({ days: 7 }).toString(),
                          range.end,
                        ].sort()[0],
                      )
                    }
                  >
                    <svg
                      aria-hidden="true"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path d="m10 6 6 6-6 6" />
                    </svg>
                  </Button>
                )}
              </div>
            )}
          </div>
          <div
            className="segmented"
            role="group"
            aria-label={discoveryMessages[language].week}
          >
            {(["week", "day", "agenda"] as const).map((key) => (
              <Button
                key={key}
                aria-pressed={view === key}
                onClick={() => setView(key)}
              >
                {t[key]}
              </Button>
            ))}
          </div>
        </div>
        <div className="screen-calendar">
          {view === "week" ? (
            <WeekTimetable
              events={all}
              monday={monday.toString()}
              language={language}
              courses={scenario.courses}
              conflicts={conflicts}
              onDay={(day) => {
                setDate(day);
                setView("day");
              }}
            />
          ) : (
            <>
              <h2>
                {view === "day"
                  ? shortDate(date)
                  : `${range.start} – ${range.end}`}
              </h2>
              <ul className="calendar-agenda">
                {all
                  .filter(
                    (event) => view !== "day" || intersectsDay(event, date),
                  )
                  .map((event) => (
                    <li key={event.id}>
                      <EventCard event={event} language={language} />
                    </li>
                  ))}
              </ul>
              {!all.some(
                (event) => view !== "day" || intersectsDay(event, date),
              ) && <p>{t.noEvents}</p>}
            </>
          )}
          {calendar.cancelled.length > 0 && (
            <section>
              <h2>{t.cancelled}</h2>
              {calendar.cancelled.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  language={language}
                  cancelled
                />
              ))}
            </section>
          )}
        </div>
        <details className="calendar-exports no-print">
          <summary>{x.exports}</summary>
          <p className="calendar-export-scope">
            {tx.week} · {monday.toString()} –{" "}
            {monday.add({ days: 6 }).toString()}
          </p>
          <div className="calendar-export">
            <WeeklyDownloads input={exportInput} />
            <Button
              onClick={() =>
                openPrintHtml(scopedPrintHtml(exportInput, "roster"))
              }
            >
              {tx.roster} · {term} · A4 {tx.portrait}
            </Button>
            {calendar.unresolved.length ? (
              <Button disabled>{t.exportIcs}</Button>
            ) : (
              <Download
                text={exportCalendar(
                  { ...calendar, events: [...calendar.events, ...exportBusy] },
                  new Date().toISOString(),
                )}
                filename={`semester-${term}.ics`}
                type="text/calendar;charset=utf-8"
              >
                {t.exportIcs}
              </Download>
            )}
            <Button
              onClick={() =>
                openPrintHtml(scopedPrintHtml(exportInput, "agenda"))
              }
            >
              {tx.agenda} · A4 {tx.portrait}
            </Button>
          </div>
        </details>
      </div>
      <div className="calendar-support">
        <section className="calendar-check" id="schedule-check">
          <h2>{t.conflictHeading}</h2>
          {calendar.unresolved.length > 0 && (
            <>
              <h3>{t.unresolved}</h3>
              <p>{t.unresolvedHelp}</p>
              <ul>
                {[
                  ...new Set(calendar.unresolved.map((id) => id.split(":")[0])),
                ].map((id) => (
                  <li key={id}>{name(id)}</li>
                ))}
              </ul>
            </>
          )}
          {(calendar.events.length > 0 || calendar.cancelled.length > 0) &&
            conflicts.length === 0 &&
            !calendar.unresolved.length && <p>{t.clear}</p>}
          {[...conflictGroups.entries()].map(([key, items]) => (
            <details key={key}>
              <summary>
                {items[0].kind === "internal" ? tx.internal : t[items[0].kind]}{" "}
                · {name(items[0].first)}
                {items[0].first !== items[0].second &&
                  ` / ${name(items[0].second)}`}{" "}
                · {items.length} {tx.collisions}
              </summary>
              <ul>
                {items.map((conflict, n) => (
                  <li key={n}>
                    {new Intl.DateTimeFormat(language, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: zone,
                    }).format(new Date(conflict.start))}
                  </li>
                ))}
              </ul>
            </details>
          ))}
          {semesterCourses.map((course) => (
            <AttendanceControls
              key={course.id}
              course={course}
              language={language}
              disabled={busy}
              onChange={(attendance) =>
                change(
                  updateScenario(plan, (s) => ({
                    ...s,
                    courses: s.courses.map((c) =>
                      c.id === course.id ? { ...c, attendance } : c,
                    ),
                  })),
                )
              }
            />
          ))}
          <label className="no-print">
            {t.travelMinutes}
            <input
              type="number"
              min="0"
              max="180"
              step="1"
              value={scenario.travelMinutes}
              disabled={busy}
              onChange={(e) => {
                const minutes = Number(e.target.value);
                if (Number.isInteger(minutes) && minutes >= 0 && minutes <= 180)
                  change(
                    updateScenario(plan, (s) => ({
                      ...s,
                      travelMinutes: minutes,
                    })),
                  );
              }}
            />
          </label>
        </section>
        <section className="print-only">
          <h2>
            {t.agenda} · {semesterLabel(term, language)}
          </h2>
          {all.map((event) => (
            <EventCard key={event.id} event={event} language={language} />
          ))}
          {calendar.cancelled.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              language={language}
              cancelled
            />
          ))}
        </section>
        <section className="unavailable-entry no-print">
          <h2>{x.availability}</h2>
          <details className="availability-form">
            <summary>{t.addBusy}</summary>
            <p>{t.busyHelp}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  data = new FormData(form);
                try {
                  const start = localInstant(String(data.get("start"))),
                    end = localInstant(String(data.get("end")));
                  if (Date.parse(end) <= Date.parse(start))
                    throw new Error("invalid end");
                  change(
                    updateScenario(plan, (s) => ({
                      ...s,
                      unavailable: [
                        ...s.unavailable,
                        {
                          id: crypto.randomUUID(),
                          label: String(data.get("label")),
                          start,
                          end,
                        },
                      ],
                    })),
                  );
                  setError(false);
                  form.reset();
                } catch {
                  setError(true);
                }
              }}
            >
              <fieldset className="planner-fields" disabled={busy}>
                <label>
                  {t.busyLabel}
                  <input name="label" required maxLength={200} />
                </label>
                <label>
                  {t.starts}
                  <input name="start" type="datetime-local" required />
                </label>
                <label>
                  {t.ends}
                  <input name="end" type="datetime-local" required />
                </label>
                <Button type="submit">{t.addBusy}</Button>
              </fieldset>
            </form>
            {error && <p role="alert">{t.invalidPeriod}</p>}
          </details>
          <ul className="unavailable-list">
            {scenario.unavailable.map((period) => (
              <li key={period.id}>
                <span>
                  {period.label} · {shortDate(localDate(period.start))}
                </span>
                <Button
                  disabled={busy}
                  aria-label={`${t.removeBusy} · ${period.label}`}
                  onClick={() =>
                    change(
                      updateScenario(plan, (s) => ({
                        ...s,
                        unavailable: s.unavailable.filter(
                          (b) => b.id !== period.id,
                        ),
                      })),
                    )
                  }
                >
                  {t.removeBusy}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
