import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Language } from "../i18n";
import { messages } from "../i18n";
import { Button } from "../components";
import {
  activeScenario,
  addCourse,
  allocateCourse,
  createPlan,
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

export function Download({
  text,
  filename,
  type,
  children,
}: {
  text: string;
  filename: string;
  type: string;
  children: string;
}) {
  return (
    <Button
      onClick={() => {
        const url = URL.createObjectURL(new Blob([text], { type }));
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
    >
      {children}
    </Button>
  );
}
export function SaveStatus({ language }: { language: Language }) {
  const { ready, busy, error, plan, unreadableIds } = usePlans();
  const t = plannerMessages[language];
  return (
    <>
      {unreadableIds.length > 0 && (
        <p role="alert" className="planner-error">
          {t.unreadable} ({unreadableIds.length})
        </p>
      )}
      <p
        role={error ? "alert" : "status"}
        className={error ? "planner-error" : "save-status"}
      >
        {error
          ? t.storageError
          : !ready
            ? t.loading
            : busy
              ? t.saving
              : plan
                ? t.saved
                : t.localHelp}
      </p>
    </>
  );
}
export function Setup({ language }: { language: Language }) {
  const t = plannerMessages[language];
  const { ready, busy, save } = usePlans();
  const navigate = useNavigate();
  const [error, setError] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const plan = createPlan({
        id: crypto.randomUUID(),
        scenarioId: crypto.randomUUID(),
        name: String(form.get("name")),
        programme: String(form.get("programme")),
        startTerm: `${form.get("season")}-${form.get("year")}`,
        semesterCount: Number(form.get("count")),
        targetEcts: Number(form.get("target")),
      });
      if (await save(plan)) navigate("/plan");
      else setError(true);
    } catch {
      setError(true);
    }
  }
  return (
    <section className="page planner-page">
      <p className="eyebrow">UniFr Planner</p>
      <h1>{messages[language].setup}</h1>
      <SaveStatus language={language} />
      <p>{t.programmeHelp}</p>
      <form onSubmit={(e) => void submit(e)}>
        <fieldset className="planner-fields" disabled={!ready || busy}>
          <label>
            {t.planName}
            <input name="name" required maxLength={200} />
          </label>
          <label>
            {t.programme}
            <input name="programme" required maxLength={200} />
          </label>
          <label>
            {t.startTerm}
            <select name="season" defaultValue="AS">
              <option value="AS">AS / HS</option>
              <option value="SS">SS / FS</option>
            </select>
            <input
              aria-label={`${t.startTerm} · ${language === "de" ? "Jahr" : language === "fr" ? "Année" : "Year"}`}
              name="year"
              type="number"
              min="2000"
              max="2087"
              defaultValue={new Date().getFullYear()}
              required
            />
          </label>
          <label>
            {t.semesterCount}
            <input
              name="count"
              type="number"
              min="1"
              max="24"
              defaultValue="6"
              required
            />
          </label>
          <label>
            {t.target}
            <input
              name="target"
              type="number"
              min="1"
              max="600"
              defaultValue="180"
              required
            />
          </label>
          <Button className="primary" type="submit">
            {t.create}
          </Button>
        </fieldset>
      </form>
      {error && <p role="alert">{t.actionError}</p>}
      <p className="planner-help">{t.localHelp}</p>
      <Link className="text-link" to="/plan">
        {t.import}
      </Link>
    </section>
  );
}
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
      <label>
        {t.json}
        <textarea
          value={json}
          rows={4}
          maxLength={5_000_000}
          onChange={(e) => change(e.target.value)}
        />
      </label>
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
          <p>{preview.semesters.join(" · ")}</p>
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
  const title =
    course.titles[language] ??
    course.titles.en ??
    Object.values(course.titles)[0];
  return (
    <article className="plan-course" aria-label={`${course.code} · ${title}`}>
      <h3>{title}</h3>
      <p>
        {course.code} · {course.ects ?? "?"} ECTS · {t[course.status]}
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
          aria-label={`${course.pinned ? t.unpin : t.pin} · ${course.code}`}
          onClick={() => change(setPinned(plan, course.id, !course.pinned))}
        >
          {course.pinned ? t.pinned : t.pin}
        </Button>
        {course.pinned && <p>{t.pinHelp}</p>}
        <label>
          {t.semester}
          <select
            aria-label={`${t.semester} · ${course.code}`}
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
              <option key={term}>{term}</option>
            ))}
          </select>
        </label>
        <label>
          {t.state}
          <select
            aria-label={`${t.state} · ${course.code}`}
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
                      : (course.semester ?? plan.semesters[0]),
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
  const scenario = plan ? activeScenario(plan) : undefined;
  const change = (next: Plan) => {
    setError(false);
    void save(next).then((ok) => setError(!ok));
  };
  return (
    <section className="page planner-page">
      <p className="eyebrow">{plan?.programme ?? "UniFr Planner"}</p>
      <h1>{messages[language].plan}</h1>
      <SaveStatus language={language} />
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
      {plan && scenario && (
        <>
          <h2 className="plan-title">{plan.name}</h2>
          <p>
            {t.target}: {plan.targetEcts} ECTS
          </p>
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
          <Summary courses={scenario.courses} t={t} />
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
          <fieldset disabled={busy} className="board-fieldset">
            <div className="semester-board">
              {["completed", null, ...plan.semesters].map((term) => {
                const courses = scenario.courses.filter((c) =>
                  term === "completed"
                    ? c.status === "completed"
                    : c.status !== "completed" && c.semester === term,
                );
                const label =
                  term === "completed" ? t.completed : (term ?? t.unscheduled);
                return (
                  <section
                    className="semester-column"
                    key={term ?? "unassigned"}
                    aria-label={label}
                  >
                    <div className="semester-heading">
                      <h2>{label}</h2>
                      {term && term !== "completed" && (
                        <Link
                          className="text-link no-print"
                          to={`/semester/${term}`}
                        >
                          {t.openCalendar}
                        </Link>
                      )}
                    </div>
                    <p>
                      {courses.reduce((sum, c) => sum + (c.ects ?? 0), 0)} ECTS
                      · {courses.length} {t.courseCount}
                    </p>
                    {courses.length === 0 && (
                      <p className="planner-help">{t.emptySemester}</p>
                    )}
                    {courses.map((course) => (
                      <CourseCard
                        key={course.id}
                        course={course}
                        plan={plan}
                        language={language}
                        change={change}
                      />
                    ))}
                  </section>
                );
              })}
            </div>
          </fieldset>
          <section className="completed-entry no-print">
            <h2>{t.addCompleted}</h2>
            <p>{t.completedHelp}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = new FormData(form);
                try {
                  const next = addCourse(plan, {
                    id: crypto.randomUUID(),
                    code: String(data.get("code")),
                    titles: { [language]: String(data.get("title")) },
                    ects: Number(data.get("ects")),
                    semester: null,
                    status: "completed",
                    pinned: false,
                    offering: null,
                  });
                  change(next);
                  form.reset();
                } catch {
                  setError(true);
                }
              }}
            >
              <fieldset className="planner-fields" disabled={busy}>
                <label>
                  {t.courseTitle}
                  <input name="title" maxLength={200} required />
                </label>
                <label>
                  {t.courseCode}
                  <input name="code" maxLength={200} required />
                </label>
                <label>
                  {t.completedEcts}
                  <input
                    name="ects"
                    type="number"
                    min="0"
                    max="300"
                    step="0.5"
                    required
                  />
                </label>
                <Button type="submit">{t.addCompleted}</Button>
              </fieldset>
            </form>
          </section>
        </>
      )}
      {error && <p role="alert">{t.actionError}</p>}
      <ImportPlan language={language} />
    </section>
  );
}
