import type { CoursePage, Offering } from "../api/client";
export type HistoricalOffering = Offering & { snapshot_id?: string };
export type Coverage = {
  term: string;
  status: "pending" | "loading" | "available" | "failed" | "unavailable";
  snapshot_id?: string | null;
  checked_at?: string | null;
};
export async function historicalTerms(
  signal: AbortSignal,
): Promise<Coverage[]> {
  const response = await fetch("/api/v1/catalogue/terms?scope=history", {
    signal,
  });
  if (!response.ok) throw new Error("history unavailable");
  const body = (await response.json()) as { coverage?: Coverage[] };
  return Array.isArray(body.coverage) ? body.coverage : [];
}
export async function historicalCourses(
  term: string,
  q: string,
  offset: number,
  signal: AbortSignal,
): Promise<CoursePage> {
  const query = new URLSearchParams({
    scope: "history",
    term,
    q,
    limit: "20",
    offset: String(offset),
  });
  const response = await fetch(`/api/v1/catalogue/courses?${query}`, {
    signal,
  });
  if (!response.ok) throw new Error("history unavailable");
  return response.json() as Promise<CoursePage>;
}
