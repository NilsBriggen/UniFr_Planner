import {
  api,
  type CatalogueStatus,
  type Course,
  type Filters,
} from "../api/client";
import { fromOffering, type Plan, type Selection } from "./domain";
import type { CatalogueCandidate } from "../suggestions/engine";
import { canonicalCourseCode } from "../../../../packages/domain/src/requirements";

export type PublishedCatalogue = { status: CatalogueStatus; courses: Course[] };
export type SourceChange = {
  scenarioId: string;
  courseId: string;
  kind: "changed" | "removed";
};

/** Only publish a complete, consistent read. Missing pages are not removals. */
export async function loadPublishedCatalogue(
  signal?: AbortSignal,
  filters: Omit<Filters, "offset" | "limit"> = {},
): Promise<PublishedCatalogue> {
  const courses: Course[] = [];
  let status: CatalogueStatus | undefined;
  let total: number | undefined;
  let offset = 0;
  const codes = new Set<string>();
  do {
    const result = await api.GET("/api/v1/catalogue/courses", {
      params: { query: { ...filters, offset, limit: 100 } },
      signal,
    });
    const page = result.data;
    if (
      !result.response.ok ||
      !page ||
      page.status.availability !== "available" ||
      !page.status.snapshot_id ||
      page.offset !== offset ||
      page.total < 0 ||
      (status && page.status.snapshot_id !== status.snapshot_id) ||
      (total !== undefined && page.total !== total) ||
      (!page.items.length && offset < page.total)
    )
      throw new Error("Incomplete or changing published catalogue");
    status = page.status;
    total = page.total;
    for (const course of page.items) {
      const code = canonicalCourseCode(course.code);
      if (codes.has(code)) throw new Error("Duplicate catalogue course");
      codes.add(code);
      courses.push(course);
    }
    offset += page.items.length;
  } while (offset < total);
  if (courses.length !== total)
    throw new Error("Incomplete published catalogue");
  return { status, courses };
}

export function catalogueCandidates(
  catalogue: PublishedCatalogue,
): CatalogueCandidate[] {
  return catalogue.courses.flatMap((course) =>
    course.offerings.map((offering, index) => ({
      course: fromOffering(
        offering,
        `candidate-${index}`,
        catalogue.status.snapshot_id!,
        catalogue.status.development_fixture,
      ),
      languages: offering.languages,
      // Free text is not a structured prerequisite graph. Do not infer eligibility
      // from an absent field or from a course code embedded in explanatory prose.
      prerequisites:
        /^(none|no prerequisites|keine|keine voraussetzungen|aucun|aucun prérequis|aucune condition préalable)\.?$/iu.test(
          offering.prerequisites.trim(),
        )
          ? []
          : null,
      equivalentTo: [],
      evidence: `${catalogue.status.snapshot_id} · ${offering.source_id} · ${offering.source_url}`,
    })),
  );
}

// Ignore source ordering and null/absent optional values, which do not change a
// schedule. Source identity is compared separately from the saved content.
function canonical(value: unknown): unknown {
  if (Array.isArray(value))
    return value
      .map(canonical)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v != null)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, canonical(v)]),
    );
  return value;
}
function sourceContent(course: Selection) {
  return JSON.stringify(
    canonical({
      ects: course.ects,
      titles: course.titles,
      terms: course.offering?.terms,
      meetings: course.offering?.meetings,
      meeting_state: course.offering?.meeting_state,
    }),
  );
}
export function sourceChanges(
  plan: Plan,
  catalogue: PublishedCatalogue,
): SourceChange[] {
  if (plan.programme === "SUGGESTIONS-DEMO") return [];
  const courses = new Map(
    catalogue.courses.map((course) => [
      canonicalCourseCode(course.code),
      course,
    ]),
  );
  return plan.scenarios.flatMap((scenario) =>
    scenario.courses.flatMap((course): SourceChange[] => {
      const stored = course.offering;
      if (
        !stored ||
        course.status === "completed" ||
        stored.snapshot_id === catalogue.status.snapshot_id ||
        stored.development_fixture !== catalogue.status.development_fixture
      )
        return [];
      const current = courses
        .get(canonicalCourseCode(course.code))
        ?.offerings.find((o) => o.source_id === stored.source_id);
      if (!current)
        return [
          { scenarioId: scenario.id, courseId: course.id, kind: "removed" },
        ];
      const latest = fromOffering(
        current,
        course.id,
        catalogue.status.snapshot_id!,
        catalogue.status.development_fixture,
      );
      return sourceContent(course) === sourceContent(latest)
        ? []
        : [{ scenarioId: scenario.id, courseId: course.id, kind: "changed" }];
    }),
  );
}
