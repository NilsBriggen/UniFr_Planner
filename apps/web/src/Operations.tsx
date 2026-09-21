import { useState, type FormEvent } from "react";
import { Button } from "./components";
import type { Language } from "./i18n";

const messages = {
  de: {
    restricted: "Geschützter Betrieb",
    token: "Administrations-Token",
    load: "Betriebsdaten laden",
    loading: "Wird geladen…",
    required: "Administrations-Token erforderlich.",
    unavailable: "Administration ist deaktiviert oder nicht verfügbar.",
    generic: "Betriebsdaten nicht verfügbar.",
    clear: "Betriebsdaten löschen",
    schedule: "Zeitplan",
    alertHook: "Alarm-Webhook",
    configured: "konfiguriert",
    disabled: "deaktiviert",
    monitoring: "Überwachung und nächste Läufe",
    jobs: "Auftragsverlauf",
    runDetails: "Laufdetails",
    sync: "Katalog-Synchronisierungen",
    validation: "Validierungsbericht",
  },
  fr: {
    restricted: "Exploitation protégée",
    token: "Jeton d’administration",
    load: "Charger les opérations",
    loading: "Chargement…",
    required: "Jeton d’administration requis.",
    unavailable: "L’administration est désactivée ou indisponible.",
    generic: "Opérations indisponibles.",
    clear: "Effacer les opérations",
    schedule: "Planification",
    alertHook: "Webhook d’alerte",
    configured: "configuré",
    disabled: "désactivé",
    monitoring: "Surveillance et prochaines exécutions",
    jobs: "Historique des tâches",
    runDetails: "Détails de l’exécution",
    sync: "Synchronisations du catalogue",
    validation: "Rapport de validation",
  },
  en: {
    restricted: "Restricted operations",
    token: "Administrator token",
    load: "Load operations",
    loading: "Loading…",
    required: "Administrator token required.",
    unavailable: "Administration is disabled or unavailable.",
    generic: "Operations unavailable.",
    clear: "Clear operations",
    schedule: "Schedule",
    alertHook: "Alert hook",
    configured: "configured",
    disabled: "disabled",
    monitoring: "Monitoring and next runs",
    jobs: "Job history",
    runDetails: "Run details",
    sync: "Catalogue sync history",
    validation: "Validation report",
  },
} as const;

type Status = {
  schedule: Record<string, string>;
  jobs: {
    id: string;
    job: string;
    due_at: string;
    outcome: string;
    details: unknown;
  }[];
  state: Record<string, unknown>;
  sync_history: { id: string; status: string; report: unknown }[];
  alert_hook_configured: boolean;
};

export default function Operations({
  title,
  language,
}: {
  title: string;
  language: Language;
}) {
  const t = messages[language];
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus(undefined);
    const authorization = token;
    setToken("");
    try {
      const response = await fetch("/api/v1/admin/operations", {
        headers: { Authorization: `Bearer ${authorization}` },
        cache: "no-store",
        credentials: "omit",
      });
      if (!response.ok)
        throw new Error(response.status === 401 ? t.required : t.unavailable);
      setStatus((await response.json()) as Status);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t.generic);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="operations">
      <h1>{title}</h1>
      <p>{t.restricted} · Europe/Zurich</p>
      <form onSubmit={(event) => void load(event)}>
        <label>
          {t.token}
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
          />
        </label>
        <Button disabled={busy}>{busy ? t.loading : t.load}</Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {status && (
        <>
          <Button onClick={() => setStatus(undefined)}>{t.clear}</Button>
          <h2>{t.schedule}</h2>
          <dl>
            {Object.entries(status.schedule).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p>
            {t.alertHook}:{" "}
            {status.alert_hook_configured ? t.configured : t.disabled}
          </p>
          <h2>{t.monitoring}</h2>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {JSON.stringify(status.state, null, 2)}
          </pre>
          <h2>{t.jobs}</h2>
          <ul>
            {status.jobs.map((job) => (
              <li key={job.id}>
                {job.job} · {job.outcome} · {job.due_at}
                <details>
                  <summary>{t.runDetails}</summary>
                  <pre
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {JSON.stringify(job.details, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
          <h2>{t.sync}</h2>
          <ul>
            {status.sync_history.map((run) => (
              <li key={run.id}>
                {run.id} · {run.status}
                <details>
                  <summary>{t.validation}</summary>
                  <pre
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {JSON.stringify(run.report, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
