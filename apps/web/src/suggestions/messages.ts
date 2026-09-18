export const suggestionMessages = {
  en: {
    routes: {
      alternative: "Alternative offering",
      equivalent: "Equivalent course",
      elective: "Eligible elective",
      later: "Later semester",
    },
    nav: "Suggestions",
    title: "Find a better fit",
    intro:
      "Compare one change at a time. You decide what becomes part of your plan.",
    availability:
      "Live catalogue unavailable. Only a deterministic, fictional example is available. No current UniFr offerings are confirmed here.",
    example: "Open a separate example plan",
    exampleName: "Example · Resolve a clash",
    noPlan: "Open your plan or try the example to compare changes.",
    noData:
      "No source-supported candidate data for this plan. This does not mean that no alternatives exist.",
    noSafe:
      "No safe suggestion within the available data. Review the reasons below or adjust your pins and constraints.",
    demo: "Fictional example catalogue",
    scenario: "Scenario",
    compare: "Compare",
    comparison: "Compare this change",
    before: "Current selection",
    after: "Proposed selection",
    apply: "Apply this change",
    cancel: "Close comparison",
    undo: "Undo last suggestion",
    applied: "Change saved. Your previous plan is available with Undo.",
    undone: "Previous plan restored exactly.",
    stale:
      "This plan has changed. A previous comparison or Undo cannot overwrite those edits. Reload to review the current saved plan.",
    uncertainty: "Uncertainty and limits",
    why: "Why this position",
    only: "Only candidate passing the available hard constraints.",
    last: "Last among the eligible candidates under this ranking.",
    better: "Ahead of the next alternative on",
    tie: "Equal scores; stable course/offering/term identifier breaks the tie.",
    ranking: [
      "Existing clashes resolved",
      "Compulsory / priority gap coverage",
      "Distance to the ECTS target",
      "Preferred teaching language",
      "Unavailable periods / free days",
      "Timetable gaps / travel risks",
    ],
    rankingHelp:
      "Applied in this exact order; a later preference never outweighs an earlier criterion. Scores are shown below (higher is better). Gaps and travel are measured in minutes. ECTS target covers the whole plan.",
    ects: "ECTS change",
    advanced: "Requirements advanced",
    noneAdvanced: "No additional requirement covered.",
    conflicts: "Known conflicts",
    hard: "Overlaps",
    travel: "Travel risks",
    unavailable: "Unavailable-period overlaps",
    resolved: "Proven clashes resolved",
    unknown: "Unknown",
    source: "Evidence",
    offering: "Offering",
    term: "Semester",
    meeting: "Dated meetings · Europe/Zurich",
    confirm:
      "I have reviewed the uncertainty and any loss of requirement coverage.",
    preferences: "Your preferences",
    languages: "Preferred teaching languages",
    freeDays: "Desired free days",
    weekdays: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ],
    rejections: "Why other changes were excluded",
    back: "Open degree plan",
    warnings: {
      calendar:
        "Some calendars are unresolved. Absence of a known clash is not proof of compatibility; no clash repair is claimed.",
      requirements:
        "Requirement rules are unverified or unavailable. Coverage is provisional and needs faculty confirmation.",
      override:
        "Personal overrides remain in place; their recognition is not independently confirmed.",
      requirementLoss:
        "Warning: this change reduces or weakens existing requirement coverage. Review it before applying.",
      credits:
        "Unknown ECTS prevent a complete credit comparison and target assessment.",
      fixture:
        "Fictional seeded offering and rule evidence, not a current university course.",
    },
    reasons: {
      pinned: "Pinned selection cannot move",
      prerequisite: "Required completed prerequisite missing",
      prerequisiteUnknown: "Prerequisites unknown; candidate excluded",
      sourceMissing: "Offering source evidence missing",
      newConflict: "Would introduce a new hard conflict",
      overrideChange:
        "Would reinterpret a personal override for a different course",
      requirementError: "Requirement evidence cannot be evaluated",
      duplicate: "Course already selected",
    },
  },
  de: {
    routes: {
      alternative: "Alternatives Angebot",
      equivalent: "Gleichwertiger Kurs",
      elective: "Zulässiger Wahlkurs",
      later: "Späteres Semester",
    },
    nav: "Vorschläge",
    title: "Passende Alternativen finden",
    intro:
      "Vergleiche jeweils eine Änderung. Du entscheidest, was in deinen Plan übernommen wird.",
    availability:
      "Live-Katalog nicht verfügbar. Es gibt nur ein deterministisches, fiktives Beispiel. Aktuelle UniFr-Kursangebote sind hier nicht bestätigt.",
    example: "Separaten Beispielplan öffnen",
    exampleName: "Beispiel · Kollision lösen",
    noPlan:
      "Öffne deinen Plan oder das Beispiel, um Änderungen zu vergleichen.",
    noData:
      "Keine quellenbelegten Alternativdaten für diesen Plan. Das bedeutet nicht, dass keine Alternativen existieren.",
    noSafe:
      "Kein sicherer Vorschlag mit den verfügbaren Daten. Prüfe die Gründe oder passe Fixierungen und Einschränkungen an.",
    demo: "Fiktiver Beispielkatalog",
    scenario: "Szenario",
    compare: "Vergleichen",
    comparison: "Änderung vergleichen",
    before: "Aktuelle Auswahl",
    after: "Vorgeschlagene Auswahl",
    apply: "Änderung übernehmen",
    cancel: "Vergleich schliessen",
    undo: "Letzten Vorschlag rückgängig machen",
    applied:
      "Änderung gespeichert. Der vorherige Plan kann wiederhergestellt werden.",
    undone: "Vorheriger Plan exakt wiederhergestellt.",
    stale:
      "Der Plan wurde geändert. Ein alter Vergleich oder das Rückgängigmachen darf diese Änderungen nicht überschreiben. Lade den aktuellen gespeicherten Plan neu.",
    uncertainty: "Unsicherheit und Grenzen",
    why: "Warum diese Position",
    only: "Einziger Kandidat, der die verfügbaren harten Bedingungen erfüllt.",
    last: "Letzter der zulässigen Kandidaten in dieser Rangfolge.",
    better: "Vor der nächsten Alternative beim Kriterium",
    tie: "Gleiche Werte; die stabile Kurs-/Angebots-/Semesterkennung entscheidet.",
    ranking: [
      "Bestehende Kollisionen lösen",
      "Pflicht- / Prioritätslücken abdecken",
      "Abstand zum ECTS-Ziel",
      "Bevorzugte Unterrichtssprache",
      "Sperrzeiten / freie Tage",
      "Stundenplanlücken / Wegerisiken",
    ],
    rankingHelp:
      "Genau in dieser Reihenfolge; spätere Präferenzen überwiegen frühere Kriterien nie. Werte unten: höher ist besser. Lücken und Wege in Minuten. Das ECTS-Ziel gilt für den gesamten Plan.",
    ects: "ECTS-Änderung",
    advanced: "Fortschritt bei Anforderungen",
    noneAdvanced: "Keine zusätzliche Anforderung abgedeckt.",
    conflicts: "Bekannte Konflikte",
    hard: "Überschneidungen",
    travel: "Wegerisiken",
    unavailable: "Überschneidungen mit Sperrzeiten",
    resolved: "Nachweislich gelöste Kollisionen",
    unknown: "Unbekannt",
    source: "Nachweis",
    offering: "Angebot",
    term: "Semester",
    meeting: "Datierte Termine · Europe/Zurich",
    confirm:
      "Ich habe die Unsicherheiten und einen möglichen Verlust an Anforderungsabdeckung geprüft.",
    preferences: "Deine Präferenzen",
    languages: "Bevorzugte Unterrichtssprachen",
    freeDays: "Gewünschte freie Tage",
    weekdays: [
      "Montag",
      "Dienstag",
      "Mittwoch",
      "Donnerstag",
      "Freitag",
      "Samstag",
      "Sonntag",
    ],
    rejections: "Warum andere Änderungen ausgeschlossen sind",
    back: "Studienplan öffnen",
    warnings: {
      calendar:
        "Einige Kalender sind ungeklärt. Kein bekannter Konflikt beweist keine Vereinbarkeit; eine gelöste Kollision wird nicht behauptet.",
      requirements:
        "Anforderungsregeln sind ungeprüft oder fehlen. Die Abdeckung ist vorläufig und muss von der Fakultät bestätigt werden.",
      override:
        "Persönliche Ausnahmen bleiben bestehen; ihre Anerkennung ist nicht unabhängig bestätigt.",
      requirementLoss:
        "Warnung: Diese Änderung verringert oder schwächt die bisherige Anforderungsabdeckung. Vor dem Übernehmen prüfen.",
      credits:
        "Unbekannte ECTS verhindern einen vollständigen Vergleich und die Zielprüfung.",
      fixture:
        "Fiktives Kursangebot und Regeln aus Beispieldaten, kein aktueller Universitätskurs.",
    },
    reasons: {
      pinned: "Fixierte Auswahl darf nicht verschoben werden",
      prerequisite: "Erforderliche abgeschlossene Voraussetzung fehlt",
      prerequisiteUnknown: "Voraussetzungen unbekannt; Kandidat ausgeschlossen",
      sourceMissing: "Quellennachweis zum Angebot fehlt",
      newConflict: "Würde einen neuen harten Konflikt erzeugen",
      overrideChange:
        "Würde eine persönliche Ausnahme auf einen anderen Kurs übertragen",
      requirementError: "Anforderungsnachweise sind nicht auswertbar",
      duplicate: "Kurs bereits ausgewählt",
    },
  },
  fr: {
    routes: {
      alternative: "Autre offre",
      equivalent: "Cours équivalent",
      elective: "Cours à choix admissible",
      later: "Semestre ultérieur",
    },
    nav: "Suggestions",
    title: "Trouver une meilleure option",
    intro:
      "Comparez un changement à la fois. Vous décidez ce qui entre dans votre plan.",
    availability:
      "Catalogue en direct indisponible. Seul un exemple fictif et déterministe est disponible. Aucune offre UniFr actuelle n’est confirmée ici.",
    example: "Ouvrir un plan d’exemple séparé",
    exampleName: "Exemple · Résoudre un conflit",
    noPlan: "Ouvrez votre plan ou l’exemple pour comparer des changements.",
    noData:
      "Aucune donnée d’alternative étayée pour ce plan. Cela ne signifie pas qu’il n’existe aucune alternative.",
    noSafe:
      "Aucune suggestion sûre avec les données disponibles. Examinez les raisons ou ajustez les cours fixés et les contraintes.",
    demo: "Catalogue d’exemple fictif",
    scenario: "Scénario",
    compare: "Comparer",
    comparison: "Comparer ce changement",
    before: "Sélection actuelle",
    after: "Sélection proposée",
    apply: "Appliquer ce changement",
    cancel: "Fermer la comparaison",
    undo: "Annuler la dernière suggestion",
    applied:
      "Changement enregistré. Votre plan précédent peut être restauré avec Annuler.",
    undone: "Plan précédent restauré à l’identique.",
    stale:
      "Ce plan a changé. Une ancienne comparaison ou annulation ne peut pas écraser ces modifications. Rechargez le plan enregistré actuel.",
    uncertainty: "Incertitudes et limites",
    why: "Pourquoi cette position",
    only: "Seul candidat respectant les contraintes strictes disponibles.",
    last: "Dernier des candidats admissibles selon ce classement.",
    better: "Devant l’alternative suivante sur le critère",
    tie: "Scores égaux ; l’identifiant stable cours/offre/semestre départage les candidats.",
    ranking: [
      "Conflits existants résolus",
      "Exigences obligatoires / prioritaires",
      "Distance à l’objectif ECTS",
      "Langue d’enseignement préférée",
      "Indisponibilités / jours libres",
      "Creux dans l’horaire / trajets",
    ],
    rankingHelp:
      "Dans cet ordre précis ; une préférence ultérieure ne prime jamais sur un critère antérieur. Scores ci-dessous : plus élevé est mieux. Creux et trajets en minutes. L’objectif ECTS concerne le plan entier.",
    ects: "Variation ECTS",
    advanced: "Exigences avancées",
    noneAdvanced: "Aucune exigence supplémentaire couverte.",
    conflicts: "Conflits connus",
    hard: "Chevauchements",
    travel: "Risques de trajet",
    unavailable: "Chevauchements d’indisponibilité",
    resolved: "Conflits résolus avec certitude",
    unknown: "Inconnu",
    source: "Justificatif",
    offering: "Offre",
    term: "Semestre",
    meeting: "Séances datées · Europe/Zurich",
    confirm:
      "J’ai examiné les incertitudes et toute perte de couverture des exigences.",
    preferences: "Vos préférences",
    languages: "Langues d’enseignement préférées",
    freeDays: "Jours libres souhaités",
    weekdays: [
      "Lundi",
      "Mardi",
      "Mercredi",
      "Jeudi",
      "Vendredi",
      "Samedi",
      "Dimanche",
    ],
    rejections: "Pourquoi d’autres changements sont exclus",
    back: "Ouvrir le plan d’études",
    warnings: {
      calendar:
        "Certains calendriers restent inconnus. L’absence de conflit connu ne prouve pas la compatibilité ; aucune résolution n’est affirmée.",
      requirements:
        "Règles non vérifiées ou indisponibles. La couverture est provisoire et doit être confirmée par la faculté.",
      override:
        "Les dérogations personnelles restent en place ; leur reconnaissance n’est pas confirmée indépendamment.",
      requirementLoss:
        "Attention : ce changement réduit ou affaiblit la couverture actuelle des exigences. Vérifiez avant d’appliquer.",
      credits:
        "Des ECTS inconnus empêchent une comparaison complète et l’évaluation de l’objectif.",
      fixture:
        "Offre et règles fictives issues d’exemples, pas un cours universitaire actuel.",
    },
    reasons: {
      pinned: "Un cours fixé ne peut pas être déplacé",
      prerequisite: "Prérequis validé manquant",
      prerequisiteUnknown: "Prérequis inconnus ; candidat exclu",
      sourceMissing: "Justificatif de l’offre absent",
      newConflict: "Introduirait un nouveau conflit strict",
      overrideChange: "Réinterpréterait une dérogation pour un autre cours",
      requirementError: "Impossible d’évaluer les justificatifs",
      duplicate: "Cours déjà sélectionné",
    },
  },
};
