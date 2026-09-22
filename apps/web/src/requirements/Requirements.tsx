import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { programmeTemplates } from "../../../../packages/domain/src/programmes";
import {
  flattenRequirements,
  type RequirementResult,
} from "../../../../packages/domain/src/requirements";
import { Button } from "../components";
import type { Language } from "../i18n";
import { usePlans } from "../planner/context";
import { activeScenario, updateScenario, type Plan } from "../planner/domain";
import { SaveStatus } from "../planner/PlanControls";
import {
  bindProgramme,
  evaluateAdditionalRequirements,
  resolvedPlanDegree,
  evaluatePlanRequirements,
  requirementTree,
  setRequirementEvidence,
} from "./adapter";
import { requirementMessages } from "./messages";
import "./requirements.css";
import RecipeChooser from "./RecipeChooser";
import { recipeMessages } from "./recipeMessages";
import StudySummary from "./StudySummary";
import ReviewGaps from "./ReviewGaps";

const editStudies = {
  en: "Edit studies",
  de: "Studium bearbeiten",
  fr: "Modifier les études",
} as const;

function Progress({
  result,
  language,
}: {
  result: RequirementResult;
  language: Language;
}) {
  const t = requirementMessages[language];
  const format = (n: number) =>
    n.toLocaleString(language, { maximumFractionDigits: 6 });
  return (
    <dl className="requirement-progress">
      {(
        [
          [t.earned, result.earned],
          [t.inProgress, result.inProgress],
          [t.planned, result.planned],
          [t.remaining, result.remaining],
          [t.toEarn, result.remainingToEarn],
        ] as const
      ).map(([label, amount]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{format(amount)} ECTS</dd>
        </div>
      ))}
    </dl>
  );
}
function ResultNode({
  result,
  language,
  depth = 0,
}: {
  result: RequirementResult;
  language: Language;
  depth?: number;
}) {
  const t = requirementMessages[language],
    n = result.node;
  return (
    <li className="requirement-node">
      <details open={depth === 0 && result.children.length > 0}>
        <summary className="requirement-title">
          <strong>{n.title[language]}</strong>{" "}
          <span className={`requirement-status ${result.status}`}>
            {t[result.status]}
          </span>
        </summary>
        <p>{n.explanation[language]}</p>
        {result.explanations.length > 0 && (
          <div>
            <strong>{recipeMessages[language].prerequisite}</strong>
            <ul>
              {result.explanations.map((explanation, i) => (
                <li key={i}>{explanation[language]}</li>
              ))}
            </ul>
          </div>
        )}
        <Progress result={result} language={language} />
        {result.remainingCourses > 0 && (
          <p>
            {t.courses}: {result.remainingCourses}
          </p>
        )}
        {result.allocations.length > 0 && (
          <ul className="requirement-allocations">
            {result.allocations.map((a) => (
              <li key={a.courseId}>
                {a.code} · {a.credits?.toLocaleString(language) ?? "?"} ECTS{" "}
                {a.override && <strong>· {t.override}</strong>}
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary>{t.sources}</summary>
          <p>{t[n.reviewStatus]}</p>
          <ul>
            {n.citations.map((c, i) => (
              <li key={i}>
                <a href={c.url}>{c.title}</a> · {c.section}
                <br />
                {t.revision}: {c.revisionDate ?? t.unknownDate} · {t.retrieved}:{" "}
                {c.retrievedAt}
                <br />
                {t.applicable}: {c.cohort}
              </li>
            ))}
          </ul>
        </details>
        {result.children.length > 0 && (
          <ul>
            {result.children.map((child) => (
              <ResultNode
                key={child.node.id}
                result={child}
                language={language}
                depth={depth + 1}
              />
            ))}
          </ul>
        )}
      </details>
    </li>
  );
}
function PlanRequirements({
  plan,
  language,
}: {
  plan: Plan;
  language: Language;
}) {
  const { busy, save } = usePlans();
  const t = requirementMessages[language];
  const [cohort, setCohort] = useState(
    plan.requirements?.cohort ?? Number(plan.semesters[0].slice(3)),
  );
  const [error, setError] = useState(false);
  const [editingStudies, setEditingStudies] = useState(!plan.degreeSelection);
  const available = programmeTemplates.filter(
    (p) =>
      p.cohortFrom === cohort &&
      !plan.requirements?.templates.some((ref) => ref.code === p.code),
  );
  const scenario = activeScenario(plan),
    evidence = scenario.requirementEvidence ?? {
      overrides: [],
      completedChecklist: [],
    };
  let additional: RequirementResult | null = null;
  let result: RequirementResult | null = null,
    failed = false;
  let degree: ReturnType<typeof resolvedPlanDegree> = null;
  let nodes: ReturnType<typeof flattenRequirements> = [];
  try {
    const tree = requirementTree(plan);
    if (tree) nodes = flattenRequirements(tree);
    degree = resolvedPlanDegree(plan);
    if (degree?.additionalRoot)
      nodes = [...nodes, ...flattenRequirements(degree.additionalRoot)];
    result = evaluatePlanRequirements(plan);
    additional = evaluateAdditionalRequirements(plan);
  } catch {
    failed = true;
  }
  const leaves = nodes.filter((n) => "codes" in n);
  async function commit(make: () => Plan) {
    try {
      setError(!(await save(make())));
    } catch {
      setError(true);
    }
  }
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const p = available.find(
      (p) => `${p.code}@${p.version}` === form.get("template"),
    );
    if (p)
      void commit(() =>
        bindProgramme(plan, { code: p.code, version: p.version, cohort }),
      );
  }
  function override(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const courseId = String(form.get("course"));
    const entry = {
      kind:
        form.get("kind") === "allocation"
          ? ("allocation" as const)
          : ("substitution" as const),
      courseId,
      nodeId: String(form.get("node")),
      reason: String(form.get("reason")),
    };
    void commit(() =>
      setRequirementEvidence(plan, {
        ...evidence,
        overrides: [
          ...evidence.overrides.filter((o) => o.courseId !== courseId),
          entry,
        ],
      }),
    );
  }
  return (
    <>
      <p>{t.limits}</p>
      {(error || failed) && <p role="alert">{t.error}</p>}
      {plan.degreeSelection && !editingStudies ? (
        <section className="studies-summary" aria-label={editStudies[language]}>
          <div>
            <StudySummary plan={plan} language={language} />
            {degree && (
              <>
                <p>
                  {recipeMessages[language].counted}: {degree.targetEcts} ECTS
                </p>
                {degree.additionalEcts > 0 && (
                  <p>
                    {recipeMessages[language].additional}:{" "}
                    {degree.additionalEcts} ECTS
                  </p>
                )}
              </>
            )}
            {degree?.issues.length ? (
              <ReviewGaps degree={degree} language={language} />
            ) : null}
          </div>
          <Button onClick={() => setEditingStudies(true)}>
            {editStudies[language]}
          </Button>
        </section>
      ) : (
        <RecipeChooser plan={plan} language={language} />
      )}
      {!plan.degreeSelection && (
        <details open={!!plan.requirements}>
          <summary>{recipeMessages[language].legacy}</summary>
          <form className="planner-form" onSubmit={add}>
            <label>
              {t.cohort}
              <select
                aria-label={t.cohort}
                value={cohort}
                disabled={busy || !!plan.requirements}
                onChange={(e) => setCohort(Number(e.target.value))}
              >
                {![2024, 2025, 2026].includes(cohort) && (
                  <option value={cohort}>{cohort}</option>
                )}
                {[2024, 2025, 2026].map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
            <label>
              {t.programme}
              <select
                aria-label={t.programme}
                name="template"
                key={`${cohort}-${available.length}`}
                disabled={busy || !available.length}
              >
                {available.map((p) => (
                  <option key={p.code} value={`${p.code}@${p.version}`}>
                    {p.title[language]} · {p.version}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="submit"
              disabled={
                busy ||
                !available.length ||
                (plan.requirements?.templates.length ?? 0) >= 3
              }
            >
              {t.add}
            </Button>
          </form>
        </details>
      )}
      {plan.requirements && (
        <p>
          {t.pinned}:{" "}
          {plan.requirements.templates
            .map((p) => `${p.code} · ${p.version}`)
            .join("; ")}
        </p>
      )}
      <label className="requirement-scenario">
        {t.scenario}
        <select
          aria-label={t.scenario}
          value={plan.activeScenarioId}
          disabled={busy}
          onChange={(e) =>
            void commit(() => ({ ...plan, activeScenarioId: e.target.value }))
          }
        >
          {plan.scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {!result && !failed && <p>{t.empty}</p>}
      {result && (
        <>
          <ul className="requirement-tree" aria-label={t.title}>
            <ResultNode result={result} language={language} />
          </ul>
          {additional && (
            <section aria-label={recipeMessages[language].additional}>
              <h2>{recipeMessages[language].additional}</h2>
              <ul className="requirement-tree">
                <ResultNode result={additional} language={language} />
              </ul>
            </section>
          )}
          <section aria-label={t.override}>
            <h2>{t.override}</h2>
            <p>{t.overrideHelp}</p>
            <form className="planner-form" onSubmit={override}>
              <label>
                {t.course}
                <select
                  aria-label={t.course}
                  name="course"
                  required
                  disabled={busy || !scenario.courses.length}
                >
                  {scenario.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.requirement}
                <select
                  aria-label={t.requirement}
                  name="node"
                  required
                  disabled={busy}
                >
                  {leaves.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title[language]} · {n.id.split("/")[0]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.kind}
                <select
                  aria-label={t.kind}
                  name="kind"
                  defaultValue="substitution"
                  disabled={busy}
                >
                  <option value="allocation">{t.allocation}</option>
                  <option value="substitution">{t.substitution}</option>
                </select>
              </label>
              <label>
                {t.reason}
                <input
                  name="reason"
                  required
                  maxLength={2000}
                  disabled={busy}
                />
              </label>
              <Button type="submit" disabled={busy || !scenario.courses.length}>
                {t.save}
              </Button>
            </form>
          </section>
          {nodes.some((n) => n.kind === "checklist") && (
            <fieldset>
              <legend>{t.duties}</legend>
              {nodes
                .filter((n) => n.kind === "checklist")
                .map((n) => (
                  <label className="requirement-duty" key={n.id}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={evidence.completedChecklist.includes(n.id)}
                      onChange={(e) =>
                        void commit(() =>
                          setRequirementEvidence(plan, {
                            ...evidence,
                            completedChecklist: e.target.checked
                              ? [...evidence.completedChecklist, n.id]
                              : evidence.completedChecklist.filter(
                                  (id) => id !== n.id,
                                ),
                          }),
                        )
                      }
                    />
                    {n.title[language]}
                  </label>
                ))}
            </fieldset>
          )}
        </>
      )}
      {evidence.overrides.length > 0 && (
        <ul aria-label={t.override}>
          {evidence.overrides.map((o) => (
            <li key={o.courseId}>
              <strong>{t.override}</strong> · {o.courseId} → {o.nodeId}
              <p>{o.reason}</p>
              <Button
                disabled={busy}
                onClick={() =>
                  void commit(() =>
                    setRequirementEvidence(plan, {
                      ...evidence,
                      overrides: evidence.overrides.filter(
                        (x) => x.courseId !== o.courseId,
                      ),
                    }),
                  )
                }
              >
                {t.remove} · {o.courseId}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {failed &&
        (evidence.overrides.length > 0 ||
          evidence.completedChecklist.length > 0) && (
          <Button
            disabled={busy}
            onClick={() =>
              void commit(() =>
                updateScenario(plan, (s) => ({
                  ...s,
                  requirementEvidence: {
                    overrides: [],
                    completedChecklist: [],
                  },
                })),
              )
            }
          >
            {t.reset}
          </Button>
        )}
    </>
  );
}
export default function Requirements({ language }: { language: Language }) {
  const { plan } = usePlans(),
    t = requirementMessages[language];
  return (
    <section className="page requirements-page">
      <h1>{t.title}</h1>
      <SaveStatus language={language} />
      {plan ? (
        <PlanRequirements key={plan.id} plan={plan} language={language} />
      ) : (
        <p>{t.noPlan}</p>
      )}
      <Link className="text-link" to="/plan">
        {t.plan}
      </Link>
    </section>
  );
}
