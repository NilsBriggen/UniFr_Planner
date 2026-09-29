import { useEffect, useRef, useState } from "react";
import type { Filters } from "../api/client";
import type { Plan } from "../planner/domain";
import {
  cachedDiscoveryCatalogue,
  loadDiscoveryCatalogue,
  loadSuggestionCatalogue,
} from "../planner/catalogue-loaders";
import { catalogueRefreshEvent } from "../planner/usePublishedCatalogue";
import type { PublishedCatalogue } from "../planner/published";
import type { Discovery } from "./engine";

export function useDiscoveryIndex(
  filters: Omit<Filters, "limit" | "offset"> & { term: string },
  enabled: boolean,
  snapshotId?: string | null,
) {
  const key = JSON.stringify(
    Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)),
  );
  const [revision, setRevision] = useState(0);
  const requestKey = JSON.stringify([key, snapshotId, revision]);
  const cached = enabled
    ? cachedDiscoveryCatalogue(filters, snapshotId)
    : undefined;
  const [state, setState] = useState<{
    key: string;
    catalogue?: PublishedCatalogue;
    loading: boolean;
    error: boolean;
  }>({ key: "", loading: false, error: false });
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(catalogueRefreshEvent, refresh);
    return () => window.removeEventListener(catalogueRefreshEvent, refresh);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const filters = Object.fromEntries(
      JSON.parse(key),
    ) as DiscoveryIndexFilters;
    const catalogue = cachedDiscoveryCatalogue(filters, snapshotId);
    if (catalogue) {
      setState({ key: requestKey, catalogue, loading: false, error: false });
      return;
    }
    setState({ key: requestKey, loading: true, error: false });
    void loadDiscoveryCatalogue(filters, controller.signal, snapshotId)
      .then((catalogue) => {
        if (!controller.signal.aborted)
          setState({
            key: requestKey,
            catalogue,
            loading: false,
            error: false,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key: requestKey, loading: false, error: true });
      });
    return () => controller.abort();
  }, [key, enabled, requestKey, snapshotId]);
  return enabled && requestKey === state.key
    ? state
    : { loading: enabled && !cached, error: false, catalogue: cached };
}

type DiscoveryIndexFilters = Parameters<typeof loadDiscoveryCatalogue>[0];
const assessments = new WeakMap<
  PublishedCatalogue,
  { key: string; discovery: Discovery }
>();

export function useDiscovery(
  plan: Plan | null | undefined,
  catalogue: PublishedCatalogue | undefined,
  term: string,
  language: string,
) {
  const key = JSON.stringify([plan, term, language]);
  const cached = catalogue ? assessments.get(catalogue) : undefined;
  const worker = useRef<Worker | null>(null);
  const request = useRef(0);
  const [state, setState] = useState<{
    plan: Plan;
    catalogue: PublishedCatalogue;
    term: string;
    language: string;
    key: string;
    discovery?: Discovery;
    error?: boolean;
  }>();
  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [catalogue],
  );
  useEffect(() => {
    if (!plan || !catalogue) return;
    if (assessments.get(catalogue)?.key === key) return;
    const calendars = assessments.get(catalogue)?.discovery.calendars;
    let active = true;
    const store = (result: { discovery?: Discovery; error?: boolean }) => {
      if (active) {
        if (result.discovery)
          assessments.set(catalogue, { key, discovery: result.discovery });
        setState({ plan, catalogue, term, language, key, ...result });
      }
    };
    // A worker keeps search, navigation and semester controls responsive while
    // evaluating every offering. Only tests/older environments use the fallback.
    if (typeof Worker === "undefined") {
      void import("./engine")
        .then(({ discoverCourses }) => {
          if (active)
            store({
              discovery: discoverCourses(
                plan,
                catalogue.courses,
                term,
                language,
                calendars,
              ),
            });
        })
        .catch(() => store({ error: true }));
      return () => {
        active = false;
      };
    }
    const initialise = !worker.current;
    const currentWorker = (worker.current ??= new Worker(
      new URL("./worker.ts", import.meta.url),
      {
        type: "module",
      },
    ));
    const requestId = ++request.current;
    currentWorker.onmessage = (event) => {
      if (event.data.requestId === requestId) store(event.data);
    };
    currentWorker.onerror = () => {
      currentWorker.terminate();
      worker.current = null;
      store({ error: true });
    };
    currentWorker.postMessage({
      requestId,
      plan,
      term,
      language,
      ...(initialise ? { courses: catalogue.courses, calendars } : {}),
    });
    return () => {
      active = false;
    };
  }, [plan, catalogue, term, language, key]);
  const current =
    state?.key === key &&
    state?.catalogue === catalogue &&
    state?.term === term &&
    state?.language === language
      ? state
      : undefined;
  const discovery = cached?.key === key ? cached.discovery : current?.discovery;
  return {
    discovery,
    error: current?.error,
    loading: !!plan && !!catalogue && !discovery && !current?.error,
  };
}

export function useSuggestionCatalogue(semesters: string[], enabled: boolean) {
  const key = semesters.join(",");
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    key: string;
    catalogue?: PublishedCatalogue;
    loading: boolean;
    error: boolean;
  }>({ key: "", loading: false, error: false });
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener(catalogueRefreshEvent, refresh);
    return () => window.removeEventListener(catalogueRefreshEvent, refresh);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState({ key, loading: true, error: false });
    void loadSuggestionCatalogue(key.split(","), controller.signal)
      .then((catalogue) => {
        if (!controller.signal.aborted)
          setState({ key, catalogue, loading: false, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, loading: false, error: true });
      });
    return () => controller.abort();
  }, [key, enabled, revision]);
  return enabled && key === state.key
    ? state
    : { loading: enabled, error: false, catalogue: undefined };
}
