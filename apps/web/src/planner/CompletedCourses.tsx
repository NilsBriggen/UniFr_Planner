import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { canonicalCourseCode } from "../../../../packages/domain/src/requirements";
import { Button } from "../components";
import type { Language } from "../i18n";
import { usePlans } from "./context";
import {
  activeScenario,
  fromOffering,
  isManualCode,
  planningSemester,
  recordCompleted,
  updateScenario,
  type Plan,
  type Selection,
} from "./domain";
import { plannerMessages } from "./messages";
import { catchupMessages } from "./catchup-messages";
import {
  historicalCourses,
  historicalTerms,
  type Coverage,
  type HistoricalOffering,
} from "./history";
import ManualCompletion from "./ManualCompletion";
import { SaveStatus } from "./PlanControls";

export default function CompletedCourses({ language }: { language: Language }) {
  const { plan } = usePlans();
  const t = catchupMessages[language];
  if (!plan)
    return (
      <section className="page">
        <h1>{t.title}</h1>
        <SaveStatus language={language} />
        <Link to="/setup">{plannerMessages[language].create}</Link>
      </section>
    );
  return (
    <Catchup
      key={`${plan.id}:${plan.activeScenarioId}`}
      plan={plan}
      language={language}
    />
  );
}
function PriorStudy({ plan, language }: { plan: Plan; language: Language }) {
  const { busy, save } = usePlans();
  const [error, setError] = useState(false);
  const t = catchupMessages[language];
  const records = activeScenario(plan).priorStudy ?? [];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const amount = String(values.get("approximateEcts") ?? "");
    const record = {
      id: crypto.randomUUID(),
      institution: String(values.get("institution") ?? "").trim(),
      period: String(values.get("period") ?? "").trim(),
      approximateEcts: amount === "" ? null : Number(amount),
      status:
        values.get("status") === "recognition_pending"
          ? ("recognition_pending" as const)
          : ("self_reported" as const),
      notes: String(values.get("notes") ?? "").trim(),
    };
    try {
      if (
        await save(
          updateScenario(plan, (scenario) => ({
            ...scenario,
            priorStudy: [...(scenario.priorStudy ?? []), record],
          })),
        )
      ) {
        form.reset();
        setError(false);
      } else setError(true);
    } catch {
      setError(true);
    }
  }
  return (
    <section className="catchup-prior" aria-label={t.priorTitle}>
      <h2>{t.priorTitle}</h2>
      <p>{t.priorHelp}</p>
      {records.length > 0 && (
        <ul>
          {records.map((record) => (
            <li key={record.id}>
              <strong>
                {record.institution} · {record.approximateEcts ?? "?"} ECTS
              </strong>{" "}
              · {record.period} ·{" "}
              {record.status === "recognition_pending"
                ? t.recognitionPending
                : t.selfReported}
              {record.notes && <p>{record.notes}</p>}
              <Button
                disabled={busy}
                onClick={async () => {
                  try {
                    const next = updateScenario(plan, (scenario) => ({
                      ...scenario,
                      priorStudy: (scenario.priorStudy ?? []).filter(
                        (item) => item.id !== record.id,
                      ),
                    }));
                    setError(!(await save(next)));
                  } catch {
                    setError(true);
                  }
                }}
              >
                {t.removePrior} · {record.institution}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form className="planner-form" onSubmit={(event) => void submit(event)}>
        <label>
          {t.institution}
          <input name="institution" required maxLength={200} disabled={busy} />
        </label>
        <label>
          {t.period}
          <input name="period" required maxLength={200} disabled={busy} />
        </label>
        <label>
          {t.approximateEcts}
          <input
            name="approximateEcts"
            type="number"
            min="0"
            max="600"
            step="any"
            disabled={busy}
          />
        </label>
        <label>
          {t.recognitionStatus}
          <select name="status" disabled={busy}>
            <option value="self_reported">{t.selfReported}</option>
            <option value="recognition_pending">{t.recognitionPending}</option>
          </select>
        </label>
        <label>
          {t.contextNotes}
          <input name="notes" maxLength={2000} disabled={busy} />
        </label>
        <Button type="submit" disabled={busy}>
          {t.savePrior}
        </Button>
      </form>
      {error && <p role="alert">{plannerMessages[language].actionError}</p>}
    </section>
  );
}
function Catchup({ plan, language }: { plan: Plan; language: Language }) {
  const { busy, save } = usePlans();
  const t = catchupMessages[language],
    p = plannerMessages[language];
  const [params, setParams] = useSearchParams();
  const progressKey = `unifr.catchup.${plan.id}.${plan.activeScenarioId}`;
  const [resumeTerm] = useState(() => {
    try {
      return localStorage.getItem(progressKey);
    } catch {
      return null;
    }
  });
  const requestedTerm = params.get("term") ?? resumeTerm;
  const term = plan.semesters.includes(requestedTerm ?? "")
    ? requestedTerm!
    : plan.semesters[0];
  const returnTo = params.get("returnTo");
  const destination =
    returnTo && /^\/catalogue(?:\/[^/?#]+)?(?:\?[^#]*)?$/.test(returnTo)
      ? returnTo
      : "/plan";
  const [coverage, setCoverage] = useState<Coverage[] | null>(null);
  const [termsError, setTermsError] = useState(false);
  const [coverageRetry, setCoverageRetry] = useState(0);
  const [courseRetry, setCourseRetry] = useState(0);
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [results, setResults] = useState<{
    key: string;
    offerings: HistoricalOffering[];
    total: number;
    loading: boolean;
    failed: boolean;
    fixture: boolean;
  }>({
    key: "",
    offerings: [],
    total: 0,
    loading: false,
    failed: false,
    fixture: false,
  });
  const [chosen, setChosen] = useState<Selection[]>([]);
  const [review, setReview] = useState(false);
  const [approvedReplacements, setApprovedReplacements] = useState<
    Record<string, string>
  >({});
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<string>();
  const scenario = activeScenario(plan);
  const editRecord = scenario.courses.find((record) => record.id === editing);
  const publication = coverage?.find((item) => item.term === term);
  const queryKey = `${term}:${q}:${offset}:${publication?.snapshot_id ?? ""}`;
  useEffect(() => {
    const controller = new AbortController();
    setTermsError(false);
    void historicalTerms(controller.signal)
      .then(setCoverage)
      .catch(() => {
        if (!controller.signal.aborted) setTermsError(true);
      });
    return () => controller.abort();
  }, [coverageRetry]);
  useEffect(() => {
    if (publication?.status !== "available" || !publication.snapshot_id) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setResults({
        key: queryKey,
        offerings: [],
        total: 0,
        loading: true,
        failed: false,
        fixture: false,
      });
      void historicalCourses(term, q, offset, controller.signal)
        .then((page) => {
          if (controller.signal.aborted) return;
          // Only offerings from the selected term's published snapshot are selectable.
          const offerings = page.items
            .flatMap((item) => item.offerings)
            .filter((offering) => offering.terms.includes(term))
            .map((offering) => ({
              ...offering,
              snapshot_id:
                (offering as HistoricalOffering).snapshot_id ??
                publication.snapshot_id!,
            }));
          setResults({
            key: queryKey,
            offerings,
            total: page.total,
            loading: false,
            failed: false,
            fixture: page.status.development_fixture,
          });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setResults({
              key: queryKey,
              offerings: [],
              total: 0,
              loading: false,
              fixture: false,
              failed: true,
            });
        });
    }, 200);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    term,
    q,
    offset,
    publication?.status,
    publication?.snapshot_id,
    queryKey,
    courseRetry,
  ]);
  function chooseTerm(next: string) {
    const nextParams = new URLSearchParams(params);
    nextParams.set("term", next);
    setParams(nextParams);
    setChosen([]);
    setApprovedReplacements({});
    try {
      localStorage.setItem(progressKey, next);
    } catch {
      /* Optional resume hint. */
    }
    setReview(false);
    setOffset(0);
    setQ("");
    setError(false);
  }
  async function persist() {
    setError(false);
    try {
      const replaceIds = Object.values(approvedReplacements);
      if (await save(recordCompleted(plan, chosen, replaceIds))) {
        setChosen([]);
        setApprovedReplacements({});
        setReview(false);
      } else setError(true);
    } catch {
      setError(true);
    }
  }
  const title = (record: { titles: Record<string, string> }) =>
    record.titles[language] ?? Object.values(record.titles)[0];
  const available =
    publication?.status === "available" && !!publication.snapshot_id;
  const loading =
    (!coverage && !termsError) ||
    (available && (results.key !== queryKey || results.loading));
  const failed =
    termsError ||
    publication?.status === "failed" ||
    (available && results.key === queryKey && results.failed);
  const readFailed = available && results.key === queryKey && results.failed;
  const recheck = () => {
    setCoverage(null);
    setTermsError(false);
    setCoverageRetry((value) => value + 1);
  };
  const coverageLabel = (item: Coverage | undefined) =>
    !item
      ? t.notPublished
      : item.status === "available"
        ? item.refresh_failed
          ? t.retained
          : t.available
        : item.status === "failed"
          ? t.retrievalFailed
          : item.status === "pending" || item.status === "loading"
            ? t.pending
            : t.notPublished;
  const next = plan.semesters[plan.semesters.indexOf(term) + 1];
  return (
    <section className="page planner-page catchup-page">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">
            {plan.name} · {t.planning}: {planningSemester(plan)}
          </p>
          <h1>{t.title}</h1>
          <p>{t.intro}</p>
        </div>
      </header>
      <SaveStatus language={language} />
      <div className="actions">
        <Link className="button" to={destination}>
          {t.later}
        </Link>
        <Link className="button" to={destination}>
          {t.done}
        </Link>
      </div>
      <section className="catchup-archive" aria-label={t.search}>
        <div className="archive-coverage">
          <h2>{t.coverageTitle}</h2>
          {termsError && <p role="alert">{t.transportError}</p>}
          <ul>
            {plan.semesters.map((semester) => {
              const item = coverage?.find(
                (candidate) => candidate.term === semester,
              );
              return (
                <li key={semester}>
                  <span>
                    {semester} · {coverage ? coverageLabel(item) : t.loading}
                  </span>
                  {item?.checked_at && (
                    <small>
                      {" "}
                      · {t.checked}: {item.checked_at}
                    </small>
                  )}
                </li>
              );
            })}
          </ul>
          <p>{t.recheckHelp}</p>
        </div>
        <label>
          {p.semester}
          <select
            aria-label={p.semester}
            value={term}
            disabled={busy}
            onChange={(event) => chooseTerm(event.target.value)}
          >
            {plan.semesters.map((semester) => (
              <option key={semester}>{semester}</option>
            ))}
          </select>
        </label>
        {!review ? (
          <>
            <label>
              {t.search}
              <input
                type="search"
                value={q}
                onChange={(event) => {
                  setQ(event.target.value);
                  setOffset(0);
                }}
              />
            </label>
            <p role="status">
              {loading
                ? t.loading
                : failed
                  ? t.failed
                  : !available
                    ? publication?.status === "loading" ||
                      publication?.status === "pending"
                      ? t.importing
                      : t.unavailable
                    : results.offerings.length === 0
                      ? t.empty
                      : `${results.total} ${p.courseCount}`}
            </p>

            {!loading && termsError && (
              <Button onClick={recheck}>{t.retryLoading}</Button>
            )}
            {!loading && readFailed && (
              <Button onClick={() => setCourseRetry((value) => value + 1)}>
                {t.retryLoading}
              </Button>
            )}
            {!loading && !termsError && !readFailed && !available && (
              <Button onClick={recheck}>{t.recheck}</Button>
            )}
            {available && !loading && !failed && (
              <ul className="catchup-checklist">
                {results.offerings.map((offering) => {
                  const canonical = canonicalCourseCode(offering.course.code);
                  const existing = scenario.courses.find(
                    (record) => canonicalCourseCode(record.code) === canonical,
                  );
                  const selected = chosen.some(
                    (record) => canonicalCourseCode(record.code) === canonical,
                  );
                  const blocked =
                    existing?.pinned || existing?.status === "completed";
                  return (
                    <li key={`${offering.source_id}:${offering.snapshot_id}`}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={busy || (!!blocked && !selected)}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setApprovedReplacements((old) => {
                              const next = { ...old };
                              delete next[canonical];
                              if (checked && existing)
                                next[canonical] = existing.id;
                              return next;
                            });
                            if (!event.target.checked)
                              setChosen((old) =>
                                old.filter(
                                  (record) =>
                                    canonicalCourseCode(record.code) !==
                                    canonical,
                                ),
                              );
                            else
                              setChosen((old) => [
                                ...old.filter(
                                  (record) =>
                                    canonicalCourseCode(record.code) !==
                                    canonical,
                                ),
                                {
                                  ...fromOffering(
                                    offering,
                                    crypto.randomUUID(),
                                    offering.snapshot_id!,
                                    results.fixture,
                                  ),
                                  semester: term,
                                  status: "completed",
                                },
                              ]);
                          }}
                        />
                        <span>
                          <strong>{title(offering.course)}</strong> ·{" "}
                          {offering.course.code} · {offering.ects ?? "?"} ECTS
                          {existing && (
                            <small>
                              {existing.pinned
                                ? t.pinned
                                : existing.status === "completed"
                                  ? t.already
                                  : t.existing}
                            </small>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            {available && !loading && !failed && (
              <div className="actions">
                <Button
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 20))}
                >
                  {t.previous}
                </Button>
                <Button
                  disabled={offset + 20 >= results.total}
                  onClick={() => setOffset(offset + 20)}
                >
                  {t.more}
                </Button>
              </div>
            )}
            <p>
              {t.selected}: {chosen.length} ·{" "}
              {chosen.reduce((sum, course) => sum + (course.ects ?? 0), 0)} ECTS
              {chosen.some((course) => course.ects === null) &&
                ` · ${p.unknown}`}
            </p>
            <Button
              className="primary"
              disabled={!chosen.length || busy}
              onClick={() => setReview(true)}
            >
              {t.review}
            </Button>
          </>
        ) : (
          <section className="catchup-review" aria-label={t.review}>
            <h2>{t.review}</h2>
            <p>{t.reviewHelp}</p>
            {chosen.map((course) => (
              <label key={course.id}>
                {title(course)} · {t.earned}
                <input
                  type="number"
                  aria-label={`${t.earned} · ${title(course)}`}
                  min="0"
                  max="300"
                  step="any"
                  required
                  value={course.ects ?? ""}
                  onChange={(event) =>
                    setChosen((old) =>
                      old.map((record) =>
                        record.id === course.id
                          ? {
                              ...record,
                              ects:
                                event.target.value === ""
                                  ? null
                                  : Number(event.target.value),
                            }
                          : record,
                      ),
                    )
                  }
                />
              </label>
            ))}
            <p>
              <strong>
                {t.earned}:{" "}
                {chosen.reduce((sum, course) => sum + (course.ects ?? 0), 0)}{" "}
                ECTS
              </strong>
            </p>
            <div className="actions">
              <Button
                disabled={
                  busy ||
                  chosen.some(
                    (course) =>
                      course.ects === null ||
                      !Number.isFinite(course.ects) ||
                      course.ects < 0 ||
                      course.ects > 300,
                  )
                }
                onClick={() => void persist()}
              >
                {t.save}
              </Button>
              <Button disabled={busy} onClick={() => setReview(false)}>
                {t.reviewBack}
              </Button>
            </div>
          </section>
        )}
        {next && (
          <div className="actions">
            <Button disabled={busy} onClick={() => chooseTerm(next)}>
              {t.skip}
            </Button>
            <Button disabled={busy} onClick={() => chooseTerm(next)}>
              {t.next}
            </Button>
          </div>
        )}
        {error && <p role="alert">{p.actionError}</p>}
      </section>
      <ManualCompletion
        key={editRecord?.id ?? "new"}
        plan={plan}
        language={language}
        record={editRecord}
        onDone={() => setEditing(undefined)}
      />
      <PriorStudy plan={plan} language={language} />
      <section aria-label={t.recorded}>
        <h2>{t.recorded}</h2>
        <p>
          <strong>
            {t.earned}:{" "}
            {scenario.courses
              .filter((course) => course.status === "completed")
              .reduce((sum, course) => sum + (course.ects ?? 0), 0)}{" "}
            ECTS
          </strong>
        </p>
        {[...plan.semesters, null].map((semester) => {
          const records = scenario.courses.filter(
            (record) =>
              record.status === "completed" && record.semester === semester,
          );
          return (
            records.length > 0 && (
              <section key={semester ?? "earlier"}>
                <h3>{semester ?? t.earlier}</h3>
                {records.map((record) => (
                  <article className="plan-course" key={record.id}>
                    <h4>{title(record)}</h4>
                    <p>
                      {isManualCode(record.code) ? t.noCode : record.code} ·{" "}
                      {record.ects ?? "?"} ECTS
                    </p>
                    {!record.offering && (
                      <div className="actions">
                        <Button
                          disabled={busy || record.pinned}
                          onClick={() => setEditing(record.id)}
                        >
                          {t.edit} · {title(record)}
                        </Button>
                        <Button
                          disabled={busy || record.pinned}
                          onClick={async () => {
                            if (
                              !(await save(
                                updateScenario(plan, (s) => ({
                                  ...s,
                                  courses: s.courses.filter(
                                    (item) => item.id !== record.id,
                                  ),
                                })),
                              ))
                            )
                              setError(true);
                            else if (editing === record.id)
                              setEditing(undefined);
                          }}
                        >
                          {t.remove} · {title(record)}
                        </Button>
                      </div>
                    )}
                    {record.pinned && <p>{t.pinned}</p>}
                  </article>
                ))}
              </section>
            )
          );
        })}
      </section>
    </section>
  );
}
