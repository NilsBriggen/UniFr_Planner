import { parsePlan, planSchema, type Plan } from "./domain";
import type { Revision } from "../suggestions/engine";

const request = <T>(value: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () =>
      reject(value.error ?? new Error("IndexedDB request failed"));
  });
const complete = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));
    tx.onerror = () =>
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
export class PlanConflictError extends Error {
  constructor() {
    super("Plan changed in another tab");
    this.name = "PlanConflictError";
  }
}
// Normalize legacy records through the same migration used by load().
function matches(saved: unknown, expected: Plan | null): boolean {
  if (expected === null) return saved === undefined;
  if (saved === undefined) return false;
  try {
    return (
      JSON.stringify(parsePlan(JSON.stringify(saved))) ===
      JSON.stringify(planSchema.parse(expected))
    );
  } catch {
    return false;
  }
}
export class PlanStore {
  constructor(private readonly factory: IDBFactory) {}
  async preference<T>(key: string): Promise<T | undefined> {
    const db = await this.open();
    try {
      const tx = db.transaction("preferences", "readonly");
      return await request(tx.objectStore("preferences").get(key));
    } finally {
      db.close();
    }
  }
  async setPreference(key: string, value: unknown): Promise<void> {
    const db = await this.open();
    try {
      const tx = db.transaction("preferences", "readwrite");
      const done = complete(tx);
      tx.objectStore("preferences").put(value, key);
      await done;
    } finally {
      db.close();
    }
  }
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const open = this.factory.open("unifr-planner", 3);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains("plans"))
          open.result.createObjectStore("plans", { keyPath: "id" });
        if (!open.result.objectStoreNames.contains("preferences"))
          open.result.createObjectStore("preferences");
        if (!open.result.objectStoreNames.contains("revisions"))
          open.result.createObjectStore("revisions");
      };
      open.onsuccess = () => {
        open.result.onversionchange = () => open.result.close();
        resolve(open.result);
      };
      open.onerror = () => reject(open.error);
      open.onblocked = () =>
        reject(new Error("storage upgrade blocked by another tab"));
    });
  }
  async save(value: Plan, expectedPrevious: Plan | null): Promise<void> {
    // Validate before JSON serialization so nonfinite numbers cannot turn into
    // otherwise valid nulls. Then apply the identical read/import byte limits.
    const plan = parsePlan(JSON.stringify(planSchema.parse(value)));
    const db = await this.open();
    try {
      const tx = db.transaction(["plans", "preferences"], "readwrite");
      const done = complete(tx);
      try {
        const saved = await request(tx.objectStore("plans").get(plan.id));
        if (
          (expectedPrevious !== null && expectedPrevious.id !== plan.id) ||
          !matches(saved, expectedPrevious)
        )
          throw new PlanConflictError();
        tx.objectStore("plans").put(plan);
        tx.objectStore("preferences").put(plan.id, "activeId");
        await done;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* Already completed/aborted. */
        }
        await done.catch(() => {});
        throw error;
      }
    } finally {
      db.close();
    }
  }
  async select(id: string): Promise<void> {
    const db = await this.open();
    try {
      const tx = db.transaction("preferences", "readwrite");
      const done = complete(tx);
      tx.objectStore("preferences").put(id, "activeId");
      await done;
    } finally {
      db.close();
    }
  }
  async saveRevision(revision: Revision): Promise<void> {
    await this.commitRevision(revision, false);
  }
  async undoRevision(revision: Revision): Promise<void> {
    await this.commitRevision(revision, true);
  }
  private async commitRevision(value: Revision, undo: boolean): Promise<void> {
    const revision: Revision = {
      before: parsePlan(JSON.stringify(planSchema.parse(value.before))),
      after: parsePlan(JSON.stringify(planSchema.parse(value.after))),
      suggestionId: value.suggestionId,
    };
    if (revision.before.id !== revision.after.id)
      throw new Error("invalid revision");
    const expected = undo ? revision.after : revision.before;
    const next = undo ? revision.before : revision.after;
    const db = await this.open();
    try {
      const tx = db.transaction(
        ["plans", "preferences", "revisions"],
        "readwrite",
      );
      const done = complete(tx);
      try {
        const saved = await request(tx.objectStore("plans").get(expected.id));
        if (!matches(saved, expected)) throw new PlanConflictError();
        tx.objectStore("plans").put(next);
        tx.objectStore("preferences").put(next.id, "activeId");
        if (undo) tx.objectStore("revisions").delete(next.id);
        else tx.objectStore("revisions").put(revision, next.id);
        await done;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* Already completed/aborted. */
        }
        await done.catch(() => {});
        throw error;
      }
    } finally {
      db.close();
    }
  }
  async load(): Promise<{
    plans: Plan[];
    activeId: string | null;
    unreadableIds?: string[];
    revisions?: Revision[];
  }> {
    const db = await this.open();
    try {
      const tx = db.transaction(
        ["plans", "preferences", "revisions"],
        "readonly",
      );
      const done = complete(tx);
      const [rows, activeId, revisionRows] = await Promise.all([
        request(tx.objectStore("plans").getAll()),
        request(tx.objectStore("preferences").get("activeId")),
        request(tx.objectStore("revisions").getAll()),
      ]);
      await done;
      const plans: Plan[] = [];
      const unreadableIds: string[] = [];
      const revisions: Revision[] = [];
      for (const [index, row] of revisionRows.entries()) {
        try {
          const before = parsePlan(JSON.stringify(row.before));
          const after = parsePlan(JSON.stringify(row.after));
          if (before.id !== after.id || typeof row.suggestionId !== "string")
            throw new Error("invalid revision");
          revisions.push({ before, after, suggestionId: row.suggestionId });
        } catch {
          unreadableIds.push(`revision-${index + 1}`);
        }
      }
      for (const [index, row] of rows.entries()) {
        try {
          plans.push(parsePlan(JSON.stringify(row)));
        } catch {
          unreadableIds.push(
            typeof row?.id === "string" ? row.id : `record-${index + 1}`,
          );
        }
      }
      return {
        plans,
        ...(revisions.length ? { revisions } : {}),
        ...(unreadableIds.length ? { unreadableIds } : {}),
        activeId: plans.some((p) => p.id === activeId)
          ? activeId
          : (plans[0]?.id ?? null),
      };
    } finally {
      db.close();
    }
  }
}
