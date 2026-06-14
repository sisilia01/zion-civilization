"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchHeaderStats,
  headerStatsToDisplay,
  readHeaderStatsCache,
  type CachedHeaderStats,
} from "@/lib/headerStatsCache";

export function useHeaderStats() {
  const [stats, setStats] = useState<CachedHeaderStats | null>(() => readHeaderStatsCache());
  const [loading, setLoading] = useState(() => readHeaderStatsCache() === null);

  useEffect(() => {
    let cancelled = false;

    fetchHeaderStats()
      .then((data) => {
        if (!cancelled) {
          setStats(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(
    () => ({
      loading,
      stats,
      ...headerStatsToDisplay(stats, loading),
    }),
    [loading, stats],
  );
}
