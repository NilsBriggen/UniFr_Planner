import { expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDiscovery } from "./useDiscovery";
import {
  publishedCourses,
  publishedPlan,
  publishedStatus,
} from "../planner/published-fixture";
import * as engine from "./engine";

it("restores completed analysis immediately on return and recalculates changed plans", async () => {
  const compute = vi.spyOn(engine, "discoverCourses");
  const catalogue = { status: publishedStatus, courses: publishedCourses() };
  const plan = publishedPlan();
  const first = renderHook(() =>
    useDiscovery(plan, catalogue, "AS-2026", "en"),
  );
  await waitFor(() => expect(first.result.current.discovery).toBeDefined());
  const discovery = first.result.current.discovery;
  first.unmount();
  // Storage/focus reloads may produce a different object with identical content.
  const restored = renderHook(
    ({ plan, term, language }) => useDiscovery(plan, catalogue, term, language),
    {
      initialProps: {
        plan: structuredClone(plan),
        term: "AS-2026",
        language: "en",
      },
    },
  );
  expect(restored.result.current.discovery).toBe(discovery);
  expect(restored.result.current.loading).toBe(false);
  expect(compute).toHaveBeenCalledTimes(1);
  const changed = structuredClone(plan);
  changed.scenarios[0].courses = [];
  restored.rerender({ plan: changed, term: "AS-2026", language: "en" });
  expect(restored.result.current.loading).toBe(true);
  await waitFor(() => expect(restored.result.current.discovery).toBeDefined());
  expect(
    [...restored.result.current.discovery!.assessments.values()].every(
      (a) => !a.selected,
    ),
  ).toBe(true);
  expect(compute).toHaveBeenCalledTimes(2);
  restored.rerender({ plan: changed, term: "SS-2027", language: "fr" });
  await waitFor(() => expect(compute).toHaveBeenCalledTimes(3));
  compute.mockRestore();
});
