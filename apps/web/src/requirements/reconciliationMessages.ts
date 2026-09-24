export const reconciliationMessages = {
  en: {
    heading: "Credit reconciliation",
    recorded: "Recorded completed courses",
    noHistory: "No completed courses recorded",
    selected: "Selected course credits",
    mapped: "Contribution to modelled requirements",
    unallocated: "Unallocated selected credits",
    unallocatedCompleted:
      "Recorded completed credits without a model assignment",
    unknown: "Courses with unknown ECTS",
    unconfirmed:
      "Remaining requirement total cannot yet be confirmed. Model mappings and personal recognition still need review.",
    provisional: "Model mapping, not faculty-confirmed recognition",
    verified:
      "Mapped to a source-checked rule; personal recognition still needs confirmation",
    unmapped: "No requirement contribution confirmed",
    evidencePending: "Course-level evidence or recognition is pending",
    allocationUnresolved:
      "Code matches a rule, but allocation is unresolved (cap, alternative, reuse or evidence)",
    additional: "Additional programme outside the degree",
    unscheduled: "Not assigned to a semester",
    unknownEcts: "ECTS unknown",
    requirement: "Modelled requirement",
    contribution: "Contribution",
    balance: "Unallocated",
    recordedCredits: "Recorded / selected",
    reason: "Why this differs",
    annual:
      "An annual course carries its published ECTS once. The spring share of workload is not established by this credit value.",
    prior: "Prior-study context",
    priorHelp:
      "Approximate prior study is context only. It does not count as a passed course, prerequisite or recognised degree credit.",
  },
  de: {
    heading: "ECTS-Abgleich",
    recorded: "Erfasste bestandene Kurse",
    noHistory: "Noch keine bestandenen Kurse erfasst",
    selected: "ECTS ausgewählter Kurse",
    mapped: "Beitrag zu modellierten Anforderungen",
    unallocated: "Nicht zugeordnete ausgewählte ECTS",
    unallocatedCompleted: "Erfasste bestandene ECTS ohne Modellzuordnung",
    unknown: "Kurse mit unbekannten ECTS",
    unconfirmed:
      "Die verbleibenden Anforderungen können noch nicht bestätigt werden. Modellzuordnungen und persönliche Anerkennungen müssen geprüft werden.",
    provisional:
      "Modellzuordnung, keine von der Fakultät bestätigte Anerkennung",
    verified:
      "Einer quellengeprüften Regel zugeordnet; persönliche Anerkennung bleibt zu klären",
    unmapped: "Kein Beitrag zu Anforderungen bestätigt",
    evidencePending: "Kursnachweis oder Anerkennung steht aus",
    allocationUnresolved:
      "Die Kursnummer passt zu einer Regel, aber die Zuordnung ist ungeklärt (Obergrenze, Alternative, Wiederverwendung oder Nachweis)",
    additional: "Zusatzprogramm ausserhalb des Abschlusses",
    unscheduled: "Keinem Semester zugeordnet",
    unknownEcts: "ECTS unbekannt",
    requirement: "Modellierte Anforderung",
    contribution: "Beitrag",
    balance: "Nicht zugeordnet",
    recordedCredits: "Erfasst / ausgewählt",
    reason: "Grund für die Differenz",
    annual:
      "Ein Jahreskurs trägt seine veröffentlichten ECTS einmal. Der Arbeitsaufwand im Frühlingssemester lässt sich daraus nicht ableiten.",
    prior: "Kontext früherer Studien",
    priorHelp:
      "Ungefähre frühere Studien sind nur Kontext. Sie gelten weder als bestandener Kurs noch als Voraussetzung oder anerkannte ECTS.",
  },
  fr: {
    heading: "Rapprochement des crédits",
    recorded: "Cours réussis enregistrés",
    noHistory: "Aucun cours réussi enregistré",
    selected: "Crédits des cours sélectionnés",
    mapped: "Contribution aux exigences modélisées",
    unallocated: "Crédits sélectionnés non attribués",
    unallocatedCompleted:
      "Crédits réussis enregistrés sans correspondance dans le modèle",
    unknown: "Cours avec ECTS inconnus",
    unconfirmed:
      "Le total des exigences restantes ne peut pas encore être confirmé. Les correspondances du modèle et les reconnaissances personnelles doivent être vérifiées.",
    provisional:
      "Correspondance du modèle, pas une reconnaissance confirmée par la faculté",
    verified:
      "Rattaché à une règle vérifiée dans la source ; la reconnaissance personnelle reste à confirmer",
    unmapped: "Aucune contribution aux exigences confirmée",
    evidencePending: "Justificatif du cours ou reconnaissance en attente",
    allocationUnresolved:
      "Le code correspond à une règle, mais l'attribution reste à clarifier (plafond, choix, réutilisation ou justificatif)",
    additional: "Programme supplémentaire hors diplôme",
    unscheduled: "Non attribué à un semestre",
    unknownEcts: "ECTS inconnus",
    requirement: "Exigence modélisée",
    contribution: "Contribution",
    balance: "Non attribué",
    recordedCredits: "Enregistrés / sélectionnés",
    reason: "Motif de l'écart",
    annual:
      "Un cours annuel porte ses ECTS publiés une seule fois. Cette valeur ne détermine pas la charge de travail du semestre de printemps.",
    prior: "Contexte des études antérieures",
    priorHelp:
      "Les études antérieures approximatives servent seulement de contexte. Elles ne comptent ni comme cours réussi, ni comme prérequis, ni comme crédits reconnus.",
  },
} as const;
