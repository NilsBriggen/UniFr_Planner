import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Temporal } from "@js-temporal/polyfill";
import type { Language } from "../i18n";
import { Button } from "../components";
import { activeScenario, importAsNew } from "../planner/domain";
import {
  calendarFor,
  detectConflicts,
  localDate,
  termRange,
} from "../planner/calendar";
import { usePlans } from "../planner/context";
import WeekTimetable from "../planner/WeekTimetable";
import WeeklyDownloads from "../planner/WeeklyDownloads";
import { useSharing } from "./context";
import { shareRequest, type SharedPlan } from "./model";
import { shareMessages } from "./messages";
import "./sharing.css";

export default function SharedPlanPage({ language }: { language: Language }) {
  const { id = "" } = useParams(),
    navigate = useNavigate();
  const { save, ready, busy } = usePlans(),
    sharing = useSharing();
  const t = shareMessages[language];
  const record = sharing.records.find((r) => r.id === id);
  const [value, setValue] = useState<SharedPlan>(),
    [error, setError] = useState(false),
    [actionError, setActionError] = useState(false);
  const [selectedTerm, setTerm] = useState(""),
    [selectedDate, setDate] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => {
      void shareRequest(
        `/${encodeURIComponent(id)}`,
        "GET",
        undefined,
        record?.ownerKey,
      )
        .then((next) => {
          if (active) {
            setValue(next);
            setError(false);
          }
        })
        .catch(() => {
          if (active) {
            setError(true);
            setValue(undefined);
          }
        });
    };
    load();
    const interval = window.setInterval(() => {
      if (!document.hidden) load();
    }, 15000);
    const focus = () => load();
    window.addEventListener("focus", focus);
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex, nofollow";
    document.head.append(robots);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", focus);
      robots.remove();
    };
  }, [id, record?.ownerKey]);
  if (!value)
    return (
      <section className="page">
        <h1>{t.shared}</h1>
        <p role={error ? "alert" : "status"}>{error ? t.missing : t.loading}</p>
      </section>
    );
  const plan = value.snapshot,
    scenario = activeScenario(plan);
  const term = plan.semesters.includes(selectedTerm)
    ? selectedTerm
    : plan.semesters[0];
  const calendar = calendarFor(scenario.courses, term, language);
  const events = [
    ...calendar.events,
    ...scenario.unavailable.map((period) => ({
      ...period,
      owner: period.id,
      title: period.label,
      location: "",
    })),
  ];
  const day = Temporal.PlainDate.from(
    selectedDate ||
      (calendar.events[0]
        ? localDate(calendar.events[0].start)
        : termRange(term).start),
  );
  const monday = day.subtract({ days: day.dayOfWeek - 1 }).toString();
  const courses = scenario.courses.filter((c) => c.semester === term);
  async function importPlan(owner = false) {
    setActionError(false);
    try {
      const imported = importAsNew(
        plan,
        crypto.randomUUID(),
        owner ? plan.name : `${plan.name.slice(0, 150)} · ${t.imported}`,
      );
      if (!(await save(imported))) throw new Error("Save failed");
      if (owner) await sharing.attach(imported, value!, record?.ownerKey);
      navigate(`/semester/${term}`);
    } catch {
      setActionError(true);
    }
  }
  return (
    <section className="page planner-page semester-page">
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">{t.shared}</p>
          <h1>{plan.name}</h1>
          <p>{plan.programme}</p>
        </div>
        <div className="workspace-actions">
          <Button
            className="primary"
            disabled={!ready || busy}
            onClick={() => void importPlan()}
          >
            {t.import}
          </Button>
          {value.canManage && (
            <Button
              disabled={!ready || busy || !sharing.ready}
              onClick={() => void importPlan(true)}
            >
              {t.edit}
            </Button>
          )}
        </div>
      </header>
      <div className="shared-notice">
        <p>{t.readOnly}</p>
        <small>
          {t.updated}: {new Date(value.updatedAt).toLocaleString(language)}
        </small>
        {value.canManage && <p>{t.editHelp}</p>}
      </div>
      {actionError && <p role="alert">{t.error}</p>}
      <div className="calendar-panel">
        <h2 className="visually-hidden">{t.weekly}</h2>
        <div className="calendar-toolbar">
          <label>
            {t.semester}
            <select
              value={term}
              onChange={(e) => {
                setTerm(e.target.value);
                setDate("");
              }}
            >
              {plan.semesters.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            {t.week}
            <input
              type="date"
              value={day.toString()}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>
        <WeekTimetable
          events={events}
          monday={monday}
          language={language}
          courses={courses}
          conflicts={detectConflicts(
            calendar.events,
            scenario.unavailable,
            scenario.travelMinutes,
          )}
        />
        <div className="calendar-footer">
          <WeeklyDownloads
            input={{
              name: plan.name,
              term,
              monday,
              events,
              courses,
              language,
              unresolved: calendar.unresolved.length > 0,
            }}
          />
        </div>
      </div>
      {calendar.unresolved.length > 0 && (
        <p className="schedule-warning">{t.missingDates}</p>
      )}
      <h2>
        {t.courses} · {term}
      </h2>
      {!courses.length && <p>{t.noCourses}</p>}
      <ul className="shared-course-list">
        {courses.map((course) => (
          <li key={course.id}>
            <h3>
              {course.titles[language] ?? course.titles.en ?? course.code}
            </h3>
            <span>
              {course.code} · {course.ects ?? "?"} ECTS
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
