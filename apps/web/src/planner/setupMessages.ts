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
  }
> = {
  en: {
    studies: "1. Studies",
    settings: "2. Planning settings and review",
    manualFallback: "My programme or combination is missing",
    configuredFallback: "Choose a listed degree",
    continue: "Continue to planning",
    back: "Back",
  },
  de: {
    studies: "1. Studium",
    settings: "2. Planungseinstellungen und Prüfung",
    manualFallback: "Mein Studiengang oder meine Kombination fehlt",
    configuredFallback: "Aufgeführten Abschluss wählen",
    continue: "Weiter zur Planung",
    back: "Zurück",
  },
  fr: {
    studies: "1. Études",
    settings: "2. Paramètres de planification et vérification",
    manualFallback: "Mon programme ou ma combinaison manque",
    configuredFallback: "Choisir un cursus répertorié",
    continue: "Continuer vers la planification",
    back: "Retour",
  },
};
