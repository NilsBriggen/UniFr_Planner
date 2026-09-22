import { afterEach, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePublishedCatalogue } from "./usePublishedCatalogue";
import { publishedCourses, publishedStatus } from "./published-fixture";

afterEach(() => vi.unstubAllGlobals());
it("never reports removals using a prior subset after importing another course", async () => {
  const [course] = publishedCourses();
  let expanded = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (expanded) throw new Error("offline");
      return Response.json({
        status: publishedStatus,
        items: [course],
        total: 1,
        limit: 100,
        offset: 0,
      });
    }),
  );
  const { result, rerender } = renderHook(
    ({ codes }) => usePublishedCatalogue(codes),
    { initialProps: { codes: [course.code] } },
  );
  await waitFor(() =>
    expect(result.current.catalogue?.courses).toHaveLength(1),
  );
  expanded = true;
  rerender({ codes: [course.code, "NEW-COURSE"] });
  expect(result.current.catalogue).toBeUndefined();
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.catalogue).toBeUndefined();
});
