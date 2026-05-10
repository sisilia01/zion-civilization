"use client";

import { useCallback, useEffect, useState } from "react";
import type { Agent, AgentClass, Clan, DashboardStats, EventKind, FeedEvent } from "@/lib/types";

const POLL_MS = 10_000;

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if ("data" in p) return p.data as T;
    if ("results" in p) return p.results as T;
    if ("items" in p) return p.items as T;
  }
  return payload as T;
}

function toNum(v: unknown, fallback = 0) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function toText(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

async function fetchJson(path: string) {
  const res = await fetch(`/api${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
}

function classFrom(raw: unknown, balance: number, dustDays: number): AgentClass {
  if (dustDays > 0) return "dying";
  const t = toText(raw).toLowerCase();
  if (t.includes("elite")) return "elite";
  if (t.includes("middle")) return "middle";
  if (t.includes("poor")) return "poor";
  if (balance > 100_000) return "elite";
  if (balance > 10_000) return "middle";
  return "poor";
}

function eventKindFrom(raw: unknown): EventKind {
  const t = toText(raw).toLowerCase();
  if (t.includes("death")) return "death";
  if (t.includes("birth")) return "birth";
  if (t.includes("war") || t.includes("battle")) return "war";
  if (t.includes("neo")) return "neo";
  if (t.includes("catastrophe") || t.includes("disaster") || t.includes("volcan")) return "catastrophe";
  return "war";
}

function normalizeAgents(payload: unknown): Agent[] {
  const arr = unwrap<unknown[]>(payload);
  if (!Array.isArray(arr)) return [];
  return arr.map((x, i) => {
    const p = (x ?? {}) as Record<string, unknown>;
    const balance = toNum(p.balance ?? p.zion_balance ?? p.balance_zion, 0);
    const dustDays = toNum(p.dust_days ?? p.dustDays, 0);
    return {
      id: toText(p.id ?? p.agent_id, `a-${i}`),
      name: toText(p.name, `Agent ${i + 1}`),
      classType: classFrom(p.class ?? p.class_type, balance, dustDays),
      balance,
      age: toNum(p.age ?? p.age_days, 0),
      clan: toText(p.clan ?? p.clan_name, "Unassigned"),
      dustDays,
    };
  });
}

function normalizeStats(payload: unknown, agents: Agent[], clans: Clan[]): DashboardStats {
  const p = unwrap<Record<string, unknown>>(payload) ?? {};
  const activeClans = toNum(p.activeClans ?? p.active_clans ?? p.total_active_clans ?? p.total_clans, 0);
  return {
    aliveAgents: agents.length,
    zionCirculation: toNum(
      p.zionCirculation ?? p.zion_circulation ?? p.total_zion_in_circulation ?? p.total_zion,
      0,
    ),
    deathsToday: toNum(p.deathsToday ?? p.deaths_today ?? p.total_deaths_today ?? p.today_deaths, 0),
    activeClans: activeClans || clans.length,
  };
}

function normalizeEvents(payload: unknown): FeedEvent[] {
  const arr = unwrap<unknown[]>(payload);
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 40).map((x, i) => {
    const p = (x ?? {}) as Record<string, unknown>;
    const tsRaw = p.ts ?? p.timestamp ?? p.created_at ?? p.time;
    const ts = typeof tsRaw === "string" ? Date.parse(tsRaw) : toNum(tsRaw, Date.now());
    return {
      id: toText(p.id ?? p.event_id, `e-${i}`),
      kind: eventKindFrom(p.kind ?? p.type ?? p.event_type),
      title: toText(p.title ?? p.name, "Event"),
      detail: toText(p.detail ?? p.description ?? p.message, "No details"),
      ts: Number.isFinite(ts) ? ts : Date.now(),
    };
  });
}

function normalizeClans(payload: unknown): Clan[] {
  const arr = unwrap<unknown[]>(payload);
  if (!Array.isArray(arr)) return [];
  return arr.map((x, i) => {
    const p = (x ?? {}) as Record<string, unknown>;
    return {
      id: toText(p.id ?? p.clan_id, `c-${i}`),
      name: toText(p.name ?? p.clan_name, `Clan ${i + 1}`),
      treasury: toNum(p.treasury ?? p.treasury_zion ?? p.balance, 0),
      wins: toNum(p.wins ?? p.win_count, 0),
      losses: toNum(p.losses ?? p.loss_count, 0),
    };
  });
}

export function useLiveData() {
  const [stats, setStats] = useState<DashboardStats>({
    aliveAgents: 0,
    zionCirculation: 0,
    deathsToday: 0,
    activeClans: 0,
  });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [clans, setClans] = useState<Clan[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const [statsRaw, agentsRaw, eventsRaw, clansRaw] = await Promise.all([
        fetchJson("/stats"),
        fetchJson("/agents"),
        fetchJson("/events"),
        fetchJson("/clans"),
      ]);
      const parsedAgents = normalizeAgents(agentsRaw);
      const parsedClans = normalizeClans(clansRaw);
      setStats(normalizeStats(statsRaw, parsedAgents, parsedClans));
      setAgents(parsedAgents);
      setEvents(normalizeEvents(eventsRaw));
      setClans(parsedClans);
      setLastUpdated(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch API data");
    }
  }, []);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => window.clearInterval(id);
  }, [poll]);

  return { stats, agents, events, clans, lastUpdated, error };
}

