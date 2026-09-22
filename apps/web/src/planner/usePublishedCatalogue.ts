import { useEffect, useState } from "react";
import { canonicalCourseCode } from "../../../../packages/domain/src/requirements";
import { loadSavedCourses } from "./catalogue-loaders";
import type { PublishedCatalogue } from "./published";

export const catalogueRefreshEvent = "unifr:catalogue-refresh";
export function usePublishedCatalogue(codes: string[]) {
  const key = [...new Set(codes.map(canonicalCourseCode))].sort().join(",");
  const [catalogue, setCatalogue] = useState<{
    key: string;
    value: PublishedCatalogue;
  }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void loadSavedCourses(key.split(","), controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setCatalogue({ key, value });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [key, revision]);
  useEffect(() => {
    if (!key) return;
    let lastRefresh = Date.now();
    const refresh = () => {
      // focus + visibilitychange commonly arrive together. Recheck at most once
      // per minute in the background; the explicit refresh always runs.
      if (Date.now() - lastRefresh < 60_000) return;
      lastRefresh = Date.now();
      setRevision((value) => value + 1);
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(visible, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
      window.clearInterval(timer);
    };
  }, [key]);
  return {
    catalogue: key && catalogue?.key === key ? catalogue.value : undefined,
    loading: !!key && loading,
    error: !!key && error,
    refresh: () => {
      setRevision((value) => value + 1);
      window.dispatchEvent(new Event(catalogueRefreshEvent));
    },
  };
}
