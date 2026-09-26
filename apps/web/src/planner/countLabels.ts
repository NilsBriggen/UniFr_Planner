import type { Language } from "../i18n";

type CountKind = "course" | "selected" | "meeting" | "classWeek" | "oneOff";

const forms: Record<Language, Record<CountKind, readonly [string, string]>> = {
  en: {
    course: ["course", "courses"],
    selected: ["course selected", "courses selected"],
    meeting: ["dated meeting", "dated meetings"],
    classWeek: ["week with classes", "weeks with classes"],
    oneOff: ["one-off date", "one-off dates"],
  },
  de: {
    course: ["Kurs", "Kurse"],
    selected: ["Kurs ausgewählt", "Kurse ausgewählt"],
    meeting: ["datierte Veranstaltung", "datierte Veranstaltungen"],
    classWeek: ["Woche mit Unterricht", "Wochen mit Unterricht"],
    oneOff: ["Einzeltermin", "Einzeltermine"],
  },
  fr: {
    course: ["cours", "cours"],
    selected: ["cours sélectionné", "cours sélectionnés"],
    meeting: ["séance datée", "séances datées"],
    classWeek: ["semaine de cours", "semaines de cours"],
    oneOff: ["date ponctuelle", "dates ponctuelles"],
  },
};

export function countLabel(language: Language, kind: CountKind, count: number) {
  return forms[language][kind][count === 1 ? 0 : 1];
}
