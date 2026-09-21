import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePlans } from "../planner/context";
import { PlanStore } from "../planner/storage";
import type { Plan } from "../planner/domain";
import {
  newOwnerKey,
  shareRequest,
  shareSnapshot,
  snapshotHash,
  ShareError,
  type ShareRecord,
  type SharedPlan,
} from "./model";

type Status = "publishing" | "synced" | "offline" | "conflict" | "unavailable";
type Sharing = {
  records: ShareRecord[];
  statuses: Record<string, Status>;
  ready: boolean;
  create: (plan: Plan, personal: boolean) => Promise<void>;
  revoke: (record: ShareRecord) => Promise<void>;
  attach: (plan: Plan, shared: SharedPlan, key?: string) => Promise<void>;
  retry: () => void;
};
const Context = createContext<Sharing>({
  records: [],
  statuses: {},
  ready: false,
  create: async () => {},
  revoke: async () => {},
  attach: async () => {},
  retry: () => {},
});
export function SharingProvider({ children }: { children: ReactNode }) {
  const { plans, ready: plansReady } = usePlans();
  const [records, setRecords] = useState<ShareRecord[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [ready, setReady] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const current = useRef(records);
  const locked = useRef(new Set<string>());
  const blocked = useRef(new Set<string>());
  const storage = useRef<PlanStore | undefined>(undefined);
  const writes = useRef(Promise.resolve());
  useEffect(() => {
    if (typeof indexedDB === "undefined") return;
    storage.current = new PlanStore(indexedDB);
    let active = true;
    void storage.current
      .preference<ShareRecord[]>("shares")
      .then((value) => {
        if (active) {
          current.current = value ?? [];
          setRecords(current.current);
          setReady(true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const persist = useCallback(async (record: ShareRecord, remove = false) => {
    const task = writes.current
      .catch(() => {})
      .then(async () => {
        if (!storage.current) throw new Error("Storage unavailable");
        const next = [
          ...current.current.filter(
            (r) =>
              r.planId !== record.planId && (!record.id || r.id !== record.id),
          ),
          ...(remove ? [] : [record]),
        ];
        await storage.current.setPreference("shares", next);
        current.current = next;
        setRecords(next);
      });
    writes.current = task;
    await task;
  }, []);
  const status = useCallback(
    (id: string, value: Status) =>
      setStatuses((old) => ({ ...old, [id]: value })),
    [],
  );
  const failed = useCallback(
    (id: string, error: unknown) => {
      blocked.current.add(id);
      status(
        id,
        error instanceof ShareError && error.status === 409
          ? "conflict"
          : error instanceof ShareError && [403, 404].includes(error.status)
            ? "unavailable"
            : "offline",
      );
    },
    [status],
  );
  const retry = useCallback(() => {
    blocked.current.clear();
    setRetryCount((n) => n + 1);
  }, []);
  useEffect(() => {
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [retry]);
  useEffect(() => {
    if (!ready || !plansReady) return;
    const timer = window.setTimeout(() => {
      for (const record of records) {
        const plan = plans.find((p) => p.id === record.planId);
        if (
          !plan ||
          !record.id ||
          locked.current.has(record.planId) ||
          blocked.current.has(record.planId)
        )
          continue;
        locked.current.add(record.planId);
        void (async () => {
          try {
            const snapshot = shareSnapshot(plan, record.includePersonal);
            const hash = await snapshotHash(snapshot);
            if (hash === record.savedHash) {
              status(plan.id, "synced");
              return;
            }
            status(plan.id, "publishing");
            const saved = await shareRequest(
              `/${record.id}`,
              "PUT",
              { snapshot, revision: record.revision },
              record.ownerKey,
            );
            await persist({
              ...record,
              revision: saved!.revision,
              savedHash: hash,
            });
            status(plan.id, "synced");
          } catch (error) {
            failed(plan.id, error);
          } finally {
            locked.current.delete(plan.id);
          }
        })();
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [plans, plansReady, records, ready, retryCount, persist, failed, status]);
  async function create(plan: Plan, personal: boolean) {
    if (!ready || locked.current.has(plan.id)) return;
    locked.current.add(plan.id);
    status(plan.id, "publishing");
    try {
      const record = current.current.find((r) => r.planId === plan.id) ?? {
        planId: plan.id,
        ownerKey: newOwnerKey(),
        revision: 0,
        savedHash: "",
        includePersonal: personal,
      };
      await persist(record); // Keep ownership even if the POST response is interrupted.
      const snapshot = shareSnapshot(plan, personal);
      const saved = await shareRequest("", "POST", {
        snapshot,
        ownerKey: record.ownerKey,
      });
      await persist({
        ...record,
        id: saved!.id,
        revision: saved!.revision,
        savedHash: await snapshotHash(saved!.snapshot),
        includePersonal: personal,
      });
      blocked.current.delete(plan.id);
      status(plan.id, "synced");
    } catch (error) {
      failed(plan.id, error);
      throw error;
    } finally {
      locked.current.delete(plan.id);
    }
  }
  async function revoke(record: ShareRecord) {
    if (!record.id || locked.current.has(record.planId)) return;
    locked.current.add(record.planId);
    try {
      await shareRequest(`/${record.id}`, "DELETE", undefined, record.ownerKey);
      await persist(record, true);
      blocked.current.delete(record.planId);
    } finally {
      locked.current.delete(record.planId);
    }
  }
  async function attach(plan: Plan, shared: SharedPlan, key?: string) {
    const personal =
      current.current.find((r) => r.id === shared.id)?.includePersonal ??
      shared.snapshot.scenarios.some((s) => s.unavailable.length > 0);
    await persist({
      planId: plan.id,
      id: shared.id,
      ownerKey: key,
      revision: shared.revision,
      savedHash: await snapshotHash(shareSnapshot(plan, personal)),
      includePersonal: personal,
    });
    blocked.current.delete(plan.id);
    status(plan.id, "synced");
  }
  return (
    <Context.Provider
      value={{ records, statuses, ready, create, revoke, attach, retry }}
    >
      {children}
    </Context.Provider>
  );
}
// eslint-disable-next-line react-refresh/only-export-components
export const useSharing = () => useContext(Context);
