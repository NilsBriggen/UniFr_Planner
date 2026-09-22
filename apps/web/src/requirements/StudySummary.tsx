import { Link } from "react-router-dom";
import type { Language } from "../i18n";
import type { Plan } from "../planner/domain";
import { hasStudyConfiguration, studyLabel } from "./study-summary";
import "./study-summary.css";

const copy = {
  en: {
    studies: "Your studies",
    configure: "Configure your studies",
    help: "Choose your degree and subjects to see courses that advance your requirements. Your saved courses and timetable stay available.",
    change: "Change studies",
    requirements: "View requirements",
  },
  de: {
    studies: "Dein Studium",
    configure: "Studium einrichten",
    help: "Wähle Abschluss und Fächer, um Kurse für deine offenen Anforderungen zu finden. Deine gespeicherten Kurse und dein Stundenplan bleiben verfügbar.",
    change: "Studium ändern",
    requirements: "Anforderungen ansehen",
  },
  fr: {
    studies: "Vos études",
    configure: "Configurer vos études",
    help: "Choisissez votre diplôme et vos matières pour trouver des cours répondant à vos exigences restantes. Vos cours et votre horaire restent disponibles.",
    change: "Modifier les études",
    requirements: "Voir les exigences",
  },
};

export default function StudySummary({
  plan,
  language,
}: {
  plan: Plan;
  language: Language;
}) {
  const t = copy[language];
  const configured = hasStudyConfiguration(plan);
  return (
    <section className="study-summary no-print" aria-label={t.studies}>
      <div>
        <p className="eyebrow">{t.studies}</p>
        <p className="study-summary-title">
          {configured ? studyLabel(plan, language) : t.configure}
        </p>
        {!configured && <p className="study-summary-help">{t.help}</p>}
      </div>
      <div className="study-summary-actions">
        <Link
          className={configured ? "text-link" : "button"}
          to="/requirements#study-configuration"
        >
          {configured ? t.change : t.configure}
        </Link>
        {configured && (
          <Link className="text-link" to="/requirements">
            {t.requirements}
          </Link>
        )}
      </div>
    </section>
  );
}
