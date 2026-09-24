import { afterEach, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
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
  expect(result.current.checkedAt).toBeUndefined();
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.catalogue).toBeUndefined();
});

it("records completed checks, waits for a refresh, and never reports failure as success", async () => {
  const [course] = publishedCourses();
  let fail = false;
  let release: (() => void) | undefined;
  const response = () =>
    Response.json({
      status: publishedStatus,
      items: [course],
      total: 1,
      limit: 100,
      offset: 0,
    });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      if (fail) throw new Error("offline");
      if (release)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return response();
    }),
  );
  const { result } = renderHook(() => usePublishedCatalogue([course.code]));
  await waitFor(() =>
    expect(result.current.checkedAt).toEqual(expect.any(String)),
  );
  const firstCheck = result.current.checkedAt;
  release = () => {};
  act(() => result.current.refresh());
  expect(result.current.loading).toBe(true);
  await act(async () => release?.());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.checkedAt).toEqual(expect.any(String));
  fail = true;
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.checkedAt).toBeDefined();
  expect(firstCheck).toBeDefined();
  expect(result.current.loading).toBe(false);
});
