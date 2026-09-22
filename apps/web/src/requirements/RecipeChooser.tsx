import "./requirements.css";
import ReviewGaps from "./ReviewGaps";
import {
  inheritedStructures,
  majorProgrammes,
  slotOptions,
} from "./recipeOptions";
import { useEffect, useMemo, useState } from "react";
import { recipeRegistry } from "../../../../packages/domain/src/registry";
import {
  composeDegree,
  type SelectedComponent,
  type ResolvedDegree,
} from "../../../../packages/domain/src/recipes";
import { Button } from "../components";
import type { Language } from "../i18n";
import type { Plan } from "../planner/domain";
import { usePlans } from "../planner/context";
import { bindDegreeSelection } from "./adapter";
import { recipeMessages } from "./recipeMessages";
import { SemesterField } from "../planner/SemesterField";

export function DegreeSelectionForm({
  plan,
  language,
  busy = false,
  onCommit,
  onClearEvidence,
  commitLabel,
  compactPreview = false,
  setupMode = false,
}: {
  plan: Plan;
  language: Language;
  busy?: boolean;
  onCommit: (degree: ResolvedDegree) => Promise<boolean>;
  onClearEvidence?: () => Promise<boolean>;
  commitLabel?: string;
  compactPreview?: boolean;
  setupMode?: boolean;
}) {
  const t = recipeMessages[language];
  const original = plan.degreeSelection?.components.find(
    (c) => c.slotId === "major",
  );
  const originalProgramme = recipeRegistry.programmes.find(
    (p) => p.id === original?.programmeId,
  );
  const [degree, setDegree] = useState(originalProgramme?.degree ?? "bachelor");
  const [faculty, setFaculty] = useState(originalProgramme?.faculty ?? "");
  const [search, setSearch] = useState("");
  const [main, setMain] = useState(original?.programmeId ?? "");
  const [variant, setVariant] = useState(original?.variantId ?? "");
  const [structure, setStructure] = useState(
    plan.degreeSelection?.structureId ?? "",
  );
  const [semester, setSemester] = useState(
    original?.startSemester ?? plan.semesters[0],
  );
  const [choices, setChoices] = useState<Record<string, SelectedComponent>>(
    Object.fromEntries(
      plan.degreeSelection?.components.map((c) => [c.slotId, c]) ?? [],
    ),
  );
  const [preview, setPreview] = useState<ResolvedDegree | null>(() => {
    try {
      return plan.degreeSelection
        ? composeDegree(recipeRegistry, plan.degreeSelection)
        : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState("");
  const unavailableEdition =
    plan.degreeSelection?.components.some(
      (component) => component.recipeVersion !== recipeRegistry.edition,
    ) ?? false;
  const [useCurrentEdition, setUseCurrentEdition] = useState(false);
  const [differentStarts, setDifferentStarts] = useState<
    Record<string, boolean>
  >({});

  const major = recipeRegistry.programmes.find((p) => p.id === main);
  const track = major?.variants.find((v) => v.id === variant);
  const structures = useMemo(
    () => (major && track ? inheritedStructures(major, track) : []),
    [major, track],
  );
  const layout = recipeRegistry.structures.find((s) => s.id === structure);
  const programmes = majorProgrammes(degree, faculty).filter((programme) =>
    (programme.titles?.[language] ?? programme.title)
      .toLocaleLowerCase(language)
      .includes(search.trim().toLocaleLowerCase(language)),
  );
  const majorVariants =
    major?.variants.filter((candidate) => candidate.role === "major") ?? [];
  const hasEvidence = plan.scenarios.some(
    (s) =>
      s.requirementEvidence &&
      (s.requirementEvidence.overrides.length ||
        s.requirementEvidence.completedChecklist.length),
  );
  const changed =
    !preview ||
    JSON.stringify(preview.selection) !== JSON.stringify(plan.degreeSelection);
  function invalidate() {
    setPreview(null);
    setError("");
  }
  function resetComponents() {
    setChoices({});
    setStructure("");
    invalidate();
  }
  async function commit() {
    if (!preview) return;
    try {
      if (!(await onCommit(preview))) setError(t.failed);
    } catch (e) {
      setError(`${t.failed} ${e instanceof Error ? e.message : ""}`);
    }
  }
  useEffect(() => {
    const available = majorProgrammes(degree, faculty);
    if (!main && available.length === 1) setMain(available[0].id);
  }, [degree, faculty, main]);
  useEffect(() => {
    const variants =
      major?.variants.filter((candidate) => candidate.role === "major") ?? [];
    if (!variant && variants.length === 1) setVariant(variants[0].id);
  }, [major, variant]);
  useEffect(() => {
    if (!structure && structures.length === 1) setStructure(structures[0]);
  }, [structure, structures]);
  useEffect(() => {
    if (!layout || !major) return;
    const additions: Record<string, SelectedComponent> = {};
    for (const slot of layout.slots.filter(
      (candidate) => candidate.role !== "major" && !candidate.optional,
    )) {
      const options = slotOptions(slot, major);
      if (!choices[slot.id] && options.length === 1)
        additions[slot.id] = {
          slotId: slot.id,
          programmeId: options[0].programme.id,
          variantId: options[0].variant.id,
          startSemester: semester,
          recipeVersion: recipeRegistry.edition,
        };
    }
    if (Object.keys(additions).length)
      setChoices((current) => ({ ...current, ...additions }));
  }, [choices, layout, major, semester]);
  return (
    <section
      id="study-configuration"
      aria-label={t.title}
      className="recipe-chooser"
    >
      <h2>{t.title}</h2>
      {plan.requirements && <p>{t.migration}</p>}
      {unavailableEdition && !useCurrentEdition && (
        <div className="recipe-edition-notice">
          <p role="status">{t.editionUnavailable}</p>
          <Button
            disabled={busy}
            onClick={() => {
              setUseCurrentEdition(true);
              invalidate();
            }}
          >
            {t.reviewCurrentEdition}
          </Button>
        </div>
      )}
      <form
        className="planner-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            if (unavailableEdition && !useCurrentEdition)
              throw new Error(t.editionUnavailable);
            const majorSlot = layout?.slots.find((s) => s.role === "major");
            if (!majorSlot) throw new Error(t.error);
            const selection = {
              structureId: structure,
              components: [
                {
                  slotId: majorSlot.id,
                  programmeId: main,
                  variantId: variant,
                  startSemester: semester,
                  recipeVersion: useCurrentEdition
                    ? recipeRegistry.edition
                    : (original?.recipeVersion ?? recipeRegistry.edition),
                },
                ...Object.values(choices)
                  .filter((c) => c.slotId !== majorSlot.id)
                  .map((component) =>
                    useCurrentEdition
                      ? { ...component, recipeVersion: recipeRegistry.edition }
                      : component,
                  ),
              ],
            };
            const resolved = composeDegree(recipeRegistry, selection);
            setPreview(resolved);
            setError("");
            if (setupMode) {
              if (resolved.status === "prohibited") setError(t.prohibited);
              else if (!(await onCommit(resolved))) setError(t.failed);
            }
          } catch (e) {
            setPreview(null);
            setError(`${t.error} ${e instanceof Error ? e.message : ""}`);
          }
        }}
      >
        <label>
          {t.degree}
          <select
            aria-label={t.degree}
            value={degree}
            disabled={busy}
            onChange={(e) => {
              setDegree(e.target.value as "bachelor" | "master");
              setMain("");
              setVariant("");
              resetComponents();
            }}
          >
            <option value="bachelor">Bachelor</option>
            <option value="master">Master</option>
          </select>
        </label>
        <label>
          {t.search}
          <input
            aria-label={t.search}
            type="search"
            value={search}
            disabled={busy}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          {t.faculty}
          <select
            aria-label={t.faculty}
            value={faculty}
            disabled={busy}
            onChange={(e) => {
              setFaculty(e.target.value);
              setMain("");
              setVariant("");
              resetComponents();
            }}
          >
            <option value="">{t.choose}</option>
            {Object.entries(t.faculties).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.main}
          <select
            aria-label={t.main}
            value={main}
            required
            disabled={busy}
            onChange={(e) => {
              setMain(e.target.value);
              setVariant("");
              resetComponents();
            }}
          >
            <option value="">{t.choose}</option>
            {programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titles?.[language] ?? p.title}
              </option>
            ))}
          </select>
        </label>
        {major && (!setupMode || majorVariants.length > 1) && (
          <label>
            {t.variant}
            <select
              aria-label={t.variant}
              value={variant}
              required
              disabled={busy}
              onChange={(e) => {
                setVariant(e.target.value);
                resetComponents();
              }}
            >
              <option value="">{t.choose}</option>
              {majorVariants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.ects} ECTS
                  {v.id.endsWith("-teaching") ? ` · ${t.teachingTrack}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {setupMode && track && majorVariants.length === 1 && (
          <p className="recipe-choice-summary">
            {t.variant}: {track.ects} ECTS
          </p>
        )}
        {track && (!setupMode || structures.length > 1) && (
          <label>
            {t.structure}
            <select
              aria-label={t.structure}
              value={structure}
              required
              disabled={busy}
              onChange={(e) => {
                setStructure(e.target.value);
                setChoices({});
                invalidate();
              }}
            >
              <option value="">{t.choose}</option>
              {structures.map((id) => {
                const s = recipeRegistry.structures.find((s) => s.id === id)!;
                return (
                  <option key={id} value={id}>
                    {s.slots
                      .map(
                        (slot) =>
                          `${t[slot.role]} ${slot.ects} ECTS${slot.optional ? ` (${t.optional})` : ""}${slot.countsTowardDegree === false ? ` (${t.additional})` : ""}`,
                      )
                      .join(" + ")}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        {setupMode && track && structures.length === 1 && layout && (
          <p className="recipe-choice-summary">
            {t.structure}:{" "}
            {layout.slots
              .map((slot) => `${t[slot.role]} ${slot.ects} ECTS`)
              .join(" + ")}
          </p>
        )}
        <SemesterField
          label={`${t.major} · ${t.semester}`}
          value={semester}
          language={language}
          disabled={busy}
          onChange={(value) => {
            setSemester(value);
            if (setupMode)
              setChoices((current) =>
                Object.fromEntries(
                  Object.entries(current).map(([id, component]) => [
                    id,
                    differentStarts[id]
                      ? component
                      : { ...component, startSemester: value },
                  ]),
                ),
              );
            invalidate();
          }}
        />
        {major &&
          layout?.slots
            .filter((s) => s.role !== "major")
            .map((slot) => {
              const label = `${t[slot.role]} · ${slot.ects} ECTS${layout.slots.filter((s) => s.role === slot.role).length > 1 ? ` · ${slot.id}` : ""}`;
              const selected = choices[slot.id];
              return (
                <fieldset key={slot.id}>
                  <legend>
                    {label} · {slot.optional ? t.optional : t.required}
                    {slot.countsTowardDegree === false
                      ? ` · ${t.additional}`
                      : ""}
                  </legend>
                  <label>
                    {label}
                    <select
                      aria-label={label}
                      value={
                        selected
                          ? `${selected.programmeId}/${selected.variantId}`
                          : ""
                      }
                      required={!slot.optional}
                      disabled={busy}
                      onChange={(e) => {
                        const [programmeId, variantId] =
                          e.target.value.split("/");
                        setChoices((current) => {
                          const next = { ...current };
                          if (!programmeId) delete next[slot.id];
                          else
                            next[slot.id] = {
                              slotId: slot.id,
                              programmeId,
                              variantId,
                              startSemester:
                                current[slot.id]?.startSemester ?? semester,
                              recipeVersion: recipeRegistry.edition,
                            };
                          return next;
                        });
                        invalidate();
                      }}
                    >
                      <option value="">
                        {slot.optional ? t.none : t.choose}
                      </option>
                      {slotOptions(slot, major).map(
                        ({ programme: p, variant: v }) => (
                          <option
                            key={`${p.id}/${v.id}`}
                            value={`${p.id}/${v.id}`}
                          >
                            {p.titles?.[language] ?? p.title} · {v.ects} ECTS
                            {!major.combinationPolicy ||
                            major.combinationPolicy === "unknown"
                              ? ` · ${t.unknown}`
                              : ""}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  {selected && setupMode && (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={!!differentStarts[slot.id]}
                        disabled={busy}
                        onChange={(event) => {
                          setDifferentStarts({
                            ...differentStarts,
                            [slot.id]: event.target.checked,
                          });
                          if (!event.target.checked)
                            setChoices({
                              ...choices,
                              [slot.id]: {
                                ...selected,
                                startSemester: semester,
                              },
                            });
                        }}
                      />
                      {t.differentStart}
                    </label>
                  )}
                  {selected && (!setupMode || differentStarts[slot.id]) && (
                    <SemesterField
                      label={`${label} · ${t.semester}`}
                      value={selected.startSemester}
                      language={language}
                      disabled={busy}
                      onChange={(value) => {
                        setChoices({
                          ...choices,
                          [slot.id]: { ...selected, startSemester: value },
                        });
                        invalidate();
                      }}
                    />
                  )}
                </fieldset>
              );
            })}
        <Button
          type="submit"
          disabled={
            busy || !layout || (unavailableEdition && !useCurrentEdition)
          }
        >
          {setupMode ? (commitLabel ?? t.save) : t.preview}
        </Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {preview && !setupMode && (
        <section aria-label={t.preview}>
          <h3>{t.preview}</h3>
          <p>
            {t.counted}: {preview.targetEcts} ECTS
          </p>
          {(!compactPreview || preview.additionalEcts > 0) && (
            <p>
              {t.additional}: {preview.additionalEcts} ECTS
            </p>
          )}
          {preview.status === "prohibited" ? (
            <p role="alert">{t.prohibited}</p>
          ) : (
            preview.status === "needs_clarification" && <p>{t.incomplete}</p>
          )}
          <details open={!compactPreview}>
            <summary>{t.pinned}</summary>
            <ul>
              {preview.selection.components.map((c) => {
                const p = recipeRegistry.programmes.find(
                  (p) => p.id === c.programmeId,
                )!;
                return (
                  <li key={c.slotId}>
                    {p.titles?.[language] ?? p.title} · {c.variantId} ·{" "}
                    {c.startSemester} · {c.recipeVersion}
                  </li>
                );
              })}
            </ul>
          </details>
          {preview.appliedRules.length > 0 && (
            <>
              <h4>{t.rules}</h4>
              <ul>
                {preview.appliedRules.map((id) => (
                  <li key={id}>
                    {recipeRegistry.combinationRules.find((r) => r.id === id)
                      ?.explanation ?? id}
                  </li>
                ))}
              </ul>
            </>
          )}
          {preview.issues.length > 0 &&
            (compactPreview ? (
              <details>
                <summary>{t.gaps}</summary>
                <ReviewGaps degree={preview} language={language} />
              </details>
            ) : (
              <ReviewGaps degree={preview} language={language} />
            ))}
          <details>
            <summary>{t.sources}</summary>
            <ul>
              {[
                ...new Set(
                  preview.selection.components.flatMap(
                    (c) =>
                      recipeRegistry.programmes.find(
                        (p) => p.id === c.programmeId,
                      )?.sourceIds ?? [],
                  ),
                ),
              ].map((id) => {
                const source = recipeRegistry.sources.find((s) => s.id === id);
                return source ? (
                  <li key={id}>
                    <a href={source.url}>{source.title}</a>
                  </li>
                ) : null;
              })}
            </ul>
          </details>
          {hasEvidence && changed && (
            <>
              <p>{t.evidence}</p>
              <Button
                disabled={busy}
                onClick={async () => {
                  if (!(await onClearEvidence?.())) setError(t.failed);
                }}
              >
                {t.clear}
              </Button>
            </>
          )}
          <Button
            disabled={
              busy ||
              preview.status === "prohibited" ||
              (hasEvidence && changed)
            }
            onClick={() => void commit()}
          >
            {commitLabel ?? t.save}
          </Button>
        </section>
      )}
    </section>
  );
}

export default function RecipeChooser({
  plan,
  language,
}: {
  plan: Plan;
  language: Language;
}) {
  const { busy, save } = usePlans();
  return (
    <DegreeSelectionForm
      plan={plan}
      language={language}
      busy={busy}
      onCommit={(degree) => save(bindDegreeSelection(plan, degree.selection))}
      onClearEvidence={() =>
        save({
          ...plan,
          scenarios: plan.scenarios.map((scenario) => ({
            ...scenario,
            requirementEvidence: { overrides: [], completedChecklist: [] },
          })),
        })
      }
    />
  );
}
