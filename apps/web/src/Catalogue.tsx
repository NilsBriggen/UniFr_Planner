import { semesterLabel } from "./planner/SemesterField";
import { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  api,
  type CatalogueStatus,
  type Course,
  type CoursePage,
  type Filters,
  type Meeting,
  type Offering,
  type Terms,
} from "./api/client";
import { Button, StatusNotice } from "./components";
import { catalogueMessages, type CatalogueMessages } from "./catalogue-i18n";
import { messages, type Language } from "./i18n";
import "./catalogue.css";
import {
  hasStudyConfiguration,
  studyLabel,
} from "./requirements/study-summary";
import CoursePlanner from "./planner/CoursePlanner";
import { usePlans } from "./planner/context";
import {
  planningSemester,
  currentSemester,
  semesterIndex,
} from "./planner/domain";
import { catchupMessages } from "./planner/catchup-messages";
import { useDiscovery, useDiscoveryIndex } from "./discovery/useDiscovery";
import { filterDiscovery, offeringKey } from "./discovery/presentation";
import { discoveryMessages } from "./discovery/messages";
import { OfferingAdvice } from "./discovery/LessonPreview";
import SemesterSummary from "./discovery/SemesterSummary";
import "./discovery/discovery.css";

const source = "https://www.unifr.ch/timetable/en/";
const filterKeys = [
  "q",
  "term",
  "faculty",
  "language",
  "level",
  "ects_min",
  "ects_max",
  "available_day",
  "available_from",
  "available_until",
] as const;
type LoadState = {
  loading: boolean;
  status?: CatalogueStatus;
  page?: CoursePage;
  course?: Course;
  terms?: Terms;
  error?: "transport" | "missing" | "invalid";
};
type FilterField =
  | "ects_min"
  | "ects_max"
  | "available_day"
  | "available_from"
  | "available_until";
type FilterIssue = {
  kind:
    | "ectsOrder"
    | "availabilityIncomplete"
    | "availabilityOrder"
    | "invalid";
  fields: FilterField[];
};

function validateFilterQuery(query: URLSearchParams): FilterIssue | undefined {
  const minimum = query.get("ects_min");
  const maximum = query.get("ects_max");
  if (minimum !== null && maximum !== null && Number(minimum) > Number(maximum))
    return { kind: "ectsOrder", fields: ["ects_min", "ects_max"] };

  const availability = [
    "available_day",
    "available_from",
    "available_until",
  ] as const;
  const selected = availability.filter((field) => query.has(field));
  if (selected.length > 0 && selected.length < availability.length)
    return { kind: "availabilityIncomplete", fields: [...availability] };
  if (
    selected.length === availability.length &&
    query.get("available_from")! >= query.get("available_until")!
  )
    return {
      kind: "availabilityOrder",
      fields: ["available_from", "available_until"],
    };
  return undefined;
}

function localizedTitle(course: Course, language: Language) {
  return (
    course.titles[language] ??
    course.titles.en ??
    Object.values(course.titles)[0] ??
    course.code
  );
}

function Provenance({
  status,
  language,
}: {
  status: CatalogueStatus;
  language: Language;
}) {
  const t = catalogueMessages[language];
  const warning = status.development_fixture
    ? t.fixture
    : status.latest_sync_outcome?.startsWith("rejected")
      ? t.rejected
      : status.stale
        ? t.stale
        : null;
  return (
    <div className="catalogue-provenance">
      <details className="source-details">
        <summary className={warning ? "snapshot-age stale" : "snapshot-age"}>
          {warning && <strong>{warning} · </strong>}
          {status.published_at ? (
            <>
              {t.updated}:{" "}
              {new Date(status.published_at).toLocaleDateString(language, {
                timeZone: "Europe/Zurich",
              })}
            </>
          ) : (
            t.sourceState
          )}
        </summary>
        {status.published_at && (
          <p>
            {new Date(status.published_at).toLocaleString(language, {
              timeZone: "Europe/Zurich",
            })}{" "}
            · {t.age}: {Math.floor((status.age_seconds ?? 0) / 86400)} {t.days}
          </p>
        )}
        {warning && (
          <p>
            {status.development_fixture
              ? t.fixtureBody
              : status.latest_sync_outcome?.startsWith("rejected")
                ? t.rejectedBody
                : t.staleBody}
          </p>
        )}
        <a className="text-link" href={source}>
          {t.catalogueSource} ↗
        </a>
      </details>
    </div>
  );
}

function MeetingList({
  offering,
  language,
}: {
  offering: Offering;
  language: Language;
}) {
  const t = catalogueMessages[language];
  const stamp = (value: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Zurich",
    }).format(new Date(value));
  return (
    <>
      <p className="timezone">Europe/Zurich</p>
      {offering.meeting_state === "unresolved" && (
        <StatusNotice>
          <h3>{t.unresolved}</h3>
          <p>{t.unresolvedBody}</p>
        </StatusNotice>
      )}
      <ul className="meeting-list">
        {offering.meetings.map((meeting: Meeting, index: number) => (
          <li key={index}>
            {meeting.cancelled && <strong>{t.cancelled} · </strong>}
            {meeting.starts_at && meeting.ends_at ? (
              <>
                <time dateTime={meeting.starts_at}>
                  {stamp(meeting.starts_at)}
                </time>{" "}
                –{" "}
                <time dateTime={meeting.ends_at}>{stamp(meeting.ends_at)}</time>
              </>
            ) : (
              <strong>{t.unknown}</strong>
            )}
            {meeting.location && (
              <span className="meeting-location">{meeting.location}</span>
            )}
            {meeting.note && <p>{meeting.note}</p>}
            {meeting.recurrence && (
              <p>
                {t.recurrence}: {meeting.recurrence}
              </p>
            )}
            {meeting.excluded_dates?.length ||
            meeting.additional_dates?.length ||
            meeting.recurrence_id ? (
              <>
                <p>{t.sourceExceptions}</p>
                <dl className="source-exceptions">
                  {(
                    [
                      [t.excludedDates, meeting.excluded_dates ?? []],
                      [t.additionalDates, meeting.additional_dates ?? []],
                      [
                        t.replacedOccurrence,
                        meeting.recurrence_id ? [meeting.recurrence_id] : [],
                      ],
                    ] as const
                  ).map(
                    ([label, values]) =>
                      values.length > 0 && (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>
                            <ul>
                              {values.map((value, ordinal) => (
                                <li key={ordinal}>
                                  <time dateTime={value}>{value}</time>
                                </li>
                              ))}
                            </ul>
                          </dd>
                        </div>
                      ),
                  )}
                </dl>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

function SchedulePreview({
  offering,
  title,
  language,
}: {
  offering: Offering;
  title: string;
  language: Language;
}) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const t = catalogueMessages[language];
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const opener = trigger.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    close.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open]);
  return (
    <>
      <button className="button" ref={trigger} onClick={() => setOpen(true)}>
        {t.preview}
      </button>
      {open && (
        <dialog
          ref={dialog}
          aria-labelledby={`preview-${offering.source_id}`}
          className="schedule-dialog"
          onKeyDown={(event) => {
            // This read-only preview has one interactive control. Keep Tab inside it
            // rather than allowing the browser's chrome to receive focus.
            if (event.key === "Tab") {
              event.preventDefault();
              close.current?.focus();
            }
          }}
          onCancel={(event) => {
            event.preventDefault();
            setOpen(false);
          }}
        >
          <div className="dialog-heading">
            <h2 id={`preview-${offering.source_id}`}>
              {t.preview} · {title}
            </h2>
            <button
              className="button"
              ref={close}
              onClick={() => setOpen(false)}
            >
              {t.close}
            </button>
          </div>
          <MeetingList offering={offering} language={language} />
        </dialog>
      )}
    </>
  );
}

function Detail({
  course,
  language,
  query,
  status,
}: {
  course: Course;
  language: Language;
  query: string;
  status: CatalogueStatus;
}) {
  const t = catalogueMessages[language];
  const location = useLocation();
  const title = localizedTitle(course, language);
  return (
    <>
      <Link
        className="text-link"
        to={`/catalogue${query ? `?${query}` : ""}`}
        state={location.state}
      >
        {t.back}
      </Link>
      {course.offerings.map((offering) => (
        <article className="course-detail" key={offering.source_id}>
          <h2>{offering.terms.join(" · ")}</h2>
          <dl className="course-metadata">
            {(
              [
                ["ECTS", offering.ects ?? t.unknown],
                [t.faculty, offering.faculty_domain || t.unknown],
                [t.language, offering.languages.join(" · ") || t.unknown],
                [t.level, offering.levels?.join(" · ") || t.unknown],
                [t.lecturer, offering.lecturer || t.unknown],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="actions">
            <CoursePlanner
              offering={offering}
              status={status}
              language={language}
              preferredTerm={new URLSearchParams(query).get("term")}
            />
            {offering.source_url.startsWith(source) && (
              <a className="text-link" href={offering.source_url}>
                {t.source} ↗
              </a>
            )}
            {offering.calendar_url?.startsWith(source) && (
              <a className="text-link" href={offering.calendar_url}>
                {t.calendar} ↗
              </a>
            )}
            <SchedulePreview
              offering={offering}
              title={title}
              language={language}
            />
          </div>
          <h3 className="schedule-heading">{t.schedule}</h3>
          {offering.schedule_summary && (
            <p className="source-text">{offering.schedule_summary}</p>
          )}
          {offering.recurrence_summary && (
            <p className="source-text">{offering.recurrence_summary}</p>
          )}
          <MeetingList offering={offering} language={language} />
          {(
            [
              [t.assessment, offering.assessment],
              [t.prerequisites, offering.prerequisites],
              [t.equivalents, offering.equivalents],
            ] as const
          ).map(([label, value]) => (
            <section key={label}>
              <h3>{label}</h3>
              <p className="source-text">{value || t.unknown}</p>
            </section>
          ))}
          {offering.assignments.length > 0 && (
            <section>
              <h3>{t.assignments}</h3>
              <ul>
                {offering.assignments.map((assignment, index) => (
                  <li key={index}>
                    {assignment.programme} · {assignment.version}
                    <p>{assignment.paths.join(" · ")}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      ))}
    </>
  );
}

function Search({
  page: serverPage,
  terms,
  query,
  language,
  invalid,
  change,
  loading,
}: {
  loading: boolean;
  page?: CoursePage;
  terms: Terms;
  query: URLSearchParams;
  language: Language;
  invalid: boolean;
  change: (query: URLSearchParams) => void;
}) {
  const t = catalogueMessages[language];
  const d = discoveryMessages[language];
  const { plan } = usePlans();
  const term = plan?.semesters.includes(query.get("term") ?? "")
    ? query.get("term")!
    : plan
      ? planningSemester(plan)
      : (query.get("term") ?? "");
  const indexFilters = {
    ...(Object.fromEntries(
      [...query].filter(([key]) =>
        filterKeys.includes(key as (typeof filterKeys)[number]),
      ),
    ) as Filters),
    term: query.get("term") ?? "",
  };
  const index = useDiscoveryIndex(
    indexFilters,
    !!plan && !!indexFilters.term && !invalid,
  );
  const assessed = useDiscovery(plan, index.catalogue, term, language);
  const discovery = assessed.discovery;
  const findingMatches = index.loading || assessed.loading;
  const hasMatches =
    discovery && [...discovery.assessments.values()].some((a) => a.recommended);
  const programme =
    !!plan && hasStudyConfiguration(plan) && query.get("focus") !== "all";
  const fits = query.get("fits") === "1",
    hideAdded = query.get("hide_added") === "1";
  const filtered = discovery
    ? filterDiscovery(discovery, { programme, fits, hideAdded })
    : null;
  const offset = filtered
    ? Math.min(
        Math.max(0, Number(query.get("offset")) || 0),
        Math.max(0, Math.floor((filtered.length - 1) / 20) * 20),
      )
    : 0;
  const page =
    filtered && index.catalogue
      ? {
          status: index.catalogue.status,
          items: filtered.slice(offset, offset + 20),
          offset,
          limit: 20,
          total: filtered.length,
        }
      : serverPage;
  const hasPage = !!page;
  useEffect(() => {
    if (loading || findingMatches || !hasPage) return;
    const key = `unifr.catalogueScroll:${query}`;
    let value: string | null;
    try {
      value = sessionStorage.getItem(key);
    } catch {
      return;
    }
    if (value === null || !Number.isFinite(Number(value))) return;
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, Math.max(0, Number(value)));
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* Optional presentation state. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, findingMatches, hasPage, query]);
  const updateChoice = (key: string, value: string) => {
    const next = new URLSearchParams(query);
    next.set(key, value);
    next.delete("offset");
    change(next);
  };
  const [clientIssue, setClientIssue] = useState<FilterIssue>();
  const formRef = useRef<HTMLFormElement>(null);
  const pendingFocus = useRef<FilterField | undefined>(undefined);
  const [expanded, setExpanded] = useState(invalid);
  const issue =
    clientIssue ??
    (invalid
      ? (validateFilterQuery(query) ?? { kind: "invalid", fields: [] })
      : undefined);
  const errorAttributes = (field: FilterField) =>
    issue?.fields.includes(field)
      ? ({
          "aria-invalid": true,
          "aria-describedby": "catalogue-filter-error",
        } as const)
      : {};
  const labels: Record<(typeof filterKeys)[number], string> = {
    q: t.search,
    term: t.term,
    faculty: t.faculty,
    language: t.language,
    level: t.level,
    ects_min: t.minimum,
    ects_max: t.maximum,
    available_day: t.day,
    available_from: t.from,
    available_until: t.until,
  };
  const select = (
    key: "term" | "faculty" | "language" | "level",
    values: string[],
  ) => (
    <label key={key}>
      {labels[key]}
      <select name={key} defaultValue={query.get(key) ?? ""}>
        <option value="">{t.all}</option>
        {[
          ...new Set([...values, ...(query.has(key) ? [query.get(key)!] : [])]),
        ].map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </label>
  );
  const remove = (key: string) => {
    const next = new URLSearchParams(query);
    if (key.startsWith("available_"))
      ["available_day", "available_from", "available_until"].forEach((name) =>
        next.delete(name),
      );
    else next.delete(key);
    if (key === "term" && plan) next.set("scope", "all");
    next.delete("offset");
    change(next);
  };
  useEffect(() => {
    const field = pendingFocus.current;
    if (!field || !expanded || !clientIssue) return;
    const first = formRef.current?.elements.namedItem(field);
    if (first instanceof HTMLElement) first.focus();
    pendingFocus.current = undefined;
  }, [clientIssue, expanded]);
  return (
    <div className={plan ? "discovery-workspace" : undefined}>
      <div>
        {plan && (
          <div className="discovery-semester">
            <label>
              {d.semester}
              <select
                aria-label={d.semester}
                value={term}
                onChange={(e) => updateChoice("term", e.target.value)}
              >
                {plan.semesters.map((value) => (
                  <option key={value} value={value}>
                    {semesterLabel(value, language)}
                  </option>
                ))}
              </select>
            </label>
            <p className="discovery-help">
              <strong>{studyLabel(plan, language)}</strong>
              <br />
              {query.get("term") === term
                ? hasStudyConfiguration(plan)
                  ? d.automatic
                  : d.manualSemester
                : d.allTerms}
              {semesterIndex(term) < semesterIndex(currentSemester()) && (
                <>
                  <br />
                  <Link
                    className="text-link"
                    to={`/plan/completed?term=${encodeURIComponent(term)}`}
                  >
                    {catchupMessages[language].title}
                  </Link>
                </>
              )}
            </p>
          </div>
        )}
        {plan && (
          <p className="catalogue-degree">
            <Link
              className="text-link"
              to="/requirements"
              aria-label={`${d.viewRequirements}: ${studyLabel(plan, language)}`}
            >
              {studyLabel(plan, language)} <span aria-hidden="true">↗</span>
            </Link>
          </p>
        )}
        <form
          ref={formRef}
          key={query.toString()}
          className="catalogue-search"
          onSubmit={(event) => {
            event.preventDefault();
            const next = new URLSearchParams();
            new FormData(event.currentTarget).forEach((value, key) => {
              if (String(value).trim()) next.set(key, String(value).trim());
            });
            for (const key of ["focus", "fits", "hide_added"])
              if (query.has(key)) next.set(key, query.get(key)!);
            if (plan && !next.has("term")) next.set("scope", "all");
            const nextIssue = validateFilterQuery(next);
            if (nextIssue) {
              pendingFocus.current = nextIssue.fields[0];
              setClientIssue(nextIssue);
              setExpanded(true);
              return;
            }
            pendingFocus.current = undefined;
            setClientIssue(undefined);
            change(next);
          }}
        >
          <div className="search-bar">
            <label>
              {t.search}
              <input
                name="q"
                type="search"
                defaultValue={query.get("q") ?? ""}
                maxLength={200}
              />
            </label>
            <Button className="primary" type="submit">
              {t.submit}
            </Button>
            <Button
              type="button"
              aria-expanded={expanded}
              aria-controls="catalogue-filters"
              onClick={() => setExpanded(!expanded)}
            >
              {t.filters}
            </Button>
          </div>
          {issue && (
            <p
              className="filter-error"
              id="catalogue-filter-error"
              role="alert"
            >
              {t[issue.kind]}
            </p>
          )}
          <div id="catalogue-filters" hidden={!expanded}>
            <div className="filter-grid">
              {select("term", terms.terms)}
              {select("faculty", terms.faculties)}
              {select("language", terms.languages)}
              {select("level", terms.levels)}
              <label>
                {t.minimum}
                <input
                  name="ects_min"
                  type="number"
                  min="0"
                  max="180"
                  step="0.5"
                  defaultValue={query.get("ects_min") ?? ""}
                  {...errorAttributes("ects_min")}
                />
              </label>
              <label>
                {t.maximum}
                <input
                  name="ects_max"
                  type="number"
                  min="0"
                  max="180"
                  step="0.5"
                  defaultValue={query.get("ects_max") ?? ""}
                  {...errorAttributes("ects_max")}
                />
              </label>
            </div>
            <fieldset>
              <legend>{t.availability}</legend>
              <p>{t.windowHelp}</p>
              <div className="filter-grid">
                <label>
                  {t.day}
                  <select
                    name="available_day"
                    defaultValue={query.get("available_day") ?? ""}
                    {...errorAttributes("available_day")}
                  >
                    <option value="">{t.all}</option>
                    {t.weekdays.map((day, index) => (
                      <option key={index} value={index}>
                        {day}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t.from}
                  <input
                    name="available_from"
                    type="time"
                    defaultValue={query.get("available_from") ?? ""}
                    {...errorAttributes("available_from")}
                  />
                </label>
                <label>
                  {t.until}
                  <input
                    name="available_until"
                    type="time"
                    defaultValue={query.get("available_until") ?? ""}
                    {...errorAttributes("available_until")}
                  />
                </label>
              </div>
            </fieldset>
          </div>
        </form>
        <div className="filter-chips" role="group" aria-label={t.selection}>
          {filterKeys
            .filter((key) => query.has(key))
            .map((key) => (
              <Button
                key={key}
                onClick={() => remove(key)}
                aria-label={`${t.remove}: ${labels[key]} · ${key === "available_day" ? t.weekdays[Number(query.get(key))] : query.get(key)}`}
              >
                <span>
                  {labels[key]}:{" "}
                  {key === "available_day"
                    ? t.weekdays[Number(query.get(key))]
                    : query.get(key)}
                </span>
                <span aria-hidden="true">×</span>
              </Button>
            ))}
        </div>
        {findingMatches && (
          <p role="status">
            {
              {
                en: "Finding programme matches and checking lesson times…",
                de: "Passende Kurse und Unterrichtszeiten werden geprüft…",
                fr: "Recherche des cours et vérification des horaires…",
              }[language]
            }
          </p>
        )}
        {(index.error || assessed.error) && (
          <p role="status">
            {
              {
                en: "Programme matches could not be loaded. You can still browse courses below.",
                de: "Passende Kurse konnten nicht ermittelt werden. Der Katalog ist weiterhin nutzbar.",
                fr: "Les cours recommandés n’ont pas pu être chargés. Vous pouvez parcourir le catalogue ci-dessous.",
              }[language]
            }
          </p>
        )}
        {discovery && (
          <>
            <div className="discovery-controls" aria-label={d.heading}>
              {discovery.hasProgramme && (
                <Button
                  aria-pressed={programme}
                  onClick={() => updateChoice("focus", "programme")}
                >
                  {d.recommended}
                </Button>
              )}
              <Button
                aria-pressed={!programme}
                onClick={() => updateChoice("focus", "all")}
              >
                {d.all}
              </Button>
              <div className="discovery-toggles">
                <label>
                  <input
                    type="checkbox"
                    checked={fits}
                    onChange={(e) =>
                      updateChoice("fits", e.target.checked ? "1" : "0")
                    }
                  />
                  {d.fitsOnly}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={hideAdded}
                    onChange={(e) =>
                      updateChoice("hide_added", e.target.checked ? "1" : "0")
                    }
                  />
                  {d.hideAdded}
                </label>
              </div>
            </div>
            {discovery.hasProgramme && !hasMatches && !programme && (
              <p className="discovery-help">
                {d.noMatches}{" "}
                <Link className="text-link" to="/requirements">
                  {d.viewRequirements}
                </Link>
              </p>
            )}
            {discovery.requirementError && (
              <p role="alert">{d.requirementsError}</p>
            )}
          </>
        )}
        {page && (
          <>
            <p className="result-count" role="status">
              {page.total} {t.results}
            </p>
            {page.total === 0 && !findingMatches && !loading ? (
              <StatusNotice>
                <h2>{t.none}</h2>
                <p>
                  {discovery ? (programme ? d.noMatches : d.empty) : t.noneBody}
                </p>
                {programme && (
                  <p>
                    <Link className="text-link" to="/requirements">
                      {d.viewRequirements}
                    </Link>
                  </p>
                )}
                {discovery && (
                  <Button
                    onClick={() => {
                      const next = new URLSearchParams(query);
                      next.set("focus", "all");
                      next.delete("fits");
                      next.delete("hide_added");
                      next.delete("offset");
                      change(next);
                    }}
                  >
                    {d.broaden}
                  </Button>
                )}
              </StatusNotice>
            ) : (
              <ul className="course-results" aria-label={t.results}>
                {page.items.map((course) => (
                  <li key={course.code}>
                    <h2>
                      <Link
                        to={`/catalogue/${encodeURIComponent(course.code)}?${query}`}
                        onClick={() => {
                          try {
                            sessionStorage.setItem(
                              `unifr.catalogueScroll:${query}`,
                              String(window.scrollY),
                            );
                          } catch {
                            /* Browsing works without storage. */
                          }
                        }}
                      >
                        {localizedTitle(course, language)}{" "}
                        <span className="course-code">{course.code}</span>
                      </Link>
                    </h2>
                    {course.offerings.map((offering) => (
                      <div className="course-summary" key={offering.source_id}>
                        <div className="course-summary-main">
                          <p>
                            {offering.terms.join(" · ")} ·{" "}
                            {offering.ects ?? t.unknown} ECTS ·{" "}
                            {offering.languages.join(" / ")} ·{" "}
                            {offering.levels?.join(" / ") || t.unknown}
                          </p>
                          <p>
                            {offering.faculty_domain} · {offering.lecturer}
                          </p>
                          {discovery ? (
                            <OfferingAdvice
                              assessment={
                                discovery.assessments.get(
                                  offeringKey(offering),
                                )!
                              }
                              language={language}
                            />
                          ) : (
                            <span
                              className={
                                offering.meeting_state === "unresolved"
                                  ? "meeting-status unresolved"
                                  : "meeting-status"
                              }
                            >
                              {offering.meeting_state === "unresolved"
                                ? t.unresolved
                                : t.resolved}
                            </span>
                          )}
                        </div>
                        <CoursePlanner
                          offering={offering}
                          status={page.status}
                          language={language}
                          preferredTerm={plan ? term : query.get("term")}
                        />
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            )}
            <div className="pagination">
              <Button
                disabled={page.offset === 0}
                onClick={() => {
                  const next = new URLSearchParams(query);
                  next.set(
                    "offset",
                    String(Math.max(0, page.offset - page.limit)),
                  );
                  change(next);
                }}
              >
                {t.previous}
              </Button>
              <span>
                {page.total ? page.offset + 1 : 0}–
                {Math.min(page.offset + page.items.length, page.total)} /{" "}
                {page.total}
              </span>
              <Button
                disabled={page.offset + page.limit >= page.total}
                onClick={() => {
                  const next = new URLSearchParams(query);
                  next.set("offset", String(page.offset + page.limit));
                  change(next);
                }}
              >
                {t.next}
              </Button>
            </div>
          </>
        )}
      </div>
      {plan && <SemesterSummary term={term} language={language} />}
    </div>
  );
}

export default function Catalogue({ language }: { language: Language }) {
  const { course_code } = useParams();
  const [query, setQuery] = useSearchParams();
  const queryString = query.toString();
  const { plan, ready } = usePlans();
  useEffect(() => {
    if (
      !course_code &&
      ready &&
      plan &&
      !query.has("term") &&
      !query.has("scope")
    ) {
      const next = new URLSearchParams(query);
      next.set("term", planningSemester(plan));
      setQuery(next, { replace: true });
    }
  }, [course_code, ready, plan, query, setQuery]);
  const apiQueryString = [...query]
    .filter(([key]) => [...filterKeys, "offset", "limit"].includes(key))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<LoadState>({ loading: true });
  const heading = useRef<HTMLHeadingElement>(null);
  const t: CatalogueMessages = catalogueMessages[language];
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState((previous) => ({
      ...previous,
      loading: true,
      error: undefined,
      course: undefined,
    }));
    async function load() {
      try {
        if (course_code) {
          const [result, status] = await Promise.all([
            api.GET("/api/v1/catalogue/courses/{course_code}", {
              params: { path: { course_code } },
              signal: controller.signal,
            }),
            api.GET("/api/v1/status/catalogue", { signal: controller.signal }),
          ]);
          if (!status.data || !status.response.ok)
            throw new Error("Catalogue status unavailable");
          if (active)
            setState({
              loading: false,
              status: status.data,
              course: result.data,
              error: result.response.ok
                ? undefined
                : result.response.status === 404
                  ? "missing"
                  : "transport",
            });
        } else {
          const params = Object.fromEntries(
            new URLSearchParams(apiQueryString),
          ) as Filters;
          // These requests are independent. A slow facet response must not hide
          // the first page, and status is already included with every page.
          const termsPromise = api
            .GET("/api/v1/catalogue/terms", { signal: controller.signal })
            .then((result) => {
              if (active && result.data)
                setState((previous) => ({ ...previous, terms: result.data }));
            })
            .catch(() => {
              /* Facets are optional; search remains available. */
            });
          const courses = await api.GET("/api/v1/catalogue/courses", {
            params: { query: params },
            signal: controller.signal,
          });
          let status = courses.data?.status;
          if (!courses.response.ok && courses.response.status !== 422) {
            const result = await api.GET("/api/v1/status/catalogue", {
              signal: controller.signal,
            });
            status = result.data;
          }
          if (active)
            setState((previous) => ({
              ...previous,
              loading: false,
              status,
              page: courses.data ?? previous.page,
              error:
                courses.response.status === 422
                  ? "invalid"
                  : !courses.data && status?.availability !== "unavailable"
                    ? "transport"
                    : undefined,
            }));
          await termsPromise;
        }
      } catch {
        if (active)
          setState((previous) => ({
            ...previous,
            loading: false,
            error: "transport",
          }));
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [course_code, apiQueryString, retry]);
  const title = state.course
    ? localizedTitle(state.course, language)
    : messages[language].catalogue;
  useEffect(() => {
    document.title = `${title} · UniFr Planner`;
    if (course_code && state.course) heading.current?.focus();
  }, [title, course_code, state.course]);
  return (
    <section className="page catalogue-page">
      <p className="eyebrow">{state.course?.code ?? "UniFr Planner"}</p>
      <h1 ref={heading} tabIndex={-1}>
        {title}
      </h1>
      {state.status && <Provenance status={state.status} language={language} />}
      {state.loading && (
        <StatusNotice>
          <p>{t.loading}</p>
        </StatusNotice>
      )}
      {!state.loading && state.status?.availability === "unavailable" && (
        <StatusNotice>
          <h2>{t.unavailable}</h2>
          <p>{t.unavailableBody}</p>
          <a className="text-link" href={source}>
            {t.catalogueSource}
          </a>
          <Button onClick={() => setRetry(retry + 1)}>{t.retry}</Button>
        </StatusNotice>
      )}
      {state.error && state.error !== "invalid" && (
        <StatusNotice>
          <h2>{state.error === "missing" ? t.missing : t.transport}</h2>
          <p>{state.error === "missing" ? t.missingBody : t.transportBody}</p>
          <Button onClick={() => setRetry(retry + 1)}>{t.retry}</Button>
          <Link className="text-link" to="/catalogue">
            {t.back}
          </Link>
        </StatusNotice>
      )}
      {state.course && (
        <Detail
          course={state.course}
          language={language}
          query={queryString}
          status={state.status!}
        />
      )}
      {!course_code && (
        <Search
          page={state.page}
          loading={state.loading}
          terms={
            state.terms ?? {
              terms: [],
              faculties: [],
              languages: [],
              levels: [],
              status: state.status!,
            }
          }
          query={query}
          language={language}
          invalid={state.error === "invalid"}
          change={setQuery}
        />
      )}
    </section>
  );
}
