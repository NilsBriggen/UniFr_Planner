import type { Language } from "../i18n";

type CountKind = "course" | "selected" | "meeting";

const forms: Record<Language, Record<CountKind, readonly [string, string]>> = {
  en: {
    course: ["course", "courses"],
    selected: ["course selected", "courses selected"],
    meeting: ["dated meeting", "dated meetings"],
  },
  de: {
    course: ["Kurs", "Kurse"],
    selected: ["Kurs ausgewählt", "Kurse ausgewählt"],
    meeting: ["datierte Veranstaltung", "datierte Veranstaltungen"],
  },
  fr: {
    course: ["cours", "cours"],
    selected: ["cours sélectionné", "cours sélectionnés"],
    meeting: ["séance datée", "séances datées"],
  },
};

export function countLabel(language: Language, kind: CountKind, count: number) {
  return forms[language][kind][count === 1 ? 0 : 1];
}
