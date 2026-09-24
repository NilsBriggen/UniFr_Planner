import { Link } from "react-router-dom";
import { Button } from "../components";
import type { Language } from "../i18n";
import { usePlans } from "./context";
import { sourceChanges } from "./published";
import { sourceMessages } from "./source-messages";
import { catalogueMessages } from "../catalogue-i18n";

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
  const rejected =
    published.catalogue?.status.latest_sync_outcome?.startsWith("rejected");
  return (
    <div className="page source-updates">
      {published.catalogue?.status.published_at && (
        <p className="print-only">
          {t.catalogueDate}:{" "}
          {new Date(published.catalogue.status.published_at).toLocaleDateString(
            language,
            { timeZone: "Europe/Zurich" },
          )}
          {published.catalogue.status.latest_sync_outcome?.startsWith(
            "rejected",
          ) && <> · {catalogueMessages[language].rejected}</>}
        </p>
      )}
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
      {rejected && (
        <p className="source-warning" role="status">
          {catalogueMessages[language].rejected}
        </p>
      )}
      {published.error && (
        <p className="source-warning" role="alert">
          {t.error}
        </p>
      )}
      <details className="source-check no-print">
        <summary>
          {t.catalogueStatus}
          {published.loading
            ? " · …"
            : published.checkedAt
              ? ` · ${new Date(published.checkedAt).toLocaleDateString(language, { timeZone: "Europe/Zurich" })}`
              : ""}
        </summary>
        <div className="source-check-details">
          {published.loading && <p role="status">{t.loading}</p>}
          {!published.loading && !published.error && published.checkedAt && (
            <p role="status">
              {changes.length
                ? t.changesFound.replace("{count}", String(changes.length))
                : t.noChanges}
              {" · "}
              {t.checked}:{" "}
              {new Date(published.checkedAt).toLocaleString(language, {
                timeZone: "Europe/Zurich",
              })}
            </p>
          )}
          <Button disabled={published.loading} onClick={published.refresh}>
            {t.refresh}
          </Button>
        </div>
      </details>
    </div>
  );
}
