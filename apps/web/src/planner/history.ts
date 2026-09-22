import {
  api,
  type ArchiveCoverage,
  type CoursePage,
  type Offering,
} from "../api/client";
export type HistoricalOffering = Offering;
export type Coverage = ArchiveCoverage;
export async function historicalTerms(
  signal: AbortSignal,
): Promise<Coverage[]> {
  const { data, response } = await api.GET("/api/v1/catalogue/terms", {
    params: { query: { scope: "history" } },
    signal,
  });
  if (
    !response.ok ||
    !data ||
    (data.discovery_status === "failed" && !data.coverage?.length)
  )
    throw new Error("history unavailable");
  return data.coverage ?? [];
}
export async function historicalCourses(
  term: string,
  q: string,
  offset: number,
  signal: AbortSignal,
): Promise<CoursePage> {
  const { data, response } = await api.GET("/api/v1/catalogue/courses", {
    params: { query: { scope: "history", term, q, limit: 20, offset } },
    signal,
  });
  if (!response.ok || !data) throw new Error("history unavailable");
  return data;
}
