import { computeProsperity } from "@/components/LivingPlanet";

export const CACHE_KEY = "zion_header_stats";
export const CACHE_TTL = 5 * 60 * 60 * 1000;

export type CachedHeaderStats = {
  alive: number;
  deaths_today: number;
  unemployment_rate: number;
  revolution_meter: number;
  poverty_pct: number;
  amendments: number;
};

function parseStatsRaw(raw: unknown): CachedHeaderStats {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const dead = Number(s.dead ?? 0);
  const aliveDirect = Number(s.alive ?? s.alive_agents);
  const totalAgentsRaw = Number(s.total_agents);
  const alive = Number.isFinite(aliveDirect)
    ? aliveDirect
    : Number.isFinite(totalAgentsRaw)
      ? Math.max(0, totalAgentsRaw - dead)
      : 0;

  return {
    alive,
    deaths_today: Number(s.deaths_today ?? 0),
    unemployment_rate: Number(s.unemployment_rate ?? 0),
    revolution_meter: Number(s.revolution_meter ?? 0),
    poverty_pct: Number(s.poverty_pct ?? 0),
    amendments: Number(s.amendments ?? 35),
  };
}

export function readHeaderStatsCache(): CachedHeaderStats | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached) as {
      data: CachedHeaderStats;
      timestamp: number;
    };
    if (Date.now() - timestamp < CACHE_TTL) return data;
  } catch {
    /* ignore corrupt cache */
  }
  return null;
}

export function headerStatsToDisplay(stats: CachedHeaderStats | null, loading: boolean) {
  if (loading || !stats) {
    return {
      subjectCount: "...",
      mortality24h: "···",
      prosperityPct: "···",
      amendments: "35",
    };
  }

  const prosperity = computeProsperity({
    unemployment: stats.unemployment_rate,
    revolution: stats.revolution_meter,
    poverty: stats.poverty_pct,
    population: stats.alive,
  });

  return {
    subjectCount: stats.alive.toLocaleString("en-US"),
    mortality24h: stats.deaths_today.toLocaleString("en-US"),
    prosperityPct: `${(prosperity * 100).toFixed(1)}%`,
    amendments: String(stats.amendments),
  };
}

export async function fetchHeaderStats(): Promise<CachedHeaderStats> {
  const cached = readHeaderStatsCache();
  if (cached) return cached;

  const res = await fetch("/api/stats");
  if (!res.ok) {
    throw new Error(`Stats request failed: ${res.status}`);
  }

  const data = parseStatsRaw(await res.json());

  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        data,
        timestamp: Date.now(),
      }),
    );
  } catch {
    /* ignore quota / private mode */
  }

  return data;
}
