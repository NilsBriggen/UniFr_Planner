import { StrictMode } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { PlanProvider, usePlans } from "./context";
import { PlanStore } from "./storage";
import { createPlan } from "./domain";

vi.mock("./usePublishedCatalogue", () => ({
  usePublishedCatalogue: () => ({
    loading: false,
    error: false,
    refresh: () => {},
  }),
}));
let current: ReturnType<typeof usePlans>;
function Probe() {
  current = usePlans();
  return null;
}
const original = () =>
  createPlan({
    id: "p",
    scenarioId: "s",
    name: "Original",
    programme: "CS",
    startTerm: "AS-2026",
    semesterCount: 2,
    targetEcts: 12,
  });
beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup() {
  const store = new PlanStore(indexedDB);
  await store.save(original(), null);
  render(
    <PlanProvider>
      <Probe />
    </PlanProvider>,
  );
  await waitFor(() => expect(current.ready && !current.busy).toBe(true));
  return store;
}
it("retains a rejected edit through refresh and recovers it under a fresh ID", async () => {
  const store = await setup();
  const oldSave = current.save;
  const attempted = { ...current.plan!, name: "My unsaved edit" };
  const newer = { ...original(), name: "Other tab" };
  await store.save(newer, original());
  await act(async () => {
    expect(await oldSave(attempted)).toBe(false);
  });
  await waitFor(() => expect(current.busy).toBe(false));
  expect(current.plan).toEqual(newer);
  expect(current.conflict).toEqual(attempted);
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  await waitFor(() => expect(current.busy).toBe(false));
  expect(current.conflict).toEqual(attempted);
  await act(async () => {
    expect(await current.saveConflictCopy()).toBe(true);
  });
  expect(current.conflict).toBeUndefined();
  const saved = await store.load();
  expect(saved.plans).toHaveLength(2);
  expect(saved.plans.find((p) => p.id === "p")).toEqual(newer);
  expect(saved.plans.find((p) => p.id !== "p")).toMatchObject({
    name: "My unsaved edit",
  });
});
it("focus refresh cannot provide a newer baseline to an already-computed edit", async () => {
  const store = await setup();
  const oldSave = current.save;
  const newer = { ...original(), name: "Newer" };
  await store.save(newer, original());
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  await waitFor(() => expect(current.plan?.name).toBe("Newer"));
  await act(async () => {
    expect(await oldSave({ ...original(), name: "Stale" })).toBe(false);
  });
  await waitFor(() => expect(current.busy).toBe(false));
  expect((await store.load()).plans).toEqual([newer]);
  await act(async () => {
    expect(await current.loadLatest()).toBe(true);
  });
  expect(current.conflict).toBeUndefined();
  expect(current.plan).toEqual(newer);
});
it("keeps committed state unchanged on storage failure", async () => {
  const store = await setup();
  vi.spyOn(PlanStore.prototype, "save").mockRejectedValueOnce(
    new Error("quota"),
  );
  await act(async () => {
    expect(await current.save({ ...original(), name: "Not saved" })).toBe(
      false,
    );
  });
  expect(current.error).toBe(true);
  expect(current.busy).toBe(false);
  expect(current.conflict).toBeUndefined();
  expect(current.plan).toEqual(original());
  expect((await store.load()).plans).toEqual([original()]);
});
it("queues refresh during a write and does not replace the successfully committed edit", async () => {
  await setup();
  const save = PlanStore.prototype.save;
  let resume!: () => void;
  const pending = new Promise<void>((resolve) => {
    resume = resolve;
  });
  vi.spyOn(PlanStore.prototype, "save").mockImplementationOnce(async function (
    this: PlanStore,
    plan,
    expected,
  ) {
    await pending;
    return save.call(this, plan, expected);
  });
  let result!: Promise<boolean>;
  act(() => {
    result = current.save({ ...original(), name: "Committed" });
  });
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(current.busy).toBe(true);
  await act(async () => {
    resume();
    expect(await result).toBe(true);
  });
  await waitFor(() => expect(current.busy).toBe(false));
  expect(current.plan?.name).toBe("Committed");
});
it("broadcasts only after successful commits and refreshes on tab notifications", async () => {
  const channels: FakeChannel[] = [];
  class FakeChannel {
    onmessage: (() => void) | null = null;
    postMessage = vi.fn();
    close = vi.fn();
    constructor() {
      channels.push(this);
    }
  }
  vi.stubGlobal("BroadcastChannel", FakeChannel);
  const store = await setup();
  expect(channels[0].postMessage).not.toHaveBeenCalled();
  await act(async () => {
    await current.save({ ...original(), name: "First" });
  });
  expect(channels[0].postMessage).toHaveBeenCalledTimes(1);
  await store.save(
    { ...original(), name: "External" },
    { ...original(), name: "First" },
  );
  await act(async () => {
    channels[0].onmessage?.();
  });
  await waitFor(() => expect(current.plan?.name).toBe("External"));
  expect(channels[0].postMessage).toHaveBeenCalledTimes(1);
});

it("becomes ready after StrictMode remounts its initial effect", async () => {
  render(
    <StrictMode>
      <PlanProvider>
        <Probe />
      </PlanProvider>
    </StrictMode>,
  );
  await waitFor(() => expect(current.ready && !current.busy).toBe(true));
});
