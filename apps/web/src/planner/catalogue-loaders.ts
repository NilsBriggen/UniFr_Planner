import { api, type Course, type Filters } from "../api/client";
import { canonicalCourseCode } from "../../../../packages/domain/src/requirements";
import { loadPublishedCatalogue, type PublishedCatalogue } from "./published";

type DiscoveryFilters = Omit<Filters, "limit" | "offset"> & { term: string };
const discoveryKey = (filters: DiscoveryFilters) =>
  JSON.stringify(
    Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)),
  );
const discoveryCache = new Map<
  string,
  { catalogue: PublishedCatalogue; expires: number }
>();
let discoveryRevision = 0;

// Browsing may reuse a semester index within this tab. Saved-course checks below
// always make fresh reads, so this cache can never be used as removal evidence.
export function clearDiscoveryCache() {
  discoveryRevision++;
  discoveryCache.clear();
}

export function cachedDiscoveryCatalogue(
  filters: DiscoveryFilters,
  snapshotId?: string | null,
) {
  const key = discoveryKey(filters);
  const cached = discoveryCache.get(key);
  if (!cached) return undefined;
  if (
    cached.expires <= Date.now() ||
    (snapshotId && cached.catalogue.status.snapshot_id !== snapshotId)
  ) {
    discoveryCache.delete(key);
    return undefined;
  }
  discoveryCache.delete(key);
  discoveryCache.set(key, cached);
  return cached.catalogue;
}

// Share only pending reads. A publication can change between visits, so successful
// results are never reused as evidence that a saved course was removed.
const pending = new Map<
  string,
  {
    promise: Promise<PublishedCatalogue>;
    controller: AbortController;
    readers: number;
  }
>();
function shared(
  key: string,
  load: (signal: AbortSignal) => Promise<PublishedCatalogue>,
  signal?: AbortSignal,
) {
  let entry = pending.get(key);
  if (!entry) {
    const controller = new AbortController();
    const promise = load(controller.signal).finally(() => {
      if (pending.get(key)?.promise === promise) pending.delete(key);
    });
    entry = { promise, controller, readers: 0 };
    pending.set(key, entry);
  }
  const current = entry;
  current.readers++;
  return new Promise<PublishedCatalogue>((resolve, reject) => {
    let done = false;
    const finish = (action: () => void) => {
      if (done) return;
      done = true;
      signal?.removeEventListener("abort", abort);
      current.readers--;
      // React StrictMode may resubscribe immediately after an effect cleanup.
      queueMicrotask(() => {
        if (!current.readers && pending.get(key) === current) {
          pending.delete(key);
          current.controller.abort();
        }
      });
      action();
    };
    const abort = () =>
      finish(() =>
        reject(signal?.reason ?? new DOMException("Aborted", "AbortError")),
      );
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    current.promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

export function loadSavedCourses(
  codes: string[],
  signal?: AbortSignal,
): Promise<PublishedCatalogue> {
  const unique = [...new Set(codes.map(canonicalCourseCode))].sort();
  if (!unique.length)
    return Promise.reject(new Error("No saved courses to check"));
  return shared(
    `saved:${unique.join(",")}`,
    async (sharedSignal) => {
      const batches: PublishedCatalogue[] = [];
      // Bound each request and validate every page before interpreting absence.
      for (let i = 0; i < unique.length; i += 100) {
        const filters = {
          codes: unique.slice(i, i + 100).join(","),
        } as Filters;
        batches.push(await loadPublishedCatalogue(sharedSignal, filters));
      }
      const status = batches[0].status;
      if (
        batches.some((batch) => batch.status.snapshot_id !== status.snapshot_id)
      )
        throw new Error("Catalogue changed while checking saved courses");
      const courses = new Map<string, Course>();
      for (const batch of batches)
        for (const course of batch.courses)
          courses.set(canonicalCourseCode(course.code), course);
      return { status, courses: [...courses.values()] };
    },
    signal,
  );
}

export function loadDiscoveryCatalogue(
  filters: DiscoveryFilters,
  signal?: AbortSignal,
  snapshotId?: string | null,
): Promise<PublishedCatalogue> {
  if (signal?.aborted)
    return Promise.reject(
      signal.reason ?? new DOMException("Aborted", "AbortError"),
    );
  const cached = cachedDiscoveryCatalogue(filters, snapshotId);
  if (cached) return Promise.resolve(cached);
  const key = discoveryKey(filters);
  const revision = discoveryRevision;
  return shared(
    `discovery:${revision}:${key}`,
    async (sharedSignal) => {
      const { data, response } = await api.GET("/api/v1/catalogue/discovery", {
        params: { query: filters },
        signal: sharedSignal,
      });
      if (
        !response.ok ||
        !data ||
        data.status.availability !== "available" ||
        !data.status.snapshot_id
      )
        throw new Error("Discovery catalogue unavailable");
      const catalogue = { status: data.status, courses: data.items };
      if (revision === discoveryRevision && !sharedSignal.aborted) {
        discoveryCache.set(key, {
          catalogue,
          expires: Date.now() + 5 * 60_000,
        });
        // A complete index is large; retain only the three most recent searches.
        while (discoveryCache.size > 3)
          discoveryCache.delete(discoveryCache.keys().next().value!);
      }
      return catalogue;
    },
    signal,
  );
}

/** Suggestions can repair future semesters too; include every published term in
 * the plan, not only the semester currently selected in the interface. */
export function loadSuggestionCatalogue(
  semesters: string[],
  signal?: AbortSignal,
): Promise<PublishedCatalogue> {
  const selected = [...new Set(semesters)].sort();
  return shared(
    `suggestions:${selected.join(",")}`,
    async (sharedSignal) => {
      const { data, response } = await api.GET("/api/v1/catalogue/terms", {
        signal: sharedSignal,
      });
      if (
        !response.ok ||
        !data ||
        data.status.availability !== "available" ||
        !data.status.snapshot_id
      )
        throw new Error("Catalogue terms unavailable");
      const terms = data.terms.filter((term) => selected.includes(term));
      const indexes = await Promise.all(
        terms.map((term) => loadDiscoveryCatalogue({ term }, sharedSignal)),
      );
      if (
        indexes.some(
          (index) => index.status.snapshot_id !== data.status.snapshot_id,
        )
      )
        throw new Error("Catalogue changed while loading suggestions");
      const courses = new Map<string, Course>();
      for (const index of indexes)
        for (const course of index.courses) {
          const existing = courses.get(course.code);
          const offerings = new Map(
            [...(existing?.offerings ?? []), ...course.offerings].map(
              (offering) => [
                `${offering.snapshot_id}:${offering.source_id}`,
                offering,
              ],
            ),
          );
          courses.set(course.code, {
            ...course,
            offerings: [...offerings.values()],
          });
        }
      return { status: data.status, courses: [...courses.values()] };
    },
    signal,
  );
}
