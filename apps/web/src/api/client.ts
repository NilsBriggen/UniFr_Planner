import createClient from "openapi-fetch";
import type { components, paths } from "./schema";

export const api = createClient<paths>({
  baseUrl: window.location.origin,
  fetch: (request) =>
    fetch(
      new Request(request, {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
      }),
    ),
});
export type Course = components["schemas"]["CourseDetail"];
export type Offering = components["schemas"]["PublicOffering"];
export type Meeting = components["schemas"]["Meeting"];
export type CatalogueStatus = components["schemas"]["CatalogueStatus"];
export type CoursePage = components["schemas"]["CoursePage"];
export type Terms = components["schemas"]["CatalogueTerms"];
export type Filters = NonNullable<
  paths["/api/v1/catalogue/courses"]["get"]["parameters"]["query"]
>;

export type ArchiveCoverage = components["schemas"]["ArchiveCoverage"];
