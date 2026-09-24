import type { Offering } from "../api/client";
import { semesterIndex, type Plan } from "../planner/domain";

type Assignment = Offering["assignments"][number];
type Mapping = {
  programmeId: string;
  variantId: string;
  sourceProgramme: string;
  sourceVersions: readonly string[];
  earliestStart?: string;
};

// Exact identities reviewed against published catalogue snapshot
// 173b2163-8e84-43c6-9891-0dbd649a8108 (2026-09-23), plus direct
// checks of listed source assignments. Each entry pins its source version.
// This map supports browsing only; it is not a recognition or eligibility rule.
export const sourceAssignmentMap: readonly Mapping[] = [
  { programmeId: "bachelor-digitinf-informatics", variantId: "major-120", sourceProgramme: "Computer Science 120", sourceVersions: ["2022_1/V_01"], earliestStart: "AS-2021" },
  { programmeId: "bachelor-sci-mathematics", variantId: "major-120", sourceProgramme: "Mathematics 120", sourceVersions: ["2026_1/V_01"], earliestStart: "AS-2026" },
  { programmeId: "bachelor-sci-mathematics", variantId: "minor-60", sourceProgramme: "Mathematics 60 (MATH 60)", sourceVersions: ["2026_1/V_01"], earliestStart: "AS-2026" },
  { programmeId: "bachelor-digitinf-businessinformatics", variantId: "major-180", sourceProgramme: "Ba - Business Informatics - 180 ECTS", sourceVersions: ["2020-SA_V03"] },
  { programmeId: "bachelor-eco-economics", variantId: "major-180", sourceProgramme: "Ba - Economics - 180 ECTS", sourceVersions: ["2018-SA_V04"] },
  { programmeId: "bachelor-pedpsy-psychology", variantId: "major-180", sourceProgramme: "Psychology 180", sourceVersions: ["SA19_BA_fr_de_bil_v02"] },
  { programmeId: "bachelor-ius-law", variantId: "major-180", sourceProgramme: "Law 180", sourceVersions: ["20221107"] },
  { programmeId: "bachelor-ius-lawparttime", variantId: "major-180", sourceProgramme: "Part-time Law Studies 180", sourceVersions: ["20221107"] },
  { programmeId: "bachelor-sci-biochemistry", variantId: "major-120", sourceProgramme: "Biochemistry 120", sourceVersions: ["2023_1/V_01"] },
  { programmeId: "bachelor-sci-biology", variantId: "major-120", sourceProgramme: "Biology 120", sourceVersions: ["2025_1/V_01"], earliestStart: "AS-2025" },
  { programmeId: "bachelor-sci-chemistry", variantId: "major-150", sourceProgramme: "Chemistry 150", sourceVersions: ["2024_1/V_01"] },
  { programmeId: "bachelor-sci-chemistry", variantId: "major-120-teaching", sourceProgramme: "Chemistry, option Teaching 150", sourceVersions: ["2024_1/V_01"] },
  { programmeId: "bachelor-sci-chemistry", variantId: "minor-60", sourceProgramme: "Chemistry 60", sourceVersions: ["2025_1/V_01"], earliestStart: "AS-2022" },
  { programmeId: "bachelor-lang-german", variantId: "minor-60", sourceProgramme: "German 60", sourceVersions: ["SA23_BA_de_v01"] },
  { programmeId: "bachelor-hist-history", variantId: "major-120", sourceProgramme: "History 120", sourceVersions: ["SA16_BA_bi_v01", "SA16_BA_bi_v02"] },
  { programmeId: "bachelor-hist-contemporaryhistory", variantId: "major-120", sourceProgramme: "Contemporary History 120", sourceVersions: ["SA26_BA_fr_de_bi_v01"] },
  { programmeId: "master-digitinf-businessinformatics", variantId: "major-90", sourceProgramme: "Ma - Business Informatics - 90 ECTS", sourceVersions: ["2020-SA_V01"] },
  { programmeId: "master-digitinf-informatics", variantId: "major-90", sourceProgramme: "MSc in Computer science (BeNeFri)", sourceVersions: ["2023_1/V_01"] },
  { programmeId: "master-eco-economics", variantId: "major-90", sourceProgramme: "Ma - Economics - 90 ECTS", sourceVersions: ["2021-SA_V05 - Dès le SA-2025"], earliestStart: "AS-2025" },
];

export function sourceAssignmentMatches(plan: Plan, assignments: Assignment[]): Assignment[] {
  const selected = plan.degreeSelection?.components ?? [];
  return assignments.filter((assignment) => selected.some((component) =>
    sourceAssignmentMap.some((mapping) =>
      mapping.programmeId === component.programmeId &&
      mapping.variantId === component.variantId &&
      mapping.sourceProgramme === assignment.programme &&
      mapping.sourceVersions.includes(assignment.version)
    ),
  ));
}

export function sourceAssignmentApplicability(plan: Plan, assignment: Assignment): "unconfirmed" | "no_known_mismatch" {
  const selected = plan.degreeSelection?.components ?? [];
  return selected.some((component) => sourceAssignmentMap.some((mapping) =>
    mapping.programmeId === component.programmeId &&
    mapping.variantId === component.variantId &&
    mapping.sourceProgramme === assignment.programme &&
    mapping.sourceVersions.includes(assignment.version) &&
    mapping.earliestStart && semesterIndex(component.startSemester) < semesterIndex(mapping.earliestStart)
  )) ? "unconfirmed" : "no_known_mismatch";
}

export function sourceStage(assignment: Assignment): string | null {
  const path = assignment.paths.join(" · ");
  const match = path.match(/\b[1-4](?:st|nd|rd|th)-[1-4](?:st|nd|rd|th) year\b|\b(?:1st|2nd|3rd|4th|first|second|third|fourth)[ -]?year\b|\b[1-4]\.\s*Jahr\b|\b[1-4](?:ère|e)\s+année\b/iu);
  return match?.[0] ?? null;
}

/** Student preference only: absence or mismatch never excludes an offering. */
export function stagePriority(assignments: Assignment[], preferred: string): number {
  if (!/^[1-4]$/.test(preferred)) return 0;
  return assignments.some((assignment) => {
    const stage = sourceStage(assignment)?.toLowerCase() ?? "";
    const numbers: string[] = stage.match(/[1-4]/g) ?? [];
    const words: Record<string, string> = { first: "1", second: "2", third: "3", fourth: "4" };
    for (const [word, number] of Object.entries(words)) if (stage.includes(word)) numbers.push(number);
    return numbers.includes(preferred);
  }) ? 1 : 0;
}
