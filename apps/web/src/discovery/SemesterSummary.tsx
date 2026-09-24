import { timetableMessages } from "../planner/timetable-messages";
import { semesterLabel } from "../planner/SemesterField";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components";
import type { Language } from "../i18n";
import { activeScenario, allocateCourse } from "../planner/domain";
import {
  calendarFor,
  detectConflicts,
  conflictCounts,
} from "../planner/calendar";
import { usePlans } from "../planner/context";
import { plannerMessages } from "../planner/messages";
import { discoveryMessages } from "./messages";

export default function SemesterSummary({
  term,
  language,
}: {
  term: string;
  language: Language;
}) {
  const { plan, busy, save } = usePlans();
  const t = discoveryMessages[language],
    p = plannerMessages[language];
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(
    () =>
      typeof matchMedia === "undefined" ||
      !matchMedia("(max-width: 820px)").matches,
  );
  const scenario = plan && activeScenario(plan);
  const calendar = useMemo(
    () => (scenario ? calendarFor(scenario.courses, term, language) : null),
    [scenario, term, language],
  );
  if (!plan || !scenario || !calendar) return null;
  const courses = scenario.courses.filter(
    (c) => c.semester === term && c.status !== "completed",
  );
  const credits = courses.reduce((sum, c) => sum + (c.ects ?? 0), 0);
  const unknownCredits = courses.filter((c) => c.ects === null).length;
  const conflicts = detectConflicts(
    calendar.events,
    scenario.unavailable,
    scenario.travelMinutes,
  );
  const counts = conflictCounts(conflicts);
  const x = timetableMessages[language];
  const unresolved = new Set(calendar.unresolved.map((id) => id.split(":")[0]))
    .size;
  return (
    <aside className="semester-summary" aria-label={t.overview}>
      <details
        className="semester-summary-disclosure"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary>
          <span>
            <strong>{semesterLabel(term, language)}</strong> · {credits} ECTS
          </span>
          <span>
            {unknownCredits > 0 && `${unknownCredits} ${p.unknown} · `}
            {counts.pairs} {x.pairs} · {counts.hard} {x.collisions}
            {counts.internal > 0 && ` · ${counts.internal} ${x.internalCount}`}
            {counts.travel > 0 && ` · ${counts.travel} ${p.travel}`}
            {counts.unavailable > 0 &&
              ` · ${counts.unavailable} ${p.unavailable}`}
            {unresolved > 0 && ` · ${unresolved} ${t.unknownCount}`}
          </span>
        </summary>
        <p>
          {courses.length} {t.selected}
        </p>
        <p className="planner-help">
          {Math.round(plan.targetEcts / plan.semesters.length)} {t.reference}
        </p>
        {unresolved > 0 && (
          <p className="fit-note unknown">
            {t.unknownCount} · {unresolved}
          </p>
        )}
        {!courses.length && <p className="semester-empty">{t.noCourses}</p>}
        <ul className="selected-courses">
          {courses.map((course) => (
            <li key={course.id}>
              <Link
                to={`/catalogue/${encodeURIComponent(course.code)}?term=${term}`}
              >
                {course.titles[language] ?? course.titles.en ?? course.code}
              </Link>
              <span>{course.ects ?? "?"} ECTS</span>
              <Button
                disabled={busy || course.pinned}
                aria-label={`${t.remove} · ${course.code}`}
                title={course.pinned ? t.pinned : t.remove}
                onClick={async () => {
                  const ok = await save(
                    allocateCourse(plan, course.id, null, "unscheduled"),
                  );
                  setError(!ok);
                }}
              >
                ×
              </Button>
              {course.pinned && <small>{t.pinned}</small>}
            </li>
          ))}
        </ul>
        <div className="semester-summary-links">
          <Link className="button primary" to={`/semester/${term}`}>
            {p.openCalendar}
          </Link>
          <Link className="text-link" to="/suggestions">
            {t.improve}
          </Link>
        </div>
        {courses.length > 0 && <p className="planner-help">{t.overviewHelp}</p>}
        {error && <p role="alert">{p.actionError}</p>}
      </details>
    </aside>
  );
}
