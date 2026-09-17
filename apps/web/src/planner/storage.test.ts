import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createPlan } from "./domain";
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
      plans: [plan()],
      activeId: "plan",
    });
  });
  it("rejects corrupt persisted data and invalid writes instead of returning an empty plan list", async () => {
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
    db.close();
    await expect(store.load()).rejects.toThrow();
  });
});
