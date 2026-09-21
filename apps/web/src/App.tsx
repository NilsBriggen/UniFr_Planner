import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { Button, StatusNotice } from "./components";
import { messages, type Language, type Messages } from "./i18n";
import Catalogue from "./Catalogue";
import { PlanProvider, usePlans } from "./planner/context";
import { PlanBoard, Setup } from "./planner/Planner";
import Requirements from "./requirements/Requirements";
import Suggestions from "./suggestions/Suggestions";
import SourceChanges from "./planner/SourceChanges";
import Accounts from "./accounts/Accounts";
import Operations from "./Operations";
const SemesterCalendar = lazy(() => import("./planner/SemesterCalendar"));

const languages = [
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "en", name: "English" },
] as const;
const navigation = [
  {
    path: "/plan",
    key: "plan",
    icon: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  },
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
    path: "/requirements",
    key: "requirements",
    icon: "M9 5h12 M9 12h12 M9 19h12 M2 5l2 2 3-4 M2 12l2 2 3-4 M2 19l2 2 3-4",
  },
  {
    path: "/settings",
    key: "settings",
    icon: "M4 7h16 M4 17h16 M9 4v6 M15 14v6",
  },
] as const;

function Home({ t }: { t: Messages }) {
  const { plan } = usePlans();
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
  const location = useLocation();
  const previousPath = useRef(location.pathname);
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
    document.title = `${document.querySelector("h1")?.textContent ?? "UniFr"} · UniFr Planner`;
  }, [language, location.pathname]);
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
        <nav className="navigation" aria-label={t.nav}>
          {navigation.map(({ path, key, icon }) => (
            <NavLink
              key={key}
              to={
                key === "semester"
                  ? location.pathname.startsWith("/semester/")
                    ? location.pathname
                    : `/semester/${plans.plan?.semesters[0] ?? `AS-${new Date().getFullYear()}`}`
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
                  ? t.semesterNav
                  : key === "requirements"
                    ? t.requirementsNav
                    : t[key]}
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="canvas">
          <main id="main" tabIndex={-1}>
            <SourceChanges language={language} />
            <Routes>
              <Route path="/" element={<Home t={t} />} />
              <Route path="/setup" element={<Setup language={language} />} />
              <Route path="/plan" element={<PlanBoard language={language} />} />
              <Route
                path="/semester/:term"
                element={
                  plans.plan ? (
                    <Suspense fallback={<Semester t={t} />}>
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
      <AppShell />
    </PlanProvider>
  );
}
