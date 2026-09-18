import {
  publishTemplate,
  type Citation,
  type Localized,
  type ProgrammeTemplate,
  type RequirementNode,
} from "./requirements";

const l = (de: string, fr: string, en: string): Localized => ({ de, fr, en });
const retrievedAt = "2026-09-18";
const source = (
  url: string,
  title: string,
  revisionDate: string | null,
  section: string,
  cohort: string,
): Citation => ({ url, title, revisionDate, section, cohort, retrievedAt });
const departmentUrl =
  "https://www.unifr.ch/inf/en/bsc-minor-business-informatics.html";
const sesUrl = "https://www.unifr.ch/ses/en/studies/minors.html";
const catalogueUrl = "https://www.unifr.ch/scimed/en/plans/bachelor";
const structureUrl =
  "https://www.unifr.ch/studies/en/organisation/beginning-of-studies/structure-of-studies/";
const csAmbiguity = l(
  "Die Quelle nennt 120 ECTS, ihre Validierungspakete ergeben jedoch 44 + 79 = 123 ECTS. Mathematik-Codes, Prüfungsregeln und Übergangsbestimmungen sind noch zu klären.",
  "La source annonce 120 ECTS, mais les paquets de validation donnent 44 + 79 = 123 ECTS. Les codes de mathématiques, les règles d’évaluation et les dispositions transitoires restent à clarifier.",
  "The source states 120 ECTS, but its validation packages total 44 + 79 = 123 ECTS. Mathematics codes, assessment rules and transition provisions still need clarification.",
);
const biAmbiguity = l(
  "Undatierte Zusammenfassung: Kohorten 2024–2026 und Kurscodes nicht bestätigt. Der SES-Studienplan konnte nicht abgerufen werden. Für Informatik-Hauptfach nennt die Abteilung 33 ECTS, der SES-Index 30. Persönliche Zuordnungen sind keine offizielle Anerkennung.",
  "Résumé non daté : cohortes 2024–2026 et codes des cours non confirmés. Le plan SES n’a pas pu être récupéré. Pour la branche principale informatique, le département indique 33 ECTS et l’index SES 30. Les affectations personnelles ne valent pas reconnaissance officielle.",
  "Undated summary: 2024–2026 cohort applicability and course codes are unconfirmed. The SES plan could not be retrieved. For CS majors the department lists 33 ECTS, the SES index 30. Personal allocations do not establish official recognition.",
);
const courseExplanation = l(
  "Pflichtkurs laut zitierter Tabelle; Leistung im Plan selbst angegeben.",
  "Cours obligatoire selon le tableau cité ; réussite déclarée dans le plan.",
  "Compulsory course in the cited table; completion is self-reported in the plan.",
);
type CourseRow = [string, number, string, string, string, string];
const csCourses: CourseRow[] = [
  [
    "SIN.01023",
    6,
    "Programmierung",
    "Introduction à la programmation",
    "Introduction to programming",
    "p. 6 §2.1.1",
  ],
  ["SIN.01021", 5, "Netzwerke", "Réseaux", "Networks", "p. 6 §2.1.1"],
  [
    "SIN.01022",
    5,
    "Rechnerarchitektur",
    "Architecture d’ordinateur",
    "Computer architecture",
    "p. 6 §2.1.1",
  ],
  [
    "SIN.02020",
    5,
    "Systemnahe Programmierung",
    "Programmation proche du système",
    "Systems programming",
    "p. 6 §2.1.1",
  ],
  ["SIN.02022", 5, "Robotik", "Robotique", "Robotics", "p. 6 §2.1.1"],
  [
    "SIN.02023",
    6,
    "Objektorientierte Programmierung",
    "Programmation orientée objets",
    "Object oriented programming",
    "p. 6 §2.1.1",
  ],
  ["SIN.03023", 6, "Algorithmen", "Algorithmique", "Algorithms", "p. 8 §2.2.1"],
  [
    "SIN.03024",
    6,
    "Datenbanken",
    "Bases de données",
    "Databases",
    "p. 8 §2.2.1",
  ],
  [
    "SIN.04028",
    5,
    "Prozesssteuerung",
    "Contrôle de processus",
    "Process control",
    "p. 8 §2.2.1",
  ],
  [
    "SMA.07003",
    5,
    "Mathematische Methoden I",
    "Méthodes mathématiques I",
    "Mathematical methods I",
    "p. 8 §2.2.1",
  ],
  [
    "SIN.04023",
    6,
    "Software Engineering",
    "Génie logiciel",
    "Software engineering",
    "p. 8 §2.2.1",
  ],
  [
    "SIN.04022",
    5,
    "Betriebssysteme",
    "Systèmes d’exploitation",
    "Operating systems",
    "p. 8 §2.2.1",
  ],
  [
    "EIG.00132",
    6,
    "Information Systems Modeling",
    "Information Systems Modeling",
    "Information Systems Modeling",
    "p. 8 §2.2.1",
  ],
  [
    "SMA.07004",
    5,
    "Mathematische Methoden II",
    "Méthodes mathématiques II",
    "Mathematical methods II",
    "p. 8 §2.2.1",
  ],
  [
    "SIN.05020",
    5,
    "Funktionale und logische Programmierung",
    "Programmation fonctionnelle et logique",
    "Functional and logic programming",
    "p. 9 §2.2.3",
  ],
  [
    "SIN.05022",
    5,
    "Nebenläufige und verteilte Systeme",
    "Systèmes concurrents et distribués",
    "Concurrent and distributed systems",
    "p. 9 §2.2.3",
  ],
  [
    "SIN.06021",
    5,
    "Formale Methoden",
    "Méthodes formelles",
    "Formal methods",
    "p. 9 §2.2.3",
  ],
  [
    "SIN.06020",
    15,
    "Bachelorarbeit",
    "Travail de Bachelor",
    "Bachelor thesis",
    "pp. 9–10 §2.2.3–2.2.4",
  ],
];
function cs(year: number): ProgrammeTemplate {
  const revision =
    year === 2024 ? "2024-04-15" : year === 2025 ? "2025-04-14" : "2026-04-13";
  const url = `https://cdn.unifr.ch/scimed/plans/${year === 2026 ? "current" : year}/Plan_BSc_IN_fr.pdf`;
  const cite = (section: string) =>
    source(
      url,
      "Plan d’études du Bachelor of Science en informatique",
      revision,
      section,
      `${year} annual index; transition applicability unresolved`,
    );
  const rows: CourseRow[] = [
    ...csCourses,
    year === 2026
      ? [
          "SIN.06023",
          5,
          "Einführung in Deep Learning",
          "Introduction à l’apprentissage profond",
          "Introduction to deep learning",
          "p. 9 §2.2.3",
        ]
      : [
          "SIN.06022",
          5,
          "Maschinelles Lernen",
          "Apprentissage automatique",
          "Machine learning",
          "p. 9 §2.2.3",
        ],
  ];
  const children: RequirementNode[] = rows.map(
    ([code, minCredits, de, fr, en, section]) => ({
      id: code,
      kind: code === "SIN.06020" ? "project" : "course",
      title: l(de, fr, en),
      explanation: courseExplanation,
      codes: [code],
      minCredits,
      maxCredits: minCredits,
      reviewStatus: "verified",
      citations: [cite(section)],
    }),
  );
  children.push({
    id: "mathematics-propaedeutic",
    kind: "credit_pool",
    codes: [],
    minCredits: 12,
    title: l(
      "Propädeutische Mathematik",
      "Mathématiques propédeutiques",
      "Propaedeutic mathematics",
    ),
    explanation: l(
      "12 ECTS laut Tabelle; berechtigte Kurscodes fehlen in dieser Quelle.",
      "12 ECTS selon le tableau ; codes admissibles absents de cette source.",
      "12 ECTS in the table; eligible course codes are absent from this source.",
    ),
    reviewStatus: "needs_clarification",
    citations: [cite("pp. 6–7 §2.1.1–2.1.3")],
  });
  if (year >= 2025) {
    for (const [id, title] of [
      [
        "library-1",
        l(
          "Bibliothek Teil 1 und Integritätserklärung",
          "Bibliothèque partie 1 et déclaration d’intégrité",
          "Library part 1 and integrity declaration",
        ),
      ],
      [
        "library-2",
        l("Bibliothek Teil 2", "Bibliothèque partie 2", "Library part 2"),
      ],
    ] as const)
      children.push({
        id,
        kind: "checklist",
        title,
        explanation: l(
          "Teil 1 im ersten Semester mit Erklärung; Teil 2 vor oder während der Abschlussarbeit.",
          "Partie 1 au premier semestre avec déclaration ; partie 2 avant ou pendant le travail final.",
          "Part 1 in the first semester with declaration; part 2 before or during the thesis.",
        ),
        reviewStatus: "verified",
        citations: [cite("p. 5 §1.6")],
      });
  }
  const title = l(
    "Informatik Hauptfach · 120 ECTS",
    "Informatique branche principale · 120 ECTS",
    "Computer Science major · 120 ECTS",
  );
  return publishTemplate({
    code: "CS-120",
    version: `${year}.1`,
    degree: "bachelor",
    faculty: "Science and Medicine",
    totalEcts: 120,
    cohortFrom: year,
    cohortTo: year,
    title,
    reviewStatus: "needs_clarification",
    sources: [
      cite("§1–2"),
      source(
        catalogueUrl,
        "Bachelor curricula by year",
        null,
        `Curricula ${year}`,
        `${year}`,
      ),
    ],
    root: {
      id: "cs-major",
      kind: "all_of",
      title,
      minCredits: 120,
      explanation: csAmbiguity,
      reviewStatus: "needs_clarification",
      citations: [cite("p. 6 §2; p. 7 §2.1.3; p. 10 §2.2.5–2.4")],
      children,
    },
  });
}
type BiRow = [string, number, Localized];
const biRows: Record<string, BiRow> = {
  wi1: [
    "wi1",
    6,
    l(
      "Wirtschaftsinformatik I",
      "Informatique de gestion I",
      "Business informatics I",
    ),
  ],
  wi2: [
    "wi2",
    6,
    l(
      "Wirtschaftsinformatik II",
      "Informatique de gestion II",
      "Business informatics II",
    ),
  ],
  modeling: [
    "modeling",
    6,
    l(
      "Information Systems Modeling",
      "Information Systems Modeling",
      "Information Systems Modeling",
    ),
  ],
  operations: [
    "operations",
    6,
    l(
      "Operations Management",
      "Operations Management",
      "Operations management",
    ),
  ],
  programming: [
    "programming",
    6,
    l(
      "Einführung in die Programmierung",
      "Introduction à la programmation",
      "Introduction to programming",
    ),
  ],
  business: [
    "business",
    6,
    l(
      "Betriebswirtschaftslehre",
      "Introduction à la gestion d’entreprise",
      "Business administration",
    ),
  ],
  accounting: [
    "accounting",
    6,
    l("Unternehmensrechnung", "Comptabilité", "Accounting"),
  ],
  project: [
    "project",
    4.5,
    l(
      "Information Systems Development Project",
      "Information Systems Development Project",
      "Information Systems Development Project",
    ),
  ],
  requirements: [
    "requirements",
    4.5,
    l(
      "Requirements Engineering for Information Systems",
      "Requirements Engineering for Information Systems",
      "Requirements Engineering for Information Systems",
    ),
  ],
};
function bi(
  year: number,
  code: string,
  totalEcts: number,
  required: string[],
  elective: number,
  section: string,
): ProgrammeTemplate {
  const citations = [
    source(
      departmentUrl,
      "Minor in Information Systems (Bachelor)",
      null,
      section,
      `${year} requested; applicability unconfirmed`,
    ),
    source(
      sesUrl,
      "Bachelor Minors",
      null,
      "BA 30 / BA 60 ECTS; full study-plan link unavailable",
      `${year} unconfirmed`,
    ),
  ];
  const csMajor = code.startsWith("BI-CS");
  const title = l(
    `Wirtschaftsinformatik · ${totalEcts} ECTS${csMajor ? " · Hauptfach Informatik" : code === "BI-MAN-30" ? " · mit BWL" : ""}`,
    `Informatique de gestion · ${totalEcts} ECTS${csMajor ? " · majeure informatique" : code === "BI-MAN-30" ? " · avec gestion" : ""}`,
    `Business Informatics · ${totalEcts} ECTS${csMajor ? " · CS major" : code === "BI-MAN-30" ? " · with Management" : ""}`,
  );
  const children: RequirementNode[] = required.map((key) => {
    const [id, minCredits, title] = biRows[key];
    return {
      id: `bi-${id}`,
      kind: id === "project" ? "project" : "course",
      codes: [],
      minCredits,
      title,
      explanation: biAmbiguity,
      reviewStatus: "needs_clarification",
      citations,
    };
  });
  if (elective)
    children.push({
      id: "bi-electives",
      kind: "credit_pool",
      codes: [],
      minCredits: elective,
      title: l("Wahlpflichtbereich", "Cours à choix", "Elective pool"),
      explanation: l(
        `Mindestens ${elective} ECTS aus der Quellenliste. Kurscodes und Kohortenregeln müssen vor automatischer Zuordnung bestätigt werden.`,
        `Au moins ${elective} ECTS dans la liste citée. Codes et règles de cohorte à confirmer avant affectation automatique.`,
        `At least ${elective} ECTS from the cited list. Course codes and cohort rules must be confirmed before automatic allocation.`,
      ),
      citations,
      reviewStatus: "needs_clarification",
    });
  return publishTemplate({
    code,
    version: `${year}.1`,
    degree: "bachelor",
    faculty: "Management, Economics and Social Sciences",
    totalEcts,
    cohortFrom: year,
    cohortTo: year,
    title,
    sources: citations,
    reviewStatus: "needs_clarification",
    root: {
      id: "bi-minor",
      kind: "all_of",
      title,
      minCredits: totalEcts,
      children,
      explanation: biAmbiguity,
      citations,
      reviewStatus: "needs_clarification",
    },
  });
}
/** Version identity never follows the moving "current" URL. A correction requires a new entry/version. */
export const programmeTemplates: readonly ProgrammeTemplate[] = Object.freeze(
  [2024, 2025, 2026].flatMap((year) => [
    cs(year),
    bi(
      year,
      "BI-60",
      60,
      [
        "wi1",
        "wi2",
        "modeling",
        "operations",
        "programming",
        "business",
        "accounting",
      ],
      18,
      "Substantial Minor (60 ECTS): mandatory 42 + elective 18; programming exception when CS is a supplementary discipline",
    ),
    bi(
      year,
      "BI-30",
      30,
      ["wi1", "wi2", "modeling", "operations", "business"],
      0,
      "Smaller Minor (30 ECTS)",
    ),
    bi(
      year,
      "BI-CS-60",
      60,
      [
        "wi1",
        "operations",
        "project",
        "requirements",
        "business",
        "accounting",
      ],
      27,
      "Substantial Minor (60 ECTS) for Computer Science Majors: mandatory 33 + elective 27",
    ),
    bi(
      year,
      "BI-CS-33",
      33,
      [
        "wi1",
        "operations",
        "project",
        "requirements",
        "business",
        "accounting",
      ],
      0,
      "Smaller Minor (33 ECTS) for Computer Science Majors; conflicts with SES index 30",
    ),
    bi(
      year,
      "BI-MAN-30",
      30,
      ["wi1", "wi2", "modeling", "operations", "programming"],
      0,
      "Smaller Minor (30 ECTS) with substantial Minor in Management (30 or 60 ECTS)",
    ),
  ]),
);
/** Research order only: these summaries are not executable verified programme packs. */
export const programmeInventory = [
  {
    faculty: "Science and Medicine",
    order: 1,
    structure:
      "Bachelor 120/150 + minors; selected 180 programmes. Master 90/120; Medicine exception 180.",
  },
  {
    faculty: "Management, Economics and Social Sciences",
    order: 2,
    structure:
      "Bachelor usually 180; 120+60 and 90+60+30 exceptions. Minors 60/30. Master generally 90; exceptions.",
  },
  {
    faculty: "Humanities",
    order: 3,
    structure:
      "Bachelor 120+60; named 180 exceptions. Master 90 with optional/required 30 components.",
  },
  {
    faculty: "Education",
    order: 4,
    structure:
      "Bachelor 180 or 120+60. Master variants 60/90/106/120. Minors 60 at Bachelor, 30 at Master.",
  },
  {
    faculty: "Theology",
    order: 5,
    structure:
      "Bachelor 180 or 120+(60 or 30+30). Master 120 or 90+30. Minors available.",
  },
  {
    faculty: "Law",
    order: 6,
    structure:
      "Bachelor full major 180; optional additional 60. Minors 60/30. Master 90.",
  },
].map((row) =>
  Object.freeze({
    ...row,
    status: "backlog" as const,
    source: source(
      structureUrl,
      "Structure of studies",
      null,
      `Structure according to Faculty: ${row.faculty}`,
      "Overview retrieved 2026; programme cohorts not reviewed",
    ),
  }),
);
