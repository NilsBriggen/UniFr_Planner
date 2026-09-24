import { timetableMessages } from "../planner/timetable-messages";
import { plannerMessages } from "../planner/messages";
import { useMemo } from "react";
import type { Language } from "../i18n";
import type { CalendarResult } from "../planner/calendar";
import { lessonGroups } from "./presentation";
import type { Assessment } from "./engine";
import { discoveryMessages } from "./messages";
import { recommendationMessages } from "./recommendation-messages";
import { sourceStage } from "./sourceAssignments";

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
  const r = recommendationMessages[language];
  return (
    <>
      <LessonPreview calendar={a.calendar} language={language} />
      {a.attendanceStale && (
        <p className="fit-note unknown" role="alert">
          {timetableMessages[language].stale}
        </p>
      )}
      {a.conflictCounts.internal > 0 && (
        <p className="fit-note unknown">
          {timetableMessages[language].internal} · {a.conflictCounts.internal}{" "}
          {timetableMessages[language].internalCount}
        </p>
      )}
      {a.conflictCounts.hard > 0 && (
        <p className="fit-note conflict">
          {a.conflictCounts.pairs} {timetableMessages[language].pairs} ·{" "}
          {a.conflictCounts.hard} {timetableMessages[language].collisions}
        </p>
      )}
      {a.conflictCounts.travel > 0 && (
        <p className="fit-note conflict">
          {plannerMessages[language].travel} · {a.conflictCounts.travel}
        </p>
      )}
      {a.conflictCounts.unavailable > 0 && (
        <p className="fit-note conflict">
          {plannerMessages[language].unavailable} ·{" "}
          {a.conflictCounts.unavailable}
        </p>
      )}
      {(a.fit !== "unknown" || !a.calendar.unresolved.length) && (
        <p className={`fit-note ${a.fit}`}>
          {a.fit === "conflict"
            ? `${t.conflict}: ${a.conflicts.join(", ")}`
            : a.fit === "fits"
              ? t.fits
              : t.unknown}
        </p>
      )}
      {a.match && (
        <p className="match-note">
          {a.recommended && a.recommendationKind
            ? r[a.recommendationKind]
            : a.match === "subject"
              ? t.sourceListed
              : t.requirement}
          {a.requirementTitles.length > 0 &&
            ` · ${a.requirementTitles.join(" / ")}`}
        </p>
      )}
      {a.recommended && a.contributionEcts !== 0 && (
        <p className="recommendation-contribution">
          {a.contributionEcts === null
            ? r.unknownCredits
            : `${a.contributionEcts.toLocaleString(language)} ${r.contribution}`}
        </p>
      )}
      {a.selectedStatus && (
        <p className="discovery-help">{r[a.selectedStatus]}</p>
      )}
      {a.match === "requirements" &&
        !a.recommended &&
        !a.selectedStatus &&
        a.prerequisiteState !== "unmet" && (
          <p className="discovery-help">{r.covered}</p>
        )}
      {a.sourceAssignments.length > 0 && (
        <div className="source-assignments">
          {a.sourceAssignments.map((assignment, index) => (
            <p
              className="source-assignment"
              key={`${assignment.programme}:${assignment.version}:${index}`}
            >
              <strong>{assignment.programme}</strong> · {assignment.version}
              {sourceStage(assignment) && <> · {sourceStage(assignment)}</>}
              {assignment.paths[0] && <small>{assignment.paths[0]}</small>}
            </p>
          ))}
        </div>
      )}
      {a.match === "subject" && (
        <p className="discovery-help">{t.sourceNotRecognition}</p>
      )}
      {a.sourceApplicabilityUnconfirmed && (
        <p className="discovery-help" role="note">
          {t.sourceCohortUnconfirmed}
        </p>
      )}
      {a.prerequisiteState !== "satisfied" && (
        <p className="prerequisite-note">
          {r[a.prerequisiteState === "unmet" ? "unmet" : "unknown"]}
        </p>
      )}
      {a.match && a.reviewState === "needs_clarification" && (
        <p className="discovery-help">{r.review}</p>
      )}
    </>
  );
}
