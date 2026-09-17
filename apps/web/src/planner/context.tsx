import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Plan } from "./domain";
import { PlanStore } from "./storage";

type PlansContext = {
  plans: Plan[];
  plan?: Plan;
  ready: boolean;
  busy: boolean;
  error: boolean;
  unreadableIds: string[];
  save: (plan: Plan) => Promise<boolean>;
  select: (id: string) => Promise<void>;
};
const Context = createContext<PlansContext>({
  plans: [],
  ready: false,
  busy: false,
  error: false,
  unreadableIds: [],
  save: async () => false,
  select: async () => {},
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
  const store = useRef<PlanStore | null>(null);
  const locked = useRef(false);
  useEffect(() => {
    let active = true;
    try {
      store.current = new PlanStore(indexedDB);
      void store.current
        .load()
        .then((saved) => {
          if (active) {
            setState(saved);
            setUnreadableIds(saved.unreadableIds ?? []);
            setReady(true);
          }
        })
        .catch(() => {
          if (active) setError(true);
        });
    } catch {
      setError(true);
    }
    return () => {
      active = false;
    };
  }, []);
  async function save(plan: Plan) {
    if (!ready || locked.current || !store.current) return false;
    locked.current = true;
    setBusy(true);
    try {
      await store.current.save(plan);
      setState((old) => ({
        plans: [...old.plans.filter((p) => p.id !== plan.id), plan],
        activeId: plan.id,
      }));
      setError(false);
      return true;
    } catch {
      setError(true);
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
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
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <Context.Provider
      value={{
        plans: state.plans,
        plan: state.plans.find((p) => p.id === state.activeId),
        ready,
        busy,
        error,
        unreadableIds,
        save,
        select,
      }}
    >
      {children}
    </Context.Provider>
  );
}
// Kept in this module because every consumer requires the same context instance.
// eslint-disable-next-line react-refresh/only-export-components
export const usePlans = () => useContext(Context);
