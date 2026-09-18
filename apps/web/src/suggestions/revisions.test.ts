import { expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { PlanStore } from "../planner/storage";
import { createPlan } from "../planner/domain";

it("persists a revision atomically with its plan, survives reload, and undoes exactly", async () => {
  const factory = new IDBFactory(),
    store = new PlanStore(factory);
  const before = createPlan({
    id: "p",
    scenarioId: "s",
    name: "Original",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 2,
    targetEcts: 12,
  });
  const revision = {
    before,
    after: { ...before, name: "Changed" },
    suggestionId: "repair",
  };
  await store.save(before);
  await store.saveRevision(revision);
  const reloaded = new PlanStore(factory);
  expect((await reloaded.load()).revisions).toEqual([revision]);
  expect((await reloaded.load()).plans).toEqual([revision.after]);
  await reloaded.undoRevision(revision);
  expect((await reloaded.load()).plans).toEqual([before]);
  expect((await reloaded.load()).revisions ?? []).toEqual([]);
});

it("rejects stale revisions and undo after another tab saved a change", async () => {
  const factory = new IDBFactory(),
    store = new PlanStore(factory);
  const before = createPlan({
    id: "p",
    scenarioId: "s",
    name: "Original",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 2,
    targetEcts: 12,
  });
  const revision = {
    before,
    after: { ...before, name: "Changed" },
    suggestionId: "repair",
  };
  await store.save({ ...before, name: "Other tab" });
  await expect(store.saveRevision(revision)).rejects.toThrow("stale");
  await store.save(before);
  await store.saveRevision(revision);
  await store.save({ ...revision.after, name: "Other tab again" });
  await expect(store.undoRevision(revision)).rejects.toThrow("stale");
  expect((await store.load()).plans[0].name).toBe("Other tab again");
});
