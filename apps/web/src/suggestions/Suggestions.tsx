import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, StatusNotice } from "../components";
import type { Language } from "../i18n";
import { usePlans } from "../planner/context";
import { activeScenario, type Selection } from "../planner/domain";
import { calendarFor } from "../planner/calendar";
import { SaveStatus } from "../planner/Planner";
import { evaluatePlanRequirements } from "../requirements/adapter";
import {
  generateSuggestions,
  type Preferences,
  type Suggestion,
  type SuggestionResult,
} from "./engine";
import { createExample, exampleRequirements, seededCatalogue } from "./seed";
import { suggestionMessages } from "./messages";
import { catalogueCandidates } from "../planner/published";
import { catalogueMessages } from "../catalogue-i18n";
import "./suggestions.css";

function SelectionCard({
  course,
  title,
  language,
}: {
  course: Selection;
  title: string;
  language: Language;
}) {
  const t = suggestionMessages[language];
  const calendar = course.semester
    ? calendarFor([course], course.semester, language)
    : null;
  const date = new Intl.DateTimeFormat(language, {
    timeZone: "Europe/Zurich",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <div className="suggestion-selection">
      <h3>{title}</h3>
      <p>
        <strong>{course.titles[language] ?? course.code}</strong>
        <br />
        {course.code}
      </p>
      <dl>
        <dt>{t.term}</dt>
        <dd>{course.semester ?? t.unknown}</dd>
        <dt>ECTS</dt>
        <dd>{course.ects ?? t.unknown}</dd>
        <dt>{t.offering}</dt>
        <dd>{course.offering?.source_id ?? t.unknown}</dd>
      </dl>
      <h4>{t.meeting}</h4>
      {calendar?.events.map((e) => (
        <p key={e.id}>
          <time dateTime={e.start}>{date.format(new Date(e.start))}</time> –{" "}
          <time dateTime={e.end}>{date.format(new Date(e.end))}</time>
          <br />
          {e.location}
        </p>
      ))}
      {(!calendar || calendar.unresolved.length > 0) && (
        <p>{t.warnings.calendar}</p>
      )}
    </div>
  );
}
function Comparison({
  suggestion,
  language,
  count,
  busy,
  onApply,
  onClose,
}: {
  suggestion: Suggestion;
  language: Language;
  count: number;
  busy: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  const t = suggestionMessages[language];
  const [acknowledged, setAcknowledged] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <section
      id="suggestion-comparison"
      className="suggestion-comparison"
      aria-labelledby="comparison-title"
    >
      <div className="suggestion-comparison-heading">
        <h2 id="comparison-title" tabIndex={-1} ref={heading}>
          {t.comparison}
        </h2>
        <Button onClick={onClose}>{t.cancel}</Button>
      </div>
      <div className="suggestion-change">
        <SelectionCard
          course={suggestion.before}
          title={t.before}
          language={language}
        />
        <SelectionCard
          course={suggestion.after}
          title={t.after}
          language={language}
        />
      </div>
      <p>
        <strong>{t.ects}:</strong>{" "}
        {suggestion.ectsDelta === null
          ? t.unknown
          : `${suggestion.ectsDelta > 0 ? "+" : ""}${suggestion.ectsDelta}`}{" "}
        · <strong>{t.resolved}:</strong> {suggestion.rank[0]}
      </p>
      <h3>{t.impacts}</h3>
      {suggestion.impacts.length ? (
        <ul aria-label={t.impacts}>
          {suggestion.impacts.map(({ before, after }) => (
            <li key={after.node.id}>
              <strong>{after.node.title[language]}</strong>
              <p>
                {t.remainingCredits}: {before.remaining} → {after.remaining}
                <br />
                {t.missingCourses}: {before.remainingCourses} →{" "}
                {after.remainingCourses}
                <br />
                {t.allocatedCredits}:{" "}
                {before.earned + before.inProgress + before.planned} →{" "}
                {after.earned + after.inProgress + after.planned}
                {after.node.maxCredits !== undefined && (
                  <>
                    <br />
                    {t.overMaximum}:{" "}
                    {Math.max(
                      0,
                      before.earned +
                        before.inProgress +
                        before.planned -
                        after.node.maxCredits,
                    )}{" "}
                    →{" "}
                    {Math.max(
                      0,
                      after.earned +
                        after.inProgress +
                        after.planned -
                        after.node.maxCredits,
                    )}
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t.noneAdvanced}</p>
      )}
      <h3>{t.conflicts}</h3>
      <dl className="suggestion-conflicts">
        {(["hard", "travel", "unavailable"] as const).map((kind) => (
          <div key={kind}>
            <dt>{t[kind]}</dt>
            <dd>
              {suggestion.conflictsBefore.filter((c) => c.kind === kind).length}{" "}
              →{" "}
              {suggestion.conflictsAfter.filter((c) => c.kind === kind).length}
            </dd>
          </div>
        ))}
      </dl>
      <h3>{t.why}</h3>
      <p>
        {suggestion.outranksBy === null
          ? count === 1
            ? t.only
            : t.last
          : suggestion.outranksBy === -1
            ? t.tie
            : `${t.better}: ${t.ranking[suggestion.outranksBy]}.`}
      </p>
      <p>{t.rankingHelp}</p>
      <ol className="suggestion-scores">
        {t.ranking.map((label, i) => (
          <li key={label}>
            {label}: <strong>{suggestion.rank[i]}</strong>
          </li>
        ))}
      </ol>
      <h3>{t.uncertainty}</h3>
      <ul className="suggestion-warnings">
        {suggestion.uncertainty.map((w) => (
          <li key={w}>{t.warnings[w]}</li>
        ))}
      </ul>
      <p>
        <strong>{t.source}:</strong> {suggestion.evidence}
      </p>
      {suggestion.after.offering &&
        !suggestion.after.offering.development_fixture &&
        /^https:\/\//.test(suggestion.after.offering.source_url) && (
          <a href={suggestion.after.offering.source_url}>{t.source}</a>
        )}
      {suggestion.uncertainty.length > 0 && (
        <label className="suggestion-confirm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          {t.confirm}
        </label>
      )}
      <Button
        className="primary"
        disabled={busy || (suggestion.uncertainty.length > 0 && !acknowledged)}
        onClick={onApply}
      >
        {t.apply}
      </Button>
    </section>
  );
}
export default function Suggestions({ language }: { language: Language }) {
  const t = suggestionMessages[language];
  const { plan, save, ready, busy, apply, undo, revision, published } =
    usePlans();
  const catalogue = useMemo(
    () =>
      published.catalogue && !published.error && !published.loading
        ? catalogueCandidates(published.catalogue)
        : [],
    [published.catalogue, published.error, published.loading],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<"applied" | "undone" | "stale" | null>(
    null,
  );
  const [preferences, setPreferences] = useState<Preferences>({
    languages: [language],
    freeDays: [],
    highPriorityNodeIds: [],
  });
  const noticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);
  const evaluated = useMemo(() => {
    if (!plan) return { result: null, error: false };
    try {
      const isExample = plan.programme === "SUGGESTIONS-DEMO";
      const result: SuggestionResult = generateSuggestions({
        plan,
        catalogue: isExample ? seededCatalogue : catalogue,
        requirements: isExample
          ? exampleRequirements(plan)
          : evaluatePlanRequirements(plan),
        preferences,
      });
      return { result, error: false };
    } catch {
      return { result: null, error: true };
    }
  }, [plan, preferences, catalogue]);
  const result = evaluated.result;
  const suggestion = result?.suggestions.find((s) => s.id === selected);
  const staleRevision =
    !!revision && JSON.stringify(plan) !== JSON.stringify(revision.after);
  function togglePreference(
    field: "languages" | "freeDays",
    value: string | number,
  ) {
    setSelected(null);
    setPreferences((old) =>
      field === "languages"
        ? {
            ...old,
            languages: old.languages.includes(String(value))
              ? old.languages.filter((v) => v !== value)
              : [...old.languages, String(value)],
          }
        : {
            ...old,
            freeDays: old.freeDays.includes(Number(value))
              ? old.freeDays.filter((v) => v !== value)
              : [...old.freeDays, Number(value)],
          },
    );
  }
  return (
    <section className="page suggestions-page">
      <p className="eyebrow">{t.nav}</p>
      <h1>{t.title}</h1>
      <p className="intro">{t.intro}</p>
      <SaveStatus language={language} />
      <StatusNotice>
        <p>
          {plan?.programme === "SUGGESTIONS-DEMO"
            ? t.demo
            : published.loading
              ? catalogueMessages[language].loading
              : published.error
                ? catalogueMessages[language].transport
                : published.catalogue?.status.development_fixture
                  ? catalogueMessages[language].fixture
                  : published.catalogue
                    ? `${catalogueMessages[language].updated} · ${published.catalogue.status.snapshot_id}`
                    : t.noData}
        </p>
      </StatusNotice>
      <div className="actions">
        <Button
          disabled={!ready || busy}
          onClick={() =>
            void save(createExample(crypto.randomUUID(), t.exampleName)).then(
              (ok) => {
                if (ok) {
                  setSelected(null);
                  setNotice(null);
                }
              },
            )
          }
        >
          {t.example}
        </Button>
        <Link className="text-link" to="/plan">
          {t.back}
        </Link>
      </div>
      {notice && (
        <p
          className="suggestion-feedback"
          role={notice === "stale" ? "alert" : "status"}
          tabIndex={-1}
          ref={noticeRef}
        >
          {t[notice]}
        </p>
      )}
      {revision && (
        <div className="suggestion-undo">
          <Button
            disabled={busy || staleRevision}
            onClick={() =>
              void undo().then((ok) => {
                setSelected(null);
                setNotice(ok ? "undone" : "stale");
              })
            }
          >
            {t.undo}
          </Button>
          {staleRevision && <p>{t.stale}</p>}
        </div>
      )}
      {!plan && <p>{t.noPlan}</p>}
      {plan && (
        <>
          <h2>{plan.name}</h2>
          <p>
            {t.scenario}: {activeScenario(plan).name}
          </p>
          {evaluated.error && <p role="alert">{t.reasons.requirementError}</p>}
          {result?.availability !== "available" && result && (
            <p className="notice">{t[result.availability]}</p>
          )}
          {result?.availability === "available" && (
            <>
              <details className="suggestion-preferences">
                <summary>{t.preferences}</summary>
                <fieldset>
                  <legend>{t.languages}</legend>
                  <div className="suggestion-options">
                    {["de", "fr", "en"].map((code, i) => (
                      <label key={code}>
                        <input
                          type="checkbox"
                          checked={preferences.languages.includes(code)}
                          onChange={() => togglePreference("languages", code)}
                        />
                        {["Deutsch", "Français", "English"][i]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>{t.freeDays}</legend>
                  <div className="suggestion-options">
                    {t.weekdays.map((day, i) => (
                      <label key={day}>
                        <input
                          type="checkbox"
                          checked={preferences.freeDays.includes(i + 1)}
                          onChange={() => togglePreference("freeDays", i + 1)}
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </details>
              <ol className="suggestion-list" aria-label={t.nav}>
                {result.suggestions.map((s, i) => (
                  <li key={s.id}>
                    <div>
                      <span className="eyebrow">
                        {String(i + 1).padStart(2, "0")} · {t.routes[s.route]}
                      </span>
                      <h3>{s.after.titles[language] ?? s.after.code}</h3>
                      <p>
                        {s.before.semester ?? t.unknown} → {s.after.semester} ·{" "}
                        {t.resolved}: {s.rank[0]}
                      </p>
                      {s.uncertainty.includes("calendar") && (
                        <p>{t.warnings.calendar}</p>
                      )}
                      {s.uncertainty.includes("requirementLoss") && (
                        <p>{t.warnings.requirementLoss}</p>
                      )}
                    </div>
                    <Button
                      aria-expanded={selected === s.id}
                      aria-controls={
                        selected === s.id ? "suggestion-comparison" : undefined
                      }
                      onClick={() => setSelected(s.id)}
                    >
                      {t.compare} · {i + 1}
                    </Button>
                  </li>
                ))}
              </ol>
            </>
          )}
          {suggestion && result && (
            <Comparison
              key={suggestion.base + suggestion.id}
              suggestion={suggestion}
              language={language}
              count={result.suggestions.length}
              busy={busy}
              onClose={() => {
                setSelected(null);
                document
                  .querySelector<HTMLButtonElement>(
                    ".suggestion-list button[aria-expanded=true]",
                  )
                  ?.focus();
              }}
              onApply={() =>
                void apply(suggestion).then((ok) => {
                  if (ok) setSelected(null);
                  setNotice(ok ? "applied" : "stale");
                })
              }
            />
          )}
          {!!result?.rejected.length && (
            <details className="suggestion-rejections">
              <summary>
                {t.rejections} ({result.rejected.length})
              </summary>
              <ul>
                {result.rejected.map((r) => (
                  <li key={r.id}>
                    {t.reasons[r.reason]}
                    {r.detail && ` · ${r.detail}`}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
