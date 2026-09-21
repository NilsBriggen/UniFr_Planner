import { useMemo } from "react";
import type { Language } from "../i18n";
import type { CalendarResult } from "../planner/calendar";
import { lessonGroups, type Assessment } from "./engine";
import { discoveryMessages } from "./messages";

export function LessonPreview({
  calendar,
  language,
}: {
  calendar: CalendarResult;
  language: Language;
}) {
  const t = discoveryMessages[language];
  const groups = useMemo(
    () => lessonGroups(calendar.events, language),
    [calendar.events, language],
  );
  const groupLine = (group: (typeof groups)[number], i: number) => (
    <li key={i}>
      <strong>{group.time}</strong>
      {group.location && <span>{group.location}</span>}
      <small>
        {group.dates.length === 1
          ? group.dates[0]
          : `${group.dates[0]} – ${group.dates.at(-1)} · ${group.dates.length} ${t.meetings}`}
      </small>
    </li>
  );
  return (
    <div className="lesson-preview">
      {groups.length ? (
        <ul>{groups.slice(0, 2).map(groupLine)}</ul>
      ) : (
        <p>{t.noLesson}</p>
      )}
      {groups.length > 2 && (
        <details>
          <summary>
            {t.moreDates} ({groups.length - 2})
          </summary>
          <ul>{groups.slice(2).map(groupLine)}</ul>
        </details>
      )}
      {calendar.unresolved.length > 0 && (
        <p className="fit-note unknown">{t.unknown}</p>
      )}
    </div>
  );
}

export function OfferingAdvice({
  assessment: a,
  language,
}: {
  assessment: Assessment;
  language: Language;
}) {
  const t = discoveryMessages[language];
  return (
    <>
      {a.match && (
        <p className="match-note">
          {t[a.match === "requirements" ? "requirement" : "related"]}
          {a.requirementTitles.length > 0 &&
            ` · ${a.requirementTitles.join(" / ")}`}
        </p>
      )}
      <LessonPreview calendar={a.calendar} language={language} />
      {(a.fit !== "unknown" || !a.calendar.unresolved.length) && (
        <p className={`fit-note ${a.fit}`}>
          {a.fit === "conflict"
            ? `${t.conflict}: ${a.conflicts.join(", ")}`
            : a.fit === "fits"
              ? t.fits
              : t.unknown}
        </p>
      )}
      {a.prerequisitesUnknown && (
        <p className="prerequisite-note">{t.prerequisite}</p>
      )}
    </>
  );
}
