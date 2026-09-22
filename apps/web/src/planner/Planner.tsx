import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { Language } from "../i18n";
import { messages } from "../i18n";
import { Button } from "../components";
import SharePanel from "../sharing/SharePanel";
import {
  activeScenario,
  allocateCourse,
  planningSemester,
  semesterIndex,
  isManualCode,
  duplicateScenario,
  importAsNew,
  parsePlan,
  setPinned,
  summarize,
  type Plan,
  type Selection,
} from "./domain";
import { usePlans } from "./context";
import { plannerMessages, type PlannerMessages } from "./messages";
import "./planner.css";
import ManualCompletion from "./ManualCompletion";
import { catchupMessages } from "./catchup-messages";
import { suggestionMessages } from "../suggestions/messages";
import StudySummary from "../requirements/StudySummary";
import { studyLabel } from "../requirements/study-summary";
import { Download, SaveStatus } from "./PlanControls";
import { semesterLabel } from "./SemesterField";

export { Download, SaveStatus } from "./PlanControls";
export { Setup } from "./Setup";
function Summary({ courses, t }: { courses: Selection[]; t: PlannerMessages }) {
  const sums = summarize(courses);
  return (
    <>
      <dl className="plan-summary">
        {(["completed", "current", "planned", "unscheduled"] as const).map(
          (key) => (
            <div key={key}>
              <dt>{t[key]}</dt>
              <dd>{sums[key]} ECTS</dd>
            </div>
          ),
        )}
        <div>
          <dt>{t.unknown}</dt>
          <dd>{sums.unknown}</dd>
        </div>
        <div>
          <dt>{t.workload}</dt>
          <dd>
            {sums.hoursMin}–{sums.hoursMax} {t.hours}
          </dd>
        </div>
      </dl>
    </>
  );
}
function ImportPlan({ language }: { language: Language }) {
  const t = plannerMessages[language];
  const { save, ready, busy } = usePlans();
  const [json, setJson] = useState(""),
    [preview, setPreview] = useState<Plan | null>(null),
    [invalid, setInvalid] = useState(false);
  const change = (value: string) => {
    setJson(value);
    setPreview(null);
    setInvalid(false);
  };
  return (
    <section className="import-plan no-print" aria-labelledby="import-title">
      <h2 id="import-title">{t.import}</h2>
      <p>{t.importHelp}</p>
      <label>
        {t.file}
        <input
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setPreview(null);
            if (!file) return;
            if (file.size > 5_000_000) {
              setInvalid(true);
              return;
            }
            void file
              .text()
              .then(change)
              .catch(() => setInvalid(true));
          }}
        />
      </label>
      <details className="import-advanced">
        <summary>{t.json}</summary>
        <label>
          {t.json}
          <textarea
            value={json}
            rows={4}
            maxLength={5_000_000}
            onChange={(e) => change(e.target.value)}
          />
        </label>
      </details>
      <Button
        disabled={!ready || busy}
        onClick={() => {
          try {
            setPreview(parsePlan(json));
            setInvalid(false);
          } catch {
            setPreview(null);
            setInvalid(true);
          }
        }}
      >
        {t.preview}
      </Button>
      {invalid && (
        <p role="alert" className="planner-error">
          {t.invalid}
        </p>
      )}
      {preview && (
        <section
          className="import-preview"
          aria-labelledby="import-preview-title"
        >
          <h3 id="import-preview-title">{t.importPreview}</h3>
          <p>
            {preview.name} · {preview.programme} · {preview.targetEcts} ECTS
          </p>
          <p>
            {preview.semesters
              .map((term) => semesterLabel(term, language))
              .join(" · ")}
          </p>
          <ul>
            {preview.scenarios.map((s) => (
              <li key={s.id}>
                {s.name} · {s.courses.length} {t.courseCount} ·{" "}
                {summarize(s.courses).completed} {t.completed} ECTS
              </li>
            ))}
          </ul>
          <div className="actions">
            <Button
              disabled={busy}
              onClick={() => {
                void save(
                  importAsNew(preview, crypto.randomUUID(), preview.name),
                ).then((ok) => {
                  if (ok) {
                    setPreview(null);
                    setJson("");
                  } else setInvalid(true);
                });
              }}
            >
              {t.confirmImport}
            </Button>
            <Button onClick={() => setPreview(null)}>{t.cancel}</Button>
          </div>
        </section>
      )}
    </section>
  );
}
function CourseCard({
  course,
  plan,
  language,
  change,
}: {
  course: Selection;
  plan: Plan;
  language: Language;
  change: (plan: Plan) => void;
}) {
  const t = plannerMessages[language];
  const code = isManualCode(course.code)
    ? catchupMessages[language].noCode
    : course.code;
  const title =
    course.titles[language] ??
    course.titles.en ??
    Object.values(course.titles)[0];
  return (
    <article className="plan-course" aria-label={`${code} · ${title}`}>
      <h3>{title}</h3>
      <p>
        {code} · {course.ects ?? "?"} ECTS · {t[course.status]}
      </p>
      {course.offering?.development_fixture && (
        <p className="fixture-label">{t.fixture}</p>
      )}
      {course.semester &&
        course.status !== "completed" &&
        (!course.offering ||
          !course.offering.terms.includes(course.semester)) && (
          <p className="schedule-warning">{t.future}</p>
        )}
      <div className="course-controls no-print">
        <Button
          aria-pressed={course.pinned}
          aria-label={`${course.pinned ? t.unpin : t.pin} · ${code}`}
          onClick={() => change(setPinned(plan, course.id, !course.pinned))}
        >
          {course.pinned ? t.pinned : t.pin}
        </Button>
        {course.pinned && <p>{t.pinHelp}</p>}
        <label>
          {t.semester}
          <select
            aria-label={`${t.semester} · ${code}`}
            value={course.semester ?? ""}
            disabled={course.pinned}
            onChange={(e) =>
              change(
                allocateCourse(
                  plan,
                  course.id,
                  e.target.value || null,
                  e.target.value
                    ? course.status === "unscheduled"
                      ? "planned"
                      : course.status
                    : course.status === "completed"
                      ? "completed"
                      : "unscheduled",
                ),
              )
            }
          >
            <option value="">{t.unscheduled}</option>
            {plan.semesters.map((term) => (
              <option key={term} value={term}>
                {semesterLabel(term, language)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.state}
          <select
            aria-label={`${t.state} · ${code}`}
            value={course.status}
            disabled={course.pinned}
            onChange={(e) => {
              const status = e.target.value as Selection["status"];
              change(
                allocateCourse(
                  plan,
                  course.id,
                  status === "unscheduled"
                    ? null
                    : status === "completed"
                      ? course.semester
                      : (course.semester ?? planningSemester(plan)),
                  status,
                ),
              );
            }}
          >
            {(["unscheduled", "planned", "current", "completed"] as const).map(
              (s) => (
                <option key={s} value={s}>
                  {t[s]}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
    </article>
  );
}
export function PlanBoard({ language }: { language: Language }) {
  const { plan, plans, ready, busy, save, select } = usePlans();
  const t = plannerMessages[language];
  const [error, setError] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let previous: { element: HTMLDetailsElement; open: boolean }[] | undefined;
    const beforePrint = () => {
      if (previous) return;
      previous = [...(board.current?.querySelectorAll("details") ?? [])].map(
        (element) => ({ element, open: element.open }),
      );
      for (const { element } of previous) element.open = true;
    };
    const afterPrint = () => {
      for (const { element, open } of previous ?? []) element.open = open;
      previous = undefined;
    };
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
      afterPrint();
    };
  }, []);
  const scenario = plan ? activeScenario(plan) : undefined;
  const change = (next: Plan) => {
    setError(false);
    void save(next).then((ok) => setError(!ok));
  };
  return (
    <section className="page planner-page degree-page">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">
            {plan ? studyLabel(plan, language) : "UniFr Planner"}
          </p>
          <h1>{messages[language].plan}</h1>
          <SaveStatus language={language} />
        </div>
        {plan && (
          <div className="workspace-actions no-print">
            <SharePanel language={language} />
            <Link className="button" to="/plan/completed">
              {catchupMessages[language].title}
            </Link>
            <Link
              className="text-link"
              to={`/semester/${planningSemester(plan)}`}
            >
              {t.openCalendar}
            </Link>
            <Link
              className="button primary"
              to={`/catalogue?term=${planningSemester(plan)}`}
            >
              {t.addCourses}
            </Link>
          </div>
        )}
      </header>
      {!plan && (
        <div className="actions no-print">
          <Link className="button primary" to="/setup">
            {t.create}
          </Link>
          <Link className="text-link" to="/suggestions">
            {suggestionMessages[language].nav}
          </Link>
        </div>
      )}
      {plan && scenario && (
        <>
          <div className="plan-meta">
            <h2 className="plan-title">{plan.name}</h2>
            <p>
              {t.target}: {plan.targetEcts} ECTS
            </p>
          </div>
          <StudySummary plan={plan} language={language} />
          <label className="planning-term-control">
            {catchupMessages[language].planning}
            <select
              aria-label={catchupMessages[language].planning}
              value={planningSemester(plan)}
              disabled={busy}
              onChange={(event) =>
                change({ ...plan, planningSemester: event.target.value })
              }
            >
              {plan.semesters.map((term) => (
                <option key={term} value={term}>
                  {semesterLabel(term, language)}
                </option>
              ))}
            </select>
          </label>
          <Summary courses={scenario.courses} t={t} />
          <p className="planner-help">{t.boardHelp}</p>
          <fieldset disabled={busy} className="board-fieldset">
            <div className="semester-board" ref={board}>
              {[
                ...plan.semesters.filter(
                  (term) =>
                    semesterIndex(term) >=
                    semesterIndex(planningSemester(plan)),
                ),
                ...plan.semesters.filter(
                  (term) =>
                    semesterIndex(term) < semesterIndex(planningSemester(plan)),
                ),
                null,
                "completed",
              ].map((term) => {
                const courses = scenario.courses.filter((c) =>
                  term === "completed"
                    ? c.status === "completed"
                    : c.status !== "completed" && c.semester === term,
                );
                const label =
                  term === "completed"
                    ? t.completed
                    : term
                      ? semesterLabel(term, language)
                      : t.unscheduled;
                const knownEcts = courses.reduce(
                  (sum, c) => sum + (c.ects ?? 0),
                  0,
                );
                const unknownEcts = courses.filter(
                  (course) => course.ects === null,
                ).length;
                return (
                  <details
                    className={`semester-column${term === planningSemester(plan) ? " planning-semester" : ""}`}
                    key={term ?? "unassigned"}
                    open={term === planningSemester(plan)}
                    aria-label={label}
                  >
                    <summary className="semester-heading">
                      <h2>{label}</h2>
                      <span>
                        {knownEcts} ECTS
                        {unknownEcts > 0
                          ? ` · ${unknownEcts} ${t.unknown}`
                          : ""}{" "}
                        · {courses.length} {t.courseCount}
                      </span>
                    </summary>
                    {term && term !== "completed" && (
                      <div className="semester-actions no-print">
                        <Link className="button" to={`/catalogue?term=${term}`}>
                          {t.addCourses}
                        </Link>
                        <Link className="text-link" to={`/semester/${term}`}>
                          {t.openCalendar}
                        </Link>
                      </div>
                    )}
                    {term === planningSemester(plan) && (
                      <p className="planning-label">
                        {catchupMessages[language].planning}
                      </p>
                    )}
                    {courses.length === 0 && (
                      <p className="planner-help">{t.emptySemester}</p>
                    )}
                    {term === "completed" ? (
                      [...plan.semesters, null].map((semester) => {
                        const completed = courses.filter(
                          (course) => course.semester === semester,
                        );
                        return (
                          completed.length > 0 && (
                            <section
                              key={semester ?? "earlier"}
                              className="completed-term"
                            >
                              <h3>
                                {semester
                                  ? semesterLabel(semester, language)
                                  : catchupMessages[language].earlier}
                              </h3>
                              <p>
                                <strong>
                                  {catchupMessages[language].earned}:{" "}
                                  {completed.reduce(
                                    (sum, course) => sum + (course.ects ?? 0),
                                    0,
                                  )}{" "}
                                  ECTS
                                </strong>
                              </p>
                              {completed.map((course) => (
                                <CourseCard
                                  key={course.id}
                                  course={course}
                                  plan={plan}
                                  language={language}
                                  change={change}
                                />
                              ))}
                            </section>
                          )
                        );
                      })
                    ) : term &&
                      semesterIndex(term) <
                        semesterIndex(planningSemester(plan)) ? (
                      <details>
                        <summary>
                          {t.courseCount} ({courses.length})
                        </summary>
                        {courses.map((course) => (
                          <CourseCard
                            key={course.id}
                            course={course}
                            plan={plan}
                            language={language}
                            change={change}
                          />
                        ))}
                      </details>
                    ) : (
                      courses.map((course) => (
                        <CourseCard
                          key={course.id}
                          course={course}
                          plan={plan}
                          language={language}
                          change={change}
                        />
                      ))
                    )}
                  </details>
                );
              })}
            </div>
          </fieldset>
          <p className="planner-help">{t.workloadHelp}</p>
          {plan.scenarios.length > 1 && (
            <section className="scenario-comparison">
              <h2>{t.compare}</h2>
              <div
                className="table-scroll"
                role="region"
                aria-label={t.compare}
                tabIndex={0}
              >
                <table>
                  <thead>
                    <tr>
                      <th>{t.scenario}</th>
                      <th>{t.completed}</th>
                      <th>{t.current}</th>
                      <th>{t.planned}</th>
                      <th>{t.unknown}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.scenarios.map((s) => {
                      const totals = summarize(s.courses);
                      return (
                        <tr key={s.id}>
                          <th scope="row">{s.name}</th>
                          <td>{totals.completed} ECTS</td>
                          <td>{totals.current} ECTS</td>
                          <td>{totals.planned} ECTS</td>
                          <td>{totals.unknown}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <details className="plan-tools no-print" aria-label={t.planTools}>
            <summary>
              <h2>{t.planTools}</h2>
            </summary>
            <Link className="text-link" to="/suggestions">
              {suggestionMessages[language].nav}
            </Link>
            <div className="actions no-print">
              <Link className="button" to="/setup">
                {t.newPlan}
              </Link>
              {plan && (
                <>
                  <Download
                    text={JSON.stringify(plan, null, 2)}
                    filename={`plan-${plan.id}.json`}
                    type="application/json"
                  >
                    {t.exportJson}
                  </Download>
                  <Button onClick={() => window.print()}>{t.print}</Button>
                  <Link className="text-link" to="/catalogue">
                    {messages[language].explore}
                  </Link>
                </>
              )}
            </div>
            <fieldset
              className="planner-controls no-print"
              disabled={!ready || busy}
            >
              <label>
                {messages[language].planLabel}
                <select
                  value={plan.id}
                  onChange={(e) => void select(e.target.value)}
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.scenario}
                <select
                  aria-label={t.scenario}
                  value={plan.activeScenarioId}
                  onChange={(e) =>
                    change({ ...plan, activeScenarioId: e.target.value })
                  }
                >
                  {plan.scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const name = String(new FormData(form).get("scenario"));
                  try {
                    change(duplicateScenario(plan, crypto.randomUUID(), name));
                    form.reset();
                  } catch {
                    setError(true);
                  }
                }}
              >
                <label>
                  {t.newScenario}
                  <input name="scenario" required maxLength={200} />
                </label>
                <Button type="submit" disabled={plan.scenarios.length >= 20}>
                  {t.duplicate}
                </Button>
              </form>
            </fieldset>
            <ImportPlan language={language} />
          </details>
          <ManualCompletion plan={plan} language={language} />
        </>
      )}
      {error && <p role="alert">{t.actionError}</p>}
      {!plan && <ImportPlan language={language} />}
    </section>
  );
}
