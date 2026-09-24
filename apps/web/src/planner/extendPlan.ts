import { planSchema, semesterIndex, type Plan } from "./domain";

/** Extend the existing horizon without replacing its courses, scenarios or evidence. */
export function extendPlanToTerm(plan: Plan, targetTerm: string): Plan {
  const last = plan.semesters.at(-1)!;
  if (plan.semesters.includes(targetTerm)) return plan;
  if (!/^(AS|SS)-\d{4}$/.test(targetTerm))
    throw new RangeError("Invalid semester");
  const end = semesterIndex(targetTerm);
  const start = semesterIndex(last);
  if (end <= start) throw new RangeError("Cannot extend backward");
  if (plan.semesters.length + end - start > 24)
    throw new RangeError("A plan can contain at most 24 semesters");
  const appended = Array.from({ length: end - start }, (_, index) => {
    const value = start + index + 1;
    return `${value % 2 ? "AS" : "SS"}-${Math.floor(value / 2)}`;
  });
  const next = { ...plan, semesters: [...plan.semesters, ...appended] };
  planSchema.parse(next);
  return next;
}
