export type PressStats = {
  alive: number;
  deaths_today: number;
  total_zion: number;
  active_clans: number;
};

export function parsePressStats(raw: unknown): PressStats {
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
    total_zion: Number(s.total_zion ?? 0),
    active_clans: Number(s.active_clans ?? 0),
  };
}
