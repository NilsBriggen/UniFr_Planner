import type { Course, Offering } from "../api/client";
import {
  activeScenario,
  fromOffering,
  type Plan,
  type Selection,
} from "../planner/domain";
import {
  calendarFor,
  detectConflicts,
  localDate,
  type CalendarEvent,
  type CalendarResult,
} from "../planner/calendar";
import { requirementTree, resolvedPlanDegree } from "../requirements/adapter";
import {
  canonicalCourseCode,
  flattenRequirements,
} from "../../../../packages/domain/src/requirements";
import {
  evaluatePlanningRequirements,
  resultNodes,
  selectedChoices,
} from "../requirements/planning";
import { resolveRecipeEligibility } from "../../../../packages/domain/src/eligibility";

export type Assessment = {
  match: "requirements" | "subject" | null;
  requirementTitles: string[];
  requirementIds: string[];
  recommended: boolean;
  recommendationKind: "required" | "elective" | "additional" | null;
  contributionEcts: number | null;
  prerequisiteState: "satisfied" | "unknown" | "unmet";
  reviewState: "reviewed" | "needs_clarification";
  selectedStatus: Selection["status"] | null;
  fit: "fits" | "conflict" | "unknown";
  conflicts: string[];
  calendar: CalendarResult;
  selected: boolean;
  prerequisitesUnknown: boolean;
};
export type Discovery = {
  courses: Course[];
  assessments: Map<string, Assessment>;
  hasProgramme: boolean;
  requirementError: boolean;
};
export const offeringKey = (offering: Offering) =>
  `${offering.course.code}:${offering.source_id}`;

/** Recommendations require pinned academic evidence and a measurable outstanding obligation. */
export function discoverCourses(
  plan: Plan,
  courses: Course[],
  term: string,
  language: string,
): Discovery {
  const scenario = activeScenario(plan);
  const base = calendarFor(scenario.courses, term, language);
  const known = new Map(
    scenario.courses.map((c) => [canonicalCourseCode(c.code), c]),
  );
  const names = new Map([
    ...scenario.courses.map(
      (c) => [c.id, c.titles[language] ?? c.titles.en ?? c.code] as const,
    ),
    ...scenario.unavailable.map((p) => [p.id, p.label] as const),
  ]);
  let root = null,
    degree = null,
    requirementError = false;
  try {
    root = requirementTree(plan);
    degree = resolvedPlanDegree(plan);
  } catch {
    requirementError = true;
  }
  let baseline: ReturnType<typeof evaluatePlanningRequirements> = {
    degree: null,
    additional: null,
  };
  try {
    baseline = evaluatePlanningRequirements(plan);
  } catch {
    requirementError = true;
  }
  const choices = selectedChoices(baseline.degree, baseline.additional);
  const beforeNodes = resultNodes(baseline.degree);
  const beforeAdditional = resultNodes(baseline.additional);
  const assessments = new Map<string, Assessment>();
  for (const course of courses)
    for (const offering of course.offerings) {
      const candidate = fromOffering(
        offering,
        "discovery-candidate",
        "discovery-preview",
        false,
      );
      const existing = known.get(canonicalCourseCode(course.code));
      if (existing?.status === "unscheduled") candidate.id = existing.id;
      candidate.semester = term;
      candidate.status = "planned";
      const calendar = calendarFor([candidate], term, language);
      // Exclude this course's stored meetings when inspecting its own offering.
      const conflicts = detectConflicts(
        [
          ...base.events.filter((e) => e.owner !== existing?.id),
          ...calendar.events,
        ],
        scenario.unavailable,
        scenario.travelMinutes,
      ).filter((c) => c.first === candidate.id || c.second === candidate.id);
      const tree = degree
        ? resolveRecipeEligibility(degree, [...scenario.courses, candidate])
        : root;
      const personalNodes = new Set(
        scenario.requirementEvidence?.overrides
          .filter((o) => o.courseId === existing?.id)
          .map((o) => o.nodeId),
      );
      const matching = tree
        ? flattenRequirements(tree).filter(
            (node) =>
              "codes" in node &&
              (personalNodes.has(node.id) ||
                node.codes.some(
                  (code) =>
                    canonicalCourseCode(code) ===
                    canonicalCourseCode(course.code),
                )),
          )
        : [];
      const additionalTree = degree?.additionalRoot
        ? resolveRecipeEligibility(
            degree,
            [...scenario.courses, candidate],
            degree.additionalRoot,
          )
        : null;
      const additionalMatching = additionalTree
        ? flattenRequirements(additionalTree).filter(
            (node) =>
              "codes" in node &&
              (personalNodes.has(node.id) ||
                node.codes.some(
                  (code) =>
                    canonicalCourseCode(code) ===
                    canonicalCourseCode(course.code),
                )),
          )
        : [];
      const matches = [...matching, ...additionalMatching];
      let prerequisiteState: Assessment["prerequisiteState"] =
        /^(none|no prerequisites|keine|keine voraussetzungen|aucun|aucun prérequis|aucune condition préalable)\.?$/iu.test(
          offering.prerequisites.trim(),
        )
          ? "satisfied"
          : "unknown";
      let recommended = false;
      let recommendationKind: Assessment["recommendationKind"] = null;
      let contributionEcts: number | null = candidate.ects === null ? null : 0;
      let reviewState: Assessment["reviewState"] =
        matches.some((n) => n.reviewStatus !== "verified") ||
        (matching.length > 0 &&
          baseline.degree?.status === "needs_clarification") ||
        (additionalMatching.length > 0 &&
          baseline.additional?.status === "needs_clarification") ||
        requirementError
          ? "needs_clarification"
          : "reviewed";
      // Reuse the baseline; irrelevant catalogue entries never invoke the allocator.
      if (
        matches.length &&
        !requirementError &&
        (!existing || existing.status === "unscheduled")
      ) {
        try {
          const next = {
            ...plan,
            scenarios: plan.scenarios.map((s) =>
              s.id === scenario.id
                ? {
                    ...s,
                    courses: existing
                      ? s.courses.map((c) =>
                          c.id === existing.id ? candidate : c,
                        )
                      : [...s.courses, candidate],
                  }
                : s,
            ),
          };
          const after = evaluatePlanningRequirements(next, choices);
          const afterNodes = resultNodes(after.degree);
          const afterAdditional = resultNodes(after.additional);
          const countDeficit = (r: (typeof beforeNodes)[number]): number =>
            r.children.length
              ? r.children.reduce((sum, child) => sum + countDeficit(child), 0)
              : r.remainingCourses;
          const gains = (
            before: typeof beforeNodes,
            after: typeof beforeNodes,
          ) =>
            after.filter((r) => {
              const old = before.find((b) => b.node.id === r.node.id);
              return (
                old &&
                (r.remaining < old.remaining ||
                  countDeficit(r) < countDeficit(old))
              );
            });
          const degreeGains = gains(beforeNodes, afterNodes);
          const additionalGains = gains(beforeAdditional, afterAdditional);
          const gained = [...degreeGains, ...additionalGains];
          const allAfter = [...afterNodes, ...afterAdditional];
          const targets = new Set(
            allAfter
              .filter((r) =>
                r.allocations.some((a) => a.courseId === candidate.id),
              )
              .map((r) => r.node.id),
          );
          // Improvements must not consume evidence needed elsewhere. Unfilled
          // one_of defaults may disappear, but evidence-backed branches cannot.
          const worsens = [...beforeNodes, ...beforeAdditional].some((old) => {
            const current = allAfter.find((r) => r.node.id === old.node.id);
            return current
              ? current.remaining > old.remaining ||
                  countDeficit(current) > countDeficit(old)
              : old.allocations.length > 0;
          });
          // Prerequisite checks use explicit recipe rules, never parsed prose.
          const rules =
            degree?.prerequisites.filter(
              (rule) =>
                targets.has(rule.nodeId) ||
                [...afterNodes, ...afterAdditional].some(
                  (r) =>
                    r.node.id === rule.nodeId &&
                    resultNodes(r).some((n) => targets.has(n.node.id)),
                ),
            ) ?? [];
          if (
            rules.some((rule) =>
              [...afterNodes, ...afterAdditional]
                .find((r) => r.node.id === rule.nodeId)
                ?.explanations.some((e) =>
                  e.en.startsWith("The prerequisite for "),
                ),
            )
          )
            prerequisiteState = "unmet";
          if (
            gained.length &&
            !worsens &&
            [...afterNodes, ...afterAdditional].some((r) =>
              r.allocations.some((a) => a.courseId === candidate.id),
            )
          ) {
            // A newly selected one_of leaf is absent from the baseline. Use
            // the candidate's allocation beneath gaining obligations so all
            // compulsory alternatives receive the same label and priority.
            recommendationKind = degreeGains.some((gain) =>
              resultNodes(gain).some(
                (r) =>
                  (r.node.kind === "course" || r.node.kind === "project") &&
                  r.allocations.some((a) => a.courseId === candidate.id),
              ),
            )
              ? "required"
              : degreeGains.length
                ? "elective"
                : "additional";
            recommended = prerequisiteState !== "unmet";
            // Root deficits already account for reuse and ancestor minimums.
            contributionEcts =
              candidate.ects === null
                ? null
                : Math.min(
                    candidate.ects,
                    Math.max(
                      0,
                      (baseline.degree?.remaining ?? 0) -
                        (after.degree?.remaining ?? 0),
                    ) +
                      Math.max(
                        0,
                        (baseline.additional?.remaining ?? 0) -
                          (after.additional?.remaining ?? 0),
                      ),
                  );
            if (
              gained.some((r) => r.status === "needs_clarification") ||
              candidate.ects === null
            )
              reviewState = "needs_clarification";
          }
        } catch {
          requirementError = true;
          reviewState = "needs_clarification";
        }
      }
      assessments.set(offeringKey(offering), {
        match: matches.length ? "requirements" : null,
        requirementTitles: matches.map(
          (node) => node.title[language as "en" | "de" | "fr"],
        ),
        requirementIds: matches.map((node) => node.id),
        recommended,
        recommendationKind,
        contributionEcts,
        prerequisiteState,
        reviewState,
        selectedStatus: existing?.status ?? null,
        fit: conflicts.length
          ? "conflict"
          : calendar.unresolved.length || base.unresolved.length
            ? "unknown"
            : "fits",
        conflicts: [
          ...new Set(
            conflicts.map(
              (c) =>
                names.get(c.first === candidate.id ? c.second : c.first) ??
                offering.course.titles[language] ??
                course.code,
            ),
          ),
        ],
        calendar,
        selected: !!existing && existing.status !== "unscheduled",
        prerequisitesUnknown: prerequisiteState === "unknown",
      });
    }
  const rank = (course: Course) =>
    course.offerings
      .map((o) => {
        const a = assessments.get(offeringKey(o))!;
        return [
          a.recommended ? 1 : 0,
          a.recommendationKind === "required"
            ? 3
            : a.recommendationKind === "elective"
              ? 2
              : a.recommendationKind === "additional"
                ? 1
                : 0,
          a.prerequisiteState === "satisfied"
            ? 2
            : a.prerequisiteState === "unknown"
              ? 1
              : 0,
          a.fit === "fits" ? 2 : a.fit === "unknown" ? 1 : 0,
          a.contributionEcts ?? -1,
        ];
      })
      .sort(compare)[0] ?? [0, 0, 0, 0, 0];
  function compare(a: number[], b: number[]) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
    return 0;
  }
  return {
    courses: [...courses].sort(
      (a, b) =>
        compare(rank(a), rank(b)) ||
        (a.titles[language] ?? a.code).localeCompare(
          b.titles[language] ?? b.code,
          language,
        ) ||
        a.code.localeCompare(b.code, "en"),
    ),
    assessments,
    hasProgramme: !!root || !!degree,
    requirementError,
  };
}

export function filterDiscovery(
  discovery: Discovery,
  options: { programme: boolean; fits: boolean; hideAdded: boolean },
) {
  return discovery.courses.flatMap((course) => {
    const offerings = course.offerings.filter((offering) => {
      const a = discovery.assessments.get(offeringKey(offering))!;
      return (
        (!options.programme || a.recommended) &&
        (!options.fits || a.fit === "fits") &&
        (!options.hideAdded || !a.selected)
      );
    });
    return offerings.length ? [{ ...course, offerings }] : [];
  });
}

/** Group actual expanded dates; never describe irregular source dates as a weekly recurrence. */
export function lessonGroups(events: CalendarEvent[], language: string) {
  const stamp = (value: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(language, {
      timeZone: "Europe/Zurich",
      ...options,
    }).format(new Date(value));
  const groups = new Map<
    string,
    { time: string; location: string; dates: string[] }
  >();
  for (const event of events) {
    const time = `${stamp(event.start, { weekday: "short" })} ${stamp(event.start, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}–${stamp(event.end, { weekday: localDate(event.start) !== localDate(event.end) ? "short" : undefined, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`;
    const key = `${time}:${event.location}`;
    const group = groups.get(key) ?? {
      time,
      location: event.location,
      dates: [],
    };
    group.dates.push(stamp(event.start, { day: "numeric", month: "short" }));
    groups.set(key, group);
  }
  return [...groups.values()];
}
