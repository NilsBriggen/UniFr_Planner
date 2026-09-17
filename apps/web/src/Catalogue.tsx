import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
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
import { usePlans } from "./planner/context";
import { activeScenario, addCourse, fromOffering } from "./planner/domain";
import { plannerMessages } from "./planner/messages";

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
  return (
    <div className="catalogue-provenance">
      {status.development_fixture && (
        <StatusNotice>
          <h2>{t.fixture}</h2>
          <p>{t.fixtureBody}</p>
        </StatusNotice>
      )}
      {status.latest_sync_outcome?.startsWith("rejected") && (
        <StatusNotice>
          <h2>{t.rejected}</h2>
          <p>{t.rejectedBody}</p>
        </StatusNotice>
      )}
      {status.published_at && (
        <p className={status.stale ? "snapshot-age stale" : "snapshot-age"}>
          {status.stale && <strong>{t.stale} · </strong>}
          {t.updated}:{" "}
          {new Date(status.published_at).toLocaleString(language, {
            timeZone: "Europe/Zurich",
          })}{" "}
          · {t.age}: {Math.floor((status.age_seconds ?? 0) / 86400)} {t.days}
        </p>
      )}
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
  const p = plannerMessages[language];
  const plans = usePlans();
  const [saveError, setSaveError] = useState(false);
  const title = localizedTitle(course, language);
  return (
    <>
      <Link className="text-link" to={`/catalogue${query ? `?${query}` : ""}`}>
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
            {plans.plan ? (
              <Button
                disabled={
                  plans.busy ||
                  !plans.ready ||
                  activeScenario(plans.plan).courses.some(
                    (c) => c.code === course.code,
                  )
                }
                onClick={() => {
                  try {
                    const next = addCourse(
                      plans.plan!,
                      fromOffering(
                        offering,
                        crypto.randomUUID(),
                        status.snapshot_id ?? "unknown",
                        status.development_fixture,
                      ),
                    );
                    void plans.save(next).then((ok) => setSaveError(!ok));
                  } catch {
                    setSaveError(true);
                  }
                }}
              >
                {activeScenario(plans.plan).courses.some(
                  (c) => c.code === course.code,
                )
                  ? p.added
                  : p.add}
              </Button>
            ) : (
              <Link className="text-link" to="/setup">
                {p.needPlan}
              </Link>
            )}
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
          {saveError && <p role="alert">{p.actionError}</p>}
          <h3 className="schedule-heading">{t.schedule}</h3>
          {offering.schedule_summary && <p>{offering.schedule_summary}</p>}
          {offering.recurrence_summary && <p>{offering.recurrence_summary}</p>}
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
              <p>{value || t.unknown}</p>
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
  page,
  terms,
  query,
  language,
  change,
}: {
  page?: CoursePage;
  terms: Terms;
  query: URLSearchParams;
  language: Language;
  change: (query: URLSearchParams) => void;
}) {
  const t = catalogueMessages[language];
  const [expanded, setExpanded] = useState(
    filterKeys.some((key) => key !== "q" && query.has(key)),
  );
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
    next.delete("offset");
    change(next);
  };
  return (
    <>
      <form
        key={query.toString()}
        className="catalogue-search"
        onSubmit={(event) => {
          event.preventDefault();
          const next = new URLSearchParams();
          new FormData(event.currentTarget).forEach((value, key) => {
            if (String(value).trim()) next.set(key, String(value).trim());
          });
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
                />
              </label>
              <label>
                {t.until}
                <input
                  name="available_until"
                  type="time"
                  defaultValue={query.get("available_until") ?? ""}
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
      {page && (
        <>
          <p className="result-count" role="status">
            {page.total} {t.results}
          </p>
          {page.total === 0 ? (
            <StatusNotice>
              <h2>{t.none}</h2>
              <p>{t.noneBody}</p>
            </StatusNotice>
          ) : (
            <ul className="course-results" aria-label={t.results}>
              {page.items.map((course) => (
                <li key={course.code}>
                  <h2>
                    <Link
                      to={`/catalogue/${encodeURIComponent(course.code)}?${query}`}
                    >
                      {localizedTitle(course, language)}{" "}
                      <span className="course-code">{course.code}</span>
                    </Link>
                  </h2>
                  {course.offerings.map((offering) => (
                    <div className="course-summary" key={offering.source_id}>
                      <p>
                        {offering.terms.join(" · ")} ·{" "}
                        {offering.ects ?? t.unknown} ECTS ·{" "}
                        {offering.languages.join(" / ")} ·{" "}
                        {offering.levels?.join(" / ") || t.unknown}
                      </p>
                      <p>
                        {offering.faculty_domain} · {offering.lecturer}
                      </p>
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
    </>
  );
}

export default function Catalogue({ language }: { language: Language }) {
  const { course_code } = useParams();
  const [query, setQuery] = useSearchParams();
  const queryString = query.toString();
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<LoadState>({ loading: true });
  const heading = useRef<HTMLHeadingElement>(null);
  const t: CatalogueMessages = catalogueMessages[language];
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ loading: true });
    async function load() {
      try {
        const { data: status, response } = await api.GET(
          "/api/v1/status/catalogue",
          { signal: controller.signal },
        );
        if (!status || !response.ok)
          throw new Error("Catalogue status unavailable");
        if (status.availability === "unavailable") {
          if (active) setState({ loading: false, status });
          return;
        }
        if (course_code) {
          const result = await api.GET(
            "/api/v1/catalogue/courses/{course_code}",
            { params: { path: { course_code } }, signal: controller.signal },
          );
          if (active)
            setState({
              loading: false,
              status,
              course: result.data,
              error: result.response.ok
                ? undefined
                : result.response.status === 404
                  ? "missing"
                  : "transport",
            });
        } else {
          const params = Object.fromEntries(
            new URLSearchParams(queryString),
          ) as Filters;
          const [courses, terms] = await Promise.all([
            api.GET("/api/v1/catalogue/courses", {
              params: { query: params },
              signal: controller.signal,
            }),
            api.GET("/api/v1/catalogue/terms", { signal: controller.signal }),
          ]);
          if (active)
            setState({
              loading: false,
              status: courses.data?.status ?? status,
              page: courses.data,
              terms: terms.data,
              error:
                courses.response.status === 422
                  ? "invalid"
                  : !courses.data || !terms.data
                    ? "transport"
                    : undefined,
            });
        }
      } catch {
        if (active) setState({ loading: false, error: "transport" });
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [course_code, queryString, retry]);
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
      {state.error && (
        <StatusNotice>
          <h2>
            {state.error === "missing"
              ? t.missing
              : state.error === "invalid"
                ? t.invalid
                : t.transport}
          </h2>
          {state.error !== "invalid" && (
            <p>{state.error === "missing" ? t.missingBody : t.transportBody}</p>
          )}
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
      {state.terms && (
        <Search
          page={state.page}
          terms={state.terms}
          query={query}
          language={language}
          change={setQuery}
        />
      )}
    </section>
  );
}
