import {
  evaluatePlanningRequirements,
  selectedChoices,
} from "../requirements/planning";
import { resolvedPlanDegree } from "../requirements/adapter";
import { resolveRecipeEligibility } from "../../../../packages/domain/src/eligibility";
import { flattenRequirements } from "../../../../packages/domain/src/requirements";
import { Temporal } from "@js-temporal/polyfill";
import {
  canonicalCourseCode,
  courseCodeIn,
  type RequirementResult,
} from "../../../../packages/domain/src/requirements";
import {
  activeScenario,
  updateScenario,
  type Plan,
  type Selection,
} from "../planner/domain";
import {
  calendarFor,
  canonicalTerm,
  detectConflicts,
  localDate,
  zone,
  type Conflict,
} from "../planner/calendar";

/** Source adapters must supply explicit prerequisite and equivalence evidence.
 * null prerequisites means unknown, [] means the source confirms none. */
export type CatalogueCandidate = {
  course: Selection;
  languages: string[];
  prerequisites: string[] | null;
  equivalentTo: string[];
  evidence: string;
};
export type Preferences = {
  languages: string[];
  freeDays: number[];
  highPriorityNodeIds: string[];
};
export type Rank = [number, number, number, number, number, number];
export type Uncertainty =
  | "calendar"
  | "requirements"
  | "override"
  | "requirementLoss"
  | "credits"
  | "fixture";
export type Rejection =
  | "pinned"
  | "prerequisite"
  | "prerequisiteUnknown"
  | "sourceMissing"
  | "sourceConflict"
  | "newConflict"
  | "overrideChange"
  | "requirementError"
  | "duplicate";
export type Suggestion = {
  id: string;
  route: "alternative" | "equivalent" | "elective" | "later";
  before: Selection;
  after: Selection;
  base: string;
  rank: Rank;
  outranksBy: number | null;
  advanced: RequirementResult[];
  impacts: { before: RequirementResult; after: RequirementResult }[];
  requirementsAfter: RequirementResult | null;
  ectsDelta: number | null;
  conflictsBefore: Conflict[];
  conflictsAfter: Conflict[];
  uncertainty: Uncertainty[];
  evidence: string;
};
export type SuggestionResult = {
  suggestions: Suggestion[];
  rejected: { id: string; reason: Rejection; detail: string }[];
  availability: "available" | "noData" | "noSafe";
};
export { applySuggestion, undoRevision, type Revision } from "./revisions";
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const flatten = (r: RequirementResult): RequirementResult[] => [
  r,
  ...r.children.flatMap(flatten),
];
const termIndex = (term: string) =>
  Number(term.slice(3)) * 2 + Number(term.startsWith("AS"));
const key = (c: Conflict) =>
  JSON.stringify([c.kind, [c.first, c.second].sort(), c.start]);
const total = (plan: Plan) =>
  activeScenario(plan)
    .courses.filter((c) => c.status !== "unscheduled")
    .reduce((n, c) => n + (c.ects ?? 0), 0);
const allocated = (r: RequirementResult) => r.earned + r.inProgress + r.planned;
const excess = (r: RequirementResult) =>
  Math.max(0, allocated(r) - (r.node.maxCredits ?? Infinity));
// Ignore object insertion order, but preserve ordered source arrays (meetings).
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, value]) => [key, canonical(value)]),
        )
      : value;
const sourceKey = (item: CatalogueCandidate, term: string) =>
  JSON.stringify([
    canonicalCourseCode(item.course.code),
    item.course.offering?.source_id,
    term,
  ]);

/** Lexicographic order, never a weighted blend: lower-priority preferences
 * cannot outweigh even one point at an earlier criterion. */
export function compareRank(
  a: { rank: Rank; id: string },
  b: { rank: Rank; id: string },
): number {
  for (let i = 0; i < 6; i++)
    if (a.rank[i] !== b.rank[i]) return b.rank[i] - a.rank[i];
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
function calendarState(plan: Plan, preferences: Preferences) {
  const scenario = activeScenario(plan);
  const calendars = scenario.courses
    .filter((c) => c.semester && c.status !== "completed")
    .map((course) => calendarFor([course], course.semester!, "en"));
  const events = calendars.flatMap((c) => c.events);
  const conflicts = detectConflicts(
    events,
    scenario.unavailable,
    scenario.travelMinutes,
  );
  let gapMinutes = 0;
  const days = new Map<string, typeof events>();
  for (const e of events) {
    const day = localDate(e.start);
    days.set(day, [...(days.get(day) ?? []), e]);
  }
  for (const items of days.values()) {
    items.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    let end = Date.parse(items[0].end);
    for (const e of items.slice(1)) {
      gapMinutes += Math.max(0, (Date.parse(e.start) - end) / 60000);
      end = Math.max(end, Date.parse(e.end));
    }
  }
  const freeDayEvents = events.filter((e) =>
    preferences.freeDays.includes(
      Temporal.Instant.from(e.start).toZonedDateTimeISO(zone).dayOfWeek,
    ),
  ).length;
  return {
    conflicts,
    unresolved: calendars.flatMap((c) => c.unresolved),
    unavailable:
      conflicts.filter((c) => c.kind === "unavailable").length + freeDayEvents,
    friction:
      gapMinutes +
      conflicts.filter((c) => c.kind === "travel").length *
        scenario.travelMinutes,
  };
}

export function generateSuggestions(input: {
  plan: Plan;
  catalogue: readonly CatalogueCandidate[];
  requirements: RequirementResult | null;
  preferences?: Preferences;
}): SuggestionResult {
  const { plan, catalogue } = input;
  const preferences = input.preferences ?? {
    languages: [],
    freeDays: [],
    highPriorityNodeIds: [],
  };
  const scenario = activeScenario(plan);
  const result: SuggestionResult = {
    suggestions: [],
    rejected: [],
    availability: "noData",
  };
  // The supplied evaluation carries its selected alternatives. Recomputing
  // allocations must not silently substitute an automatically preferred branch.
  const initial = evaluatePlanningRequirements(
    plan,
    undefined,
    input.requirements,
  );
  // Standalone fixture callers can supply an explicit alternative selection;
  // configured plans derive choices only from retained course/checklist evidence.
  const choices =
    !plan.degreeSelection && !plan.requirements && input.requirements
      ? Object.fromEntries(
          flatten(input.requirements)
            .filter((r) => r.selectedChildId)
            .map((r) => [r.node.id, r.selectedChildId!]),
        )
      : selectedChoices(initial.degree, initial.additional);
  const baseline = evaluatePlanningRequirements(
    plan,
    choices,
    input.requirements,
  ).degree;
  const beforeRules = [
    ...(baseline ? flatten(baseline) : []),
    ...(initial.additional ? flatten(initial.additional) : []),
  ];
  const degree = resolvedPlanDegree(plan);
  const beforeCalendar = calendarState(plan, preferences);
  const beforeHard = new Set(
    beforeCalendar.conflicts.filter((c) => c.kind === "hard").map(key),
  );
  const base = JSON.stringify(plan);
  // Inspect every record before candidate deduplication. A shared identity with
  // different evidence is ambiguous, including permissive/restrictive variants.
  const sourceVersions = new Map<string, Set<string>>();
  for (const item of catalogue) {
    const fingerprint = JSON.stringify(
      canonical({
        ...item,
        prerequisites: item.prerequisites && [...item.prerequisites].sort(),
        languages: [...item.languages].sort(),
        equivalentTo: [...item.equivalentTo].sort(),
      }),
    );
    for (const term of item.course.offering?.terms.map(canonicalTerm) ?? []) {
      const key = sourceKey(item, term);
      const versions = sourceVersions.get(key) ?? new Set<string>();
      versions.add(fingerprint);
      sourceVersions.set(key, versions);
    }
  }
  const seen = new Set<string>();
  for (const before of scenario.courses.filter(
    (c) => c.status !== "completed",
  )) {
    for (const item of catalogue) {
      const source = item.course;
      const same =
        canonicalCourseCode(before.code) === canonicalCourseCode(source.code);
      const equivalent = courseCodeIn(item.equivalentTo, before.code);
      const eligibleNodes = degree
        ? [
            ...flattenRequirements(
              resolveRecipeEligibility(degree, [...scenario.courses, source]),
            ),
            ...(degree.additionalRoot
              ? flattenRequirements(
                  resolveRecipeEligibility(
                    degree,
                    [...scenario.courses, source],
                    degree.additionalRoot,
                  ),
                )
              : []),
          ]
        : beforeRules.map((r) => r.node);
      const elective = eligibleNodes.some(
        (r) =>
          (r.kind === "credit_pool" || r.kind === "course_count") &&
          courseCodeIn(r.codes, before.code) &&
          courseCodeIn(r.codes, source.code),
      );
      if (!same && !equivalent && !elective) continue;
      for (const term of [
        ...new Set(source.offering?.terms.map(canonicalTerm) ?? []),
      ].sort()) {
        if (
          !plan.semesters.includes(term) ||
          (before.semester && termIndex(term) < termIndex(before.semester))
        )
          continue;
        const after: Selection = {
          ...copy(source),
          id: before.id,
          pinned: before.pinned,
          semester: term,
          status: before.status === "unscheduled" ? "planned" : before.status,
        };
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
        const id = JSON.stringify([
          before.id,
          canonicalCourseCode(source.code),
          source.offering?.source_id,
          term,
        ]);
        if (seen.has(id)) continue;
        seen.add(id);
        result.availability = "noSafe";
        const reject = (reason: Rejection, detail = "") =>
          result.rejected.push({ id, reason, detail });
        if (before.pinned) {
          reject("pinned", before.code);
          continue;
        }
        if ((sourceVersions.get(sourceKey(item, term))?.size ?? 0) > 1) {
          reject("sourceConflict", source.code);
          continue;
        }
        if (
          !item.evidence.trim() ||
          !source.offering?.source_url ||
          !source.offering.snapshot_id
        ) {
          reject("sourceMissing", source.code);
          continue;
        }
        if (item.prerequisites === null) {
          reject("prerequisiteUnknown", source.code);
          continue;
        }
        const missing = item.prerequisites.filter(
          (code) =>
            !scenario.courses.some(
              (c) =>
                canonicalCourseCode(c.code) === canonicalCourseCode(code) &&
                c.status === "completed" &&
                (!c.semester || termIndex(c.semester) < termIndex(term)),
            ),
        );
        if (missing.length) {
          reject("prerequisite", missing.join(", "));
          continue;
        }
        if (
          scenario.courses.some(
            (c) =>
              c.id !== before.id &&
              canonicalCourseCode(c.code) === canonicalCourseCode(after.code),
          )
        ) {
          reject("duplicate", after.code);
          continue;
        }
        if (
          !same &&
          scenario.requirementEvidence?.overrides.some(
            (o) => o.courseId === before.id,
          )
        ) {
          reject("overrideChange", before.code);
          continue;
        }
        const next = updateScenario(plan, (s) => ({
          ...s,
          courses: s.courses.map((c) => (c.id === before.id ? after : c)),
        }));
        const calendar = calendarState(next, preferences);
        if (
          calendar.conflicts.some(
            (c) => c.kind === "hard" && !beforeHard.has(key(c)),
          )
        ) {
          reject("newConflict", after.code);
          continue;
        }
        let requirementsAfter: RequirementResult | null;
        let additionalAfter: RequirementResult | null;
        try {
          const evaluated = evaluatePlanningRequirements(
            next,
            choices,
            input.requirements,
          );
          requirementsAfter = evaluated.degree;
          additionalAfter = evaluated.additional;
        } catch {
          reject("requirementError", after.code);
          continue;
        }
        const afterRules = [
          ...(requirementsAfter ? flatten(requirementsAfter) : []),
          ...(additionalAfter ? flatten(additionalAfter) : []),
        ];
        const advanced = afterRules.filter((r) => {
          const old = beforeRules.find((b) => b.node.id === r.node.id);
          return (
            old &&
            (r.remaining < old.remaining ||
              r.remainingCourses < old.remainingCourses)
          );
        });
        const impacts = afterRules.flatMap((after) => {
          const before = beforeRules.find((r) => r.node.id === after.node.id);
          return before &&
            (before.remaining !== after.remaining ||
              before.remainingCourses !== after.remainingCourses ||
              allocated(before) !== allocated(after) ||
              before.status !== after.status ||
              excess(before) !== excess(after))
            ? [{ before, after }]
            : [];
        });
        const uncertainty: Uncertainty[] = [];
        if (calendar.unresolved.length) uncertainty.push("calendar");
        if (
          !baseline ||
          beforeRules.some((r) => r.status === "needs_clarification") ||
          afterRules.some((r) => r.status === "needs_clarification")
        )
          uncertainty.push("requirements");
        if (scenario.requirementEvidence?.overrides.length)
          uncertainty.push("override");
        const statusRank = {
          complete: 4,
          in_progress: 3,
          covered: 2,
          missing: 1,
          needs_clarification: 0,
        };
        if (
          beforeRules.some((old) => {
            const r = afterRules.find((r) => r.node.id === old.node.id);
            return (
              !r ||
              r.remaining > old.remaining ||
              r.remainingCourses > old.remainingCourses ||
              excess(r) > excess(old) ||
              statusRank[r.status] < statusRank[old.status]
            );
          })
        )
          uncertainty.push("requirementLoss");
        if (
          before.ects === null ||
          after.ects === null ||
          scenario.courses.some((c) => c.ects === null)
        )
          uncertainty.push("credits");
        if (after.offering?.development_fixture) uncertainty.push("fixture");
        const priorityGain = advanced
          .filter(
            (r) =>
              !r.children.length &&
              (r.node.kind === "course" ||
                r.node.kind === "project" ||
                preferences.highPriorityNodeIds.includes(r.node.id)),
          )
          .reduce((sum, r) => {
            const old = beforeRules.find((b) => b.node.id === r.node.id)!;
            return (
              sum +
              old.remaining -
              r.remaining +
              old.remainingCourses -
              r.remainingCourses
            );
          }, 0);
        // A disappearing clash is not a proven repair if any candidate calendar is unknown.
        const resolved = calendar.unresolved.length
          ? 0
          : beforeHard.size -
            new Set(
              calendar.conflicts.filter((c) => c.kind === "hard").map(key),
            ).size;
        result.suggestions.push({
          id,
          route:
            before.semester && term !== before.semester
              ? "later"
              : same
                ? "alternative"
                : equivalent
                  ? "equivalent"
                  : "elective",
          before: copy(before),
          after,
          base,
          rank: [
            resolved,
            priorityGain,
            -Math.abs(plan.targetEcts - total(next)) || 0,
            Number(
              item.languages.some((l) => preferences.languages.includes(l)),
            ),
            -calendar.unavailable || 0,
            -calendar.friction || 0,
          ],
          outranksBy: null,
          advanced,
          impacts,
          requirementsAfter,
          ectsDelta:
            before.ects === null || after.ects === null
              ? null
              : after.ects - before.ects,
          conflictsBefore: beforeCalendar.conflicts,
          conflictsAfter: calendar.conflicts,
          uncertainty,
          evidence: item.evidence,
        });
      }
    }
  }
  result.suggestions.sort(compareRank);
  for (const [i, suggestion] of result.suggestions.entries()) {
    const next = result.suggestions[i + 1];
    suggestion.outranksBy = next
      ? suggestion.rank.findIndex((v, j) => v !== next.rank[j])
      : null;
  }
  if (result.suggestions.length) result.availability = "available";
  result.rejected.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return result;
}
