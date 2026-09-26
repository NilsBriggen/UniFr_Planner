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
  maxUnavailablePeriods,
  type Unavailable,
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
  weeklyRepeats,
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
import { internalOverlapOwners } from "./typical-week";

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
const localTime = (value: string) =>
  Temporal.Instant.from(value).toZonedDateTimeISO(zone).toPlainDateTime();
/** Whether `next` is the weekly occurrence after `previous`. One week may be
 * missing only where weeklyRepeats skips it, inside a DST switch. */
function followsWeekly(previous: Unavailable, next: Unavailable) {
  const [start, end] = [previous.start, previous.end].map(localTime);
  const days = start
    .toPlainDate()
    .until(localTime(next.start).toPlainDate()).days;
  const [skipped, skippedEnd] = [start, end].map((value) =>
    value.add({ weeks: 1 }),
  );
  return (
    days === 7 ||
    (days === 14 &&
      weeklyRepeats(
        skipped.toString(),
        skippedEnd.toString(),
        skipped.toPlainDate().toString(),
      )?.length === 0)
  );
}
/** Unbroken weekly runs of periods sharing a label, weekday and local times,
 * in first-entry order. */
function weeklySeries(periods: Unavailable[]) {
  const series = new Map<string, Unavailable[][]>();
  // Runs of each key indexed by the local date of their last period, so a
  // period only checks the runs ending one or two weeks before it.
  const ends = new Map<string, Unavailable[][]>();
  const order = new Map(periods.map((period, index) => [period, index]));
  for (const period of [...periods].sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start),
  )) {
    const [start, end] = [period.start, period.end].map(localTime);
    const key = JSON.stringify([
      period.label,
      start.dayOfWeek,
      start.toPlainTime().toString(),
      end.toPlainTime().toString(),
      start.toPlainDate().until(end.toPlainDate()).days,
    ]);
    const date = start.toPlainDate();
    const at = (days: number) => `${key}|${date.subtract({ days }).toString()}`;
    const run = [...(ends.get(at(7)) ?? []), ...(ends.get(at(14)) ?? [])].find(
      (r) => followsWeekly(r.at(-1)!, period),
    );
    if (run) {
      const last = `${key}|${localTime(run.at(-1)!.start).toPlainDate().toString()}`;
      ends.set(
        last,
        ends.get(last)!.filter((r) => r !== run),
      );
      run.push(period);
    } else series.set(key, [...(series.get(key) ?? []), [period]]);
    const next = run ?? series.get(key)!.at(-1)!;
    ends.set(at(0), [...(ends.get(at(0)) ?? []), next]);
  }
  const first = (run: Unavailable[]) =>
    Math.min(...run.map((period) => order.get(period)!));
  return [...series.values()].flat().sort((a, b) => first(a) - first(b));
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
      personal: true,
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
  // The year shows only when a run crosses New Year.
  const daySpan = (first: string, last: string) =>
    [first, last]
      .map(
        (day) =>
          `${day.slice(8, 10)}.${day.slice(5, 7)}.${first.slice(0, 4) === last.slice(0, 4) ? "" : day.slice(0, 4)}`,
      )
      .join("–");
  const seriesTime = (period: Unavailable) =>
    `${new Intl.DateTimeFormat(language, {
      weekday: "short",
      timeZone: zone,
    }).format(new Date(period.start))} ${[period.start, period.end]
      .map((value) =>
        Temporal.Instant.from(value)
          .toZonedDateTimeISO(zone)
          .toPlainTime()
          .toString({ smallestUnit: "minute" }),
      )
      .join("–")}`;
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
  // Unchosen parallel groups would all land on the wall sheet as one block.
  const wallHint = internalOverlapOwners(calendar.events).some(
    (id) => !scenario.courses.find((c) => c.id === id)?.attendance,
  )
    ? tx.wallAttendanceHint
    : undefined;
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
            <WeeklyDownloads input={exportInput} hint={wallHint} />
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
                  const startLocal = String(data.get("start")),
                    endLocal = String(data.get("end")),
                    until = String(data.get("repeatUntil") ?? "");
                  const start = localInstant(startLocal),
                    end = localInstant(endLocal);
                  if (Date.parse(end) <= Date.parse(start))
                    throw new Error("invalid end");
                  // Weekly copies step the local date, so times survive DST.
                  const periods = until
                    ? weeklyRepeats(
                        startLocal,
                        endLocal,
                        until,
                        maxUnavailablePeriods - scenario.unavailable.length,
                      )
                    : [{ start, end }];
                  if (!periods?.length) throw new Error("invalid repeat");
                  const label = String(data.get("label"));
                  change(
                    updateScenario(plan, (s) => ({
                      ...s,
                      unavailable: [
                        ...s.unavailable,
                        ...periods.map((period) => ({
                          id: crypto.randomUUID(),
                          label,
                          ...period,
                        })),
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
                <label>
                  {t.repeatUntil}
                  <input name="repeatUntil" type="date" />
                </label>
                <Button type="submit">{t.addBusy}</Button>
              </fieldset>
            </form>
            {error && <p role="alert">{t.invalidPeriod}</p>}
          </details>
          <ul className="unavailable-list">
            {weeklySeries(scenario.unavailable).map((periods) => {
              const [period] = periods,
                series = periods.length > 1;
              const remove = (ids: Set<string>) =>
                change(
                  updateScenario(plan, (s) => ({
                    ...s,
                    unavailable: s.unavailable.filter((b) => !ids.has(b.id)),
                  })),
                );
              const starts = periods.map((p) => localDate(p.start));
              // Names repeat the visible row, so same-label rows stay distinct.
              const row = `${period.label} · ${
                series
                  ? `${seriesTime(period)} · ${periods.length}× (${daySpan(starts[0], starts.at(-1)!)})`
                  : shortDate(starts[0])
              }`;
              const removeRow = (
                <Button
                  disabled={busy}
                  aria-label={`${series ? t.removeAll : t.removeBusy} · ${row}`}
                  onClick={() => remove(new Set(periods.map((p) => p.id)))}
                >
                  {series ? t.removeAll : t.removeBusy}
                </Button>
              );
              return series ? (
                <li key={period.id} className="unavailable-series">
                  <details>
                    <summary>{row}</summary>
                    <ul>
                      {periods.map((occurrence, n) => (
                        <li key={occurrence.id}>
                          <span>{shortDate(starts[n])}</span>
                          <Button
                            disabled={busy}
                            aria-label={`${t.removeBusy} · ${period.label} · ${seriesTime(period)} · ${shortDate(starts[n])}`}
                            onClick={() => remove(new Set([occurrence.id]))}
                          >
                            {t.removeBusy}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </details>
                  {removeRow}
                </li>
              ) : (
                <li key={period.id}>
                  <span>{row}</span>
                  {removeRow}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </section>
  );
}
