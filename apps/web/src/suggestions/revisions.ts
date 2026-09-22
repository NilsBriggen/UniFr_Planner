import { activeScenario, updateScenario, type Plan } from "../planner/domain";
import type { Suggestion } from "./engine";
export type Revision = { before: Plan; after: Plan; suggestionId: string };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function applySuggestion(plan: Plan, suggestion: Suggestion): Revision {
  if (JSON.stringify(plan) !== suggestion.base)
    throw new Error("stale comparison");
  const before = activeScenario(plan).courses.find(
    (c) => c.id === suggestion.before.id,
  );
  if (!before || before.pinned) throw new Error("pinned or missing course");
  const after = updateScenario(plan, (s) => ({
    ...s,
    courses: s.courses.map((c) =>
      c.id === before.id ? copy(suggestion.after) : c,
    ),
  }));
  return { before: copy(plan), after, suggestionId: suggestion.id };
}
export function undoRevision(plan: Plan, revision: Revision): Plan {
  if (JSON.stringify(plan) !== JSON.stringify(revision.after))
    throw new Error("stale revision");
  return copy(revision.before);
}
