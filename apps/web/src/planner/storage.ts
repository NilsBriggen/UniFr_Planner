import { parsePlan, planSchema, type Plan } from "./domain";

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
export class PlanStore {
  constructor(private readonly factory: IDBFactory) {}
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const open = this.factory.open("unifr-planner", 2);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains("plans"))
          open.result.createObjectStore("plans", { keyPath: "id" });
        if (!open.result.objectStoreNames.contains("preferences"))
          open.result.createObjectStore("preferences");
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
  async save(value: Plan): Promise<void> {
    const plan = planSchema.parse(value);
    const db = await this.open();
    try {
      const tx = db.transaction(["plans", "preferences"], "readwrite");
      const done = complete(tx);
      tx.objectStore("plans").put(plan);
      tx.objectStore("preferences").put(plan.id, "activeId");
      await done;
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
  async load(): Promise<{ plans: Plan[]; activeId: string | null }> {
    const db = await this.open();
    try {
      const tx = db.transaction(["plans", "preferences"], "readonly");
      const done = complete(tx);
      const [rows, activeId] = await Promise.all([
        request(tx.objectStore("plans").getAll()),
        request(tx.objectStore("preferences").get("activeId")),
      ]);
      await done;
      const plans = rows.map((row) => parsePlan(JSON.stringify(row)));
      return {
        plans,
        activeId: plans.some((p) => p.id === activeId)
          ? activeId
          : (plans[0]?.id ?? null),
      };
    } finally {
      db.close();
    }
  }
}
