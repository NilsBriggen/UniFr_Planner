import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Plan } from "./domain";
import { PlanConflictError, PlanStore } from "./storage";
import { usePublishedCatalogue } from "./usePublishedCatalogue";
import { applySuggestion, type Revision } from "../suggestions/revisions";
import type { Suggestion } from "../suggestions/engine";

type PlansContext = {
  published: ReturnType<typeof usePublishedCatalogue>;
  plans: Plan[];
  plan?: Plan;
  ready: boolean;
  busy: boolean;
  error: boolean;
  unreadableIds: string[];
  conflict?: Plan;
  loadLatest: () => Promise<boolean>;
  saveConflictCopy: () => Promise<boolean>;
  save: (plan: Plan) => Promise<boolean>;
  select: (id: string) => Promise<void>;
  revision?: Revision;
  apply: (suggestion: Suggestion) => Promise<boolean>;
  undo: () => Promise<boolean>;
};
const Context = createContext<PlansContext>({
  published: {
    catalogue: undefined,
    loading: false,
    error: false,
    refresh: () => {},
  },
  plans: [],
  ready: false,
  busy: false,
  error: false,
  unreadableIds: [],
  loadLatest: async () => false,
  saveConflictCopy: async () => false,
  save: async () => false,
  select: async () => {},
  apply: async () => false,
  undo: async () => false,
});
export function PlanProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    plans: Plan[];
    activeId: string | null;
  }>({ plans: [], activeId: null });
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const [unreadableIds, setUnreadableIds] = useState<string[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const store = useRef<PlanStore | null>(null);
  const locked = useRef(false);
  const [conflict, setConflict] = useState<Plan>();
  const channel = useRef<BroadcastChannel | null>(null);
  const refresh = useRef<(explicit?: boolean) => Promise<boolean>>(
    async () => false,
  );
  const pendingRefresh = useRef(false);
  const activeId = useRef<string | null>(null);
  activeId.current = state.activeId;
  function release() {
    locked.current = false;
    setBusy(false);
    if (pendingRefresh.current) void refresh.current();
  }
  function notify() {
    try {
      channel.current?.postMessage("committed");
    } catch {
      /* Focus refresh remains available. */
    }
  }

  const published = usePublishedCatalogue(
    state.plans
      .filter((p) => p.programme !== "SUGGESTIONS-DEMO")
      .flatMap((p) =>
        p.scenarios.flatMap((s) =>
          s.courses
            .filter((c) => c.status !== "completed" && c.offering)
            .map((c) => c.code),
        ),
      ),
  );
  useEffect(() => {
    let active = true;
    refresh.current = async (explicit = false) => {
      if (locked.current) {
        pendingRefresh.current = true;
        return false;
      }
      if (!store.current) return false;
      pendingRefresh.current = false;
      locked.current = true;
      setBusy(true);
      try {
        const saved = await store.current.load();
        if (!active) return false;
        setState({
          ...saved,
          activeId: saved.plans.some((p) => p.id === activeId.current)
            ? activeId.current
            : saved.activeId,
        });
        setRevisions(saved.revisions ?? []);
        setUnreadableIds(saved.unreadableIds ?? []);
        setReady(true);
        setError(false);
        if (explicit) setConflict(undefined);
        return true;
      } catch {
        if (active) setError(true);
        return false;
      } finally {
        if (active) {
          locked.current = false;
          setBusy(false);
          if (pendingRefresh.current) void refresh.current();
        }
      }
    };
    try {
      store.current = new PlanStore(indexedDB);
      try {
        if (typeof window.BroadcastChannel !== "undefined") {
          channel.current = new window.BroadcastChannel(
            "unifr-planner-commits",
          );
          channel.current.onmessage = () => {
            void refresh.current();
          };
        }
      } catch {
        /* Browsers may disable channels; retain focus refresh. */
      }
      void refresh.current();
    } catch {
      setError(true);
    }
    const onFocus = () => {
      void refresh.current();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      locked.current = false;
      pendingRefresh.current = false;
      channel.current?.close();
      channel.current = null;
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  async function persist(
    plan: Plan,
    expected: Plan | null,
    recovering = false,
  ) {
    if (!ready || locked.current || !store.current || (conflict && !recovering))
      return false;
    locked.current = true;
    setBusy(true);
    try {
      await store.current.save(plan, expected);
      setState((old) => ({
        plans: [...old.plans.filter((p) => p.id !== plan.id), plan],
        activeId: plan.id,
      }));
      if (recovering) setConflict(undefined);
      setError(false);
      notify();
      return true;
    } catch (error) {
      if (error instanceof PlanConflictError) {
        setConflict(plan);
        setError(false);
        pendingRefresh.current = true;
      } else setError(true);
      return false;
    } finally {
      release();
    }
  }
  async function save(plan: Plan) {
    // Capture the baseline from the render that computed the edit. A refresh
    // must never replace it with a newer baseline while this edit is pending.
    return persist(plan, state.plans.find((p) => p.id === plan.id) ?? null);
  }
  async function saveConflictCopy() {
    if (!conflict) return false;
    return persist({ ...conflict, id: crypto.randomUUID() }, null, true);
  }
  async function select(id: string) {
    if (
      !ready ||
      locked.current ||
      !store.current ||
      !state.plans.some((p) => p.id === id)
    )
      return;
    locked.current = true;
    setBusy(true);
    try {
      await store.current.select(id);
      setState((old) => ({ ...old, activeId: id }));
      setError(false);
    } catch {
      setError(true);
    } finally {
      release();
    }
  }
  async function revise(suggestion?: Suggestion) {
    const plan = state.plans.find((p) => p.id === state.activeId);
    if (!ready || locked.current || !store.current || !plan || conflict)
      return false;
    locked.current = true;
    setBusy(true);
    let attempted: Plan | undefined;
    try {
      const revision = suggestion
        ? applySuggestion(plan, suggestion)
        : revisions.find((r) => r.after.id === plan.id);
      if (!revision) return false;
      attempted = suggestion ? revision.after : revision.before;
      if (suggestion) await store.current.saveRevision(revision);
      else await store.current.undoRevision(revision);
      const next = suggestion ? revision.after : revision.before;
      setState((old) => ({
        plans: old.plans.map((p) => (p.id === next.id ? next : p)),
        activeId: next.id,
      }));
      setRevisions((old) => [
        ...old.filter((r) => r.after.id !== next.id),
        ...(suggestion ? [revision] : []),
      ]);
      setError(false);
      notify();
      return true;
    } catch (error) {
      if (error instanceof PlanConflictError && attempted) {
        setConflict(attempted);
        setError(false);
        pendingRefresh.current = true;
      } else setError(true);
      return false;
    } finally {
      release();
    }
  }
  return (
    <Context.Provider
      value={{
        published,
        plans: state.plans,
        plan: state.plans.find((p) => p.id === state.activeId),
        ready,
        busy,
        error,
        unreadableIds,
        conflict,
        loadLatest: () => refresh.current(true),
        saveConflictCopy,
        save,
        select,
        revision: revisions.find((r) => r.after.id === state.activeId),
        apply: (suggestion) => revise(suggestion),
        undo: () => revise(),
      }}
    >
      {children}
    </Context.Provider>
  );
}
// Kept in this module because every consumer requires the same context instance.
// eslint-disable-next-line react-refresh/only-export-components
export const usePlans = () => useContext(Context);
