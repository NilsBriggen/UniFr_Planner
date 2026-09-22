import { useEffect, useState } from "react";
import type { Filters } from "../api/client";
import type { Plan } from "../planner/domain";
import {
  loadDiscoveryCatalogue,
  loadSuggestionCatalogue,
} from "../planner/catalogue-loaders";
import { catalogueRefreshEvent } from "../planner/usePublishedCatalogue";
import type { PublishedCatalogue } from "../planner/published";
import type { Discovery } from "./engine";

export function useDiscoveryIndex(
  filters: Omit<Filters, "limit" | "offset"> & { term: string },
  enabled: boolean,
) {
  const key = JSON.stringify(
    Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)),
  );
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
    void loadDiscoveryCatalogue(
      Object.fromEntries(JSON.parse(key)) as typeof filters,
      controller.signal,
    )
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

export function useDiscovery(
  plan: Plan | null | undefined,
  catalogue: PublishedCatalogue | undefined,
  term: string,
  language: string,
) {
  const [state, setState] = useState<{
    plan: Plan;
    catalogue: PublishedCatalogue;
    term: string;
    language: string;
    discovery?: Discovery;
    error?: boolean;
  }>();
  useEffect(() => {
    if (!plan || !catalogue) return;
    let active = true;
    const store = (result: { discovery?: Discovery; error?: boolean }) => {
      if (active) setState({ plan, catalogue, term, language, ...result });
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
              ),
            });
        })
        .catch(() => store({ error: true }));
      return () => {
        active = false;
      };
    }
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event) => store(event.data);
    worker.onerror = () => store({ error: true });
    worker.postMessage({ plan, courses: catalogue.courses, term, language });
    return () => {
      active = false;
      worker.terminate();
    };
  }, [plan, catalogue, term, language]);
  const current =
    state?.plan === plan &&
    state?.catalogue === catalogue &&
    state?.term === term &&
    state?.language === language
      ? state
      : undefined;
  const previous =
    state?.catalogue === catalogue &&
    state?.term === term &&
    state?.language === language
      ? state?.discovery
      : undefined;
  return {
    discovery: current?.discovery ?? previous,
    error: current?.error,
    loading: !!plan && !!catalogue && !current,
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
