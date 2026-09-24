const keys = new Set([
  "q",
  "term",
  "faculty",
  "language",
  "level",
  "ects_min",
  "ects_max",
  "available_day",
  "available_from",
  "available_until",
  "focus",
  "fits",
  "hide_added",
  "offset",
  "scope",
]);
const storageKey = (planId: string, scenarioId: string) =>
  `unifr.catalogueContext:${planId}:${scenarioId}`;

/** Preserve the student's last applied catalogue route for this specific scenario. */
export function rememberCatalogueContext(
  planId: string,
  scenarioId: string,
  query: URLSearchParams,
): void {
  const clean = new URLSearchParams();
  for (const [key, value] of query)
    if (keys.has(key) && value.length <= 200) clean.set(key, value);
  try {
    sessionStorage.setItem(storageKey(planId, scenarioId), clean.toString());
  } catch {
    /* Browsing remains available when storage is disabled. */
  }
}

export function catalogueLinkFor(
  planId: string | null | undefined,
  scenarioId: string | null | undefined,
  explicitQuery?: string,
): string {
  if (explicitQuery)
    return `/catalogue${explicitQuery.startsWith("?") ? explicitQuery : `?${explicitQuery}`}`;
  if (!planId || !scenarioId) return "/catalogue";
  try {
    const saved = sessionStorage.getItem(storageKey(planId, scenarioId));
    return saved ? `/catalogue?${saved}` : "/catalogue";
  } catch {
    return "/catalogue";
  }
}
