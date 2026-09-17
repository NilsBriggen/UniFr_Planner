import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Temporal } from "@js-temporal/polyfill";
import { Button } from "../components";
import { messages, type Language } from "../i18n";
import { activeScenario, updateScenario } from "./domain";
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
import { Download, SaveStatus } from "./Planner";

function EventCard({
  event,
  language,
  cancelled = false,
}: {
  event: CalendarEvent;
  language: Language;
  cancelled?: boolean;
}) {
  const format = (value: string) =>
    new Intl.DateTimeFormat(language, {
      timeZone: zone,
      dateStyle: "medium",
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
      <p>{event.location}</p>
    </article>
  );
}
export default function SemesterCalendar({ language }: { language: Language }) {
  const { plan, busy, save } = usePlans();
  const { term: parameter = "AS-2026" } = useParams();
  const term = canonicalTerm(parameter),
    t = plannerMessages[language];
  const scenario = plan ? activeScenario(plan) : undefined;
  const validTerm = plan?.semesters.includes(term);
  const calendar =
    scenario && validTerm
      ? calendarFor(scenario.courses, term, language)
      : { events: [], cancelled: [], unresolved: [] };
  const [view, setView] = useState<"week" | "agenda" | "day">("agenda");
  const [selectedDate, setDate] = useState("");
  const [error, setError] = useState(false);
  if (!plan || !scenario) return null;
  if (!validTerm)
    return (
      <section className="page">
        <h1>{messages[language].semester}</h1>
        <Link to="/plan">{messages[language].plan}</Link>
      </section>
    );
  const date =
    selectedDate ||
    (calendar.events[0]
      ? localDate(calendar.events[0].start)
      : termRange(term).start);
  const plainDate = Temporal.PlainDate.from(date),
    monday = plainDate.subtract({ days: plainDate.dayOfWeek - 1 });
  const weekdays = Array.from({ length: 7 }, (_, day) =>
    monday.add({ days: day }).toString(),
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
  return (
    <section className="page planner-page">
      <p className="eyebrow">
        {plan.name} · {scenario.name} · {term}
      </p>
      <h1>{messages[language].semester}</h1>
      <SaveStatus language={language} />
      <p>
        {zone} · {calendar.events.length} {t.dates}
      </p>
      <div className="actions no-print">
        <Link className="text-link" to="/plan">
          {messages[language].plan}
        </Link>
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
        <Button onClick={() => window.print()}>{t.print}</Button>
      </div>
      <section className="calendar-check">
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
        {conflicts.length === 0 && !calendar.unresolved.length && (
          <p>{t.clear}</p>
        )}
        <ul>
          {conflicts.map((conflict, n) => (
            <li key={n}>
              <strong>
                {
                  t[
                    conflict.kind === "unavailable"
                      ? "unavailable"
                      : conflict.kind
                  ]
                }
              </strong>{" "}
              · {name(conflict.first)} / {name(conflict.second)} ·{" "}
              {new Intl.DateTimeFormat(language, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: zone,
              }).format(new Date(conflict.start))}
            </li>
          ))}
        </ul>
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
      <div className="view-controls no-print">
        <div className="segmented">
          {(["agenda", "week", "day"] as const).map((key) => (
            <Button
              key={key}
              aria-pressed={view === key}
              onClick={() => setView(key)}
            >
              {t[key]}
            </Button>
          ))}
        </div>
        {view !== "agenda" && (
          <label className="date-label">
            {t.date}
            <input
              type="date"
              min={range.start}
              max={range.end}
              value={date}
              onChange={(e) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))
                  setDate(e.target.value);
              }}
            />
          </label>
        )}
        {view === "week" && (
          <>
            <Button
              onClick={() =>
                setDate(plainDate.subtract({ days: 7 }).toString())
              }
            >
              {t.previous}
            </Button>
            <Button
              onClick={() => setDate(plainDate.add({ days: 7 }).toString())}
            >
              {t.next}
            </Button>
          </>
        )}
      </div>
      <div className="screen-calendar">
        {view === "week" ? (
          <div className="calendar-week">
            {weekdays.map((day) => (
              <section key={day} className="calendar-day">
                <h3>{shortDate(day)}</h3>
                {all
                  .filter((event) => intersectsDay(event, day))
                  .map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      language={language}
                    />
                  ))}
              </section>
            ))}
          </div>
        ) : (
          <>
            <h2>
              {view === "day"
                ? shortDate(date)
                : `${range.start} – ${range.end}`}
            </h2>
            <ul className="calendar-agenda">
              {all
                .filter((event) => view !== "day" || intersectsDay(event, date))
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
      <section className="print-only">
        <h2>
          {t.agenda} · {term}
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
        <h2>{t.unavailable}</h2>
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
    </section>
  );
}
