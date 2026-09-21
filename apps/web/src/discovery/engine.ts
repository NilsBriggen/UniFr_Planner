import type { Course, Offering } from "../api/client";
import { activeScenario, fromOffering, type Plan } from "../planner/domain";
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
import { resolveRecipeEligibility } from "../../../../packages/domain/src/eligibility";

export type Assessment = {
  match: "requirements" | "subject" | null;
  requirementTitles: string[];
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

function relatedSubject(programme: string, offering: Offering) {
  const name = programme.toLowerCase();
  const subject = [
    offering.course.code,
    ...Object.values(offering.course.titles),
    offering.faculty_domain,
  ]
    .join(" ")
    .toLowerCase();
  const cs = /\b(computer science|cs|informatik|informatique)\b/.test(name);
  const bi =
    /business informatics|wirtschaftsinformatik|informatique de gestion|\bbi\b/.test(
      name,
    );
  return (
    (cs &&
      /\bsin\.|computer science|informatik|programm|algorith|algebra|mathemati|mathémati|datenbank|database|réseaux|networks/.test(
        subject,
      )) ||
    (bi &&
      /\beig\.|business informatics|wirtschaftsinformatik|informatique de gestion|requirements engineering|information systems/.test(
        subject,
      ))
  );
}

/** Programme matches are discovery hints, not assertions of prerequisite eligibility or degree recognition. */
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
  const assessments = new Map<string, Assessment>();
  for (const course of courses)
    for (const offering of course.offerings) {
      const candidate = fromOffering(
        offering,
        "discovery-candidate",
        "discovery-preview",
        false,
      );
      candidate.semester = term;
      candidate.status = "planned";
      const calendar = calendarFor([candidate], term, language);
      const existing = known.get(canonicalCourseCode(course.code));
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
        ? resolveRecipeEligibility(degree, [candidate])
        : root;
      const matching = tree
        ? flattenRequirements(tree).filter(
            (node) =>
              "codes" in node &&
              node.codes.some(
                (code) =>
                  canonicalCourseCode(code) ===
                  canonicalCourseCode(course.code),
              ),
          )
        : [];
      assessments.set(offeringKey(offering), {
        match: matching.length
          ? "requirements"
          : !tree &&
              !requirementError &&
              relatedSubject(plan.programme, offering)
            ? "subject"
            : null,
        requirementTitles: matching.map(
          (node) => node.title[language as "en" | "de" | "fr"],
        ),
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
        prerequisitesUnknown:
          !/^(none|no prerequisites|keine|keine voraussetzungen|aucun|aucun prérequis|aucune condition préalable)\.?$/iu.test(
            offering.prerequisites.trim(),
          ),
      });
    }
  const score = (course: Course) =>
    Math.max(
      ...course.offerings.map((o) => {
        const a = assessments.get(offeringKey(o))!;
        return (
          (a.match === "requirements" ? 20 : a.match === "subject" ? 10 : 0) +
          (a.fit === "fits" ? 2 : a.fit === "unknown" ? 1 : 0)
        );
      }),
    );
  return {
    courses: [...courses].sort(
      (a, b) =>
        score(b) - score(a) ||
        (a.titles[language] ?? a.code).localeCompare(
          b.titles[language] ?? b.code,
          language,
        ),
    ),
    assessments,
    hasProgramme:
      !!root ||
      !!degree ||
      /computer science|informatik|informatique|business informatics|\b(cs|bi)\b/i.test(
        plan.programme,
      ),
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
        (!options.programme || !!a.match) &&
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
