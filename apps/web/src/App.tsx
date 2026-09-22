import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { Button, StatusNotice } from "./components";
import { messages, type Language, type Messages } from "./i18n";
import { experienceMessages } from "./experience-messages";
import RouteBoundary from "./RouteBoundary";
import PlanConflictNotice from "./planner/PlanConflictNotice";
const Catalogue = lazy(() => import("./Catalogue"));
import { PlanProvider, usePlans } from "./planner/context";
const CompletedCourses = lazy(() => import("./planner/CompletedCourses"));
import { planningSemester, currentSemester } from "./planner/domain";
const PlanBoard = lazy(() =>
  import("./planner/Planner").then((module) => ({ default: module.PlanBoard })),
);
const Setup = lazy(() =>
  import("./planner/Setup").then((module) => ({ default: module.Setup })),
);
const Requirements = lazy(() => import("./requirements/Requirements"));
const Suggestions = lazy(() => import("./suggestions/Suggestions"));
import SourceChanges from "./planner/SourceChanges";
const Accounts = lazy(() => import("./accounts/Accounts"));
const Operations = lazy(() => import("./Operations"));
import { SharingProvider } from "./sharing/context";
const SharedPlanPage = lazy(() => import("./sharing/SharedPlanPage"));
const SemesterCalendar = lazy(() => import("./planner/SemesterCalendar"));

const languages = [
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "en", name: "English" },
] as const;
const navigation = [
  {
    path: "/semester/AS-2026",
    key: "semester",
    icon: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z M7 3v4 M17 3v4 M3 11h18 M7 15h3 M14 15h3",
  },
  {
    path: "/catalogue",
    key: "catalogue",
    icon: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  },
  {
    path: "/plan",
    key: "plan",
    icon: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  },
] as const;

function Home({ t }: { t: Messages }) {
  const { plan, ready } = usePlans();
  if (ready && plan)
    return <Navigate replace to={`/semester/${planningSemester(plan)}`} />;
  return (
    <>
      <section className="hero">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.headline}</h1>
        <p className="intro">{t.intro}</p>
        <div className="actions">
          <Link className="button primary" to={plan ? "/plan" : "/setup"}>
            {plan ? t.resume : t.start}
            <span aria-hidden="true">→</span>
          </Link>
          <Link className="text-link" to="/catalogue">
            {t.explore}
          </Link>
        </div>
        <p className="guest-note">{plan ? plan.name : t.guestIntro}</p>
      </section>
      <section className="steps" aria-labelledby="steps-heading">
        <h2 id="steps-heading">{t.steps}</h2>
        <ol>
          {[
            [t.step1, t.step1Body],
            [t.step2, t.step2Body],
            [t.step3, t.step3Body],
          ].map(([title, body], i) => (
            <li key={title}>
              <span className="step-number" aria-hidden="true">
                0{i + 1}
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
function EmptyPage({
  title,
  body,
  t,
}: {
  title: string;
  body?: string;
  t: Messages;
}) {
  return (
    <section className="page">
      <p className="eyebrow">UniFr Planner</p>
      <h1>{title}</h1>
      <StatusNotice>
        <h2>{t.empty}</h2>
        <p>{body ?? t.emptyBody}</p>
      </StatusNotice>
      <Link className="text-link" to="/">
        {t.back}
      </Link>
    </section>
  );
}
function Semester({ t }: { t: Messages }) {
  const { term } = useParams();
  const [view, setView] = useState<"agenda" | "day">("agenda");
  return (
    <section className="page">
      <p className="eyebrow">
        {t.term} · {term}
      </p>
      <h1>{t.semester}</h1>
      <div className="view-controls">
        <div className="segmented">
          <Button
            aria-pressed={view === "agenda"}
            onClick={() => setView("agenda")}
          >
            {t.agenda}
          </Button>
          <Button aria-pressed={view === "day"} onClick={() => setView("day")}>
            {t.day}
          </Button>
        </div>
        {view === "day" && (
          <label className="date-label">
            {t.date}
            <input type="date" />
          </label>
        )}
      </div>
      <div className="agenda-empty">
        <span aria-hidden="true" className="calendar-icon">
          ▤
        </span>
        <h2>{view === "agenda" ? t.emptyAgenda : t.emptyDay}</h2>
        <p>{t.emptyBody}</p>
        <Link className="button primary" to="/setup">
          {t.start}
        </Link>
      </div>
    </section>
  );
}
function PageTitle({ language }: { language: Language }) {
  const location = useLocation();
  useEffect(() => {
    document.title = `${document.querySelector("h1")?.textContent ?? "UniFr"} · UniFr Planner`;
  }, [language, location.pathname]);
  return null;
}
function AppShell() {
  const plans = usePlans();
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const value = localStorage.getItem("unifr.language");
      return value === "fr" || value === "en" ? value : "de";
    } catch {
      return "de";
    }
  });
  const t = messages[language];
  const x = experienceMessages[language];
  const location = useLocation();
  const activeArea = location.pathname.startsWith("/semester/")
    ? "semester"
    : location.pathname.startsWith("/catalogue")
      ? "catalogue"
      : location.pathname.startsWith("/plan") ||
          ["/requirements", "/setup"].includes(location.pathname)
        ? "plan"
        : undefined;
  const previousPath = useRef(location.pathname);
  const navigationRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      document.getElementById("main")?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
      previousPath.current = location.pathname;
    }
  }, [location.pathname]);
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem("unifr.language", language);
    } catch {
      /* Still works when browser storage is unavailable. */
    }
  }, [language]);

  useEffect(() => {
    const element = navigationRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const updateClearance = () => {
      const clearance = Math.ceil(element.getBoundingClientRect().height) + 8;
      document.documentElement.style.setProperty(
        "--mobile-navigation-clearance",
        `${clearance}px`,
      );
    };
    const observer = new ResizeObserver(updateClearance);
    observer.observe(element);
    updateClearance();
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(
        "--mobile-navigation-clearance",
      );
    };
  }, []);
  return (
    <>
      <a className="skip-link" href="#main">
        {t.skip}
      </a>
      <header className="header">
        <Link to="/" className="brand">
          <img
            src="/unifr-logo.png"
            width="500"
            height="82"
            alt="Universität Freiburg / Université de Fribourg"
          />
        </Link>
        <div className="header-tools">
          <label className="plan-switcher">
            <span>{t.planLabel}</span>
            <select
              aria-label={t.planLabel}
              disabled={!plans.ready || plans.busy || !plans.plans.length}
              value={plans.plan?.id ?? "empty"}
              onChange={(e) => void plans.select(e.target.value)}
            >
              {!plans.plans.length && <option value="empty">{t.noPlan}</option>}
              {plans.plans.map((plan) => (
                <option value={plan.id} key={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <span className="guest-status">{t.guest}</span>
          <Link
            className="button header-settings"
            to="/settings"
            aria-label={t.settings}
            title={t.settings}
          >
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M4 7h16 M4 17h16 M9 4v6 M15 14v6" />
            </svg>
          </Link>
          <div className="languages" role="group" aria-label={t.languages}>
            {languages.map(({ code, name }) => (
              <Button
                key={code}
                lang={code}
                aria-label={name}
                aria-pressed={language === code}
                onClick={() => setLanguage(code)}
              >
                {code.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </header>
      <div className="layout">
        <nav ref={navigationRef} className="navigation" aria-label={t.nav}>
          {navigation.map(({ path, key, icon }) => (
            <Link
              className={activeArea === key ? "active" : undefined}
              aria-current={activeArea === key ? "page" : undefined}
              key={key}
              to={
                key === "semester"
                  ? location.pathname.startsWith("/semester/")
                    ? location.pathname
                    : `/semester/${plans.plan ? planningSemester(plans.plan) : currentSemester()}`
                  : path
              }
            >
              <span className="nav-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={icon} />
                </svg>
              </span>
              <span>
                {key === "semester"
                  ? x.timetable
                  : key === "catalogue"
                    ? x.courses
                    : x.studies}
              </span>
            </Link>
          ))}
        </nav>
        <div className="canvas">
          <main id="main" tabIndex={-1}>
            <PlanConflictNotice language={language} />
            {!location.pathname.startsWith("/shared/") && (
              <SourceChanges language={language} />
            )}
            {["/plan", "/requirements", "/plan/completed"].includes(
              location.pathname,
            ) && (
              <nav className="study-navigation" aria-label={x.studies}>
                <NavLink end to="/plan">
                  {x.overview}
                </NavLink>
                <NavLink to="/requirements">{x.requirements}</NavLink>
                <NavLink to="/plan/completed">{x.completed}</NavLink>
              </nav>
            )}
            <RouteBoundary key={location.pathname} language={language}>
              <Suspense
                fallback={
                  <p className="page" role="status">
                    {x.loading}
                  </p>
                }
              >
                <Routes>
                  <Route
                    path="/shared/:id"
                    element={
                      <Suspense fallback={<p role="status">{x.loading}</p>}>
                        <SharedPlanPage language={language} />
                      </Suspense>
                    }
                  />
                  <Route path="/" element={<Home t={t} />} />
                  <Route
                    path="/setup"
                    element={<Setup language={language} />}
                  />
                  <Route
                    path="/plan"
                    element={<PlanBoard language={language} />}
                  />
                  <Route
                    path="/plan/completed"
                    element={<CompletedCourses language={language} />}
                  />
                  <Route
                    path="/semester/:term"
                    element={
                      plans.plan ? (
                        <Suspense fallback={<p role="status">{x.loading}</p>}>
                          <SemesterCalendar
                            key={location.pathname}
                            language={language}
                          />
                        </Suspense>
                      ) : (
                        <Semester t={t} />
                      )
                    }
                  />
                  <Route
                    path="/catalogue"
                    element={<Catalogue language={language} />}
                  />
                  <Route
                    path="/catalogue/:course_code"
                    element={<Catalogue language={language} />}
                  />
                  <Route
                    path="/requirements"
                    element={<Requirements language={language} />}
                  />
                  <Route
                    path="/suggestions"
                    element={<Suggestions language={language} />}
                  />
                  <Route
                    path="/settings"
                    element={<Accounts language={language} />}
                  />
                  <Route
                    path="/admin"
                    element={<Operations title={t.admin} language={language} />}
                  />
                  <Route
                    path="*"
                    element={
                      <EmptyPage title={t.missing} body={t.notFound} t={t} />
                    }
                  />
                </Routes>
                <PageTitle language={language} />
              </Suspense>
            </RouteBoundary>
          </main>
          <footer>
            <span>UniFr Planner</span>
            <p>{t.disclaimer}</p>
          </footer>
        </div>
      </div>
    </>
  );
}
export default function App() {
  return (
    <PlanProvider>
      <SharingProvider>
        <AppShell />
      </SharingProvider>
    </PlanProvider>
  );
}
