import { useState } from "react";
import type { Selection } from "./domain";
import type { Language } from "../i18n";
import {
  attendanceChoice,
  attendanceSeries,
  meetingKey,
  selectedMeetings,
} from "./attendance";
import { timetableMessages } from "./timetable-messages";
export default function AttendanceControls({
  course,
  language,
  disabled,
  onChange,
}: {
  course: Selection;
  language: Language;
  disabled: boolean;
  onChange: (attendance: Selection["attendance"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const x = timetableMessages[language],
    result = selectedMeetings(course),
    meetings = course.offering?.meetings ?? [];
  if (!meetings.length) return null;
  const series = attendanceSeries(course);
  const excluded = result.stale
    ? []
    : meetings.flatMap((m, i) =>
        course.attendance?.excludedMeetingKeys.includes(meetingKey(m, i))
          ? [i]
          : [],
      );
  return (
    <details
      className="attendance-controls no-print"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{x.attendance}</summary>
      {open && (
        <>
          <p>{x.attendanceHelp}</p>
          {result.stale && <p role="alert">{x.stale}</p>}
          {course.attendance && (
            <p className="schedule-warning">{x.provisional}</p>
          )}
          <fieldset disabled={disabled}>
            <legend>{course.titles[language] ?? course.code}</legend>
            {series
              .filter((s) => s.indices.length > 1)
              .map((group) => (
                <label key={group.indices[0]}>
                  <input
                    type="checkbox"
                    checked={group.indices.every((i) => !excluded.includes(i))}
                    onChange={(event) =>
                      onChange(
                        attendanceChoice(
                          course,
                          event.target.checked
                            ? excluded.filter((i) => !group.indices.includes(i))
                            : [...excluded, ...group.indices],
                        ),
                      )
                    }
                  />
                  <span>
                    {group.meeting.note || x.session} ·{" "}
                    {group.meeting.starts_at &&
                      new Intl.DateTimeFormat(language, {
                        timeZone: "Europe/Zurich",
                        weekday: "long",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(group.meeting.starts_at))}{" "}
                    · {group.meeting.location || x.roomUnknown} ·{" "}
                    {group.indices.length} {x.matchingDates}
                  </span>
                </label>
              ))}
            {meetings.map((meeting, i) => (
              <label key={meetingKey(meeting, i)}>
                <input
                  type="checkbox"
                  checked={!excluded.includes(i)}
                  onChange={(event) =>
                    onChange(
                      attendanceChoice(
                        course,
                        event.target.checked
                          ? excluded.filter((n) => n !== i)
                          : [...excluded, i],
                      ),
                    )
                  }
                />
                <span>
                  {meeting.note || x.session} ·{" "}
                  {meeting.starts_at
                    ? new Intl.DateTimeFormat(language, {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Europe/Zurich",
                      }).format(new Date(meeting.starts_at))
                    : x.unknown}{" "}
                  · {meeting.location || x.roomUnknown}
                  {meeting.recurrence && ` · ${meeting.recurrence}`}
                </span>
              </label>
            ))}
          </fieldset>
          <button
            className="button"
            disabled={disabled || !course.attendance}
            onClick={() => onChange(undefined)}
          >
            {x.restore}
          </button>
          {course.offering?.source_url && (
            <p>
              <a
                href={course.offering.source_url}
                target="_blank"
                rel="noreferrer"
              >
                {x.source}
              </a>
            </p>
          )}
        </>
      )}
    </details>
  );
}
