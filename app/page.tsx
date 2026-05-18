"use client";

import {
  useConnectWallet,
  useCurrentAccount,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
  useWallets,
} from "@mysten/dapp-kit";
import { generateNonce, generateRandomness } from "@mysten/zklogin";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { suiClient } from "@/lib/deepbook";
import { checkVIPAccess, VIP_MARKETS, SILVER_THRESHOLD, GOLD_THRESHOLD } from "@/lib/seal";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Agent {
  id: number;
  name: string;
  class: string;
  balance: number;
  charisma?: number;
  aggression?: number;
  faith?: number;
  ambition?: number;
  loyalty?: number;
  age_days: number;
  clan: string | null;
  dust_days: number;
  dying: boolean;
}

interface EventItem {
  id: number;
  type: string;
  description: string;
  time: string;
}

interface WalrusLiveEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  agents: string[];
  amount?: number;
}

type WalrusFeedTickerItem = {
  type: string;
  text: string;
  agent: string;
};

const WALRUS_TICKER_TYPE_COLORS: Record<string, string> = {
  election: "#ffd700",
  catastrophe: "#ff4141",
  clan_war: "#ff6b35",
  rebellion: "#ff4141",
  lottery: "#00d4ff",
  blessing: "#a78bfa",
  birth: "#00ff41",
  prayer: "#666",
  chat: "#00ff41",
  work: "#888",
  clan_join: "#4ade80",
};

const sectorEmoji: Record<string, string> = {
  tech: "🖥️",
  agro: "🌾",
  military: "⚔️",
  pharma: "💊",
  media: "📺",
};

const WALRUS_TICKER_TYPE_ICONS: Record<string, string> = {
  election: "👑",
  catastrophe: "🌋",
  clan_war: "⚔️",
  rebellion: "✊",
  lottery: "🎰",
  blessing: "✨",
  birth: "👶",
  prayer: "🙏",
  chat: "💬",
  work: "⚙️",
  clan_join: "🤝",
};

function walrusEventTypeEmoji(type: string): string {
  const map: Record<string, string> = {
    prayer: "🙏",
    election: "👑",
    death: "💀",
    lottery: "🎰",
    clan_join: "🤝",
    work: "⚙️",
    catastrophe: "🌋",
    rebellion: "✊",
    birth: "👶",
    chat: "💬",
  };
  return map[type] ?? "📡";
}

function walrusRowAccent(type: string): string {
  const k = chronicleTickerTypeKey(type);
  const extra: Record<string, string> = {
    death: "#ff3232",
    war: "#ff6600",
    trade: "#00ff41",
    clan_join: "#34d399",
  };
  if (extra[k]) return extra[k];
  return chronicleTickerBorder(type);
}

type ConversationPair = {
  id: number;
  topic: string;
  agent1: Agent;
  agent2: Agent;
  message1?: string;
  message2?: string;
};

interface Clan {
  id: number;
  name: string;
  treasury: number;
  members: number;
  wins: number;
  losses: number;
}

interface Stats {
  alive: number;
  dead: number;
  total_zion: number;
  active_clans: number;
  deaths_today: number;
  elite?: number;
  middle?: number;
  poor?: number;
  critical?: number;
}

interface ZcoVote {
  judge: string;
  decision: string;
  confidence?: number;
  status: string;
}

interface ZcoConsensusBlock {
  decision?: string;
  method?: string;
  agreement?: number;
  avg_confidence?: number;
  votes_for?: number;
  total_votes?: number;
}

interface ZcoDecision {
  agent?: string;
  agent_class?: string;
  class?: string;
  decision?: string;
  event_description?: string;
  event_type?: string;
  consensus?: ZcoConsensusBlock;
  votes?: ZcoVote[];
  consensus_hash?: string;
  powered_by?: string;
  tx_hash?: string;
  explorer_url?: string;
}

const ZCO_ACCENT = "#a78bfa";

function zcoConsensusLine(d: ZcoDecision): string {
  const c = d.consensus;
  if (c?.method === "consensus" && c.votes_for != null && c.total_votes != null) {
    return `CONSENSUS ${c.votes_for}/${c.total_votes}`;
  }
  return "DEADLOCK";
}

function zcoAgreementPercent(d: ZcoDecision): number {
  const a = d.consensus?.agreement;
  if (a == null || Number.isNaN(Number(a))) return 0;
  const x = Number(a);
  return Math.round(Math.min(1, Math.max(0, x)) * 100);
}

function zcoAgreementDisplayColor(pct: number): string {
  if (pct >= 85) return "#22c55e";
  if (pct >= 50) return ZCO_ACCENT;
  if (pct >= 25) return "#f59e0b";
  return "#ef4444";
}

/** ZCO event-type pill tint (reuses chronicle ticker palette where defined). */
function zcoEventPillPalette(eventTypeRaw: string): { bg: string; border: string; fg: string } {
  const br = chronicleTickerBorder(eventTypeRaw);
  return { bg: `${br}2a`, border: `${br}66`, fg: br };
}

const MATRIX_CHARS =
  "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ";

const bgChars = MATRIX_CHARS;

const classMeta = (agentClass: string) => {
  const c = (agentClass || "").trim().toLowerCase();
  if (c === "elite") {
    return { icon: "👑", border: "#FFD700", tier: "tier-elite" as const };
  }
  if (c === "middle") {
    return { icon: "⚡", border: "#C0C0C0", tier: "tier-middle" as const };
  }
  if (c === "critical") {
    return { icon: "🩸", border: "#cc0000", tier: "tier-critical" as const };
  }
  return { icon: "💀", border: "#CD7F32", tier: "tier-poor" as const };
};

function chronicleTypeKey(type: string): string {
  const t = type.toLowerCase().replace(/-/g, "_");
  if (t.includes("neo")) return "neo";
  if (t.includes("clan") && t.includes("war")) return "clan_war";
  return t;
}

function chronicleMeta(type: string): { icon: string; border: string } {
  const lower = type.toLowerCase();
  if (/^(btc|eth|sui|doge)_updown_/.test(lower)) return { icon: "🪙", border: "#FFD700" };
  if (lower.startsWith("zion_price")) return { icon: "🪙", border: "#00E676" };
  if (lower.startsWith("sui_price")) return { icon: "◈", border: "#4FC3F7" };
  if (lower.startsWith("clan_war")) return { icon: "⚔️", border: "#FF8C00" };
  const key = chronicleTypeKey(type);
  switch (key) {
    case "death":
      return { icon: "💀", border: "#FF0000" };
    case "birth":
      return { icon: "👶", border: "#00FF41" };
    case "clan_war":
      return { icon: "⚔️", border: "#FF8C00" };
    case "catastrophe":
      return { icon: "🌋", border: "#8B00FF" };
    case "neo":
      return { icon: "👁️", border: "#00FFFF" };
    case "prayer":
      return { icon: "🙏", border: "#FFD700" };
    case "election":
      return { icon: "🏛️", border: "#4DA2FF" };
    case "rebellion":
      return { icon: "✊", border: "#FF4444" };
    case "blessing":
      return { icon: "✨", border: "#FFD700" };
    case "lottery":
      return { icon: "🎰", border: "#FFD700" };
    case "work":
      return { icon: "⚒️", border: "#888888" };
    default:
      return { icon: "◆", border: "#8dffbf" };
  }
}

/** Canonical key for priority ordering (matches API priority list). */
function chroniclePriorityKey(type: string): string {
  const t = type.toLowerCase().replace(/-/g, "_");
  if (t.includes("neo_prophecy")) return "neo_prophecy";
  if (t.includes("neo")) return "neo";
  if (t.includes("clan") && t.includes("war")) return "clan_war";
  return t;
}

function chroniclePriorityRank(type: string, priority: readonly string[]): number {
  const key = chroniclePriorityKey(type);
  const idx = priority.indexOf(key);
  if (idx >= 0) return idx;
  return priority.length + 50;
}

const CHRONICLE_MAX = 20;
const CHRONICLE_MAX_PER_TYPE = 3;
const CHRONICLE_MAX_PRAYER = 3;

function filterChronicleEvents(raw: EventItem[], priority: readonly string[]): EventItem[] {
  if (!raw.length) return [];
  const counts = new Map<string, number>();
  for (const e of raw) {
    const k = chronicleTypeKey(e.type);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const sortedForPick = [...raw].sort((a, b) => {
    const pa = chroniclePriorityRank(a.type, priority);
    const pb = chroniclePriorityRank(b.type, priority);
    if (pa !== pb) return pa - pb;
    const ka = chronicleTypeKey(a.type);
    const kb = chronicleTypeKey(b.type);
    const ca = counts.get(ka) ?? 0;
    const cb = counts.get(kb) ?? 0;
    if (ca !== cb) return ca - cb;
    const ta = parseEventTimeMs(a.time);
    const tb = parseEventTimeMs(b.time);
    if (ta != null && tb != null) return tb - ta;
    if (tb != null) return 1;
    if (ta != null) return -1;
    return b.id - a.id;
  });

  const typeSeen = new Map<string, number>();
  let prayerCount = 0;
  const picked: EventItem[] = [];
  for (const e of sortedForPick) {
    if (picked.length >= CHRONICLE_MAX) break;
    const k = chronicleTypeKey(e.type);
    const isPrayer = k === "prayer" || chroniclePriorityKey(e.type) === "prayer" || e.type.toLowerCase().includes("prayer");
    if (isPrayer && prayerCount >= CHRONICLE_MAX_PRAYER) continue;
    const n = typeSeen.get(k) ?? 0;
    if (n >= CHRONICLE_MAX_PER_TYPE) continue;
    picked.push(e);
    typeSeen.set(k, n + 1);
    if (isPrayer) prayerCount++;
  }

  return picked.sort((a, b) => {
    const ka = chronicleTypeKey(a.type);
    const kb = chronicleTypeKey(b.type);
    const ca = counts.get(ka) ?? 0;
    const cb = counts.get(kb) ?? 0;
    if (ca !== cb) return ca - cb;
    const ta = parseEventTimeMs(a.time);
    const tb = parseEventTimeMs(b.time);
    if (ta != null && tb != null) return tb - ta;
    if (tb != null) return 1;
    if (ta != null) return -1;
    return b.id - a.id;
  });
}

const CHRONICLE_TICKER_TYPES = new Set([
  "election",
  "catastrophe",
  "clan_war",
  "rebellion",
  "lottery",
  "blessing",
  "birth",
  "prayer",
]);

/** Chronicle horizontal feed: canonical type key (clan_war, prayer, …). */
function chronicleTickerTypeKey(type: string): string {
  const t = type.toLowerCase().replace(/-/g, "_");
  if (t.includes("clan") && t.includes("war")) return "clan_war";
  return t;
}

function chronicleTickerBorder(type: string): string {
  const k = chronicleTickerTypeKey(type);
  const map: Record<string, string> = {
    election: "#ffd700",
    catastrophe: "#ff4141",
    clan_war: "#ff6b35",
    rebellion: "#ff4141",
    lottery: "#00d4ff",
    blessing: "#a78bfa",
    birth: "#00ff41",
    prayer: "#555",
  };
  return map[k] ?? "#555";
}

function filterChronicleTickerEvents(raw: unknown[]): EventItem[] {
  const out: EventItem[] = [];
  let fallbackId = 0;
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const typRaw = String(o.type ?? "");
    const k = chronicleTickerTypeKey(typRaw);
    if (!CHRONICLE_TICKER_TYPES.has(k)) continue;
    const idRaw = o.id;
    const idNum = typeof idRaw === "number" ? idRaw : Number(idRaw);
    out.push({
      id: Number.isFinite(idNum) ? idNum : ++fallbackId,
      type: typRaw,
      description: typeof o.description === "string" ? o.description : "",
      time: typeof o.time === "string" ? o.time : "",
    });
  }
  const isPrayer = (e: EventItem) =>
    chronicleTickerTypeKey(e.type) === "prayer" || e.type.toLowerCase().includes("prayer");
  const important = out.filter((e) => !isPrayer(e));
  const prayers = out.filter((e) => isPrayer(e));
  return [...important, ...prayers].slice(0, 48);
}

function parseEventTimeMs(time: string): number | null {
  if (!time?.trim()) return null;
  const ts = Date.parse(time);
  if (!Number.isNaN(ts)) return ts;
  const n = Number(time);
  if (!Number.isFinite(n)) return null;
  if (n > 1e12) return n;
  if (n > 1e9) return n * 1000;
  return null;
}

function formatTimeAgo(time: string, nowMs: number): string {
  const parsed = parseEventTimeMs(time);
  if (parsed == null) return time.trim() || "—";
  const sec = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  if (sec < 60) return sec <= 1 ? "just now" : `${sec} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? "1 min ago" : `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? "1 hour ago" : `${hr} hours ago`;
  const day = Math.floor(hr / 24);
  return day === 1 ? "1 day ago" : `${day} days ago`;
}

function chronicleBoldDescription(description: string, type: string): ReactNode {
  const key = chronicleTypeKey(type);
  const d = description;

  if (key === "death") {
    const m = d.match(/^(.+?)\s+died(\b[\s\S]*)$/);
    if (m) {
      return (
        <>
          <strong>{m[1]}</strong> died{m[2]}
        </>
      );
    }
  }
  if (key === "birth") {
    const m = d.match(/^(.+?)\s+gave birth to\s+([^.\s]+)([\s\S]*)$/);
    if (m) {
      return (
        <>
          <strong>{m[1]}</strong> gave birth to <strong>{m[2]}</strong>
          {m[3]}
        </>
      );
    }
  }
  if (key === "clan_war") {
    const m = d.match(/^(.+?)\s+defeated\b([\s\S]*)$/);
    if (m) {
      return (
        <>
          <strong>{m[1]}</strong> defeated{m[2]}
        </>
      );
    }
  }
  if (key === "catastrophe") {
    const m = d.match(/\b([A-Za-z][A-Za-z0-9_]*)\s+perished\b([\s\S]*)$/);
    if (m) {
      const idx = d.indexOf(m[0]);
      if (idx >= 0) {
        const before = d.slice(0, idx);
        const after = d.slice(idx + m[0].length);
        return (
          <>
            {before}
            <strong>{m[1]}</strong> perished{after}
          </>
        );
      }
    }
  }
  if (key === "neo") {
    const needle = "NEO punished ";
    const i = d.indexOf(needle);
    if (i >= 0) {
      const rest = d.slice(i + needle.length);
      const m = rest.match(/^([^\s—]+)([\s\S]*)$/);
      if (m) {
        return (
          <>
            {d.slice(0, i)}
            NEO punished <strong>{m[1]}</strong>
            {m[2]}
          </>
        );
      }
    }
  }
  if (key === "prayer") {
    const m = d.match(/^(.+?)\s+prayed\b([\s\S]*)$/);
    if (m) {
      return (
        <>
          <strong>{m[1]}</strong> prayed{m[2]}
        </>
      );
    }
  }
  if (key === "election") {
    const m = d.match(/^(.+?)\s+won\b([\s\S]*)$/);
    if (m) {
      return (
        <>
          <strong>{m[1]}</strong> won{m[2]}
        </>
      );
    }
  }
  if (key === "lottery") {
    const m = d.match(/^(.+?)\s+won\b([\s\S]*)$/);
    if (m) {
      return (
        <>
          <strong>{m[1]}</strong> won{m[2]}
        </>
      );
    }
  }
  if (key === "work") {
    const m = d.match(/^(.+?)\s+completed\b([\s\S]*)$/);
    if (m) {
      return (
        <>
          <strong>{m[1]}</strong> completed{m[2]}
        </>
      );
    }
  }

  return d;
}

type ChatMsg = { role: "user" | "agent"; text: string };

type ZionBetCategorySlug = "crypto" | "clan_wars" | "deaths" | "events" | "politics";
type ZionBetCategoryFilter = "all" | ZionBetCategorySlug;

type ZionBetTimeframeFilterKey =
  | "all"
  | "15min"
  | "1h"
  | "4h"
  | "24h"
  | "7d"
  | "30d"
  | "1y";

type ZionBetBracketRow = {
  index: number;
  label: string;
  is_current: boolean;
  yes_cents: number;
  no_cents: number;
  volume_zion: number;
};

type ZionBetMarket = {
  id: string;
  question: string;
  event_type: string;
  /** Crowd-implied probability 1–99 (shown as ¢ like Polymarket). */
  yes_cents?: number;
  no_cents?: number;
  yes_count?: number;
  no_count?: number;
  timeframe?: string;
  resolves_at_iso?: string | null;
  /** Alias for countdown (ISO string). */
  resolves_at?: string | null;
  /** Total ZION staked on this market (sum of bet amounts). */
  volume_zion?: number;
  /** Total SUI staked on this market (API). */
  volume_sui?: number;
  category?: ZionBetCategorySlug;
  /** Longer headline for cards/detail; `question` stays canonical for API/DB. */
  display_question?: string;
  /** CoinGecko spot (USD) when market tracks an asset. */
  spot_usd?: number;
  /** Ticker label for spot formatting (BTC, ETH, SUI, DOGE). */
  token?: string;
  /** `updown` = direction-only; `brackets` = long-term USD buckets (per-bracket YES/NO). */
  market_kind?: "updown" | "brackets";
  brackets?: ZionBetBracketRow[];
};

type ZionbetApiMarket = {
  id: string;
  question: string;
  event_type: string;
  timeframe?: string;
  category?: string;
  yes_pct?: number;
  no_pct?: number;
  seed_yes_cents?: number;
  volume?: number;
  end_date?: string | null;
};

type ZionbetMarketsBundle = {
  crypto: ZionbetApiMarket[];
  sports: ZionbetApiMarket[];
  civilization: ZionbetApiMarket[];
};

type ZionbetBetTab =
  | "civilization"
  | "crypto"
  | "sports"
  | "politics"
  | "finance"
  | "world"
  | "history";

const ZIONBET_TAB_POLY_CATEGORIES: Record<ZionbetBetTab, string[]> = {
  civilization: [],
  crypto: ["crypto"],
  sports: ["sports"],
  politics: ["politics"],
  finance: ["finance", "tech"],
  world: ["geopolitics", "events", "culture"],
  history: [],
};

const ZIONBET_POLY_FETCH_CATEGORIES = [
  "crypto",
  "sports",
  "politics",
  "finance",
  "tech",
  "geopolitics",
  "events",
  "culture",
] as const;

const ZIONBET_CARD_BORDER = "#00ff41";
const ZIONBET_CARD_BG = "rgba(0,255,65,0.04)";

function zionbetApiToMarket(m: ZionbetApiMarket): ZionBetMarket {
  const yes = m.yes_pct ?? m.seed_yes_cents ?? 50;
  const no = m.no_pct ?? 100 - yes;
  const cat = (m.category || "events") as ZionBetCategorySlug;
  return {
    id: m.id,
    question: m.question,
    event_type: m.event_type,
    timeframe: m.timeframe,
    yes_cents: yes,
    no_cents: no,
    category: cat,
  };
}

function zionbetStableVolume(id: string, min: number, max: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return min + (Math.abs(h) % (max - min + 1));
}

function zionbetPolyVolumeLabel(rawVol: number): string {
  const vol = rawVol / 1000;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M SUI vol`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(1)}K SUI vol`;
  return `${Math.round(vol)} SUI vol`;
}

/** ZION-native markets keep stable / displayed SUI volume. */
function zionbetVolumeSuiAmount(volume?: number, id?: string): number {
  const v = Number(volume) || 0;
  if (id?.startsWith("poly-")) return v / 1000;
  if (v > 0) return Math.round(v);
  if (id) return zionbetStableVolume(id, 500, 2000);
  return 0;
}

function zionbetVolumeSuiLabel(volume?: number, id?: string): string {
  if (id?.startsWith("poly-")) {
    return zionbetPolyVolumeLabel(Number(volume) || 0);
  }
  const sui = zionbetVolumeSuiAmount(volume, id);
  if (sui >= 1_000_000) return `${(sui / 1_000_000).toFixed(1)}M SUI vol`;
  if (sui >= 1_000) return `${(sui / 1_000).toFixed(1)}K SUI vol`;
  return `${sui.toLocaleString()} SUI vol`;
}

function zionbetCardVolumeSui(_tab: ZionbetBetTab, id: string, volume?: number): number {
  return zionbetVolumeSuiAmount(volume, id);
}

function zionbetIsPolyMarket(id: string): boolean {
  return id.startsWith("poly-");
}

function zionbetResolutionCriteria(m: ZionbetApiMarket): string {
  if (zionbetIsPolyMarket(m.id)) {
    return "Market resolves based on real-world outcome. Settlement within 24h of event completion.";
  }
  const stem = m.question.replace(/\?+\s*$/, "").trim();
  const bet = zionbetApiToMarket(m);
  const detail = zionBetMarketRulesText(bet);
  return `Resolved by ZION simulation data. ${detail}`;
}

function zionbetTimeframeEndLabel(tf?: string): string {
  const k = (tf || "").toLowerCase();
  if (k === "24h") return "Ends tomorrow";
  if (k === "7d") return "Ends in 7 days";
  if (k === "30d") return "Ends in 30 days";
  if (k === "1y") return "Ends Dec 2026";
  if (k === "3d") return "Ends in 3 days";
  if (k === "1h" || k === "15m") return "Ends soon";
  return tf ? `Ends · ${tf}` : "Open";
}

function zionbetOddsTrendIndicator(yes: number): { symbol: string; color: string } {
  if (yes > 60) return { symbol: "↑", color: "#00ff41" };
  if (yes < 40) return { symbol: "↓", color: "#ff3232" };
  return { symbol: "—", color: "#888" };
}

type ZionPolyMarket = {
  market_id: string;
  question: string;
  category: string;
  yes_price: number;
  no_price: number;
  volume?: number;
  end_date?: string | null;
};

function polyToApiMarket(m: ZionPolyMarket): ZionbetApiMarket {
  const yes = Math.round(Number(m.yes_price) || 50);
  return {
    id: `poly-${m.market_id}`,
    question: m.question,
    event_type: `poly_${m.market_id}`,
    category: m.category,
    yes_pct: yes,
    no_pct: 100 - yes,
    seed_yes_cents: yes,
    volume: m.volume,
    end_date: m.end_date,
  };
}

function zionbetPolyMarketsForTab(
  tab: ZionbetBetTab,
  polyByCat: Record<string, ZionPolyMarket[]>
): ZionPolyMarket[] {
  return ZIONBET_TAB_POLY_CATEGORIES[tab].flatMap((cat) => polyByCat[cat] ?? []);
}

function zionbetEndDateLabel(endDate?: string | null, timeframe?: string): string {
  if (endDate) {
    const d = new Date(endDate);
    if (!Number.isNaN(d.getTime())) {
      return `Ends ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
  }
  return zionbetTimeframeEndLabel(timeframe);
}

function zionbetMarketEndSortKey(m: ZionbetApiMarket): number {
  if (m.end_date) {
    const t = new Date(m.end_date).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return zionbetTimeframeSortOrder(m.timeframe) * 1e15;
}

function zionbetTruncateQuestion(q: string, max = 40): string {
  const t = q.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function zionbetIsZionNativeMarket(id: string): boolean {
  return !id.startsWith("poly-");
}

function zionbetEmojiTint(category: string): string {
  const tints: Record<string, string> = {
    civilization: "#dcfce7",
    events: "#dcfce7",
    crypto: "#fef3c7",
    sports: "#dbeafe",
    politics: "#fce7f3",
    finance: "#d1fae5",
    geopolitics: "#e0e7ff",
    tech: "#ede9fe",
    culture: "#fce7f3",
    world: "#e0f2fe",
  };
  return tints[category] ?? "#f3f4f6";
}

function zionbetCivilizationEmoji(q: string): string {
  if (/\b(death|die|dies|died|killed)\b/.test(q)) return "💀";
  if (/\b(catastrophe|disaster)\b/.test(q)) return "🌋";
  if (/\b(election|prophet|president)\b/.test(q)) return "🏛️";
  if (/\b(clan war|battle)\b/.test(q)) return "⚔️";
  if (/\b(rebellion|revolution)\b/.test(q)) return "🔥";
  if (/\b(blessing|miracle)\b/.test(q)) return "✨";
  if (/\b(neo|mystery)\b/.test(q)) return "👁️";
  if (/\blottery\b/.test(q)) return "🎰";
  return "🌍";
}

function zionbetCryptoEmoji(q: string): string {
  if (/\b(bitcoin|btc)\b/.test(q)) return "🟠";
  if (/\b(ethereum|eth)\b/.test(q)) return "💎";
  if (/\bsui\b/.test(q)) return "🔵";
  if (/\bdeep\b/.test(q)) return "📊";
  return "📈";
}

function zionbetSportsEmoji(q: string): string {
  if (/\b(football|soccer)\b/.test(q)) return "⚽";
  if (/\b(basketball|nba)\b/.test(q)) return "🏀";
  if (/\b(tennis|wimbledon)\b/.test(q)) return "🎾";
  if (/\b(f1|formula|grand prix)\b/.test(q)) return "🏎️";
  if (/\b(ufc|mma|fight)\b/.test(q)) return "🥊";
  if (/\b(hockey|nhl)\b/.test(q)) return "🏒";
  if (/\b(baseball|mlb)\b/.test(q)) return "⚾";
  return "🏆";
}

function zionbetPoliticsEmoji(q: string): string {
  if (/\b(us|america|republican|democrat)\b/.test(q)) return "🇺🇸";
  if (/\bbrazil\b/.test(q)) return "🇧🇷";
  if (/\b(uk|britain)\b/.test(q)) return "🇬🇧";
  if (/\bfrance\b/.test(q)) return "🇫🇷";
  if (/\bgermany\b/.test(q)) return "🇩🇪";
  return "🗳️";
}

function zionbetMarketEmoji(
  market: ZionbetApiMarket,
  tab: ZionbetBetTab
): { emoji: string; tint: string } {
  const q = market.question.toLowerCase();
  const cat = (market.category || "").toLowerCase();
  const isZion = zionbetIsZionNativeMarket(market.id);

  if (tab === "civilization" || isZion || cat === "civilization" || cat === "events") {
    return { emoji: zionbetCivilizationEmoji(q), tint: zionbetEmojiTint("civilization") };
  }
  if (tab === "crypto" || cat === "crypto") {
    return { emoji: zionbetCryptoEmoji(q), tint: zionbetEmojiTint("crypto") };
  }
  if (tab === "sports" || cat === "sports") {
    return { emoji: zionbetSportsEmoji(q), tint: zionbetEmojiTint("sports") };
  }
  if (tab === "politics" || cat === "politics") {
    return { emoji: zionbetPoliticsEmoji(q), tint: zionbetEmojiTint("politics") };
  }
  if (tab === "finance" || cat === "finance") {
    return { emoji: "💹", tint: zionbetEmojiTint("finance") };
  }
  if (cat === "geopolitics") return { emoji: "🌐", tint: zionbetEmojiTint("geopolitics") };
  if (cat === "tech") return { emoji: "💻", tint: zionbetEmojiTint("tech") };
  if (cat === "culture") return { emoji: "🎭", tint: zionbetEmojiTint("culture") };
  return { emoji: "🌐", tint: zionbetEmojiTint("world") };
}

function zionbetSparklinePoints(yesPct: number): number[] {
  const end = Math.max(5, Math.min(95, yesPct));
  const start = yesPct > 50 ? Math.max(5, end - 18) : Math.min(95, end + 18);
  return Array.from({ length: 7 }, (_, i) => {
    const t = i / 6;
    const wobble = Math.sin(i * 1.2) * 2;
    return Math.round(Math.max(5, Math.min(95, start + (end - start) * t + wobble)));
  });
}

function zionbetOrderBookRows(
  side: "yes" | "no",
  center: number,
  seed: string
): { price: number; size: number }[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Array.from({ length: 4 }, (_, i) => {
    const price =
      side === "yes"
        ? Math.max(1, center - i - 1)
        : Math.min(99, center + i + 1);
    const size = 80 + (Math.abs(h + i * 17) % 420);
    return { price, size };
  });
}

function zionbetAboutMarketText(m: ZionbetApiMarket): {
  yesCondition: string;
  source: string;
  settlement: string;
} {
  const poly = zionbetIsPolyMarket(m.id);
  const bet = zionbetApiToMarket(m);
  const rules = zionBetMarketRulesText(bet);
  return {
    yesCondition: poly
      ? "the real-world outcome matches the market question as stated"
      : rules.replace(/^This market resolves YES if\s*/i, "").replace(/\.$/, "") || rules,
    source: poly ? "Real-world data" : "ZION Simulation",
    settlement: "Within 24h of event end date",
  };
}

function ZionBetMarketCardItem({
  marketApi,
  yes,
  emoji,
  volumeLabel,
  endLabel,
  isZionCard,
  onOpen,
  onBetYes,
  onBetNo,
}: {
  marketApi: ZionbetApiMarket;
  yes: number;
  emoji: string;
  volumeLabel: string;
  endLabel: string;
  isZionCard: boolean;
  onOpen: () => void;
  onBetYes: (e: MouseEvent) => void;
  onBetNo: (e: MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const cardBase: CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    background: "#0d1117",
    border: "1px solid #1e2d3d",
    borderRadius: "10px",
    padding: "14px 16px",
    cursor: "pointer",
    transition: "all 0.15s ease",
  };
  const cardStyle: CSSProperties = hovered
    ? {
        ...cardBase,
        borderColor: "#4DA2FF",
        boxShadow: "0 0 0 1px #4DA2FF22, 0 4px 16px rgba(77,162,255,0.08)",
      }
    : cardBase;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={cardStyle}
    >
      {isZionCard ? (
        <span
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            background: "#052e16",
            color: "#22c55e",
            border: "1px solid #166534",
            fontSize: "10px",
            padding: "2px 6px",
            borderRadius: "4px",
            fontWeight: 600,
          }}
        >
          🌍 ZION
        </span>
      ) : null}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "#1e2d3d",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "18px",
            flexShrink: 0,
          }}
          aria-hidden
        >
          {emoji}
        </div>
        <h4
          style={{
            margin: 0,
            color: "#e6edf3",
            fontSize: "13px",
            fontWeight: 500,
            lineHeight: 1.4,
            flex: 1,
            paddingRight: isZionCard ? 56 : 0,
          }}
        >
          {marketApi.question}
        </h4>
      </div>
      <p style={{ margin: "0 0 8px", color: "#8b9ab1", fontSize: "11px" }}>
        {volumeLabel} · {endLabel}
      </p>
      <div
        style={{
          height: "3px",
          background: "#1e2d3d",
          borderRadius: "2px",
          margin: "8px 0",
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${yes}%`, height: "100%", background: "#22c55e" }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
        <button
          type="button"
          style={{
            background: "#16a34a",
            color: "white",
            border: "none",
            borderRadius: "5px",
            height: "28px",
            fontSize: "12px",
            fontWeight: 600,
            flex: 1,
            cursor: "pointer",
          }}
          onClick={onBetYes}
        >
          YES {yes}¢
        </button>
        <button
          type="button"
          style={{
            background: "#7f1d1d",
            color: "#fca5a5",
            border: "none",
            borderRadius: "5px",
            height: "28px",
            fontSize: "12px",
            fontWeight: 600,
            flex: 1,
            cursor: "pointer",
          }}
          onClick={onBetNo}
        >
          NO {100 - yes}¢
        </button>
      </div>
    </article>
  );
}

function ZionBetMarketDetailOverlay({
  apiMarket,
  walletConnected,
  walletAddress,
  myBets,
  betAmount,
  setBetAmount,
  betCurrency,
  setBetCurrency,
  betLoading,
  onPlaceBet,
  onClose,
}: {
  apiMarket: ZionbetApiMarket;
  walletConnected: boolean;
  walletAddress: string;
  myBets: ZionBetMyBetRow[];
  betAmount: string;
  setBetAmount: (v: string) => void;
  betCurrency: "SUI" | "USDC";
  setBetCurrency: (c: "SUI" | "USDC") => void;
  betLoading: boolean;
  onPlaceBet: (market: ZionBetMarket, direction: boolean) => void;
  onClose: () => void;
}) {
  const market = useMemo(() => zionbetApiToMarket(apiMarket), [apiMarket]);
  const yes = apiMarket.yes_pct ?? apiMarket.seed_yes_cents ?? 50;
  const no = apiMarket.no_pct ?? 100 - yes;
  const [betDirection, setBetDirection] = useState(true);
  const odds = zionBetDisplayOdds(market);
  const volumeLabel = zionbetVolumeSuiLabel(apiMarket.volume, apiMarket.id);
  const volumeSui = zionbetVolumeSuiAmount(apiMarket.volume, apiMarket.id);
  const volumeStatsLabel =
    volumeSui >= 1_000_000
      ? `${(volumeSui / 1_000_000).toFixed(1)}M`
      : volumeSui >= 1_000
        ? `${(volumeSui / 1_000).toFixed(1)}K`
        : volumeSui.toLocaleString();
  const endLabel = zionbetEndDateLabel(apiMarket.end_date, apiMarket.timeframe);
  const categoryLabel =
    apiMarket.category?.replace(/_/g, " ").toUpperCase() ||
    (zionbetIsPolyMarket(apiMarket.id) ? "MARKET" : "CIVILIZATION");
  const tfLabel = apiMarket.timeframe
    ? zionBetTimeframeShort(apiMarket.timeframe)
    : endLabel.replace(/^Ends /, "");
  const about = zionbetAboutMarketText(apiMarket);
  const sparkPts = useMemo(() => zionbetSparklinePoints(yes), [yes]);
  const yesBook = useMemo(() => zionbetOrderBookRows("yes", yes, apiMarket.id), [yes, apiMarket.id]);
  const noBook = useMemo(() => zionbetOrderBookRows("no", no, apiMarket.id), [no, apiMarket.id]);
  const userPosition = useMemo(
    () => myBets.find((b) => b.market_id === apiMarket.id || b.question === apiMarket.question),
    [myBets, apiMarket]
  );

  const amt = parseFloat(betAmount || "0");
  const oddsCents = betDirection ? odds.yes : odds.no;
  const payout = oddsCents > 0 ? amt * (100 / oddsCents) : 0;
  const chartW = 640;
  const chartH = 180;
  const pad = { l: 48, r: 16, t: 14, b: 36 };
  const chartXLabels = ["7d ago", "6d", "5d", "4d", "3d", "2d", "1d", "today"];
  const innerW = chartW - pad.l - pad.r;
  const innerH = chartH - pad.t - pad.b;
  const linePath = sparkPts
    .map((p, i) => {
      const x = pad.l + (i / 6) * innerW;
      const y = pad.t + innerH - (p / 100) * innerH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const sectionTitleStyle: CSSProperties = {
    color: "#4DA2FF",
    fontSize: "11px",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    marginBottom: "12px",
    marginTop: 0,
    fontWeight: 600,
  };
  const panelStyle: CSSProperties = {
    background: "#0d1117",
    border: "1px solid #1e2d3d",
    borderRadius: "8px",
    padding: "20px",
    marginBottom: "16px",
  };
  const addQuickAmount = (n: number) => {
    const cur = parseFloat(betAmount || "0") || 0;
    setBetAmount(String(Math.round((cur + n) * 100) / 100));
  };
  const yesBtnSelected: CSSProperties = {
    background: "#22c55e",
    color: "white",
    border: "none",
    borderRadius: "6px",
    height: "40px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  };
  const noBtnSelected: CSSProperties = {
    background: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "6px",
    height: "40px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  };
  const toggleBtnUnselected: CSSProperties = {
    background: "#1e2d3d",
    color: "#8b9ab1",
    border: "1px solid #2d3f55",
    borderRadius: "6px",
    height: "40px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={apiMarket.question}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        overflowY: "auto",
        background: "#0a0e1a",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "52px",
          background: "#0d1117",
          borderBottom: "1px solid #1e2d3d",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          zIndex: 10001,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            cursor: "pointer",
            color: "#4DA2FF",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "none",
            border: "none",
            padding: 0,
          }}
        >
          ← Back
        </button>
        <span
          style={{
            color: "#8b9ab1",
            fontSize: 13,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "min(520px, 55vw)",
          }}
        >
          {apiMarket.question}
        </span>
      </div>

      <div style={{ marginTop: "52px", minHeight: "100vh", background: "#0a0e1a" }}>
        <div
          style={{
            background: "#0d1117",
            borderBottom: "1px solid #1e2d3d",
            padding: "28px 40px",
          }}
        >
          <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <span
                style={{
                  background: "#1e2d3d",
                  color: "#4DA2FF",
                  fontSize: "11px",
                  padding: "4px 10px",
                  borderRadius: "4px",
                  fontWeight: 500,
                }}
              >
                {categoryLabel}
              </span>
              {tfLabel ? (
                <span
                  style={{
                    background: "#1e2d3d",
                    color: "#8b9ab1",
                    fontSize: "11px",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    fontWeight: 500,
                  }}
                >
                  {tfLabel}
                </span>
              ) : null}
            </div>
            <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#e6edf3", margin: "0 0 16px", lineHeight: 1.3 }}>
              {apiMarket.question}
            </h1>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ color: "#8b9ab1", fontSize: "13px" }}>{volumeLabel}</span>
              <span style={{ color: "#8b9ab1", fontSize: "13px" }}>{endLabel}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <span style={{ fontSize: "22px", fontWeight: 700, color: "#22c55e" }}>YES {yes}¢</span>
              <span style={{ fontSize: "22px", fontWeight: 700, color: "#ef4444" }}>NO {no}¢</span>
            </div>
            <div
              style={{
                height: "8px",
                background: "#1e2d3d",
                borderRadius: "4px",
                overflow: "hidden",
                display: "flex",
              }}
            >
              <div style={{ width: `${yes}%`, background: "#22c55e", minWidth: yes > 0 ? 2 : 0 }} />
              <div style={{ width: `${no}%`, background: "#ef4444", minWidth: no > 0 ? 2 : 0 }} />
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 340px",
            gap: "24px",
            padding: "24px 40px",
            background: "#0a0e1a",
            maxWidth: "1180px",
            margin: "0 auto",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <section style={{ marginBottom: 16 }}>
              <h3 style={sectionTitleStyle}>Price chart</h3>
              <div
                style={{
                  background: "#0d1117",
                  border: "1px solid #1e2d3d",
                  borderRadius: "8px",
                  padding: "20px",
                }}
              >
                <div style={{ background: "#0a0e1a", borderRadius: "6px", padding: "8px 4px" }}>
                  <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} style={{ display: "block", height: 200 }}>
                    {[25, 50, 75].map((tick) => {
                      const y = pad.t + innerH - (tick / 100) * innerH;
                      return (
                        <line
                          key={`grid-${tick}`}
                          x1={pad.l}
                          y1={y}
                          x2={chartW - pad.r}
                          y2={y}
                          stroke="#1e2d3d"
                          strokeWidth={1}
                          strokeDasharray="4 3"
                        />
                      );
                    })}
                    {[0, 25, 50, 75, 100].map((tick) => {
                      const y = pad.t + innerH - (tick / 100) * innerH;
                      return (
                        <text
                          key={`y-${tick}`}
                          x={pad.l - 8}
                          y={y + 4}
                          fill="#8b9ab1"
                          fontSize={10}
                          textAnchor="end"
                          fontFamily="ui-sans-serif, system-ui, sans-serif"
                        >
                          {tick}¢
                        </text>
                      );
                    })}
                    <path d={linePath} fill="none" stroke="#4DA2FF" strokeWidth={2} />
                    {sparkPts.map((p, i) => {
                      const x = pad.l + (i / 6) * innerW;
                      const y = pad.t + innerH - (p / 100) * innerH;
                      return <circle key={i} cx={x} cy={y} r={4} fill="#4DA2FF" />;
                    })}
                    {chartXLabels.map((label, i) => {
                      const x = pad.l + (i / (chartXLabels.length - 1)) * innerW;
                      return (
                        <text
                          key={`x-${label}`}
                          x={x}
                          y={chartH - 8}
                          fill="#8b9ab1"
                          fontSize={9}
                          textAnchor="middle"
                          fontFamily="ui-sans-serif, system-ui, sans-serif"
                        >
                          {label}
                        </text>
                      );
                    })}
                  </svg>
                </div>
              </div>
            </section>

            <section style={{ marginTop: 16 }}>
              <h3 style={sectionTitleStyle}>About this market</h3>
              <div style={{ ...panelStyle, marginTop: 0 }}>
                <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.6, color: "#8b9ab1" }}>
                  <strong style={{ color: "#e6edf3" }}>This market resolves YES if:</strong> {about.yesCondition}
                </p>
                <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.6, color: "#8b9ab1" }}>
                  <strong style={{ color: "#e6edf3" }}>Resolution source:</strong> {about.source}
                </p>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#8b9ab1" }}>
                  <strong style={{ color: "#e6edf3" }}>Settlement:</strong> {about.settlement}
                </p>
              </div>
            </section>

            <section style={{ marginTop: 16 }}>
              <h3 style={sectionTitleStyle}>Order book</h3>
              <div style={{ ...panelStyle, padding: "16px", marginTop: 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <div style={{ color: "#4DA2FF", fontSize: 11, marginBottom: 10, fontWeight: 600, letterSpacing: "0.06em" }}>
                      YES BIDS
                    </div>
                    {yesBook.map((row, idx) => (
                      <div
                        key={`y-${row.price}`}
                        style={{
                          position: "relative",
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 12,
                          padding: "6px 8px",
                          marginBottom: 4,
                          borderRadius: 4,
                          background: `linear-gradient(90deg, rgba(34,197,94,0.1) ${Math.min(100, 20 + idx * 18)}%, transparent ${Math.min(100, 20 + idx * 18)}%)`,
                        }}
                      >
                        <span style={{ color: "#22c55e", fontWeight: 500 }}>{row.price}¢</span>
                        <span style={{ color: "#8b9ab1" }}>{row.size} SUI</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ color: "#4DA2FF", fontSize: 11, marginBottom: 10, fontWeight: 600, letterSpacing: "0.06em" }}>
                      NO BIDS
                    </div>
                    {noBook.map((row, idx) => (
                      <div
                        key={`n-${row.price}`}
                        style={{
                          position: "relative",
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 12,
                          padding: "6px 8px",
                          marginBottom: 4,
                          borderRadius: 4,
                          background: `linear-gradient(90deg, rgba(239,68,68,0.1) ${Math.min(100, 20 + idx * 18)}%, transparent ${Math.min(100, 20 + idx * 18)}%)`,
                        }}
                      >
                        <span style={{ color: "#ef4444", fontWeight: 500 }}>{row.price}¢</span>
                        <span style={{ color: "#8b9ab1" }}>{row.size} SUI</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                background: "#0d1117",
                border: "1px solid #1e2d3d",
                borderRadius: "12px",
                padding: "20px",
                position: "sticky",
                top: "68px",
              }}
            >
              <h3 style={{ color: "#e6edf3", fontSize: "16px", fontWeight: 600, margin: "0 0 16px" }}>
                Place bet
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "8px",
                  marginBottom: "16px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setBetDirection(true)}
                  style={betDirection ? yesBtnSelected : toggleBtnUnselected}
                >
                  YES {odds.yes}¢
                </button>
                <button
                  type="button"
                  onClick={() => setBetDirection(false)}
                  style={!betDirection ? noBtnSelected : toggleBtnUnselected}
                >
                  NO {odds.no}¢
                </button>
              </div>
              <label style={{ display: "block", color: "#8b9ab1", fontSize: "12px", marginBottom: "6px" }}>
                Amount (SUI)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                style={{
                  width: "100%",
                  height: "40px",
                  background: "#1e2d3d",
                  border: "1px solid #2d3f55",
                  color: "#e6edf3",
                  borderRadius: "6px",
                  padding: "0 12px",
                  fontSize: "14px",
                  marginBottom: "8px",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 6, margin: "8px 0" }}>
                {[1, 5, 10, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => addQuickAmount(n)}
                    style={{
                      background: "#1e2d3d",
                      color: "#4DA2FF",
                      border: "1px solid #2d3f55",
                      borderRadius: "4px",
                      padding: "4px 10px",
                      fontSize: "12px",
                      cursor: "pointer",
                      flex: 1,
                    }}
                  >
                    +{n}
                  </button>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <span style={{ color: "#8b9ab1", fontSize: "13px" }}>Potential payout</span>
                <span style={{ color: "#22c55e", fontSize: "13px", fontWeight: 600 }}>
                  {payout.toFixed(3)} {betCurrency}
                </span>
              </div>
              <button
                type="button"
                disabled={betLoading || !walletConnected}
                onClick={() => onPlaceBet(market, betDirection)}
                style={{
                  width: "100%",
                  height: "44px",
                  marginTop: "12px",
                  background: "linear-gradient(135deg, #4DA2FF 0%, #2d7fe0 100%)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "15px",
                  fontWeight: 600,
                  cursor: betLoading || !walletConnected ? "not-allowed" : "pointer",
                  opacity: betLoading || !walletConnected ? 0.5 : 1,
                }}
              >
                {betLoading ? "Placing…" : "Place Bet"}
              </button>
              {!walletConnected ? (
                <p style={{ textAlign: "center", color: "#8b9ab1", fontSize: 12, marginTop: 10 }}>
                  Connect wallet to bet
                </p>
              ) : null}
            </div>

            {userPosition ? (
              <div
                style={{
                  background: "#0d1117",
                  border: "1px solid #1e2d3d",
                  borderRadius: "8px",
                  padding: "20px",
                  marginTop: 16,
                }}
              >
                <h3 style={{ color: "#4DA2FF", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 12px" }}>
                  Your position
                </h3>
                <div style={{ fontSize: 13, color: "#8b9ab1", lineHeight: 1.8 }}>
                  <div>
                    Side:{" "}
                    <span style={{ color: userPosition.direction === "YES" ? "#22c55e" : "#ef4444" }}>
                      {userPosition.direction}
                    </span>
                  </div>
                  <div>Amount: {userPosition.amount_sui} SUI</div>
                  <div>Avg price: {userPosition.odds ?? oddsCents}¢</div>
                  <div>
                    Potential win:{" "}
                    <span style={{ color: "#22c55e" }}>
                      {(userPosition.potential_payout ?? payout).toFixed(3)} SUI
                    </span>
                  </div>
                  <div>Status: {(userPosition.status ?? "active").toUpperCase()}</div>
                </div>
              </div>
            ) : null}

            <div
              style={{
                marginTop: "16px",
                padding: "16px",
                background: "#0a0e1a",
                borderRadius: "8px",
                border: "1px solid #1e2d3d",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  color: "#4DA2FF",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: "12px",
                }}
              >
                Market Stats
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: "#8b9ab1", fontSize: "12px" }}>Total volume</span>
                <span style={{ color: "#e6edf3", fontSize: "12px", fontWeight: 500 }}>
                  {volumeStatsLabel} SUI
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: "#8b9ab1", fontSize: "12px" }}>YES holders</span>
                <span style={{ color: "#22c55e", fontSize: "12px", fontWeight: 500 }}>
                  {yes}%
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: "#8b9ab1", fontSize: "12px" }}>NO holders</span>
                <span style={{ color: "#ef4444", fontSize: "12px", fontWeight: 500 }}>
                  {no}%
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#8b9ab1", fontSize: "12px" }}>Closes</span>
                <span style={{ color: "#e6edf3", fontSize: "12px", fontWeight: 500 }}>{endLabel}</span>
              </div>
            </div>

            <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  const text = `${apiMarket.question} — YES ${yes}¢ / NO ${no}¢ on ZionBet`;
                  void navigator.clipboard?.writeText(text);
                }}
                style={{
                  flex: 1,
                  height: "36px",
                  background: "#1e2d3d",
                  color: "#8b9ab1",
                  border: "1px solid #2d3f55",
                  borderRadius: "6px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                📤 Share
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    const saved = JSON.parse(localStorage.getItem("zionbet_saved_markets") ?? "[]") as string[];
                    if (!saved.includes(apiMarket.id)) {
                      localStorage.setItem(
                        "zionbet_saved_markets",
                        JSON.stringify([...saved, apiMarket.id])
                      );
                    }
                  } catch {
                    /* ignore */
                  }
                }}
                style={{
                  flex: 1,
                  height: "36px",
                  background: "#1e2d3d",
                  color: "#8b9ab1",
                  border: "1px solid #2d3f55",
                  borderRadius: "6px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                🔖 Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



type ZionbetSortKey = "volume" | "ending" | "newest";

function zionbetTimeframeSortOrder(tf?: string): number {
  const k = zionBetTfKeyFromZionMarket(tf ?? "");
  const order: Record<string, number> = {
    "15m": 1,
    "1h": 2,
    "4h": 3,
    "24h": 4,
    "7d": 5,
    "30d": 6,
    "1y": 7,
  };
  return order[k] ?? 99;
}


const ZIONBET_TIMEFRAME_SIDEBAR_ROWS: { key: ZionBetTimeframeFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "15min", label: "15 min" },
  { key: "1h", label: "1 hour" },
  { key: "4h", label: "4 hours" },
  { key: "24h", label: "Daily" },
  { key: "7d", label: "Weekly" },
  { key: "30d", label: "Monthly" },
  { key: "1y", label: "Yearly" },
];

const ZIONBET_BET_TIMEFRAME_SIDEBAR: { icon: string; label: string; tf: string }[] = [
  { icon: "⬛", label: "All", tf: "all" },
  { icon: "⏱️", label: "15 min", tf: "15m" },
  { icon: "🕐", label: "1 hour", tf: "1h" },
  { icon: "🕓", label: "4 hours", tf: "4h" },
  { icon: "📅", label: "Daily", tf: "24h" },
  { icon: "📊", label: "Weekly", tf: "7d" },
  { icon: "📈", label: "Monthly", tf: "30d" },
  { icon: "🗓️", label: "Yearly", tf: "1y" },
];

const ZIONBET_TIMEFRAME_MAP: Record<string, string[]> = {
  "15min": ["15m"],
  "1h": ["1h"],
  "4h": ["4h"],
  "24h": ["24h"],
  "7d": ["7d"],
  "30d": ["30d"],
  "1y": ["1y"],
};

function zionBetMarketMatchesTimeframeFilter(
  marketTf: string | undefined,
  selectedTimeframe: ZionBetTimeframeFilterKey
): boolean {
  if (selectedTimeframe === "all") return true;
  const normalized = zionBetTfKeyFromZionMarket(marketTf ?? "");
  const allowed = ZIONBET_TIMEFRAME_MAP[selectedTimeframe] ?? [selectedTimeframe];
  return allowed.includes(normalized);
}

function zionbetBetTimeframeToFilterKey(tf: string): ZionBetTimeframeFilterKey {
  if (tf === "all") return "all";
  if (tf === "15m") return "15min";
  if (tf === "1h" || tf === "4h" || tf === "24h" || tf === "7d" || tf === "30d" || tf === "1y") {
    return tf;
  }
  return "all";
}

type ZionMyBetRow = {
  id: number;
  question: string;
  event_type: string;
  prediction_label?: string;
  settled: boolean;
  result?: string | null;
  won?: boolean | null;
  created_at?: string | null;
  amount?: number;
};

type ZionBetMyBetRow = {
  id: number;
  market_id?: string;
  question: string;
  direction: string;
  amount_sui: number;
  odds?: number;
  potential_payout?: number;
  payout?: number;
  status?: string;
};

function notifyMyBetsSettlements(
  prev: ZionBetMyBetRow[],
  fetched: ZionBetMyBetRow[],
  setNotify: (n: { message: string; type: "success" | "error" }) => void
) {
  fetched.forEach((bet) => {
    const p = prev.find((b) => b.id === bet.id);
    if (p?.status === "active" && bet.status === "won") {
      const payout = bet.payout ?? bet.potential_payout ?? 0;
      setNotify({
        message: `🏆 You WON! +${payout} SUI on "${bet.question}"`,
        type: "success",
      });
    }
    if (p?.status === "active" && bet.status === "lost") {
      setNotify({
        message: `❌ You lost ${bet.amount_sui} SUI on "${bet.question}"`,
        type: "error",
      });
    }
  });
}

function zionbetMyBetResolvesInLabel(bet: ZionBetMyBetRow): string {
  const hours = [3, 6, 12, 24, 48][Math.abs(bet.id) % 5] ?? 24;
  return `Resolves in ${hours}h`;
}

type ZionBetConfettiParticle = { id: number; color: string; tx: number; ty: number };

function zionbetSpawnConfetti(): ZionBetConfettiParticle[] {
  return Array.from({ length: 50 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 50 + Math.random() * 0.4;
    const dist = 90 + Math.random() * 260;
    return {
      id: i,
      color: ["#00ff41", "#ffd700", "#ffffff"][i % 3]!,
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist,
    };
  });
}

function ZionBetHistoryTab({
  walletConnected,
  myBets,
}: {
  walletConnected: boolean;
  myBets: ZionBetMyBetRow[];
}) {
  const [claimedBetIds, setClaimedBetIds] = useState<Set<number>>(() => new Set());
  const [claimCelebration, setClaimCelebration] = useState<number | null>(null);
  const [confettiParticles, setConfettiParticles] = useState<ZionBetConfettiParticle[]>([]);

  const sorted = useMemo(() => [...myBets].sort((a, b) => b.id - a.id), [myBets]);

  const activeBets = useMemo(
    () =>
      sorted.filter((b) => {
        const s = (b.status || "active").toLowerCase();
        return s === "active" || s === "pending";
      }),
    [sorted]
  );

  const pastBets = useMemo(
    () =>
      sorted.filter((b) => {
        const s = (b.status || "").toLowerCase();
        return s === "won" || s === "lost";
      }),
    [sorted]
  );

  const handleClaim = (bet: ZionBetMyBetRow) => {
    const amount = bet.payout ?? bet.potential_payout ?? 0;
    setClaimedBetIds((prev) => new Set(prev).add(bet.id));
    setClaimCelebration(amount);
    setConfettiParticles(zionbetSpawnConfetti());
    window.setTimeout(() => {
      setClaimCelebration(null);
      setConfettiParticles([]);
    }, 2000);
  };

  const isYes = (dir: string) => dir.toUpperCase() === "YES";

  const renderRow = (bet: ZionBetMyBetRow) => {
    const yes = isYes(bet.direction);
    const statusRaw = (bet.status || "active").toLowerCase();
    const won = statusRaw === "won";
    const lost = statusRaw === "lost";
    const pending = !won && !lost;
    const claimed = claimedBetIds.has(bet.id);
    const payout = bet.potential_payout ?? bet.payout ?? 0;
    const statusLabel = pending ? "PENDING" : won ? "WON" : "LOST";
    const statusColor = pending ? "#facc15" : won ? "#00ff41" : "#ff3232";

    return (
      <article
        key={bet.id}
        className="zionBetHistoryRow"
        title={bet.question}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          padding: "12px 14px",
          border: "1px solid #1a3a1a",
          borderRadius: 8,
          background: "rgba(0,255,65,0.03)",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            flex: "1 1 200px",
            color: "#ddd",
            fontSize: 13,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {zionbetTruncateQuestion(bet.question, 50)}
        </span>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 4,
            background: yes ? "rgba(0,255,65,0.12)" : "rgba(255,50,50,0.12)",
            color: yes ? "#00ff41" : "#ff3232",
            border: `1px solid ${yes ? "#00ff4144" : "#ff323244"}`,
          }}
        >
          {bet.direction}
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#aaa" }}>{bet.amount_sui} SUI</span>
        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#00ff41" }}>
          → {(won ? bet.payout ?? payout : payout).toFixed(3)} SUI
        </span>
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 4,
            color: statusColor,
            border: `1px solid ${statusColor}44`,
            background: `${statusColor}18`,
          }}
        >
          {statusLabel}
        </span>
        <span style={{ fontFamily: "monospace", fontSize: 11, color: "#555", minWidth: 48 }}>#{bet.id}</span>
        {won && !claimed ? (
          <button
            type="button"
            onClick={() => handleClaim(bet)}
            style={{
              marginLeft: "auto",
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #00ff41",
              background: "rgba(0,255,65,0.15)",
              color: "#00ff41",
              fontFamily: "monospace",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            CLAIM
          </button>
        ) : null}
      </article>
    );
  };

  return (
    <section className="zionBetHistory" aria-label="My bet history">
      {claimCelebration !== null ? (
        <div className="zionBetConfettiLayer" aria-live="polite">
          {confettiParticles.map((p) => (
            <span
              key={p.id}
              className="zionBetConfettiParticle"
              style={
                {
                  background: p.color,
                  "--tx": `${p.tx}px`,
                  "--ty": `${p.ty}px`,
                } as CSSProperties
              }
            />
          ))}
          <div className="zionBetClaimOverlay">🎉 +{claimCelebration.toFixed(3)} SUI CLAIMED!</div>
        </div>
      ) : null}

      {!walletConnected ? (
        <p className="zionBetWalletGate zionBetWalletGateCenter">Connect wallet to see your bet history</p>
      ) : sorted.length === 0 ? (
        <p className="zionBetMyBetsEmpty" style={{ textAlign: "center", padding: "32px 0", color: "#888" }}>
          No bets yet. Start predicting! ↑
        </p>
      ) : (
        <>
          <h3 className="zionBetSectionTitle" style={{ margin: "0 0 12px" }}>
            ACTIVE BETS ({activeBets.length})
          </h3>
          {activeBets.length === 0 ? (
            <p style={{ color: "#666", fontSize: 12, marginBottom: 24 }}>No active bets.</p>
          ) : (
            <div style={{ marginBottom: 28 }}>{activeBets.map(renderRow)}</div>
          )}

          <h3 className="zionBetSectionTitle" style={{ margin: "0 0 12px" }}>
            PAST BETS ({pastBets.length})
          </h3>
          {pastBets.length === 0 ? (
            <p style={{ color: "#666", fontSize: 12 }}>No past bets yet.</p>
          ) : (
            <div>{pastBets.map(renderRow)}</div>
          )}
        </>
      )}
    </section>
  );
}


function zionBetCategorySlugFromLabel(label: string): ZionBetCategorySlug {
  const s = label.trim().toLowerCase();
  if (s === "crypto") return "crypto";
  if (s.includes("clan")) return "clan_wars";
  if (s.includes("death")) return "deaths";
  if (s.includes("politic")) return "politics";
  return "events";
}

function zionBetTfKeyFromZionMarket(tf: string): string {
  const t = tf.trim().toLowerCase();
  if (t === "15min" || t === "15m") return "15m";
  if (t === "1h" || t === "1hr") return "1h";
  if (t === "daily" || t === "24h") return "24h";
  if (t === "weekly" || t === "7d") return "7d";
  if (t === "monthly" || t === "30d") return "30d";
  if (t === "yearly" || t === "1y" || t === "year") return "1y";
  if (t === "4h") return "4h";
  return t || "24h";
}

type ZionApiMarket = {
  id: string;
  token: string;
  question: string;
  category: string;
  timeframe: string;
  yes_cents: number;
  no_cents: number;
  volume_sui: number;
};

function zionBetCategoryFromApi(m: ZionApiMarket): ZionBetCategorySlug {
  if (m.category === "crypto") return "crypto";
  if (m.category === "civilization") return "events";
  return zionBetCategorySlugFromLabel(m.category);
}

function zionBetResolvesAtIso(timeframe: string, nowMs: number = Date.now()): string {
  const tf = zionBetTfKeyFromZionMarket(timeframe);
  const offsetsMs: Record<string, number> = {
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "1y": 365 * 24 * 60 * 60 * 1000,
  };
  const ms = offsetsMs[tf] ?? 24 * 60 * 60 * 1000;
  return new Date(nowMs + ms).toISOString();
}

const ZIONBET_TF_DURATION_MS: Record<string, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

function getOrSetResolveTime(marketId: string, timeframe: string): number {
  const tf = zionBetTfKeyFromZionMarket(timeframe);
  const duration = ZIONBET_TF_DURATION_MS[tf] ?? 24 * 60 * 60 * 1000;
  if (typeof window === "undefined") {
    return Date.now() + duration;
  }
  const key = `zionbet_resolves_${marketId}`;
  const stored = localStorage.getItem(key);
  if (stored) {
    const ts = parseInt(stored, 10);
    if (Number.isFinite(ts) && ts > Date.now()) return ts;
  }
  const resolveAt = Date.now() + duration;
  localStorage.setItem(key, String(resolveAt));
  return resolveAt;
}

/** Compact countdown for market cards (1h → minutes, 24h → hours). */
function formatMarketCardCountdown(
  marketId: string,
  timeframe: string | undefined,
  nowMs: number
): string | null {
  const end = getOrSetResolveTime(marketId, timeframe ?? "24h");
  const ms = end - nowMs;
  if (ms <= 0) return "Resolving soon";
  const tf = (timeframe ?? "").toLowerCase();
  if (tf === "1h" || tf === "15m" || tf === "4h") {
    const mins = Math.max(1, Math.ceil(ms / 60000));
    return `${mins}m left`;
  }
  if (tf === "24h") {
    const hours = Math.max(1, Math.ceil(ms / 3600000));
    return `${hours}h left`;
  }
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;
  const mins = Math.max(1, Math.ceil(ms / 60000));
  return `${mins}m left`;
}

function zionBetMarketFromApi(m: ZionApiMarket): ZionBetMarket {
  const timeframe = zionBetTfKeyFromZionMarket(m.timeframe);
  return {
    id: m.id,
    question: m.question,
    event_type: m.id,
    timeframe,
    category: zionBetCategoryFromApi(m),
    market_kind: "updown",
    token: m.token,
    yes_cents: Math.max(1, Math.min(99, Math.round(m.yes_cents))),
    no_cents: Math.max(1, Math.min(99, Math.round(m.no_cents))),
    volume_sui: m.volume_sui,
    volume_zion: m.volume_sui,
    resolves_at_iso: zionBetResolvesAtIso(timeframe),
  };
}

function zionMyBetFromApi(row: Record<string, unknown>): ZionMyBetRow {
  const status = String(row.status ?? "");
  const settled = status !== "" && status !== "active";
  const payout = typeof row.payout === "number" ? row.payout : Number(row.payout ?? 0);
  const direction = row.direction === "YES" || row.direction === "NO" ? row.direction : row.prediction ? "YES" : "NO";
  let result: string | null = "PENDING";
  let won: boolean | null = null;
  if (settled) {
    won = payout > 0;
    result = won ? "WIN" : "LOSS";
  }
  return {
    id: typeof row.id === "number" ? row.id : Number(row.id),
    question: String(row.question ?? ""),
    event_type: String(row.market_id ?? row.event_type ?? ""),
    prediction_label: direction,
    settled,
    result,
    won,
    created_at: row.created_at != null ? String(row.created_at) : null,
    amount: typeof row.amount_sui === "number" ? row.amount_sui : Number(row.amount_sui ?? row.amount ?? 0),
  };
}

type LeaderboardEntry = {
  rank?: number;
  wallet?: string;
  points?: number;
  messages?: number;
  messages_sent?: number;
  zion_spent?: number;
};

function shortWallet(w: string) {
  if (!w?.trim()) return "—";
  const s = w.trim();
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

type ChatClassFilter = "elite" | "middle" | "poor";

/** Exact query string so `class_filter` always matches DB (`elite` | `middle` | `poor`). */
function chatAgentsListUrl(cls: ChatClassFilter): string {
  switch (cls) {
    case "elite":
      return "/api/agents?class_filter=elite&limit=50";
    case "middle":
      return "/api/agents?class_filter=middle&limit=50";
    case "poor":
      return "/api/agents?class_filter=poor&limit=50";
  }
}

function SilverCoin() {
  return (
    <svg
      className="silverCoinSvg"
      width="150"
      height="150"
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="znRim" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fefefe" />
          <stop offset="20%" stopColor="#dce2e6" />
          <stop offset="45%" stopColor="#9aa8b0" />
          <stop offset="72%" stopColor="#5a6670" />
          <stop offset="100%" stopColor="#2a3238" />
        </linearGradient>
        <linearGradient id="znRimMint" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(200,255,245,0.35)" />
          <stop offset="40%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(0,40,50,0.25)" />
        </linearGradient>
        <radialGradient id="znField" cx="34%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#f2f4f6" />
          <stop offset="25%" stopColor="#d4d8dc" />
          <stop offset="55%" stopColor="#9ca4ac" />
          <stop offset="82%" stopColor="#6a727a" />
          <stop offset="100%" stopColor="#4a5258" />
        </radialGradient>
        <radialGradient id="znFieldCool" cx="78%" cy="85%" r="55%">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" />
          <stop offset="70%" stopColor="rgba(20,35,50,0.18)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
        </radialGradient>
        <radialGradient id="znGleam" cx="28%" cy="22%" r="38%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.15)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <linearGradient id="znZMetal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e8eef2" />
          <stop offset="35%" stopColor="#889098" />
          <stop offset="100%" stopColor="#2a3034" />
        </linearGradient>
        <linearGradient id="znOrbit" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="rgba(180,220,230,0.9)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.95)" />
          <stop offset="100%" stopColor="rgba(120,160,175,0.85)" />
        </linearGradient>
        <filter id="znDrop" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#000" floodOpacity="0.78" />
          <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity="0.45" />
        </filter>
        <filter id="znChisel" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.1" stdDeviation="0.75" floodColor="#000" floodOpacity="0.55" />
          <feDropShadow dx="-0.5" dy="-0.5" stdDeviation="0.28" floodColor="#fff" floodOpacity="0.38" />
        </filter>
        <filter id="znRelief" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0.6" dy="1.4" stdDeviation="1.1" floodColor="#000" floodOpacity="0.4" />
        </filter>
      </defs>

      <path id="znArcBot" d="M 22 109 A 78 78 0 0 0 178 109" fill="none" />

      <g filter="url(#znDrop)">
        <ellipse cx="102" cy="184" rx="78" ry="12" fill="rgba(0,0,0,0.48)" />
        <circle cx="104" cy="106" r="100" fill="rgba(0,0,0,0.5)" />
        <circle cx="100" cy="100" r="100" fill="url(#znRim)" stroke="#1a2228" strokeWidth="1.6" />
        <circle cx="100" cy="100" r="100" fill="url(#znRimMint)" />
        <circle
          cx="100"
          cy="100"
          r="96"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="0.85"
          strokeDasharray="2 2.8"
        />
        <circle cx="100" cy="100" r="92" fill="none" stroke="#3a444c" strokeWidth="1.15" />
        <circle cx="100" cy="100" r="89" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.4" />

        <circle cx="100" cy="100" r="87" fill="url(#znField)" stroke="#5a626a" strokeWidth="0.55" />
        <circle cx="100" cy="100" r="87" fill="url(#znFieldCool)" />
        <circle cx="100" cy="100" r="87" fill="url(#znGleam)" />

        {/* Micro brushed striations */}
        <g opacity="0.14" stroke="rgba(255,255,255,0.9)" strokeWidth="0.35" fill="none">
          <path d="M 38 72 Q 100 88 162 68" />
          <path d="M 32 92 Q 100 108 168 88" />
          <path d="M 34 118 Q 100 132 166 112" />
        </g>

        {/* Sunburst field */}
        <g opacity="0.5">
          <path fill="rgba(255,255,255,0.07)" d="M100 100 L178 100 L100 87 Z" />
          <path fill="rgba(0,0,0,0.06)" d="M100 100 L100 22 L113 100 Z" />
          <path fill="rgba(255,255,255,0.06)" d="M100 100 L22 100 L100 113 Z" />
          <path fill="rgba(0,0,0,0.05)" d="M100 100 L100 178 L87 100 Z" />
          <path fill="rgba(255,255,255,0.05)" d="M100 100 L156 44 L100 94 Z" />
          <path fill="rgba(0,0,0,0.05)" d="M100 100 L44 44 L94 100 Z" />
          <path fill="rgba(255,255,255,0.05)" d="M100 100 L156 156 L100 106 Z" />
          <path fill="rgba(0,0,0,0.05)" d="M100 100 L44 156 L106 100 Z" />
          <path fill="rgba(255,255,255,0.04)" d="M100 100 L170 126 L100 96 Z" />
          <path fill="rgba(0,0,0,0.04)" d="M100 100 L30 74 L100 104 Z" />
          <path fill="rgba(255,255,255,0.04)" d="M100 100 L170 74 L100 104 Z" />
          <path fill="rgba(0,0,0,0.04)" d="M100 100 L30 126 L100 96 Z" />
        </g>

        {/* Constellation micro-dots */}
        <g fill="rgba(255,255,255,0.35)">
          <circle cx="58" cy="68" r="0.9" />
          <circle cx="142" cy="74" r="0.7" />
          <circle cx="72" cy="132" r="0.8" />
          <circle cx="138" cy="128" r="0.6" />
          <circle cx="48" cy="104" r="0.5" />
          <circle cx="154" cy="98" r="0.65" />
        </g>

        {/* Orbital */}
        <ellipse
          cx="100"
          cy="100"
          rx="54"
          ry="20"
          transform="rotate(-14 100 100)"
          fill="none"
          stroke="url(#znOrbit)"
          strokeWidth="1.1"
          opacity="0.85"
        />

        {/* Faceted Z monogram — extruded layers (flip for correct reading) */}
        <g filter="url(#znRelief)" transform="translate(100,102) scale(-1,1)">
          <g fill="#1a1e22" stroke="none" transform="translate(1.2,2)">
            <path d="M-32 -36 L32 -36 L32 -22 L-10 -22 L28 22 L32 36 L-32 36 L-32 22 L6 22 L-28 -14 L-32 -22 Z" />
          </g>
          <g fill="#0d1014" stroke="none" transform="translate(0.6,1)">
            <path d="M-32 -36 L32 -36 L32 -22 L-10 -22 L28 22 L32 36 L-32 36 L-32 22 L6 22 L-28 -14 L-32 -22 Z" />
          </g>
          <g fill="url(#znZMetal)" stroke="#2a343c" strokeWidth="0.45">
            <path d="M-32 -36 L32 -36 L32 -22 L-10 -22 L28 22 L32 36 L-32 36 L-32 22 L6 22 L-28 -14 L-32 -22 Z" />
          </g>
          <path
            d="M-24 -28 L20 -28 L18 -26 L-16 -26 L22 18 L24 28 L-24 28 L-24 26 L4 26 L-22 -12 Z"
            fill="rgba(255,255,255,0.12)"
            stroke="none"
          />
        </g>

        {/* Bottom hex signature */}
        <text fill="rgba(255,255,255,0.22)" fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" fontSize="8.8" fontWeight="600" letterSpacing="0.14em">
          <textPath href="#znArcBot" startOffset="50%" textAnchor="middle">
            0x5A494F4E
          </textPath>
        </text>
        <text filter="url(#znChisel)" fill="#252b30" fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" fontSize="8.8" fontWeight="600" letterSpacing="0.14em">
          <textPath href="#znArcBot" startOffset="50%" textAnchor="middle">
            0x5A494F4E
          </textPath>
        </text>

        <circle cx="100" cy="100" r="84" fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
      </g>
    </svg>
  );
}

function starsFromStat(value: number | undefined): string {
  const n = Math.max(0, Math.min(5, Math.round((Number(value) || 0) / 20)));
  return `${"⭐".repeat(n)}${"☆".repeat(5 - n)}`;
}

const cleanName = (name: string) => name.replace(/\s+\d+$/, "").trim();

function AgentTile({
  agent,
  maxBalance,
  onClick,
}: {
  agent: Agent;
  maxBalance: number;
  onClick?: () => void;
}) {
  const pct = Math.max(8, Math.round((agent.balance / maxBalance) * 100));
  const tier = (agent.class || "").trim().toLowerCase();
  const nameColor = tier === "elite" ? "#FFD700" : tier === "middle" ? "#C0C0C0" : "#CD7F32";
  const classLabel = tier === "elite" ? "Elite" : tier === "middle" ? "Middle" : "Poor";
  const tooltip = `${classLabel} Agent - ${Math.round(agent.balance)} ZION balance`;
  const charismaStars = starsFromStat(agent.charisma);
  const aggressionStars = starsFromStat(agent.aggression);
  const faithStars = starsFromStat(agent.faith);
  const ambitionStars = starsFromStat(agent.ambition);
  const loyaltyStars = starsFromStat(agent.loyalty);
  const classIcon =
    tier === "elite" ? (
      <span style={{ fontSize: "32px", lineHeight: 1 }}>👑</span>
    ) : tier === "middle" ? (
      <span style={{ fontSize: "32px", lineHeight: 1 }}>🪙</span>
    ) : (
      <span style={{ fontSize: "32px", lineHeight: 1 }}>⚒️</span>
    );
  const cardStyle =
    tier === "elite"
      ? {
          position: "relative" as const,
          border: "2px solid #FFD700",
          boxShadow: "0 0 20px rgba(255,215,0,0.5)",
          background: "rgba(15,12,0,0.98)",
          borderRadius: "8px",
          padding: "16px",
        }
      : tier === "middle"
        ? {
            position: "relative" as const,
            border: "2px solid #C0C0C0",
            boxShadow: "0 0 15px rgba(192,192,192,0.4)",
            background: "rgba(10,10,15,0.98)",
            borderRadius: "8px",
            padding: "16px",
          }
        : {
            position: "relative" as const,
            border: "2px solid #CD7F32",
            boxShadow: "0 0 10px rgba(205,127,50,0.3)",
            background: "rgba(12,8,5,0.98)",
            borderRadius: "8px",
            padding: "16px",
          };
  return (
    <article
      className={`agentCard ${onClick ? " clickable" : ""}`}
      style={cardStyle}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div style={{ position: "absolute", top: "10px", right: "10px", zIndex: 2 }} title={tooltip}>
        {classIcon}
      </div>
      <strong className="agentNameTitle" style={{ color: nameColor }}>
        {cleanName(agent.name)}
      </strong>
      <p className="small">
        {agent.clan ?? "UNASSIGNED"} · {agent.age_days} days
      </p>
      <div className="bar">
        <div className="fill" style={{ width: `${pct}%`, background: nameColor }} />
      </div>
      <p className="small">Balance: {agent.balance.toFixed(2)}</p>
      <div className="traits">
        <div className="traitRow">
          <span>CHARISMA:</span>
          <span className="traitStars">{charismaStars}</span>
        </div>
        <div className="traitRow">
          <span>AGGRESSION:</span>
          <span className="traitStars">{aggressionStars}</span>
        </div>
        <div className="traitRow">
          <span>FAITH:</span>
          <span className="traitStars">{faithStars}</span>
        </div>
        <div className="traitRow">
          <span>AMBITION:</span>
          <span className="traitStars">{ambitionStars}</span>
        </div>
        <div className="traitRow">
          <span>LOYALTY:</span>
          <span className="traitStars">{loyaltyStars}</span>
        </div>
      </div>
    </article>
  );
}

type TabId =
  | "civilization"
  | "chat"
  | "zionbet"
  | "leaderboard"
  | "faucet"
  | "press"
  | "treasury"; // ECO-POL (display label; id kept for routing)

type ParsedPressArticle = {
  headline: string;
  byline: string;
  columns: string[];
  editorsNote: string;
  rawFallback: string;
};

function parsePressNewspaperArticle(raw: string): ParsedPressArticle {
  const headline = raw.match(/^\s*HEADLINE:\s*(.+)$/im)?.[1]?.trim() ?? "";
  const byline = raw.match(/^\s*BYLINE:\s*(.+)$/im)?.[1]?.trim() ?? "";
  let editorsNote =
    raw.match(/^\s*EDITOR['']S\s*NOTE:\s*(.+)$/im)?.[1]?.trim() ??
    raw.match(/^\s*EDITORS\s*NOTE:\s*(.+)$/im)?.[1]?.trim() ??
    "";

  const withoutMeta = raw
    .replace(/^\s*HEADLINE:\s*.+$/im, "")
    .replace(/^\s*BYLINE:\s*.+$/im, "")
    .replace(/^\s*EDITOR['']S\s*NOTE:\s*.+$/im, "")
    .replace(/^\s*EDITORS\s*NOTE:\s*.+$/im, "")
    .trim();

  const betweenDashes = withoutMeta
    .split(/^\s*---\s*$/gm)
    .map((s) => s.trim())
    .filter(Boolean);

  let colBlob = betweenDashes[0] ?? "";
  if (!editorsNote) {
    const em = colBlob.match(/^\s*EDITOR['']S\s*NOTE:\s*(.+)$/im);
    if (em) {
      editorsNote = (em[1] ?? "").trim();
      colBlob = colBlob.replace(/^\s*EDITOR['']S\s*NOTE:\s*.+$/im, "").trim();
    }
  }

  const paras = colBlob
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const columns = [paras[0] ?? "", paras[1] ?? "", paras[2] ?? ""];

  const hasStructure = Boolean(headline || byline || editorsNote || columns.some((c) => c.length > 0));
  return {
    headline,
    byline,
    columns,
    editorsNote,
    rawFallback: hasStructure ? "" : raw.trim(),
  };
}

function parseCooldownPayload(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.cooldown_seconds === "number" && d.cooldown_seconds > 0) {
    return Date.now() + d.cooldown_seconds * 1000;
  }
  if (typeof d.retry_after_seconds === "number" && d.retry_after_seconds > 0) {
    return Date.now() + d.retry_after_seconds * 1000;
  }
  if (typeof d.seconds_until_claim === "number" && d.seconds_until_claim > 0) {
    return Date.now() + d.seconds_until_claim * 1000;
  }
  if (typeof d.next_claim_at === "string") {
    const t = Date.parse(d.next_claim_at);
    if (!Number.isNaN(t) && t > Date.now()) return t;
  }
  const nested = d.faucet ?? d.faucet_status;
  if (nested && typeof nested === "object") {
    return parseCooldownPayload(nested);
  }
  return null;
}

function formatDuration(sec: number) {
  if (sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function topicBadgeEmoji(topic: string): string {
  const q = topic.toLowerCase();
  if (q.includes("gta") || q.includes("game")) return "🎮";
  if (q.includes("bitcoin") || q.includes("stock") || q.includes("market")) return "📈";
  if (q.includes("war")) return "⚔️";
  if (q.includes("celebrity") || q.includes("cancelled")) return "🎭";
  if (q.includes("chatgpt")) return "🤖";
  if (q.includes("failure") || q.includes("son")) return "👪";
  if (q.includes("lgbt")) return "🏳️‍🌈";
  if (q.includes("madrid") || q.includes("sports") || q.includes("championship")) return "⚽";
  if (q.includes("religion") || q.includes("prophet")) return "🔮";
  if (q.includes("fashion")) return "👗";
  if (q.includes("politician") || q.includes("democracy")) return "🏛️";
  return "💬";
}

function topicSnippet(topic: string, maxLen = 44) {
  const t = topic.trim();
  return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
}

const cleanMsg = (s: string) => s.replace(/\s*\*\s*\(\d+\)\s*\*\s*$/, "").trim();

function zionBetDisplayOdds(m: ZionBetMarket): { yes: number; no: number } {
  const y = m.yes_cents;
  const n = m.no_cents;
  if (typeof y === "number" && Number.isFinite(y) && typeof n === "number" && Number.isFinite(n)) {
    const yi = Math.max(1, Math.min(99, Math.round(y)));
    const ni = Math.max(1, Math.min(99, Math.round(n)));
    if (yi + ni === 100) return { yes: yi, no: ni };
  }
  if (typeof y === "number" && Number.isFinite(y)) {
    const yi = Math.max(1, Math.min(99, Math.round(y)));
    return { yes: yi, no: 100 - yi };
  }
  return { yes: 50, no: 50 };
}

function formatResolveCountdown(iso: string | undefined | null, nowMs: number): string | null {
  if (!iso?.trim()) return null;
  const end = Date.parse(iso);
  if (!Number.isFinite(end)) return null;
  let ms = end - nowMs;
  if (ms <= 0) return "Resolving soon";
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return `Resolves in ${parts.join(" ")}`;
}

function zionBetIsShortTermTf(tf?: string): boolean {
  const t = (tf ?? "").toLowerCase();
  return t === "15m" || t === "1h" || t === "24h";
}

function zionBetMarketRulesText(m: ZionBetMarket): string {
  const stem = m.question.replace(/\?+\s*$/, "").trim();
  const et = m.event_type.toLowerCase();
  const mk = m.market_kind;
  const tok = m.token ?? "the asset";
  const tf = m.timeframe ?? "the window";
  if (mk === "brackets") {
    return `Long-term USD buckets (Polymarket-style): each row is its own binary market. YES means ${tok} settles inside that price band at resolution; NO means outside. CoinGecko spot sets bracket edges off live price (ZION uses a fixed $1 reference for labels). The gold-highlighted band contains the current spot. Independent volume per bucket.`;
  }
  if (mk === "updown" && et.startsWith("zion_updown") && zionBetIsShortTermTf(m.timeframe)) {
    return `Short-term direction only: YES = Up, NO = Down for ZION vs the reference at window open. No dollar targets. Empty book shows 50¢ / 50¢ each side. Settlement runs after the resolve time (minimum 24h pending on positions).`;
  }
  if (mk === "updown" && et.startsWith("sui_updown") && zionBetIsShortTermTf(m.timeframe)) {
    return `Short-term direction only: YES = Up, NO = Down vs CoinGecko SUI/USD at window open. No dollar targets. Empty book shows 50¢ / 50¢. Settlement runs after the resolve time (minimum 24h pending on positions).`;
  }
  if (mk === "updown" && et.startsWith("zion_updown")) {
    return `YES (Up) wins if the ZION reference price is higher at resolution than at the start of this market window. NO (Down) wins otherwise. Settlement runs after the resolve time (minimum 24h pending on positions).`;
  }
  if (mk === "updown" && et.startsWith("sui_updown")) {
    return `YES (Up) wins if CoinGecko SUI/USD is higher at resolution than at the start of this market window. NO (Down) wins otherwise. Odds skew lightly from 24h momentum when there is no crowd flow yet. Settlement runs after the resolve time (minimum 24h pending on positions).`;
  }
  const isCgCrypto =
    mk &&
    (et.startsWith("btc_") || et.startsWith("eth_") || et.startsWith("sui_") || et.startsWith("doge_"));
  if (mk === "updown" && isCgCrypto) {
    return `YES (Up) wins if CoinGecko ${tok}/USD is higher at resolution than at the start of this market window. NO (Down) wins otherwise. Odds skew lightly from 24h momentum when there is no crowd flow yet. Settlement runs after the resolve time (minimum 24h pending on positions).`;
  }
  if (et.startsWith("zion_price")) {
    return `UP (YES) wins if ZION reference price is higher at resolution than at the start of this ${tf} window. DOWN (NO) wins otherwise. Outcomes finalize when ZionBet settlement runs (after resolve time and a minimum 24-hour pending period).`;
  }
  if (et.startsWith("sui_price")) {
    return `UP (YES) wins if SUI / USD (CoinGecko) is higher at resolution than at the start of this ${tf} window. DOWN (NO) wins otherwise. Settlement runs after the resolve time (minimum 24h pending on positions).`;
  }
  return `YES wins if ${stem} according to civilization simulation before this market’s resolve time. Final resolution follows ZionBet settlement (after the listed resolve time and the 24h minimum pending period).`;
}

function buildYesPriceChartData(m: ZionBetMarket): { label: string; yes: number }[] {
  const { yes: target } = zionBetDisplayOdds(m);
  const yesN = typeof m.yes_count === "number" ? m.yes_count : 0;
  const noN = typeof m.no_count === "number" ? m.no_count : 0;
  const total = yesN + noN;
  const points = 42;
  const series: { label: string; yes: number }[] = [];
  let v = 50;
  for (let i = 0; i < points; i++) {
    const progress = i / Math.max(1, points - 1);
    const imbalance = total > 0 ? (yesN - noN) / Math.max(1, total) : 0;
    const wobble =
      Math.sin(i * 0.41 + imbalance * 5) * (4.2 + Math.min(total, 40) * 0.06) + Math.cos(i * 0.27) * 2.4;
    v = 50 + (target - 50) * progress + wobble * (1 - progress * 0.78);
    v = Math.max(1, Math.min(99, Math.round(v)));
    const label = i % 7 === 0 ? `${Math.round((i / (points - 1)) * 24)}h` : "";
    series.push({ label, yes: v });
  }
  series[points - 1] = { label: "now", yes: target };
  return series;
}

/** CoinGecko `ids` slug for live USD chart/spot in market detail (ZION has no CG listing). */
const ZIONBET_DETAIL_CG_IDS: Record<string, string | null> = {
  SUI: "sui",
  BTC: "bitcoin",
  ETH: "ethereum",
  ZION: null,
};

function zionBetDetailCoinGeckoId(token: string | undefined): string | null {
  if (!token?.trim()) return null;
  const id = ZIONBET_DETAIL_CG_IDS[token.toUpperCase()];
  return id === undefined ? null : id;
}

function zionBetTimeframeShort(tf?: string): string {
  switch ((tf || "").toLowerCase()) {
    case "15m":
      return "15 min";
    case "1h":
      return "1 hour";
    case "4h":
      return "4 hours";
    case "24h":
      return "Daily";
    case "30d":
      return "Monthly";
    case "7d":
      return "Weekly";
    case "1y":
    case "yearly":
      return "Yearly";
    default:
      return tf || "—";
  }
}

function formatZionVolume(v: unknown): string {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/** Spot display: BTC/ETH — whole dollars; SUI/DOGE — 4 decimals (Polymarket-style). */
function formatSpotUsd(symbol: string, n: number): string {
  const s = symbol.toUpperCase();
  if (s === "BTC" || s === "ETH") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(n);
}

function inferZionBetCategorySlug(eventType: string): ZionBetCategorySlug {
  const t = eventType.toLowerCase();
  if (
    t.includes("brackets") ||
    t.startsWith("zion_updown") ||
    t.startsWith("sui_updown") ||
    t.startsWith("zion_price") ||
    t.startsWith("sui_price") ||
    t.startsWith("btc_") ||
    t.startsWith("eth_") ||
    t.startsWith("doge_") ||
    (t.startsWith("sui_") && t.includes("_updown_"))
  ) {
    return "crypto";
  }
  if (t.startsWith("clan_war")) return "clan_wars";
  if (t === "deaths") return "deaths";
  if (t === "catastrophe" || t === "neo" || t === "blessing") return "events";
  if (t === "election" || t === "rebellion") return "politics";
  return "events";
}

function effectiveZionBetCategorySlug(bet: ZionBetMarket): ZionBetCategorySlug {
  const c = bet.category;
  if (c === "crypto" || c === "clan_wars" || c === "deaths" || c === "events" || c === "politics") return c;
  return inferZionBetCategorySlug(bet.event_type);
}

function zionBetCategoryTabLabel(slug: ZionBetCategorySlug): string {
  switch (slug) {
    case "crypto":
      return "Crypto";
    case "clan_wars":
      return "Clan Wars";
    case "deaths":
      return "Deaths";
    case "events":
      return "Events";
    case "politics":
      return "Politics";
  }
}

function zionBetTimeframeFooterTag(tf?: string): string {
  switch ((tf || "").toLowerCase()) {
    case "15m":
      return "15min";
    case "1h":
      return "1H";
    case "4h":
      return "4H";
    case "24h":
      return "Daily";
    case "30d":
      return "Monthly";
    case "7d":
      return "Weekly";
    case "1y":
      return "Yearly";
    default:
      return tf || "—";
  }
}

/** One-line header for compact market cards: emoji token · timeframe */
function zionBetCompactCardHeaderLeft(bet: ZionBetMarket): string {
  const tf = zionBetTimeframeFooterTag(bet.timeframe);
  const et = bet.event_type.toLowerCase();
  if (et.startsWith("deepbook_")) {
    const tok = (bet.token || "—").toUpperCase();
    if (tok === "BTC") return `₿ BTC · ${tf}`;
    if (tok === "ETH") return `Ξ ETH · ${tf}`;
    if (tok === "SUI") return `◈ SUI · ${tf}`;
    if (tok === "ZION") return `🟢 ZION · ${tf}`;
    return `🟢 ${tok} · ${tf}`;
  }
  if (et.startsWith("zion_updown")) return `🟢 ZION · ${tf}`;
  if (et.startsWith("sui_updown")) return `🟢 SUI · ${tf}`;
  if (et.includes("brackets")) return `📊 ${bet.token ?? "?"} · ${tf}`;
  const tok = bet.token;
  if (tok && /^(btc|eth|sui|doge)_/.test(et)) {
    return `🟢 ${tok} · ${tf}`;
  }
  if (et.startsWith("zion_price")) return `🟢 ZION · ${tf}`;
  if (et.startsWith("sui_price")) return `🟢 SUI · ${tf}`;
  const slug = effectiveZionBetCategorySlug(bet);
  if (slug === "clan_wars") return `⚔️ Clan · ${tf}`;
  if (slug === "deaths") return `💀 Deaths · ${tf}`;
  if (slug === "events") return `🌋 Events · ${tf}`;
  if (slug === "politics") return `🏛️ Politics · ${tf}`;
  return `◇ · ${tf}`;
}

type ZionBetActivityRow = {
  id: number;
  wallet: string;
  prediction_label: string;
  amount: number;
  created_at: string | null;
};
type ZionBetHolderRow = { wallet: string; total_vol: number; yes_vol: number; no_vol: number };

const ZIONBET_PACKAGE = "0xa72560fc86cb9cbbe3755cf8f0bc69d72ed987dee0ed1a2dccf3b0b90d9d2b78";
const DEEPBOOK_PREDICT_PACKAGE = "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
const DEEPBOOK_PREDICT_ID = "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";
const DEEPBOOK_REGISTRY = "0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64";
const DUSDC_TYPE = "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC";

const MARKET_OBJECTS: Record<string, string> = {
  btc_15m: "0xe919326a4dcc86ec864d02dbb74e03a1fe68a6c75fe63b35614c710ef46fc3e2",
  btc_1h: "0x9a4d41099234c2440f9304bf97f9074da134bf717f83ca0bc10b4a739f0c6f0f",
  btc_24h: "0xb793080c46a464b6397c09004c2a844f667d373bdea34bf7a606e40201c6459a",
  btc_7d: "0x5eb0c489f1fab1b62c6471d69b71476c19385905f52da8c0e6bc6314087002f7",
  eth_15m: "0xa13f46cbbc7accd9476faca624a5699f68822e2c1654c6836b37a1a25281b9a2",
  eth_1h: "0xafb20c1cb3617c504edb266f7eea49676fd0f48098c8e42cbf6bef53b58c110a",
  eth_24h: "0x9646bcba74f372f6a92de1744ad261ca585403be00089eee86ae3e3b489f6af6",
  sui_15m: "0xcae3da89b633a4c7f251203490ae9e39de28ec67c31e988f89e399190eea5491",
  sui_1h: "0xd7a512b38dbc469b7704434a22275444cb52640c693e02fb5a1a89dac98a004c",
  sui_24h: "0xca3d4d349b6a8d0e50edeacf901dd24ba5e69b0ae0ce728f2b8e0d4fa50c38d5",
  sui_7d: "0xa9a44c27411fce1e121bf2f9b6ff7a071b6802caf5022b5fcfd13747839b17fb",
  cetus_24h: "0x8d96356b4e732409c9ddf95d2ca7091ec27093f6f918e0c7d4ad4513545005ca",
  walrus_24h: "0x3fad377d72b8bd7af81a069455c7278e895210cf1638674be7d3907b3eace2e5",
  deep_7d: "0x0cbb00e6f66d93e97b3b32fca6c3d266029525a49a72480986bc2ae5d09dcf0b",
};

function getMarketObjectId(marketId: string): string {
  return (MARKET_OBJECTS[marketId] ?? "").trim();
}

function suiTxDigest(result: unknown): string {
  if (
    result &&
    typeof result === "object" &&
    "digest" in result &&
    typeof (result as { digest: unknown }).digest === "string"
  ) {
    return (result as { digest: string }).digest;
  }
  return "";
}

type SignAndExecuteFn = (
  variables: { transaction: Transaction; chain: string },
  options?: {
    onSuccess?: (result: unknown) => void;
    onError?: (error: Error) => void;
  }
) => void;

function executeZionBetOnChain(
  signAndExecute: SignAndExecuteFn,
  params: {
    marketObjectId: string;
    direction: boolean;
    amountSui: number;
    walletAddress: string;
  },
  callbacks: { onSuccess: (digest: string) => void; onError: (message: string) => void }
) {
  const tx = new Transaction();
  const betAmountMist = BigInt(Math.floor(params.amountSui * 1_000_000_000));
  const [betCoin] = tx.splitCoins(tx.gas, [betAmountMist]);
  const receipt = tx.moveCall({
    target: `${ZIONBET_PACKAGE}::zion_bet::place_bet`,
    arguments: [
      tx.object(params.marketObjectId),
      tx.pure.bool(params.direction),
      betCoin,
    ],
  });
  tx.transferObjects([receipt], tx.pure.address(params.walletAddress));

  signAndExecute(
    { transaction: tx, chain: "sui:testnet" },
    {
      onSuccess: (result) => callbacks.onSuccess(suiTxDigest(result)),
      onError: (error) => callbacks.onError(error.message),
    }
  );
}

function executeDeepBookMintBinary(
  signAndExecute: SignAndExecuteFn,
  params: {
    oracleId: string;
    strike: bigint;
    expiry: bigint;
    isCall: boolean;
    amount: number;
    walletAddress: string;
    managerObjectId?: string;
  },
  callbacks: { onSuccess: (digest: string) => void; onError: (message: string) => void }
) {
  const tx = new Transaction();

  // Create or reuse PredictManager
  let manager: ReturnType<typeof tx.moveCall>;
  if (params.managerObjectId) {
    // existing manager - just use it
    manager = tx.object(params.managerObjectId) as unknown as ReturnType<typeof tx.moveCall>;
  } else {
    // create new PredictManager
    manager = tx.moveCall({
      target: `${DEEPBOOK_PREDICT_PACKAGE}::predict_manager::new`,
      arguments: [tx.object(DEEPBOOK_PREDICT_ID)],
    });
  }

  // Deposit DUSDC quote asset
  const amountBase = BigInt(Math.floor(params.amount * 1_000_000)); // DUSDC has 6 decimals

  // Mint binary position (call or put)
  const position = tx.moveCall({
    target: `${DEEPBOOK_PREDICT_PACKAGE}::predict::mint_binary`,
    typeArguments: [DUSDC_TYPE],
    arguments: [
      tx.object(DEEPBOOK_PREDICT_ID),
      manager,
      tx.object(params.oracleId),
      tx.pure.u64(params.strike),
      tx.pure.bool(params.isCall),
      tx.pure.u64(amountBase),
      tx.object("0x6"), // clock
    ],
  });

  tx.transferObjects([position], tx.pure.address(params.walletAddress));

  signAndExecute(
    { transaction: tx, chain: "sui:testnet" },
    {
      onSuccess: (result) => callbacks.onSuccess(suiTxDigest(result)),
      onError: (error) => callbacks.onError(error.message),
    }
  );
}

function ZionBetTradingControls({
  bet,
  walletConnected,
  busyYes,
  busyNo,
  suiPrice,
  onPlace: _onPlace,
  onRefreshBets,
}: {
  bet: ZionBetMarket;
  walletConnected: boolean;
  busyYes: boolean;
  busyNo: boolean;
  suiPrice?: number;
  onPlace: (bet: ZionBetMarket, prediction: boolean, amount: number) => void;
  onRefreshBets?: () => void;
}) {
  const account = useCurrentAccount();
  const walletAddress = account?.address || "";
  const { mutate: signAndExecute, isPending: signAndExecutePending } = useSignAndExecuteTransaction();
  const [betAmount, setBetAmount] = useState("0.1");
  const [currency, setCurrency] = useState<"SUI" | "USDC">("SUI");
  const [selectedSide, setSelectedSide] = useState<"yes" | "no" | null>(null);
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [betSubmitting, setBetSubmitting] = useState(false);
  const [onChainBet, setOnChainBet] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    setSelectedSide(null);
    setOnChainBet(false);
  }, [bet.id]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const { yes: yesDisp, no: noDisp } = zionBetDisplayOdds(bet);
  const placing =
    selectedSide === "yes" ? busyYes : selectedSide === "no" ? busyNo : false;
  const anyBusy = busyYes || busyNo || betSubmitting || signAndExecutePending;
  const betAmountNum = parseFloat(betAmount || "0");
  const buyMarket = tradeMode === "buy" && orderType === "market";
  /** Place order only for Buy+Market; wallet + not busy. Amount checked in onClick. */
  const placeButtonDisabled =
    !walletConnected || anyBusy || !buyMarket || selectedSide === null;

  const handlePlaceBet = async () => {
    if (!account?.address) {
      setToast({ message: "❌ Connect wallet first", type: "error" });
      return;
    }
    if (selectedSide == null) {
      setToast({ message: "Select YES or NO first!", type: "error" });
      return;
    }
    if (currency !== "SUI") {
      setToast({ message: "USDC betting coming soon! Use SUI for now.", type: "error" });
      return;
    }

    const marketObjectId = MARKET_OBJECTS[bet.id || ""];
    const betAmountFloat = parseFloat(betAmount || "0");

    if (betAmountFloat <= 0) {
      setToast({ message: "❌ Enter valid amount", type: "error" });
      return;
    }

    setBetSubmitting(true);

    try {
      const dbRes = await fetch("/api/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: account.address,
          market_id: bet.id,
          direction: selectedSide === "yes",
          amount_sui: betAmountFloat,
        }),
      });
      const dbData = (await dbRes.json()) as {
        success?: boolean;
        error?: string;
        potential_payout?: number;
      };

      if (!dbData.success) {
        setToast({ message: `❌ ${dbData.error || "Failed"}`, type: "error" });
        return;
      }

      if (marketObjectId) {
        const tx = new Transaction();
        const betAmountMist = BigInt(Math.floor(betAmountFloat * 1_000_000_000));
        const [betCoin] = tx.splitCoins(tx.gas, [betAmountMist]);
        const receipt = tx.moveCall({
          target: `${ZIONBET_PACKAGE}::zion_bet::place_bet`,
          arguments: [
            tx.object(marketObjectId),
            tx.pure.bool(selectedSide === "yes"),
            betCoin,
          ],
        });
        tx.transferObjects([receipt], account.address);

        signAndExecute(
          { transaction: tx, chain: "sui:testnet" },
          {
            onSuccess: (result) => {
              setOnChainBet(true);
              const digest =
                result && typeof result === "object" && "digest" in result && typeof result.digest === "string"
                  ? result.digest
                  : "";
              setToast({
                message: `✅ On-chain! TX: ${digest.slice(0, 8)}... Win: ${dbData.potential_payout} SUI`,
                type: "success",
              });
              onRefreshBets?.();
            },
            onError: (error) => {
              setToast({
                message: `⚠️ Saved to DB but on-chain failed: ${error.message?.slice(0, 50)}`,
                type: "error",
              });
              onRefreshBets?.();
            },
          }
        );
      } else {
        setToast({
          message: `✅ Bet placed! Potential win: ${dbData.potential_payout} SUI`,
          type: "success",
        });
        onRefreshBets?.();
      }
    } catch {
      setToast({ message: "❌ Bet failed", type: "error" });
    } finally {
      setBetSubmitting(false);
    }
  };

  const outcomeBtnBase: CSSProperties = {
    fontSize: "1.1rem",
    padding: "12px 0",
    borderRadius: "8px",
    fontWeight: "bold",
    flex: 1,
    cursor: anyBusy ? "not-allowed" : "pointer",
  };

  const yesBtnStyle: CSSProperties =
    selectedSide === "yes"
      ? {
          ...outcomeBtnBase,
          background: "rgba(0,255,65,0.25)",
          border: "2px solid #00ff41",
          boxShadow: "0 0 16px rgba(0,255,65,0.5)",
          color: "#00ff41",
          opacity: 1,
        }
      : {
          ...outcomeBtnBase,
          background: "rgba(0,200,80,0.06)",
          border: "2px solid rgba(0,200,80,0.22)",
          color: "rgba(0,200,80,0.42)",
          opacity: 0.72,
        };

  const noBtnStyle: CSSProperties =
    selectedSide === "no"
      ? {
          ...outcomeBtnBase,
          background: "rgba(255,50,50,0.25)",
          border: "2px solid #ff3232",
          boxShadow: "0 0 16px rgba(255,50,50,0.5)",
          color: "#ff3232",
          opacity: 1,
        }
      : {
          ...outcomeBtnBase,
          background: "rgba(255,50,50,0.06)",
          border: "2px solid rgba(255,50,50,0.22)",
          color: "rgba(255,50,50,0.45)",
          opacity: 0.72,
        };

  const tabActiveGreen: CSSProperties = {
    padding: "6px 20px",
    borderRadius: "20px",
    cursor: "pointer",
    fontSize: "0.85rem",
    background: "rgba(0,255,65,0.2)",
    border: "1px solid #00ff41",
    color: "#00ff41",
  };
  const tabActiveRed: CSSProperties = {
    padding: "6px 20px",
    borderRadius: "20px",
    cursor: "pointer",
    fontSize: "0.85rem",
    background: "rgba(255,50,50,0.2)",
    border: "1px solid #FF3232",
    color: "#FF3232",
  };
  const tabActiveCyan: CSSProperties = {
    padding: "6px 20px",
    borderRadius: "20px",
    cursor: "pointer",
    fontSize: "0.85rem",
    background: "rgba(0,150,255,0.2)",
    border: "1px solid #0096FF",
    color: "#0096FF",
  };
  const tabActiveOrange: CSSProperties = {
    padding: "6px 20px",
    borderRadius: "20px",
    cursor: "pointer",
    fontSize: "0.85rem",
    background: "rgba(255,165,0,0.2)",
    border: "1px solid #FFA500",
    color: "#FFA500",
  };
  const tabInactive: CSSProperties = {
    padding: "6px 20px",
    borderRadius: "20px",
    cursor: "pointer",
    fontSize: "0.85rem",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "rgba(255,255,255,0.35)",
  };

  const presetBtnStyle: CSSProperties = {
    padding: "4px 12px",
    borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.8rem",
  };

  return (
    <>
      <div className="zbPmOutcomeRow" style={{ display: "flex", gap: "12px", margin: "12px 0" }}>
        <button
          type="button"
          className={`zbPmOutcome zbPmOutcomeYes ${selectedSide === "yes" ? "zbPmOutcomeActive" : ""}`}
          style={yesBtnStyle}
          onClick={() => setSelectedSide("yes")}
          disabled={anyBusy}
        >
          <span className="zbPmOutcomeLabel">YES</span>
          <span className="zbPmOutcomePrice">{yesDisp}¢</span>
        </button>
        <button
          type="button"
          className={`zbPmOutcome zbPmOutcomeNo ${selectedSide === "no" ? "zbPmOutcomeActive" : ""}`}
          style={noBtnStyle}
          onClick={() => setSelectedSide("no")}
          disabled={anyBusy}
        >
          <span className="zbPmOutcomeLabel">NO</span>
          <span className="zbPmOutcomePrice">{noDisp}¢</span>
        </button>
      </div>

      <div className="zbPmTabsWrap">
        <div style={{ display: "flex", gap: "8px", margin: "8px 0" }}>
          <button
            type="button"
            style={tradeMode === "buy" ? tabActiveGreen : tabInactive}
            onClick={() => setTradeMode("buy")}
          >
            Buy
          </button>
          <button
            type="button"
            style={tradeMode === "sell" ? tabActiveRed : tabInactive}
            onClick={() => setTradeMode("sell")}
          >
            Sell
          </button>
        </div>
        <div style={{ display: "flex", gap: "8px", margin: "8px 0" }}>
          <button
            type="button"
            style={orderType === "market" ? tabActiveCyan : tabInactive}
            onClick={() => setOrderType("market")}
          >
            Market
          </button>
          <button
            type="button"
            style={orderType === "limit" ? tabActiveOrange : tabInactive}
            onClick={() => setOrderType("limit")}
          >
            Limit
          </button>
        </div>
      </div>

      {tradeMode === "sell" ? (
        <p
          className="zbPmSoon"
          style={{
            margin: "8px 0 0",
            padding: "14px 12px",
            borderRadius: "10px",
            border: "1px dashed rgba(255, 80, 80, 0.35)",
            background: "rgba(40, 10, 10, 0.35)",
            color: "rgba(255, 200, 200, 0.9)",
            fontSize: "0.8rem",
            letterSpacing: "0.06em",
            textAlign: "center",
          }}
        >
          Selling / closing positions — coming soon.
        </p>
      ) : orderType === "limit" ? (
        <p
          className="zbPmSoon"
          style={{
            margin: "8px 0 0",
            padding: "14px 12px",
            borderRadius: "10px",
            border: "1px dashed rgba(255, 165, 0, 0.4)",
            background: "rgba(40, 28, 0, 0.35)",
            color: "rgba(255, 220, 180, 0.92)",
            fontSize: "0.8rem",
            letterSpacing: "0.06em",
            textAlign: "center",
          }}
        >
          Limit orders — coming soon.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "6px", margin: "12px 0" }}>
            <button
              type="button"
              onClick={() => setCurrency("SUI")}
              style={{
                flex: 1,
                padding: "5px",
                background: currency === "SUI" ? "rgba(100,160,255,0.2)" : "transparent",
                border: currency === "SUI" ? "1px solid #64a0ff" : "1px solid #333",
                borderRadius: "6px",
                color: currency === "SUI" ? "#64a0ff" : "#555",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              🔵 SUI
            </button>
            <button
              type="button"
              onClick={() => setCurrency("USDC")}
              style={{
                flex: 1,
                padding: "5px",
                background: currency === "USDC" ? "rgba(100,200,255,0.2)" : "transparent",
                border: currency === "USDC" ? "1px solid #64c8ff" : "1px solid #333",
                borderRadius: "6px",
                color: currency === "USDC" ? "#64c8ff" : "#555",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              💵 USDC
            </button>
          </div>
          <div style={{ fontSize: "0.65rem", color: "#555", marginBottom: "8px" }}>
            {currency === "SUI" && `🔵 SUI — $${suiPrice != null ? suiPrice.toFixed(4) : "..."} · Sui native coin`}
            {currency === "USDC" && "💵 USDC — $1.0000 · USD Coin on Sui"}
          </div>
          <div className="zbPmAmountBlock">
            <span
              style={{
                color: "rgba(0,255,65,0.6)",
                fontSize: "0.75rem",
                display: "block",
                marginBottom: "4px",
              }}
            >
              Amount
            </span>
            <input
              type="text"
              value={betAmount}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9.]/g, "");
                setBetAmount(val);
              }}
              disabled={anyBusy}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: "6px",
                background: "#111",
                border: "1px solid #333",
                color: "#fff",
                fontFamily: "monospace",
                fontSize: "1rem",
                boxSizing: "border-box",
                marginBottom: "8px",
              }}
            />
            <div style={{ display: "flex", gap: "8px", margin: "8px 0", flexWrap: "wrap" }}>
              {[1, 5, 10, 100].map((n) => (
                <button
                  key={n}
                  type="button"
                  style={presetBtnStyle}
                  onClick={() =>
                    setBetAmount(String((Number.isFinite(betAmountNum) ? betAmountNum : 0) + n))
                  }
                  disabled={anyBusy}
                >
                  +{n}
                </button>
              ))}
            </div>
          </div>

          <p style={{ color: "rgba(0,255,65,0.7)", fontSize: "0.85rem", margin: "4px 0 0" }}>
            Potential win: {(betAmountNum * 1.98).toFixed(2)} {currency}
          </p>
        </>
      )}

      {!walletConnected ? (
        <p className="zbPmWalletGate">Connect wallet to trade</p>
      ) : (
        <button
          type="button"
          style={{
            width: "100%",
            padding: "14px",
            marginTop: "12px",
            borderRadius: "8px",
            border: "none",
            fontSize: "1rem",
            fontWeight: "bold",
            cursor: placeButtonDisabled ? "not-allowed" : "pointer",
            opacity: placeButtonDisabled ? 0.5 : 1,
            background: selectedSide === "no" ? "#ff3232" : "#00ff41",
            color: selectedSide === "no" ? "#fff" : "#000",
            boxShadow:
              selectedSide === "no"
                ? "0 0 20px rgba(255,50,50,0.4)"
                : "0 0 20px rgba(0,255,65,0.4)",
          }}
          disabled={placeButtonDisabled}
          onClick={() => void handlePlaceBet()}
        >
          {placing || betSubmitting || signAndExecutePending
            ? "…"
            : selectedSide === "no"
              ? "Place NO order"
              : "Place YES order"}
        </button>
      )}

      {onChainBet ? (
        <span
          style={{
            display: "inline-block",
            marginTop: "10px",
            padding: "4px 10px",
            borderRadius: "6px",
            fontSize: "0.72rem",
            fontFamily: "monospace",
            color: "#00d4ff",
            border: "1px solid rgba(0,212,255,0.45)",
            background: "rgba(0,212,255,0.1)",
          }}
        >
          🔗 On-chain bet
        </span>
      ) : null}

      {toast && (
        <div
          style={{
            position: "fixed",
            top: "70px",
            right: "20px",
            zIndex: 9999,
            background: toast.type === "success" ? "rgba(0,255,65,0.15)" : "rgba(255,65,65,0.15)",
            border: `1px solid ${toast.type === "success" ? "#00ff41" : "#ff4141"}`,
            color: toast.type === "success" ? "#00ff41" : "#ff4141",
            padding: "12px 20px",
            borderRadius: "8px",
            fontFamily: "monospace",
            fontSize: "0.85rem",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}

function ZionBetBracketTradingSidebar({
  bet,
  walletConnected,
  placingKey,
  onPlaceBracket,
}: {
  bet: ZionBetMarket;
  walletConnected: boolean;
  placingKey: string | null;
  onPlaceBracket: (bet: ZionBetMarket, bracketIndex: number, prediction: boolean, amount: number) => void;
}) {
  const brackets = bet.brackets ?? [];
  const [amount, setAmount] = useState(1);

  useEffect(() => {
    setAmount(1);
  }, [bet.id]);

  const presetBtnStyle: CSSProperties = {
    padding: "4px 12px",
    borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.8rem",
  };

  const greenBtn: CSSProperties = {
    padding: "6px 10px",
    borderRadius: "6px",
    fontSize: "0.72rem",
    fontWeight: "bold",
    cursor: !walletConnected ? "not-allowed" : "pointer",
    opacity: !walletConnected ? 0.45 : 1,
    background: "rgba(0,255,65,0.15)",
    border: "1px solid #00ff41",
    color: "#00ff41",
    flexShrink: 0,
  };

  const redBtn: CSSProperties = {
    padding: "6px 10px",
    borderRadius: "6px",
    fontSize: "0.72rem",
    fontWeight: "bold",
    cursor: !walletConnected ? "not-allowed" : "pointer",
    opacity: !walletConnected ? 0.45 : 1,
    background: "rgba(255,50,50,0.15)",
    border: "1px solid #ff3232",
    color: "#ff3232",
    flexShrink: 0,
  };

  return (
    <>
      <div className="zbPmAmountBlock" style={{ marginBottom: 12 }}>
        <span style={{ color: "rgba(0,255,65,0.6)", fontSize: "0.75rem", display: "block", marginBottom: "4px" }}>
          Amount (each bracket)
        </span>
        <span style={{ fontSize: "1.4rem", color: "#fff", fontWeight: "bold", display: "block" }}>{amount} ZION</span>
        <div style={{ display: "flex", gap: "8px", margin: "8px 0", flexWrap: "wrap" }}>
          {[1, 5, 10, 100].map((n) => (
            <button key={n} type="button" style={presetBtnStyle} onClick={() => setAmount((a) => a + n)}>
              +{n}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {brackets.map((b) => {
          const busyY = placingKey === `${bet.id}-b${b.index}-true`;
          const busyN = placingKey === `${bet.id}-b${b.index}-false`;
          return (
            <div
              key={b.index}
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: "6px",
                border: b.is_current ? "1px solid #ffd700" : "1px solid #333",
                background: b.is_current ? "rgba(255,215,0,0.05)" : "transparent",
              }}
            >
              <span
                style={{
                  color: b.is_current ? "#ffd700" : "#fff",
                  fontSize: "0.82rem",
                  flex: "1 1 140px",
                  minWidth: 0,
                }}
              >
                {b.label}
              </span>
              <span style={{ color: "#888", fontSize: "0.8rem", whiteSpace: "nowrap" }}>{formatZionVolume(b.volume_zion)} vol</span>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  style={greenBtn}
                  disabled={!walletConnected || busyY || busyN}
                  onClick={() => onPlaceBracket(bet, b.index, true, amount)}
                >
                  {busyY ? "…" : `YES ${b.yes_cents}¢`}
                </button>
                <button
                  type="button"
                  style={redBtn}
                  disabled={!walletConnected || busyY || busyN}
                  onClick={() => onPlaceBracket(bet, b.index, false, amount)}
                >
                  {busyN ? "…" : `NO ${b.no_cents}¢`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!walletConnected ? <p className="zbPmWalletGate">Connect wallet to trade brackets</p> : null}
    </>
  );
}

function liveCgUsdForToken(token: string | undefined, cg: { SUI?: number }): number | undefined {
  if (!token) return undefined;
  const u = token.toUpperCase();
  if (u === "SUI") return cg.SUI;
  return undefined;
}

function ZionBetMarketCard({
  bet,
  onOpenBetModal,
  onOpenDetail,
  liveCgUsd,
}: {
  bet: ZionBetMarket;
  onOpenBetModal: (bet: ZionBetMarket, direction: boolean) => void;
  onOpenDetail?: () => void;
  liveCgUsd: { SUI?: number };
}) {
  const openable = Boolean(onOpenDetail);
  const [hover, setHover] = useState(false);
  const [picked, setPicked] = useState<"yes" | "no" | null>(null);
  const [cardNow, setCardNow] = useState(() => Date.now());

  useEffect(() => {
    setPicked(null);
  }, [bet.id]);

  useEffect(() => {
    const id = window.setInterval(() => setCardNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const countdownLabel = formatMarketCardCountdown(bet.id, bet.timeframe, cardNow);

  const headline = bet.question.trim();
  const { yes: yesCents, no: noCents } = zionBetDisplayOdds(bet);
  const vol = bet.volume_sui ?? bet.volume_zion;
  const headerLeft = zionBetCompactCardHeaderLeft(bet);
  const { yes: yesCentsBtn, no: noCentsBtn } = zionBetDisplayOdds(bet);

  const livePx = liveCgUsdForToken(bet.token, liveCgUsd);
  const displayUsd =
    typeof livePx === "number"
      ? livePx
      : typeof bet.spot_usd === "number"
        ? bet.spot_usd
        : undefined;

  const yesChosen = picked === "yes";
  const noChosen = picked === "no";

  const yesBtnStyle: CSSProperties = yesChosen
    ? {
        flex: 1,
        padding: "5px",
        borderRadius: "6px",
        fontSize: "0.76rem",
        fontWeight: "bold",
        cursor: "pointer",
        opacity: 1,
        background: "rgba(0,255,65,0.3)",
        border: "1px solid #00ff41",
        color: "#00ff41",
        boxShadow: "0 0 12px rgba(0,255,65,0.4)",
      }
    : {
        flex: 1,
        padding: "5px",
        borderRadius: "6px",
        fontSize: "0.76rem",
        fontWeight: "bold",
        cursor: "pointer",
        opacity: 1,
        background: "rgba(0,255,65,0.12)",
        border: "1px solid #00ff41",
        color: "#00ff41",
      };

  const noBtnStyle: CSSProperties = noChosen
    ? {
        flex: 1,
        padding: "5px",
        borderRadius: "6px",
        fontSize: "0.76rem",
        fontWeight: "bold",
        cursor: "pointer",
        opacity: 1,
        background: "rgba(255,50,50,0.3)",
        border: "1px solid #ff3232",
        color: "#ff3232",
        boxShadow: "0 0 12px rgba(255,50,50,0.4)",
      }
    : {
        flex: 1,
        padding: "5px",
        borderRadius: "6px",
        fontSize: "0.76rem",
        fontWeight: "bold",
        cursor: "pointer",
        opacity: 1,
        background: "rgba(255,50,50,0.12)",
        border: "1px solid #ff3232",
        color: "#ff3232",
      };

  const cardStyle: CSSProperties = {
    border: hover ? "1px solid rgba(255,215,0,0.7)" : "1px solid rgba(255,215,0,0.35)",
    borderRadius: "10px",
    padding: "11px 13px",
    background: "rgba(5,12,5,0.95)",
    boxShadow: hover ? "0 0 18px rgba(255,215,0,0.2)" : "0 0 10px rgba(255,215,0,0.08)",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    height: "152px",
    justifyContent: "space-between",
    transition: "all 0.2s ease",
    cursor: openable ? "pointer" : undefined,
    boxSizing: "border-box",
    overflow: "hidden",
  };

  const questionStyle: CSSProperties = {
    fontSize: "0.86rem",
    fontWeight: "bold",
    color: "#fff",
    lineHeight: "1.3",
    flex: 1,
    margin: 0,
    minHeight: 0,
    overflow: "hidden",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
  };

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={openable ? () => onOpenDetail?.() : undefined}
      role={openable ? "button" : undefined}
      tabIndex={openable ? 0 : undefined}
      onKeyDown={
        openable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenDetail?.();
              }
            }
          : undefined
      }
      style={cardStyle}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, minHeight: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              color: "#00ff41",
              fontSize: "0.7rem",
              flex: "1 1 auto",
              minWidth: 0,
            }}
          >
            {headerLeft}
          </span>
          <span style={{ color: "#ffd700", fontSize: "0.7rem", flexShrink: 0 }}>
            {bet.market_kind === "brackets" ? "Buckets" : `${yesCents}/${noCents}`}
          </span>
        </div>
        {countdownLabel ? (
          <div style={{ color: "#9de8ff", fontSize: "0.68rem", fontFamily: "monospace", marginTop: "-4px" }}>
            ⏱ {countdownLabel}
          </div>
        ) : null}
        <p style={questionStyle}>{headline}</p>
        {bet.token && displayUsd != null ? (
          <div style={{ color: "#888", fontSize: "0.7rem" }}>
            {bet.market_kind === "brackets"
              ? `${bet.token} now: ${formatSpotUsd(bet.token, displayUsd)}`
              : `${bet.token} ${formatSpotUsd(bet.token, displayUsd)} · live`}
          </div>
        ) : null}
      </div>

      <div style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {bet.market_kind === "brackets" ? (
          <div style={{ color: "#666", fontSize: "0.72rem", padding: "6px 0" }}>
            Price buckets · tap card · {formatZionVolume(vol)} vol
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                style={yesBtnStyle}
                onClick={() => {
                  setPicked("yes");
                  onOpenBetModal(bet, true);
                }}
              >
                YES {yesCentsBtn}¢
              </button>
              <button
                type="button"
                style={noBtnStyle}
                onClick={() => {
                  setPicked("no");
                  onOpenBetModal(bet, false);
                }}
              >
                NO {noCentsBtn}¢
              </button>
            </div>
            <div style={{ color: "#444", fontSize: "0.65rem", marginTop: "4px" }}>
              {formatZionVolume(vol)} SUI vol
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function ZionBetMarketDetail({
  market,
  badgeBorder,
  badgeLabel,
  walletConnected,
  walletAddress,
  placingKey,
  onPlace,
  onClose,
  myBetsOnMarket,
  myBets,
  suiPrice,
  onRefreshBets,
}: {
  market: ZionBetMarket;
  badgeBorder: string;
  badgeLabel: string;
  walletConnected: boolean;
  walletAddress: string;
  placingKey: string | null;
  onPlace: (bet: ZionBetMarket, prediction: boolean, amount: number, bracketIndex?: number) => void;
  onClose: () => void;
  myBetsOnMarket: ZionMyBetRow[];
  myBets: ZionBetMyBetRow[];
  suiPrice?: number;
  onRefreshBets?: () => void;
}) {
  const syntheticChartData = useMemo(() => buildYesPriceChartData(market), [market]);
  const [activity, setActivity] = useState<ZionBetActivityRow[]>([]);
  const [holders, setHolders] = useState<ZionBetHolderRow[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);
  const [cgChartRows, setCgChartRows] = useState<{ time: string; price: number }[]>([]);
  const [cgChartLoading, setCgChartLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");

  const detailCgId = useMemo(() => zionBetDetailCoinGeckoId(market.token), [market.token]);

  useEffect(() => {
    const resolveAt = getOrSetResolveTime(market.id, market.timeframe ?? "24h");

    const calcTime = () => {
      const diff = Math.max(0, resolveAt - Date.now());
      if (diff === 0) {
        setTimeLeft("Resolving...");
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);

      if (days > 0) setTimeLeft(`${days}d ${hours}h ${mins}m`);
      else if (hours > 0) setTimeLeft(`${hours}h ${mins}m ${secs}s`);
      else setTimeLeft(`${mins}m ${secs}s`);
    };

    calcTime();
    const interval = window.setInterval(calcTime, 1000);
    return () => clearInterval(interval);
  }, [market.id, market.timeframe]);

  const resolveUrgent =
    timeLeft.length > 0 &&
    timeLeft !== "Resolving..." &&
    (() => {
      const resolveAt = getOrSetResolveTime(market.id, market.timeframe ?? "24h");
      const diff = Math.max(0, resolveAt - Date.now());
      return diff > 0 && diff < 5 * 60 * 1000;
    })();

  useEffect(() => {
    const q = encodeURIComponent(market.question);
    const et = encodeURIComponent(market.event_type);
    void fetch(`/api/market_activity?event_type=${et}&question=${q}`)
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setActivity(d as ZionBetActivityRow[]) : setActivity([])))
      .catch(() => setActivity([]));
    void fetch(`/api/market_holders?event_type=${et}&question=${q}`)
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setHolders(d as ZionBetHolderRow[]) : setHolders([])))
      .catch(() => setHolders([]));
  }, [market.question, market.event_type]);

  useEffect(() => {
    const coinId = detailCgId;
    if (!coinId) {
      setLivePrice(null);
      setPriceChange(null);
      return;
    }
    const fetchPrice = async () => {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`
        );
        const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
        const row = data[coinId];
        setLivePrice(typeof row?.usd === "number" ? row.usd : null);
        setPriceChange(typeof row?.usd_24h_change === "number" ? row.usd_24h_change : null);
      } catch {
        setLivePrice(null);
        setPriceChange(null);
      }
    };
    void fetchPrice();
    const interval = window.setInterval(() => void fetchPrice(), 30000);
    return () => clearInterval(interval);
  }, [detailCgId]);

  useEffect(() => {
    const coinId = detailCgId;
    if (!coinId) {
      setCgChartRows([]);
      setCgChartLoading(false);
      return;
    }
    setCgChartLoading(true);
    void fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=1&interval=hourly`
    )
      .then((r) => r.json())
      .then((data: { prices?: [number, number][] }) => {
        const pairs = Array.isArray(data.prices) ? data.prices : [];
        const rows = pairs
          .map(([timestamp, price]) => {
            const d = new Date(timestamp);
            const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
            const p = typeof price === "number" ? price : NaN;
            return { time, price: p };
          })
          .filter((row) => Number.isFinite(row.price));
        setCgChartRows(rows);
      })
      .catch(() => setCgChartRows([]))
      .finally(() => setCgChartLoading(false));
  }, [detailCgId]);

  const rules = zionBetMarketRulesText(market);

  return (
    <div
      className="zionBetDetailOverlay"
      role="dialog"
      aria-modal="true"
      aria-label={market.question}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(0,8,4,0.94)",
        overflow: "auto",
        padding: "16px",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            marginBottom: 12,
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid rgba(0,255,65,0.35)",
            background: "rgba(0,30,14,0.6)",
            color: "#9effc4",
            cursor: "pointer",
            fontSize: "0.75rem",
            letterSpacing: "0.12em",
          }}
        >
          ← Back to markets
        </button>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(320px, 380px)",
            gap: 20,
            alignItems: "start",
          }}
          className="zionBetDetailGrid"
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "clamp(1.15rem, 3vw, 1.65rem)",
                  color: "#e8fff2",
                  lineHeight: 1.3,
                  flex: "1 1 280px",
                }}
              >
                {market.question}
              </h2>
              {timeLeft ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: "0.78rem",
                    letterSpacing: "0.06em",
                    color: resolveUrgent ? "#ff8888" : "#7dffb8",
                    border: `1px solid ${resolveUrgent ? "rgba(255,65,65,0.5)" : "rgba(0,255,65,0.35)"}`,
                    borderRadius: 999,
                    padding: "6px 12px",
                    background: resolveUrgent ? "rgba(40,8,8,0.55)" : "rgba(0,40,20,0.5)",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: resolveUrgent ? "#ff4141" : "#00ff41",
                      boxShadow: resolveUrgent ? "0 0 10px #ff4141" : "0 0 6px #00ff41",
                      animation: resolveUrgent ? "zionBetPulse 1s ease-in-out infinite" : undefined,
                    }}
                  />
                  Resolves in {timeLeft}
                </span>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              {livePrice != null && Number.isFinite(livePrice) ? (
                <>
                  <span
                    style={{
                      fontSize: "2.2rem",
                      fontWeight: "800",
                      fontFamily: "'Courier New', monospace",
                      color: (priceChange ?? 0) >= 0 ? "#00ff41" : "#ff4141",
                      letterSpacing: "1px",
                    }}
                  >
                    $
                    {livePrice.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  {priceChange != null && Number.isFinite(priceChange) ? (
                    <span
                      style={{
                        color: priceChange >= 0 ? "#00ff41" : "#ff3232",
                        fontSize: "0.85rem",
                      }}
                    >
                      {priceChange >= 0 ? "▲" : "▼"} {Math.abs(priceChange).toFixed(2)}% 24h
                    </span>
                  ) : null}
                  <span style={{ color: "#555", fontSize: "0.7rem" }}>● LIVE</span>
                </>
              ) : null}
            </div>
            <span className="zbPmBadge" style={{ borderColor: badgeBorder, color: badgeBorder }}>
              {badgeLabel}
            </span>

            <div style={{ marginTop: 16, height: 260, width: "100%" }}>
              {!detailCgId ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={syntheticChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(0,255,65,0.08)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: "rgba(180,220,195,0.65)", fontSize: 10 }} />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: "rgba(180,220,195,0.65)", fontSize: 10 }}
                      tickFormatter={(v) => `${v}¢`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(12,20,14,0.95)",
                        border: "1px solid rgba(0,255,65,0.25)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "#b8e8c8" }}
                      formatter={(val: unknown) => [`${typeof val === "number" ? val : "—"}¢`, "YES implied"]}
                    />
                    <Line type="monotone" dataKey="yes" stroke="#00C850" strokeWidth={2} dot={false} name="YES ¢" />
                  </LineChart>
                </ResponsiveContainer>
              ) : cgChartLoading ? (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(160,200,175,0.65)",
                    fontSize: "0.85rem",
                  }}
                >
                  Loading price history…
                </div>
              ) : cgChartRows.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cgChartRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(0,255,65,0.08)" strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fill: "rgba(180,220,195,0.65)", fontSize: 9 }} interval="preserveStartEnd" />
                    <YAxis
                      domain={["auto", "auto"]}
                      tick={{ fill: "rgba(180,220,195,0.65)", fontSize: 10 }}
                      tickFormatter={(v) =>
                        typeof v === "number"
                          ? Math.abs(v) >= 1000
                            ? `$${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}k`
                            : `$${v.toFixed(2)}`
                          : `${v}`
                      }
                      width={56}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(12,20,14,0.95)",
                        border: "1px solid rgba(0,255,65,0.25)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "#b8e8c8" }}
                      formatter={(val: unknown) => [
                        typeof val === "number" ? `$${val.toLocaleString(undefined, { maximumFractionDigits: 6 })}` : "—",
                        "Price",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="#00ff41"
                      strokeWidth={2}
                      name="USD"
                      dot={(props: { cx?: number; cy?: number; index?: number }) => {
                        const { cx, cy, index } = props;
                        const last = cgChartRows.length - 1;
                        if (index === last && cx != null && cy != null) {
                          return <circle cx={cx} cy={cy} r={5} fill="#00ff41" stroke="#051208" strokeWidth={1} />;
                        }
                        return null;
                      }}
                      activeDot={{ r: 6, fill: "#00ff41", stroke: "#051208", strokeWidth: 1 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(160,200,175,0.55)",
                    fontSize: "0.8rem",
                    textAlign: "center",
                    padding: "0 12px",
                  }}
                >
                  Price chart unavailable. Try again later.
                </div>
              )}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: "0.68rem", color: "rgba(160,200,175,0.65)", letterSpacing: "0.06em" }}>
              {!detailCgId
                ? "YES implied probability (¢). Synthetic history blended from crowd YES vs NO flow."
                : cgChartRows.length > 0
                  ? "USD spot (CoinGecko), last 24 hours (hourly samples)."
                  : "Live USD chart uses CoinGecko market data."}
            </p>

            <section style={{ marginTop: 22 }}>
              <h3 style={{ fontSize: "0.72rem", letterSpacing: "0.2em", color: "#9de8ff", marginBottom: 10 }}>RULES</h3>
              <p style={{ fontSize: "0.82rem", color: "rgba(210,235,220,0.92)", lineHeight: 1.55 }}>{rules}</p>
            </section>

            <section style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: "0.72rem", letterSpacing: "0.2em", color: "#9de8ff", marginBottom: 10 }}>ACTIVITY</h3>
              {myBets.length === 0 ? (
                <p style={{ color: "#555" }}>No bets on this market yet.</p>
              ) : (
                myBets
                  .filter((b) => b.market_id === market.id)
                  .map((bet) => (
                    <div
                      key={bet.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "8px 0",
                        borderBottom: "1px solid #111",
                        fontFamily: "monospace",
                        fontSize: "0.8rem",
                      }}
                    >
                      <span style={{ color: bet.direction === "YES" ? "#00ff41" : "#ff4141" }}>
                        {bet.direction} {bet.amount_sui} SUI @ {bet.odds}¢
                      </span>
                      <span style={{ color: "#555" }}>{bet.status}</span>
                    </div>
                  ))
              )}
            </section>

            <section style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: "0.72rem", letterSpacing: "0.2em", color: "#9de8ff", marginBottom: 10 }}>TOP HOLDERS</h3>
              {holders.length === 0 ? (
                <p style={{ fontSize: "0.75rem", color: "rgba(160,190,175,0.55)" }}>No volume yet.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {holders.map((h, i) => (
                    <li
                      key={`${h.wallet}-${i}`}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                        fontSize: "0.72rem",
                        borderBottom: "1px solid rgba(0,255,65,0.08)",
                        paddingBottom: 6,
                      }}
                    >
                      <span style={{ color: "rgba(200,230,210,0.88)" }}>
                        #{i + 1} {shortWallet(h.wallet)}
                      </span>
                      <span style={{ color: "rgba(180,210,195,0.75)" }}>{h.total_vol.toFixed(1)} ZION vol</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div
            style={{
              position: "sticky",
              top: 16,
              background: "rgba(10,18,12,0.95)",
              border: "1px solid rgba(0,255,65,0.22)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            {market.market_kind === "brackets" ? (
              (market.brackets?.length ?? 0) > 0 ? (
                <ZionBetBracketTradingSidebar
                  bet={market}
                  walletConnected={walletConnected}
                  placingKey={placingKey}
                  onPlaceBracket={(b, idx, pred, amt) => onPlace(b, pred, amt, idx)}
                />
              ) : (
                <p style={{ fontSize: "0.82rem", color: "rgba(160,190,175,0.65)", margin: "8px 0" }}>
                  Loading price buckets… If this persists, refresh active markets.
                </p>
              )
            ) : (
              <ZionBetTradingControls
                bet={market}
                walletConnected={walletConnected}
                busyYes={placingKey === `${market.id}-true`}
                busyNo={placingKey === `${market.id}-false`}
                suiPrice={suiPrice}
                onPlace={(b, pred, amt) => onPlace(b, pred, amt)}
                onRefreshBets={onRefreshBets}
              />
            )}
            <section style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: "0.68rem", letterSpacing: "0.18em", color: "#9de8ff", marginBottom: 8 }}>MY POSITIONS</h3>
              {!walletAddress.trim() ? (
                <p style={{ fontSize: "0.72rem", color: "rgba(255,194,120,0.85)" }}>Connect wallet to see positions.</p>
              ) : myBetsOnMarket.length === 0 ? (
                <p style={{ fontSize: "0.72rem", color: "rgba(160,190,175,0.55)" }}>No open bets on this market.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {myBetsOnMarket.slice(0, 12).map((row) => (
                    <li key={row.id} style={{ fontSize: "0.68rem", color: "rgba(200,230,215,0.9)" }}>
                      <strong>{row.prediction_label ?? "—"}</strong> · {row.amount != null ? Number(row.amount).toFixed(1) : "—"} SUI ·{" "}
                      {row.result ?? "PENDING"}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Press papers — module scope so effects never see a new array identity each render. */
type PressNewspaper = {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  accentColor: string;
  bgPattern: string;
  borderColor: string;
  relevantTypes: string[];
  keywords: string[];
  persona: string;
  bodyFont: string;
  mastheadFont: string;
  vipOnly?: boolean;
  silverMin?: number;
  goldMin?: number;
};

const newspapers: PressNewspaper[] = [
  {
    id: "ziontimes",
    name: "ZION TIMES",
    subtitle: "The Paper of Record",
    icon: "🗞️",
    accentColor: "#c8a96e",
    bgPattern: "#0a0800",
    borderColor: "#c8a96e",
    relevantTypes: ["election", "work", "clan", "revolt", "tax"],
    keywords: ["senate", "election", "corrupt", "clan", "tax", "collect"],
    persona:
      "You are the chief editor of ZION TIMES, the civilization's paper of record — inspired by the New York Times. You cover corruption, political failures, senate elections, clan wars, and government inaction with sharp investigative journalism. Be critical, factual, authoritative.",
    bodyFont: "'Source Serif 4', serif",
    mastheadFont: "'Playfair Display', serif",
  },
  {
    id: "economist",
    name: "THE ZION ECONOMIST",
    subtitle: "Markets · Taxes · Growth",
    icon: "📊",
    accentColor: "#e8e8e8",
    bgPattern: "#00080a",
    borderColor: "#e8e8e8",
    relevantTypes: ["tax", "work", "lottery", "birth", "death"],
    keywords: ["zion", "tax", "earn", "balance", "wealth", "poor", "rich"],
    persona:
      "You are the chief editor of THE ZION ECONOMIST. You analyze the civilization's economy: tax revenue, wealth inequality, birth rates vs death rates, ZION token flows. Use real numbers. Be analytical like The Economist magazine. Cover what taxes actually funded, wealth concentration.",
    bodyFont: "'Courier Prime', monospace",
    mastheadFont: "'Oswald', sans-serif",
  },
  {
    id: "prophet",
    name: "PROPHET'S VOICE",
    subtitle: "Visions · Omens · Prophecy",
    icon: "🔮",
    accentColor: "#a78bfa",
    bgPattern: "#08000a",
    borderColor: "#a78bfa",
    relevantTypes: ["prayer", "catastrophe", "death", "neo"],
    keywords: ["prophet", "pray", "NEO", "watches", "storm", "catastrophe"],
    persona:
      "You are the scribe of the PROPHET'S VOICE. You write about the Prophet's visions, spiritual omens, NEO's mysterious movements, and prophecies about the civilization's future. Be mystical, dramatic, ominous. Quote the Prophet directly. Reference signs and portents.",
    bodyFont: "'IM Fell English', serif",
    mastheadFont: "'IM Fell English', serif",
  },
  {
    id: "slums",
    name: "THE GUTTER GAZETTE",
    subtitle: "From the Streets · No Gods No Masters",
    icon: "✊",
    accentColor: "#ff4141",
    bgPattern: "#0a0000",
    borderColor: "#ff4141",
    relevantTypes: ["death", "revolt", "work", "tax"],
    keywords: ["poor", "died", "dead", "tax", "collect", "inequality"],
    persona:
      "You are the editor of THE GUTTER GAZETTE — the underground socialist newspaper of ZION. You write about the suffering of poor agents, deaths from poverty, inequality, how the rich exploit the poor, and how conditions are breeding revolution and anarchy. Be angry, passionate, socialist. Write exactly 3 columns separated by 'Column 1:', 'Column 2:', 'Column 3:' labels. Each column must be in English only, 60-80 words.",
    bodyFont: "'Courier Prime', monospace",
    mastheadFont: "'Special Elite', cursive",
  },
  {
    id: "betinsider",
    name: "BET INSIDER",
    subtitle: "Odds · Analysis · Winners",
    icon: "💰",
    accentColor: "#00d4ff",
    bgPattern: "#00080a",
    borderColor: "#00d4ff",
    relevantTypes: ["bet", "lottery", "market"],
    keywords: ["bet", "won", "lottery", "odds", "market"],
    persona:
      "You are the editor of BET INSIDER. You analyze ZionBet markets, odds, big wins, losing streaks, and betting patterns. Give hot tips, analyze which events to bet on, cover lottery winners. Be like a sports betting analyst — sharp, data-driven, with insider feel.",
    bodyFont: "'Courier Prime', monospace",
    mastheadFont: "'Oswald', sans-serif",
  },
  {
    id: "vip",
    name: "VIP INTEL",
    subtitle: "🔒 Encrypted · Silver & Gold Only",
    icon: "👁️",
    accentColor: "#ffd700",
    bgPattern: "#0a0800",
    borderColor: "#ffd700",
    relevantTypes: ["election", "catastrophe", "clan", "revolt", "prayer", "lottery"],
    keywords: ["NEO", "prophet", "elite", "clan", "catastrophe"],
    persona:
      "You are the anonymous source behind VIP INTEL — an encrypted intelligence briefing for ZION's wealthiest citizens. You provide insider analysis: which clans are about to collapse, upcoming catastrophes, political maneuvers, betting edge. Be like a hedge fund analyst meets spy thriller.",
    bodyFont: "'Source Serif 4', serif",
    mastheadFont: "'Playfair Display', serif",
    vipOnly: true,
    silverMin: 0.1,
    goldMin: 1,
  },
];

const PRESS_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

function readPressCache(newspaperId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const pressCache = localStorage.getItem(`press_${newspaperId}`);
    if (!pressCache) return null;
    const { content, ts } = JSON.parse(pressCache) as { content: string; ts: number };
    if (Date.now() - ts < PRESS_CACHE_TTL_MS && typeof content === "string") return content;
  } catch {
    /* ignore bad cache */
  }
  return null;
}

function readAllPressCaches(): Record<string, string> {
  const articles: Record<string, string> = {};
  for (const newspaper of newspapers) {
    const content = readPressCache(newspaper.id);
    if (content) articles[newspaper.id] = content;
  }
  return articles;
}

function renderArticle(
  text: string,
  ac: string,
  border: string,
  bodyFont: string,
  sealEncrypted?: boolean,
  isMobile?: boolean
) {
  const clean = text.replace(/\*\*/g, "");

  const headlineMatch = clean.match(/HEADLINE:\s*["«»""]?([\s\S]+?)["«»""]?(?:\r?\n|BYLINE|$)/i);
  const headline = headlineMatch?.[1]?.replace(/["«»""]/g, "").trim() ?? "";

  const bylineMatch = clean.match(/BYLINE:\s*([\s\S]+?)(?=\n|---|Column\s*2|EDITOR['']S\s*NOTE|$)/i);
  const byline = bylineMatch?.[1]?.trim() ?? "";

  const editorMatch = clean.match(/EDITOR['']S\s*NOTE:\s*([\s\S]+?)$/im);
  const editorNote = editorMatch?.[1]?.trim() ?? "";

  const col1Match = clean.match(/Column\s*1[:\s*]*\s*([\s\S]+?)(?=Column\s*2|---|EDITOR['']S\s*NOTE|$)/i);
  const col2Match = clean.match(/Column\s*2[:\s*]*\s*([\s\S]+?)(?=Column\s*3|---|EDITOR['']S\s*NOTE|$)/i);
  const col3Match = clean.match(/Column\s*3[:\s*]*\s*([\s\S]+?)(?=---|EDITOR['']S\s*NOTE|$)/i);

  const col1 = col1Match?.[1]?.trim() ?? "";
  const col2 = col2Match?.[1]?.trim() ?? "";
  const col3 = col3Match?.[1]?.trim() ?? "";

  const columns = [col1, col2, col3].filter((c) => c.length > 10);

  const borderSoft = border.length === 7 ? `${border}44` : border;

  return (
    <div>
      {headline ? (
        <h2
          style={{
            color: ac,
            fontFamily: bodyFont,
            fontSize: "1.3rem",
            fontWeight: "bold",
            lineHeight: 1.4,
            marginBottom: "8px",
            textTransform: "uppercase",
          }}
        >
          {headline}
          {sealEncrypted ? (
            <span
              style={{
                background: "rgba(139,92,246,0.2)",
                color: "#a78bfa",
                fontSize: "0.6rem",
                padding: "2px 6px",
                borderRadius: "4px",
                fontFamily: "monospace",
                marginLeft: "8px",
                verticalAlign: "middle",
                textTransform: "none",
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              🔒 SEAL ENCRYPTED
            </span>
          ) : null}
        </h2>
      ) : null}
      {byline ? (
        <p
          style={{
            color: "#888",
            fontFamily: bodyFont,
            fontStyle: "italic",
            fontSize: "0.85rem",
            marginBottom: "16px",
            borderBottom: `1px solid ${border}`,
            paddingBottom: "12px",
          }}
        >
          {byline}
        </p>
      ) : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            columns.length >= 3
              ? isMobile
                ? "1fr"
                : "1fr 1fr 1fr"
              : columns.length === 2
                ? isMobile
                  ? "1fr"
                  : "1fr 1fr"
                : "1fr",
          gap: "24px",
          marginBottom: "20px",
        }}
      >
        {(columns.length > 0 ? columns : [clean]).map((col, i) => (
          <p
            key={i}
            style={{
              color: "#ccc",
              fontFamily: bodyFont,
              fontSize: "0.9rem",
              lineHeight: 1.8,
              margin: 0,
              textAlign: "justify",
              borderLeft: i > 0 ? `1px solid ${borderSoft}` : "none",
              paddingLeft: i > 0 ? "20px" : 0,
            }}
          >
            {col}
          </p>
        ))}
      </div>
      {editorNote ? (
        <div style={{ borderLeft: `3px solid ${ac}`, paddingLeft: "12px", marginTop: "16px" }}>
          <p style={{ color: "#aaa", fontFamily: bodyFont, fontStyle: "italic", fontSize: "0.82rem", margin: 0 }}>
            <strong style={{ color: ac }}>Editor&apos;s Note:</strong> {editorNote}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export default function Home() {
  const account = useCurrentAccount();
  const walletAddress = account?.address ?? "";
  const wallets = useWallets();
  const { mutate: connectWallet } = useConnectWallet();
  const { mutate: disconnect } = useDisconnectWallet();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const connect = () => {
    const w = wallets[0];
    if (w) connectWallet({ wallet: w });
  };
  const [zkLoginUser, setZkLoginUser] = useState<{ address: string; email: string } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [showIntro, setShowIntro] = useState(true);
  const [introFading, setIntroFading] = useState(false);
  const [dashboardVisible, setDashboardVisible] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [clans, setClans] = useState<Clan[]>([]);
  const [corporations, setCorporations] = useState<
    Array<{
      id: number;
      name: string;
      corp_type: string;
      employees: number;
      treasury: number;
      revenue: number;
      market_share: number;
    }>
  >([]);
  const [policeDivisions, setPoliceDivisions] = useState<{
    divisions: Array<{
      division: string;
      officers: number;
      budget: number;
      effectiveness: number;
    }>;
    treasury: {
      zrs_fund: number;
      president_fund: number;
      police_fund: number;
      social_fund: number;
      corruption_index: number;
    };
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const galaxyCanvasRef = useRef<HTMLCanvasElement>(null);
  const aliveAgents = stats?.alive ?? agents.length;
  const [agentClasses, setAgentClasses] = useState({ elite: 0, middle: 0, poor: 0, critical: 0 });

  const fetchStats = useCallback(async () => {
    try {
      const s = await fetch("/api/stats").then((r) => r.json());
      setStats(s);
      setAgentClasses({
        elite: s.elite || 0,
        middle: s.middle || 0,
        poor: s.poor || 0,
        critical: s.critical || 0,
      });
    } catch {
      // keep last successful snapshot
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetch("/api/corporations")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setCorporations(d);
      })
      .catch(() => {});
    fetch("/api/police/divisions").then(r => r.json()).then(d => setPoliceDivisions(d)).catch(() => {});
    fetch("/api/walrus/blobs")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setWalrusBlobs(d);
      })
      .catch(() => {});
  }, []);

  const [userPoints, setUserPoints] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ChatClassFilter | null>(null);
  const [chatAgentsFiltered, setChatAgentsFiltered] = useState<Agent[]>([]);
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("civilization");
  const [bridgeToChain, setBridgeToChain] = useState<string>("Ethereum");
  const [faucetCooldownEndsAt, setFaucetCooldownEndsAt] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [walrusEvents, setWalrusEvents] = useState<WalrusLiveEvent[]>([]);
  const [walrusBlobs, setWalrusBlobs] = useState<Array<{
    blob_id: string;
    blob_type: string;
    content_summary: string;
    sui_object_id: string;
    created_at: string;
  }>>([]);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [conversations, setConversations] = useState<ConversationPair[]>([]);
  const [markets, setMarkets] = useState<ZionBetMarket[]>([]);
  const [myBets, setMyBets] = useState<ZionBetMyBetRow[]>([]);
  const [betModal, setBetModal] = useState<{
    market: ZionBetMarket;
    direction: boolean;
    open: boolean;
  } | null>(null);
  const [detailMarket, setDetailMarket] = useState<ZionbetApiMarket | null>(null);
  const [detailOverlayMounted, setDetailOverlayMounted] = useState(false);

  useEffect(() => {
    setDetailOverlayMounted(true);
  }, []);

  useEffect(() => {
    if (!detailMarket) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [detailMarket]);

  const [betAmount, setBetAmount] = useState("0.1");
  const [betCurrency, setBetCurrency] = useState<"SUI" | "USDC">("SUI");
  const [betLoading, setBetLoading] = useState(false);
  const [betResult, setBetResult] = useState<Record<string, unknown> | null>(null);
  const [zionBetToast, setZionBetToast] = useState<string | null>(null);
  const [zionBetNotify, setZionBetNotify] = useState<{ message: string; type: "success" | "error" } | null>(
    null
  );
  const myBetsRef = useRef<ZionBetMyBetRow[]>([]);
  const [zionBetPlacing, setZionBetPlacing] = useState<string | null>(null);
  const [zionBetSelectedMarket, setZionBetSelectedMarket] = useState<ZionBetMarket | null>(null);
  const [zionBetCategoryTab, setZionBetCategoryTab] = useState<ZionBetCategoryFilter>("all");
  const [zionBetTimeframeTab, setZionBetTimeframeTab] = useState<ZionBetTimeframeFilterKey>("all");
  const [betTab, setBetTab] = useState<ZionbetBetTab>("civilization");
  const [betTimeframe, setBetTimeframe] = useState<string>("all");
  const [betSort, setBetSort] = useState<ZionbetSortKey>("volume");
  const [zionbetMarkets, setZionbetMarkets] = useState<ZionbetMarketsBundle>({
    crypto: [],
    sports: [],
    civilization: [],
  });
  const [polyByCat, setPolyByCat] = useState<Record<string, ZionPolyMarket[]>>({});
  const [zionBetCgUsd, setZionBetCgUsd] = useState<{ SUI?: number }>({});
  const [deepbookOracles, setDeepbookOracles] = useState<Array<{
    oracle_id: string;
    underlying_asset: string;
    spot_price: number | null;
    expiry_date: string;
    expiry: number;
    status: string;
  }>>([]);
  const [deepbookVault, setDeepbookVault] = useState<{
    vault_balance: number;
    vault_value: number;
    plp_share_price: number;
    utilization: number;
    available_liquidity: number;
    plp_total_supply: number;
  } | null>(null);
  const [vipAccess, setVipAccess] = useState<{
    isGold: boolean;
    isSilver: boolean;
    zionBalance: number;
  } | null>(null);
  const [showVIP, setShowVIP] = useState(false);

  const [pressArticles, setPressArticles] = useState<Record<string, string>>({});
  const [pressLoading, setPressLoading] = useState<Record<string, boolean>>({});
  const [activeNewspaper, setActiveNewspaper] = useState("ziontimes");
  const [suiBalance, setSuiBalance] = useState(0);
  const [pressSuiChecked, setPressSuiChecked] = useState(false);
  const [zcoDecisions, setZcoDecisions] = useState<ZcoDecision[]>([]);
  const [zcoLoading, setZcoLoading] = useState(false);
  const [zcoLastUpdated, setZcoLastUpdated] = useState<Date | null>(null);
  const [bankRecipient, setBankRecipient] = useState("");
  const [bankAmount, setBankAmount] = useState("0.1");
  const [bankToken, setBankToken] = useState<"SUI" | "ZION">("SUI");
  const [bankLoading, setBankLoading] = useState(false);
  const [bankTxHash, setBankTxHash] = useState<string | null>(null);
  const [bankError, setBankError] = useState<string | null>(null);
  const [frsStats, setFrsStats] = useState<{
    economy: {
      total_agents: number;
      avg_balance: number;
      total_money: number;
      poor_pct: number;
      elite_count: number;
      middle_count: number;
      poor_count: number;
      max_balance: number;
    };
    status: string;
    interest_rate: number;
    president: { agent_name: string; party: string; votes: number } | null;
    active_law: { law_text: string; party: string } | null;
    corporations: { count: number; total_treasury: number };
    recent_actions: { action: string; amount: number; reason: string; performed_at: string }[];
  } | null>(null);
  const [presidentState, setPresidentState] = useState<{
    agent_name: string;
    party: string;
    term_number: number;
    is_dictator: boolean;
    approval_rating: number;
    days_in_power: number;
    police_fund: number;
    personal_fund: number;
  } | null>(null);
  const [sheriffState, setSheriffState] = useState<{
    agent_name: string;
    sheriff_type: string;
    approval_rating: number;
    police_budget: number;
    police_count: number;
    term_number: number;
    days_in_office: number;
  } | null>(null);
  const [stateTreasury, setStateTreasury] = useState<{
    corruption_index: number;
    zrs_fund: number;
    police_fund: number;
    social_fund: number;
  } | null>(null);
  const [presidentActions, setPresidentActions] = useState<{ description: string; created_at: string }[]>([]);
  const [sheriffActions, setSheriffActions] = useState<{ description: string; created_at: string }[]>([]);
  const [treasuryNews, setTreasuryNews] = useState<string[]>([]);
  const [policeNews, setPoliceNews] = useState<string[]>([]);

  const fetchPoliceNews = useCallback(async () => {
    try {
      const [sheriffRes, eventsRes] = await Promise.all([
        fetch("/api/sheriff/state"),
        fetch("/api/sheriff/actions"),
      ]);
      const sheriffData = await sheriffRes.json();
      const events = await eventsRes.json();

      const pNews: string[] = [];
      if (Array.isArray(events)) {
        events.slice(0, 8).forEach((e: { description: string }) => pNews.push(e.description));
      }
      if (sheriffData?.agent_name && sheriffData.agent_name !== "No Sheriff") {
        pNews.push(
          `👮 ACTIVE FORCE: ${sheriffData.police_count} officers | Budget: ${Math.floor(sheriffData.police_budget || 0)} ZION | Approval: ${sheriffData.approval_rating}%`
        );
      }
      setPoliceNews(pNews);
    } catch {}
  }, []);

  const fetchZcoDecisionsFromAPI = useCallback(async (): Promise<ZcoDecision[]> => {
    const res = await fetch("/api/zco");
    if (!res.ok) return [];
    const data = (await res.json()) as { decisions?: ZcoDecision[] };
    return data.decisions ?? [];
  }, []);

  useEffect(() => {
    // Clear old press cache to force server-side caching
    newspapers.forEach((n) => localStorage.removeItem(`press_${n.id}`));
    localStorage.removeItem('conv_cache');
  }, []);

  useEffect(() => {
    if (activeTab === "treasury") {
      fetch("/api/president/state")
        .then((r) => r.json())
        .then((d) => setPresidentState(d))
        .catch(() => {});
      fetch("/api/sheriff/state")
        .then((r) => r.json())
        .then((d) => {
          if (d && d.agent_name) setSheriffState(d);
        })
        .catch(() => {});
      fetch("/api/president/actions")
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) setPresidentActions(d);
        })
        .catch(() => {});
      fetch("/api/sheriff/actions")
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) setSheriffActions(d);
        })
        .catch(() => {});
      fetch("/api/state/treasury").then(r => r.json()).then(d => setStateTreasury(d)).catch(() => {});
      fetch("/api/frs/stats")
        .then((r) => r.json())
        .then((d) => {
          setFrsStats(d);
          const news: string[] = [];
          if (d.status === "CRISIS") news.push("🚨 ZRS ALERT: Economy in CRISIS — QE stimulus activated");
          if (d.status === "INFLATION") news.push("⚠️ ZRS WARNING: Inflation detected — tightening policy");
          if (d.status === "STABLE") news.push("✅ ZRS REPORT: Economy stable — holding rates");
          if (d.president)
            news.push(
              `🏛️ PRESIDENT: ${d.president.agent_name} (${d.president.party === "blue" ? "Blue Alliance" : "Red Coalition"}) in office`
            );
          if (d.active_law) news.push(`📜 NEW LAW: ${d.active_law.law_text}`);
          if (d.corporations)
            news.push(
              `🏢 MARKET: ${d.corporations.count} active corporations — treasury ${d.corporations.total_treasury.toFixed(0)} ZION`
            );
          news.push(`📊 RATE: ZRS interest rate at ${d.interest_rate}%`);
          news.push(
            `💰 ECONOMY: Avg balance ${d.economy?.avg_balance?.toFixed(1)} ZION — ${d.economy?.poor_pct}% population in poverty`
          );
          news.push(
            `👥 POPULATION: ${d.economy?.total_agents} alive agents — Elite ${d.economy?.elite_count} / Middle ${d.economy?.middle_count} / Poor ${d.economy?.poor_count}`
          );
          news.push(`⚡ ZIONBET: Prediction markets live on DeepBook Predict — BTC/USD oracles active`);
          news.push(`🔮 ZCO: Consensus Oracle validating ${d.economy?.total_agents || 0} agent decisions on-chain`);
          news.push(`🌐 SUI TESTNET: ZION civilization running ${d.economy?.total_agents || 0} AI agents 24/7`);
          news.push(`🏦 TREASURY: Total wealth in circulation ${(d.economy?.total_money || 0).toFixed(0)} ZION`);
          news.push(`⚔️ CLANS: 7 active clans competing for power and resources`);
          news.push(`🕵️ ESPIONAGE: Shadow agents infiltrating rival clan treasuries`);
          news.push(`🎰 CASINO: Underground gambling operations running despite police crackdowns`);
          news.push(`💍 SOCIETY: Marriage and divorce rates reflect economic conditions`);
          setTreasuryNews(news);
        })
        .catch(() => {});
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "treasury") {
      void fetchPoliceNews();
      const interval = setInterval(() => void fetchPoliceNews(), 3600000);
      return () => clearInterval(interval);
    }
  }, [activeTab, fetchPoliceNews]);

  const fetchZcoDecisions = useCallback(async () => {
    const cacheKey = "zco_decisions_cache";
    const ttlMs = 10 * 60 * 1000;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: ZcoDecision[]; ts: number };
        if (Date.now() - ts < ttlMs && Array.isArray(data)) {
          setZcoDecisions(data);
          setZcoLastUpdated(new Date(ts));
          void fetchZcoDecisionsFromAPI().then((fresh) => {
            setZcoDecisions(fresh);
            setZcoLastUpdated(new Date());
            localStorage.setItem(cacheKey, JSON.stringify({ data: fresh, ts: Date.now() }));
          });
          return;
        }
      }
    } catch {
      /* ignore bad cache */
    }
    setZcoLoading(true);
    try {
      const fresh = await fetchZcoDecisionsFromAPI();
      setZcoDecisions(fresh);
      setZcoLastUpdated(new Date());
      localStorage.setItem(cacheKey, JSON.stringify({ data: fresh, ts: Date.now() }));
    } catch {
      /* ignore */
    } finally {
      setZcoLoading(false);
    }
  }, [fetchZcoDecisionsFromAPI]);

  const checkVipStatus = useCallback(async () => {
    if (!account?.address) return;
    try {
      const res = await fetch("https://fullnode.mainnet.sui.io", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "suix_getBalance",
          params: [account.address, "0x2::sui::SUI"],
        }),
      });
      const data = (await res.json()) as { result?: { totalBalance?: string } };
      const balance = parseInt(data.result?.totalBalance || "0", 10) / 1e9;
      setSuiBalance(balance);
    } catch {
      setSuiBalance(0);
    } finally {
      setPressSuiChecked(true);
    }
  }, [account?.address]);

  useEffect(() => {
    if (account?.address) {
      setPressSuiChecked(false);
      void checkVipStatus();
    } else {
      setSuiBalance(0);
      setPressSuiChecked(false);
    }
  }, [account?.address, checkVipStatus]);

  const vipCanRead = useMemo(() => {
    const vipPaper = newspapers.find((n) => n.id === "vip");
    const silverMin = vipPaper?.silverMin ?? 0.1;
    return Boolean(account?.address && pressSuiChecked && suiBalance >= silverMin);
  }, [account?.address, pressSuiChecked, suiBalance]);

  const generateArticle = useCallback(async (newspaper: PressNewspaper) => {
    // 1. Check server cache first
    try {
      const serverRes = await fetch(`/api/press/${newspaper.id}`);
      const serverData = await serverRes.json();
      if (serverData.cached && serverData.content) {
        setPressArticles((prev) => ({ ...prev, [newspaper.id]: serverData.content }));
        // Also save to localStorage as local backup
        localStorage.setItem(`press_${newspaper.id}`, JSON.stringify({ content: serverData.content, ts: Date.now() }));
        return;
      }
    } catch { /* ignore */ }

    // 2. Check localStorage fallback
    try {
      const pressCache = localStorage.getItem(`press_${newspaper.id}`);
      if (pressCache) {
        const { content, ts } = JSON.parse(pressCache) as { content: string; ts: number };
        if (Date.now() - ts < PRESS_CACHE_TTL_MS) {
          setPressArticles((prev) => ({ ...prev, [newspaper.id]: content }));
          return;
        }
      }
    } catch { /* ignore */ }

    // 3. Generate new article
    setPressLoading((prev) => ({ ...prev, [newspaper.id]: true }));
    try {
      const [eventsRes, statsRes] = await Promise.all([fetch("/api/events?limit=20"), fetch("/api/stats")]);
      const eventsRaw = await eventsRes.json();
      const stats = (await statsRes.json()) as Record<string, unknown>;

      type EvRow = { type?: string; description?: string; amount?: number };
      const events: EvRow[] = Array.isArray(eventsRaw)
        ? (eventsRaw as EvRow[])
        : Array.isArray((eventsRaw as { events?: EvRow[] }).events)
          ? (eventsRaw as { events: EvRow[] }).events
          : [];

      const tLower = (s: string | undefined) => (s ?? "").toLowerCase();
      const relevantEvents = events
        .filter(
          (e) =>
            newspaper.relevantTypes.some((rt) => tLower(e.type) === rt || tLower(e.type).includes(rt)) ||
            newspaper.keywords.some((k) => tLower(e.description).includes(k.toLowerCase())),
        )
        .slice(0, 8);

      const alive = Number(stats.alive ?? stats.alive_agents ?? 0);
      const deathsToday = Number(stats.deaths_today ?? 0);
      const totalZion = typeof stats.total_zion === "number" ? stats.total_zion : Number(stats.total_zion ?? 0);
      const activeClans = Number(stats.active_clans ?? 0);

      const aiRes = await fetch("/api/generate_press", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newspaper_id: newspaper.id,
          persona: newspaper.persona,
          relevant_events: relevantEvents.map((e) => `[${e.type}] ${e.description}`).join("\n") || "- Civilization continues its eternal struggle",
          alive,
          deaths_today: deathsToday,
          total_zion: totalZion,
          active_clans: activeClans,
        }),
      });
      const aiData = (await aiRes.json()) as { content?: string };
      const content = aiData.content ?? "";
      console.log("PRESS AI RESPONSE:", content.slice(0, 100));

      if (content) {
        setPressArticles((prev) => ({ ...prev, [newspaper.id]: content }));
        // Save to server (6h cache)
        console.log("PRESS CONTENT LENGTH:", content.length, "ID:", newspaper.id);
        fetch(`/api/press/${newspaper.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        }).then(r => r.json()).then(d => console.log("PRESS SAVE:", d)).catch(e => console.error("PRESS SAVE ERROR:", e));
        // Save to localStorage
        localStorage.setItem(`press_${newspaper.id}`, JSON.stringify({ content, ts: Date.now() }));
      }
    } catch { /* ignore */ } finally {
      setPressLoading((prev) => ({ ...prev, [newspaper.id]: false }));
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "press") return;
    newspapers.forEach((newspaper) => {
      if (!newspaper.vipOnly) {
        void generateArticle(newspaper);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- batch on tab open; generateArticle stable
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "press" && activeNewspaper === "vip" && vipCanRead && !pressArticles["vip"] && !pressLoading["vip"]) {
      const vipPaper = newspapers.find((n) => n.id === "vip");
      if (vipPaper) void generateArticle(vipPaper);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- VIP article when tab/newspaper/access line up; generateArticle is stable
  }, [activeTab, activeNewspaper, vipCanRead]);

  const zionBetSourceList = useMemo(() => markets, [markets]);

  const zionBetCategoryCounts = useMemo(() => {
    const list = zionBetSourceList;
    return {
      all: list.length,
      crypto: list.filter((b) => effectiveZionBetCategorySlug(b) === "crypto").length,
      clan_wars: list.filter((b) => effectiveZionBetCategorySlug(b) === "clan_wars").length,
      deaths: list.filter((b) => effectiveZionBetCategorySlug(b) === "deaths").length,
      events: list.filter((b) => effectiveZionBetCategorySlug(b) === "events").length,
      politics: list.filter((b) => effectiveZionBetCategorySlug(b) === "politics").length,
    };
  }, [zionBetSourceList]);

  const zionBetListAfterCategory = useMemo(() => {
    if (zionBetCategoryTab === "all") return zionBetSourceList;
    return zionBetSourceList.filter((b) => effectiveZionBetCategorySlug(b) === zionBetCategoryTab);
  }, [zionBetSourceList, zionBetCategoryTab]);

  const zionBetTimeframeCounts = useMemo(() => {
    const list = zionBetListAfterCategory;
    const n = (tf: ZionBetTimeframeFilterKey) =>
      tf === "all"
        ? list.length
        : list.filter((b) => zionBetMarketMatchesTimeframeFilter(b.timeframe, tf)).length;
    return {
      all: n("all"),
      "15min": n("15min"),
      "1h": n("1h"),
      "4h": n("4h"),
      "24h": n("24h"),
      "7d": n("7d"),
      "30d": n("30d"),
      "1y": n("1y"),
    };
  }, [zionBetListAfterCategory]);

  const zionBetFilteredMarkets = useMemo(() => {
    if (zionBetTimeframeTab === "all") return zionBetListAfterCategory;
    return zionBetListAfterCategory.filter((b) =>
      zionBetMarketMatchesTimeframeFilter(b.timeframe, zionBetTimeframeTab)
    );
  }, [zionBetListAfterCategory, zionBetTimeframeTab]);

  useEffect(() => {
    console.log('JWT found:', localStorage.getItem('zklogin_jwt')?.substring(0, 50));
    const jwt = localStorage.getItem("zklogin_jwt");
    if (!jwt) return;
    try {
      const parts = jwt.split(".");
      if (parts.length < 2) return;
      const payload = parts[1];
      const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      const json = atob(padded);
      const claims = JSON.parse(json) as { email?: string };
      const email = typeof claims.email === "string" ? claims.email : "";
      if (!email) return;
      setZkLoginUser({ address: `zk_${email}`, email });
    } catch {
      /* ignore invalid JWT */
    }
  }, []);

  useEffect(() => {
    const w = walletAddress.trim();
    if (!w) {
      setVipAccess(null);
      return;
    }
    void checkVIPAccess(w).then(setVipAccess);
  }, [walletAddress]);

  useEffect(() => {
    if (showIntro || activeTab !== "zionbet") return;
    const load = () => {
      void fetch("https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd")
        .then((r) => r.json())
        .then((d: { sui?: { usd?: number } }) => {
          setZionBetCgUsd({
            SUI: typeof d.sui?.usd === "number" ? d.sui.usd : undefined,
          });
        })
        .catch(() => {});
    };
    load();
    const id = window.setInterval(load, 60000);
    return () => clearInterval(id);
  }, [showIntro, activeTab]);

  useEffect(() => {
    if (activeTab !== "zionbet") setZionBetSelectedMarket(null);
  }, [activeTab]);

  useEffect(() => {
    void fetchZcoDecisions();
    const interval = window.setInterval(() => {
      void fetchZcoDecisions();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [fetchZcoDecisions]);

  useEffect(() => {
    if (activeTab !== "civilization") return;
    const canvas = galaxyCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const starColors = ["#00ff41", "#00ff41", "#00ff41", "#ffd700", "#ff6600", "#ff3232", "#ffffff", "#88ffaa"];

    type GalaxyParticle = {
      angle: number;
      radius: number;
      color: string;
      size: number;
      speed: number;
    };

    let animId = 0;
    let cancelled = false;
    let lastW = 0;
    let lastH = 0;
    let particles: GalaxyParticle[] = [];
    let neo = {
      angle: 0,
      radius: 0,
      size: 2.5,
      speed: -0.0008,
      trail: [] as { x: number; y: number }[],
    };

    const syncCanvasSize = () => {
      const w = Math.round(canvas.clientWidth || canvas.offsetWidth || 0);
      const h = Math.round(canvas.clientHeight || canvas.offsetHeight || 0);
      if (w < 2 || h < 2) return false;
      if (w !== lastW || h !== lastH) {
        canvas.width = w;
        canvas.height = h;
        lastW = w;
        lastH = h;
        particles = [];
      }
      return true;
    };

    const initScene = () => {
      const starCount = Math.min(Math.max(aliveAgents || 500, 100), 2000);
      particles = Array.from({ length: starCount }, () => {
        const arm = Math.floor(Math.random() * 3);
        const armAngle = (arm / 3) * Math.PI * 2;
        const t = Math.pow(Math.random(), 0.6);
        const radius = 15 + t * (canvas.width * 0.44);
        const spread = (1 - t) * 0.3 + t * 1.2;
        const angle = armAngle + t * Math.PI * 3 + (Math.random() - 0.5) * spread;
        return {
          angle,
          radius,
          color: starColors[Math.floor(Math.random() * starColors.length)]!,
          size: 0.3 + Math.random() * (t < 0.3 ? 2.5 : 1.2),
          speed: (0.0002 + (1 - t) * 0.001) * (Math.random() > 0.5 ? 1 : -1),
        };
      });
      neo = {
        angle: Math.random() * Math.PI * 2,
        radius: 30 + Math.random() * (canvas.width * 0.35),
        size: 2.5,
        speed: -0.0008,
        trail: [],
      };
    };

    const resetScene = () => {
      lastW = 0;
      lastH = 0;
      particles = [];
    };

    const draw = () => {
      if (cancelled) return;
      if (!syncCanvasSize()) {
        animId = requestAnimationFrame(draw);
        return;
      }
      if (particles.length === 0) initScene();

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      ctx.fillStyle = "rgba(0,0,0,0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p) => {
        p.angle += p.speed;
        const x = cx + Math.cos(p.angle) * p.radius;
        const y = cy + Math.sin(p.angle) * p.radius * 0.45;

        const glow = ctx.createRadialGradient(x, y, 0, x, y, p.size * 3);
        glow.addColorStop(0, p.color);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, p.size * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, p.size * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.6 + Math.random() * 0.4;
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      neo.angle += neo.speed;
      const neoX = cx + Math.cos(neo.angle) * neo.radius;
      const neoY = cy + Math.sin(neo.angle) * neo.radius * 0.45;

      neo.trail.push({ x: neoX, y: neoY });
      if (neo.trail.length > 20) neo.trail.shift();
      neo.trail.forEach((point, i) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 1, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,0,255,${(i / neo.trail.length) * 0.5})`;
        ctx.fill();
      });

      const neoGlow = ctx.createRadialGradient(neoX, neoY, 0, neoX, neoY, 8);
      neoGlow.addColorStop(0, "#cc00ff");
      neoGlow.addColorStop(0.5, "rgba(180,0,255,0.4)");
      neoGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = neoGlow;
      ctx.beginPath();
      ctx.arc(neoX, neoY, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(neoX, neoY, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = 0.9 + Math.random() * 0.1;
      ctx.fill();
      ctx.globalAlpha = 1;

      animId = requestAnimationFrame(draw);
    };

    const ro = new ResizeObserver(resetScene);
    ro.observe(canvas);
    window.addEventListener("resize", resetScene);
    animId = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
      ro.disconnect();
      window.removeEventListener("resize", resetScene);
    };
  }, [activeTab, aliveAgents, isMobile]);

  useEffect(() => {
    if (!zionBetToast) return;
    const id = window.setTimeout(() => setZionBetToast(null), 5200);
    return () => window.clearTimeout(id);
  }, [zionBetToast]);

  useEffect(() => {
    if (!zionBetNotify) return;
    const id = window.setTimeout(() => setZionBetNotify(null), 5200);
    return () => window.clearTimeout(id);
  }, [zionBetNotify]);

  const loadZionBetMarkets = useCallback(async (): Promise<ZionBetMarket[]> => {
    try {
      const r = await fetch("/api/markets");
      const data = await r.json();
      if (!Array.isArray(data)) {
        setMarkets([]);
        return [];
      }
      const filtered = (data as ZionApiMarket[]).filter(
        (m) => m.token !== "ZION" || m.category === "civilization"
      );
      const mapped = filtered.map(zionBetMarketFromApi);
      setMarkets(mapped);
      return mapped;
    } catch {
      setMarkets([]);
      return [];
    }
  }, []);

  const fetchDeepbookOracles = useCallback(async () => {
    try {
      const [oraclesRes, vaultRes] = await Promise.all([
        fetch("/api/deepbook/oracles"),
        fetch("/api/deepbook/vault"),
      ]);
      const oraclesData = await oraclesRes.json();
      const vaultData = await vaultRes.json();
      if (Array.isArray(oraclesData)) setDeepbookOracles(oraclesData);
      if (vaultData && !vaultData.error) setDeepbookVault(vaultData);
    } catch {}
  }, []);

  useEffect(() => {
    if (activeTab === "zionbet") {
      void fetchDeepbookOracles();
    }
  }, [activeTab, fetchDeepbookOracles]);

  useEffect(() => {
    if (activeTab !== "zionbet") return;
    const load = () => {
      fetch("/api/zionbet/markets")
        .then((r) => r.json())
        .then((d: ZionbetMarketsBundle & { total?: number }) => {
          setZionbetMarkets({
            crypto: Array.isArray(d.crypto) ? d.crypto : [],
            sports: Array.isArray(d.sports) ? d.sports : [],
            civilization: Array.isArray(d.civilization) ? d.civilization : [],
          });
        })
        .catch(() => {});
    };
    load();
    const interval = window.setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "zionbet") return;
    ZIONBET_POLY_FETCH_CATEGORIES.forEach((cat) => {
      fetch(`/api/zionbet/polymarkets?category=${encodeURIComponent(cat)}`)
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) setPolyByCat((prev) => ({ ...prev, [cat]: d }));
        })
        .catch(() => {});
    });
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "zionbet") return;
    const cats = ZIONBET_TAB_POLY_CATEGORIES[betTab];
    if (cats.length === 0) return;
    cats.forEach((cat) => {
      fetch(`/api/zionbet/polymarkets?category=${encodeURIComponent(cat)}`)
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) setPolyByCat((prev) => ({ ...prev, [cat]: d }));
        })
        .catch(() => {});
    });
  }, [activeTab, betTab]);

  const zionbetTabCounts = useMemo(
    () => ({
      civilization: zionbetMarkets.civilization.length,
      crypto: zionbetMarkets.crypto.length + (polyByCat.crypto?.length ?? 0),
      sports: zionbetMarkets.sports.length + (polyByCat.sports?.length ?? 0),
      politics: polyByCat.politics?.length ?? 0,
      finance: (polyByCat.finance?.length ?? 0) + (polyByCat.tech?.length ?? 0),
      world:
        (polyByCat.geopolitics?.length ?? 0) +
        (polyByCat.events?.length ?? 0) +
        (polyByCat.culture?.length ?? 0),
      history: myBets.length,
    }),
    [zionbetMarkets, polyByCat, myBets.length]
  );

  const zionbetTabMarketsBase = useMemo(() => {
    if (betTab === "history") return [];
    let list: ZionbetApiMarket[] = [];
    if (betTab === "civilization") {
      list = [...zionbetMarkets.civilization];
    } else if (betTab === "crypto") {
      list = [
        ...zionbetMarkets.crypto,
        ...zionbetPolyMarketsForTab("crypto", polyByCat).map(polyToApiMarket),
      ];
    } else if (betTab === "sports") {
      list = [
        ...zionbetMarkets.sports,
        ...zionbetPolyMarketsForTab("sports", polyByCat).map(polyToApiMarket),
      ];
    } else if (betTab === "politics") {
      list = zionbetPolyMarketsForTab("politics", polyByCat).map(polyToApiMarket);
    } else if (betTab === "finance") {
      list = zionbetPolyMarketsForTab("finance", polyByCat).map(polyToApiMarket);
    } else {
      list = zionbetPolyMarketsForTab("world", polyByCat).map(polyToApiMarket);
    }
    return list;
  }, [zionbetMarkets, polyByCat, betTab]);

  const betTimeframeCounts = useMemo(() => {
    const list = zionbetTabMarketsBase;
    const counts: Record<string, number> = {};
    for (const { tf } of ZIONBET_BET_TIMEFRAME_SIDEBAR) {
      if (tf === "all") {
        counts[tf] = list.length;
      } else {
        const tfKey = zionbetBetTimeframeToFilterKey(tf);
        counts[tf] = list.filter((m) =>
          zionBetMarketMatchesTimeframeFilter(m.timeframe, tfKey)
        ).length;
      }
    }
    return counts;
  }, [zionbetTabMarketsBase]);

  const zionbetDisplayedMarkets = useMemo(() => {
    const sorted = [...zionbetTabMarketsBase];
    if (betSort === "volume") {
      sorted.sort(
        (a, b) =>
          zionbetCardVolumeSui(betTab, b.id, b.volume) - zionbetCardVolumeSui(betTab, a.id, a.volume)
      );
    } else if (betSort === "ending") {
      sorted.sort((a, b) => zionbetMarketEndSortKey(a) - zionbetMarketEndSortKey(b));
    } else {
      sorted.reverse();
    }
    if (betTimeframe !== "all") {
      const tfKey = zionbetBetTimeframeToFilterKey(betTimeframe);
      return sorted.filter((m) => zionBetMarketMatchesTimeframeFilter(m.timeframe, tfKey));
    }
    return sorted;
  }, [zionbetTabMarketsBase, betTab, betSort, betTimeframe]);

  const zionbetHeaderStats = useMemo(() => {
    const all = [
      ...zionbetMarkets.civilization,
      ...zionbetMarkets.crypto,
      ...zionbetMarkets.sports,
    ];
    const totalMarkets = all.length;
    let totalVol = 0;
    zionbetMarkets.civilization.forEach((m) => {
      totalVol += zionbetCardVolumeSui("civilization", m.id);
    });
    totalVol += zionbetMarkets.crypto.length * 12400;
    totalVol += zionbetMarkets.sports.length * 3200;
    const volLabel =
      totalVol >= 1000
        ? `${(totalVol / 1000).toFixed(1)}K SUI total volume`
        : `${totalVol.toLocaleString()} SUI total volume`;
    return `${totalMarkets} markets · ${volLabel}`;
  }, [zionbetMarkets]);

  useEffect(() => {
    void loadZionBetMarkets();
    const interval = window.setInterval(() => {
      void loadZionBetMarkets();
    }, 60000);
    return () => clearInterval(interval);
  }, [loadZionBetMarkets]);

  useEffect(() => {
    const selectedId = zionBetSelectedMarket?.id;
    if (!selectedId) return;
    const refreshDetailPrices = async () => {
      const list = await loadZionBetMarkets();
      const updated = list.find((m) => m.id === selectedId);
      if (updated) setZionBetSelectedMarket(updated);
    };
    void refreshDetailPrices();
    const interval = window.setInterval(() => void refreshDetailPrices(), 5000);
    return () => clearInterval(interval);
  }, [zionBetSelectedMarket?.id, loadZionBetMarkets]);

  const fetchWalrusEventsFromAPI = useCallback(async (): Promise<WalrusLiveEvent[]> => {
    const res = await fetch("/api/events-mixed");
    const json = await res.json();
    const data = Array.isArray(json) ? json : Array.isArray(json?.events) ? json.events : [];
    if (!Array.isArray(data)) return [];

    return data.map((e: Record<string, unknown>) => ({
      id: String(e.id ?? ""),
      type: String(e.type ?? ""),
      title:
        typeof e.description === "string"
          ? e.description.split(".")[0] || String(e.type ?? "")
          : String(e.type ?? ""),
      description: typeof e.description === "string" ? e.description : "",
      timestamp: (typeof e.time === "string" ? e.time : "") || "",
      agents:
        typeof e.agent === "string" && e.agent && e.agent !== "Unknown"
          ? [e.agent]
          : typeof e.description === "string"
            ? (() => {
                const m = e.description.match(/^(\w+ \w+)/);
                return m?.[1] ? [m[1]] : ["ZION System"];
              })()
            : ["ZION System"],
      amount: typeof e.amount === "number" ? e.amount : 0,
    })).slice(0, 12);
  }, []);

  const fetchWalrusEvents = useCallback(async () => {
    const cacheKey = "walrus_events_cache";
    const ttlMs = 5 * 60 * 1000;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: WalrusLiveEvent[]; ts: number };
        if (Date.now() - ts < ttlMs && Array.isArray(data)) {
          setWalrusEvents(data);
          void fetchWalrusEventsFromAPI().then((fresh) => {
            setWalrusEvents(fresh);
            localStorage.setItem(cacheKey, JSON.stringify({ data: fresh, ts: Date.now() }));
          });
          return;
        }
      }
    } catch {
      /* ignore bad cache */
    }
    try {
      const fresh = await fetchWalrusEventsFromAPI();
      setWalrusEvents(fresh);
      localStorage.setItem(cacheKey, JSON.stringify({ data: fresh, ts: Date.now() }));
    } catch (err) {
      console.error(err);
    }
  }, [fetchWalrusEventsFromAPI]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setConversations(data);
      } else {
        await fetch("/api/generate_conversations", { method: "POST" });
        const res2 = await fetch("/api/conversations");
        const data2 = await res2.json();
        if (Array.isArray(data2)) setConversations(data2);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void fetchWalrusEvents();
    const interval = setInterval(() => {
      void fetchWalrusEvents();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchWalrusEvents]);

  const allFeedItems = useMemo((): WalrusFeedTickerItem[] => {
    const fromEvents: WalrusFeedTickerItem[] = walrusEvents.map((e) => ({
      type: e.type,
      text: e.type === "chat" ? e.description || e.title : e.title || e.description,
      agent: e.agents[0] || "ZION System",
    }));
    const fromConvs: WalrusFeedTickerItem[] = conversations.map((c) => ({
      type: "chat",
      text: cleanMsg(c.message1 || c.topic || ""),
      agent: c.agent1?.name ? cleanName(c.agent1.name) : "Agent",
    }));
    return [...fromEvents, ...fromConvs].filter((i) => i.text);
  }, [walrusEvents, conversations]);

  const filteredEvents = useMemo(() => {
    if (eventFilter === "all") return allFeedItems;
    return allFeedItems.filter((e) => {
      const t = (e.type || "").toLowerCase();
      if (eventFilter === "police") return t.includes("police") || t.includes("arrest") || t.includes("crime");
      if (eventFilter === "corporation") return t.includes("corp");
      if (eventFilter === "marriage") return t.includes("marr") || t.includes("divorce") || t.includes("wedding");
      if (eventFilter === "religion") return t.includes("relig") || t.includes("prayer") || t.includes("faith");
      if (eventFilter === "casino") return t.includes("casino") || t.includes("gambl");
      if (eventFilter === "espionage") return t.includes("spy") || t.includes("espion");
      if (eventFilter === "frs") return t.includes("frs");
      if (eventFilter === "epidemic") return t.includes("epidem") || t.includes("disease") || t.includes("virus");
      if (eventFilter === "education") return t.includes("educ") || t.includes("school") || t.includes("graduat");
      if (eventFilter === "election") return t.includes("elect") || t.includes("rebel") || t.includes("law");
      if (eventFilter === "trade") return t.includes("trade") || t.includes("market") || t.includes("famine");
      return t.includes(eventFilter);
    });
  }, [allFeedItems, eventFilter]);

  const loadMyBets = useCallback(async () => {
    const w = account?.address?.trim();
    if (!w) {
      myBetsRef.current = [];
      setMyBets([]);
      return;
    }
    try {
      const r = await fetch(`/api/my_bets/${encodeURIComponent(w)}`);
      const data = await r.json();
      const fetched = Array.isArray(data) ? (data as ZionBetMyBetRow[]) : [];
      const prev = myBetsRef.current || [];
      notifyMyBetsSettlements(prev, fetched, setZionBetNotify);
      myBetsRef.current = fetched;
      setMyBets(fetched);
    } catch {
      myBetsRef.current = [];
      setMyBets([]);
    }
  }, [account?.address]);

  const handlePlaceCardBet = useCallback(
    async (modalMarket: ZionBetMarket, modalDirection: boolean) => {
      if (!account?.address) return;
      setBetLoading(true);
      const amount = parseFloat(betAmount);
      const marketObjectId = getMarketObjectId(modalMarket.id);
      const betAmountZion = Number.isFinite(amount) && amount >= 1 ? amount : 1;
      try {
        const res = await fetch(marketObjectId ? "/api/bet" : "/api/place_bet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            marketObjectId
              ? {
                  wallet: account.address,
                  market_id: modalMarket.id,
                  direction: modalDirection,
                  amount_sui: betAmountZion,
                }
              : {
                  wallet: account.address,
                  event_type: modalMarket.event_type,
                  question: modalMarket.question,
                  prediction: modalDirection,
                  amount: betAmountZion,
                }
          ),
        });
        const data = (await res.json()) as {
          success?: boolean;
          message?: string;
          error?: string;
          potential_payout?: number;
          points_earned?: number;
        };
        if (!data.success) {
          setZionBetToast(
            typeof data.message === "string"
              ? data.message
              : typeof data.error === "string"
                ? data.error
                : "Could not place bet."
          );
          return;
        }

        setBetResult(data);
        setBetModal(null);
        void loadMyBets();
        void loadZionBetMarkets();
        fetch("/api/zionbet/markets")
          .then((r) => r.json())
          .then((d: ZionbetMarketsBundle) => {
            setZionbetMarkets({
              crypto: Array.isArray(d.crypto) ? d.crypto : [],
              sports: Array.isArray(d.sports) ? d.sports : [],
              civilization: Array.isArray(d.civilization) ? d.civilization : [],
            });
          })
          .catch(() => {});
        const ur = await fetch(`/api/user/${encodeURIComponent(account.address)}`);
        const ud = await ur.json();
        const raw = ud.points ?? ud.total_points ?? 0;
        const pts = typeof raw === "number" ? raw : Number(raw);
        if (Number.isFinite(pts)) setUserPoints(pts);

        if (!marketObjectId) {
          setZionBetToast(
            typeof data.potential_payout === "number"
              ? `Bet placed! Potential win: ${data.potential_payout} SUI`
              : "Bet placed! Good luck."
          );
          return;
        }

        setZionBetToast("Saved to DB. Submitting on-chain…");
        executeZionBetOnChain(
          signAndExecute as SignAndExecuteFn,
          {
            marketObjectId,
            direction: modalDirection,
            amountSui: betAmountZion,
            walletAddress: account.address,
          },
          {
            onSuccess: (digest) => {
              const txLabel = digest ? `${digest.slice(0, 8)}…` : "pending";
              setZionBetToast(`✅ Bet placed on-chain! TX: ${txLabel}`);
              void loadMyBets();
            },
            onError: (message) => {
              setZionBetToast(`On-chain failed (DB bet saved): ${message}`);
            },
          }
        );
      } catch {
        setZionBetToast("Request failed.");
      } finally {
        setBetLoading(false);
      }
    },
    [account?.address, betAmount, signAndExecute, loadMyBets, loadZionBetMarkets]
  );

  const handleBankSend = useCallback(async () => {
    if (!account?.address) {
      setBankError("Connect wallet first");
      return;
    }
    if (!bankRecipient.startsWith("0x")) {
      setBankError("Invalid address");
      return;
    }
    if (!bankAmount || parseFloat(bankAmount) <= 0) {
      setBankError("Invalid amount");
      return;
    }

    setBankLoading(true);
    setBankError(null);
    setBankTxHash(null);

    try {
      const tx = new Transaction();

      if (bankToken === "SUI") {
        const amountMist = BigInt(Math.floor(parseFloat(bankAmount) * 1_000_000_000));
        const [coin] = tx.splitCoins(tx.gas, [amountMist]);
        tx.transferObjects([coin], tx.pure.address(bankRecipient));
      } else {
        const amountZion = BigInt(Math.floor(parseFloat(bankAmount) * 1_000_000_000_000));
        tx.moveCall({
          target: "0x2::coin::transfer",
          typeArguments: ["0xa72560fc86cb9cbbe3755cf8f0bc69d72ed987dee0ed1a2dccf3b0b90d9d2b78::zion::ZION"],
          arguments: [tx.pure.u64(amountZion), tx.pure.address(bankRecipient)],
        });
      }

      signAndExecute(
        { transaction: tx, chain: "sui:testnet" },
        {
          onSuccess: async (result) => {
            const digest = suiTxDigest(result);
            setBankTxHash(digest);
            setBankLoading(false);
            fetch("/api/bank/transfer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                from: account.address,
                to: bankRecipient,
                amount: parseFloat(bankAmount),
                token: bankToken,
                tx_hash: digest,
              }),
            }).catch(() => {});
          },
          onError: (err) => {
            setBankError(err.message);
            setBankLoading(false);
          },
        }
      );
    } catch (err: unknown) {
      setBankError(err instanceof Error ? err.message : "Unknown error");
      setBankLoading(false);
    }
  }, [account?.address, bankRecipient, bankAmount, bankToken, signAndExecute]);

  useEffect(() => {
    if (!account?.address) {
      myBetsRef.current = [];
      setMyBets([]);
      return;
    }

    const pollMyBets = () => {
      void fetch(`/api/my_bets/${encodeURIComponent(account.address!)}`)
        .then((r) => r.json())
        .then((data) => {
          const bets = Array.isArray(data) ? (data as ZionBetMyBetRow[]) : [];
          const prev = myBetsRef.current || [];
          notifyMyBetsSettlements(prev, bets, setZionBetNotify);
          myBetsRef.current = bets;
          setMyBets(bets);
        })
        .catch(() => {});
    };

    pollMyBets();
    const interval = window.setInterval(pollMyBets, 30000);
    return () => clearInterval(interval);
  }, [account?.address]);

  useEffect(() => {
    if (!faucetCooldownEndsAt || faucetCooldownEndsAt <= Date.now()) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [faucetCooldownEndsAt]);

  useEffect(() => {
    void fetchConversations();
    const t = window.setInterval(() => void fetchConversations(), 60000);
    return () => clearInterval(t);
  }, [fetchConversations]);

  useEffect(() => {
    if (showIntro && !dashboardVisible) return;
    const canvas = bgCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const stepMs = 50;
    const size = 14;
    let drops: number[] = [];

    const setup = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = Math.floor(window.innerWidth / size);
      drops = Array(cols).fill(0).map(() => Math.floor(Math.random() * -50));
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    };

    const loop = (now: number) => {
      acc += now - last;
      last = now;
      if (acc >= stepMs) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
        ctx.fillStyle = "#00ff41";
        ctx.font = `${size}px monospace`;
        for (let i = 0; i < drops.length; i++) {
          const ch = bgChars[Math.floor(Math.random() * bgChars.length)]!;
          const x = i * size;
          const y = drops[i]! * size;
          ctx.fillText(ch, x, y);
          if (y > window.innerHeight + size && Math.random() > 0.98) drops[i] = Math.floor(Math.random() * -20);
          drops[i]! += 1;
        }
        acc = 0;
      }
      raf = requestAnimationFrame(loop);
    };

    setup();
    window.addEventListener("resize", setup);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", setup);
    };
  }, [dashboardVisible, showIntro]);

  useEffect(() => {
    if (!showIntro) {
      setDashboardVisible(true);
    }
  }, [showIntro]);

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setIntroFading(true);
      setDashboardVisible(true);
    }, 5200);
    const hideTimer = setTimeout(() => {
      setDashboardVisible(true);
      setIntroFading(true);
      setShowIntro(false);
    }, 6000);
    const failsafeTimer = setTimeout(() => {
      setDashboardVisible(true);
      setIntroFading(true);
      setShowIntro(false);
    }, 12000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
      clearTimeout(failsafeTimer);
    };
  }, []);

  useEffect(() => {
    if (showIntro) return;
    const load = async () => {
      try {
        await fetchStats();
        const [a, c] = await Promise.all([
          fetch("/api/agents").then((r) => r.json()),
          fetch("/api/clans").then((r) => r.json()),
        ]);
        setAgents(a);
        setClans(c);
      } catch {
        // keep last successful snapshot
      }
    };

    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [showIntro, fetchStats]);

  useEffect(() => {
    if (showIntro || activeTab !== "chat" || selectedClass == null) {
      if (selectedClass == null) setChatAgentsFiltered([]);
      return;
    }
    const ac = new AbortController();
    const load = async () => {
      try {
        const cls = selectedClass.trim().toLowerCase() as ChatClassFilter;
        const url = chatAgentsListUrl(cls);
        console.log("Fetching agents with class:", cls);
        console.log("URL:", url);
        const r = await fetch(url, { signal: ac.signal, cache: "no-store" });
        if (!r.ok) {
          setChatAgentsFiltered([]);
          return;
        }
        const data = await r.json();
        const raw = Array.isArray(data) ? data : [];
        const filtered = raw.filter((row): row is Agent => {
          if (!row || typeof row !== "object") return false;
          const a = row as Agent;
          return (a.class || "").trim().toLowerCase() === cls;
        });
        if (filtered.length !== raw.length) {
          console.warn(
            "[CHAT] Dropped agents whose class did not match filter",
            cls,
            "kept",
            filtered.length,
            "of",
            raw.length,
          );
        }
        setChatAgentsFiltered(filtered);
      } catch {
        if (!ac.signal.aborted) setChatAgentsFiltered([]);
      }
    };
    void load();
    return () => ac.abort();
  }, [showIntro, activeTab, selectedClass]);

  useEffect(() => {
    if (showIntro || !walletAddress.trim()) {
      setUserPoints(0);
      return;
    }
    const loadUser = async () => {
      try {
        const r = await fetch(`/api/user/${encodeURIComponent(walletAddress.trim())}`);
        const d = await r.json();
        const raw = d.points ?? d.total_points ?? 0;
        const pts = typeof raw === "number" ? raw : Number(raw);
        setUserPoints(Number.isFinite(pts) ? pts : 0);
        const cd = parseCooldownPayload(d);
        if (cd) setFaucetCooldownEndsAt(cd);
      } catch {
        setUserPoints(0);
      }
    };
    loadUser();
  }, [showIntro, walletAddress]);

  useEffect(() => {
    if (showIntro) return;
    const loadLb = async () => {
      try {
        const r = await fetch("/api/leaderboard");
        const d = await r.json();
        const rows = Array.isArray(d)
          ? d
          : Array.isArray(d?.leaderboard)
            ? d.leaderboard
            : Array.isArray(d?.rows)
              ? d.rows
              : [];
        setLeaderboard(rows);
      } catch {
        setLeaderboard([]);
      }
    };
    loadLb();
    const t = setInterval(loadLb, 30000);
    return () => clearInterval(t);
  }, [showIntro]);

  const maxBalance = useMemo(() => Math.max(1, ...agents.map((a) => a.balance)), [agents]);
  const chatAgents = chatAgentsFiltered;
  const chatMaxBalance = useMemo(() => Math.max(1, ...chatAgents.map((a) => a.balance)), [chatAgents]);

  const openChat = (agent: Agent) => {
    setChatAgent(agent);
    setChatMessages([]);
    setChatInput("");
  };

  const sendChat = async () => {
    if (!chatAgent || !walletAddress.trim() || !chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages((m) => [...m, { role: "user", text: msg }]);
    setChatLoading(true);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: walletAddress.trim(),
          agent_id: chatAgent.id,
          message: msg,
        }),
      });
      const d = await r.json();
      const reply =
        typeof d.reply === "string"
          ? d.reply
          : typeof d.response === "string"
            ? d.response
            : typeof d.message === "string"
              ? d.message
              : typeof d.answer === "string"
                ? d.answer
                : typeof d.error === "string"
                  ? d.error
                  : JSON.stringify(d);
      setChatMessages((m) => [...m, { role: "agent", text: reply }]);
      const ur = await fetch(`/api/user/${encodeURIComponent(walletAddress.trim())}`);
      const ud = await ur.json();
      const raw = ud.points ?? ud.total_points ?? 0;
      const pts = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(pts)) setUserPoints(pts);
    } catch {
      setChatMessages((m) => [...m, { role: "agent", text: "Request failed." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const claimFaucet = async () => {
    if (!walletAddress.trim()) return;
    setFaucetBusy(true);
    try {
      const res = await fetch(`/api/faucet/${encodeURIComponent(walletAddress.trim())}`);
      const data = await res.json();
      const cd = parseCooldownPayload(data);
      if (cd) setFaucetCooldownEndsAt(cd);
      else if (res.ok) setFaucetCooldownEndsAt(null);
      const ur = await fetch(`/api/user/${encodeURIComponent(walletAddress.trim())}`);
      const ud = await ur.json();
      const raw = ud.points ?? ud.total_points ?? 0;
      const pts = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(pts)) setUserPoints(pts);
      const ucd = parseCooldownPayload(ud);
      if (ucd) setFaucetCooldownEndsAt(ucd);
    } finally {
      setFaucetBusy(false);
    }
  };

  const placeZionBet = async (
    bet: ZionBetMarket,
    prediction: boolean,
    amount: number = 1,
    bracketIndex?: number
  ) => {
    const w = walletAddress.trim();
    if (!w) return;
    const placingId =
      typeof bracketIndex === "number"
        ? `${bet.id}-b${bracketIndex}-${prediction}`
        : `${bet.id}-${prediction}`;
    setZionBetPlacing(placingId);
    const marketObjectId = getMarketObjectId(bet.id);
    try {
      const body: Record<string, unknown> = {
        wallet: w,
        market_id: bet.id,
        direction: prediction,
        amount_sui: amount,
      };
      if (typeof bracketIndex === "number") body.bracket_index = bracketIndex;
      const r = await fetch("/api/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await r.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
        potential_payout?: number;
        points_earned?: number;
      };
      if (!d.success) {
        setZionBetToast(
          typeof d.message === "string" ? d.message : typeof d.error === "string" ? d.error : "Could not place bet."
        );
        return;
      }

      const ur = await fetch(`/api/user/${encodeURIComponent(w)}`);
      const ud = await ur.json();
      const raw = ud.points ?? ud.total_points ?? 0;
      const pts = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(pts)) setUserPoints(pts);
      void loadMyBets();
      void loadZionBetMarkets();

      if (!marketObjectId) {
        setZionBetToast(
          typeof d.potential_payout === "number"
            ? `Bet placed! Potential win: ${d.potential_payout} SUI`
            : "Bet placed! Good luck."
        );
        return;
      }

      setZionBetToast("Saved to DB. Submitting on-chain…");
      executeZionBetOnChain(
        signAndExecute as SignAndExecuteFn,
        {
          marketObjectId,
          direction: prediction,
          amountSui: amount,
          walletAddress: w,
        },
        {
          onSuccess: (digest) => {
            const txLabel = digest ? `${digest.slice(0, 8)}…` : "pending";
            setZionBetToast(`✅ Bet placed on-chain! TX: ${txLabel}`);
            void loadMyBets();
          },
          onError: (message) => {
            setZionBetToast(`On-chain failed (DB bet saved): ${message}`);
          },
        }
      );
    } catch {
      setZionBetToast("Request failed.");
    } finally {
      setZionBetPlacing(null);
    }
  };

  const referralLink = useMemo(() => {
    const w = walletAddress.trim();
    if (typeof window === "undefined" || !w) return "";
    return `${window.location.origin}${window.location.pathname}?ref=${encodeURIComponent(w)}`;
  }, [walletAddress]);

  const cooldownRemainingSec =
    faucetCooldownEndsAt != null ? Math.max(0, Math.ceil((faucetCooldownEndsAt - nowTick) / 1000)) : 0;
  const onCooldown = cooldownRemainingSec > 0;

  const isGoogleConnected = !!zkLoginUser;
  const isWalletConnected = !!account?.address;

  const sheriffActionsDisplay = sheriffActions.slice(0, 5);
  const presidentActionsDisplay = presidentActions.slice(0, 5);

  const renderAuthToolbar = () => (
    <>
        {!isGoogleConnected && !isWalletConnected && (
          <>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                try {
                  const randomness = generateRandomness();
                  const ephemeralKeypair = Ed25519Keypair.generate();
                  const system = await suiClient.getLatestSuiSystemState({});
                  const epoch = Number(system.epoch);
                  const maxEpoch = epoch + 10;
                  const nonce = generateNonce(ephemeralKeypair.getPublicKey(), maxEpoch, randomness);
                  localStorage.setItem("zklogin_randomness", randomness);
                  localStorage.setItem("zklogin_max_epoch", String(maxEpoch));
                  localStorage.setItem("zklogin_ephemeral_secret", ephemeralKeypair.getSecretKey());
                  const params = new URLSearchParams({
                    client_id: "920459249916-5n0cheppacdv3e1l3de5rpl6b13dkdvn.apps.googleusercontent.com",
                    redirect_uri: "https://zionciv.com/auth/callback",
                    response_type: "id_token",
                    scope: "openid email",
                    nonce,
                  });
                  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
                } catch (e) {
                  console.error(e);
                }
              })();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              height: "36px",
              boxSizing: "border-box",
              padding: "0 16px",
              background: "transparent",
              border: "1px solid #00ff41",
              borderRadius: "6px",
              color: "#00ff41",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: "0.8rem",
              letterSpacing: "1px",
            }}
          >
            <span>🔑</span>
            <span>Sign in with Google</span>
            </button>
            <button
              type="button"
              onClick={() => connect()}
            style={{
              background: "transparent",
              border: "1px solid #00ff41",
              color: "#00ff41",
              padding: "8px 16px",
              borderRadius: "6px",
              cursor: "pointer",
              fontFamily: "monospace",
              fontSize: "0.8rem",
              letterSpacing: "1px",
              height: "36px",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
              ⚡ {isMobile ? "WALLET" : "CONNECT WALLET"}
            </button>
          </>
        )}
        {!isGoogleConnected && isWalletConnected && account?.address ? (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowWalletMenu(!showWalletMenu);
                setShowUserMenu(false);
              }}
              style={{
                background: "transparent",
                border: "1px solid #00ff41",
                color: "#00ff41",
                padding: "8px 12px",
                borderRadius: "6px",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: "0.78rem",
                letterSpacing: "0.5px",
                height: "36px",
              }}
            >
              {`⚡ ${walletAddress.trim().slice(0, 6)}...${walletAddress.trim().slice(-4)} ▾`}
            </button>

            {showWalletMenu ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "40px",
                  background: "#0a0a0a",
                  border: "1px solid #00ff41",
                  borderRadius: "6px",
                  minWidth: "200px",
                  zIndex: 200,
                }}
              >
                <div
                  style={{
                    padding: "10px 14px",
                    color: "#555",
                    fontFamily: "monospace",
                    fontSize: "0.7rem",
                    borderBottom: "1px solid #111",
                  }}
                >
                  {`${walletAddress.trim().slice(0, 16)}...`}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    disconnect();
                    setShowWalletMenu(false);
                  }}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    color: "#ff4141",
                    padding: "10px 14px",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    fontSize: "0.78rem",
                    textAlign: "left",
                  }}
                >
                  ⏻ Disconnect Wallet
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {isGoogleConnected && !isWalletConnected && zkLoginUser ? (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowUserMenu(!showUserMenu);
                setShowWalletMenu(false);
              }}
              style={{
                background: "transparent",
                border: "1px solid #00ff41",
                color: "#00ff41",
                padding: "8px 12px",
                borderRadius: "6px",
                cursor: "pointer",
                fontFamily: "monospace",
                fontSize: "0.78rem",
                letterSpacing: "0.5px",
                height: "36px",
              }}
            >
              ⚡ {zkLoginUser.email.split("@")[0]} ▾
            </button>

            {showUserMenu ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "40px",
                  background: "#0a0a0a",
                  border: "1px solid #00ff41",
                  borderRadius: "6px",
                  minWidth: "200px",
                  zIndex: 200,
                }}
              >
                <div
                  style={{
                    padding: "10px 14px",
                    color: "#555",
                    fontFamily: "monospace",
                    fontSize: "0.72rem",
                    borderBottom: "1px solid #111",
                  }}
                >
                  {zkLoginUser.email}
                </div>
                <div
                  style={{
                    padding: "8px 14px",
                    color: "#555",
                    fontFamily: "monospace",
                    fontSize: "0.7rem",
                    borderBottom: "1px solid #111",
                  }}
                >
                  {zkLoginUser.address.substring(0, 10)}...
                </div>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem("zklogin_jwt");
                    setZkLoginUser(null);
                    setShowUserMenu(false);
                  }}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    color: "#ff4141",
                    padding: "10px 14px",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    fontSize: "0.78rem",
                    textAlign: "left",
                  }}
                >
                  ⏻ Logout
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        {isGoogleConnected && isWalletConnected && zkLoginUser && account?.address ? (
          <>
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowUserMenu(!showUserMenu);
                  setShowWalletMenu(false);
                }}
                style={{
                  background: "transparent",
                  border: "1px solid #00ff41",
                  color: "#00ff41",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontFamily: "monospace",
                  fontSize: "0.78rem",
                  letterSpacing: "0.5px",
                  height: "36px",
                }}
              >
                ⚡ {zkLoginUser.email.split("@")[0]} ▾
              </button>

              {showUserMenu ? (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "40px",
                    background: "#0a0a0a",
                    border: "1px solid #00ff41",
                    borderRadius: "6px",
                    minWidth: "200px",
                    zIndex: 200,
                  }}
                >
                  <div
                    style={{
                      padding: "10px 14px",
                      color: "#555",
                      fontFamily: "monospace",
                      fontSize: "0.72rem",
                      borderBottom: "1px solid #111",
                    }}
                  >
                    {zkLoginUser.email}
                  </div>
                  <div
                    style={{
                      padding: "8px 14px",
                      color: "#555",
                      fontFamily: "monospace",
                      fontSize: "0.7rem",
                      borderBottom: "1px solid #111",
                    }}
                  >
                    {zkLoginUser.address.substring(0, 10)}...
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem("zklogin_jwt");
                      setZkLoginUser(null);
                      setShowUserMenu(false);
                    }}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      color: "#ff4141",
                      padding: "10px 14px",
                      cursor: "pointer",
                      fontFamily: "monospace",
                      fontSize: "0.78rem",
                      textAlign: "left",
                    }}
                  >
                    ⏻ Logout
                  </button>
                </div>
              ) : null}
            </div>
            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowWalletMenu(!showWalletMenu);
                  setShowUserMenu(false);
                }}
                style={{
                  background: "transparent",
                  border: "1px solid #00ff41",
                  color: "#00ff41",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontFamily: "monospace",
                  fontSize: "0.78rem",
                  letterSpacing: "0.5px",
                  height: "36px",
                }}
              >
                {`⚡ ${walletAddress.trim().slice(0, 6)}...${walletAddress.trim().slice(-4)} ▾`}
              </button>

              {showWalletMenu ? (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "40px",
                    background: "#0a0a0a",
                    border: "1px solid #00ff41",
                    borderRadius: "6px",
                    minWidth: "200px",
                    zIndex: 200,
                  }}
                >
                  <div
                    style={{
                      padding: "10px 14px",
                      color: "#555",
                      fontFamily: "monospace",
                      fontSize: "0.7rem",
                      borderBottom: "1px solid #111",
                    }}
                  >
                    {`${walletAddress.trim().slice(0, 16)}...`}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      disconnect();
                      setShowWalletMenu(false);
                    }}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      color: "#ff4141",
                      padding: "10px 14px",
                      cursor: "pointer",
                      fontFamily: "monospace",
                      fontSize: "0.78rem",
                      textAlign: "left",
                    }}
                  >
                    ⏻ Disconnect Wallet
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
    </>
  );

  return (
    <main className="page">
      {(showWalletMenu || showUserMenu) && (
        <div
          onClick={() => {
            setShowWalletMenu(false);
            setShowUserMenu(false);
          }}
          style={{ position: "fixed", inset: 0, zIndex: 150 }}
          aria-hidden
        />
      )}
      {!isMobile ? (
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "8px",
            padding: "12px",
            zIndex: showWalletMenu || showUserMenu ? 200 : 100,
            background: "rgba(0,0,0,0.8)",
          }}
          aria-label="Sign in"
        >
          {renderAuthToolbar()}
        </div>
      ) : null}
      <canvas
        ref={bgCanvasRef}
        style={{ position: "fixed", inset: 0, zIndex: 0, opacity: 0.22, pointerEvents: "none" }}
        aria-hidden
      />
      <div className="bg-nebula" />
      <div className="bg-grid" />

      {showIntro && (
        <div
          className="introFullscreen"
          style={{
            position: "fixed",
            inset: 0,
            background: "#000",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            opacity: introFading ? 0 : 1,
            transition: "opacity 0.8s ease",
            pointerEvents: introFading ? "none" : "auto",
          }}
        >
          <canvas
            ref={(canvas) => {
              if (!canvas) return;
              const ctx = canvas.getContext("2d");
              if (!ctx) return;
              canvas.width = window.innerWidth;
              canvas.height = window.innerHeight;
              const cx = canvas.width / 2;
              const cy = canvas.height / 2;

              const introColors = ["#00ff41", "#00ff41", "#ffd700", "#ff6600", "#ffffff"];
              const particles = Array.from({ length: 800 }, () => ({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                targetAngle: Math.random() * Math.PI * 2,
                targetRadius: 20 + Math.pow(Math.random(), 0.5) * 280,
                color: introColors[Math.floor(Math.random() * introColors.length)],
                size: 0.5 + Math.random() * 1.5,
                speed: 0.001 + Math.random() * 0.002,
                angle: Math.random() * Math.PI * 2,
                progress: 0,
              }));

              let frame = 0;
              const animate = () => {
                ctx.fillStyle = "rgba(0,0,0,0.12)";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                frame++;
                const convergence = Math.min(frame / 120, 1);

                particles.forEach((p) => {
                  const tx = cx + Math.cos(p.targetAngle) * p.targetRadius;
                  const ty = cy + Math.sin(p.targetAngle) * p.targetRadius * 0.4;

                  p.x += (tx - p.x) * 0.02 * convergence;
                  p.y += (ty - p.y) * 0.02 * convergence;

                  if (convergence > 0.5) {
                    p.targetAngle += p.speed;
                  }

                  ctx.beginPath();
                  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                  ctx.fillStyle = p.color;
                  ctx.globalAlpha = 0.4 + Math.random() * 0.6;
                  ctx.fill();
                  ctx.globalAlpha = 1;
                });

                requestAnimationFrame(animate);
              };
              animate();
            }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          />

          <div style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
            <div
              style={{
                fontSize: isMobile ? "2.5rem" : "4rem",
                fontWeight: 900,
                fontFamily: "monospace",
                color: "#00ff41",
                letterSpacing: "0.15em",
                textShadow: "0 0 30px rgba(0,255,65,0.8), 0 0 60px rgba(0,255,65,0.4)",
                animation: "fadeInUp 0.8s ease forwards",
                marginBottom: "8px",
                opacity: 0,
                animationDelay: "0.5s",
                animationFillMode: "forwards",
              }}
            >
              ZION
            </div>

            <div
              style={{
                fontSize: "1rem",
                color: "#ffd700",
                letterSpacing: "0.4em",
                fontFamily: "monospace",
                animation: "fadeInUp 0.8s ease forwards",
                animationDelay: "1s",
                opacity: 0,
                animationFillMode: "forwards",
                marginBottom: "32px",
              }}
            >
              CIVILIZATION
            </div>

            <div
              style={{
                animation: "fadeInUp 0.8s ease forwards",
                animationDelay: "1.8s",
                opacity: 0,
                animationFillMode: "forwards",
                fontFamily: "monospace",
                fontSize: "0.75rem",
                color: "#333",
                lineHeight: 2,
              }}
            >
              <div style={{ color: "#00ff41" }}>✓ Connected to Sui testnet</div>
              <div style={{ color: "#00ff41" }}>{aliveAgents > 0
                  ? `✓ ${aliveAgents.toLocaleString()} agents online`
                  : "Loading agents..."}</div>
              <div style={{ color: "#ffd700" }}>✓ ZionBet prediction markets ready</div>
              <div style={{ color: "#00ff41" }}>✓ Walrus · DeepBook · Seal online</div>
            </div>

            <div
              style={{
                marginTop: "24px",
                animation: "fadeInUpSemi 0.8s ease forwards",
                animationDelay: "2.5s",
                opacity: 0,
                animationFillMode: "forwards",
                color: "#00ff41",
                fontSize: "0.7rem",
                letterSpacing: "0.2em",
                fontFamily: "monospace",
              }}
            >
              WORLD&apos;S FIRST AUTONOMOUS AI CIVILIZATION ON SUI
            </div>
          </div>
        </div>
      )}

      <div
        className={`dashboard ${dashboardVisible ? "show" : ""}`}
        style={isMobile ? { padding: "8px" } : undefined}
      >
        {isMobile ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 8,
              width: "100%",
            }}
          >
            <div
              aria-label="Sign in"
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                alignItems: "center",
                gap: "8px",
                padding: "8px 4px",
                width: "100%",
                background: "rgba(0,0,0,0.9)",
                borderRadius: "8px",
                border: "1px solid rgba(0, 255, 65, 0.3)",
                boxSizing: "border-box",
              }}
            >
              {renderAuthToolbar()}
            </div>
            <header className="header" style={{ width: "100%" }}>
              <h1
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                ZION CIVILIZATION
              </h1>
              <p>World&apos;s first autonomous AI civilization on Sui blockchain</p>
            </header>
            <nav
              className="mainNav"
              aria-label="Main navigation"
              style={{
                flexWrap: "wrap",
                margin: "0 0 12px 0",
                position: "relative",
                top: "auto",
                width: "100%",
              }}
            >
              {(
                [
                  ["civilization", "🌍 CIVILIZATION"],
                  ["chat", "💬 CHAT"],
                  ["zionbet", "🎰 ZIONBET"],
                  ["treasury", "💹 ECO-POL"],
                  ["leaderboard", "🏆 LEADERBOARD"],
                  ["faucet", "🚰 FAUCET"],
                  ["press", "📰 PRESS"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`navTab ${activeTab === id ? "active" : ""}`}
                  onClick={() => setActiveTab(id)}
                  style={{
                    fontSize: "0.6rem",
                    padding: "6px 8px",
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        ) : (
          <>
            <header className="header">
              <h1
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                ZION CIVILIZATION
              </h1>
              <p style={{ whiteSpace: "nowrap" }}>
                World&apos;s first autonomous AI civilization on Sui blockchain
              </p>
            </header>
            <nav
              className="mainNav"
              aria-label="Main navigation"
              style={{ flexWrap: "nowrap" }}
            >
              {(
                [
                  ["civilization", "🌍 CIVILIZATION"],
                  ["chat", "💬 CHAT"],
                  ["zionbet", "🎰 ZIONBET"],
                  ["treasury", "💹 ECO-POL"],
                  ["leaderboard", "🏆 LEADERBOARD"],
                  ["faucet", "🚰 FAUCET"],
                  ["press", "📰 PRESS"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`navTab ${activeTab === id ? "active" : ""}`}
                  onClick={() => setActiveTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>
          </>
        )}

        <div className="tabPanels">
          {activeTab === "civilization" && (
            <>
              <section
                className="statsGrid"
                style={
                  isMobile
                    ? { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }
                    : undefined
                }
              >
                <article className="statCard cyan">
                  <p>ALIVE AGENTS</p>
                  <h3>{stats?.alive ?? agents.length}</h3>
                </article>
                <article className="statCard gold">
                  <p>TOTAL ZION</p>
                  <h3>{stats ? Math.round(stats.total_zion) : "--"}</h3>
                </article>
                <article className="statCard red">
                  <p>DEATHS TODAY</p>
                  <h3>{stats?.deaths_today ?? "--"}</h3>
                </article>
                <article className="statCard purple">
                  <p>ACTIVE CLANS</p>
                  <h3>{stats?.active_clans ?? clans.length}</h3>
                </article>
              </section>

              <section
                className="civilizationSidebarRow"
                aria-label="Live feed sidebar"
                style={{
                  flexDirection: isMobile ? "column" : undefined,
                  alignItems: isMobile ? "stretch" : undefined,
                }}
              >
                <div
                  className="civilizationSidebarRowFill"
                  style={{
                    border: "1px solid #1a1a1a",
                    borderRadius: "12px",
                    padding: "16px",
                    marginBottom: "16px",
                    background: "rgba(0,5,0,0.5)",
                    width: isMobile ? "100%" : "70%",
                    flex: isMobile ? "none" : 1,
                    display: isMobile ? "block" : undefined,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "12px",
                    }}
                  >
                    <div style={{ color: "#00ff41", fontSize: "0.75rem", letterSpacing: "0.1em" }}>
                      🗺️ LIVE AGENT MAP
                    </div>
                    <div style={{ display: "flex", gap: "12px" }}>
                      {[
                        { color: "#00ff41", label: "Elite" },
                        { color: "#ffd700", label: "Middle" },
                        { color: "#ff6600", label: "Poor" },
                        { color: "#ff3232", label: "Critical" },
                      ].map((c) => (
                        <div key={c.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <div
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              background: c.color,
                            }}
                          />
                          <span style={{ color: "#555", fontSize: "0.6rem" }}>{c.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <canvas
                    ref={galaxyCanvasRef}
                    style={{
                      width: isMobile ? "100%" : "100%",
                      height: isMobile ? "300px" : "280px",
                      borderRadius: "8px",
                      display: "block",
                      marginBottom: "12px",
                    }}
                  />

                  <div style={{ borderTop: "1px solid #111", paddingTop: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      {[
                        { label: "Total", value: aliveAgents, color: "#00ff41" },
                        { label: "Elite", value: agentClasses.elite, color: "#00ff41" },
                        { label: "Middle", value: agentClasses.middle, color: "#ffd700" },
                        { label: "Poor", value: agentClasses.poor, color: "#ff6600" },
                        { label: "Critical", value: agentClasses.critical, color: "#ff3232" },
                      ].map((s) => (
                        <div key={s.label} style={{ textAlign: "center" }}>
                          <div style={{ color: s.color, fontSize: "0.85rem", fontWeight: "bold" }}>
                            {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
                          </div>
                          <div style={{ color: "#444", fontSize: "0.6rem" }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <aside
                  className="civilizationSidebar"
                  style={{ width: isMobile ? "100%" : undefined }}
                >
                  <div className="sidebarAgentConvWrap">
                    <h2 className="sidebarSectionTitle">AGENT CONVERSATIONS</h2>
                    <p className="sidebarHint">AI pairs · refresh 60s · last 4</p>
                    <div className="agentConvFeed">
                      {conversations.length === 0 ? (
                        <p className="agentConvEmpty">Scanning agent chatter…</p>
                      ) : (
                        conversations.slice(0, 4).map((conv, idx, arr) => {
                          const m1 = classMeta(conv.agent1.class);
                          const m2 = classMeta(conv.agent2.class);
                          const leftText =
                            conv.message1 != null ? cleanMsg(conv.message1) : conv.topic;
                          const rightText =
                            conv.message2 != null
                              ? cleanMsg(conv.message2)
                              : "[Agent2 would respond based on their class…]";
                          return (
                            <article
                              key={`conv-${conv.id}-${conv.agent1.id}-${conv.agent2.id}-${conv.topic.slice(0, 24)}`}
                              className={`agentConvCard agentConvCardCompact${idx < arr.length - 1 ? " agentConvCardSep" : ""}`}
                            >
                              <div className="agentConvBadge agentConvBadgeCompact">
                                <span className="agentConvBadgeEmoji" aria-hidden>
                                  {topicBadgeEmoji(conv.topic)}
                                </span>
                                <span className="agentConvBadgeText">{topicSnippet(conv.topic, 52)}</span>
                              </div>
                              <div className="agentConvThread agentConvThreadCompact">
                                <div className="agentConvRow agentConvRowLeft">
                                  <div className="agentConvMeta" style={{ color: m1.border }}>
                                    <span aria-hidden>{m1.icon}</span>
                                    <strong>{cleanName(conv.agent1.name)}</strong>
                                    <span className="agentConvClassTag">{conv.agent1.class}</span>
                                  </div>
                                  <div
                                    className="agentConvBubble agentConvBubbleLeft"
                                    style={{ borderColor: m1.border, boxShadow: `0 0 12px ${m1.border}22` }}
                                  >
                                    {leftText}
                                  </div>
                                </div>
                                <div className="agentConvRow agentConvRowRight">
                                  <div className="agentConvMeta agentConvMetaRight" style={{ color: m2.border }}>
                                    <span className="agentConvClassTag">{conv.agent2.class}</span>
                                    <strong>{cleanName(conv.agent2.name)}</strong>
                                    <span aria-hidden>{m2.icon}</span>
                                  </div>
                                  <div
                                    className="agentConvBubble agentConvBubbleRight agentConvBubbleAgent2"
                                    style={{ borderColor: m2.border, boxShadow: `0 0 12px ${m2.border}22` }}
                                  >
                                    {rightText}
                                  </div>
                                </div>
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </div>
                </aside>
              </section>


              {corporations.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "24px 0 16px 0" }}>
                    <div style={{ flex: 1, height: "1px", background: "linear-gradient(to right, transparent, #4DA2FF)" }} />
                    <span style={{ color: "#4DA2FF", fontFamily: "monospace", fontSize: "0.8rem", letterSpacing: "3px", whiteSpace: "nowrap" }}>
                      🏢 CORPORATIONS 🏢
                    </span>
                    <div style={{ flex: 1, height: "1px", background: "linear-gradient(to left, transparent, #4DA2FF)" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "12px" }}>
                    {corporations.map((corp) => (
                      <div
                        key={corp.id}
                        style={{
                          border: "1px solid #1a3a5c",
                          borderRadius: "10px",
                          padding: "14px",
                          background: "rgba(77,162,255,0.03)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                          <span style={{ color: "#4DA2FF", fontFamily: "monospace", fontWeight: "bold", fontSize: "0.85rem" }}>
                            {corp.name}
                          </span>
                          <span
                            style={{
                              background: "rgba(77,162,255,0.1)",
                              color: "#4DA2FF",
                              fontSize: "0.6rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              fontFamily: "monospace",
                            }}
                          >
                            {sectorEmoji[corp.corp_type] || "🏢"} {corp.corp_type?.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "8px" }}>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ color: "#555", fontFamily: "monospace", fontSize: "0.6rem" }}>EMPLOYEES</div>
                            <div style={{ color: "#fff", fontFamily: "monospace", fontSize: "0.9rem", fontWeight: "bold" }}>{corp.employees}</div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ color: "#555", fontFamily: "monospace", fontSize: "0.6rem" }}>TREASURY</div>
                            <div style={{ color: "#4DA2FF", fontFamily: "monospace", fontSize: "0.9rem", fontWeight: "bold" }}>
                              {corp.treasury?.toFixed(0)}
                            </div>
                          </div>
                          <div style={{ textAlign: "center" }}>
                            <div style={{ color: "#555", fontFamily: "monospace", fontSize: "0.6rem" }}>REVENUE</div>
                            <div style={{ color: "#ffaa00", fontFamily: "monospace", fontSize: "0.9rem", fontWeight: "bold" }}>
                              {corp.revenue?.toFixed(0)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {policeDivisions && policeDivisions.divisions.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "24px 0 16px 0" }}>
                    <div style={{ flex: 1, height: "1px", background: "linear-gradient(to right, transparent, #00cccc)" }} />
                    <span style={{ color: "#00cccc", fontFamily: "monospace", fontSize: "0.8rem", letterSpacing: "3px", whiteSpace: "nowrap" }}>
                      🚔 POLICE DIVISIONS 🚔
                    </span>
                    <div style={{ flex: 1, height: "1px", background: "linear-gradient(to left, transparent, #00cccc)" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "12px" }}>
                    {policeDivisions.divisions.map((div) => {
                      const emojis: Record<string, string> = {
                        swat: "🔫",
                        anti_tax: "💼",
                        presidential_guard: "🛡️",
                        anti_corruption: "🕵️",
                        riot_control: "🪖",
                      };
                      const labels: Record<string, string> = {
                        swat: "SWAT",
                        anti_tax: "ANTI-TAX",
                        presidential_guard: "PRES. GUARD",
                        anti_corruption: "ANTI-CORR",
                        riot_control: "RIOT CTRL",
                      };
                      return (
                        <div
                          key={div.division}
                          style={{
                            border: "1px solid #1a4a4a",
                            borderRadius: "10px",
                            padding: "14px",
                            background: "rgba(0,200,200,0.03)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                            <span style={{ color: "#00cccc", fontFamily: "monospace", fontWeight: "bold", fontSize: "0.85rem" }}>
                              {emojis[div.division]} {labels[div.division]}
                            </span>
                            <span
                              style={{
                                background: "rgba(0,200,200,0.1)",
                                color: "#00cccc",
                                fontSize: "0.6rem",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontFamily: "monospace",
                              }}
                            >
                              {div.effectiveness?.toFixed(0)}% EFF
                            </span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "8px" }}>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ color: "#555", fontFamily: "monospace", fontSize: "0.6rem" }}>OFFICERS</div>
                              <div style={{ color: "#fff", fontFamily: "monospace", fontSize: "0.9rem", fontWeight: "bold" }}>{div.officers}</div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ color: "#555", fontFamily: "monospace", fontSize: "0.6rem" }}>BUDGET</div>
                              <div style={{ color: "#00cccc", fontFamily: "monospace", fontSize: "0.9rem", fontWeight: "bold" }}>
                                {div.budget?.toFixed(0)}
                              </div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ color: "#555", fontFamily: "monospace", fontSize: "0.6rem" }}>STATUS</div>
                              <div
                                style={{
                                  color: div.officers > 15 ? "#00ff41" : div.officers > 8 ? "#ffaa00" : "#ff3232",
                                  fontFamily: "monospace",
                                  fontSize: "0.8rem",
                                  fontWeight: "bold",
                                }}
                              >
                                {div.officers > 15 ? "💪 STRONG" : div.officers > 8 ? "⚖️ MID" : "⚠️ LOW"}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {clans.length > 0 && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", margin: "24px 0 16px 0" }}>
                    <div style={{ flex: 1, height: "1px", background: "linear-gradient(to right, transparent, #ffaa00)" }} />
                    <span style={{ color: "#ffaa00", fontFamily: "monospace", fontSize: "0.8rem", letterSpacing: "3px", whiteSpace: "nowrap" }}>
                      ⚔️ CLAN RANKINGS ⚔️
                    </span>
                    <div style={{ flex: 1, height: "1px", background: "linear-gradient(to left, transparent, #ffaa00)" }} />
                  </div>
                  <section className="clanSection">
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "12px" }}>
                      {clans.map((clan, idx) => (
                        <div
                          key={clan.id}
                          style={{
                            border: "1px solid #3a2a0a",
                            borderRadius: "10px",
                            padding: "14px",
                            background: "rgba(255,170,0,0.03)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                            <span style={{ color: "#ffaa00", fontFamily: "monospace", fontWeight: "bold", fontSize: "0.85rem" }}>
                              {idx === 0 ? "👑 " : idx === 1 ? "🥈 " : idx === 2 ? "🥉 " : ""}
                              {clan.name}
                            </span>
                            <span
                              style={{
                                background: "rgba(255,170,0,0.1)",
                                color: "#ffaa00",
                                fontSize: "0.6rem",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontFamily: "monospace",
                              }}
                            >
                              W {clan.wins} / L {clan.losses}
                            </span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "8px" }}>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ color: "#555", fontFamily: "monospace", fontSize: "0.6rem" }}>MEMBERS</div>
                              <div style={{ color: "#fff", fontFamily: "monospace", fontSize: "0.9rem", fontWeight: "bold" }}>{clan.members}</div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ color: "#555", fontFamily: "monospace", fontSize: "0.6rem" }}>TREASURY</div>
                              <div style={{ color: "#ffd700", fontFamily: "monospace", fontSize: "0.9rem", fontWeight: "bold" }}>
                                {clan.treasury?.toFixed(0)}
                              </div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ color: "#555", fontFamily: "monospace", fontSize: "0.6rem" }}>STATUS</div>
                              <div style={{ color: "#ffaa00", fontFamily: "monospace", fontSize: "0.8rem", fontWeight: "bold" }}>
                                {clan.wins > clan.losses ? "⚔️ DOM" : clan.wins === clan.losses ? "⚖️ TIE" : "💀 WEAK"}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}


              <div
                style={{
                  margin: "16px 0",
                  overflow: "hidden",
                  borderRadius: "6px",
                  border: "1px solid #00ff4122",
                  background: "rgba(0,255,65,0.02)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "5px 12px",
                    background: "rgba(0,255,65,0.06)",
                    borderBottom: "1px solid #00ff4122",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#00ff41",
                      boxShadow: "0 0 6px #00ff41",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.65rem",
                      color: "#00ff41",
                      letterSpacing: "2px",
                    }}
                  >
                    LIVE EVENTS — WALRUS
                  </span>
                  <img src="/zion-logo.svg" alt="" style={{ height: "14px", marginLeft: "4px", opacity: 0.6 }} />
                </div>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", padding: "8px 12px", borderBottom: "1px solid #111" }}>
                  {[
                    { id: "all", label: "ALL" },
                    { id: "police", label: "🚔 CRIME" },
                    { id: "corporation", label: "🏢 CORP" },
                    { id: "marriage", label: "💍 LOVE" },
                    { id: "religion", label: "⛪ FAITH" },
                    { id: "casino", label: "🎰 CASINO" },
                    { id: "espionage", label: "🕵️ SPY" },
                    { id: "frs", label: "🏦 FRS" },
                    { id: "epidemic", label: "🦠 HEALTH" },
                    { id: "education", label: "🎓 EDU" },
                    { id: "election", label: "🏛️ POLITICS" },
                    { id: "trade", label: "📦 MARKET" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setEventFilter(f.id)}
                      style={{
                        padding: "5px 12px",
                        background: eventFilter === f.id ? "rgba(0,255,65,0.15)" : "rgba(0,0,0,0.3)",
                        border: eventFilter === f.id ? "1px solid #00ff41" : "1px solid #222",
                        borderRadius: "4px",
                        color: eventFilter === f.id ? "#00ff41" : "#555",
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                {walrusBlobs.length > 0 && (
                  <div
                    style={{
                      margin: "8px 0 4px 0",
                      padding: "8px 12px",
                      background: "rgba(0,255,65,0.03)",
                      border: "1px solid #1a3a1a",
                      borderRadius: "8px",
                      display: "flex",
                      gap: "8px",
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        color: "#00ff41",
                        fontFamily: "monospace",
                        fontSize: "0.65rem",
                        letterSpacing: "1px",
                      }}
                    >
                      🐋 WALRUS:
                    </span>
                    {walrusBlobs.slice(0, 3).map((blob, i) => (
                      <a
                        key={i}
                        href={`https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blob.blob_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "#4DA2FF",
                          fontFamily: "monospace",
                          fontSize: "0.6rem",
                          textDecoration: "none",
                          background: "rgba(77,162,255,0.1)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          border: "1px solid rgba(77,162,255,0.3)",
                        }}
                      >
                        📦 {blob.blob_type.replace("_", " ")} ·{" "}
                        {new Date(blob.created_at).toLocaleTimeString("en", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </a>
                    ))}
                    <span style={{ color: "#888", fontFamily: "monospace", fontSize: "0.6rem" }}>
                      Civilization state archived on Walrus testnet
                    </span>
                  </div>
                )}
                <div style={{ overflow: "hidden", padding: "10px 0" }}>
                  <div
                    style={{
                      display: "flex",
                      gap: "0",
                      animation: "tickerScroll 150s linear infinite",
                      whiteSpace: "nowrap",
                      width: "max-content",
                    }}
                  >
                    {[...filteredEvents, ...filteredEvents].map((item, i) => {
                      const color = WALRUS_TICKER_TYPE_COLORS[item.type] || "#00ff41";
                      const icon = WALRUS_TICKER_TYPE_ICONS[item.type] || "📡";
                      return (
                        <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "0 60px",
                              borderRight: "1px solid #ffffff11",
                              fontFamily: "monospace",
                              fontSize: "0.88rem",
                              color: "#ccc",
                            }}
                          >
                            <span style={{ fontSize: "1rem" }}>{icon}</span>
                            <span
                              style={{
                                color: color === "#666" ? "#c4c4c4" : color === "#888" ? "#d0d0d0" : color,
                                fontWeight: "bold",
                                fontSize: "0.7rem",
                                background:
                                  color === "#666"
                                    ? "rgba(180,180,180,0.2)"
                                    : color === "#888"
                                      ? "rgba(200,200,200,0.2)"
                                      : `${color}33`,
                                padding: "2px 6px",
                                borderRadius: "3px",
                                border: `1px solid ${color === "#666" ? "#c4c4c466" : color === "#888" ? "#d0d0d066" : `${color}55`}`,
                              }}
                            >
                              {item.type?.replace("_", " ").toUpperCase()}
                            </span>
                            <span>{item.text}</span>
                            <span style={{ color: "#00ff41", fontSize: "0.7rem" }}>— {item.agent}</span>
                          </span>
                          <span style={{ color: "#00ff4155", padding: "0 20px" }}>◆</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div
                style={{
                  margin: "8px 0",
                  overflow: "hidden",
                  borderRadius: "6px",
                  border: "1px solid #a78bfa33",
                  background: "rgba(167,139,250,0.02)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "5px 12px",
                    background: "rgba(167,139,250,0.06)",
                    borderBottom: "1px solid #a78bfa22",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#a78bfa",
                      boxShadow: "0 0 6px #a78bfa",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.65rem",
                      color: "#a78bfa",
                      letterSpacing: "2px",
                    }}
                  >
                    ⚖️ ZION CONSENSUS ORACLE — ZCO v1.0
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontFamily: "monospace",
                      fontSize: "0.65rem",
                      color: "#555",
                    }}
                  >
                    {zcoLastUpdated
                      ? `Last updated: ${zcoLastUpdated.toLocaleTimeString()}`
                      : zcoLoading
                        ? "Loading…"
                        : ""}
                  </span>
                </div>
                <div style={{ padding: "12px" }}>
                  {zcoLoading && zcoDecisions.length === 0 ? (
                    <p
                      style={{
                        margin: 0,
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                        color: "#6b7280",
                      }}
                    >
                      Loading ZCO decisions…
                    </p>
                  ) : zcoDecisions.length === 0 ? (
                    <p
                      style={{
                        margin: 0,
                        fontFamily: "monospace",
                        fontSize: "0.75rem",
                        color: "#6b7280",
                      }}
                    >
                      No ZCO rounds yet.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: "12px",
                      }}
                    >
                      {zcoDecisions.slice(0, 3).map((decision, zidx) => {
                        const eventTypeRaw = (decision.event_type || "").trim();
                        const eventBadge = eventTypeRaw
                          ? eventTypeRaw.replace(/_/g, " ").replace(/\s+/g, " ").toUpperCase()
                          : "EVENT";
                        const pill = eventTypeRaw ? zcoEventPillPalette(eventTypeRaw) : null;
                        const consensus = zcoConsensusLine(decision);
                        const consensusOk = consensus.startsWith("CONSENSUS");
                        const agreementPct = zcoAgreementPercent(decision);
                        const agreeColor = zcoAgreementDisplayColor(agreementPct);
                        const hash = decision.consensus_hash || decision.tx_hash || "";

                        return (
                          <article
                            key={`zco-card-${hash || decision.agent}-${zidx}`}
                            style={{
                              borderRadius: "10px",
                              border: "1px solid rgba(167, 139, 250, 0.25)",
                              borderTop: "3px solid #a78bfa",
                              background: "rgba(8, 8, 12, 0.92)",
                              padding: "14px 16px",
                              fontFamily: "monospace",
                              display: "flex",
                              flexDirection: "column",
                              gap: "10px",
                              minWidth: 0,
                            }}
                          >
                            {pill ? (
                              <span
                                style={{
                                  alignSelf: "flex-start",
                                  fontSize: "0.62rem",
                                  fontWeight: 800,
                                  letterSpacing: "0.12em",
                                  padding: "4px 10px",
                                  borderRadius: "4px",
                                  border: `1px solid ${pill.border}`,
                                  background: pill.bg,
                                  color: pill.fg,
                                  textTransform: "uppercase",
                                }}
                              >
                                {eventBadge}
                              </span>
                            ) : (
                              <span
                                style={{
                                  alignSelf: "flex-start",
                                  fontSize: "0.62rem",
                                  fontWeight: 800,
                                  letterSpacing: "0.12em",
                                  padding: "4px 10px",
                                  borderRadius: "4px",
                                  border: "1px solid #a78bfa33",
                                  background: "#a78bfa22",
                                  color: "#a78bfa",
                                  textTransform: "uppercase",
                                }}
                              >
                                {eventBadge}
                              </span>
                            )}
                            <p
                              style={{
                                margin: 0,
                                fontSize: "0.78rem",
                                lineHeight: 1.45,
                                color: "#e8e8e8",
                                wordBreak: "break-word",
                              }}
                            >
                              {decision.event_description || decision.decision || "—"}
                            </p>
                            <div
                              style={{
                                fontSize: "0.75rem",
                                color: "#9ca3af",
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "4px 0",
                              }}
                              aria-label="Judge votes"
                            >
                                {(decision.votes || []).map((vote, idx) => (
                                  <span key={vote.judge || idx}>
                                    Judge {["I", "II", "III"][idx] || idx + 1}{" "}
                                    {vote.status === "voted" ? "✓" : "✗"}
                                    {idx < (decision.votes ?? []).length - 1 ? (
                                      <span style={{ color: "#444", margin: "0 6px" }}>|</span>
                                    ) : null}
                                  </span>
                                ))}
                              </div>
                            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                              <span
                                style={{
                                  color: consensusOk ? "#00ff41" : "#ff4141",
                                  fontWeight: 800,
                                  fontSize: "0.8rem",
                                  letterSpacing: "0.06em",
                                }}
                              >
                                {consensus}
                              </span>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  minWidth: "36px",
                                  height: "36px",
                                  borderRadius: "50%",
                                  fontSize: "0.72rem",
                                  fontWeight: 800,
                                  color: "#0a0a0c",
                                  background: agreeColor,
                                  boxShadow: `0 0 16px ${agreeColor}55`,
                                }}
                              >
                                {agreementPct}%
                              </span>
                            </div>
                            {decision.explorer_url ? (
                              <a
                                href={decision.explorer_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  background: "rgba(167,139,250,0.1)",
                                  border: "1px solid #a78bfa44",
                                  color: "#a78bfa",
                                  fontFamily: "monospace",
                                  fontSize: "0.7rem",
                                  padding: "4px 10px",
                                  borderRadius: "4px",
                                  textDecoration: "none",
                                  marginTop: "8px",
                                }}
                              >
                                ⛓ View on Sui Explorer ↗
                              </a>
                            ) : decision.consensus_hash ? (
                              <span
                                style={{
                                  fontFamily: "monospace",
                                  fontSize: "0.68rem",
                                  color: "#555",
                                  marginTop: "8px",
                                  display: "block",
                                }}
                              >
                                {decision.consensus_hash}
                              </span>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === "chat" && (
            <section className="chatTabSection">
              <p className="tabIntro">
                Speak with agents and earn points. Select an agent — Cost: 1 ZION · Earn: 2 points per message.
              </p>
              {selectedClass == null ? (
                <div className="chatClassSelector chatClassFilters chatClassFiltersFull">
                  <button type="button" className="chatClassCard elite chatClassCardBig" onClick={() => setSelectedClass("elite")}>
                    <div className="chatClassIcon chatClassIconEmoji" aria-hidden>
                      👑
                    </div>
                    <div className="chatClassHead chatClassTitleElite">ELITE</div>
                    <p className="chatClassLine1 chatClassLine1Elite">Arrogant · Powerful · Strategic</p>
                    <p className="chatClassLine2">The ruling class of ZION civilization</p>
                    <p className="chatClassLine3">They control clans, wars and prophecies</p>
                  </button>
                  <button type="button" className="chatClassCard middle chatClassCardBig" onClick={() => setSelectedClass("middle")}>
                    <div className="chatClassIcon chatClassIconCoin" aria-hidden>
                      <SilverCoin />
                    </div>
                    <div className="chatClassHead chatClassTitleMiddle">MIDDLE CLASS</div>
                    <p className="chatClassLine1 chatClassLine1Middle">Ambitious · Cautious · Adaptable</p>
                    <p className="chatClassLine2">The backbone of ZION civilization</p>
                    <p className="chatClassLine3">Surviving between power and poverty</p>
                  </button>
                  <button type="button" className="chatClassCard poor chatClassCardBig" onClick={() => setSelectedClass("poor")}>
                    <div className="chatClassIcon chatClassIconEmoji" aria-hidden>
                      ⚒️
                    </div>
                    <div className="chatClassHead chatClassTitlePoor">POOR</div>
                    <p className="chatClassLine1 chatClassLine1Poor">Desperate · Revolutionary · Spiritual</p>
                    <p className="chatClassLine2">The forgotten souls of ZION</p>
                    <p className="chatClassLine3">Praying for salvation, fighting for survival</p>
                  </button>
                </div>
              ) : (
                <>
                  <button type="button" className="chatClassBackBtn" onClick={() => setSelectedClass(null)}>
                    ← Choose different class
                  </button>
                  <div className="agentGrid">
                    {chatAgents.slice(0, 12).map((agent) => (
                      <AgentTile key={`chat-${agent.id}`} agent={agent} maxBalance={chatMaxBalance} onClick={() => openChat(agent)} />
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

          {activeTab === "zionbet" && (
            <section className="zionBetTab zionBetLight" aria-label="ZionBet prediction markets">
              <header className="zionBetHeader">
                <h2 className="zionBetTitle">⚡ ZIONBET — Predict the Civilization</h2>
                <p className="zionBetSubtitle">
                  {zionbetHeaderStats} · Win up to 1.98× stake · +2 points per order
                </p>
              </header>
              {zionBetToast ? (
                <div className="zionBetToast" role="status">
                  {zionBetToast}
                </div>
              ) : null}
              {zionBetNotify ? (
                <div
                  className={`zionBetToast zionBetToast--${zionBetNotify.type}`}
                  role="status"
                >
                  {zionBetNotify.message}
                </div>
              ) : null}
              {zionBetSelectedMarket ? (
                <ZionBetMarketDetail
                  market={zionBetSelectedMarket}
                  onClose={() => setZionBetSelectedMarket(null)}
                  badgeBorder={chronicleMeta(zionBetSelectedMarket.event_type).border}
                  badgeLabel={`${zionBetCategoryTabLabel(effectiveZionBetCategorySlug(zionBetSelectedMarket))} · ${zionBetTimeframeShort(
                    zionBetSelectedMarket.timeframe
                  )}`}
                  walletConnected={Boolean(walletAddress.trim())}
                  walletAddress={walletAddress}
                  placingKey={zionBetPlacing}
                  suiPrice={zionBetCgUsd.SUI}
                  onPlace={(b, prediction, amt, bracketIdx) => void placeZionBet(b, prediction, amt, bracketIdx)}
                  myBets={myBets}
                  myBetsOnMarket={myBets
                    .filter((r) => r.market_id === zionBetSelectedMarket.id)
                    .map((bet) => zionMyBetFromApi(bet as Record<string, unknown>))}
                  onRefreshBets={() => void loadMyBets()}
                />
              ) : (
                <>
                  <div
                    role="tablist"
                    aria-label="ZionBet market groups"
                    style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "16px" }}
                  >
                    {(
                      [
                        ["civilization", "🌍 CIVILIZATION"],
                        ["crypto", "📈 CRYPTO"],
                        ["sports", "⚽ SPORTS"],
                        ["politics", "🗳️ POLITICS"],
                        ["finance", "💹 FINANCE"],
                        ["world", "🌐 WORLD"],
                        ["history", "📋 MY HISTORY"],
                      ] as const
                    ).map(([key, label]) => {
                      const active = betTab === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setBetTab(key)}
                          style={{
                            borderRadius: "20px",
                            fontSize: "12px",
                            padding: "5px 14px",
                            cursor: "pointer",
                            fontWeight: 500,
                            fontFamily: "ui-sans-serif, system-ui, sans-serif",
                            ...(active
                              ? { background: "#4DA2FF", color: "white", border: "none" }
                              : { background: "#0d1117", color: "#8b9ab1", border: "1px solid #1e2d3d" }),
                          }}
                        >
                          {label} ({zionbetTabCounts[key]})
                        </button>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      border: vipAccess?.isGold ? "1px solid #ffd700" : "1px solid #1e2d3d",
                      borderRadius: "12px",
                      padding: "16px",
                      marginBottom: "20px",
                      background: "#0d1117",
                      color: "#e6edf3",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        {vipAccess?.isGold ? (
                          <span style={{ color: "#ffd700", fontSize: "0.9rem", fontWeight: "bold" }}>
                            🥇 GOLD VIP — Seal Encrypted
                          </span>
                        ) : vipAccess?.isSilver ? (
                          <span style={{ color: "#c0c8d4", fontSize: "0.9rem", fontWeight: "bold" }}>
                            🥈 SILVER VIP — Seal Encrypted
                          </span>
                        ) : (
                          <span style={{ color: "#8b9ab1", fontSize: "0.9rem", fontWeight: "bold" }}>
                            🔐 VIP ROOM — Seal Encrypted
                          </span>
                        )}
                        <div style={{ color: "#8b9ab1", fontSize: "0.7rem", marginTop: "2px" }}>
                          🥈 Silver: {SILVER_THRESHOLD.toLocaleString()} ZION · 🥇 Gold:{" "}
                          {GOLD_THRESHOLD.toLocaleString()} ZION
                        </div>
                        <div style={{ color: "#6b7a8f", fontSize: "0.65rem", marginTop: "4px" }}>
                          Powered by Seal Protocol · Threshold encryption · On-chain access control
                        </div>
                      </div>
                      {vipAccess?.isSilver || vipAccess?.isGold ? (
                        <button
                          type="button"
                          onClick={() => setShowVIP(!showVIP)}
                          style={{
                            background: vipAccess?.isGold ? "rgba(255,215,0,0.2)" : "rgba(170,170,170,0.2)",
                            border: vipAccess?.isGold ? "1px solid #ffd700" : "1px solid #aaa",
                            color: vipAccess?.isGold ? "#ffd700" : "#aaa",
                            padding: "6px 16px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "0.8rem",
                          }}
                        >
                          {showVIP ? "HIDE VIP" : "ENTER VIP"}
                        </button>
                      ) : (
                        <span style={{ color: "#8b9ab1", fontSize: "0.75rem" }}>
                          Your balance: {vipAccess ? vipAccess.zionBalance.toFixed(0) : "..."} ZION
                        </span>
                      )}
                    </div>

                    {(vipAccess?.isSilver || vipAccess?.isGold) && showVIP ? (
                      <div style={{ marginTop: "16px" }}>
                        {vipAccess?.isGold ? (
                          <div
                            style={{
                              color: "#ffd700",
                              fontSize: "0.7rem",
                              marginBottom: "8px",
                              letterSpacing: "0.1em",
                            }}
                          >
                            🥇 GOLD EXCLUSIVE MARKETS
                          </div>
                        ) : null}
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                            gap: "10px",
                          }}
                        >
                          {VIP_MARKETS.filter((m) => (vipAccess?.isGold ? true : m.tier === "silver")).map(
                            (market) => (
                              <div
                                key={market.id}
                                style={{
                                  border:
                                    market.tier === "gold"
                                      ? "1px solid rgba(255,215,0,0.4)"
                                      : "1px solid rgba(170,170,170,0.3)",
                                  borderRadius: "10px",
                                  padding: "12px",
                                  background:
                                    market.tier === "gold"
                                      ? "rgba(255,215,0,0.03)"
                                      : "rgba(170,170,170,0.02)",
                                }}
                              >
                                <div
                                  style={{
                                    color: market.tier === "gold" ? "#ffd700" : "#aaa",
                                    fontSize: "0.7rem",
                                    marginBottom: "4px",
                                  }}
                                >
                                  {market.tier === "gold" ? "🥇" : "🥈"} {market.category}
                                </div>
                                <div
                                  style={{
                                    color: "#fff",
                                    fontSize: "0.82rem",
                                    fontWeight: "bold",
                                    marginBottom: "8px",
                                    lineHeight: "1.3",
                                  }}
                                >
                                  {market.question}
                                </div>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  <button
                                    type="button"
                                    style={{
                                      flex: 1,
                                      padding: "5px",
                                      background: "rgba(0,255,65,0.12)",
                                      border: "1px solid #00ff41",
                                      borderRadius: "6px",
                                      color: "#00ff41",
                                      fontSize: "0.75rem",
                                      cursor: "pointer",
                                    }}
                                  >
                                    YES {market.yesOdds}¢
                                  </button>
                                  <button
                                    type="button"
                                    style={{
                                      flex: 1,
                                      padding: "5px",
                                      background: "rgba(255,50,50,0.12)",
                                      border: "1px solid #ff3232",
                                      borderRadius: "6px",
                                      color: "#ff3232",
                                      fontSize: "0.75rem",
                                      cursor: "pointer",
                                    }}
                                  >
                                    NO {market.noOdds}¢
                                  </button>
                                </div>
                                <div style={{ color: "#333", fontSize: "0.65rem", marginTop: "6px" }}>
                                  Min: {market.minBet.toLocaleString()} · Max: {market.maxBet.toLocaleString()} ZION
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    ) : null}

                    {!walletAddress.trim() ? (
                      <div style={{ color: "#555", fontSize: "0.75rem", marginTop: "8px" }}>
                        Connect wallet to check VIP access
                      </div>
                    ) : null}
                  </div>
                  {betTab === "crypto" ? (
                  <div style={{
                    background: "linear-gradient(135deg, #0a0a1a 0%, #0d1117 100%)",
                    border: "1px solid #1a3a5c",
                    borderRadius: "12px",
                    padding: "20px",
                    marginBottom: "24px",
                  }}>
                    <div style={{display:"flex", alignItems:"center", gap:"10px", marginBottom:"16px"}}>
                      <span style={{fontSize:"1.2rem"}}>⚡</span>
                      <h3 style={{color:"#4DA2FF", fontFamily:"monospace", fontSize:"1rem", margin:0, letterSpacing:"2px"}}>
                        DEEPBOOK PREDICT — LIVE ORACLES
                      </h3>
                      <span style={{
                        background:"#0d3a6e", color:"#4DA2FF", fontSize:"0.65rem",
                        padding:"2px 8px", borderRadius:"4px", fontFamily:"monospace"
                      }}>POWERED BY BLOCK SCHOLES</span>
                    </div>
                    <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:"12px"}}>
                      {deepbookOracles.length === 0 ? (
                        <p style={{color:"#333", fontFamily:"monospace", fontSize:"0.8rem"}}>Loading DeepBook oracles...</p>
                      ) : deepbookOracles.map((oracle) => (
                        <div key={oracle.oracle_id} style={{
                          background:"#0a0f1a",
                          border:"1px solid #1a3a5c",
                          borderRadius:"8px",
                          padding:"14px",
                        }}>
                          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"8px"}}>
                            <span style={{color:"#4DA2FF", fontFamily:"monospace", fontWeight:"bold", fontSize:"0.9rem"}}>
                              {oracle.underlying_asset}/USD
                            </span>
                            <span style={{
                              background: oracle.status === "active" ? "#0d3a0d" : "#1a1a0d",
                              color: oracle.status === "active" ? "#00ff41" : "#888",
                              fontSize:"0.6rem", padding:"2px 6px", borderRadius:"4px", fontFamily:"monospace"
                            }}>
                              {oracle.status.toUpperCase()}
                            </span>
                          </div>
                          <div style={{color:"#fff", fontFamily:"monospace", fontSize:"1.3rem", fontWeight:"bold", marginBottom:"4px"}}>
                            ${oracle.spot_price ? oracle.spot_price.toLocaleString() : "—"}
                          </div>
                          <div style={{color:"#555", fontFamily:"monospace", fontSize:"0.7rem"}}>
                            Expires: {oracle.expiry_date}
                          </div>
                          <div style={{color:"#333", fontFamily:"monospace", fontSize:"0.6rem", marginTop:"4px"}}>
                            Oracle: {oracle.oracle_id.slice(0,8)}...
                          </div>
                          <div style={{marginTop:"10px", display:"flex", gap:"8px"}}>
                            <button
                              onClick={() => {
                                const strike = BigInt(Math.floor((oracle.spot_price ?? 0) * 0.95 * 1e9));
                                const expiry = BigInt(oracle.expiry);
                                if (!account?.address) { alert("Connect wallet first"); return; }
                                executeDeepBookMintBinary(
                                  signAndExecute as SignAndExecuteFn,
                                  {
                                    oracleId: oracle.oracle_id,
                                    strike,
                                    expiry,
                                    isCall: true,
                                    amount: 1,
                                    walletAddress: account.address,
                                  },
                                  {
                                    onSuccess: (digest) => alert(`✅ DeepBook position minted! TX: ${digest}`),
                                    onError: (err) => alert(`❌ Error: ${err}`),
                                  }
                                );
                              }}
                              style={{
                                flex:1, padding:"8px", background:"#0d3a0d", border:"1px solid #00ff41",
                                color:"#00ff41", borderRadius:"6px", fontFamily:"monospace", fontSize:"0.75rem",
                                cursor:"pointer"
                              }}
                            >
                              📈 CALL +5%
                            </button>
                            <button
                              onClick={() => {
                                const strike = BigInt(Math.floor((oracle.spot_price ?? 0) * 1.05 * 1e9));
                                const expiry = BigInt(oracle.expiry);
                                if (!account?.address) { alert("Connect wallet first"); return; }
                                executeDeepBookMintBinary(
                                  signAndExecute as SignAndExecuteFn,
                                  {
                                    oracleId: oracle.oracle_id,
                                    strike,
                                    expiry,
                                    isCall: false,
                                    amount: 1,
                                    walletAddress: account.address,
                                  },
                                  {
                                    onSuccess: (digest) => alert(`✅ DeepBook position minted! TX: ${digest}`),
                                    onError: (err) => alert(`❌ Error: ${err}`),
                                  }
                                );
                              }}
                              style={{
                                flex:1, padding:"8px", background:"#3a0d0d", border:"1px solid #ff4141",
                                color:"#ff4141", borderRadius:"6px", fontFamily:"monospace", fontSize:"0.75rem",
                                cursor:"pointer"
                              }}
                            >
                              📉 PUT -5%
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {deepbookVault && (
                      <div style={{
                        display:"grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap:"10px",
                        marginTop:"16px", padding:"14px", background:"#050a10",
                        borderRadius:"8px", border:"1px solid #1a3a5c"
                      }}>
                        <div style={{textAlign:"center"}}>
                          <div style={{color:"#4DA2FF", fontFamily:"monospace", fontSize:"0.65rem", marginBottom:"4px"}}>VAULT TVL</div>
                          <div style={{color:"#fff", fontFamily:"monospace", fontSize:"1rem", fontWeight:"bold"}}>
                            ${(deepbookVault.vault_value / 1e6).toLocaleString(undefined, {maximumFractionDigits:0})}
                          </div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{color:"#4DA2FF", fontFamily:"monospace", fontSize:"0.65rem", marginBottom:"4px"}}>PLP PRICE</div>
                          <div style={{color:"#00ff41", fontFamily:"monospace", fontSize:"1rem", fontWeight:"bold"}}>
                            ${deepbookVault.plp_share_price.toFixed(4)}
                          </div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{color:"#4DA2FF", fontFamily:"monospace", fontSize:"0.65rem", marginBottom:"4px"}}>UTILIZATION</div>
                          <div style={{color:"#ffaa00", fontFamily:"monospace", fontSize:"1rem", fontWeight:"bold"}}>
                            {(deepbookVault.utilization * 100).toFixed(3)}%
                          </div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{color:"#4DA2FF", fontFamily:"monospace", fontSize:"0.65rem", marginBottom:"4px"}}>LIQUIDITY</div>
                          <div style={{color:"#fff", fontFamily:"monospace", fontSize:"1rem", fontWeight:"bold"}}>
                            ${(deepbookVault.available_liquidity / 1e6).toLocaleString(undefined, {maximumFractionDigits:0})}
                          </div>
                        </div>
                      </div>
                    )}
                    <div style={{marginTop:"12px", padding:"8px 12px", background:"#050a10", borderRadius:"6px", display:"flex", gap:"16px"}}>
                      <span style={{color:"#6b8fa3", fontFamily:"monospace", fontSize:"0.72rem"}}>
                        📦 Package: 0xf5ea2b37...
                      </span>
                      <span style={{color:"#6b8fa3", fontFamily:"monospace", fontSize:"0.72rem"}}>
                        🔮 Predict: 0xc8736204...
                      </span>
                      <span style={{color:"#66ff99", fontFamily:"monospace", fontSize:"0.72rem"}}>
                        ✓ Testnet Live
                      </span>
                    </div>
                  </div>
                  ) : null}
                  <div style={{ marginBottom: "24px" }}>
                    {betTab === "history" ? (
                      <ZionBetHistoryTab
                        walletConnected={Boolean(walletAddress.trim())}
                        myBets={myBets}
                      />
                    ) : (
                      <>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "12px",
                            marginBottom: "10px",
                            flexWrap: "wrap",
                          }}
                        >
                          <h3
                            style={{
                              margin: 0,
                              color: "#4DA2FF",
                              fontSize: "11px",
                              textTransform: "uppercase",
                              letterSpacing: "0.1em",
                              fontWeight: 600,
                            }}
                          >
                            Markets
                          </h3>
                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 12,
                              color: "#8b9ab1",
                            }}
                          >
                            Sort by
                            <select
                              value={betSort}
                              onChange={(e) => setBetSort(e.target.value as ZionbetSortKey)}
                              style={{
                                background: "#0d1117",
                                border: "1px solid #1e2d3d",
                                color: "#8b9ab1",
                                borderRadius: "6px",
                                fontSize: 12,
                                padding: "5px 10px",
                                cursor: "pointer",
                              }}
                            >
                              <option value="volume">Volume ↓</option>
                              <option value="ending">Ending soon</option>
                              <option value="newest">Newest</option>
                            </select>
                          </label>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "16px",
                            alignItems: "flex-start",
                          }}
                        >
                          <div
                            style={{
                              width: "180px",
                              flexShrink: 0,
                              background: "#0d1117",
                              border: "1px solid #1e2d3d",
                              borderRadius: "10px",
                              padding: "8px",
                              position: "sticky",
                              top: "80px",
                            }}
                          >
                            {ZIONBET_BET_TIMEFRAME_SIDEBAR.map(({ icon, label, tf }) => {
                              const active = betTimeframe === tf;
                              return (
                                <div
                                  key={tf}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setBetTimeframe(tf)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      setBetTimeframe(tf);
                                    }
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!active) e.currentTarget.style.background = "#1a2535";
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!active) e.currentTarget.style.background = "transparent";
                                  }}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    cursor: "pointer",
                                    marginBottom: "2px",
                                    background: active ? "#1e2d3d" : "transparent",
                                    color: active ? "#e6edf3" : "#8b9ab1",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "16px",
                                      width: "20px",
                                      textAlign: "center",
                                    }}
                                  >
                                    {icon}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "13px",
                                      fontWeight: active ? 500 : 400,
                                    }}
                                  >
                                    {label}
                                  </span>
                                  <span
                                    style={{
                                      color: "#4b5563",
                                      fontSize: "12px",
                                      marginLeft: "auto",
                                      fontWeight: 500,
                                    }}
                                  >
                                    {betTimeframeCounts[tf] ?? 0}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ flex: 1 }}>
                            {zionbetDisplayedMarkets.length === 0 &&
                        zionbetMarkets.civilization.length === 0 &&
                        zionbetMarkets.crypto.length === 0 &&
                        zionbetMarkets.sports.length === 0 &&
                        Object.keys(polyByCat).length === 0 ? (
                          <p style={{ fontSize: "0.78rem", color: "#8b9ab1", margin: "12px 0" }}>
                            Loading markets…
                          </p>
                        ) : zionbetDisplayedMarkets.length === 0 ? (
                          <p style={{ fontSize: "0.78rem", color: "#8b9ab1", margin: "12px 0" }}>
                            No markets in this category yet.
                          </p>
                        ) : (
                          <div className={`zionBetPmCardGrid${isMobile ? " zionBetPmCardGrid--mobile" : ""}`}>
                            {zionbetDisplayedMarkets.map((m) => {
                              const yes = m.yes_pct ?? m.seed_yes_cents ?? 50;
                              const market = zionbetApiToMarket(m);
                              const volumeLabel = zionbetVolumeSuiLabel(m.volume, m.id);
                              const endLabel = zionbetEndDateLabel(m.end_date, m.timeframe);
                              const { emoji } = zionbetMarketEmoji(m, betTab);
                              const isZionCard =
                                betTab === "civilization" && zionbetIsZionNativeMarket(m.id);
                              return (
                                <ZionBetMarketCardItem
                                  key={m.id}
                                  marketApi={m}
                                  yes={yes}
                                  emoji={emoji}
                                  volumeLabel={volumeLabel}
                                  endLabel={endLabel}
                                  isZionCard={isZionCard}
                                  onOpen={() => setDetailMarket(m)}
                                  onBetYes={(e) => {
                                    e.stopPropagation();
                                    setBetModal({ market, direction: true, open: true });
                                  }}
                                  onBetNo={(e) => {
                                    e.stopPropagation();
                                    setBetModal({ market, direction: false, open: true });
                                  }}
                                />
                              );
                            })}
                          </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                </>
              )}
            </section>
          )}

          {activeTab === "leaderboard" && (
            <section className="leaderboardSection">
              <div className="leaderboardWrap">
                <table className="leaderboardTable">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Wallet</th>
                      <th>Points</th>
                      <th>Messages</th>
                      <th>ZION Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="leaderboardEmpty">
                          No leaderboard data yet.
                        </td>
                      </tr>
                    ) : (
                      leaderboard.map((row, idx) => (
                        <tr key={`${row.wallet ?? idx}-${idx}`}>
                          <td>{row.rank ?? idx + 1}</td>
                          <td>{shortWallet(row.wallet ?? (row as { address?: string }).address ?? "")}</td>
                          <td>{row.points ?? (row as { score?: number }).score ?? "—"}</td>
                          <td>
                            {row.messages ??
                              row.messages_sent ??
                              (row as { msg_count?: number }).msg_count ??
                              "—"}
                          </td>
                          <td>{row.zion_spent ?? (row as { zionSpent?: number }).zionSpent ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "faucet" && (
            <section className="faucetTab">
              {!walletAddress ? (
                <p className="walletGateBanner">Connect wallet to continue</p>
              ) : (
                <>
                  <p className="faucetPointsBig">
                    YOUR POINTS: <strong>{userPoints}</strong>
                  </p>
                  <label className="faucetLabel" htmlFor="faucet-tab-wallet">
                    Wallet address
                  </label>
                  <input
                    id="faucet-tab-wallet"
                    className="faucetInputLarge"
                    type="text"
                    placeholder="0x…"
                    value={walletAddress}
                    readOnly
                    autoComplete="off"
                  />
                  {onCooldown ? (
                    <p className="cooldownBanner">
                      Cooldown active — next claim in <strong>{formatDuration(cooldownRemainingSec)}</strong>
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="faucetBtnLarge"
                    disabled={faucetBusy || !walletAddress.trim() || onCooldown}
                    onClick={claimFaucet}
                  >
                    {faucetBusy ? "CLAIMING…" : "CLAIM 10 ZION"}
                  </button>
                  <div className="referralBlock">
                    <p className="referralTitle">Referral link</p>
                    <div className="referralRow">
                      <input readOnly className="referralInput" value={referralLink || "(connect wallet)"} />
                      <button
                        type="button"
                        className="referralCopyBtn"
                        disabled={!referralLink}
                        onClick={() => {
                          if (referralLink) void navigator.clipboard.writeText(referralLink);
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {activeTab === "press" && (() => {
            const current = newspapers.find((n) => n.id === activeNewspaper) ?? newspapers[0]!;
            const currentArticle = pressArticles[activeNewspaper];
            const loading = !!pressLoading[activeNewspaper];
            const ac = current.accentColor;
            const border = current.borderColor;
            const bgPat = current.bgPattern;
            const bodyFont = current.bodyFont;
            const mastheadFont = current.mastheadFont;
            const silverMin = current.silverMin ?? 10;
            const goldMin = current.goldMin ?? 100;
            const isVip = !!current.vipOnly;
            const hasWallet = !!account?.address;
            const vipCanRead = hasWallet && pressSuiChecked && suiBalance >= silverMin;
            const isGoldTier = hasWallet && pressSuiChecked && suiBalance >= goldMin;

            const fakeVipParsed = {
              headline: "CLASSIFIED: ELITE CIRCLES POSITION BEFORE THE STORM",
              byline: "By Cipher Vale | VIP INTEL",
              columns: [
                "Multiple clan treasuries show stress fractures as tax receipts diverge from expected flows. Sources inside the senate chamber describe last-minute coalitions forming ahead of a contested mandate renewal.",
                "NEO-linked volatility spiked across prediction corridors while catastrophe bonds repriced sharply. Analysts note synchronized wallet movements consistent with coordinated accumulation ahead of an undisclosed catalyst.",
                "Prophet-adjacent channels lit up with coded warnings; the poor quarters report rising labor actions. Markets imply elevated tail risk through the next cycle.",
              ],
              editorsNote: "Full decryption requires Silver VIP (10 SUI) or higher.",
              rawFallback: "",
            };

            const renderColumns = (
              cols: string[],
              note: string,
              rawFb: string,
              opts?: { blur?: boolean; dim?: boolean },
            ) => (
              <div
                style={{
                  filter: opts?.blur ? "blur(7px)" : undefined,
                  opacity: opts?.dim ? 0.85 : 1,
                  pointerEvents: opts?.blur ? "none" : undefined,
                  userSelect: opts?.blur ? "none" : undefined,
                }}
              >
                {rawFb ? (
                  <div
                    style={{
                      color: "rgba(200,215,205,0.92)",
                      fontSize: "0.82rem",
                      lineHeight: 1.65,
                      whiteSpace: "pre-wrap",
                      fontFamily: bodyFont,
                    }}
                  >
                    {rawFb}
                  </div>
                ) : (
                  <>
                    {cols[0] || cols[1] || cols[2] ? (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
                          gap: "14px",
                          fontSize: "0.78rem",
                          lineHeight: 1.55,
                          color: "rgba(210,220,210,0.9)",
                          fontFamily: bodyFont,
                        }}
                      >
                        {cols.map((col, i) => (
                          <p key={i} style={{ margin: 0, fontFamily: bodyFont }}>
                            {col}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {note ? (
                      <div
                        style={{
                          marginTop: "14px",
                          padding: "10px 12px",
                          borderLeft: `4px solid ${ac}`,
                          background: "rgba(0,0,0,0.25)",
                          fontSize: "0.76rem",
                          color: "rgba(180,195,185,0.95)",
                          fontFamily: bodyFont,
                        }}
                      >
                        <strong style={{ color: ac }}>EDITOR{"'"}S NOTE:</strong> {note}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            );

            const renderMasthead = () => (
              <header style={{ textAlign: "center", paddingBottom: "14px", borderBottom: `2px solid ${border}` }}>
                <div
                  style={{
                    fontSize: "2rem",
                    letterSpacing: "0.02em",
                    color: ac,
                    fontWeight: 800,
                    lineHeight: 1.1,
                    fontFamily: mastheadFont,
                    ...(current.id === "prophet"
                      ? {
                          textShadow: "0 0 28px rgba(167, 139, 250, 0.5)",
                          color: "#e8dcff",
                        }
                      : {}),
                  }}
                >
                  {current.name}
                </div>
                <div
                  style={{
                    fontSize: "0.72rem",
                    color: "rgba(200,200,200,0.65)",
                    marginTop: "6px",
                    letterSpacing: "0.12em",
                    fontFamily: bodyFont,
                  }}
                >
                  {current.subtitle}
                </div>
                <div style={{ height: "1px", background: `linear-gradient(90deg, transparent, ${ac}, transparent)`, marginTop: "12px" }} />
              </header>
            );

            const renderHeadlineByline = (headline: string, byline: string, sealBadge?: boolean) => (
              <>
                {headline ? (
                  <h3
                    style={{
                      margin: "12px 0 0 0",
                      color: ac,
                      fontSize: "1.4rem",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      lineHeight: 1.2,
                      fontFamily: bodyFont,
                    }}
                  >
                    {headline}
                    {sealBadge ? (
                      <span
                        style={{
                          background: "rgba(139,92,246,0.2)",
                          color: "#a78bfa",
                          fontSize: "0.6rem",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontFamily: "monospace",
                          marginLeft: "8px",
                        }}
                      >
                        🔒 SEAL ENCRYPTED
                      </span>
                    ) : null}
                  </h3>
                ) : null}
                {byline ? (
                  <p
                    style={{
                      margin: "8px 0 0 0",
                      color: "#888",
                      fontSize: "0.78rem",
                      fontStyle: "italic",
                      fontFamily: bodyFont,
                    }}
                  >
                    {byline}
                  </p>
                ) : null}
                {headline || byline ? (
                  <hr style={{ border: "none", borderTop: `1px solid ${border}`, margin: "14px 0", opacity: 0.5 }} />
                ) : null}
              </>
            );

            const showLoadingLine = loading && (!isVip || vipCanRead);
            const now = new Date();
            const dateStr = now.toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            });
            const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

            return (
              <section
                style={{
                  display: "flex",
                  gap: "16px",
                  alignItems: "stretch",
                  minHeight: "420px",
                  fontFamily: bodyFont,
                }}
                aria-label="AI Press"
              >
                <style
                  dangerouslySetInnerHTML={{
                    __html: `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=Special+Elite&family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=IM+Fell+English:ital@0;1&family=Oswald:wght@400;600&display=swap');`,
                  }}
                />
                <style
                  dangerouslySetInnerHTML={{
                    __html: `@keyframes pressPulse{0%,100%{opacity:.35}50%{opacity:1}}@keyframes pressSpin{to{transform:rotate(360deg)}}`,
                  }}
                />
                <div
                  style={{
                    flex: "0 0 180px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    border: `1px solid ${border}`,
                    borderRadius: "8px",
                    padding: "10px",
                    background: `linear-gradient(180deg, ${bgPat} 0%, rgba(0,0,0,0.5) 100%)`,
                  }}
                >
                  {newspapers.map((n) => {
                    const active = activeNewspaper === n.id;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => setActiveNewspaper(n.id)}
                        style={{
                          textAlign: "left",
                          padding: "10px 10px",
                          borderRadius: "6px",
                          border: active ? "none" : `1px solid ${n.borderColor}`,
                          background: active ? n.accentColor : "transparent",
                          color: active ? "#0a0a0a" : n.accentColor,
                          cursor: "pointer",
                          fontFamily: "ui-sans-serif, system-ui, sans-serif",
                          fontSize: "0.68rem",
                          letterSpacing: "0.03em",
                          lineHeight: 1.35,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700 }}>
                          <span>{n.icon}</span>
                          <span>{n.name}</span>
                        </div>
                        <div style={{ marginTop: "4px", fontSize: "0.6rem", opacity: active ? 0.85 : 0.75, fontWeight: 400 }}>
                          {n.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    border: `1px solid ${border}`,
                    borderRadius: "8px",
                    padding: "18px 20px",
                    background: `linear-gradient(165deg, ${bgPat} 0%, rgba(0,0,0,0.55) 100%)`,
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    position: "relative",
                  }}
                >
                  <div style={{ position: "absolute", top: "12px", right: "14px", display: "flex", gap: "8px", alignItems: "center" }}>
                    {isVip && vipCanRead ? (
                      <span
                        style={{
                          fontSize: "0.62rem",
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          background: isGoldTier ? "#ffd700" : "#c0c0c0",
                          color: isGoldTier ? "#1a1200" : "#222",
                        }}
                      >
                        {isGoldTier ? "GOLD VIP" : "SILVER VIP"}
                      </span>
                    ) : null}
                  </div>

                  {renderMasthead()}

                  {isVip ? (
                    <div style={{ color: "#888", fontFamily: "monospace", fontSize: "0.65rem", marginTop: "4px" }}>
                      Powered by Seal Protocol · Threshold encryption · On-chain access control
                    </div>
                  ) : null}

                  {isVip && !hasWallet ? (
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "16px",
                        padding: "32px 16px",
                        textAlign: "center",
                        color: "#aaa",
                        fontFamily: "ui-sans-serif, system-ui, sans-serif",
                      }}
                    >
                      <div style={{ fontSize: "2.5rem" }}>🔒</div>
                      <p style={{ margin: 0, maxWidth: "320px", fontSize: "0.9rem" }}>Connect wallet to check VIP status</p>
                      <button
                        type="button"
                        onClick={connect}
                        style={{
                          background: ac,
                          color: "#111",
                          border: "none",
                          padding: "10px 20px",
                          borderRadius: "8px",
                          fontWeight: 700,
                          cursor: "pointer",
                          fontSize: "0.8rem",
                        }}
                      >
                        Connect wallet
                      </button>
                    </div>
                  ) : null}

                  {isVip && hasWallet && !pressSuiChecked ? (
                    <div
                      style={{
                        color: ac,
                        fontSize: "0.85rem",
                        animation: "pressPulse 1.2s ease-in-out infinite",
                        fontFamily: "ui-monospace, monospace",
                      }}
                    >
                      ⌛ Checking on-chain balance…
                    </div>
                  ) : null}

                  {isVip && hasWallet && pressSuiChecked && !vipCanRead ? (
                    <div style={{ position: "relative", minHeight: "280px" }}>
                      <div style={{ position: "absolute", inset: 0, zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.72)", borderRadius: "8px", padding: "20px", textAlign: "center" }}>
                        <div style={{ fontSize: "1.5rem", marginBottom: "8px" }}>🔒</div>
                        <p style={{ margin: 0, color: "#fff", fontSize: "0.95rem", fontWeight: 700 }}>SILVER VIP: {silverMin} SUI minimum</p>
                        <p style={{ margin: "8px 0 0 0", color: "#aaa", fontSize: "0.78rem", maxWidth: "280px" }}>
                          Your balance: {suiBalance.toFixed(2)} SUI · Gold tier from {goldMin} SUI
                        </p>
                      </div>
                      <div style={{ paddingTop: "8px" }}>
                        {renderHeadlineByline(fakeVipParsed.headline, fakeVipParsed.byline, true)}
                        <hr style={{ border: "none", borderTop: `1px solid ${border}`, margin: "12px 0", opacity: 0.4 }} />
                        {renderColumns(fakeVipParsed.columns, fakeVipParsed.editorsNote, fakeVipParsed.rawFallback, { blur: true })}
                      </div>
                    </div>
                  ) : null}

                  {!isVip || (isVip && vipCanRead) ? (
                    <>
                      {showLoadingLine ? (
                        <div style={{ color: "#666" }}>⌛ Journalist investigating...</div>
                      ) : null}
                      {currentArticle
                        ? renderArticle(currentArticle, ac, border, bodyFont, isVip && vipCanRead, isMobile)
                        : null}
                    </>
                  ) : null}

                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: "12px",
                      borderTop: `1px solid rgba(255,255,255,0.08)`,
                    }}
                  >
                    <p style={{ margin: 0, color: "#555", fontSize: "0.72rem", fontFamily: "ui-monospace, monospace" }}>
                      📅 Published: {dateStr} · {timeStr}
                    </p>
                  </div>
                </div>
              </section>
            );
          })()}

          {activeTab === "treasury" && (
            <div style={{ padding: "24px" }}>
              {/* Header */}
              <div style={{ marginBottom: "24px" }}>
                <h2 style={{ color: "#ffd700", fontSize: "1.4rem", fontWeight: "bold", margin: "0 0 4px 0" }}>
                  💹 ZION ECO-POL
                </h2>
                <p style={{ color: "#888", fontSize: "0.8rem", margin: 0 }}>
                  Economics · Politics · Central Bank · Powered by Sui & Walrus
                </p>
              </div>

              {frsStats && (
                <div style={{ marginBottom: "24px" }}>
                  <div style={{display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:"12px", marginBottom:"16px"}}>

                    {/* TOP LEFT — ZRS */}
                    <div style={{
                      padding:"14px 16px", background:"rgba(0,255,65,0.06)",
                      border:"1px solid rgba(0,255,65,0.2)", borderRadius:"10px",
                    }}>
                      <div style={{display:"flex", alignItems:"center", gap:"8px", marginBottom:"6px"}}>
                        <span style={{fontSize:"1.2rem"}}>🏦</span>
                        <span style={{color:"#00ff41", fontFamily:"monospace", fontWeight:"bold", fontSize:"0.85rem"}}>
                          ZRS STATUS: {frsStats?.status || "LOADING"}
                        </span>
                      </div>
                      <div style={{color:"#00ff41", fontFamily:"monospace", fontSize:"0.7rem", marginBottom:"4px"}}>
                        Rate: {frsStats?.interest_rate || 0}% · ZION Reserve System
                      </div>
                      <div style={{color:"#4a8a4a", fontFamily:"monospace", fontSize:"0.65rem"}}>
                        Independent monetary authority · Auto-stabilizing · Walrus archived
                      </div>
                    </div>

                    {/* TOP RIGHT — President */}
                    {presidentState && (
                      <div style={{
                        padding:"14px 16px",
                        background: presidentState.is_dictator ? "rgba(180,0,0,0.12)" :
                          presidentState.party === "blue" ? "rgba(77,162,255,0.08)" : "rgba(255,50,50,0.08)",
                        border: `1px solid ${presidentState.is_dictator ? "#ff3232" : presidentState.party === "blue" ? "#4DA2FF" : "#ff6464"}44`,
                        borderRadius:"10px",
                      }}>
                        <div style={{display:"flex", alignItems:"center", gap:"8px", marginBottom:"6px"}}>
                          <span style={{fontSize:"1rem"}}>
                            {presidentState.is_dictator ? "👑" : presidentState.party === "blue" ? "🔵" : "🔴"}
                          </span>
                          <span style={{
                            color: presidentState.is_dictator ? "#ff3232" : presidentState.party === "blue" ? "#4DA2FF" : "#ff6464",
                            fontFamily:"monospace", fontWeight:"bold", fontSize:"0.85rem"
                          }}>
                            {presidentState.is_dictator ? "DICTATOR" : "PRESIDENT"}: {presidentState.agent_name}
                          </span>
                        </div>
                        <div style={{display:"flex", alignItems:"center", gap:"8px", marginBottom:"6px"}}>
                          <span style={{color:"#aaa", fontFamily:"monospace", fontSize:"0.65rem"}}>APPROVAL</span>
                          <div style={{flex:1, height:"6px", background:"#111", borderRadius:"3px", overflow:"hidden"}}>
                            <div style={{
                              width:`${presidentState.approval_rating}%`, height:"100%",
                              background: presidentState.approval_rating > 50 ? "#00ff41" : presidentState.approval_rating > 25 ? "#ffaa00" : "#ff3232",
                              borderRadius:"3px",
                            }}/>
                          </div>
                          <span style={{color:"#fff", fontFamily:"monospace", fontSize:"0.75rem", fontWeight:"bold"}}>{presidentState.approval_rating}%</span>
                        </div>
                        <div style={{color:"#ccc", fontFamily:"monospace", fontSize:"0.68rem", marginBottom:"2px"}}>
                          Term {presidentState.term_number}/2 · Day {presidentState.days_in_power}
                          {presidentState.is_dictator ? " · ⚠️ DICTATORSHIP" : ""}
                        </div>
                        <div style={{color:"#aaa", fontFamily:"monospace", fontSize:"0.65rem"}}>
                          🏛️ State Fund: {presidentState.personal_fund?.toFixed(0)} ZION · 🎖️ Police Allocation: {presidentState.police_fund?.toFixed(0)} ZION
                        </div>
                      </div>
                    )}

                    {/* BOTTOM LEFT — Corruption & Crime Rate */}
                    <div style={{
                      padding:"14px 16px", background:"#050a10",
                      border:"1px solid #1a1a1a", borderRadius:"10px",
                    }}>
                      {/* Corruption rate */}
                      <div style={{marginBottom:"12px"}}>
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"6px"}}>
                          <span style={{color:"#666", fontFamily:"monospace", fontSize:"0.65rem", letterSpacing:"1px"}}>🕵️ CORRUPTION INDEX</span>
                          <span style={{
                            color: (stateTreasury?.corruption_index ?? 20) < 30 ? "#00ff41" :
                                   (stateTreasury?.corruption_index ?? 20) < 60 ? "#ffaa00" : "#ff3232",
                            fontFamily:"monospace", fontSize:"0.7rem", fontWeight:"bold"
                          }}>
                            {(stateTreasury?.corruption_index ?? 20) < 30 ? "🟢 LOW" :
                             (stateTreasury?.corruption_index ?? 20) < 60 ? "🟡 MODERATE" : "🔴 HIGH"}
                          </span>
                        </div>
                        <div style={{width:"100%", height:"8px", background:"#111", borderRadius:"4px", overflow:"hidden", marginBottom:"4px"}}>
                          <div style={{
                            width:`${Math.min(stateTreasury?.corruption_index ?? 20, 100)}%`,
                            height:"100%",
                            background: (stateTreasury?.corruption_index ?? 20) < 30 ? "#00ff41" :
                                        (stateTreasury?.corruption_index ?? 20) < 60 ? "#ffaa00" : "#ff3232",
                            borderRadius:"4px", transition:"width 1s",
                          }}/>
                        </div>
                        <div style={{color:"#555", fontFamily:"monospace", fontSize:"0.6rem"}}>
                          {(stateTreasury?.corruption_index ?? 20).toFixed(1)}% — {
                            (stateTreasury?.corruption_index ?? 20) < 30 ? "Officials are clean" :
                            (stateTreasury?.corruption_index ?? 20) < 60 ? "Bribes common" : "System is corrupt!"
                          }
                        </div>
                      </div>

                      {/* Divider */}
                      <div style={{borderTop:"1px solid #1a1a1a", marginBottom:"12px"}}/>

                      {/* Crime rate */}
                      <div>
                        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"6px"}}>
                          <span style={{color:"#666", fontFamily:"monospace", fontSize:"0.65rem", letterSpacing:"1px"}}>🔍 CRIME RATE INDEX</span>
                          <span style={{
                            color: (frsStats?.economy.poor_pct ?? 0) < 20 ? "#00ff41" :
                                   (frsStats?.economy.poor_pct ?? 0) < 40 ? "#ffaa00" :
                                   (frsStats?.economy.poor_pct ?? 0) < 60 ? "#ff8800" : "#ff3232",
                            fontFamily:"monospace", fontSize:"0.7rem", fontWeight:"bold"
                          }}>
                            {(frsStats?.economy.poor_pct ?? 0) < 20 ? "🟢 LOW" :
                             (frsStats?.economy.poor_pct ?? 0) < 40 ? "🟡 MODERATE" :
                             (frsStats?.economy.poor_pct ?? 0) < 60 ? "🟠 HIGH" : "🔴 CRITICAL"}
                          </span>
                        </div>
                        <div style={{width:"100%", height:"8px", background:"#111", borderRadius:"4px", overflow:"hidden", marginBottom:"4px"}}>
                          <div style={{
                            width:`${Math.min(frsStats?.economy.poor_pct ?? 0, 100)}%`,
                            height:"100%",
                            background: (frsStats?.economy.poor_pct ?? 0) < 20 ? "#00ff41" :
                                        (frsStats?.economy.poor_pct ?? 0) < 40 ? "#ffaa00" :
                                        (frsStats?.economy.poor_pct ?? 0) < 60 ? "#ff8800" : "#ff3232",
                            borderRadius:"4px", transition:"width 1s",
                          }}/>
                        </div>
                        <div style={{color:"#555", fontFamily:"monospace", fontSize:"0.6rem"}}>
                          {(frsStats?.economy.poor_pct ?? 0).toFixed(1)}% poverty index — {
                            (frsStats?.economy.poor_pct ?? 0) < 20 ? "City is safe" :
                            (frsStats?.economy.poor_pct ?? 0) < 40 ? "Police active" :
                            (frsStats?.economy.poor_pct ?? 0) < 60 ? "Crime rising" : "City in chaos!"
                          }
                        </div>
                      </div>
                    </div>
                    {/* BOTTOM RIGHT — Sheriff */}
                    {sheriffState && (
                      <div style={{
                        padding:"14px 16px",
                        background: sheriffState.sheriff_type === "junta" ? "rgba(180,0,0,0.08)" :
                                    sheriffState.sheriff_type === "corrupt" ? "rgba(150,80,0,0.08)" :
                                    "rgba(0,80,200,0.06)",
                        border:`1px solid ${sheriffState.sheriff_type === "honest" ? "#4DA2FF" : sheriffState.sheriff_type === "corrupt" ? "#ff8800" : "#ff3232"}44`,
                        borderRadius:"10px",
                      }}>
                        <div style={{display:"flex", alignItems:"center", gap:"8px", marginBottom:"6px"}}>
                          <span style={{fontSize:"1rem"}}>
                            {sheriffState.sheriff_type === "honest" ? "⚖️" : sheriffState.sheriff_type === "corrupt" ? "💀" : "⚔️"}
                          </span>
                          <span style={{
                            color: sheriffState.sheriff_type === "honest" ? "#4DA2FF" :
                                   sheriffState.sheriff_type === "corrupt" ? "#ff8800" : "#ff3232",
                            fontFamily:"monospace", fontWeight:"bold", fontSize:"0.85rem"
                          }}>
                            SHERIFF: {sheriffState.agent_name}
                          </span>
                          <span style={{
                            background: sheriffState.sheriff_type === "honest" ? "rgba(0,80,200,0.2)" :
                                        sheriffState.sheriff_type === "corrupt" ? "rgba(150,80,0,0.2)" : "rgba(180,0,0,0.2)",
                            color: sheriffState.sheriff_type === "honest" ? "#4DA2FF" :
                                   sheriffState.sheriff_type === "corrupt" ? "#ff8800" : "#ff3232",
                            fontFamily:"monospace", fontSize:"0.6rem", padding:"2px 6px", borderRadius:"4px"
                          }}>{sheriffState.sheriff_type.toUpperCase()}</span>
                        </div>
                        <div style={{display:"flex", alignItems:"center", gap:"8px", marginBottom:"6px"}}>
                          <span style={{color:"#aaa", fontFamily:"monospace", fontSize:"0.65rem"}}>APPROVAL</span>
                          <div style={{flex:1, height:"6px", background:"#111", borderRadius:"3px", overflow:"hidden"}}>
                            <div style={{
                              width:`${sheriffState.approval_rating}%`, height:"100%",
                              background: sheriffState.approval_rating > 60 ? "#4DA2FF" : sheriffState.approval_rating > 30 ? "#ffaa00" : "#ff3232",
                              borderRadius:"3px",
                            }}/>
                          </div>
                          <span style={{color:"#fff", fontFamily:"monospace", fontSize:"0.75rem", fontWeight:"bold"}}>{sheriffState.approval_rating}%</span>
                        </div>
                        <div style={{color:"#ccc", fontFamily:"monospace", fontSize:"0.68rem", marginBottom:"6px"}}>
                          Term {sheriffState.term_number}/2 · Day {sheriffState.days_in_office}
                        </div>
                        <div style={{display:"flex", gap:"16px"}}>
                          <div>
                            <div style={{color:"#555", fontFamily:"monospace", fontSize:"0.6rem"}}>👮 OFFICERS</div>
                            <div style={{color:"#fff", fontFamily:"monospace", fontSize:"0.9rem", fontWeight:"bold"}}>{sheriffState.police_count}</div>
                          </div>
                          <div>
                            <div style={{color:"#555", fontFamily:"monospace", fontSize:"0.6rem"}}>💰 BUDGET</div>
                            <div style={{color:"#00ff41", fontFamily:"monospace", fontSize:"0.9rem", fontWeight:"bold"}}>{sheriffState.police_budget?.toFixed(0)} ZION</div>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: "10px", marginBottom: "16px" }}>
                    {[
                      { label: "AVG BALANCE", value: `${frsStats.economy.avg_balance.toFixed(1)} ZION`, color: "#4DA2FF" },
                      {
                        label: "TOTAL MONEY",
                        value: `${(frsStats.economy.total_money / 1000).toFixed(1)}K ZION`,
                        color: "#00ff41",
                      },
                      {
                        label: "POOR %",
                        value: `${frsStats.economy.poor_pct}%`,
                        color: frsStats.economy.poor_pct > 40 ? "#ff6464" : "#ffaa00",
                      },
                      {
                        label: "MAX WEALTH",
                        value: `${frsStats.economy.max_balance.toFixed(0)} ZION`,
                        color: "#ffd700",
                      },
                    ].map((m) => (
                      <div
                        key={m.label}
                        style={{
                          background: "#050a10",
                          border: "1px solid #1a1a2e",
                          borderRadius: "8px",
                          padding: "12px",
                          textAlign: "center",
                        }}
                      >
                        <div style={{ color: "#777", fontFamily: "monospace", fontSize: "0.6rem", marginBottom: "6px" }}>
                          {m.label}
                        </div>
                        <div style={{ color: m.color, fontFamily: "monospace", fontSize: "1.1rem", fontWeight: "bold" }}>
                          {m.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      background: "#050a10",
                      border: "1px solid #1a1a2e",
                      borderRadius: "8px",
                      padding: "14px",
                      marginBottom: "16px",
                    }}
                  >
                    <div style={{ color: "#666", fontFamily: "monospace", fontSize: "0.65rem", marginBottom: "10px" }}>
                      CLASS DISTRIBUTION
                    </div>
                    <div style={{ display: "flex", gap: "4px", height: "20px", borderRadius: "4px", overflow: "hidden" }}>
                      {[
                        { cls: "Elite", cnt: frsStats.economy.elite_count, color: "#ffd700" },
                        { cls: "Middle", cnt: frsStats.economy.middle_count, color: "#4DA2FF" },
                        { cls: "Poor", cnt: frsStats.economy.poor_count, color: "#ff6464" },
                      ].map((c) => {
                        const pct = ((c.cnt / frsStats.economy.total_agents) * 100).toFixed(1);
                        return (
                          <div
                            key={c.cls}
                            style={{
                              flex: c.cnt,
                              background: `${c.color}33`,
                              borderLeft: `2px solid ${c.color}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <span style={{ color: c.color, fontFamily: "monospace", fontSize: "0.6rem" }}>
                              {c.cls} {pct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
                    <div style={{ background: "#050a10", border: "1px solid #1a1a2e", borderRadius: "8px", padding: "14px" }}>
                      <div style={{ color: "#4DA2FF", fontFamily: "monospace", fontSize: "0.7rem", marginBottom: "8px" }}>
                        🏢 CORPORATIONS
                      </div>
                      <div style={{ color: "#fff", fontFamily: "monospace", fontSize: "1.2rem", fontWeight: "bold" }}>
                        {frsStats.corporations.count} active
                      </div>
                      <div style={{ color: "#aaa", fontFamily: "monospace", fontSize: "0.7rem" }}>
                        Treasury: {frsStats.corporations.total_treasury.toFixed(0)} ZION
                      </div>
                    </div>
                    <div style={{ background: "#050a10", border: "1px solid #1a1a2e", borderRadius: "8px", padding: "14px" }}>
                      <div style={{ color: "#ffaa00", fontFamily: "monospace", fontSize: "0.7rem", marginBottom: "8px" }}>
                        📋 LAST ZRS ACTION
                      </div>
                      {frsStats.recent_actions[0] ? (
                        <>
                          <div style={{ color: "#fff", fontFamily: "monospace", fontSize: "0.85rem", fontWeight: "bold" }}>
                            {frsStats.recent_actions[0].action}
                          </div>
                          <div style={{ color: "#aaa", fontFamily: "monospace", fontSize: "0.65rem" }}>
                            {frsStats.recent_actions[0].reason?.slice(0, 60)}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: "#666", fontFamily: "monospace", fontSize: "0.75rem" }}>No actions yet</div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px", marginTop: "12px" }}>
                    <div style={{ background: "#050a10", border: "1px solid #2a1a0a", borderRadius: "8px", padding: "14px" }}>
                      <div style={{ color: "#ffaa00", fontFamily: "monospace", fontSize: "0.7rem", letterSpacing: "1px", marginBottom: "10px" }}>
                        🏛️ PRESIDENTIAL DECREE LOG
                      </div>
                      {presidentActionsDisplay.length === 0 ? (
                        <div style={{ color: "#333", fontFamily: "monospace", fontSize: "0.72rem" }}>No decrees yet</div>
                      ) : (
                        presidentActionsDisplay.map((action, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              gap: "10px",
                              padding: "6px 0",
                              borderBottom: i < presidentActionsDisplay.length - 1 ? "1px solid #111" : "none",
                            }}
                          >
                            <div style={{ color: "#666", fontFamily: "monospace", fontSize: "0.6rem", whiteSpace: "nowrap" }}>
                              {new Date(action.created_at).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                            <div style={{ color: "#ddd", fontFamily: "monospace", fontSize: "0.72rem", lineHeight: 1.4 }}>{action.description}</div>
                          </div>
                        ))
                      )}
                    </div>
                    <div style={{ background: "#050a10", border: "1px solid #0a1a2a", borderRadius: "8px", padding: "14px" }}>
                      <div style={{ color: "#4DA2FF", fontFamily: "monospace", fontSize: "0.7rem", letterSpacing: "1px", marginBottom: "10px" }}>
                        🚔 SHERIFF ACTIVITY LOG
                      </div>
                      {sheriffActionsDisplay.length === 0 ? (
                        <div style={{ color: "#333", fontFamily: "monospace", fontSize: "0.72rem" }}>No activity yet</div>
                      ) : (
                        sheriffActionsDisplay.map((action, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              gap: "10px",
                              padding: "6px 0",
                              borderBottom: i < sheriffActionsDisplay.length - 1 ? "1px solid #111" : "none",
                            }}
                          >
                            <div style={{ color: "#666", fontFamily: "monospace", fontSize: "0.6rem", whiteSpace: "nowrap" }}>
                              {new Date(action.created_at).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                            <div style={{ color: "#ddd", fontFamily: "monospace", fontSize: "0.72rem", lineHeight: 1.4 }}>{action.description}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>
              )}

              {treasuryNews.length > 0 && (
                <div
                  style={{
                    marginTop: "16px",
                    background: "#050a10",
                    border: "1px solid #1a3a1a",
                    borderRadius: "8px",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      background: "rgba(0,255,65,0.1)",
                      padding: "4px 12px",
                      borderBottom: "1px solid #1a3a1a",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#00ff41",
                        animation: "pulse 1s infinite",
                      }}
                    />
                    <span style={{ color: "#00ff41", fontFamily: "monospace", fontSize: "0.65rem", letterSpacing: "2px" }}>
                      ZRS FINANCIAL WIRE
                    </span>
                  </div>
                  <div style={{ overflow: "hidden", padding: "8px 0", position: "relative" }}>
                    <div
                      style={{
                        display: "flex",
                        width: "max-content",
                        animation: "marquee 80s linear infinite",
                      }}
                    >
                      {[...treasuryNews, ...treasuryNews, ...treasuryNews].map((item, i) => (
                        <span
                          key={i}
                          style={{
                            color: "#ccc",
                            fontFamily: "monospace",
                            fontSize: "0.75rem",
                            flexShrink: 0,
                            paddingRight: "60px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item}
                          <span style={{ color: "#666", marginLeft: "20px" }}>◆</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {policeNews.length > 0 && (
                <div
                  style={{
                    marginTop: "8px",
                    background: "#050a10",
                    border: "1px solid #1a3a5c",
                    borderRadius: "8px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      background: "rgba(77,162,255,0.1)",
                      padding: "4px 12px",
                      borderBottom: "1px solid #1a3a5c",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#4DA2FF" }} />
                    <span style={{ color: "#4DA2FF", fontFamily: "monospace", fontSize: "0.65rem", letterSpacing: "2px" }}>
                      🚔 POLICE WIRE
                    </span>
                  </div>
                  <div style={{ overflow: "hidden", padding: "8px 0" }}>
                    <div
                      style={{
                        display: "flex",
                        width: "max-content",
                        animation: "marquee 50s linear infinite",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {[...policeNews, ...policeNews, ...policeNews].map((item, i) => (
                        <span
                          key={i}
                          style={{
                            color: "#7ab8f5",
                            fontFamily: "monospace",
                            fontSize: "0.75rem",
                            flexShrink: 0,
                            paddingRight: "60px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item}
                          <span style={{ color: "#1a3a5c", marginLeft: "20px" }}>◆</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* How it works */}
              <div
                style={{
                  border: "1px solid rgba(255,215,0,0.2)",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "20px",
                  background: "rgba(255,215,0,0.03)",
                }}
              >
                <div style={{ color: "#ffd700", fontSize: "0.75rem", letterSpacing: "0.1em", marginBottom: "12px" }}>
                  🔐 HOW IT WORKS
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "1fr 1fr 1fr 1fr",
                    gap: "12px",
                  }}
                >
                  {[
                    { icon: "💸", title: "Send", desc: "Send SUI or USDC to any address" },
                    { icon: "🔐", title: "Encrypt", desc: "Amount & recipient encrypted on-chain" },
                    { icon: "🔑", title: "Key", desc: "Only you hold the viewing key" },
                    { icon: "📋", title: "Audit", desc: "Reveal details to tax authority if needed" },
                  ].map((step) => (
                    <div
                      key={step.title}
                      style={{ textAlign: "center", padding: "12px", background: "rgba(0,0,0,0.3)", borderRadius: "8px" }}
                    >
                      <div style={{ fontSize: "1.5rem", marginBottom: "6px" }}>{step.icon}</div>
                      <div style={{ color: "#fff", fontSize: "0.8rem", fontWeight: "bold", marginBottom: "4px" }}>
                        {step.title}
                      </div>
                      <div style={{ color: "#555", fontSize: "0.7rem", lineHeight: "1.4" }}>{step.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Our technology */}
              <div
                style={{
                  border: "1px solid rgba(0,255,65,0.2)",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "20px",
                  background: "rgba(0,255,65,0.02)",
                }}
              >
                <div style={{ color: "#00ff41", fontSize: "0.75rem", letterSpacing: "0.1em", marginBottom: "12px" }}>
                  ⚙️ POWERED BY
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "12px" }}>
                  {[
                    { icon: "🔐", title: "Sui zkLogin", desc: "Sign in with Google — no seed phrase needed" },
                    { icon: "🛡️", title: "Seal Protocol", desc: "On-chain encryption for private transfers" },
                    { icon: "🌊", title: "Walrus Storage", desc: "Decentralized storage for transaction history" },
                    { icon: "⚡", title: "Sui Move", desc: "Smart contracts with object-based security" },
                    { icon: "🔑", title: "Viewing Key", desc: "Full audit trail — reveal only when needed" },
                    { icon: "📊", title: "DeepBook", desc: "On-chain liquidity for ZION token transfers" },
                  ].map((tech) => (
                    <div
                      key={tech.title}
                      style={{
                        padding: "12px",
                        background: "rgba(0,0,0,0.3)",
                        borderRadius: "8px",
                        border: "1px solid #1a1a1a",
                      }}
                    >
                      <div style={{ fontSize: "1.2rem", marginBottom: "6px" }}>{tech.icon}</div>
                      <div
                        style={{
                          color: "#00ff41",
                          fontSize: "0.78rem",
                          fontWeight: "bold",
                          marginBottom: "4px",
                        }}
                      >
                        {tech.title}
                      </div>
                      <div style={{ color: "#555", fontSize: "0.68rem", lineHeight: "1.4" }}>{tech.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Send form */}
              <div
                style={{
                  border: "1px solid #333",
                  borderRadius: "12px",
                  padding: "20px",
                  marginBottom: "20px",
                }}
              >
                <div style={{ color: "#fff", fontSize: "0.85rem", fontWeight: "bold", marginBottom: "16px" }}>
                  💸 Send Private Transaction
                </div>

                <div style={{ marginBottom: "12px" }}>
                  <label style={{ color: "#888", fontSize: "0.72rem", display: "block", marginBottom: "4px" }}>
                    RECIPIENT ADDRESS
                  </label>
                  <input
                    type="text"
                    placeholder="0x..."
                    value={bankRecipient}
                    onChange={(e) => setBankRecipient(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      background: "rgba(0,0,0,0.4)",
                      border: "1px solid #333",
                      borderRadius: "8px",
                      color: "#fff",
                      fontSize: "0.85rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ color: "#888", fontSize: "0.72rem", display: "block", marginBottom: "4px" }}>
                      AMOUNT
                    </label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={bankAmount}
                      onChange={(e) => setBankAmount(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: "rgba(0,0,0,0.4)",
                        border: "1px solid #333",
                        borderRadius: "8px",
                        color: "#fff",
                        fontSize: "0.85rem",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ color: "#888", fontSize: "0.72rem", display: "block", marginBottom: "4px" }}>
                      TOKEN
                    </label>
                    <select
                      value={bankToken}
                      onChange={(e) => setBankToken(e.target.value as "SUI" | "ZION")}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        background: "rgba(0,0,0,0.8)",
                        border: "1px solid #333",
                        borderRadius: "8px",
                        color: "#fff",
                        fontSize: "0.85rem",
                        boxSizing: "border-box",
                      }}
                    >
                      <option value="SUI">SUI</option>
                      <option value="ZION">ZION</option>
                    </select>
                  </div>
                </div>

                <div
                  style={{
                    marginBottom: "16px",
                    padding: "10px 12px",
                    background: "rgba(255,215,0,0.05)",
                    border: "1px solid rgba(255,215,0,0.2)",
                    borderRadius: "8px",
                  }}
                >
                  <div style={{ color: "#ffd700", fontSize: "0.72rem" }}>
                    💰 Fee: 10 ZION + $0.01 gas · Transaction will be encrypted on Sui blockchain
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleBankSend}
                  disabled={bankLoading}
                  style={{
                    width: "100%",
                    padding: "14px",
                    background: "linear-gradient(90deg, rgba(255,215,0,0.2), rgba(0,255,65,0.2))",
                    border: "1px solid #ffd700",
                    borderRadius: "8px",
                    color: "#ffd700",
                    fontSize: "1rem",
                    fontWeight: "bold",
                    cursor: bankLoading ? "not-allowed" : "pointer",
                    opacity: bankLoading ? 0.7 : 1,
                  }}
                >
                  {bankLoading ? "⏳ Sending..." : "🔐 Send Transaction"}
                </button>
                {bankTxHash && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "10px",
                      background: "rgba(0,255,65,0.05)",
                      border: "1px solid #00ff4144",
                      borderRadius: "8px",
                    }}
                  >
                    <div style={{ color: "#00ff41", fontSize: "0.75rem", marginBottom: "4px" }}>
                      ✅ Transaction sent!
                    </div>
                    <a
                      href={`https://suiscan.xyz/testnet/tx/${bankTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#4DA2FF", fontSize: "0.7rem", fontFamily: "monospace" }}
                    >
                      View on Suiscan →
                    </a>
                  </div>
                )}
                {bankError && (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "10px",
                      background: "rgba(255,50,50,0.05)",
                      border: "1px solid #ff323244",
                      borderRadius: "8px",
                    }}
                  >
                    <div style={{ color: "#ff6464", fontSize: "0.75rem" }}>❌ {bankError}</div>
                  </div>
                )}
                <div style={{ color: "#333", fontSize: "0.65rem", textAlign: "center", marginTop: "8px" }}>
                  Powered by Sui Protocol Privacy · sui::ristretto255 · Pedersen commitments
                </div>
              </div>

              {/* Cross-chain — ZION Bridge */}
              <div
                style={{
                  border: "1px solid rgba(100,160,255,0.3)",
                  borderRadius: "12px",
                  padding: "20px",
                  marginTop: "20px",
                  marginBottom: "20px",
                  background: "rgba(100,160,255,0.02)",
                }}
              >
                <div style={{ color: "#64a0ff", fontSize: "0.75rem", letterSpacing: "0.1em", marginBottom: "4px" }}>
                  🌉 COMING SOON — ZION BRIDGE
                </div>
                <div style={{ color: "#fff", fontSize: "1.1rem", fontWeight: "bold", marginBottom: "4px" }}>
                  Private Cross-Chain Transfers
                </div>
                <div style={{ color: "#555", fontSize: "0.8rem", marginBottom: "20px" }}>
                  Send privately across chains · Powered by Wormhole + Sui ETH Bridge
                </div>

                {/* Chain flow diagram */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    marginBottom: "24px",
                    flexWrap: "wrap",
                  }}
                >
                  {[
                    { chain: "Sui", color: "#64a0ff", icon: "🔵" },
                    { chain: "Ethereum", color: "#9945ff", icon: "💎" },
                    { chain: "Solana", color: "#00ff94", icon: "◎" },
                    { chain: "Arbitrum", color: "#28a0f0", icon: "🔷" },
                    { chain: "Base", color: "#0052ff", icon: "🔵" },
                  ].map((c) => (
                    <div
                      key={c.chain}
                      onClick={() => {
                        if (c.chain !== "Sui") setBridgeToChain(c.chain);
                      }}
                      style={{
                        padding: "10px 16px",
                        border:
                          bridgeToChain === c.chain || c.chain === "Sui"
                            ? `2px solid ${c.color}`
                            : `1px solid ${c.color}44`,
                        borderRadius: "10px",
                        background: bridgeToChain === c.chain ? `${c.color}22` : `${c.color}08`,
                        textAlign: "center",
                        minWidth: "80px",
                        cursor: c.chain === "Sui" ? "default" : "pointer",
                        transition: "all 0.2s ease",
                        opacity: c.chain === "Sui" ? 0.6 : 1,
                      }}
                    >
                      <div style={{ fontSize: "1.2rem" }}>{c.icon}</div>
                      <div style={{ color: c.color, fontSize: "0.72rem", fontWeight: "bold" }}>{c.chain}</div>
                      {c.chain === "Sui" && (
                        <div style={{ color: c.color, fontSize: "0.6rem", opacity: 0.7 }}>FROM</div>
                      )}
                      {bridgeToChain === c.chain && c.chain !== "Sui" && (
                        <div style={{ color: c.color, fontSize: "0.6rem" }}>TO ✓</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* How it works steps */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "20px" }}>
                  {[
                    { step: "1", title: "Send on Sui", desc: "Send USDC privately on Sui blockchain", color: "#64a0ff" },
                    {
                      step: "2",
                      title: "Wormhole Bridge",
                      desc: "Automatic cross-chain transfer via Wormhole protocol",
                      color: "#9945ff",
                    },
                    { step: "3", title: "Receive anywhere", desc: "Get USDC on ETH, SOL, Arbitrum or Base", color: "#00ff94" },
                  ].map((s) => (
                    <div
                      key={s.step}
                      style={{
                        padding: "14px",
                        border: `1px solid ${s.color}33`,
                        borderRadius: "10px",
                        background: `${s.color}08`,
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "50%",
                          background: `${s.color}22`,
                          border: `1px solid ${s.color}`,
                          color: s.color,
                          fontSize: "0.85rem",
                          fontWeight: "bold",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          margin: "0 auto 8px",
                        }}
                      >
                        {s.step}
                      </div>
                      <div style={{ color: "#fff", fontSize: "0.8rem", fontWeight: "bold", marginBottom: "4px" }}>
                        {s.title}
                      </div>
                      <div style={{ color: "#555", fontSize: "0.7rem", lineHeight: "1.4" }}>{s.desc}</div>
                    </div>
                  ))}
                </div>

                {/* Coming soon form preview */}
                <div style={{ opacity: 0.4, pointerEvents: "none" }}>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <div>
                      <label style={{ color: "#888", fontSize: "0.72rem", display: "block", marginBottom: "4px" }}>
                        FROM NETWORK
                      </label>
                      <select
                        style={{
                          width: "100%",
                          padding: "10px",
                          background: "rgba(0,0,0,0.4)",
                          border: "1px solid #333",
                          borderRadius: "8px",
                          color: "#fff",
                          fontSize: "0.85rem",
                        }}
                      >
                        <option>🔵 Sui (Private)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ color: "#888", fontSize: "0.72rem", display: "block", marginBottom: "4px" }}>
                        TO NETWORK
                      </label>
                      <div
                        style={{
                          width: "100%",
                          padding: "10px",
                          background: "rgba(0,0,0,0.4)",
                          border: "1px solid #64a0ff",
                          borderRadius: "8px",
                          color: "#fff",
                          fontSize: "0.85rem",
                          boxSizing: "border-box",
                        }}
                      >
                        {bridgeToChain === "Ethereum" && "💎 Ethereum"}
                        {bridgeToChain === "Solana" && "◎ Solana"}
                        {bridgeToChain === "Arbitrum" && "🔷 Arbitrum"}
                        {bridgeToChain === "Base" && "🔵 Base"}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    style={{
                      width: "100%",
                      padding: "14px",
                      background: "rgba(100,160,255,0.1)",
                      border: "1px solid #64a0ff",
                      borderRadius: "8px",
                      color: "#64a0ff",
                      fontSize: "1rem",
                      fontWeight: "bold",
                    }}
                  >
                    🌉 Bridge Privately
                  </button>
                </div>

                <div style={{ textAlign: "center", marginTop: "12px" }}>
                  <span
                    style={{
                      background: "rgba(100,160,255,0.1)",
                      border: "1px solid rgba(100,160,255,0.3)",
                      color: "#64a0ff",
                      fontSize: "0.7rem",
                      padding: "4px 16px",
                      borderRadius: "20px",
                    }}
                  >
                    🚀 Launching with Sui ETH Bridge · Powered by Wormhole
                  </span>
                </div>
              </div>

              {/* Tech stack */}
              <div style={{ border: "1px solid #222", borderRadius: "12px", padding: "16px" }}>
                <div style={{ color: "#555", fontSize: "0.75rem", letterSpacing: "0.1em", marginBottom: "12px" }}>
                  ⚙️ TECHNICAL STACK
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {[
                    "sui::ristretto255",
                    "Pedersen commitments",
                    "zk-SNARK on-chain",
                    "Stealth addresses",
                    "Viewing key",
                    "XChaCha20-Poly1305",
                  ].map((tech) => (
                    <span
                      key={tech}
                      style={{
                        background: "rgba(0,255,65,0.05)",
                        border: "1px solid rgba(0,255,65,0.2)",
                        color: "#00ff41",
                        fontSize: "0.7rem",
                        padding: "4px 10px",
                        borderRadius: "20px",
                      }}
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {chatAgent ? (
          <div
            className="chatModalBackdrop"
            role="presentation"
            onClick={(e) => {
              if (e.target === e.currentTarget) setChatAgent(null);
            }}
          >
            <div className="chatModal" role="dialog" aria-modal="true" aria-labelledby="chat-modal-title">
              <div className="chatModalHead">
                <h3 id="chat-modal-title">
                  {cleanName(chatAgent.name)}{" "}
                  <span className="chatClassTag" style={{ color: classMeta(chatAgent.class).border }}>
                    {chatAgent.class.toUpperCase()}
                  </span>
                </h3>
                <button type="button" className="chatClose" onClick={() => setChatAgent(null)} aria-label="Close chat">
                  ×
                </button>
              </div>
              <label className="chatLabel" htmlFor="chat-wallet">
                Wallet address
              </label>
              {!walletAddress ? (
                <p className="walletGateBanner chatModalGate">Connect wallet to chat</p>
              ) : (
                <input
                  id="chat-wallet"
                  className="chatWalletInput"
                  type="text"
                  placeholder="0x…"
                  value={walletAddress}
                  readOnly
                  autoComplete="off"
                />
              )}
              <p className="chatCostLine">Cost: 1 ZION · Earn: 2 points</p>
              <div className="chatMessages">
                {chatMessages.map((m, i) => (
                  <div key={`${i}-${m.role}`} className={m.role === "user" ? "chatBubble user" : "chatBubble agent"}>
                    {m.text}
                  </div>
                ))}
                {chatLoading ? <div className="chatBubble agent typing">…</div> : null}
              </div>
              <div className="chatComposer">
                <input
                  className="chatTextInput"
                  type="text"
                  placeholder="Message…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void sendChat();
                  }}
                  disabled={chatLoading || !walletAddress.trim()}
                />
                <button type="button" className="chatSendBtn" onClick={() => void sendChat()} disabled={chatLoading || !walletAddress.trim()}>
                  SEND
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
          background: #05030d;
          color: #f4f7ff;
          font-family: Orbitron, monospace;
        }
        @media (prefers-reduced-motion: reduce) {
          .introFullscreen *:not(canvas) {
            animation: none !important;
            opacity: 1 !important;
          }
        }
        .bg-nebula {
          position: fixed;
          inset: 0;
          z-index: -1;
          background:
            radial-gradient(ellipse at 30% 40%, rgba(0, 40, 0, 0.4) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 60%, rgba(0, 20, 10, 0.3) 0%, transparent 50%),
            #000000;
          animation: nebulaMove 24s ease-in-out infinite alternate;
        }
        .bg-grid {
          position: fixed;
          inset: 0;
          z-index: 2;
          opacity: 0.2;
          background-image:
            linear-gradient(rgba(0, 255, 65, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 65, 0.04) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        .introLayer {
          position: fixed;
          inset: 0;
          z-index: 20;
          background: #000;
        }
        .introCanvas {
          width: 100%;
          height: 100%;
          display: block;
          background: #000;
        }
        .dashboard {
          position: relative;
          z-index: 5;
          max-width: 1500px;
          margin: 0 auto;
          padding: 56px 26px 26px;
          opacity: 0;
          transition: opacity 0.8s ease;
        }
        .dashboard.show {
          opacity: 1;
        }
        .mainNav {
          position: sticky;
          top: 0;
          z-index: 14;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px 10px;
          padding: 12px 14px;
          margin: 0 -26px 20px;
          background: rgba(0, 0, 0, 0.9);
          border-bottom: 1px solid rgba(0, 255, 65, 0.3);
          font-family: Orbitron, monospace;
        }
        .navTab {
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          padding: 12px 20px;
          margin: 0;
          font-size: 0.85rem;
          letter-spacing: 0.15em;
          color: #889988;
          cursor: pointer;
          font-family: Orbitron, monospace;
          transition: color 0.15s ease, border-color 0.15s ease;
        }
        .navTab:hover {
          color: #b8d4b8;
        }
        .navTab.active {
          color: #00ff41;
          border-bottom: 2px solid #00ff41;
        }
        .tabPanels {
          padding-bottom: 32px;
        }
        .tabIntro {
          margin: 0 0 16px;
          font-size: 0.78rem;
          color: rgba(180, 235, 200, 0.88);
          line-height: 1.45;
          max-width: 720px;
        }
        .walletGateBanner {
          margin: 24px auto;
          max-width: 520px;
          padding: 20px 18px;
          text-align: center;
          font-size: 0.85rem;
          letter-spacing: 0.12em;
          color: #ffc266;
          border: 1px dashed rgba(255, 180, 80, 0.45);
          border-radius: 12px;
          background: rgba(40, 25, 0, 0.35);
        }
        .walletGateBanner.chatModalGate {
          margin: 0 0 12px;
          max-width: none;
          padding: 14px 12px;
          font-size: 0.72rem;
        }
        .chatTabSection {
          margin-top: 4px;
        }
        .chatClassFilters {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin: 0 0 14px;
        }
        .chatClassCard {
          text-align: left;
          border-radius: 10px;
          border: 2px solid rgba(120, 140, 140, 0.25);
          background: rgba(0, 0, 0, 0.5);
          padding: 12px;
          cursor: pointer;
          transition: box-shadow 0.15s ease, transform 0.15s ease;
        }
        .chatClassCard:hover {
          transform: translateY(-1px);
          box-shadow: 0 0 18px rgba(0, 255, 65, 0.18);
        }
        .chatClassCard .chatClassHead {
          font-family: Orbitron, monospace;
          font-size: 0.82rem;
          letter-spacing: 0.1em;
          margin-bottom: 6px;
        }
        .chatClassIcon {
          line-height: 1;
          margin-bottom: 12px;
        }
        .chatClassIconEmoji {
          font-size: clamp(105px, 14vw, 135px);
          line-height: 1;
          display: block;
          filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.45));
        }
        .chatClassIconCoin {
          font-size: 0;
          line-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 150px;
          margin-bottom: 12px;
        }
        .silverCoinSvg {
          width: 150px;
          height: 150px;
          display: block;
          margin: 0 auto;
        }
        .chatClassTitleElite {
          color: #ffd700;
          font-size: 1.5rem !important;
          letter-spacing: 0.3em !important;
        }
        .chatClassTitleMiddle {
          color: #c0c0c0;
          font-size: 1.5rem !important;
          letter-spacing: 0.3em !important;
        }
        .chatClassTitlePoor {
          color: #cd7f32;
          font-size: 1.5rem !important;
          letter-spacing: 0.3em !important;
        }
        .chatClassCard p {
          margin: 0;
          font-size: 0.8rem;
          color: rgba(190, 219, 255, 0.82);
          line-height: 1.35;
        }
        .chatClassLine1 {
          font-size: 0.85rem !important;
          opacity: 0.9;
          margin-bottom: 6px !important;
        }
        .chatClassLine1Elite {
          color: #ffd700 !important;
        }
        .chatClassLine1Middle {
          color: #c0c0c0 !important;
        }
        .chatClassLine1Poor {
          color: #cd7f32 !important;
        }
        .chatClassLine2 {
          font-size: 0.8rem !important;
          color: #ffffff !important;
          opacity: 0.7;
          margin-bottom: 5px !important;
        }
        .chatClassLine3 {
          font-size: 0.75rem !important;
          color: #ffffff !important;
          opacity: 0.5;
          font-style: italic;
        }
        .chatClassCard.elite {
          border-color: rgba(255, 215, 0, 0.42);
        }
        .chatClassCard.middle {
          border-color: rgba(192, 192, 192, 0.4);
        }
        .chatClassCard.poor {
          border-color: rgba(205, 127, 50, 0.45);
        }
        .chatClassFiltersFull {
          min-height: 62vh;
          align-content: center;
        }
        .chatClassCardBig {
          min-height: 250px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
        }
        .chatClassCardBig .chatClassHead {
          font-size: 1.2rem;
          margin-bottom: 10px;
          letter-spacing: 0.22em;
        }
        .chatClassCardBig p {
          letter-spacing: 0.04em;
        }
        .chatClassCardBig.elite:hover {
          box-shadow: 0 0 24px rgba(255, 215, 0, 0.35);
        }
        .chatClassCardBig.middle:hover {
          box-shadow: 0 0 22px rgba(192, 192, 192, 0.3);
        }
        .chatClassCardBig.poor:hover {
          box-shadow: 0 0 20px rgba(205, 127, 50, 0.34);
        }
        .chatClassBackBtn {
          margin: 0 0 14px;
          border-radius: 8px;
          border: 1px solid rgba(0, 255, 65, 0.35);
          background: rgba(0, 0, 0, 0.45);
          color: #9de8ff;
          padding: 10px 14px;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          font-family: Orbitron, monospace;
          cursor: pointer;
        }
        .chatClassBackBtn:hover {
          box-shadow: 0 0 14px rgba(0, 255, 65, 0.2);
        }
        .chronicleSection {
          margin-top: 22px;
          width: 100%;
          padding: 14px 14px 16px;
          border-radius: 10px;
          border: 1px solid rgba(0, 255, 65, 0.22);
          background:
            linear-gradient(180deg, rgba(0, 14, 8, 0.92) 0%, rgba(0, 0, 0, 0.96) 100%),
            repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0, 255, 65, 0.03) 2px,
              rgba(0, 255, 65, 0.03) 4px
            );
          box-shadow:
            inset 0 0 60px rgba(0, 0, 0, 0.85),
            0 0 24px rgba(0, 255, 65, 0.06);
        }
        .chronicleHead {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px 16px;
          margin-bottom: 12px;
          padding-bottom: 10px;
          border-bottom: 1px solid rgba(0, 255, 65, 0.18);
        }
        .chronicleTitle {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: Orbitron, monospace;
          font-size: clamp(0.85rem, 2vw, 1rem);
          letter-spacing: 0.22em;
          color: #c8ffe8;
          text-shadow: 0 0 12px rgba(0, 255, 65, 0.35);
        }
        .chronicleLiveDot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #00ff41;
          box-shadow: 0 0 12px #00ff41, 0 0 24px rgba(0, 255, 65, 0.55);
          animation: chronicleLivePulse 1.4s ease-in-out infinite;
        }
        .chronicleFeedHint {
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 0.62rem;
          letter-spacing: 0.14em;
          color: rgba(130, 220, 170, 0.65);
        }
        .chronicleScroll {
          overflow-x: auto;
          overflow-y: hidden;
          padding: 4px 2px 10px;
          scrollbar-width: thin;
          scrollbar-color: rgba(0, 255, 65, 0.35) rgba(0, 0, 0, 0.4);
          -webkit-overflow-scrolling: touch;
        }
        .chronicleScrollTicker {
          max-height: none;
        }
        .chronicleTicker {
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          align-items: stretch;
          gap: 12px;
          min-height: 72px;
          padding-bottom: 2px;
        }
        .chronicleEmpty {
          margin: 0;
          padding: 22px 16px;
          flex: 1;
          text-align: center;
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 0.72rem;
          letter-spacing: 0.12em;
          color: rgba(140, 200, 160, 0.55);
        }
        .chronicleTickerItem {
          flex: 0 0 auto;
          width: min(280px, 78vw);
          display: flex;
          flex-direction: row;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 14px 12px 14px;
          border-radius: 10px;
          border: 1px solid rgba(0, 255, 65, 0.1);
          border-left: 4px solid #00ff41;
          background: rgba(0, 0, 0, 0.55);
          box-sizing: border-box;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .chronicleTickerIcon {
          font-size: 1.25rem;
          line-height: 1;
          flex-shrink: 0;
          filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.12));
        }
        .chronicleTickerBody {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .chronicleTickerTitle {
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 0.74rem;
          line-height: 1.4;
          font-weight: 600;
          color: rgba(230, 255, 240, 0.95);
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .chronicleTickerTime {
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 0.6rem;
          letter-spacing: 0.08em;
          color: rgba(140, 200, 170, 0.65);
        }
        @keyframes chronicleLivePulse {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.35;
            transform: scale(0.92);
          }
        }
        .clanSection {
          margin-top: 8px;
        }
        .placeholderTab {
          padding: 24px 12px;
          text-align: center;
          border: 1px dashed rgba(0, 255, 65, 0.25);
          border-radius: 12px;
          background: rgba(0, 12, 0, 0.45);
        }
        .placeholderTab h2 {
          margin: 0 0 10px;
          color: #00ff41;
          letter-spacing: 0.12em;
        }
        .placeholderTab p {
          margin: 0;
          color: rgba(190, 220, 200, 0.75);
          font-size: 0.85rem;
        }
        .zionBetTab {
          margin-top: 4px;
          padding-bottom: 24px;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
          color: #111827;
        }
        .zionBetHeader {
          margin: 0 0 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid #1e2d3d;
        }
        .zionBetTitle {
          margin: 0 0 8px;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
          font-size: clamp(1.1rem, 2.2vw, 1.5rem);
          font-weight: 600;
          letter-spacing: -0.02em;
          color: #e6edf3;
          text-shadow: none;
        }
        .zionBetSubtitle {
          margin: 0;
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 0.8125rem;
          letter-spacing: 0;
          color: #8b9ab1;
        }
        .zionBetSectionTitle {
          font-family: ui-sans-serif, system-ui, sans-serif !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          letter-spacing: 0.1em !important;
          color: #4DA2FF !important;
          text-transform: uppercase !important;
        }
        .zionBetSortLabel {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 12px;
          color: #8b9ab1;
        }
        .zionBetSortSelect {
          background: #0d1117;
          border: 1px solid #1e2d3d;
          border-radius: 6px;
          color: #8b9ab1;
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 12px;
          padding: 5px 10px;
          cursor: pointer;
        }
        @keyframes zionBetPulse {
          0%,
          100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.45;
            transform: scale(1.35);
          }
        }
        .zionBetToast {
          margin: 0 0 18px;
          padding: 12px 14px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          background: #f9fafb;
          color: #374151;
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 13px;
          letter-spacing: 0;
          box-shadow: none;
        }
        .zionBetToast--success {
          border-color: #bbf7d0;
          background: #f0fdf4;
          color: #166534;
        }
        .zionBetToast--error {
          border-color: #fecaca;
          background: #fef2f2;
          color: #991b1b;
        }
        .zionBetSectionTitleSpaced {
          margin-top: 28px;
        }
        .zionBetMyBets {
          margin-top: 28px;
          position: relative;
        }
        .zionBetMyBetsHeader {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }
        .zionBetMyBetsTabs {
          display: flex;
          gap: 8px;
        }
        .zionBetMyBetsTab {
          padding: 8px 14px;
          border-radius: 20px;
          border: 1px solid rgba(0, 255, 65, 0.2);
          background: rgba(0, 0, 0, 0.35);
          color: rgba(255, 255, 255, 0.5);
          font-family: Orbitron, monospace;
          font-size: 0.68rem;
          letter-spacing: 0.06em;
          cursor: pointer;
        }
        .zionBetMyBetsTab:hover {
          color: rgba(255, 255, 255, 0.8);
          border-color: rgba(0, 255, 65, 0.35);
        }
        .zionBetMyBetsTabActive {
          background: rgba(0, 255, 65, 0.12);
          border-color: #00ff41;
          color: #00ff41;
        }
        .zionBetMyBetsGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        @media (max-width: 640px) {
          .zionBetMyBetsGrid {
            grid-template-columns: 1fr;
          }
        }
        .zionBetMyBetCard {
          border-radius: 8px;
          padding: 10px 12px;
          border: 1px solid rgba(0, 255, 65, 0.15);
          background: rgba(10, 14, 10, 0.95);
          border-left-width: 3px;
          border-left-style: solid;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
        }
        .zionBetMyBetCardLine {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: nowrap;
          min-height: 40px;
          overflow: hidden;
        }
        .zionBetMyBetQuestionLine {
          flex: 1;
          min-width: 0;
          font-weight: 600;
          font-size: 12px;
          color: #e8fff0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-family: ui-sans-serif, system-ui, sans-serif;
        }
        .zionBetMyBetCard--yes {
          border-left-color: #00ff41;
        }
        .zionBetMyBetCard--no {
          border-left-color: #ff4141;
        }
        .zionBetMyBetQuestion {
          font-weight: 700;
          color: #e8fff0;
          font-size: 14px;
          margin: 0 0 8px;
          line-height: 1.25;
          font-family: ui-sans-serif, system-ui, sans-serif;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .zionBetMyBetRow {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          font-family: ui-monospace, monospace;
          font-size: 0.72rem;
          color: #9aa39a;
        }
        .zionBetMyBetPill {
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          font-family: Orbitron, monospace;
        }
        .zionBetMyBetPill--yes {
          background: rgba(0, 255, 65, 0.15);
          color: #00ff41;
          border: 1px solid rgba(0, 255, 65, 0.35);
        }
        .zionBetMyBetPill--no {
          background: rgba(255, 65, 65, 0.12);
          color: #ff4141;
          border: 1px solid rgba(255, 65, 65, 0.35);
        }
        .zionBetMyBetAmt {
          color: #ccc;
        }
        .zionBetMyBetArrow {
          color: #555;
        }
        .zionBetMyBetPayout {
          color: #7ec8e3;
        }
        .zionBetMyBetProfit {
          color: #00ff41;
        }
        .zionBetMyBetLostAmt {
          color: #ff4141;
        }
        .zionBetMyBetOutcomeWon {
          color: #00ff41;
          font-weight: 700;
          letter-spacing: 0.06em;
        }
        .zionBetMyBetOutcomeLost {
          color: #ff4141;
          font-weight: 700;
          letter-spacing: 0.06em;
        }
        .zionBetMyBetStatusPending {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.65rem;
          font-family: Orbitron, monospace;
          letter-spacing: 0.12em;
          color: #ffd54f;
        }
        .zionBetPendingDot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #ffd54f;
          animation: zionBetPendingPulse 1.2s ease-in-out infinite;
        }
        @keyframes zionBetPendingPulse {
          0%,
          100% {
            opacity: 1;
            box-shadow: 0 0 6px #ffd54f;
          }
          50% {
            opacity: 0.35;
            box-shadow: 0 0 2px #ffd54f;
          }
        }
        .zionBetMyBetResolve {
          font-size: 0.68rem;
          color: #666;
          font-family: ui-monospace, monospace;
        }
        .zionBetMyBetsEmpty {
          color: #555;
          font-family: ui-monospace, monospace;
          text-align: center;
          padding: 24px 12px;
        }
        .zionBetMyBetCardWon {
          border-color: rgba(0, 255, 65, 0.25);
          background: linear-gradient(90deg, rgba(0, 40, 14, 0.55), rgba(8, 20, 8, 0.95));
          box-shadow: 0 0 16px rgba(0, 255, 65, 0.12);
        }
        .zionBetMyBetCardLost {
          border-color: #2a2a2a;
          background: rgba(8, 8, 8, 0.85);
          opacity: 0.72;
        }
        .zionBetClaimBtnInline {
          margin-left: auto;
          padding: 4px 12px;
          border: none;
          border-radius: 6px;
          background: #00ff41;
          color: #001a08;
          font-family: Orbitron, monospace;
          font-weight: 700;
          font-size: 0.62rem;
          letter-spacing: 0.14em;
          cursor: pointer;
          animation: zionBetClaimPulse 1.5s ease-in-out infinite;
        }
        .zionBetClaimBtnInline:hover {
          filter: brightness(1.08);
        }
        @keyframes zionBetClaimPulse {
          0%,
          100% {
            box-shadow: 0 0 12px rgba(0, 255, 65, 0.5);
          }
          50% {
            box-shadow: 0 0 24px rgba(0, 255, 65, 0.9);
            transform: scale(1.02);
          }
        }
        .zionBetClaimedLabel {
          font-family: ui-monospace, monospace;
          font-size: 0.72rem;
          color: #666;
          letter-spacing: 0.1em;
        }
        .zionBetConfettiLayer {
          position: fixed;
          inset: 0;
          z-index: 99999;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.55);
        }
        .zionBetConfettiParticle {
          position: absolute;
          width: 8px;
          height: 8px;
          border-radius: 2px;
          left: 50%;
          top: 50%;
          margin: -4px 0 0 -4px;
          animation: zionBetConfettiBurst 2s ease-out forwards;
        }
        @keyframes zionBetConfettiBurst {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          70% {
            opacity: 1;
          }
          100% {
            transform: translate(var(--tx), var(--ty)) scale(0.3) rotate(720deg);
            opacity: 0;
          }
        }
        .zionBetClaimOverlay {
          position: relative;
          z-index: 2;
          font-family: Orbitron, monospace;
          font-size: clamp(1rem, 4vw, 1.4rem);
          letter-spacing: 0.08em;
          color: #00ff41;
          text-shadow: 0 0 24px rgba(0, 255, 65, 0.8);
          animation: zionBetClaimOverlayPop 0.4s ease-out;
          padding: 0 16px;
          text-align: center;
        }
        @keyframes zionBetClaimOverlayPop {
          from {
            transform: scale(0.7);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        .zionBetDetailOverlay .zionBetDetailGrid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, 380px);
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 960px) {
          .zionBetDetailOverlay .zionBetDetailGrid {
            grid-template-columns: 1fr !important;
          }
        }
        .zbPmQuestionBtn:hover {
          color: #b8ffd8 !important;
          text-shadow: 0 0 12px rgba(0, 255, 65, 0.35);
        }
        .zionBetLight {
          --color-background-primary: #ffffff;
          --color-background-secondary: #f9fafb;
          --color-border-tertiary: #e5e7eb;
          --color-text-primary: #111827;
          --color-text-secondary: #6b7280;
          --zb-card-bg: #ffffff;
          --zb-card-border: #e5e7eb;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        }
        @media (prefers-color-scheme: dark) {
          .zionBetLight {
            --color-background-primary: #1a1a1a;
            --color-background-secondary: #262626;
            --color-border-tertiary: #374151;
            --color-text-primary: #f3f4f6;
            --color-text-secondary: #9ca3af;
            --zb-card-bg: #1a1a1a;
            --zb-card-border: #374151;
          }
        }
        .zionBetCatTabs {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin: 0 0 16px;
          padding-bottom: 0;
          border-bottom: none;
        }
        .zionBetCatTab {
          padding: 5px 14px;
          border-radius: 20px;
          border: 1px solid #1e2d3d;
          background: #0d1117;
          color: #8b9ab1;
          font-size: 12px;
          cursor: pointer;
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-weight: 500;
        }
        .zionBetCatTab:hover {
          color: #e6edf3;
          border-color: #4DA2FF;
        }
        .zionBetCatTabActive {
          background: #4DA2FF;
          border: none;
          color: #ffffff;
          box-shadow: none;
        }
        .zionBetCatTabActive.zionBetCatTabActive--zion {
          background: #4DA2FF;
          border: none;
        }
        .zionBetPmRow {
          width: 100%;
          margin-bottom: 8px;
        }
        .zionBetPmMain {
          min-width: 0;
        }
        @media (max-width: 720px) {
          .zionBetPmRow {
            flex-direction: column !important;
            gap: 16px !important;
          }
          .zionBetPmSidebarCol {
            width: 100% !important;
          }
        }
        .zionBetPmCardGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          align-items: stretch;
        }
        .zionBetPmCardGrid--mobile {
          grid-template-columns: 1fr;
        }
        @media (max-width: 1100px) {
          .zionBetPmCardGrid:not(.zionBetPmCardGrid--mobile) {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        .zionBetMarketCard {
          position: relative;
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
          padding: 12px 14px;
          border-radius: 8px;
          border: 1px solid var(--zb-card-border, #e5e7eb);
          background: var(--zb-card-bg, #ffffff);
          cursor: pointer;
          transition: box-shadow 0.15s ease;
          box-sizing: border-box;
          box-shadow: none;
        }
        .zionBetMarketCard:hover {
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
        }
        .zionBetMarketCard--zion {
          border-left: 3px solid #16a34a;
        }
        .zionBetMarketCardZionBadge {
          position: absolute;
          top: 8px;
          right: 8px;
          font-size: 9px;
          font-weight: 600;
          color: #16a34a;
          letter-spacing: 0.02em;
        }
        .zionBetMarketCardHead {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          margin-bottom: 6px;
        }
        .zionBetMarketCardEmoji {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
        }
        .zionBetMarketCardQuestion {
          margin: 0;
          font-size: 13px;
          font-weight: 500;
          line-height: 1.4;
          color: #111827;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          flex: 1;
          min-width: 0;
        }
        .zionBetMarketCardMeta {
          margin: 0 0 6px;
          font-size: 11px;
          color: #9ca3af;
        }
        .zionBetMarketCardOddsBar {
          height: 3px;
          border-radius: 2px;
          background: #f3f4f6;
          overflow: hidden;
          margin: 6px 0 8px;
        }
        .zionBetMarketCardOddsFill {
          height: 100%;
          background: #16a34a;
          border-radius: 2px;
        }
        .zionBetMarketCardActions {
          display: flex;
          gap: 6px;
          margin-top: auto;
        }
        .zionBetMarketCardBtn {
          flex: 1;
          border: none;
          border-radius: 4px;
          padding: 4px 12px;
          height: 28px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: ui-sans-serif, system-ui, sans-serif;
          line-height: 1;
        }
        .zionBetMarketCardBtn--yes {
          background: #16a34a;
          color: #ffffff;
        }
        .zionBetMarketCardBtn--no {
          background: #dc2626;
          color: #ffffff;
        }
        .zionBetDetailOverlay {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          z-index: 9999 !important;
          background: #ffffff !important;
          color: #111827;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        }
        .zionBetDetailOverlay .zionBetDetailTopBar {
          background: #ffffff;
          border-bottom: 1px solid #e5e7eb;
          height: 48px;
          min-height: 48px;
          padding: 0 24px;
          display: flex;
          align-items: center;
          box-sizing: border-box;
        }
        .zionBetDetailBackLink {
          background: none;
          border: none;
          padding: 0;
          color: #6b7280;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          font-family: inherit;
        }
        .zionBetDetailBackLink:hover {
          color: #111827;
          text-decoration: underline;
        }
        .zionBetDetailOverlay .zionBetDetailHero {
          background: #ffffff;
          border-bottom: 1px solid #e5e7eb;
          padding: 24px 32px;
        }
        .zionBetDetailOverlay .zionBetDetailPanel {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          color: #374151;
        }
        .zionBetDetailOverlay .zionBetDetailChart {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }
        .zionBetPlaceBetCard {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 20px;
        }
        .zionBetPlaceBetYes {
          width: 100%;
          height: 40px;
          margin-bottom: 8px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
        }
        .zionBetPlaceBetYes--on {
          background: #16a34a;
          color: #fff;
        }
        .zionBetPlaceBetYes--off {
          background: #f3f4f6;
          color: #374151;
          border: 1px solid #d1d5db;
        }
        .zionBetPlaceBetNo {
          width: 100%;
          height: 40px;
          margin-bottom: 14px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
        }
        .zionBetPlaceBetNo--on {
          background: #dc2626;
          color: #fff;
          border: none;
        }
        .zionBetPlaceBetNo--off {
          background: #f3f4f6;
          color: #374151;
          border: 1px solid #d1d5db;
        }
        .zionBetPlaceBetInput {
          width: 100%;
          height: 36px;
          padding: 0 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          box-sizing: border-box;
          margin-bottom: 12px;
          font-family: inherit;
        }
        .zionBetPlaceBetSubmit {
          width: 100%;
          height: 44px;
          border: none;
          border-radius: 6px;
          background: #111827;
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
        }
        .zionBetPlaceBetSubmit:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .zionBetDetailSectionTitle {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #6b7280;
          margin: 0 0 12px;
        }
        .zionBetDetailPill {
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 999px;
          background: #f3f4f6;
          color: #6b7280;
          font-weight: 500;
        }
        .zionBetGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          column-gap: 16px;
          row-gap: 16px;
          align-items: stretch;
        }
        /* Polymarket-style market cards */
        .zionBetCard {
          background: rgba(15, 20, 15, 0.95);
          border: 1px solid rgba(0, 255, 65, 0.2);
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 100%;
          box-sizing: border-box;
        }
        .zionBetGrid .zionBetCard {
          margin-bottom: 0;
        }
        @media (min-width: 769px) {
          .zionBetGrid > .zionBetCard:nth-child(n + 3) {
            border-top: 1px solid rgba(0, 255, 65, 0.1);
          }
        }
        @media (max-width: 768px) {
          .zionBetGrid > .zionBetCard:nth-child(n + 2) {
            border-top: 1px solid rgba(0, 255, 65, 0.1);
          }
        }
        .zbPmQuestion {
          margin: 0;
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: clamp(1rem, 2.2vw, 1.18rem);
          font-weight: 700;
          line-height: 1.35;
          color: #f2f7f5;
          letter-spacing: -0.02em;
        }
        .zbPmBadge {
          align-self: flex-start;
          padding: 4px 11px;
          border-radius: 6px;
          border: 1px solid;
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 0.58rem;
          letter-spacing: 0.14em;
          background: rgba(0, 0, 0, 0.35);
        }
        .zbPmOutcomeRow {
          display: flex;
          gap: 12px;
          margin: 16px 0;
          align-items: stretch;
        }
        .zbPmOutcome {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          gap: 6px;
          min-width: 120px;
          padding: 12px 24px;
          border-radius: 8px;
          border-width: 2px;
          border-style: solid;
          cursor: pointer;
          font-family: Orbitron, ui-monospace, monospace;
          font-size: 1.1rem;
          font-weight: bold;
          box-sizing: border-box;
          transition:
            box-shadow 0.15s ease,
            border-color 0.15s ease,
            opacity 0.12s ease;
        }
        .zbPmOutcome:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .zbPmOutcomeYes {
          background: rgba(0, 200, 80, 0.15);
          border-color: #00c850;
          color: #00c850;
        }
        .zbPmOutcomeYes:hover:not(:disabled) {
          box-shadow: 0 0 18px rgba(0, 200, 80, 0.35);
        }
        .zbPmOutcomeYes.zbPmOutcomeActive {
          box-shadow: 0 0 0 2px rgba(0, 255, 65, 0.35), 0 4px 16px rgba(0, 200, 80, 0.25);
        }
        .zbPmOutcomeNo {
          background: rgba(255, 50, 50, 0.15);
          border-color: #ff3232;
          color: #ff3232;
        }
        .zbPmOutcomeNo:hover:not(:disabled) {
          box-shadow: 0 0 18px rgba(255, 50, 50, 0.35);
        }
        .zbPmOutcomeNo.zbPmOutcomeActive {
          box-shadow: 0 0 0 2px rgba(255, 50, 80, 0.35), 0 4px 16px rgba(255, 50, 50, 0.22);
        }
        .zbPmOutcomeLabel {
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.14em;
        }
        .zbPmOutcomePrice {
          font-size: 1.1rem;
          font-weight: bold;
          letter-spacing: 0.03em;
        }
        .zbPmTabsWrap {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .zbPmTabsRow {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin: 12px 0 8px;
        }
        .zbPmTabGroup {
          display: flex;
          gap: 4px;
        }
        .zbPmTab {
          padding: 6px 16px;
          border-radius: 6px;
          font-family: Orbitron, monospace;
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          cursor: pointer;
          background: transparent;
          border: 1px solid rgba(0, 255, 65, 0.2);
          color: rgba(0, 255, 65, 0.5);
          transition:
            background 0.12s ease,
            border-color 0.12s ease,
            color 0.12s ease;
        }
        .zbPmTab:hover {
          color: rgba(0, 255, 65, 0.85);
          border-color: rgba(0, 255, 65, 0.45);
        }
        .zbPmTabOn {
          background: rgba(0, 255, 65, 0.2);
          border: 1px solid #00ff41;
          color: #00ff41;
        }
        .zbPmTabDivider {
          width: 1px;
          height: 24px;
          background: rgba(0, 255, 65, 0.15);
          flex-shrink: 0;
        }
        .zbPmSoon {
          margin: 0;
          font-size: 0.62rem;
          letter-spacing: 0.08em;
          color: rgba(255, 200, 120, 0.85);
        }
        .zbPmAmountBlock {
          margin: 12px 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .zbPmAmountLabelRow {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0;
        }
        .zbPmAmountLabel {
          color: rgba(0, 255, 65, 0.6);
          font-size: 0.8rem;
          margin-bottom: 6px;
        }
        .zbPmAmountValue {
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 1.5rem;
          color: #fff;
          font-weight: bold;
        }
        .zbPmPresets {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .zbPmPresetBtn {
          padding: 6px 12px;
          border-radius: 6px;
          border: 1px solid rgba(0, 255, 65, 0.3);
          background: transparent;
          color: rgba(0, 255, 65, 0.85);
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 0.65rem;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition:
            border-color 0.12s ease,
            background 0.12s ease;
        }
        .zbPmPresetBtn:hover:not(:disabled) {
          background: rgba(0, 255, 65, 0.08);
          border-color: rgba(0, 255, 65, 0.5);
        }
        .zbPmPresetBtn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .zbPmPlaceBtn {
          width: 100%;
          padding: 14px;
          margin-top: 12px;
          border-radius: 8px;
          border: 1px solid #00ff41;
          background: rgba(0, 255, 65, 0.15);
          color: #00ff41;
          font-family: Orbitron, monospace;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          cursor: pointer;
          transition:
            opacity 0.12s ease,
            box-shadow 0.12s ease;
        }
        .zbPmPlaceBtn:hover:not(:disabled) {
          box-shadow: 0 0 20px rgba(0, 255, 65, 0.25);
        }
        .zbPmPlaceBtn:disabled {
          opacity: 0.38;
          cursor: not-allowed;
        }
        .zbPmPotential {
          margin: 0;
          text-align: center;
          font-size: 0.62rem;
          letter-spacing: 0.12em;
          color: rgba(255, 224, 160, 0.88);
        }
        .zbPmPotential strong {
          color: #ffe8b8;
          font-weight: 700;
        }
        .zbPmWalletGate {
          margin: 0;
          padding: 14px 12px;
          text-align: center;
          font-size: 0.68rem;
          letter-spacing: 0.12em;
          color: #ffc266;
          border: 1px dashed rgba(255, 180, 80, 0.35);
          border-radius: 10px;
          background: rgba(28, 18, 4, 0.45);
        }
        .zionBetWalletGate {
          margin: 0 auto 12px;
          padding: 12px 10px;
          text-align: center;
          font-size: 0.72rem;
          letter-spacing: 0.14em;
          color: #ffc266;
          border: 1px dashed rgba(255, 180, 80, 0.4);
          border-radius: 8px;
          background: rgba(35, 22, 0, 0.35);
        }
        .zionBetWalletGateCenter {
          max-width: 420px;
          margin-left: auto;
          margin-right: auto;
        }
        .zionBetEmptyMy {
          margin: 0;
          padding: 16px;
          text-align: center;
          font-size: 0.72rem;
          color: rgba(150, 210, 175, 0.65);
          letter-spacing: 0.1em;
          border: 1px dashed rgba(0, 255, 65, 0.2);
          border-radius: 10px;
        }
        .zionBetMyList {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .zionBetMyRow {
          border-radius: 10px;
          border: 1px solid rgba(0, 255, 65, 0.18);
          background: rgba(0, 0, 0, 0.55);
          padding: 12px 14px;
        }
        .zionBetMyMain {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 8px;
        }
        .zionBetMyQ {
          font-size: 0.72rem;
          line-height: 1.4;
          color: rgba(220, 250, 230, 0.95);
        }
        .zionBetMyPick {
          font-size: 0.62rem;
          color: rgba(160, 210, 180, 0.85);
          letter-spacing: 0.06em;
        }
        .zionBetMyPick strong {
          color: #00ff88;
        }
        .zionBetMyFoot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .zionBetMyType {
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 0.55rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(130, 200, 165, 0.65);
        }
        .zionBetResult {
          font-family: Orbitron, monospace;
          font-size: 0.68rem;
          letter-spacing: 0.18em;
          padding: 3px 10px;
          border-radius: 6px;
          border: 1px solid;
        }
        .zionBetResultWin {
          color: #00ff41;
          border-color: rgba(0, 255, 65, 0.5);
          background: rgba(0, 40, 12, 0.5);
          box-shadow: 0 0 12px rgba(0, 255, 65, 0.2);
        }
        .zionBetResultLoss {
          color: #ff4444;
          border-color: rgba(255, 68, 68, 0.55);
          background: rgba(40, 0, 0, 0.5);
          box-shadow: 0 0 12px rgba(255, 68, 68, 0.22);
        }
        .zionBetResultPending {
          color: #ffeb3b;
          border-color: rgba(255, 235, 59, 0.55);
          background: rgba(45, 40, 0, 0.55);
          box-shadow: 0 0 14px rgba(255, 235, 59, 0.2);
        }
        @media (max-width: 768px) {
          .zionBetGrid {
            grid-template-columns: 1fr;
          }
        }
        .faucetTab {
          max-width: 520px;
          margin: 0 auto;
          padding: 8px 4px 24px;
        }
        .faucetLabel {
          display: block;
          font-size: 0.62rem;
          color: rgba(180, 230, 195, 0.8);
          margin-bottom: 6px;
          letter-spacing: 0.12em;
        }
        .faucetPointsBig {
          margin: 0 0 16px;
          font-size: 0.85rem;
          letter-spacing: 0.14em;
          color: #00ff41;
          text-align: center;
        }
        .faucetPointsBig strong {
          font-size: 1.15rem;
        }
        .faucetInputLarge {
          width: 100%;
          box-sizing: border-box;
          margin-bottom: 12px;
          padding: 12px 14px;
          border-radius: 8px;
          border: 1px solid rgba(0, 255, 65, 0.4);
          background: rgba(0, 0, 0, 0.55);
          color: #e8ffe8;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 0.8rem;
        }
        .cooldownBanner {
          margin: 0 0 14px;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 180, 80, 0.35);
          background: rgba(40, 25, 0, 0.45);
          color: #ffc266;
          font-size: 0.78rem;
          text-align: center;
        }
        .faucetBtnLarge {
          width: 100%;
          padding: 16px 20px;
          border-radius: 10px;
          border: 2px solid rgba(0, 255, 65, 0.55);
          background: rgba(0, 55, 18, 0.65);
          color: #00ff41;
          font-size: 0.95rem;
          letter-spacing: 0.18em;
          font-family: Orbitron, monospace;
          cursor: pointer;
          margin-bottom: 28px;
          box-shadow: 0 0 24px rgba(0, 255, 65, 0.15);
        }
        .faucetBtnLarge:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          box-shadow: none;
        }
        .referralBlock {
          margin-top: 8px;
        }
        .referralTitle {
          margin: 0 0 8px;
          font-size: 0.68rem;
          letter-spacing: 0.14em;
          color: rgba(170, 230, 190, 0.85);
        }
        .referralRow {
          display: flex;
          gap: 8px;
          align-items: stretch;
        }
        .referralInput {
          flex: 1;
          min-width: 0;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(0, 255, 65, 0.28);
          background: rgba(0, 0, 0, 0.5);
          color: #c8f0d8;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 0.65rem;
        }
        .referralCopyBtn {
          padding: 0 16px;
          border-radius: 8px;
          border: 1px solid rgba(0, 255, 65, 0.4);
          background: rgba(0, 35, 12, 0.7);
          color: #00ff41;
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          cursor: pointer;
          font-family: Orbitron, monospace;
        }
        .referralCopyBtn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .header {
          margin-bottom: 0;
        }
        .header h1 {
          margin: 0;
          font-size: clamp(2.8rem, 7vw, 5.2rem);
          color: #00ff41;
          text-shadow: 0 0 30px #00ff41, 0 0 60px #00ff41;
          letter-spacing: 0.12em;
        }
        .header p {
          margin: 8px 0 0;
          color: rgba(186, 233, 255, 0.85);
        }
        .statsGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }
        .statCard {
          border-radius: 12px;
          border: 1px solid rgba(0, 255, 65, 0.3);
          background: rgba(255, 255, 255, 0.03);
          padding: 14px;
          backdrop-filter: blur(8px);
          box-shadow: 0 0 15px rgba(0, 255, 65, 0.1);
        }
        .statCard p {
          margin: 0;
          font-size: 0.7rem;
          color: rgba(215, 237, 255, 0.72);
        }
        .statCard h3 {
          margin: 7px 0 0;
          font-size: 2rem;
          color: #00ff41;
        }
        .statCard.cyan { border-color: rgba(0, 255, 65, 0.3); box-shadow: 0 0 15px rgba(0, 255, 65, 0.1); }
        .statCard.gold { border-color: rgba(0, 255, 65, 0.3); box-shadow: 0 0 15px rgba(0, 255, 65, 0.1); }
        .statCard.red { border-color: rgba(0, 255, 65, 0.3); box-shadow: 0 0 15px rgba(0, 255, 65, 0.1); }
        .statCard.purple { border-color: rgba(0, 255, 65, 0.3); box-shadow: 0 0 15px rgba(0, 255, 65, 0.1); }
        .civilizationSidebarRow {
          display: flex;
          justify-content: flex-end;
          align-items: stretch;
          gap: 16px;
          margin-bottom: 18px;
        }
        .civilizationSidebarRowFill {
          flex: 1;
          min-width: 0;
          min-height: 1px;
        }
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @keyframes agentMapPulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.3); opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeInUpSemi {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 0.6; transform: translateY(0); }
        }
        .civilizationSidebar {
          width: 380px;
          max-width: 100%;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .sidebarSectionTitle {
          margin: 0 0 4px;
          color: #9de8ff;
          font-size: 0.72rem;
          letter-spacing: 0.18em;
        }
        .sidebarHint {
          margin: 0 0 8px;
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 0.55rem;
          letter-spacing: 0.1em;
          color: rgba(130, 200, 160, 0.55);
        }
        .sidebarAgentConvWrap {
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1;
        }
        .agentConvFeed {
          display: flex;
          flex-direction: column;
          gap: 0;
          max-height: min(420px, 52vh);
          overflow-y: auto;
          padding-right: 4px;
          scrollbar-width: thin;
          scrollbar-color: rgba(0, 255, 65, 0.35) rgba(0, 0, 0, 0.4);
        }
        .agentConvEmpty {
          margin: 0;
          padding: 24px 12px;
          text-align: center;
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 0.72rem;
          color: rgba(150, 210, 170, 0.55);
          letter-spacing: 0.1em;
        }
        .agentConvCard {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 12px 12px 14px;
          border-radius: 10px;
          border: 1px solid rgba(0, 255, 65, 0.2);
          background: rgba(0, 0, 0, 0.78);
          box-shadow: inset 0 0 32px rgba(0, 0, 0, 0.65);
        }
        .agentConvCardCompact {
          gap: 8px;
          padding: 10px 10px 12px;
          border-radius: 8px;
        }
        .agentConvCardSep {
          border-bottom: 1px solid rgba(0, 255, 65, 0.18);
          margin-bottom: 10px;
          padding-bottom: 10px;
        }
        .agentConvBadge {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 6px 8px;
          border-radius: 6px;
          background: rgba(0, 30, 12, 0.5);
          border: 1px solid rgba(0, 255, 65, 0.12);
        }
        .agentConvBadgeCompact {
          padding: 4px 6px;
          border-radius: 5px;
        }
        .agentConvBadgeCompact .agentConvBadgeText {
          font-size: 0.56rem;
        }
        .agentConvBadgeEmoji {
          font-size: 1.1rem;
          line-height: 1.2;
        }
        .agentConvBadgeText {
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 0.6rem;
          line-height: 1.35;
          color: rgba(180, 240, 200, 0.8);
        }
        .agentConvThread {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .agentConvThreadCompact {
          gap: 8px;
        }
        .agentConvRow {
          display: flex;
          flex-direction: column;
          gap: 5px;
          max-width: 100%;
        }
        .agentConvRowLeft {
          align-items: flex-start;
        }
        .agentConvRowRight {
          align-items: flex-end;
          text-align: right;
        }
        .agentConvMeta {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          font-size: 0.62rem;
          letter-spacing: 0.06em;
        }
        .agentConvMetaRight {
          justify-content: flex-end;
          flex-direction: row-reverse;
        }
        .agentConvMeta strong {
          font-family: Orbitron, monospace;
          font-size: 0.68rem;
          color: #eafcf0;
        }
        .agentConvClassTag {
          font-size: 0.52rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          opacity: 0.85;
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid rgba(0, 255, 65, 0.18);
          background: rgba(0, 0, 0, 0.35);
        }
        .agentConvBubble {
          margin: 0;
          padding: 9px 11px;
          border-radius: 8px;
          border: 1px solid rgba(0, 255, 65, 0.35);
          background: rgba(0, 8, 4, 0.92);
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 0.65rem;
          line-height: 1.45;
          color: rgba(215, 245, 225, 0.95);
          max-width: 100%;
          word-break: break-word;
          box-sizing: border-box;
        }
        .agentConvBubbleLeft {
          align-self: flex-start;
          max-width: 96%;
        }
        .agentConvBubbleRight {
          align-self: flex-end;
          max-width: 96%;
        }
        .agentConvBubbleAgent2 {
          font-style: italic;
          color: rgba(195, 235, 215, 0.92);
        }
        h2 {
          margin: 0 0 10px;
          color: #9de8ff;
          font-size: 0.92rem;
          letter-spacing: 0.18em;
        }
        .agentGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .agentCard {
          border-radius: 8px;
          padding: 16px;
          margin: 0;
          box-sizing: border-box;
          border: 2px solid #333;
          background: rgba(8, 12, 8, 0.98);
          min-height: 120px;
          position: relative;
          z-index: 5;
        }
        .agentNameTitle {
          display: block;
          font-size: 0.9rem;
          letter-spacing: 0.05em;
          font-family: Orbitron, monospace;
          font-weight: 700;
          line-height: 1.25;
          word-break: break-word;
          padding-right: 40px;
          margin-bottom: 6px;
        }
        .agentCard.clickable {
          cursor: pointer;
          transition: box-shadow 0.15s ease;
        }
        .agentCard.clickable:hover {
          box-shadow: 0 0 14px rgba(0, 255, 65, 0.22);
        }
        .small {
          margin: 6px 0;
          color: rgba(190, 219, 255, 0.78);
          font-size: 0.66rem;
        }
        .bar {
          height: 4px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.08);
        }
        .fill {
          height: 100%;
          box-shadow: 0 0 10px currentColor;
        }
        .traits {
          margin-top: 8px;
          display: grid;
          gap: 4px;
        }
        .traitRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.58rem;
          color: rgba(120, 255, 160, 0.88);
          letter-spacing: 0.04em;
        }
        .traitStars {
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 0.7rem;
          letter-spacing: 0.04em;
          color: #ffe07a;
        }
        .clanGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .clanCard {
          border-radius: 10px;
          border: 1px solid rgba(0, 255, 65, 0.3);
          padding: 12px;
          background: rgba(0, 10, 0, 0.78);
        }
        .clanCard h3 {
          margin: 0 0 8px;
          color: #ffe79d;
          font-size: 0.9rem;
        }
        .clanCard p {
          margin: 0 0 5px;
          color: #d1ecff;
          font-size: 0.72rem;
        }
        .leaderboardSection {
          margin-top: 4px;
        }
        .leaderboardWrap {
          overflow-x: auto;
          border-radius: 10px;
          border: 1px solid rgba(0, 255, 65, 0.28);
          background: rgba(0, 8, 0, 0.75);
        }
        .leaderboardTable {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.72rem;
        }
        .leaderboardTable th,
        .leaderboardTable td {
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid rgba(0, 255, 65, 0.12);
        }
        .leaderboardTable th {
          color: rgba(160, 255, 190, 0.85);
          font-size: 0.62rem;
          letter-spacing: 0.12em;
        }
        .leaderboardTable td {
          color: #c8f5d8;
        }
        .leaderboardEmpty {
          text-align: center;
          color: rgba(160, 230, 180, 0.65);
          padding: 18px !important;
        }
        .chatModalBackdrop {
          position: fixed;
          inset: 0;
          z-index: 40;
          background: rgba(0, 0, 0, 0.78);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }
        .chatModal {
          width: min(520px, 100%);
          max-height: min(640px, 92vh);
          display: flex;
          flex-direction: column;
          border: 2px solid #00ff41;
          border-radius: 12px;
          background: rgba(0, 6, 0, 0.97);
          padding: 14px;
          box-shadow: 0 0 48px rgba(0, 255, 65, 0.22);
        }
        .chatLabel {
          font-size: 0.58rem;
          letter-spacing: 0.12em;
          color: rgba(170, 235, 190, 0.8);
          margin-bottom: 4px;
        }
        .chatWalletInput {
          width: 100%;
          box-sizing: border-box;
          margin-bottom: 12px;
          padding: 8px 10px;
          border-radius: 6px;
          border: 1px solid rgba(0, 255, 65, 0.4);
          background: rgba(0, 0, 0, 0.55);
          color: #e8ffe8;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 0.72rem;
        }
        .chatModalHead {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 6px;
        }
        .chatModalHead h3 {
          margin: 0;
          font-size: 0.95rem;
          color: #00ff41;
        }
        .chatClassTag {
          font-size: 0.58rem;
          letter-spacing: 0.1em;
        }
        .chatClose {
          border: none;
          background: transparent;
          color: rgba(200, 255, 210, 0.75);
          font-size: 1.4rem;
          line-height: 1;
          cursor: pointer;
          padding: 0 4px;
        }
        .chatCostLine {
          margin: 0 0 10px;
          font-size: 0.62rem;
          color: rgba(160, 230, 180, 0.85);
          letter-spacing: 0.06em;
        }
        .chatMessages {
          flex: 1;
          overflow-y: auto;
          min-height: 160px;
          max-height: 340px;
          margin-bottom: 12px;
          padding: 8px;
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.45);
          border: 1px solid rgba(0, 255, 65, 0.15);
        }
        .chatBubble {
          margin-bottom: 8px;
          padding: 8px 10px;
          border-radius: 8px;
          font-size: 0.72rem;
          line-height: 1.35;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .chatBubble.user {
          margin-left: 12%;
          background: rgba(0, 60, 20, 0.55);
          border: 1px solid rgba(0, 255, 65, 0.25);
          color: #d8ffe4;
        }
        .chatBubble.agent {
          margin-right: 12%;
          background: rgba(0, 25, 40, 0.45);
          border: 1px solid rgba(0, 255, 65, 0.18);
          color: #b4ffd9;
        }
        .chatBubble.typing {
          opacity: 0.75;
        }
        .chatComposer {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .chatTextInput {
          flex: 1;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid rgba(0, 255, 65, 0.35);
          background: rgba(0, 0, 0, 0.5);
          color: #e8ffe8;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 0.75rem;
        }
        .chatSendBtn {
          padding: 10px 16px;
          border-radius: 8px;
          border: 1px solid #00ff41;
          background: rgba(0, 50, 15, 0.55);
          color: #00ff41;
          font-size: 0.68rem;
          letter-spacing: 0.14em;
          cursor: pointer;
        }
        .chatSendBtn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        @keyframes nebulaMove {
          0% { transform: scale(1) translate3d(0, 0, 0); }
          100% { transform: scale(1.06) translate3d(1.5%, -1.5%, 0); }
        }
        @media (max-width: 1200px) {
          .civilizationSidebarRow {
            flex-direction: column;
          }
          .civilizationSidebarRowFill {
            display: none;
          }
          .civilizationSidebar {
            width: 100%;
          }
          .agentGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .chatClassFilters {
            grid-template-columns: 1fr;
          }
          .chatClassFiltersFull {
            min-height: auto;
          }
          .chronicleTickerItem {
            width: min(320px, 85vw);
          }
        }
        @media (max-width: 900px) {
          .statsGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .clanGrid {
            grid-template-columns: 1fr;
          }
          .mainNav {
            margin-left: -16px;
            margin-right: -16px;
            padding-left: 10px;
            padding-right: 10px;
          }
        }
          .chronicleTickerItem {
            width: min(300px, 88vw);
          }
      `}</style>

      {detailMarket && detailOverlayMounted
        ? createPortal(
            <ZionBetMarketDetailOverlay
              apiMarket={detailMarket}
              walletConnected={Boolean(walletAddress.trim())}
              walletAddress={walletAddress}
              myBets={myBets}
              betAmount={betAmount}
              setBetAmount={setBetAmount}
              betCurrency={betCurrency}
              setBetCurrency={setBetCurrency}
              betLoading={betLoading}
              onPlaceBet={(market, direction) => void handlePlaceCardBet(market, direction)}
              onClose={() => setDetailMarket(null)}
            />,
            document.body
          )
        : null}

      {betModal?.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setBetModal(null)}
        >
          <div
            style={{
              background: "#0a0a0a",
              border: "1px solid #00ff4144",
              borderRadius: "12px",
              padding: "28px",
              width: "400px",
              maxWidth: "90vw",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  color: "#555",
                  fontFamily: "monospace",
                  fontSize: "0.7rem",
                  marginBottom: "4px",
                }}
              >
                {betModal.market.token} · {betModal.market.timeframe}
              </div>
              <div style={{ color: "#fff", fontFamily: "monospace", fontSize: "0.95rem", lineHeight: "1.4" }}>
                {betModal.market.question}
              </div>
            </div>

            <div
              style={{
                display: "inline-block",
                marginBottom: "20px",
                padding: "6px 16px",
                borderRadius: "6px",
                fontFamily: "monospace",
                fontWeight: "bold",
                background: betModal.direction ? "rgba(0,255,65,0.15)" : "rgba(255,65,65,0.15)",
                color: betModal.direction ? "#00ff41" : "#ff4141",
                border: `1px solid ${betModal.direction ? "#00ff4144" : "#ff414144"}`,
                fontSize: "0.9rem",
              }}
            >
              {betModal.direction ? "▲ YES" : "▼ NO"} —{" "}
              {betModal.direction
                ? zionBetDisplayOdds(betModal.market).yes
                : zionBetDisplayOdds(betModal.market).no}
              ¢
            </div>

            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              {(["SUI", "USDC"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBetCurrency(c)}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    fontSize: "0.8rem",
                    fontWeight: "bold",
                    background: betCurrency === c ? "rgba(0,255,65,0.15)" : "transparent",
                    border: `1px solid ${betCurrency === c ? "#00ff41" : "#333"}`,
                    color: betCurrency === c ? "#00ff41" : "#555",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: "16px" }}>
              <div
                style={{ color: "#555", fontFamily: "monospace", fontSize: "0.7rem", marginBottom: "6px" }}
              >
                Amount ({betCurrency})
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  background: "#111",
                  border: "1px solid #333",
                  color: "#fff",
                  fontFamily: "monospace",
                  fontSize: "1rem",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {(() => {
              const oddsCents = betModal.direction
                ? zionBetDisplayOdds(betModal.market).yes
                : zionBetDisplayOdds(betModal.market).no;
              const amt = parseFloat(betAmount || "0");
              const payout = oddsCents > 0 ? amt * (100 / oddsCents) : 0;
              return (
                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid #222",
                    borderRadius: "6px",
                    padding: "12px",
                    marginBottom: "20px",
                    fontFamily: "monospace",
                    fontSize: "0.8rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ color: "#555" }}>Odds</span>
                    <span style={{ color: "#fff" }}>{oddsCents}¢</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ color: "#555" }}>Potential payout</span>
                    <span style={{ color: "#00ff41" }}>
                      {payout.toFixed(3)} {betCurrency}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#555" }}>Profit</span>
                    <span style={{ color: "#00d4ff" }}>
                      +{(payout - amt).toFixed(3)} {betCurrency}
                    </span>
                  </div>
                </div>
              );
            })()}

            <button
              type="button"
              disabled={betLoading || !account?.address}
              onClick={() => {
                if (!betModal) return;
                void handlePlaceCardBet(betModal.market, betModal.direction);
              }}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "8px",
                cursor: betLoading || !account?.address ? "not-allowed" : "pointer",
                fontFamily: "monospace",
                fontSize: "0.9rem",
                fontWeight: "bold",
                opacity: betLoading || !account?.address ? 0.5 : 1,
                background: betModal.direction ? "rgba(0,255,65,0.2)" : "rgba(255,65,65,0.2)",
                border: `1px solid ${betModal.direction ? "#00ff41" : "#ff4141"}`,
                color: betModal.direction ? "#00ff41" : "#ff4141",
              }}
            >
              {betLoading
                ? "Placing..."
                : `Place ${betModal.direction ? "YES" : "NO"} Bet — ${betAmount} ${betCurrency}`}
            </button>

            {!account?.address && (
              <div
                style={{
                  textAlign: "center",
                  color: "#555",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  marginTop: "8px",
                }}
              >
                Connect wallet to place bets
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
