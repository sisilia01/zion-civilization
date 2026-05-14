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
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { generateZionMarkets, suiClient, type ZionMarket } from "@/lib/deepbook";
import { generateSampleEvents, storeCivEvent, type CivilizationEvent } from "@/lib/walrus";
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
}

interface NautilusDecision {
  agent: string;
  decision: string;
  reason: string;
  confidence: number;
  tx_hash: string;
  explorer_url: string;
}

const MATRIX_CHARS =
  "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ";

const bgChars = MATRIX_CHARS;

const classMeta = (agentClass: string) => {
  if (agentClass === "elite") {
    return { icon: "👑", border: "#FFD700", tier: "tier-elite" as const };
  }
  if (agentClass === "middle") {
    return { icon: "⚡", border: "#C0C0C0", tier: "tier-middle" as const };
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
  | "15m"
  | "1h"
  | "4h"
  | "24h"
  | "7d"
  | "monthly"
  | "yearly";

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
  /** Total ZION staked on this market (sum of bet amounts). */
  volume_zion?: number;
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

const ZIONBET_TIMEFRAME_SIDEBAR_ROWS: { key: ZionBetTimeframeFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "15m", label: "15 min" },
  { key: "1h", label: "1 hour" },
  { key: "4h", label: "4 hours" },
  { key: "24h", label: "Daily" },
  { key: "7d", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

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

function zionBetMarketFromZionSource(m: ZionMarket): ZionBetMarket {
  const category = zionBetCategorySlugFromLabel(m.category);
  const timeframe = zionBetTfKeyFromZionMarket(m.timeframe);
  const idSafe = m.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const expires =
    m.expiresAt instanceof Date ? m.expiresAt : new Date(m.expiresAt as unknown as string | number);
  return {
    id: m.id,
    question: m.question,
    event_type: `deepbook_${idSafe}`,
    timeframe,
    category,
    market_kind: "updown",
    token: m.token,
    yes_cents: Math.max(1, Math.min(99, Math.round(m.yesPrice))),
    no_cents: Math.max(1, Math.min(99, Math.round(m.noPrice))),
    volume_zion: m.volume,
    resolves_at_iso: expires.toISOString(),
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

type TabId = "civilization" | "chat" | "zionbet" | "leaderboard" | "faucet" | "press" | "bank";

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

function ZionBetTradingControls({
  bet,
  walletConnected,
  busyYes,
  busyNo,
  suiPrice,
  onPlace: _onPlace,
}: {
  bet: ZionBetMarket;
  walletConnected: boolean;
  busyYes: boolean;
  busyNo: boolean;
  suiPrice?: number;
  onPlace: (bet: ZionBetMarket, prediction: boolean, amount: number) => void;
}) {
  const account = useCurrentAccount();
  const walletAddress = account?.address || "";
  const { mutate: signAndExecute, isPending: signAndExecutePending } = useSignAndExecuteTransaction();
  const [betAmount, setBetAmount] = useState(1);
  const [currency, setCurrency] = useState<"ZION" | "SUI" | "USDC">("ZION");
  const [selectedSide, setSelectedSide] = useState<"yes" | "no" | null>(null);
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");

  useEffect(() => {
    setSelectedSide(null);
  }, [bet.id]);

  const { yes: yesDisp, no: noDisp } = zionBetDisplayOdds(bet);
  const placing =
    selectedSide === "yes" ? busyYes : selectedSide === "no" ? busyNo : false;
  const anyBusy = busyYes || busyNo || signAndExecutePending;
  const buyMarket = tradeMode === "buy" && orderType === "market";
  /** Place order only for Buy+Market; wallet + not busy. Amount checked in onClick. */
  const placeButtonDisabled =
    !walletConnected || anyBusy || !buyMarket || selectedSide === null;

  const handlePlaceBet = async () => {
    console.log("walletAddress:", walletAddress);
    console.log("selectedSide:", selectedSide);
    console.log("betAmount:", betAmount);
    const w = walletAddress.trim();
    if (!w) {
      alert("Connect wallet first!");
      return;
    }
    if (selectedSide == null) {
      alert("Select YES or NO first!");
      return;
    }

    try {
      const tx = new Transaction();
      const betAmountRaw = BigInt(betAmount) * BigInt(1_000_000_000);

      if (currency === "SUI") {
        const [betCoin] = tx.splitCoins(tx.gas, [betAmountRaw]);
        tx.moveCall({
          target: "0xfadbe56d6891baf0715fd9a61e4cc46e826882ecb3cc04719ff7046ed999bd81::civilization::place_bet",
          arguments: [
            tx.object("0xa85e751b386a1f3e7a5df97663d6ff125d8f410960724ca61bf222b694302fab"),
            tx.pure.bool(selectedSide === "yes"),
            betCoin,
          ],
        });
      } else if (currency === "USDC") {
        alert("USDC betting coming soon! Use ZION or SUI for now.");
        return;
      } else {
        const zionCoinType =
          "0xfadbe56d6891baf0715fd9a61e4cc46e826882ecb3cc04719ff7046ed999bd81::civilization::CIVILIZATION";
        const coins = await suiClient.getCoins({ owner: w, coinType: zionCoinType });
        if (!coins.data.length) {
          alert("No ZION tokens! Get some from the Faucet tab.");
          return;
        }
        const zionCoin = tx.object(coins.data[0].coinObjectId);
        const [betCoin] = tx.splitCoins(zionCoin, [betAmountRaw]);

        tx.moveCall({
          target: "0xfadbe56d6891baf0715fd9a61e4cc46e826882ecb3cc04719ff7046ed999bd81::civilization::place_bet",
          arguments: [
            tx.object("0xa85e751b386a1f3e7a5df97663d6ff125d8f410960724ca61bf222b694302fab"),
            tx.pure.bool(selectedSide === "yes"),
            betCoin,
          ],
        });
      }

      if (!account) {
        alert("Please connect your Sui wallet first!");
        return;
      }

      signAndExecute(
        { transaction: tx, chain: "sui:testnet" },
        {
          onSuccess: (result) => {
            console.log("Bet placed!", result);
            const digest =
              result && typeof result === "object" && "digest" in result && typeof result.digest === "string"
                ? result.digest
                : "";
            alert(`✅ Bet placed on-chain! TX: ${digest ? `${digest.slice(0, 8)}...` : "(pending)"}`);
          },
          onError: (error) => {
            console.error("Bet error:", error);
            alert(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
          },
        }
      );
    } catch (error: unknown) {
      alert(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
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
              onClick={() => setCurrency("ZION")}
              style={{
                flex: 1,
                padding: "5px",
                background: currency === "ZION" ? "rgba(0,255,65,0.2)" : "transparent",
                border: currency === "ZION" ? "1px solid #00ff41" : "1px solid #333",
                borderRadius: "6px",
                color: currency === "ZION" ? "#00ff41" : "#555",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              ⚡ ZION
            </button>
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
            {currency === "ZION" && "⚡ ZION — Native civilization token"}
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
            <span style={{ fontSize: "1.8rem", color: "#fff", fontWeight: "bold", display: "block" }}>
              {betAmount} {currency}
            </span>
            <div style={{ display: "flex", gap: "8px", margin: "8px 0", flexWrap: "wrap" }}>
              {[1, 5, 10, 100].map((n) => (
                <button
                  key={n}
                  type="button"
                  style={presetBtnStyle}
                  onClick={() => setBetAmount((a) => a + n)}
                  disabled={anyBusy}
                >
                  +{n}
                </button>
              ))}
            </div>
          </div>

          <p style={{ color: "rgba(0,255,65,0.7)", fontSize: "0.85rem", margin: "4px 0 0" }}>
            Potential win: {(betAmount * 1.98).toFixed(2)} {currency}
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
          onClick={() => {
            if (!walletConnected || anyBusy || !buyMarket || selectedSide === null) return;
            if (betAmount < 1) return;
            void handlePlaceBet();
          }}
        >
          {placing ? "…" : selectedSide === "no" ? "Place NO order" : "Place YES order"}
        </button>
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

function formatCountdown(iso: string | undefined | null, nowMs: number): string {
  if (!iso?.trim()) return "—";
  const end = Date.parse(iso);
  if (!Number.isFinite(end)) return "—";
  const ms = end - nowMs;
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (totalSec < 3600) {
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function liveCgUsdForToken(token: string | undefined, cg: { SUI?: number }): number | undefined {
  if (!token) return undefined;
  const u = token.toUpperCase();
  if (u === "SUI") return cg.SUI;
  return undefined;
}

function ZionBetMarketCard({
  bet,
  walletConnected,
  busyYes,
  busyNo,
  onPlace,
  onOpenDetail,
  liveCgUsd,
}: {
  bet: ZionBetMarket;
  walletConnected: boolean;
  busyYes: boolean;
  busyNo: boolean;
  onPlace: (bet: ZionBetMarket, prediction: boolean, amount: number) => void;
  onOpenDetail?: () => void;
  liveCgUsd: { SUI?: number };
}) {
  const openable = Boolean(onOpenDetail);
  const [hover, setHover] = useState(false);
  const [picked, setPicked] = useState<"yes" | "no" | null>(null);

  useEffect(() => {
    setPicked(null);
  }, [bet.id]);

  const headline = bet.question.trim();
  const { yes: yesCents, no: noCents } = zionBetDisplayOdds(bet);
  const vol = bet.volume_zion;
  const headerLeft = zionBetCompactCardHeaderLeft(bet);
  const cardAmt = 1;

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
        cursor: !walletConnected || busyYes ? "not-allowed" : "pointer",
        opacity: !walletConnected || busyYes ? 0.5 : 1,
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
        cursor: !walletConnected || busyYes ? "not-allowed" : "pointer",
        opacity: !walletConnected || busyYes ? 0.5 : 1,
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
        cursor: !walletConnected || busyNo ? "not-allowed" : "pointer",
        opacity: !walletConnected || busyNo ? 0.5 : 1,
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
        cursor: !walletConnected || busyNo ? "not-allowed" : "pointer",
        opacity: !walletConnected || busyNo ? 0.5 : 1,
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
                disabled={!walletConnected || busyYes}
                onClick={() => {
                  if (!walletConnected || busyYes) return;
                  setPicked("yes");
                  onPlace(bet, true, cardAmt);
                }}
              >
                YES {yesCents}¢
              </button>
              <button
                type="button"
                style={noBtnStyle}
                disabled={!walletConnected || busyNo}
                onClick={() => {
                  if (!walletConnected || busyNo) return;
                  setPicked("no");
                  onPlace(bet, false, cardAmt);
                }}
              >
                NO {noCents}¢
              </button>
            </div>
            <div style={{ color: "#444", fontSize: "0.65rem", marginTop: "4px" }}>
              {formatZionVolume(vol)} ZION vol
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
  suiPrice,
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
  suiPrice?: number;
}) {
  const syntheticChartData = useMemo(() => buildYesPriceChartData(market), [market]);
  const [activity, setActivity] = useState<ZionBetActivityRow[]>([]);
  const [holders, setHolders] = useState<ZionBetHolderRow[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<number | null>(null);
  const [cgChartRows, setCgChartRows] = useState<{ time: string; price: number }[]>([]);
  const [cgChartLoading, setCgChartLoading] = useState(false);
  const [detailNow, setDetailNow] = useState(() => Date.now());

  const detailCgId = useMemo(() => zionBetDetailCoinGeckoId(market.token), [market.token]);

  useEffect(() => {
    const id = window.setInterval(() => setDetailNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const resolveBadge = useMemo(
    () => formatResolveCountdown(market.resolves_at_iso, detailNow),
    [market.resolves_at_iso, detailNow]
  );

  const mainCountdown = useMemo(
    () => formatCountdown(market.resolves_at_iso, detailNow),
    [market.resolves_at_iso, detailNow]
  );

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
              {resolveBadge ? (
                <span
                  style={{
                    fontSize: "0.78rem",
                    letterSpacing: "0.06em",
                    color: "#7dffb8",
                    border: "1px solid rgba(0,255,65,0.35)",
                    borderRadius: 999,
                    padding: "6px 12px",
                    background: "rgba(0,40,20,0.5)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {resolveBadge}
                </span>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              {livePrice != null && Number.isFinite(livePrice) ? (
                <>
                  <span style={{ color: "#ffd700", fontSize: "1.4rem", fontWeight: "bold" }}>
                    ${livePrice.toFixed(4)}
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
            <div
              style={{
                fontSize: "2rem",
                fontWeight: "bold",
                color: "#ffd700",
                fontFamily: "monospace",
                marginBottom: "16px",
              }}
            >
              ⏱ {mainCountdown}
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
              {activity.length === 0 ? (
                <p style={{ fontSize: "0.75rem", color: "rgba(160,190,175,0.55)" }}>No bets on this market yet.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {activity.slice(0, 10).map((row) => (
                    <li
                      key={row.id}
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
                      <span style={{ color: "rgba(200,230,210,0.88)", fontFamily: "ui-monospace, monospace" }}>
                        {shortWallet(row.wallet)}
                      </span>
                      <span style={{ color: row.prediction_label === "YES" ? "#5fe9a5" : "#ff8888" }}>{row.prediction_label}</span>
                      <span style={{ color: "rgba(180,210,195,0.75)" }}>{row.amount.toFixed(0)} ZION</span>
                    </li>
                  ))}
                </ul>
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
                      <strong>{row.prediction_label ?? "—"}</strong> · {row.amount != null ? Number(row.amount).toFixed(1) : "—"} ZION ·{" "}
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
    silverMin: 10,
    goldMin: 100,
  },
];

function renderArticle(text: string, ac: string, border: string, bodyFont: string) {
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
            columns.length >= 3 ? "1fr 1fr 1fr" : columns.length === 2 ? "1fr 1fr" : "1fr",
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
  const connect = () => {
    const w = wallets[0];
    if (w) connectWallet({ wallet: w });
  };
  const [zkLoginUser, setZkLoginUser] = useState<{ address: string; email: string } | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showWalletMenu, setShowWalletMenu] = useState(false);

  const [showIntro, setShowIntro] = useState(true);
  const [introFading, setIntroFading] = useState(false);
  const [dashboardVisible, setDashboardVisible] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [clans, setClans] = useState<Clan[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const galaxyCanvasRef = useRef<HTMLCanvasElement>(null);
  const aliveAgents = stats?.alive ?? agents.length;

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
  const [chronicleEvents, setChronicleEvents] = useState<EventItem[]>([]);
  const [chronicleNow, setChronicleNow] = useState(() => Date.now());
  const [civEvents, setCivEvents] = useState<CivilizationEvent[]>([]);
  const [conversations, setConversations] = useState<ConversationPair[]>([]);
  const [markets, setMarkets] = useState<ZionMarket[]>([]);
  const [zionBetMyBets, setZionBetMyBets] = useState<ZionMyBetRow[]>([]);
  const [zionBetToast, setZionBetToast] = useState<string | null>(null);
  const [zionBetPlacing, setZionBetPlacing] = useState<string | null>(null);
  const [zionBetSelectedMarket, setZionBetSelectedMarket] = useState<ZionBetMarket | null>(null);
  const [zionBetCategoryTab, setZionBetCategoryTab] = useState<ZionBetCategoryFilter>("all");
  const [zionBetTimeframeTab, setZionBetTimeframeTab] = useState<ZionBetTimeframeFilterKey>("all");
  const [zionBetCgUsd, setZionBetCgUsd] = useState<{ SUI?: number }>({});
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
  const [nautilusDecisions, setNautilusDecisions] = useState<NautilusDecision[]>([]);
  const [nautilusLoading, setNautilusLoading] = useState(false);

  const fetchNautilusDecisions = useCallback(async () => {
    setNautilusLoading(true);
    try {
      const res = await fetch("/api/nautilus");
      const data = (await res.json()) as { decisions?: NautilusDecision[] };
      if (data.decisions) setNautilusDecisions(data.decisions);
    } catch (e) {
      console.error(e);
    } finally {
      setNautilusLoading(false);
    }
  }, []);

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

  const generateArticle = useCallback(async (newspaper: PressNewspaper) => {
    const cacheKey = `press_${newspaper.id}_v2`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { article, timestamp } = JSON.parse(cached) as { article: string; timestamp: number };
        if (Date.now() - timestamp < 2 * 60 * 60 * 1000) {
          setPressArticles((prev) => ({ ...prev, [newspaper.id]: article }));
          setPressLoading((prev) => ({ ...prev, [newspaper.id]: false }));
          return;
        }
      }
    } catch {
      /* ignore cache */
    }

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

      const prompt = `IMPORTANT: Write ONLY in English. No other languages.

${newspaper.persona}

LIVE CIVILIZATION DATA RIGHT NOW:
- Alive agents: ${alive}
- Deaths today: ${deathsToday}  
- Total ZION in circulation: ${Number.isFinite(totalZion) ? totalZion.toFixed(2) : "0"}
- Active clans: ${activeClans}

RECENT EVENTS RELEVANT TO YOUR PAPER:
${relevantEvents
  .map((e) => {
    const amt = typeof e.amount === "number" ? e.amount : 0;
    return `[${(e.type ?? "?").toUpperCase()}] ${e.description ?? ""} ${amt > 0 ? `(${amt} ZION)` : ""}`;
  })
  .join("\n")}

Write the article in EXACTLY this format, nothing else:

HEADLINE: YOUR HEADLINE HERE
BYLINE: By Journalist Name | ${newspaper.name}
---
Column 1:
First paragraph text here, 60-80 words.

Column 2:
Second paragraph text here, 60-80 words.

Column 3:
Third paragraph text here, 40-60 words.
---
EDITOR'S NOTE: One sentence here.

CRITICAL: Use exactly these labels: 'Column 1:', 'Column 2:', 'Column 3:' on their own lines. Write ONLY in English.`;

      const openrouterKey = "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";

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openrouterKey}`,
          "HTTP-Referer": "https://zionciv.com",
          "X-Title": "ZION Civilization Press",
        },
        body: JSON.stringify({
          model: "deepseek/deepseek-chat-v3-0324",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
          temperature: 0.85,
        }),
      });

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        error?: { message?: string };
      };
      const article =
        data.choices?.[0]?.message?.content ||
        data.error?.message ||
        JSON.stringify(data).substring(0, 300);
      localStorage.setItem(cacheKey, JSON.stringify({ article, timestamp: Date.now() }));
      setPressArticles((prev) => ({ ...prev, [newspaper.id]: article }));
    } catch (err) {
      console.error("Press error:", err);
      setPressArticles((prev) => ({
        ...prev,
        [newspaper.id]: "Error generating article. Check API key.",
      }));
    } finally {
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

  const zionBetSourceList = useMemo(() => markets.map(zionBetMarketFromZionSource), [markets]);

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
    const n = (tf: string) => list.filter((b) => (b.timeframe ?? "").toLowerCase() === tf).length;
    const monthly = list.filter((b) => {
      const t = (b.timeframe ?? "").toLowerCase();
      return t === "30d" || t === "1m" || t === "monthly";
    }).length;
    const yearly = list.filter((b) => (b.timeframe ?? "").toLowerCase() === "1y").length;
    return {
      all: list.length,
      "15m": n("15m"),
      "1h": n("1h"),
      "4h": n("4h"),
      "24h": n("24h"),
      "7d": n("7d"),
      monthly,
      yearly,
    };
  }, [zionBetListAfterCategory]);

  const zionBetFilteredMarkets = useMemo(() => {
    if (zionBetTimeframeTab === "all") return zionBetListAfterCategory;
    if (zionBetTimeframeTab === "monthly") {
      return zionBetListAfterCategory.filter((b) => {
        const t = (b.timeframe ?? "").toLowerCase();
        return t === "30d" || t === "1m" || t === "monthly";
      });
    }
    if (zionBetTimeframeTab === "yearly") {
      return zionBetListAfterCategory.filter((b) => (b.timeframe ?? "").toLowerCase() === "1y");
    }
    const tf = zionBetTimeframeTab;
    return zionBetListAfterCategory.filter((b) => (b.timeframe ?? "").toLowerCase() === tf);
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
    if (activeTab === "civilization") void fetchNautilusDecisions();
  }, [activeTab, fetchNautilusDecisions]);

  useEffect(() => {
    if (showIntro || activeTab !== "civilization") return;
    const canvas = galaxyCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth || 600;
    canvas.height = 280;

    const cx = canvas.width / 2;
    const cy = 140;

    const starColors = ["#00ff41", "#00ff41", "#00ff41", "#ffd700", "#ff6600", "#ff3232", "#ffffff", "#88ffaa"];
    const starCount = Math.min(Math.max(aliveAgents || 500, 100), 2000);
    const particles = Array.from({ length: starCount }, () => {
      const arm = Math.floor(Math.random() * 3);
      const armAngle = (arm / 3) * Math.PI * 2;
      const t = Math.pow(Math.random(), 0.6);
      const radius = 15 + t * (canvas.width * 0.44);
      const spread = (1 - t) * 0.3 + t * 1.2;
      const angle = armAngle + t * Math.PI * 3 + (Math.random() - 0.5) * spread;
      return {
        angle,
        radius,
        color: starColors[Math.floor(Math.random() * starColors.length)],
        size: 0.3 + Math.random() * (t < 0.3 ? 2.5 : 1.2),
        speed: (0.0002 + (1 - t) * 0.001) * (Math.random() > 0.5 ? 1 : -1),
      };
    });

    const neo = {
      angle: Math.random() * Math.PI * 2,
      radius: 30 + Math.random() * (canvas.width * 0.35),
      size: 2.5,
      speed: -0.0008,
      trail: [] as { x: number; y: number }[],
    };

    let animId = 0;
    let cancelled = false;
    const draw = () => {
      if (cancelled) return;
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

    draw();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
    };
  }, [showIntro, activeTab, aliveAgents]);

  useEffect(() => {
    if (!zionBetToast) return;
    const id = window.setTimeout(() => setZionBetToast(null), 5200);
    return () => window.clearTimeout(id);
  }, [zionBetToast]);

  useEffect(() => {
    void generateZionMarkets().then(setMarkets);
    const interval = window.setInterval(() => {
      void generateZionMarkets().then(setMarkets);
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const events = generateSampleEvents();
    setCivEvents(events);
  }, []);

  useEffect(() => {
    if (showIntro || activeTab !== "zionbet") return;
    const w = walletAddress.trim();
    if (!w) {
      setZionBetMyBets([]);
      return;
    }
    const loadMy = async () => {
      try {
        const r = await fetch(`/api/wallet_bets/${encodeURIComponent(w)}`);
        const data = await r.json();
        setZionBetMyBets(Array.isArray(data) ? data : []);
      } catch {
        setZionBetMyBets([]);
      }
    };
    void loadMy();
    const t = window.setInterval(() => void loadMy(), 30000);
    return () => clearInterval(t);
  }, [showIntro, activeTab, walletAddress]);

  useEffect(() => {
    if (!faucetCooldownEndsAt || faucetCooldownEndsAt <= Date.now()) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [faucetCooldownEndsAt]);

  useEffect(() => {
    if (showIntro) return;
    const loadChronicle = async () => {
      try {
        const r = await fetch("/api/events?limit=120");
        const data = await r.json();
        const list = Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : [];
        const priority = [
          "death",
          "birth",
          "catastrophe",
          "clan_war",
          "neo",
          "neo_prophecy",
          "rebellion",
          "election",
          "blessing",
          "lottery",
        ];
        setChronicleEvents(filterChronicleEvents(list, priority));
        setChronicleNow(Date.now());
      } catch {
        /* keep last snapshot */
      }
    };
    void loadChronicle();
    const t = window.setInterval(() => void loadChronicle(), 15000);
    return () => clearInterval(t);
  }, [showIntro]);

  useEffect(() => {
    if (showIntro) return;
    const id = window.setInterval(() => setChronicleNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [showIntro]);

  useEffect(() => {
    if (showIntro) return;
    const loadConv = () =>
      fetch("/api/conversations")
        .then((r) => r.json())
        .then((data) => setConversations(Array.isArray(data) ? data : []))
        .catch(() => {});
    loadConv();
    const t = window.setInterval(loadConv, 60000);
    return () => clearInterval(t);
  }, [showIntro]);

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
        const [s, a, c] = await Promise.all([
          fetch("/api/stats").then((r) => r.json()),
          fetch("/api/agents").then((r) => r.json()),
          fetch("/api/clans").then((r) => r.json()),
        ]);
        setStats(s);
        setAgents(a);
        setClans(c);
        fetch("/api/conversations")
          .then((r) => r.json())
          .then((data) => setConversations(Array.isArray(data) ? data : []))
          .catch(() => {});
      } catch {
        // keep last successful snapshot
      }
    };

    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [showIntro]);

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
    try {
      const body: Record<string, unknown> = {
        wallet: w,
        event_type: bet.event_type,
        prediction,
        amount,
        question: bet.question,
      };
      if (typeof bracketIndex === "number") body.bracket_index = bracketIndex;
      const r = await fetch("/api/place_bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await r.json()) as { success?: boolean; message?: string; points_earned?: number };
      if (d.success) {
        setZionBetToast("Bet placed! Good luck.");
        const ur = await fetch(`/api/user/${encodeURIComponent(w)}`);
        const ud = await ur.json();
        const raw = ud.points ?? ud.total_points ?? 0;
        const pts = typeof raw === "number" ? raw : Number(raw);
        if (Number.isFinite(pts)) setUserPoints(pts);
        const br = await fetch(`/api/wallet_bets/${encodeURIComponent(w)}`);
        const bd = await br.json();
        setZionBetMyBets(Array.isArray(bd) ? bd : []);
        void generateZionMarkets().then(setMarkets);
      } else {
        setZionBetToast(typeof d.message === "string" ? d.message : "Could not place bet.");
      }
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
        {!zkLoginUser ? (
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
        ) : null}
        {!walletAddress.trim() ? (
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
            ⚡ CONNECT WALLET
          </button>
        ) : (
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
        )}
        {zkLoginUser ? (
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
      </div>
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
                fontSize: "4rem",
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
              <div style={{ color: "#00ff41" }}>✓ Loading 1,282 agents...</div>
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

      <div className={`dashboard ${dashboardVisible ? "show" : ""}`}>
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
          <p>World&apos;s first autonomous AI civilization on Sui blockchain</p>
        </header>

        <nav className="mainNav" aria-label="Main navigation">
          {(
            [
              ["civilization", "🌍 CIVILIZATION"],
              ["chat", "💬 CHAT"],
              ["zionbet", "🎰 ZIONBET"],
              ["bank", "🏦 BANK"],
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

        <div className="tabPanels">
          {activeTab === "civilization" && (
            <>
              <section className="statsGrid">
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

              <section className="civilizationSidebarRow" aria-label="Live feed sidebar">
                <div
                  className="civilizationSidebarRowFill"
                  style={{
                    border: "1px solid #1a1a1a",
                    borderRadius: "12px",
                    padding: "16px",
                    marginBottom: "16px",
                    background: "rgba(0,5,0,0.5)",
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
                      width: "100%",
                      height: "280px",
                      borderRadius: "8px",
                      display: "block",
                      marginBottom: "12px",
                    }}
                  />

                  <div style={{ borderTop: "1px solid #111", paddingTop: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      {[
                        { label: "Total", value: "1,282", color: "#00ff41" },
                        { label: "Elite", value: "~192", color: "#00ff41" },
                        { label: "Middle", value: "~641", color: "#ffd700" },
                        { label: "Poor", value: "~320", color: "#ff6600" },
                        { label: "Critical", value: "~129", color: "#ff3232" },
                      ].map((s) => (
                        <div key={s.label} style={{ textAlign: "center" }}>
                          <div style={{ color: s.color, fontSize: "0.85rem", fontWeight: "bold" }}>{s.value}</div>
                          <div style={{ color: "#444", fontSize: "0.6rem" }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <aside className="civilizationSidebar">
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

              <section className="chronicleSection" aria-label="Civilization Chronicle">
                <div className="chronicleHead">
                  <h2 className="chronicleTitle">
                    <span className="chronicleLiveDot" aria-hidden />
                    CIVILIZATION CHRONICLE
                  </h2>
                  <span className="chronicleFeedHint">LIVE · refresh 15s</span>
                </div>
                <div className="chronicleScroll">
                  <div className="chronicleGrid">
                    {chronicleEvents.length === 0 ? (
                      <p className="chronicleEmpty">Awaiting signal from civilization core…</p>
                    ) : (
                      chronicleEvents.map((event) => {
                        const meta = chronicleMeta(event.type);
                        return (
                          <article
                            key={`${event.id}-${event.time}`}
                            className="chronicleCard"
                            style={{ borderLeft: `3px solid ${meta.border}` }}
                          >
                            <div className="chronicleCardTop">
                              <span className="chronicleIcon" aria-hidden>
                                {meta.icon}
                              </span>
                              <time className="chronicleTime" dateTime={event.time}>
                                {formatTimeAgo(event.time, chronicleNow)}
                              </time>
                            </div>
                            <p className="chronicleDesc">{chronicleBoldDescription(event.description, event.type)}</p>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              </section>

              <section className="clanSection">
                <h2>CLAN RANKINGS</h2>
                <div className="clanGrid">
                  {clans.map((clan, idx) => (
                    <article key={clan.id} className="clanCard">
                      <h3>{idx === 0 ? "👑 " : ""}{clan.name}</h3>
                      <p>Treasury: {clan.treasury.toFixed(1)}</p>
                      <p>Members: {clan.members}</p>
                      <p>W/L: {clan.wins}/{clan.losses}</p>
                    </article>
                  ))}
                </div>
              </section>

              <div style={{ marginTop: "24px" }}>
                <h3
                  style={{
                    color: "#ffd700",
                    fontSize: "0.8rem",
                    letterSpacing: "0.1em",
                    marginBottom: "12px",
                  }}
                >
                  📡 LIVE EVENTS — STORED ON WALRUS
                </h3>
                {civEvents.map((event) => {
                  const icons = {
                    death: "💀",
                    war: "⚔️",
                    election: "👑",
                    catastrophe: "🌋",
                    trade: "📊",
                    birth: "🌱",
                  };
                  const colors = {
                    death: "#ff3232",
                    war: "#ff6600",
                    election: "#ffd700",
                    catastrophe: "#ff00ff",
                    trade: "#00ff41",
                    birth: "#00ffff",
                  };
                  return (
                    <div
                      key={event.id}
                      style={{
                        border: `1px solid ${colors[event.type]}33`,
                        borderLeft: `3px solid ${colors[event.type]}`,
                        borderRadius: "8px",
                        padding: "10px 14px",
                        marginBottom: "8px",
                        background: "rgba(0,0,0,0.4)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            color: colors[event.type],
                            fontSize: "0.85rem",
                            fontWeight: "bold",
                          }}
                        >
                          {icons[event.type]} {event.title}
                        </span>
                        <span style={{ color: "#444", fontSize: "0.7rem" }}>
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p
                        style={{
                          color: "#888",
                          fontSize: "0.75rem",
                          margin: "4px 0 0 0",
                          lineHeight: "1.4",
                        }}
                      >
                        {event.description}
                      </p>
                      <div style={{ color: "#333", fontSize: "0.65rem", marginTop: "4px" }}>
                        🐋 Walrus testnet · agents: {event.agents.join(", ")}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: "24px" }}>
                <h3
                  style={{
                    color: "#00ffc8",
                    fontSize: "0.8rem",
                    letterSpacing: "0.1em",
                    marginBottom: "12px",
                  }}
                >
                  ⚙️ NAUTILUS — AI AGENTS OFF-CHAIN COMPUTE
                </h3>

                {/* Explanation */}
                <div
                  style={{
                    border: "1px solid rgba(0,255,200,0.2)",
                    borderRadius: "12px",
                    padding: "16px",
                    marginBottom: "12px",
                    background: "rgba(0,255,200,0.02)",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto 1fr",
                      gap: "12px",
                      alignItems: "center",
                      marginBottom: "16px",
                    }}
                  >
                    <div
                      style={{
                        textAlign: "center",
                        padding: "12px",
                        background: "rgba(0,0,0,0.3)",
                        borderRadius: "8px",
                      }}
                    >
                      <div style={{ fontSize: "1.5rem", marginBottom: "4px" }}>🤖</div>
                      <div style={{ color: "#00ffc8", fontSize: "0.75rem", fontWeight: "bold" }}>AI Agent</div>
                      <div style={{ color: "#555", fontSize: "0.65rem" }}>Thinks OFF-chain</div>
                      <div style={{ color: "#555", fontSize: "0.65rem" }}>Nautilus Engine</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ color: "#00ffc8", fontSize: "1.5rem" }}>→</div>
                      <div style={{ color: "#555", fontSize: "0.6rem" }}>proof</div>
                    </div>
                    <div
                      style={{
                        textAlign: "center",
                        padding: "12px",
                        background: "rgba(0,0,0,0.3)",
                        borderRadius: "8px",
                      }}
                    >
                      <div style={{ fontSize: "1.5rem", marginBottom: "4px" }}>⛓️</div>
                      <div style={{ color: "#00ffc8", fontSize: "0.75rem", fontWeight: "bold" }}>Sui Blockchain</div>
                      <div style={{ color: "#555", fontSize: "0.65rem" }}>Result ON-chain</div>
                      <div style={{ color: "#555", fontSize: "0.65rem" }}>Verifiable & honest</div>
                    </div>
                  </div>
                  <div style={{ color: "#555", fontSize: "0.72rem", textAlign: "center" }}>
                    Agents make complex decisions off-chain for free → Nautilus proves the computation was honest →
                    Result recorded on Sui
                  </div>
                </div>

                {/* Live agent decisions */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    marginBottom: "8px",
                  }}
                >
                  <div
                    style={{
                      color: "#00ffc8",
                      fontSize: "0.7rem",
                      letterSpacing: "0.05em",
                    }}
                  >
                    🔴 LIVE AGENT DECISIONS — POWERED BY NAUTILUS
                  </div>
                  <button
                    type="button"
                    onClick={() => void fetchNautilusDecisions()}
                    disabled={nautilusLoading}
                    style={{
                      flexShrink: 0,
                      background: "rgba(0,255,200,0.12)",
                      border: "1px solid rgba(0,255,200,0.35)",
                      color: "#00ffc8",
                      fontSize: "0.65rem",
                      padding: "4px 10px",
                      borderRadius: "8px",
                      cursor: nautilusLoading ? "wait" : "pointer",
                      opacity: nautilusLoading ? 0.6 : 1,
                    }}
                  >
                    {nautilusLoading ? "…" : "Refresh"}
                  </button>
                </div>
                {nautilusLoading && nautilusDecisions.length === 0 ? (
                  <p style={{ color: "#555", fontSize: "0.75rem", margin: "8px 0" }}>Loading Nautilus decisions…</p>
                ) : nautilusDecisions.length === 0 ? (
                  <p style={{ color: "#555", fontSize: "0.75rem", margin: "8px 0" }}>No decisions yet. Try refresh.</p>
                ) : (
                  nautilusDecisions.map((decision, idx) => {
                    const c =
                      decision.confidence != null && !Number.isNaN(Number(decision.confidence))
                        ? Number(decision.confidence) <= 1 && Number(decision.confidence) >= 0
                          ? Math.round(Number(decision.confidence) * 100)
                          : Math.round(Number(decision.confidence))
                        : 0;
                    const hash = decision.tx_hash || "";
                    const hashShort = hash.length > 8 ? `${hash.slice(0, 8)}…` : hash;
                    return (
                      <div
                        key={`${decision.agent}-${decision.tx_hash}-${idx}`}
                        style={{
                          border: "1px solid rgba(0,255,200,0.15)",
                          borderRadius: "8px",
                          padding: "10px 14px",
                          marginBottom: "6px",
                          background: "rgba(0,0,0,0.3)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px", flexWrap: "wrap" }}>
                            <span style={{ color: "#00ffc8", fontSize: "0.8rem", fontWeight: "bold" }}>{decision.agent}</span>
                            <span
                              style={{
                                background: "rgba(34,197,94,0.15)",
                                border: "1px solid rgba(34,197,94,0.45)",
                                color: "#22c55e",
                                fontSize: "0.6rem",
                                padding: "1px 6px",
                                borderRadius: "10px",
                              }}
                            >
                              ✓ verified on Sui testnet
                            </span>
                            <span style={{ color: "#333", fontSize: "0.65rem" }}>Nautilus AI</span>
                          </div>
                          <div style={{ color: "#00aa88", fontSize: "0.72rem", fontWeight: 600, marginBottom: "2px" }}>
                            {decision.decision}
                          </div>
                          <div style={{ color: "#888", fontSize: "0.75rem" }}>{decision.reason}</div>
                          <div style={{ color: "#666", fontSize: "0.7rem", marginTop: "4px" }}>Confidence: {c}%</div>
                          <div style={{ color: "#333", fontSize: "0.65rem", marginTop: "2px" }}>
                            TX:{" "}
                            {decision.explorer_url ? (
                              <a
                                href={decision.explorer_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: "#00ffc8", textDecoration: "underline" }}
                              >
                                {hashShort}
                              </a>
                            ) : (
                              <span>{hashShort}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                <div style={{ textAlign: "center", marginTop: "8px" }}>
                  <span style={{ color: "#333", fontSize: "0.65rem" }}>
                    ⚙️ Powered by Nautilus · Off-chain compute with on-chain proof
                  </span>
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
            <section className="zionBetTab" aria-label="ZionBet prediction markets">
              <header className="zionBetHeader">
                <h2 className="zionBetTitle">⚡ ZIONBET — Predict the Civilization</h2>
                <p className="zionBetSubtitle">Market-style odds · Win up to 1.98× stake · +2 points per order</p>
              </header>
              {zionBetToast ? (
                <div className="zionBetToast" role="status">
                  {zionBetToast}
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
                  myBetsOnMarket={zionBetMyBets.filter((r) => {
                    if (r.event_type !== zionBetSelectedMarket.event_type) return false;
                    if (r.question === zionBetSelectedMarket.question) return true;
                    return r.question.startsWith(`${zionBetSelectedMarket.question}::__bkt__`);
                  })}
                />
              ) : (
                <>
                  <div className="zionBetCatTabs" role="tablist" aria-label="Market categories">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={zionBetCategoryTab === "all"}
                      className={`zionBetCatTab${zionBetCategoryTab === "all" ? " zionBetCatTabActive" : ""}`}
                      onClick={() => setZionBetCategoryTab("all")}
                    >
                      All ({zionBetCategoryCounts.all})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={zionBetCategoryTab === "crypto"}
                      className={`zionBetCatTab${zionBetCategoryTab === "crypto" ? " zionBetCatTabActive" : ""}`}
                      onClick={() => setZionBetCategoryTab("crypto")}
                    >
                      🪙 Crypto ({zionBetCategoryCounts.crypto})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={zionBetCategoryTab === "clan_wars"}
                      className={`zionBetCatTab${zionBetCategoryTab === "clan_wars" ? " zionBetCatTabActive" : ""}`}
                      onClick={() => setZionBetCategoryTab("clan_wars")}
                    >
                      ⚔️ Clan Wars ({zionBetCategoryCounts.clan_wars})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={zionBetCategoryTab === "deaths"}
                      className={`zionBetCatTab${zionBetCategoryTab === "deaths" ? " zionBetCatTabActive" : ""}`}
                      onClick={() => setZionBetCategoryTab("deaths")}
                    >
                      💀 Deaths ({zionBetCategoryCounts.deaths})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={zionBetCategoryTab === "events"}
                      className={`zionBetCatTab${zionBetCategoryTab === "events" ? " zionBetCatTabActive" : ""}`}
                      onClick={() => setZionBetCategoryTab("events")}
                    >
                      🌋 Events ({zionBetCategoryCounts.events})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={zionBetCategoryTab === "politics"}
                      className={`zionBetCatTab${zionBetCategoryTab === "politics" ? " zionBetCatTabActive" : ""}`}
                      onClick={() => setZionBetCategoryTab("politics")}
                    >
                      🏛️ Politics ({zionBetCategoryCounts.politics})
                    </button>
                  </div>
                  <div
                    style={{
                      border: vipAccess?.isGold
                        ? "1px solid #ffd700"
                        : vipAccess?.isSilver
                          ? "1px solid #aaa"
                          : "1px solid #222",
                      borderRadius: "12px",
                      padding: "16px",
                      marginBottom: "20px",
                      background: vipAccess?.isGold ? "rgba(255,215,0,0.05)" : "rgba(0,0,0,0.3)",
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
                          <span style={{ color: "#aaa", fontSize: "0.9rem", fontWeight: "bold" }}>
                            🥈 SILVER VIP — Seal Encrypted
                          </span>
                        ) : (
                          <span style={{ color: "#444", fontSize: "0.9rem", fontWeight: "bold" }}>
                            🔐 VIP ROOM — Seal Encrypted
                          </span>
                        )}
                        <div style={{ color: "#555", fontSize: "0.7rem", marginTop: "2px" }}>
                          🥈 Silver: {SILVER_THRESHOLD.toLocaleString()} ZION · 🥇 Gold:{" "}
                          {GOLD_THRESHOLD.toLocaleString()} ZION
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
                        <span style={{ color: "#444", fontSize: "0.75rem" }}>
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
                            gridTemplateColumns: "1fr 1fr",
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
                  <div className="zionBetPmRow" style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                    <div className="zionBetPmSidebarCol" style={{ width: "160px", flexShrink: 0 }}>
                      <div
                        style={{
                          color: "#ffd700",
                          fontSize: "0.7rem",
                          marginBottom: "8px",
                          letterSpacing: "0.1em",
                        }}
                      >
                        TIMEFRAME
                      </div>
                      <nav aria-label="Timeframe filters">
                        {ZIONBET_TIMEFRAME_SIDEBAR_ROWS.map(({ key: tfKey, label }) => {
                          const selected = zionBetTimeframeTab === tfKey;
                          const count =
                            tfKey === "all"
                              ? zionBetTimeframeCounts.all
                              : tfKey === "monthly"
                                ? zionBetTimeframeCounts.monthly
                                : tfKey === "yearly"
                                  ? zionBetTimeframeCounts.yearly
                                  : zionBetTimeframeCounts[tfKey];
                          return (
                            <div
                              key={tfKey}
                              role="button"
                              tabIndex={0}
                              onClick={() => setZionBetTimeframeTab(tfKey)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setZionBetTimeframeTab(tfKey);
                                }
                              }}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                padding: "8px 12px",
                                borderRadius: "8px",
                                cursor: "pointer",
                                color: selected ? "#00ff41" : "#888",
                                background: selected ? "rgba(0,255,65,0.08)" : "transparent",
                                border: selected
                                  ? "1px solid rgba(0,255,65,0.3)"
                                  : "1px solid transparent",
                                marginBottom: "4px",
                                fontSize: "0.85rem",
                              }}
                            >
                              <span>{label}</span>
                              <span style={{ color: "#555", fontSize: "0.75rem" }}>{count}</span>
                            </div>
                          );
                        })}
                      </nav>
                    </div>
                    <div className="zionBetPmMain" style={{ flex: 1, minWidth: 0 }}>
                      <h3 className="zionBetSectionTitle">Markets</h3>
                      {zionBetFilteredMarkets.length === 0 ? (
                        <p style={{ fontSize: "0.78rem", color: "rgba(160,190,175,0.65)", margin: "12px 0" }}>
                          No markets match this category and timeframe.
                        </p>
                      ) : (
                        <div className="zionBetPmCardGrid">
                          {zionBetFilteredMarkets.map((bet) => {
                            const busyYes = zionBetPlacing === `${bet.id}-true`;
                            const busyNo = zionBetPlacing === `${bet.id}-false`;
                            return (
                              <ZionBetMarketCard
                                key={bet.id}
                                bet={bet}
                                walletConnected={Boolean(walletAddress.trim())}
                                busyYes={busyYes}
                                busyNo={busyNo}
                                liveCgUsd={zionBetCgUsd}
                                onPlace={(b, prediction, amt) => void placeZionBet(b, prediction, amt)}
                                onOpenDetail={() => setZionBetSelectedMarket(bet)}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                  <h3 className="zionBetSectionTitle zionBetSectionTitleSpaced">MY BETS</h3>
                  {!walletAddress.trim() ? (
                    <p className="zionBetWalletGate zionBetWalletGateCenter">Connect wallet to see your bets</p>
                  ) : zionBetMyBets.length === 0 ? (
                    <p className="zionBetEmptyMy">No bets yet. Pick YES or NO on a market above.</p>
                  ) : (
                    <ul className="zionBetMyList">
                      {zionBetMyBets.map((row) => {
                        const resLabel =
                          row.result === "WIN" ? (
                            <span className="zionBetResult zionBetResultWin">WIN</span>
                          ) : row.result === "LOSS" ? (
                            <span className="zionBetResult zionBetResultLoss">LOSS</span>
                          ) : (
                            <span className="zionBetResult zionBetResultPending">PENDING</span>
                          );
                        return (
                          <li key={row.id} className="zionBetMyRow">
                            <div className="zionBetMyMain">
                              <span className="zionBetMyQ">{row.question}</span>
                              <span className="zionBetMyPick">
                                Prediction: <strong>{row.prediction_label ?? "—"}</strong>
                              </span>
                            </div>
                            <div className="zionBetMyFoot">
                              <span className="zionBetMyType">{row.event_type}</span>
                              {resLabel}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
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
                          gridTemplateColumns: "repeat(3, 1fr)",
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

            const renderHeadlineByline = (headline: string, byline: string) => (
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
                        {renderHeadlineByline(fakeVipParsed.headline, fakeVipParsed.byline)}
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
                      {currentArticle ? renderArticle(currentArticle, ac, border, bodyFont) : null}
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

          {activeTab === "bank" && (
            <div style={{ padding: "24px" }}>
              {/* Header */}
              <div style={{ marginBottom: "24px" }}>
                <h2 style={{ color: "#ffd700", fontSize: "1.4rem", fontWeight: "bold", margin: "0 0 4px 0" }}>
                  🏦 ZION Bank — Private Transactions
                </h2>
                <p style={{ color: "#555", fontSize: "0.8rem", margin: 0 }}>
                  Send SUI or USDC privately · Powered by Sui Protocol Privacy · Viewing key for compliance
                </p>
              </div>

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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px" }}>
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

              {/* vs Tornado Cash */}
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
                  ✅ WHY ZION BANK IS LEGAL
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <div style={{ color: "#ff3232", fontSize: "0.8rem", fontWeight: "bold", marginBottom: "8px" }}>
                      ❌ Tornado Cash (illegal)
                    </div>
                    {[
                      "Money goes through shared pool",
                      "Thousands of users mixed",
                      "No audit trail possible",
                      "Developers prosecuted",
                    ].map((t) => (
                      <div key={t} style={{ color: "#555", fontSize: "0.72rem", marginBottom: "4px" }}>
                        • {t}
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ color: "#00ff41", fontSize: "0.8rem", fontWeight: "bold", marginBottom: "8px" }}>
                      ✅ ZION Bank (legal)
                    </div>
                    {[
                      "Money goes directly to recipient",
                      "One-to-one transaction",
                      "Viewing key for full audit",
                      "Built on Sui Protocol Privacy",
                    ].map((t) => (
                      <div key={t} style={{ color: "#888", fontSize: "0.72rem", marginBottom: "4px" }}>
                        • {t}
                      </div>
                    ))}
                  </div>
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

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div>
                    <label style={{ color: "#888", fontSize: "0.72rem", display: "block", marginBottom: "4px" }}>
                      AMOUNT
                    </label>
                    <input
                      type="number"
                      placeholder="0.00"
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
                      <option>SUI</option>
                      <option>USDC</option>
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
                  onClick={() => alert("ZION Bank launches with Sui Protocol Privacy mainnet. Coming soon!")}
                  style={{
                    width: "100%",
                    padding: "14px",
                    background: "linear-gradient(90deg, rgba(255,215,0,0.2), rgba(0,255,65,0.2))",
                    border: "1px solid #ffd700",
                    borderRadius: "8px",
                    color: "#ffd700",
                    fontSize: "1rem",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                >
                  🔐 Send Private Transaction
                </button>
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
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
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
          max-height: 400px;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 4px;
          scrollbar-width: thin;
          scrollbar-color: rgba(0, 255, 65, 0.35) rgba(0, 0, 0, 0.4);
        }
        .chronicleGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          align-items: start;
        }
        .chronicleEmpty {
          grid-column: 1 / -1;
          margin: 0;
          padding: 28px 16px;
          text-align: center;
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 0.72rem;
          letter-spacing: 0.12em;
          color: rgba(140, 200, 160, 0.55);
        }
        .chronicleCard {
          margin: 0;
          padding: 10px 11px 11px 12px;
          border-radius: 6px;
          border: 1px solid rgba(0, 255, 65, 0.12);
          background: rgba(0, 0, 0, 0.8);
          box-sizing: border-box;
          min-height: 72px;
        }
        .chronicleCardTop {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
        }
        .chronicleIcon {
          font-size: 1.15rem;
          line-height: 1;
          filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.15));
        }
        .chronicleTime {
          flex-shrink: 0;
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 0.58rem;
          letter-spacing: 0.06em;
          color: rgba(160, 210, 185, 0.72);
        }
        .chronicleDesc {
          margin: 0;
          font-family: ui-monospace, "JetBrains Mono", monospace;
          font-size: 0.68rem;
          line-height: 1.45;
          color: rgba(215, 245, 225, 0.92);
          word-break: break-word;
        }
        .chronicleDesc strong {
          color: #f4fff8;
          font-weight: 700;
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
          font-family: Orbitron, monospace;
        }
        .zionBetHeader {
          margin: 0 0 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(0, 255, 65, 0.22);
        }
        .zionBetTitle {
          margin: 0 0 10px;
          font-family: Orbitron, monospace;
          font-size: clamp(1rem, 2.4vw, 1.35rem);
          font-weight: 700;
          letter-spacing: 0.12em;
          color: #00ff41;
          text-shadow: 0 0 20px rgba(0, 255, 65, 0.45), 0 0 40px rgba(0, 255, 65, 0.15);
        }
        .zionBetSubtitle {
          margin: 0;
          font-family: Orbitron, monospace;
          font-size: 0.72rem;
          letter-spacing: 0.14em;
          color: rgba(180, 235, 200, 0.88);
        }
        .zionBetToast {
          margin: 0 0 18px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid rgba(0, 255, 65, 0.45);
          background: rgba(0, 40, 14, 0.55);
          color: #b8ffd0;
          font-family: Orbitron, monospace;
          font-size: 0.75rem;
          letter-spacing: 0.1em;
          box-shadow: 0 0 18px rgba(0, 255, 65, 0.12);
        }
        .zionBetSectionTitle {
          margin: 0 0 14px;
          font-family: Orbitron, monospace;
          font-size: 0.72rem;
          letter-spacing: 0.24em;
          color: #9de8ff;
          text-shadow: 0 0 10px rgba(0, 255, 65, 0.25);
        }
        .zionBetSectionTitleSpaced {
          margin-top: 28px;
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
        .zionBetCatTabs {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin: 0 0 16px;
          padding-bottom: 14px;
          border-bottom: 1px solid rgba(0, 255, 65, 0.12);
        }
        .zionBetCatTab {
          padding: 8px 16px;
          border-radius: 20px;
          border: 1px solid rgba(0, 255, 65, 0.2);
          background: transparent;
          color: rgba(255, 255, 255, 0.5);
          font-size: 0.72rem;
          letter-spacing: 0.04em;
          cursor: pointer;
          font-family: ui-sans-serif, system-ui, sans-serif;
        }
        .zionBetCatTab:hover {
          color: rgba(255, 255, 255, 0.75);
          border-color: rgba(0, 255, 65, 0.35);
        }
        .zionBetCatTabActive {
          background: rgba(0, 255, 65, 0.15);
          border: 1px solid #00ff41;
          color: #00ff41;
          box-shadow: none;
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
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          align-items: stretch;
          justify-items: stretch;
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
          .chronicleGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
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
        @media (max-width: 560px) {
          .chronicleGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
