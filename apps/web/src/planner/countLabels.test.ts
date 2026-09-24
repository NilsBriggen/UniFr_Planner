import { expect, it } from "vitest";
import { countLabel } from "./countLabels";

it.each([
  [
    "en",
    "course",
    "courses",
    "course selected",
    "courses selected",
    "dated meeting",
    "dated meetings",
  ],
  [
    "de",
    "Kurs",
    "Kurse",
    "Kurs ausgewählt",
    "Kurse ausgewählt",
    "datierte Veranstaltung",
    "datierte Veranstaltungen",
  ],
  [
    "fr",
    "cours",
    "cours",
    "cours sélectionné",
    "cours sélectionnés",
    "séance datée",
    "séances datées",
  ],
] as const)(
  "uses singular and plural course labels in %s",
  (
    language,
    oneCourse,
    manyCourses,
    oneSelected,
    manySelected,
    oneMeeting,
    manyMeetings,
  ) => {
    expect(countLabel(language, "course", 1)).toBe(oneCourse);
    expect(countLabel(language, "course", 0)).toBe(manyCourses);
    expect(countLabel(language, "course", 2)).toBe(manyCourses);
    expect(countLabel(language, "selected", 1)).toBe(oneSelected);
    expect(countLabel(language, "selected", 2)).toBe(manySelected);
    expect(countLabel(language, "meeting", 1)).toBe(oneMeeting);
    expect(countLabel(language, "meeting", 2)).toBe(manyMeetings);
  },
);
