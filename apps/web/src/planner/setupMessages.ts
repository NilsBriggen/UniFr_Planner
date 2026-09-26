import type { Language } from "../i18n";

export const setupMessages: Record<
  Language,
  {
    studies: string;
    settings: string;
    manualFallback: string;
    configuredFallback: string;
    continue: string;
    back: string;
    optional: string;
    review: string;
    start: string;
    setLater: string;
    additionalPlan: string;
  }
> = {
  en: {
    studies: "1. Studies",
    settings: "2. Review and start",
    manualFallback: "My programme or combination is missing",
    configuredFallback: "Choose a listed degree",
    continue: "Review and start",
    back: "Back",
    optional: "Optional settings",
    review: "Review and start",
    start: "Start planning",
    setLater: "Set this up later",
    additionalPlan:
      "This creates an additional plan. Your existing plans stay unchanged.",
  },
  de: {
    studies: "1. Studium",
    settings: "2. Prüfen und starten",
    manualFallback: "Mein Studiengang oder meine Kombination fehlt",
    configuredFallback: "Aufgeführten Abschluss wählen",
    continue: "Prüfen und starten",
    back: "Zurück",
    optional: "Optionale Einstellungen",
    review: "Prüfen und starten",
    start: "Planung starten",
    setLater: "Später einrichten",
    additionalPlan:
      "Dadurch wird ein zusätzlicher Plan erstellt. Bestehende Pläne bleiben unverändert.",
  },
  fr: {
    studies: "1. Études",
    settings: "2. Vérifier et commencer",
    manualFallback: "Mon programme ou ma combinaison manque",
    configuredFallback: "Choisir un cursus répertorié",
    continue: "Vérifier et commencer",
    back: "Retour",
    optional: "Paramètres facultatifs",
    review: "Vérifier et commencer",
    start: "Commencer la planification",
    setLater: "Configurer plus tard",
    additionalPlan:
      "Un plan supplémentaire sera créé. Vos plans existants restent inchangés.",
  },
};
