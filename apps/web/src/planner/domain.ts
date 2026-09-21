import { z } from "zod";
import type { Offering } from "../api/client";
import { canonicalCourseCode } from "../../../../packages/domain/src/requirements";

const text = z.string().trim().min(1).max(200);
const id = z.string().regex(/^[\w-]{1,100}$/);
const term = z.string().regex(/^(AS|SS)-20\d{2}$/);
const instant = z.iso.datetime({ offset: true });
const dateOrInstant = z.union([z.iso.date(), instant]);
export const meetingSchema = z.strictObject({
  starts_at: instant.nullish(),
  ends_at: instant.nullish(),
  location: z.string().max(2000),
  unresolved: z.boolean(),
  cancelled: z.boolean(),
  recurrence: z.string().max(1000).nullish(),
  excluded_dates: z.array(dateOrInstant).max(1000),
  additional_dates: z.array(dateOrInstant).max(1000),
  recurrence_id: dateOrInstant.nullish(),
  source_uid: z.string().max(1000).nullish(),
  note: z.string().max(10000),
});
export const selectionSchema = z.strictObject({
  id,
  code: text,
  titles: z.record(z.string().max(20), z.string().min(1).max(1000)),
  ects: z.number().min(0).max(300).nullable(),
  status: z.enum(["completed", "current", "planned", "unscheduled"]),
  semester: term.nullable(),
  pinned: z.boolean(),
  offering: z
    .strictObject({
      source_id: text,
      terms: z.array(z.string().max(30)).max(30),
      meetings: z.array(meetingSchema).max(1000),
      meeting_state: z.enum(["resolved", "unresolved"]),
      source_url: z.string().max(2000),
      snapshot_id: z.string().max(200),
      development_fixture: z.boolean(),
    })
    .nullable(),
});
const busySchema = z
  .strictObject({ id, label: text, start: instant, end: instant })
  .refine((x) => Date.parse(x.end) > Date.parse(x.start));
const requirementEvidenceSchema = z.strictObject({
  overrides: z
    .array(
      z.strictObject({
        kind: z.enum(["allocation", "substitution"]),
        courseId: id,
        nodeId: z.string().min(1).max(300),
        reason: z.string().trim().min(1).max(2000),
      }),
    )
    .max(500),
  completedChecklist: z.array(z.string().min(1).max(300)).max(100),
});
const scenarioSchema = z.strictObject({
  id,
  name: text,
  courses: z.array(selectionSchema).max(500),
  unavailable: z.array(busySchema).max(500),
  travelMinutes: z.number().int().min(0).max(180),
  requirementEvidence: requirementEvidenceSchema.optional(),
});
export const planSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id,
    name: text,
    programme: text,
    targetEcts: z.number().min(1).max(600),
    semesters: z.array(term).min(1).max(24),
    activeScenarioId: id,
    scenarios: z.array(scenarioSchema).min(1).max(20),
    requirements: z
      .strictObject({
        cohort: z.number().int().min(2000).max(2100),
        templates: z
          .array(z.strictObject({ code: text, version: text }))
          .min(1)
          .max(3),
      })
      .optional(),
  })
  .superRefine((plan, ctx) => {
    const invalid = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const unique = (values: string[]) => new Set(values).size === values.length;
    if (!unique(plan.semesters) || !unique(plan.scenarios.map((s) => s.id)))
      invalid("duplicate identifier");
    if (!plan.scenarios.some((s) => s.id === plan.activeScenarioId))
      invalid("missing active scenario");
    if (
      plan.requirements &&
      !unique(plan.requirements.templates.map((t) => t.code))
    )
      invalid("duplicate programme");
    for (const scenario of plan.scenarios) {
      if (
        scenario.requirementEvidence &&
        (!unique(
          scenario.requirementEvidence.overrides.map((o) => o.courseId),
        ) ||
          !unique(scenario.requirementEvidence.completedChecklist))
      )
        invalid("duplicate requirement evidence");
      if (
        !unique(scenario.courses.map((c) => c.id)) ||
        !unique(scenario.courses.map((c) => canonicalCourseCode(c.code))) ||
        !unique(scenario.unavailable.map((x) => x.id))
      )
        invalid("duplicate course or period");
      for (const course of scenario.courses) {
        if (
          course.semester !== null &&
          !plan.semesters.includes(course.semester)
        )
          invalid("unknown semester");
        if (course.status === "unscheduled" && course.semester !== null)
          invalid("unscheduled course allocated");
        if (
          (course.status === "planned" || course.status === "current") &&
          course.semester === null
        )
          invalid("missing semester");
        if (Object.values(course.titles).length === 0) invalid("missing title");
      }
    }
  });
export type Plan = z.infer<typeof planSchema>;
export type Selection = z.infer<typeof selectionSchema>;
export type Scenario = Plan["scenarios"][number];
export type Unavailable = Scenario["unavailable"][number];

export function parsePlan(json: string): Plan {
  if (new TextEncoder().encode(json).length > 5_000_000)
    throw new Error("plan exceeds 5 MB");
  let value: unknown = JSON.parse(json);
  // v0 is the same envelope before activeScenarioId existed. Its first scenario
  // was active. Unknown versions and fields are never guessed.
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 0
  ) {
    const legacy = value as Record<string, unknown>;
    if ("activeScenarioId" in legacy) throw new Error("invalid v0");
    value = {
      ...legacy,
      schemaVersion: 1,
      activeScenarioId: Array.isArray(legacy.scenarios)
        ? legacy.scenarios[0]?.id
        : undefined,
    };
  }
  const plan = planSchema.parse(value);
  // The UI exports indented JSON. A committed plan must fit the same import
  // limit in that exact representation, including UTF-8 and formatting bytes.
  if (
    new TextEncoder().encode(JSON.stringify(plan, null, 2)).length > 5_000_000
  )
    throw new Error("plan exceeds 5 MB");
  return plan;
}
export function createPlan(input: {
  id: string;
  scenarioId: string;
  name: string;
  programme: string;
  startTerm: string;
  semesterCount: number;
  targetEcts: number;
}): Plan {
  term.parse(input.startTerm);
  z.number().int().min(1).max(24).parse(input.semesterCount);
  const [season, year] = input.startTerm.split("-");
  const first = Number(year) * 2 + (season === "AS" ? 1 : 0);
  return planSchema.parse({
    schemaVersion: 1,
    id: input.id,
    name: input.name,
    programme: input.programme,
    targetEcts: input.targetEcts,
    semesters: Array.from(
      { length: input.semesterCount },
      (_, n) =>
        `${(first + n) % 2 ? "AS" : "SS"}-${Math.floor((first + n) / 2)}`,
    ),
    activeScenarioId: input.scenarioId,
    scenarios: [
      {
        id: input.scenarioId,
        name: input.name,
        courses: [],
        unavailable: [],
        travelMinutes: 0,
      },
    ],
  });
}
export const activeScenario = (plan: Plan): Scenario =>
  plan.scenarios.find((s) => s.id === plan.activeScenarioId)!;
export function updateScenario(
  plan: Plan,
  update: (scenario: Scenario) => Scenario,
): Plan {
  return planSchema.parse({
    ...plan,
    scenarios: plan.scenarios.map((s) =>
      s.id === plan.activeScenarioId ? update(s) : s,
    ),
  });
}
export const importAsNew = (plan: Plan, newId: string, name: string): Plan =>
  planSchema.parse({ ...plan, id: newId, name });
export function addCourse(plan: Plan, course: Selection): Plan {
  return updateScenario(plan, (s) => ({
    ...s,
    courses: [...s.courses, course],
  }));
}
export function duplicateScenario(
  plan: Plan,
  newId: string,
  name: string,
): Plan {
  return planSchema.parse({
    ...plan,
    activeScenarioId: newId,
    scenarios: [
      ...plan.scenarios,
      { ...activeScenario(plan), id: newId, name },
    ],
  });
}
export function setPinned(plan: Plan, courseId: string, pinned: boolean): Plan {
  return updateScenario(plan, (s) => ({
    ...s,
    courses: s.courses.map((c) => (c.id === courseId ? { ...c, pinned } : c)),
  }));
}
export function allocateCourse(
  plan: Plan,
  courseId: string,
  semester: string | null,
  status: Selection["status"],
): Plan {
  return updateScenario(plan, (s) => ({
    ...s,
    courses: s.courses.map((c) => {
      if (c.id !== courseId) return c;
      if (c.pinned) throw new Error("course is pinned");
      return { ...c, semester, status };
    }),
  }));
}
export function summarize(courses: Selection[]) {
  const result = {
    completed: 0,
    current: 0,
    planned: 0,
    unscheduled: 0,
    unknown: 0,
    hoursMin: 0,
    hoursMax: 0,
  };
  for (const c of courses) {
    if (c.ects === null) result.unknown++;
    else result[c.status] += c.ects;
  }
  result.hoursMin = (result.current + result.planned) * 25;
  result.hoursMax = (result.current + result.planned) * 30;
  return result;
}
export function fromOffering(
  offering: Offering,
  newId: string,
  snapshotId: string,
  developmentFixture: boolean,
): Selection {
  return selectionSchema.parse({
    id: newId,
    code: offering.course.code,
    titles: offering.course.titles,
    ects: offering.ects,
    status: "unscheduled",
    semester: null,
    pinned: false,
    offering: {
      source_id: offering.source_id,
      terms: offering.terms,
      meetings: offering.meetings,
      meeting_state: offering.meeting_state,
      source_url: offering.source_url,
      snapshot_id: snapshotId,
      development_fixture: developmentFixture,
    },
  });
}
