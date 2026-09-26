import "./requirements.css";
import ReviewGaps from "./ReviewGaps";
import {
  inheritedStructures,
  majorProgrammes,
  searchProgrammes,
  slotOptions,
} from "./recipeOptions";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  recipeRegistry,
  recipeRegistryForSelection,
} from "../../../../packages/domain/src/registry";
import {
  composeDegree,
  programmeTitle,
  type ProgrammeRecipe,
  type SelectedComponent,
  type ResolvedDegree,
} from "../../../../packages/domain/src/recipes";
import { Button } from "../components";
import type { Language } from "../i18n";
import type { Plan } from "../planner/domain";
import { usePlans } from "../planner/context";
import { countLabel } from "../planner/countLabels";
import { bindDegreeSelection } from "./adapter";
import { recipeMessages } from "./recipeMessages";
import { SemesterField } from "../planner/SemesterField";

type FacultyKey = keyof typeof recipeMessages.en.faculties;
/** Faculty names in every language; the search falls back to them when no name matches. */
const facultyNames = (programme: ProgrammeRecipe) =>
  (["de", "fr", "en"] as const).map(
    (language) =>
      recipeMessages[language].faculties[programme.faculty as FacultyKey] ?? "",
  );
/** Quick picks show at most this many matches; longer lists stay in the select. */
const quickPickLimit = 8;

export function DegreeSelectionForm({
  plan,
  language,
  busy = false,
  onCommit,
  onClearEvidence,
  commitLabel,
  compactPreview = false,
  setupMode = false,
  startSemester,
  onStartSemesterChange,
}: {
  plan: Plan;
  language: Language;
  busy?: boolean;
  onCommit: (degree: ResolvedDegree) => Promise<boolean>;
  onClearEvidence?: () => Promise<boolean>;
  commitLabel?: string;
  compactPreview?: boolean;
  setupMode?: boolean;
  startSemester?: string;
  onStartSemesterChange?: (semester: string) => void;
}) {
  const t = recipeMessages[language];
  const [useCurrentEdition, setUseCurrentEdition] = useState(false);
  const retainedRegistry = useMemo(() => {
    try {
      return plan.degreeSelection
        ? recipeRegistryForSelection(plan.degreeSelection)
        : recipeRegistry;
    } catch {
      return null;
    }
  }, [plan.degreeSelection]);
  const registry = useCurrentEdition
    ? recipeRegistry
    : (retainedRegistry ?? recipeRegistry);
  const unavailableEdition = retainedRegistry === null;
  const olderEdition =
    retainedRegistry !== null &&
    retainedRegistry.edition !== recipeRegistry.edition;
  const original = plan.degreeSelection?.components.find(
    (c) => c.slotId === "major",
  );
  const originalProgramme = registry.programmes.find(
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
  const [localSemester, setSemester] = useState(
    original?.startSemester ?? plan.semesters[0],
  );
  const semester = startSemester ?? localSemester;
  const [choices, setChoices] = useState<Record<string, SelectedComponent>>(
    Object.fromEntries(
      plan.degreeSelection?.components.map((c) => [c.slotId, c]) ?? [],
    ),
  );
  const [preview, setPreview] = useState<ResolvedDegree | null>(() => {
    try {
      return plan.degreeSelection
        ? composeDegree(registry, plan.degreeSelection)
        : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState("");
  const [differentStarts, setDifferentStarts] = useState<
    Record<string, boolean>
  >({});
  const statusId = useId();
  const searchField = useRef<HTMLInputElement>(null);
  const mainField = useRef<HTMLSelectElement>(null);
  const quickPicks = useRef<HTMLUListElement>(null);

  const major = registry.programmes.find((p) => p.id === main);
  const track = major?.variants.find((v) => v.id === variant);
  const structures = useMemo(
    () => (major && track ? inheritedStructures(major, track, registry) : []),
    [major, track, registry],
  );
  const layout = registry.structures.find((s) => s.id === structure);
  const available = useMemo(
    () => majorProgrammes(degree, faculty, registry),
    [degree, faculty, registry],
  );
  const query = search.trim();
  const matches = useMemo(
    () => searchProgrammes(available, search, facultyNames),
    [available, search],
  );
  // The chosen programme stays listed, so the select never shows "Choose…" while one is set.
  const options = useMemo(
    () =>
      major && available.includes(major) && !matches.includes(major)
        ? [major, ...matches]
        : matches,
    [available, major, matches],
  );
  const elsewhere = useMemo(
    () =>
      !!faculty &&
      !!query &&
      searchProgrammes(
        majorProgrammes(degree, "", registry),
        search,
        facultyNames,
      ).some((p) => !matches.includes(p)),
    [degree, faculty, matches, query, registry, search],
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
  function chooseMain(id: string) {
    // Choosing the current programme again keeps its structure and minors.
    if (busy || id === main) return;
    setMain(id);
    setVariant("");
    resetComponents();
  }
  function pickDetail(programme: ProgrammeRecipe) {
    const title = programmeTitle(programme, language);
    const twin = matches.some(
      (other) =>
        other !== programme &&
        other.faculty === programme.faculty &&
        programmeTitle(other, language) === title,
    );
    // A few master programmes share name and faculty; the official slug tells them apart.
    const slug = programme.id.slice(programme.id.lastIndexOf("-") + 1);
    return `${t.faculties[programme.faculty as FacultyKey] ?? programme.faculty}${twin ? ` · ${slug}` : ""}`;
  }
  async function commit() {
    if (!preview) return;
    try {
      if (!(await onCommit(preview))) setError(t.failed);
    } catch (e) {
      setError(`${t.failed} ${e instanceof Error ? e.message : ""}`);
    }
  }
  // Only a sole programme for degree and faculty is chosen automatically; a search never
  // chooses, because a prefix such as "inf" can match just the wrong programme.
  useEffect(() => {
    if (!main && available.length === 1) setMain(available[0].id);
  }, [available, main]);
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
      const options = slotOptions(slot, major, registry);
      if (!choices[slot.id] && options.length === 1)
        additions[slot.id] = {
          slotId: slot.id,
          programmeId: options[0].programme.id,
          variantId: options[0].variant.id,
          startSemester: semester,
          recipeVersion: registry.edition,
        };
    }
    if (Object.keys(additions).length)
      setChoices((current) => ({ ...current, ...additions }));
  }, [choices, layout, major, semester, registry]);
  return (
    <section
      id="study-configuration"
      aria-label={t.title}
      className="recipe-chooser"
    >
      <h2>{t.title}</h2>
      {plan.requirements && <p>{t.migration}</p>}
      {(unavailableEdition || olderEdition) && !useCurrentEdition && (
        <div className="recipe-edition-notice">
          <p role="status">
            {unavailableEdition ? t.editionUnavailable : t.retainedEdition}
          </p>
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
                    ? registry.edition
                    : (original?.recipeVersion ?? registry.edition),
                },
                ...Object.values(choices)
                  .filter((c) => c.slotId !== majorSlot.id)
                  .map((component) =>
                    useCurrentEdition
                      ? { ...component, recipeVersion: registry.edition }
                      : component,
                  ),
              ],
            };
            const resolved = composeDegree(registry, selection);
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
        <div className="recipe-programme-picker">
          <div className="recipe-programme-search">
            <label>
              {t.search}
              {/* Typing never saves, so the search stays usable while plans refresh. */}
              <input
                ref={searchField}
                aria-label={t.search}
                aria-describedby={statusId}
                type="search"
                value={search}
                placeholder={t.searchPlaceholder}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.nativeEvent.isComposing)
                    return;
                  // Enter chooses from the results; it never submits the whole step.
                  event.preventDefault();
                  if (matches.length === 1) chooseMain(matches[0].id);
                  else if (query && matches.length)
                    (
                      quickPicks.current?.querySelector("button") ??
                      mainField.current
                    )?.focus();
                }}
              />
            </label>
            <p id={statusId} className="recipe-search-status" role="status">
              {!query
                ? ""
                : matches.length
                  ? `${matches.length} ${countLabel(language, "programme", matches.length)}`
                  : t.noProgrammeMatch}
            </p>
            {elsewhere && (
              <Button
                type="button"
                className="recipe-search-wider"
                onClick={() => {
                  // Clearing the filter keeps the chosen programme: it is in every faculty list.
                  setFaculty("");
                  searchField.current?.focus();
                }}
              >
                {t.searchAllFaculties}
              </Button>
            )}
          </div>
          <label>
            {t.main}
            <select
              ref={mainField}
              aria-label={t.main}
              value={main}
              required
              disabled={busy}
              onChange={(e) => chooseMain(e.target.value)}
            >
              <option value="">{t.choose}</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {programmeTitle(p, language)}
                </option>
              ))}
            </select>
          </label>
          {query && matches.length > 0 && matches.length <= quickPickLimit && (
            <ul
              ref={quickPicks}
              className="recipe-search-results"
              aria-label={t.searchResults}
            >
              {matches.map((p) => (
                <li key={p.id}>
                  <Button
                    type="button"
                    aria-pressed={p.id === main}
                    disabled={busy}
                    onClick={() => chooseMain(p.id)}
                  >
                    <span>
                      {programmeTitle(p, language)}
                      <span className="recipe-search-detail">
                        {` · ${pickDetail(p)}`}
                      </span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
                const s = registry.structures.find((s) => s.id === id)!;
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
              .map(
                (slot) =>
                  `${slot.optional ? `${t.optional} ` : ""}${t[slot.role]} ${slot.ects} ECTS`,
              )
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
            onStartSemesterChange?.(value);
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
        {setupMode && (
          <p className="recipe-choice-summary recipe-start-help">
            {
              {
                en: "Start of this UniFr programme. If you transferred, record earlier studies separately as completed history when you know them.",
                de: "Beginn dieses UniFr-Studiengangs. Frühere Studienleistungen nach einem Wechsel kannst du separat als Studienverlauf erfassen.",
                fr: "Début de ce cursus à l’UniFr. En cas de transfert, saisissez séparément les études antérieures dans votre historique.",
              }[language]
            }
          </p>
        )}
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
                              recipeVersion: registry.edition,
                            };
                          return next;
                        });
                        invalidate();
                      }}
                    >
                      <option value="">
                        {slot.optional ? t.none : t.choose}
                      </option>
                      {slotOptions(slot, major, registry).map(
                        ({ programme: p, variant: v }) => (
                          <option
                            key={`${p.id}/${v.id}`}
                            value={`${p.id}/${v.id}`}
                          >
                            {programmeTitle(p, language)} · {v.ects} ECTS
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
                const p = registry.programmes.find(
                  (p) => p.id === c.programmeId,
                )!;
                return (
                  <li key={c.slotId}>
                    {programmeTitle(p, language)} · {c.variantId} ·{" "}
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
                    {registry.combinationRules.find((r) => r.id === id)
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
                      registry.programmes.find((p) => p.id === c.programmeId)
                        ?.sourceIds ?? [],
                  ),
                ),
              ].map((id) => {
                const source = registry.sources.find((s) => s.id === id);
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
