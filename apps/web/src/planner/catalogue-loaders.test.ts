import { afterEach, expect, it, vi } from "vitest";
import { loadDiscoveryCatalogue, loadSavedCourses } from "./catalogue-loaders";
import { publishedCourses, publishedStatus } from "./published-fixture";

afterEach(() => vi.unstubAllGlobals());
it("checks only canonical saved codes and deduplicates concurrent consumers", async () => {
  const fetcher = vi.fn(async (request: Request) => {
    const query = new URL(request.url).searchParams;
    expect(query.get("codes")).toBe("SIN.01023,SIN.01024");
    await new Promise((resolve) => setTimeout(resolve, 10));
    return Response.json({
      status: publishedStatus,
      items: publishedCourses(),
      offset: 0,
      limit: 100,
      total: 2,
    });
  });
  vi.stubGlobal("fetch", fetcher);
  const results = await Promise.all([
    loadSavedCourses(["UE-SIN.01023", "SIN.01024"]),
    loadSavedCourses(["SIN.01024", "SIN.01023"]),
  ]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(results[0]).toEqual(results[1]);
  await loadSavedCourses(["SIN.01023", "SIN.01024"]);
  expect(fetcher).toHaveBeenCalledTimes(2); // No stale completed-read cache.
});
it("one departing reader does not cancel another reader's result", async () => {
  const controller = new AbortController();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(request.signal.aborted).toBe(false);
      return Response.json({
        status: publishedStatus,
        items: publishedCourses(),
      });
    }),
  );
  const first = loadDiscoveryCatalogue({ term: "AS-2026" }, controller.signal);
  const second = loadDiscoveryCatalogue({ term: "AS-2026" });
  controller.abort();
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  expect((await second).courses).toHaveLength(2);
});
it("aborts the underlying read when every consumer leaves", async () => {
  let requestSignal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((request: Request) => {
      requestSignal = request.signal;
      return new Promise((_resolve, reject) =>
        request.signal.addEventListener("abort", () =>
          reject(request.signal.reason),
        ),
      );
    }),
  );
  const controller = new AbortController();
  const first = loadDiscoveryCatalogue({ term: "AS-2027" }, controller.signal);
  controller.abort();
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  await Promise.resolve();
  expect(requestSignal?.aborted).toBe(true);
});
it("refuses removal evidence when publication changes across saved-code batches", async () => {
  let calls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) => {
      const codes = new URL(request.url).searchParams.get("codes")!.split(",");
      expect(codes.length).toBeLessThanOrEqual(100);
      return Response.json({
        status: { ...publishedStatus, snapshot_id: String(calls++) },
        items: [],
        offset: 0,
        total: 0,
        limit: 100,
      });
    }),
  );
  await expect(
    loadSavedCourses(Array.from({ length: 101 }, (_, i) => `TEST.${i}`)),
  ).rejects.toThrow("Catalogue changed");
});

it("includes published later-semester alternatives without unrelated catalogue terms", async () => {
  const { loadSuggestionCatalogue } = await import("./catalogue-loaders");
  const requested: string[] = [];
  const [course] = publishedCourses();
  const future = {
    ...course,
    offerings: [
      {
        ...course.offerings[0],
        snapshot_id: publishedStatus.snapshot_id!,
        source_id: "future-only",
        terms: ["SS-2027"],
      },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/terms"))
        return Response.json({
          terms: ["AS-2026", "SS-2027", "AS-2029"],
          status: publishedStatus,
        });
      requested.push(url.searchParams.get("term")!);
      return Response.json({
        status: publishedStatus,
        items: url.searchParams.get("term") === "SS-2027" ? [future] : [],
      });
    }),
  );
  const result = await loadSuggestionCatalogue([
    "AS-2026",
    "SS-2027",
    "AS-2027",
  ]);
  expect(requested.sort()).toEqual(["AS-2026", "SS-2027"]);
  expect(result.courses[0].offerings[0].source_id).toBe("future-only");
});
