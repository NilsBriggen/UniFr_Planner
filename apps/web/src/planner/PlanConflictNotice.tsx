import { Button } from "../components";
import type { Language } from "../i18n";
import { usePlans } from "./context";

const messages = {
  en: {
    title: "This plan changed in another tab",
    body: "Your changes have not been saved. Load the latest version or keep your changes as a separate plan. The newer plan will remain available.",
    latest: "Load latest version",
    copy: "Save my version as a separate plan",
  },
  de: {
    title: "Dieser Plan wurde in einem anderen Tab geändert",
    body: "Deine Änderungen wurden nicht gespeichert. Lade die aktuelle Version oder speichere deine Änderungen als separaten Plan. Der neuere Plan bleibt erhalten.",
    latest: "Aktuelle Version laden",
    copy: "Meine Version als separaten Plan speichern",
  },
  fr: {
    title: "Ce plan a changé dans un autre onglet",
    body: "Vos modifications n’ont pas été enregistrées. Chargez la dernière version ou enregistrez vos modifications dans un plan séparé. Le plan plus récent restera disponible.",
    latest: "Charger la dernière version",
    copy: "Enregistrer ma version dans un plan séparé",
  },
};
export function PlanConflictNotice({ language }: { language: Language }) {
  const { conflict, busy, loadLatest, saveConflictCopy } = usePlans();
  if (!conflict) return null;
  const t = messages[language];
  return (
    <div className="page source-updates">
      <section
        className="notice"
        role="alert"
        aria-labelledby="plan-conflict-title"
      >
        <div>
          <h2 id="plan-conflict-title">{t.title}</h2>
          <p>{t.body}</p>
          <div className="actions">
            <Button disabled={busy} onClick={() => void loadLatest()}>
              {t.latest}
            </Button>
            <Button disabled={busy} onClick={() => void saveConflictCopy()}>
              {t.copy}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
export default PlanConflictNotice;
