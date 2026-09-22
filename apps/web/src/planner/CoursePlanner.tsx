import { semesterLabel } from "./SemesterField";
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
  planningSemester,
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
      : planningSemester(plan),
  );
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(false);
  const existing = activeScenario(plan).courses.find(
    (course) =>
      canonicalCourseCode(course.code) ===
      canonicalCourseCode(offering.course.code),
  );
  const canSchedule = existing?.status === "unscheduled" && !existing.pinned;
  const canRemove =
    !!existing?.semester && existing.status !== "completed" && !existing.pinned;
  const add = async () => {
    setError(false);
    try {
      const course = fromOffering(
        offering,
        existing?.id ?? crypto.randomUUID(),
        (offering as Offering & { snapshot_id?: string }).snapshot_id ??
          status.snapshot_id ??
          "unknown",
        status.development_fixture,
      );
      const next = existing
        ? updateScenario(plan, (s) => ({
            ...s,
            courses: s.courses.map((c) => (c.id === existing.id ? course : c)),
          }))
        : addCourse(plan, course);
      const saved = await save(
        semester ? allocateCourse(next, course.id, semester, "planned") : next,
      );
      setError(!saved);
      if (saved) setEditing(false);
    } catch {
      setError(true);
    }
  };
  return (
    <div className="course-planner">
      {(!existing || canSchedule) && !editing && (
        <Button
          className="primary"
          aria-label={semester ? t.addToSemester : t.add}
          disabled={busy}
          onClick={add}
        >
          {semester
            ? `${t.addToSemester} · ${semesterLabel(semester, language)}`
            : t.add}
        </Button>
      )}
      {(!existing || canSchedule) && (
        <details
          open={editing}
          onToggle={(e) => setEditing(e.currentTarget.open)}
        >
          <summary>{t.changeSemester}</summary>
          <label>
            {t.semester}
            <select
              aria-label={t.semester}
              value={semester}
              disabled={busy}
              onChange={(event) => setSemester(event.target.value)}
            >
              {plan.semesters.map((term) => (
                <option key={term} value={term}>
                  {semesterLabel(term, language)}
                </option>
              ))}
              <option value="">{t.unscheduled}</option>
            </select>
          </label>
          <Button
            aria-label={semester ? t.addToSemester : t.add}
            disabled={busy}
            onClick={add}
          >
            {semester
              ? `${t.addToSemester} · ${semesterLabel(semester, language)}`
              : t.add}
          </Button>
        </details>
      )}
      {existing && !canSchedule && (
        <Button
          disabled={busy || !canRemove}
          title={existing.pinned ? t.pinHelp : undefined}
          onClick={async () => {
            if (!canRemove) return;
            setError(false);
            try {
              setError(
                !(await save(
                  allocateCourse(plan, existing.id, null, "unscheduled"),
                )),
              );
            } catch {
              setError(true);
            }
          }}
        >
          {canRemove ? t.removeFromSemester : t.added}
        </Button>
      )}
      {existing && !canSchedule ? (
        <div className="course-planner-result">
          <p role="status">
            {t.saved} ·{" "}
            {existing.semester
              ? semesterLabel(existing.semester, language)
              : t.unscheduled}{" "}
            · {existing.ects ?? "?"} ECTS
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
