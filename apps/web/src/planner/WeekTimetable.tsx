import { useMemo, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { Language } from "../i18n";
import { discoveryMessages } from "../discovery/messages";
import { plannerMessages } from "./messages";
import { type CalendarEvent, type Conflict, zone } from "./calendar";
import { type Selection } from "./domain";
import { layoutWeek, courseColour } from "./week-layout";
import "./timetable.css";

const minuteHeight = 1.4;

export default function WeekTimetable({
  events,
  monday,
  language,
  courses,
  conflicts,
}: {
  events: CalendarEvent[];
  monday: string;
  language: Language;
  courses: Selection[];
  conflicts: Conflict[];
}) {
  const week = useMemo(() => layoutWeek(events, monday), [events, monday]);
  const t = discoveryMessages[language],
    p = plannerMessages[language];
  const format = (date: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(language, { timeZone: zone, ...options }).format(
      new Date(date),
    );
  const conflictFor = (event: CalendarEvent) =>
    conflicts.some(
      (c) =>
        (c.first === event.owner || c.second === event.owner) &&
        Date.parse(c.start) >= Date.parse(event.start) &&
        Date.parse(c.start) < Date.parse(event.end),
    );
  const hours = Array.from(
    { length: (week.endMinute - week.startMinute) / 60 + 1 },
    (_, i) => week.startMinute / 60 + i,
  );
  const clock = (minute: number) =>
    `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(Math.floor(minute % 60)).padStart(2, "0")}`;
  const hasEvents = week.days.some((d) => d.lessons.length);
  return (
    <>
      {!hasEvents && <p>{p.noEvents}</p>}
      <div
        className="timetable-scroll"
        role="region"
        aria-label={t.week}
        tabIndex={0}
      >
        <div
          className="calendar-week timetable-grid"
          style={
            {
              "--grid-height": `${(week.endMinute - week.startMinute) * minuteHeight}px`,
              "--hour-height": `${60 * minuteHeight}px`,
            } as CSSProperties
          }
        >
          <div className="timetable-corner" aria-hidden="true">
            {zone.split("/")[1]}
          </div>
          {week.days.map((day) => (
            <h3 className="timetable-day-heading" key={`heading-${day.date}`}>
              <span className="calendar-weekday">
                {format(`${day.date}T12:00:00Z`, { weekday: "long" })}
              </span>
              <time dateTime={day.date}>
                {format(`${day.date}T12:00:00Z`, {
                  day: "numeric",
                  month: "short",
                })}
              </time>
            </h3>
          ))}
          <div className="timetable-hours" aria-hidden="true">
            {hours.map((hour) => (
              <span
                key={hour}
                style={{
                  top: `${(hour * 60 - week.startMinute) * minuteHeight}px`,
                }}
              >
                {clock(hour * 60)}
              </span>
            ))}
          </div>
          {week.days.map((day) => (
            <section
              key={day.date}
              className="calendar-day timetable-day"
              aria-label={format(`${day.date}T12:00:00Z`, {
                dateStyle: "full",
              })}
            >
              {day.lessons.map((lesson) => {
                const course = courses.find((c) => c.id === lesson.event.owner);
                const clashing = conflictFor(lesson.event);
                return (
                  <article
                    key={lesson.event.id}
                    className={`calendar-event timetable-event course-colour-${courseColour(course?.code ?? lesson.event.owner)}${clashing ? " has-conflict" : ""}`}
                    style={{
                      top: `${(lesson.startMinute - week.startMinute) * minuteHeight}px`,
                      height: `${Math.max(24, (lesson.endMinute - lesson.startMinute) * minuteHeight)}px`,
                      left: `calc(${(lesson.lane / lesson.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lesson.lanes}% - 4px)`,
                    }}
                  >
                    <strong title={lesson.event.title}>
                      {course ? (
                        <Link
                          to={`/catalogue/${encodeURIComponent(course.code)}?term=${course.semester}`}
                        >
                          {lesson.event.title}
                        </Link>
                      ) : (
                        lesson.event.title
                      )}
                    </strong>
                    {clashing && (
                      <span className="event-clash">{t.conflictCount}</span>
                    )}
                    <p>
                      <time dateTime={lesson.start}>
                        {clock(lesson.startMinute)}
                      </time>
                      –
                      <time dateTime={lesson.end}>
                        {clock(lesson.endMinute)}
                      </time>
                    </p>
                    <p className="event-room" title={lesson.event.location}>
                      {lesson.event.location}
                    </p>
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
