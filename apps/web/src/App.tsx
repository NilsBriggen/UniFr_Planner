import { useEffect, useState } from "react";
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

const languages = [
  { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" },
  { code: "en", name: "English" },
] as const;
const navigation = [
  { path: "/plan", key: "plan", icon: "▦" },
  { path: "/semester/HS-2026", key: "semester", icon: "▤" },
  { path: "/catalogue", key: "catalogue", icon: "⌕" },
  { path: "/requirements", key: "requirements", icon: "☑" },
  { path: "/settings", key: "settings", icon: "⚙" },
] as const;

function Home({ t }: { t: Messages }) {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.headline}</h1>
        <p className="intro">{t.intro}</p>
        <div className="actions">
          <Link className="button primary" to="/setup">
            {t.start}
            <span aria-hidden="true">→</span>
          </Link>
          <Link className="text-link" to="/catalogue">
            {t.explore}
          </Link>
        </div>
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
        <Link className="button" to="/catalogue">
          {t.explore}
        </Link>
      </div>
    </section>
  );
}
export default function App() {
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
            <select disabled value="empty">
              <option value="empty">{t.noPlan}</option>
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
            <NavLink key={key} to={path}>
              <span className="nav-icon" aria-hidden="true">
                {icon}
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
            <Routes>
              <Route path="/" element={<Home t={t} />} />
              <Route
                path="/setup"
                element={<EmptyPage title={t.setup} t={t} />}
              />
              <Route
                path="/plan"
                element={<EmptyPage title={t.plan} t={t} />}
              />
              <Route path="/semester/:term" element={<Semester t={t} />} />
              <Route
                path="/catalogue"
                element={<EmptyPage title={t.catalogue} t={t} />}
              />
              <Route
                path="/requirements"
                element={<EmptyPage title={t.requirements} t={t} />}
              />
              <Route
                path="/settings"
                element={
                  <EmptyPage title={t.settings} body={t.settingsBody} t={t} />
                }
              />
              <Route
                path="/admin"
                element={<EmptyPage title={t.admin} body={t.adminBody} t={t} />}
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
