import {
  createPlan,
  activeScenario,
  type Plan,
  type Selection,
} from "../planner/domain";
import {
  evaluateRequirements,
  type RequirementNode,
} from "../../../../packages/domain/src/requirements";
import type { CatalogueCandidate } from "./engine";

// Deliberately fictional codes. These are never mixed with the live catalogue.
const titles = {
  A: {
    en: "Example · Programming",
    de: "Beispiel · Programmierung",
    fr: "Exemple · Programmation",
  },
  B: {
    en: "Example · Mathematics",
    de: "Beispiel · Mathematik",
    fr: "Exemple · Mathématiques",
  },
  C: {
    en: "Example · Algorithms",
    de: "Beispiel · Algorithmen",
    fr: "Exemple · Algorithmes",
  },
  E: {
    en: "Example · Data workshop",
    de: "Beispiel · Datenwerkstatt",
    fr: "Exemple · Atelier de données",
  },
};
function selection(
  code: keyof typeof titles,
  source: string,
  start: number,
  term = "AS-2026",
): Selection {
  const date = term === "AS-2026" ? "2026-09-21" : "2027-03-01";
  return {
    id: `demo-${code}`,
    code: `DEMO-${code}`,
    titles: titles[code],
    ects: 6,
    status: "planned",
    semester: term,
    pinned: code === "B",
    offering: {
      source_id: source,
      terms: [term],
      meeting_state: "resolved",
      source_url: "https://example.invalid/seed-catalogue",
      snapshot_id: "suggestions-seed-v1",
      development_fixture: true,
      meetings: [
        {
          starts_at: `${date}T${String(start).padStart(2, "0")}:00:00Z`,
          ends_at: `${date}T${String(start + 1).padStart(2, "0")}:00:00Z`,
          location: "PER",
          unresolved: false,
          cancelled: false,
          excluded_dates: [],
          additional_dates: [],
          note: "",
        },
      ],
    },
  };
}
const entry = (
  course: Selection,
  extra: Partial<CatalogueCandidate> = {},
): CatalogueCandidate => ({
  course,
  languages: ["de", "en"],
  prerequisites: [],
  equivalentTo: [],
  evidence: "suggestions-seed-v1",
  ...extra,
});
const unknown = selection("A", "demo-a-unknown", 15);
unknown.offering!.meetings = [];
unknown.offering!.meeting_state = "unresolved";
export const seededCatalogue: readonly CatalogueCandidate[] = [
  entry(selection("A", "demo-a-alternative", 11)),
  entry(selection("C", "demo-c-equivalent", 12), { equivalentTo: ["DEMO-A"] }),
  entry(selection("E", "demo-e-elective", 13), { languages: ["fr"] }),
  entry(selection("A", "demo-a-spring", 9, "SS-2027"), { languages: ["fr"] }),
  entry(unknown),
  entry(selection("A", "demo-a-prerequisite", 16), {
    prerequisites: ["DEMO-PRE"],
  }),
];
export function createExample(id: string, name: string): Plan {
  const plan = createPlan({
    id,
    scenarioId: "example",
    name,
    programme: "SUGGESTIONS-DEMO",
    startTerm: "AS-2026",
    semesterCount: 2,
    targetEcts: 12,
  });
  plan.scenarios[0].courses = [
    selection("A", "demo-a-original", 9),
    selection("B", "demo-b-fixed", 9),
  ];
  return plan;
}
export function exampleRequirements(plan: Plan) {
  const root: RequirementNode = {
    id: "demo-root",
    kind: "all_of",
    minCredits: 12,
    reviewStatus: "draft",
    citations: [],
    title: {
      de: "Beispielanforderungen",
      fr: "Exigences fictives",
      en: "Example requirements",
    },
    explanation: {
      de: "Fiktive Regeln zur Demonstration, keine Studienordnung.",
      fr: "Règles fictives de démonstration, pas un règlement d’études.",
      en: "Fictional demonstration rules, not study regulations.",
    },
    children: [
      {
        id: "demo-required",
        kind: "course",
        codes: ["DEMO-A", "DEMO-C"],
        minCredits: 6,
        reviewStatus: "draft",
        citations: [],
        title: titles.A,
        explanation: titles.A,
      },
      {
        id: "demo-pool",
        kind: "credit_pool",
        codes: ["DEMO-A", "DEMO-E"],
        minCredits: 6,
        allowReuse: true,
        reviewStatus: "draft",
        citations: [],
        title: titles.E,
        explanation: titles.E,
      },
    ],
  };
  return evaluateRequirements(
    root,
    activeScenario(plan).courses,
    activeScenario(plan).requirementEvidence,
  );
}
