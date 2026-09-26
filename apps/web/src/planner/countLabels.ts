import type { Language } from "../i18n";

type CountKind = "course" | "selected" | "meeting" | "programme";

const forms: Record<Language, Record<CountKind, readonly [string, string]>> = {
  en: {
    course: ["course", "courses"],
    selected: ["course selected", "courses selected"],
    meeting: ["dated meeting", "dated meetings"],
    programme: ["programme", "programmes"],
  },
  de: {
    course: ["Kurs", "Kurse"],
    selected: ["Kurs ausgewählt", "Kurse ausgewählt"],
    meeting: ["datierte Veranstaltung", "datierte Veranstaltungen"],
    programme: ["Studienprogramm", "Studienprogramme"],
  },
  fr: {
    course: ["cours", "cours"],
    selected: ["cours sélectionné", "cours sélectionnés"],
    meeting: ["séance datée", "séances datées"],
    programme: ["programme", "programmes"],
  },
};

export function countLabel(language: Language, kind: CountKind, count: number) {
  return forms[language][kind][count === 1 ? 0 : 1];
}
