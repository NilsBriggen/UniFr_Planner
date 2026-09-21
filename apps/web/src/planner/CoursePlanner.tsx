import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { CatalogueStatus, Offering } from "../api/client";
import { Button } from "../components";
import { messages, type Language } from "../i18n";
import { canonicalCourseCode } from "../../../../packages/domain/src/requirements";
import { usePlans } from "./context";
import {
  activeScenario,
  addCourse,
  allocateCourse,
  fromOffering,
  updateScenario,
  type Plan,
} from "./domain";
import { plannerMessages } from "./messages";

type Props = {
  offering: Offering;
  status: CatalogueStatus;
  language: Language;
  preferredTerm?: string | null;
};

export default function CoursePlanner(props: Props) {
  const { plan, ready } = usePlans();
  const location = useLocation();
  const t = plannerMessages[props.language];
  if (!ready) return <p>{t.loading}</p>;
  if (!plan) {
    const returnTo = `/catalogue/${encodeURIComponent(props.offering.course.code)}${location.search}`;
    return (
      <Link
        className="text-link"
        to={`/setup?returnTo=${encodeURIComponent(returnTo)}`}
      >
        {t.needPlan}
      </Link>
    );
  }
  return (
    <AddToSemester
      key={`${plan.id}:${plan.activeScenarioId}:${props.preferredTerm}`}
      {...props}
      plan={plan}
    />
  );
}

function AddToSemester({
  offering,
  status,
  language,
  preferredTerm,
  plan,
}: Props & { plan: Plan }) {
  const { busy, save } = usePlans();
  const t = plannerMessages[language];
  const [semester, setSemester] = useState(
    preferredTerm && plan.semesters.includes(preferredTerm)
      ? preferredTerm
      : (plan.semesters.find((term) => offering.terms.includes(term)) ?? ""),
  );
  const [error, setError] = useState(false);
  const existing = activeScenario(plan).courses.find(
    (course) =>
      canonicalCourseCode(course.code) ===
      canonicalCourseCode(offering.course.code),
  );
  const canSchedule = existing?.status === "unscheduled" && !existing.pinned;
  return (
    <div className="course-planner">
      {(!existing || canSchedule) && (
        <label>
          {t.semester}
          <select
            aria-label={t.semester}
            value={semester}
            disabled={busy}
            onChange={(event) => setSemester(event.target.value)}
          >
            {plan.semesters.map((term) => (
              <option key={term}>{term}</option>
            ))}
            <option value="">{t.unscheduled}</option>
          </select>
        </label>
      )}
      <Button
        className={existing && !canSchedule ? "" : "primary"}
        disabled={busy || (!!existing && (!canSchedule || !semester))}
        onClick={async () => {
          setError(false);
          try {
            const course = fromOffering(
              offering,
              existing?.id ?? crypto.randomUUID(),
              status.snapshot_id ?? "unknown",
              status.development_fixture,
            );
            // A deliberate new selection can put an unscheduled course back,
            // using the offering currently shown and retaining its stable ID.
            const next = existing
              ? updateScenario(plan, (s) => ({
                  ...s,
                  courses: s.courses.map((c) =>
                    c.id === existing.id ? course : c,
                  ),
                }))
              : addCourse(plan, course);
            const saved = await save(
              semester
                ? allocateCourse(next, course.id, semester, "planned")
                : next,
            );
            setError(!saved);
          } catch {
            setError(true);
          }
        }}
      >
        {canSchedule ? t.addToSemester : existing ? t.added : t.add}
      </Button>
      {existing && !canSchedule ? (
        <div className="course-planner-result">
          <p role="status">
            {t.saved} · {existing.semester ?? t.unscheduled} ·{" "}
            {existing.ects ?? "?"} ECTS
          </p>
          <Link
            className="text-link"
            to={
              existing.semester && existing.status !== "completed"
                ? `/semester/${existing.semester}`
                : "/plan"
            }
          >
            {existing.semester && existing.status !== "completed"
              ? t.openCalendar
              : messages[language].plan}
          </Link>
        </div>
      ) : semester && !offering.terms.includes(semester) ? (
        <p className="schedule-warning">{t.future}</p>
      ) : null}
      {error && <p role="alert">{t.actionError}</p>}
    </div>
  );
}
