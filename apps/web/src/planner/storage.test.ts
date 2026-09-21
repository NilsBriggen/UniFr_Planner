import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  createPlan,
  duplicateScenario,
  parsePlan,
  planSchema,
  type Plan,
} from "./domain";
import { PlanStore } from "./storage";

const plan = () =>
  createPlan({
    id: "plan",
    scenarioId: "main",
    name: "Degree",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 6,
    targetEcts: 180,
  });
describe("IndexedDB plan persistence", () => {
  it("rejects oversized scenario duplication before writing and keeps saved backups importable", async () => {
    const factory = new IDBFactory();
    const store = new PlanStore(factory);
    const original = plan();
    original.scenarios[0].courses = [
      {
        id: "course",
        code: "CS1",
        titles: { en: "Course" },
        ects: 6,
        status: "planned",
        semester: "AS-2026",
        pinned: false,
        offering: {
          source_id: "offering",
          terms: ["AS-2026"],
          meeting_state: "resolved",
          source_url: "https://www.unifr.ch",
          snapshot_id: "snapshot",
          development_fixture: true,
          meetings: Array.from({ length: 100 }, () => ({
            starts_at: "2026-09-21T10:00:00Z",
            ends_at: "2026-09-21T11:00:00Z",
            location: "PER",
            unresolved: false,
            cancelled: false,
            excluded_dates: [],
            additional_dates: [],
            note: "é".repeat(5000),
          })),
        },
      },
    ];
    expect(() => planSchema.parse(original)).not.toThrow();
    expect(
      new TextEncoder().encode(JSON.stringify(original)).length,
    ).toBeGreaterThan(1_000_000);
    await store.save(original);
    const nonfinite = structuredClone(original);
    nonfinite.scenarios[0].courses[0].ects = Infinity;
    await expect(store.save(nonfinite)).rejects.toThrow();
    let duplicated: Plan = original;
    for (let n = 1; n <= 4; n++)
      duplicated = duplicateScenario(duplicated, `copy-${n}`, `Copy ${n}`);
    expect(() => planSchema.parse(duplicated)).not.toThrow();
    expect(
      new TextEncoder().encode(JSON.stringify(duplicated)).length,
    ).toBeGreaterThan(5_000_000);
    await expect(store.save(duplicated)).rejects.toThrow(/5 MB/);
    const nearLimit = structuredClone(duplicated);
    for (const scenario of nearLimit.scenarios)
      for (const meeting of scenario.courses[0].offering!.meetings)
        meeting.note = "";
    const overhead = new TextEncoder().encode(JSON.stringify(nearLimit)).length;
    const noteLength = Math.floor((5_000_000 - 500 - overhead) / 500);
    for (const scenario of nearLimit.scenarios)
      for (const meeting of scenario.courses[0].offering!.meetings)
        meeting.note = "x".repeat(noteLength);
    expect(() => planSchema.parse(nearLimit)).not.toThrow();
    expect(
      new TextEncoder().encode(JSON.stringify(nearLimit)).length,
    ).toBeLessThan(5_000_000);
    expect(
      new TextEncoder().encode(JSON.stringify(nearLimit, null, 2)).length,
    ).toBeGreaterThan(5_000_000);
    await expect(store.save(nearLimit)).rejects.toThrow(/5 MB/);
    const restored = await store.load();
    expect(restored.plans).toEqual([original]);
    expect(parsePlan(JSON.stringify(restored.plans[0], null, 2))).toEqual(
      original,
    );
    // Separate small records may collectively exceed the per-backup limit.
    for (let n = 1; n <= 5; n++)
      await store.save({ ...original, id: `separate-${n}` });
    expect((await store.load()).plans).toHaveLength(6);
    const db = await new Promise<IDBDatabase>((resolve) => {
      const open = factory.open("unifr-planner");
      open.onsuccess = () => resolve(open.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("plans", "readwrite");
      tx.objectStore("plans").put({ ...duplicated, id: "legacy-large" });
      tx.oncomplete = () => resolve();
    });
    const recovered = await store.load();
    expect(recovered.plans).toHaveLength(6);
    expect(recovered.unreadableIds).toEqual(["legacy-large"]);
    const preserved = await new Promise<Plan>((resolve) => {
      const get = db
        .transaction("plans")
        .objectStore("plans")
        .get("legacy-large");
      get.onsuccess = () => resolve(get.result);
    });
    expect(preserved.scenarios).toHaveLength(5);
    db.close();
  });
  it("saves and restores plans and active selection across repository instances", async () => {
    const factory = new IDBFactory();
    const first = new PlanStore(factory);
    await first.save(plan());
    const second = new PlanStore(factory);
    expect(await second.load()).toEqual({ plans: [plan()], activeId: "plan" });
    await second.save({ ...plan(), id: "other", name: "Other" });
    await second.select("plan");
    expect((await first.load()).activeId).toBe("plan");
    expect((await first.load()).plans).toHaveLength(2);
  });
  it("migrates v1 database with v0 JSON without destroying legacy data", async () => {
    const factory = new IDBFactory();
    const db = await new Promise<IDBDatabase>((resolve) => {
      const open = factory.open("unifr-planner", 1);
      open.onupgradeneeded = () =>
        open.result.createObjectStore("plans", { keyPath: "id" });
      open.onsuccess = () => resolve(open.result);
    });
    const { activeScenarioId: _unused, ...legacy } = plan();
    expect(_unused).toBe("main");
    await new Promise<void>((resolve) => {
      const tx = db.transaction("plans", "readwrite");
      tx.objectStore("plans").put({ ...legacy, schemaVersion: 0 });
      tx.oncomplete = () => resolve();
    });
    db.close();
    expect(await new PlanStore(factory).load()).toEqual({
      plans: [{ ...plan(), schemaVersion: 1 }],
      activeId: "plan",
    });
  });
  it("reports unreadable records while retaining valid plans and the original corrupt record", async () => {
    const factory = new IDBFactory();
    const store = new PlanStore(factory);
    await expect(
      store.save({ ...plan(), schemaVersion: 8 } as never),
    ).rejects.toThrow();
    await store.save(plan());
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = factory.open("unifr-planner");
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("plans", "readwrite");
      tx.objectStore("plans").put({ id: "bad", schemaVersion: 99 });
      tx.oncomplete = () => resolve();
    });
    expect(await store.load()).toEqual({
      plans: [plan()],
      activeId: "plan",
      unreadableIds: ["bad"],
    });
    const retained = await new Promise((resolve) => {
      const get = db.transaction("plans").objectStore("plans").get("bad");
      get.onsuccess = () => resolve(get.result);
    });
    expect(retained).toEqual({ id: "bad", schemaVersion: 99 });
    db.close();
  });
});
