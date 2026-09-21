import { afterEach, expect, it, vi } from "vitest";
import * as published from "./published";
import {
  publishedCourses,
  publishedPlan,
  publishedStatus,
} from "./published-fixture";
import { parsePlan } from "./domain";

afterEach(() => vi.unstubAllGlobals());
it("detects only changed or removed stable offerings and never edits stored choices", () => {
  const plan = publishedPlan();
  const before = JSON.stringify(plan);
  const courses = publishedCourses();
  expect(
    published.sourceChanges(plan, { status: publishedStatus, courses }),
  ).toEqual([]);
  courses[0].offerings[0].meetings[0].starts_at = "2026-09-21T08:30:00Z";
  const changes = published.sourceChanges(plan, {
    status: publishedStatus,
    courses,
  });
  expect(changes).toMatchObject([
    { scenarioId: "example", courseId: "demo-A", kind: "changed" },
  ]);
  expect(
    published.sourceChanges(parsePlan(before), {
      status: publishedStatus,
      courses,
    }),
  ).toEqual(changes);
  expect(JSON.stringify(plan)).toBe(before);
  courses[0].offerings.shift();
  expect(
    published.sourceChanges(plan, { status: publishedStatus, courses }),
  ).toMatchObject([{ kind: "removed" }]);
});
it("retains source identity across the exact timetable code namespace alias", () => {
  const plan = publishedPlan(),
    courses = publishedCourses();
  courses[0].code = "UE-SIN.01023";
  for (const offering of courses[0].offerings)
    offering.course.code = courses[0].code;
  expect(
    published.sourceChanges(plan, { status: publishedStatus, courses }),
  ).toEqual([]);
  courses[0].offerings[0].meetings[0].starts_at = "2026-09-21T08:30:00Z";
  expect(
    published.sourceChanges(plan, { status: publishedStatus, courses }),
  ).toMatchObject([{ kind: "changed" }]);
});
it("rejects a catalogue with two spellings of the same academic course", async () => {
  const courses = publishedCourses();
  courses[1].code = "UE-" + courses[0].code;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        items: courses,
        total: 2,
        limit: 100,
        offset: 0,
        status: publishedStatus,
      }),
    ),
  );
  await expect(published.loadPublishedCatalogue()).rejects.toThrow(
    /Duplicate catalogue course/,
  );
});
it("ignores ordering, absent optional meeting fields, and historical completed courses", () => {
  const plan = publishedPlan();
  const courses = publishedCourses();
  courses[0].offerings[0].meetings[0].recurrence = null;
  courses[0].offerings[0].meetings[0].recurrence_id = null;
  courses[0].offerings[0].meetings[0].source_uid = null;
  expect(
    published.sourceChanges(plan, { status: publishedStatus, courses }),
  ).toEqual([]);
  plan.scenarios[0].courses[0].status = "completed";
  courses.shift();
  expect(
    published.sourceChanges(plan, { status: publishedStatus, courses }),
  ).toEqual([]);
});
it("keeps prerequisite prose unknown, while accepting explicit multilingual no-prerequisite evidence", () => {
  const courses = publishedCourses();
  for (const none of ["None", "Keine Voraussetzungen", "Aucun prérequis"]) {
    courses[0].offerings[0].prerequisites = none;
    expect(
      published.catalogueCandidates({ status: publishedStatus, courses })[0]
        .prerequisites,
    ).toEqual([]);
  }
  for (const unknown of [
    "",
    "Recommended: SIN.01024",
    "SIN.01024 or equivalent experience",
  ]) {
    courses[0].offerings[0].prerequisites = unknown;
    expect(
      published.catalogueCandidates({ status: publishedStatus, courses })[0]
        .prerequisites,
    ).toBeNull();
  }
});
it("reads every catalogue page and refuses a mixed publication", async () => {
  const courses = publishedCourses();
  let mixed = false;
  const offsets: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) => {
      const url = new URL(request.url);
      const offset = url.searchParams.get("offset") ?? "0";
      offsets.push(offset);
      return Response.json({
        items: [courses[Number(offset)]],
        total: 2,
        limit: 1,
        offset: Number(offset),
        status:
          mixed && offset === "1"
            ? { ...publishedStatus, snapshot_id: "published-3" }
            : publishedStatus,
      });
    }),
  );
  expect((await published.loadPublishedCatalogue()).courses).toEqual(courses);
  expect(offsets).toEqual(["0", "1"]);
  mixed = true;
  await expect(published.loadPublishedCatalogue()).rejects.toThrow();
});
