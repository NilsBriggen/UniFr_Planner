import type { Language } from "../i18n";
const en = {
  title: "Record completed courses",
  intro:
    "Choose the courses you passed, one semester at a time. Nothing is marked completed automatically. You can skip this and return later.",
  planning: "Planning semester",
  planningYear: "Planning year",
  studyStart: "Study start",
  earlier: "Earlier / not specified",
  manual: "Enter a completed course manually",
  optionalCode: "Optional; leave blank if unknown.",
  noCode: "No course code",
  search: "Search archived courses",
  loading: "Loading this semester’s archive…",
  unavailable:
    "No published archive for this semester. You can still enter completed courses manually.",
  failed: "The archive could not be loaded. Manual entry remains available.",
  importing:
    "This semester’s archive is being prepared. Manual entry remains available.",
  empty: "No matching archived courses.",
  review: "Review selected courses",
  save: "Save completed courses",
  selected: "Selected courses",
  earned: "Earned ECTS",
  next: "Next semester",
  skip: "Skip this semester",
  done: "Done",
  later: "Resume later",
  edit: "Edit",
  remove: "Remove",
  cancel: "Cancel",
  update: "Save changes",
  existing: "Mark existing course completed",
  duplicate:
    "This course already exists in your plan. Confirm that you want to mark it completed instead of adding another record.",
  already: "Already completed",
  pinned:
    "This course is pinned. Unpin it in the degree plan before changing it.",
  more: "More results",
  previous: "Previous results",
  recorded: "Recorded completed courses",
  reviewHelp:
    "Check the earned ECTS before saving. Changes are saved together.",
  reviewBack: "Back to selection",
  reserved: "MANUAL- codes are reserved for records without a course code.",
  rangeError:
    "Study start and planning semester must fit within 24 semesters, with planning on or after study start.",
};
type Copy = typeof en;
const de: Copy = {
  title: "Bestandene Kurse erfassen",
  intro:
    "Wähle semesterweise die bestandenen Kurse. Nichts wird automatisch als bestanden markiert. Du kannst diesen Schritt überspringen und später fortsetzen.",
  planning: "Planungssemester",
  planningYear: "Planungsjahr",
  studyStart: "Studienbeginn",
  earlier: "Früher / nicht angegeben",
  manual: "Bestandenen Kurs manuell erfassen",
  optionalCode: "Optional; leer lassen, falls unbekannt.",
  noCode: "Keine Kursnummer",
  search: "Archivierte Kurse suchen",
  loading: "Semesterarchiv wird geladen…",
  unavailable:
    "Für dieses Semester ist kein Archiv veröffentlicht. Du kannst bestandene Kurse manuell erfassen.",
  failed:
    "Das Archiv konnte nicht geladen werden. Die manuelle Erfassung bleibt verfügbar.",
  importing:
    "Das Semesterarchiv wird vorbereitet. Die manuelle Erfassung bleibt verfügbar.",
  empty: "Keine passenden archivierten Kurse.",
  review: "Ausgewählte Kurse prüfen",
  save: "Bestandene Kurse speichern",
  selected: "Ausgewählte Kurse",
  earned: "Erworbene ECTS",
  next: "Nächstes Semester",
  skip: "Semester überspringen",
  done: "Fertig",
  later: "Später fortsetzen",
  edit: "Bearbeiten",
  remove: "Entfernen",
  cancel: "Abbrechen",
  update: "Änderungen speichern",
  existing: "Vorhandenen Kurs als bestanden markieren",
  duplicate:
    "Dieser Kurs ist bereits im Plan. Bestätige, dass du ihn als bestanden markieren möchtest, anstatt einen weiteren Eintrag anzulegen.",
  already: "Bereits bestanden",
  pinned:
    "Dieser Kurs ist fixiert. Hebe die Fixierung im Studienplan auf, bevor du ihn änderst.",
  more: "Weitere Ergebnisse",
  previous: "Vorherige Ergebnisse",
  recorded: "Erfasste bestandene Kurse",
  reviewHelp:
    "Prüfe die erworbenen ECTS vor dem Speichern. Die Änderungen werden gemeinsam gespeichert.",
  reviewBack: "Zurück zur Auswahl",
  reserved: "MANUAL-Nummern sind für Einträge ohne Kursnummer reserviert.",
  rangeError:
    "Studienbeginn und Planungssemester müssen innerhalb von 24 Semestern liegen. Das Planungssemester darf nicht vor dem Studienbeginn liegen.",
};
const fr: Copy = {
  title: "Enregistrer les cours réussis",
  intro:
    "Sélectionnez les cours réussis, semestre par semestre. Aucun cours n’est automatiquement considéré comme réussi. Vous pouvez passer cette étape et revenir plus tard.",
  planning: "Semestre à planifier",
  planningYear: "Année à planifier",
  studyStart: "Début des études",
  earlier: "Avant / non précisé",
  manual: "Saisir un cours réussi manuellement",
  optionalCode: "Facultatif ; laisser vide si inconnu.",
  noCode: "Sans code de cours",
  search: "Rechercher des cours archivés",
  loading: "Chargement des archives du semestre…",
  unavailable:
    "Aucune archive publiée pour ce semestre. Vous pouvez saisir les cours réussis manuellement.",
  failed:
    "Impossible de charger les archives. La saisie manuelle reste disponible.",
  importing:
    "Les archives de ce semestre sont en préparation. La saisie manuelle reste disponible.",
  empty: "Aucun cours archivé correspondant.",
  review: "Vérifier les cours sélectionnés",
  save: "Enregistrer les cours réussis",
  selected: "Cours sélectionnés",
  earned: "ECTS acquis",
  next: "Semestre suivant",
  skip: "Passer ce semestre",
  done: "Terminer",
  later: "Reprendre plus tard",
  edit: "Modifier",
  remove: "Supprimer",
  cancel: "Annuler",
  update: "Enregistrer les modifications",
  existing: "Marquer le cours existant comme réussi",
  duplicate:
    "Ce cours figure déjà dans votre plan. Confirmez que vous souhaitez le marquer comme réussi plutôt que de créer un doublon.",
  already: "Déjà réussi",
  pinned:
    "Ce cours est verrouillé. Déverrouillez-le dans le plan d’études avant de le modifier.",
  more: "Plus de résultats",
  previous: "Résultats précédents",
  recorded: "Cours réussis enregistrés",
  reviewHelp:
    "Vérifiez les ECTS acquis avant de sauvegarder. Les modifications sont enregistrées ensemble.",
  reviewBack: "Retour à la sélection",
  reserved: "Les codes MANUAL- sont réservés aux cours sans code officiel.",
  rangeError:
    "Le début des études et le semestre à planifier doivent tenir dans 24 semestres, avec la planification au début des études ou après.",
};
export const catchupMessages: Record<Language, Copy> = { en, de, fr };
