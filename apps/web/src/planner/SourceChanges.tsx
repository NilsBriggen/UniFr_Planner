import { Link } from "react-router-dom";
import { Button } from "../components";
import type { Language } from "../i18n";
import { usePlans } from "./context";
import { sourceChanges } from "./published";
import { sourceMessages } from "./source-messages";

export default function SourceChanges({ language }: { language: Language }) {
  const { plan, published } = usePlans();
  const t = sourceMessages[language];
  if (
    !plan ||
    plan.programme === "SUGGESTIONS-DEMO" ||
    !plan.scenarios.some((s) =>
      s.courses.some((c) => c.offering && c.status !== "completed"),
    )
  )
    return null;
  const changes = published.catalogue
    ? sourceChanges(plan, published.catalogue)
    : [];
  return (
    <div className="page source-updates">
      {changes.length > 0 && (
        <section aria-labelledby="source-changes-title" className="notice">
          <div>
            <h2 id="source-changes-title">{t.title}</h2>
            <p>{t.body}</p>
            <ul>
              {changes.map((change) => {
                const scenario = plan.scenarios.find(
                  (s) => s.id === change.scenarioId,
                )!;
                const course = scenario.courses.find(
                  (c) => c.id === change.courseId,
                )!;
                return (
                  <li key={`${scenario.id}/${course.id}`}>
                    <Link to={`/catalogue/${encodeURIComponent(course.code)}`}>
                      {course.code} · {course.titles[language] ?? course.code}
                    </Link>
                    {" · "}
                    {scenario.name}: {t[change.kind]}
                  </li>
                );
              })}
            </ul>
            <Link className="text-link" to="/suggestions">
              {t.suggestions}
            </Link>
          </div>
        </section>
      )}
      {published.loading && <p role="status">{t.loading}</p>}
      {published.error && <p role="alert">{t.error}</p>}
      <Button disabled={published.loading} onClick={published.refresh}>
        {t.refresh}
      </Button>
    </div>
  );
}
