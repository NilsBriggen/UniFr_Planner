import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ResolvedDegree } from "../../../../packages/domain/src/recipes";
import { Button } from "../components";
import type { Language } from "../i18n";
import { messages } from "../i18n";
import { bindDegreeSelection } from "../requirements/adapter";
import { DegreeSelectionForm } from "../requirements/RecipeChooser";
import ReviewGaps from "../requirements/ReviewGaps";
import { recipeMessages } from "../requirements/recipeMessages";
import {
  degreeProgrammeLabel,
  studyLabel,
} from "../requirements/study-summary";
import { catchupMessages } from "./catchup-messages";
import { usePlans } from "./context";
import { createPlan, currentSemester, semesterIndex } from "./domain";
import { plannerMessages } from "./messages";
import { SaveStatus } from "./PlanControls";
import { SemesterField, semesterLabel } from "./SemesterField";
import { setupMessages } from "./setupMessages";

export function Setup({ language }: { language: Language }) {
  const t = plannerMessages[language];
  const c = catchupMessages[language];
  const setup = setupMessages[language];
  const { ready, busy, save } = usePlans();
  const navigate = useNavigate();
  const [query] = useSearchParams();
  const current = currentSemester();
  const [manual, setManual] = useState(false);
  const [edited, setEdited] = useState({ name: false, count: false });
  const [degree, setDegree] = useState<ResolvedDegree | null>(null);
  const [step, setStep] = useState<"studies" | "settings">("studies");
  const [error, setError] = useState(false);
  const [rangeError, setRangeError] = useState(false);
  const [recordCompleted, setRecordCompleted] = useState(false);
  const [settings, setSettings] = useState({
    name: "Personal study plan",
    programme: "Personal programme",
    target: 180,
    start: current,
    planning: current,
    count: 6,
  });
  const [draft] = useState(() =>
    createPlan({
      id: "setup-draft",
      scenarioId: "setup-scenario",
      name: "Study configuration",
      programme: "Study configuration",
      startTerm: current,
      semesterCount: 1,
      targetEcts: 180,
    }),
  );

  function destination(planning: string, configured: boolean) {
    const returnTo = query.get("returnTo");
    if (returnTo && /^\/catalogue(?:\/[^/?#]+)?(?:\?[^#]*)?$/.test(returnTo))
      return returnTo;
    return configured
      ? `/catalogue?term=${encodeURIComponent(planning)}&focus=programme`
      : `/catalogue?term=${encodeURIComponent(planning)}`;
  }

  async function persist(
    programme: string,
    targetEcts: number,
    selection?: Parameters<typeof bindDegreeSelection>[1],
  ) {
    try {
      setRangeError(false);
      const start =
        selection?.components.find((component) => component.slotId === "major")
          ?.startSemester ?? settings.start;
      const distance = semesterIndex(settings.planning) - semesterIndex(start);
      if (distance < 0 || distance >= 24) {
        setRangeError(true);
        return;
      }
      let plan = createPlan({
        id: crypto.randomUUID(),
        scenarioId: crypto.randomUUID(),
        name: settings.name.trim(),
        programme,
        startTerm: start,
        planningSemester: settings.planning,
        semesterCount: Math.max(settings.count, distance + 1),
        targetEcts,
      });
      if (selection) plan = bindDegreeSelection(plan, selection);
      if (!(await save(plan))) {
        setError(true);
        return;
      }
      const next = destination(settings.planning, !!selection);
      navigate(
        recordCompleted
          ? `/plan/completed?returnTo=${encodeURIComponent(next)}`
          : next,
      );
    } catch {
      setError(true);
    }
  }

  return (
    <section className="page planner-page setup-page">
      <p className="eyebrow">UniFr Planner</p>
      <h1>{messages[language].setup}</h1>
      <p className="setup-intro">{t.programmeHelp}</p>
      <div hidden={manual || step !== "studies"}>
        <h2>{setup.studies}</h2>
        <DegreeSelectionForm
          plan={draft}
          language={language}
          busy={!ready || busy}
          setupMode
          startSemester={settings.start}
          onStartSemesterChange={(start) =>
            setSettings((current) => ({ ...current, start }))
          }
          commitLabel={setup.continue}
          onCommit={async (resolved) => {
            const name = degreeProgrammeLabel(resolved, language);
            setDegree(resolved);
            setSettings((old) => ({
              ...old,
              name: edited.name ? old.name : name,
              count: edited.count
                ? old.count
                : Math.min(
                    24,
                    Math.max(1, Math.ceil(resolved.targetEcts / 30)),
                  ),
            }));
            setStep("settings");
            return true;
          }}
        />
      </div>

      {(manual || step === "settings") && <h2>{setup.settings}</h2>}
      {!manual && step === "settings" && degree && (
        <section className="setup-review" aria-label={setup.review}>
          <h3>
            {studyLabel(
              { ...draft, degreeSelection: degree.selection },
              language,
            )}
          </h3>
          <p>
            <strong>{degree.targetEcts} ECTS</strong> ·{" "}
            {recipeMessages[language].counted}
          </p>
          <p>
            {c.planning}:{" "}
            <strong>{semesterLabel(settings.planning, language)}</strong>
          </p>
          {degree.additionalEcts > 0 && (
            <p>
              {degree.additionalEcts} ECTS ·{" "}
              {recipeMessages[language].additional}
            </p>
          )}
          {degree.status === "needs_clarification" && (
            <p>{recipeMessages[language].incomplete}</p>
          )}
          {degree.issues.length > 0 && (
            <details>
              <summary>{recipeMessages[language].gaps}</summary>
              <ReviewGaps degree={degree} language={language} />
            </details>
          )}
        </section>
      )}

      {(manual || step === "settings") && (
        <form
          className="setup-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (manual) void persist(settings.programme, settings.target);
            else if (degree)
              void persist(
                degreeProgrammeLabel(degree, language),
                degree.targetEcts,
                degree.selection,
              );
          }}
        >
          <fieldset className="planner-fields" disabled={!ready || busy}>
            {manual && (
              <SemesterField
                label={c.studyStart}
                value={settings.start}
                language={language}
                onChange={(start) => setSettings({ ...settings, start })}
              />
            )}
            <SemesterField
              label={c.planning}
              value={settings.planning}
              language={language}
              onChange={(planning) => setSettings({ ...settings, planning })}
            />
            <label className="setup-history-choice">
              <input
                type="checkbox"
                checked={recordCompleted}
                onChange={(event) => setRecordCompleted(event.target.checked)}
              />
              {
                {
                  en: "I have completed courses to record now",
                  de: "Ich möchte bereits abgeschlossene Kurse jetzt erfassen",
                  fr: "Je souhaite saisir maintenant des cours déjà terminés",
                }[language]
              }
            </label>
            <p className="discovery-help setup-history-help">
              {
                {
                  en: "You can add prior study or transfer credits later. No courses are presumed completed.",
                  de: "Frühere Studienleistungen oder Transferkredite kannst du später ergänzen. Es werden keine abgeschlossenen Kurse angenommen.",
                  fr: "Vous pourrez ajouter des études antérieures ou des crédits transférés plus tard. Aucun cours n’est présumé réussi.",
                }[language]
              }
            </p>
            <details className="setup-options">
              <summary>{setup.optional}</summary>
              <div className="planner-fields">
                <label>
                  {t.planName}
                  <input
                    name="name"
                    required
                    maxLength={200}
                    value={settings.name}
                    onChange={(event) => {
                      setEdited((old) => ({ ...old, name: true }));
                      setSettings({ ...settings, name: event.target.value });
                    }}
                  />
                </label>
                <label>
                  {t.semesterCount}
                  <input
                    type="number"
                    min="1"
                    max="24"
                    required
                    value={settings.count}
                    onChange={(event) => {
                      setEdited((old) => ({ ...old, count: true }));
                      setSettings({
                        ...settings,
                        count: Number(event.target.value),
                      });
                    }}
                  />
                </label>
                {manual && (
                  <>
                    <label>
                      {t.programme}
                      <input
                        required
                        maxLength={200}
                        value={settings.programme}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            programme: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      {t.target}
                      <input
                        required
                        type="number"
                        min="1"
                        max="600"
                        value={settings.target}
                        onChange={(event) =>
                          setSettings({
                            ...settings,
                            target: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </>
                )}
              </div>
            </details>
            {!manual && (
              <Button type="button" onClick={() => setStep("studies")}>
                {setup.back}
              </Button>
            )}
            <Button className="primary setup-submit" type="submit">
              {setup.start}
            </Button>
          </fieldset>
        </form>
      )}

      {step === "studies" && (
        <Button onClick={() => setManual((value) => !value)}>
          {manual ? setup.configuredFallback : setup.manualFallback}
        </Button>
      )}
      <SaveStatus language={language} />
      {rangeError && <p role="alert">{c.rangeError}</p>}
      {error && <p role="alert">{t.actionError}</p>}
      <nav
        className="setup-secondary-links"
        style={{
          display: "flex",
          flexWrap: "wrap",
          columnGap: "1.5rem",
          rowGap: ".75rem",
          marginTop: "1rem",
        }}
        aria-label={
          {
            en: "Other setup options",
            de: "Weitere Optionen",
            fr: "Autres options",
          }[language]
        }
      >
        <Link className="text-link" to="/catalogue">
          {setup.setLater}
        </Link>
        <Link className="text-link" to="/plan">
          {t.import}
        </Link>
      </nav>
    </section>
  );
}
