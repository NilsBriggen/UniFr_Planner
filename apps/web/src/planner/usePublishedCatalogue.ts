import { useEffect, useState } from "react";
import { loadPublishedCatalogue, type PublishedCatalogue } from "./published";

export function usePublishedCatalogue(enabled: boolean) {
  const [catalogue, setCatalogue] = useState<PublishedCatalogue>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void loadPublishedCatalogue(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setCatalogue(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled, revision]);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => setRevision((value) => value + 1);
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
  }, [enabled]);
  return {
    catalogue,
    loading,
    error,
    refresh: () => setRevision((value) => value + 1),
  };
}
