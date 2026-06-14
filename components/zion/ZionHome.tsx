"use client";

import {
  useConnectWallet,
  useCurrentAccount,
  useDisconnectWallet,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
  useSuiClient,
  useWallets,
} from "@mysten/dapp-kit";
import { generateNonce, generateRandomness } from "@mysten/zklogin";
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { suiClient } from "@/lib/deepbook";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { TabId } from "@/lib/tab-routes";
import { SharedLayout } from "@/components/SharedLayout";
import { ZionTabProvider, type ZionTabContextValue } from "@/components/zion/ZionTabContext";
import { Observatory } from "@/components/tabs/Observatory";
import { FieldNotes } from "@/components/tabs/FieldNotes";
import { PredictionEngine } from "@/components/tabs/PredictionEngine";
import { Privacy } from "@/components/tabs/Privacy";
import { Lab } from "@/components/tabs/Lab";
import { Archive } from "@/components/tabs/Archive";
import { Constitution } from "@/components/tabs/Constitution";
import BackgroundGrid from "@/components/BackgroundGrid";
import { FieldObservationsFeed } from "@/components/FieldObservationsFeed";
import { GlassCard } from "@/components/GlassCard";
import glassCardStyles from "@/components/GlassCard.module.css";
import { computeProsperity } from "@/lib/computeProsperity";
import {
  filterAndDedupeActivityLog,
  filterGovernanceBranchLog,
} from "@/lib/governanceActivityLog";

const ParticleField = dynamic(
  () => import("@/components/ParticleField").then((m) => m.ParticleField),
  {
    ssr: false,
    loading: () => (
      <div
        style={{ position: "absolute", inset: 0, background: "#000000" }}
        aria-hidden
      />
    ),
  },
);

const LivingPlanet = dynamic(
  () => import("@/components/LivingPlanet").then((m) => m.LivingPlanet),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          color: "#00ff88",
          fontSize: "12px",
          fontFamily: "monospace",
        }}
      >
        INITIALIZING PLANET...
      </div>
    ),
  },
);

const ClassIcon3D = dynamic(
  () => import("@/components/ClassIcon3D").then((m) => m.ClassIcon3D),
  {
    ssr: false,
    loading: () => (
      <div className="chatClassIcon chatClassIcon3D" style={{ width: 160, height: 160 }} aria-hidden />
    ),
  },
);
import {
  buildAnnounceTransaction,
  buildRegisterTransaction,
  checkStealthAddress,
  claimStealthPayment,
  computeStealthAddress,
  generateStealthMetaAddress,
  getUsdcCoins,
} from "@/lib/stealth";
import { encryptStealthMemo } from "@/lib/seal-stealth";
import { checkVIPAccess, VIP_MARKETS, SILVER_THRESHOLD, GOLD_THRESHOLD } from "@/lib/seal";
import {
  Area,
  AreaChart,
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
  event_type?: string;
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

const TAB_TYPES: Record<string, string[]> = {
  ALL: [],
  CRIME: ["street_crime", "police", "police_action", "sheriff_action", "gang_battle", "rebellion", "revolution", "espionage", "law"],
  CORP: ["corporation", "market", "trade", "tax", "frs", "zrs", "work", "lottery"],
  LOVE: ["marriage", "divorce"],
  FAITH: ["prayer", "religion", "neo", "neo_prophecy", "blessing"],
  CASINO: ["casino"],
  SPY: ["espionage"],
  FRS: ["frs", "zrs", "tax", "law"],
  HEALTH: ["death", "epidemic", "famine", "catastrophe", "clan_war"],
  EDU: ["education"],
  POLITICS: ["election", "president", "rebellion", "revolution", "clan_join", "clan_war"],
  MARKET: ["trade", "market", "corporation", "work", "frs"],
};

const WALRUS_TICKER_TYPE_COLORS: Record<string, string> = {
  election: "var(--text-secondary)",
  catastrophe: "var(--text-secondary)",
  clan_war: "var(--text-secondary)",
  rebellion: "var(--text-secondary)",
  lottery: "var(--text-secondary)",
  blessing: "var(--text-secondary)",
  birth: "var(--text-secondary)",
  prayer: "var(--text-muted)",
  chat: "var(--text-secondary)",
  work: "var(--text-muted)",
  clan_join: "var(--text-secondary)",
};

const sectorEmoji: Record<string, string> = {
  tech: "🖥️",
  agro: "🌾",
  military: "⚔️",
  pharma: "💊",
  media: "📺",
};

const PARTY_DISPLAY: Record<
  string,
  { label: string; emoji: string; color: string; background: string }
> = {
  consensus: {
    label: "Consensus Party",
    emoji: "🏛️",
    color: "#ef4444",
    background: "rgba(239, 68, 68, 0.12)",
  },
  reform: {
    label: "Reform Party",
    emoji: "⚡",
    color: "#3b82f6",
    background: "rgba(59, 130, 246, 0.12)",
  },
};

function presidentPartyDisplay(partyId: string | undefined) {
  const key = (partyId || "reform").toLowerCase();
  if (key === "blue" || key === "centrist" || key === "centrists" || key === "populist" || key === "populists") {
    return PARTY_DISPLAY.reform;
  }
  if (key === "red" || key === "conservative" || key === "conservatives") {
    return PARTY_DISPLAY.consensus;
  }
  return (
    PARTY_DISPLAY[key] ?? {
      label: partyId || "Unknown",
      emoji: "🏛️",
      color: "#aaa",
      background: "rgba(128,128,128,0.08)",
    }
  );
}

const getPartyColor = (party: string) => {
  const p = party?.toLowerCase() || "";
  if (p === "consensus" || p.includes("consensus") || p.includes("conservative")) return "#ef4444";
  if (p === "reform" || p.includes("reform") || p.includes("populist") || p.includes("people") || p.includes("front") || p.includes("centrist")) {
    return "#3b82f6";
  }
  return "rgba(255,255,255,0.4)";
};

function renderPoliticalWireText(text: string): ReactNode {
  const pattern = /(Consensus Party|Reform Party|Consensus|Reform)/gi;
  const parts = text.split(pattern);
  return parts.map((part, idx) => {
    if (!part) return null;
    if (part.match(pattern)) {
      return (
        <span key={`wire-${idx}`} style={{ color: getPartyColor(part) }}>
          {part}
        </span>
      );
    }
    return <span key={`wire-${idx}`}>{part}</span>;
  });
}

const ECO_GREEN = "var(--text-primary)";
const ECO_GOLD = "var(--text-secondary)";
const ECO_WARN = "var(--text-secondary)";
const ECO_DANGER = "var(--danger)";
const ECO_PURPLE = "var(--text-secondary)";
const ECO_BLUE = "var(--accent)";
const ECO_ORANGE = "var(--text-secondary)";
const ECO_SENATE_SEATS = 9;

const ECO_BG_GOLD = "#0a0800";
const ECO_BG_GREEN = "#000a05";
const ECO_BG_ORANGE = "#0a0500";
const ECO_BG_PURPLE = "#05000a";
const ECO_BG_BLUE = "#000508";

const ECO_CARD_BASE: CSSProperties = {
  borderRadius: 6,
  padding: 14,
  overflow: "hidden",
  minWidth: 0,
  boxSizing: "border-box",
};

const ECO_LABEL: CSSProperties = {
  color: "#666666",
  fontSize: 11,
  letterSpacing: 3,
  textTransform: "uppercase",
  marginBottom: 12,
};

function ecoZrsStateColor(state: string) {
  const s = String(state).toUpperCase();
  if (s === "HYPERINFLATION" || s === "CRISIS" || s === "DEPRESSION") return "#ff4444";
  if (s === "RECESSION") return "#ff8800";
  if (s === "BOOM") return "#00ff88";
  if (s === "STABLE") return "#ffd700";
  if (s === "VOLATILE" || s === "INFLATION") return "#ff8800";
  return "#ffd700";
}

function ecoZrsBorderColor(state: string) {
  const s = String(state).toUpperCase();
  if (s === "HYPERINFLATION" || s === "CRISIS") return "#ff4444";
  if (s === "RECESSION") return "#ff8800";
  if (s === "BOOM") return "#00ff88";
  return "#ffd700";
}

function ecoRevMeterColor(_meter: number) {
  return "var(--text-primary)";
}

function ecoPollBar(pct: number, blocks = 10) {
  const filled = Math.round(Math.min(100, Math.max(0, pct)) / (100 / blocks));
  return `${"█".repeat(filled)}${"░".repeat(blocks - filled)}`;
}

function ecoPresidentMessageColor(description: string) {
  const u = description.toUpperCase();
  if (u.includes("BREAKING")) return "#ff4444";
  if (description.trim().startsWith("AI:") || /\bAI:/i.test(description)) return "#aaaaff";
  return "#ffffff";
}

function ecoSheriffMessageColor(description: string) {
  const u = description.toUpperCase();
  if (u.includes("ELECT") || u.includes("VOTE") || u.includes("CANDIDATE")) return "#4488ff";
  if (u.includes("CORRUPT") || u.includes("BRIBE") || u.includes("SCANDAL")) return "#ff4444";
  if (u.includes("CRIME") || u.includes("ARREST") || u.includes("RAID") || u.includes("POLICE")) return "#ff8800";
  return "#ffffff";
}

function ecoPollPartyColor(partyId: string) {
  if (partyId === "consensus" || partyId === "conservatives") return "#ef4444";
  if (partyId === "reform" || partyId === "populists") return "#3b82f6";
  return getPartyColor(partyId);
}

function ecoVipRoleIcon(vipType: string) {
  if (vipType === "president") return "🏛️";
  if (vipType === "party_leader") return "🎩";
  if (vipType === "clan_leader") return "⚔️";
  return "👤";
}

function EcoTermDivider() {
  return <div style={{ height: 1, background: "#111111", margin: "8px 0" }} />;
}

function EcoTermBadge({ text }: { text: string; color?: string }) {
  return (
    <span
      className="instrument-label"
      style={{
        display: "inline-block",
        border: "1px solid var(--border)",
        color: "var(--text-secondary)",
        fontSize: 10,
        padding: "2px 6px",
        letterSpacing: 0.5,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function EcoApprovalBar({ pct, color = "#ffd700" }: { pct: number; color?: string }) {
  const width = `${Math.min(100, Math.max(0, pct))}%`;
  return (
    <div style={{ width: "100%", height: 2, background: "#111111", borderRadius: 1 }}>
      <div
        className="ecoBarFillAnim"
        style={{ ["--bar-width" as string]: width, height: 2, background: color, borderRadius: 1 } as CSSProperties}
      />
    </div>
  );
}

function EcoPollBar({ pct, color }: { pct: number; color: string }) {
  const width = `${Math.min(100, Math.max(0, pct))}%`;
  return (
    <div style={{ flex: 1, height: 4, background: "#111111", borderRadius: 2, minWidth: 0 }}>
      <div
        className="ecoBarFillAnim"
        style={{ ["--bar-width" as string]: width, height: 4, background: color, borderRadius: 2 } as CSSProperties}
      />
    </div>
  );
}

/** Instrument readout for governance metrics */
function PowerGameBar({
  label,
  value,
  maxValue,
}: {
  label: string;
  value: number;
  maxValue: number;
  color?: string;
  emoji?: string;
}) {
  const pct = maxValue > 0 ? Math.round((value / maxValue) * 100) : 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        marginBottom: 8,
        flexWrap: "wrap",
      }}
    >
      <span style={{ width: 72, color: "var(--text-muted)", flexShrink: 0 }}>{label}</span>
      <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
        {Math.round(value).toLocaleString("en-US")}
      </span>
      <span style={{ color: "var(--text-secondary)" }}>({pct}%)</span>
    </div>
  );
}

function ecoEconomicPhaseColor(phase: string): string {
  const p = (phase || "NORMAL").toUpperCase();
  if (p === "BOOM") return "#00ff88";
  if (p === "RECESSION") return "#ff8800";
  if (p === "DEPRESSION") return "#ff4444";
  return "#c8c8c8";
}

function ecoFormatZionShort(n: number) {
  const v = Math.abs(n);
  if (v >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-US");
}

/** Scientific instrument palette */
const ZION_TERM = {
  bg: "#000000",
  cardBg: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.08)",
  label: "rgba(255,255,255,0.5)",
  accent: "#00b4d8",
  money: "#a0a0a0",
  warn: "#ff6b6b",
  text: "#ffffff",
  muted: "#a0a0a0",
};

const EXPERIMENT_START_MS = new Date("2025-04-24T00:00:00Z").getTime();

function formatRunTime(elapsedMs: number): string {
  const d = Math.floor(elapsedMs / 86_400_000);
  const h = Math.floor((elapsedMs % 86_400_000) / 3_600_000);
  return `${d}d ${h}h`;
}

function ZionSectionHeader({ title, icon }: { title: string; icon?: string }) {
  return (
    <div className="zionSectionHeader">
      <div className="zionSectionLine" />
      <span className="zionSectionTitle">
        {icon ? `${icon} ` : ""}═══ {title} ═══
      </span>
      <div className="zionSectionLine" />
    </div>
  );
}

function ZionSectionSep() {
  return <div className="zionSectionSep" aria-hidden />;
}

function ZionTermCard({
  children,
  variant = "default",
  className = "",
  style,
}: {
  children: ReactNode;
  variant?: "default" | "crisis" | "warn";
  className?: string;
  style?: CSSProperties;
}) {
  const border =
    variant === "crisis"
      ? "1px solid rgba(255,68,68,0.45)"
      : variant === "warn"
        ? "1px solid rgba(255,170,0,0.3)"
        : `1px solid ${ZION_TERM.border}`;
  const background =
    variant === "crisis" ? "rgba(30,0,0,0.55)" : ZION_TERM.cardBg;
  return (
    <div
      className={`zionTermCard ${variant === "crisis" ? "zionTermCardCrisis" : ""} ${className}`}
      style={{ border, background, ...style }}
    >
      <div className="zionTermCardScanlines" aria-hidden />
      <div className="zionTermCardInner">{children}</div>
    </div>
  );
}

function ZionTermLabel({ children }: { children: ReactNode }) {
  return <div className="zionTermLabel">{children}</div>;
}

function ZionTermValue({
  children,
  color,
  size = "md",
}: {
  children: ReactNode;
  color?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div
      className={`zionTermValue zionTermValue${size === "lg" ? "Lg" : size === "sm" ? "Sm" : "Md"}`}
      style={{ color: color || ZION_TERM.text }}
    >
      {children}
    </div>
  );
}

function ZionMetricGrid({
  metrics,
  columns,
}: {
  metrics: { label: string; value: ReactNode; valueColor?: string }[];
  columns?: number;
}) {
  const cols = columns ?? metrics.length;
  return (
    <div
      className="zionMetricGrid"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {metrics.map((m) => (
        <div key={m.label} className="zionMetricCell">
          <ZionTermLabel>{m.label}</ZionTermLabel>
          <ZionTermValue color={m.valueColor}>{m.value}</ZionTermValue>
        </div>
      ))}
    </div>
  );
}

function ZionGovCard({
  name,
  badge,
  badgeColor = ZION_TERM.accent,
  metrics,
}: {
  name: string;
  badge: string;
  badgeColor?: string;
  metrics: { label: string; value: ReactNode; valueColor?: string }[];
}) {
  return (
    <ZionTermCard>
      <div className="zionGovCardHead">
        <span className="zionGovName">{name.toUpperCase()}</span>
        <span className="zionSectorBadge">{badge}</span>
      </div>
      <ZionMetricGrid metrics={metrics} />
    </ZionTermCard>
  );
}

function ZionPowerBar({
  label,
  value,
  maxValue,
  color,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
}) {
  const segments = 20;
  const filled = Math.round(Math.min(1, maxValue > 0 ? value / maxValue : 0) * segments);
  const bar = `${"█".repeat(filled)}${"░".repeat(Math.max(0, segments - filled))}`;
  return (
    <div className="zionPowerRow">
      <span className="zionPowerLabel">{label.toUpperCase()}</span>
      <span className="zionPowerBar" style={{ color }}>
        {bar}
      </span>
      <span className="zionPowerValue">{Math.round(value).toLocaleString("en-US")}</span>
    </div>
  );
}

type DistrictStatus = "police" | "gang" | "contested";

type DistrictCell = {
  id: string;
  name: string;
  status: DistrictStatus;
  control_pct: number;
  incidents_today: number;
  population: number;
  status_changed?: boolean;
};

type DistrictsPayload = {
  districts: DistrictCell[];
  alive_agents?: number;
  zone_counts?: { police: number; gang: number; contested: number };
  counts?: { police: number; gang: number; contested: number };
  updated_at?: string | null;
};

type District = DistrictCell;

type MapDistrictShape =
  | { id: number; name: string; type: "circle"; cx: number; cy: number; r: number }
  | { id: number; name: string; type: "poly"; points: string };

const MAP_DISTRICT_SHAPES: MapDistrictShape[] = [
  {
    id: 0,
    name: "Archipelago",
    points:
      "8,295 65,255 115,265 145,285 165,320 175,400 170,500 155,590 125,640 70,650 20,620 5,550 5,420 8,340",
    type: "poly",
  },
  {
    id: 1,
    name: "NW Cape",
    points: "200,55 340,45 355,95 340,155 290,185 225,175 200,130 195,85",
    type: "poly",
  },
  {
    id: 2,
    name: "North",
    points: "340,45 570,50 580,110 565,185 480,215 420,220 355,200 340,155 352,95",
    type: "poly",
  },
  {
    id: 3,
    name: "NE Hub",
    points: "570,50 790,60 810,130 795,210 720,230 640,225 580,205 578,115",
    type: "poly",
  },
  {
    id: 4,
    name: "Core",
    points: "390,265 570,255 585,340 580,430 510,445 390,440 375,355",
    type: "poly",
  },
  {
    id: 5,
    name: "West-Center",
    points: "240,200 385,195 395,265 378,355 370,445 280,450 230,435 215,350 225,260",
    type: "poly",
  },
  {
    id: 6,
    name: "East-Center",
    points: "570,255 730,248 745,335 740,440 660,455 580,448 578,435 582,345",
    type: "poly",
  },
  {
    id: 7,
    name: "North-Center",
    points: "355,200 565,190 578,255 390,268 375,255",
    type: "poly",
  },
  {
    id: 8,
    name: "South-Center",
    points: "370,445 580,435 590,530 570,620 490,640 380,635 360,545",
    type: "poly",
  },
  {
    id: 9,
    name: "Port",
    points: "215,440 365,445 362,545 340,635 275,660 210,645 195,560 200,480",
    type: "poly",
  },
  {
    id: 10,
    name: "South Island",
    points: "400,650 565,645 575,720 555,790 480,810 400,805 385,730",
    type: "poly",
  },
  {
    id: 11,
    name: "South Outskirts",
    points: "200,660 390,640 390,810 330,850 200,855 185,770 190,700",
    type: "poly",
  },
  {
    id: 12,
    name: "Admin Square",
    points: "790,60 980,70 1000,180 980,310 880,325 800,310 795,215 810,135",
    type: "poly",
  },
  {
    id: 13,
    name: "Hills",
    points: "740,248 880,240 990,315 975,430 900,460 810,450 745,435 742,340",
    type: "poly",
  },
  {
    id: 14,
    name: "Industrial Zone",
    points:
      "980,70 1270,75 1275,950 580,955 575,810 650,795 740,800 810,760 900,740 980,680 990,500 980,320 1000,185",
    type: "poly",
  },
];

const DistrictMap = ({ districts: districts_data }: { districts: District[] }) => {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; name: string } | null>(null);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        paddingBottom: "48%",
        overflow: "hidden",
        background: "#0a0e18",
      }}
    >
      <img
        src="/citymap.jpg"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "fill",
          display: "block",
          opacity: 0.9,
          filter: "contrast(1.15) brightness(1.05) saturate(0.9)",
        }}
        alt="ZION City Map"
      />
      <svg
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
        viewBox="0 0 1280 968"
        preserveAspectRatio="none"
      >
        <defs>
          <style>{`
          @keyframes pulse { 0%,100%{opacity:0.45} 50%{opacity:0.15} }
          .contested { animation: pulse 1.4s ease-in-out infinite; }
        `}</style>
        </defs>
        {MAP_DISTRICT_SHAPES.map((d, i) => {
          const dist = districts_data[i % districts_data.length];
          const status = dist?.status || "police";
          const fill = status === "police" ? "#00ff88" : status === "gang" ? "#ff2244" : "#ffcc00";
          const commonProps = {
            fill,
            fillOpacity: 0.22,
            stroke: fill,
            strokeWidth: 1.2,
            strokeOpacity: 0.7,
            className: status === "contested" ? "contested" : "",
            style: { cursor: "pointer", transition: "fill-opacity 0.2s" } as const,
            onMouseMove: (e: React.MouseEvent<SVGElement>) => {
              const svg = e.currentTarget.closest("svg");
              if (!svg) return;
              const rect = svg.getBoundingClientRect();
              setTooltip({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                name: d.name,
              });
            },
            onMouseLeave: () => setTooltip(null),
          };
          if (d.type === "circle") {
            return <circle key={d.id} cx={d.cx} cy={d.cy} r={d.r} {...commonProps} />;
          }
          return <polygon key={d.id} points={d.points} {...commonProps} />;
        })}
      </svg>
      <svg
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        viewBox="0 0 1280 968"
        preserveAspectRatio="none"
      >
        <defs>
          <style>{`
    @keyframes fw { 0%{offset-distance:0%} 100%{offset-distance:100%} }
    @keyframes bw { 0%{offset-distance:100%} 100%{offset-distance:0%} }
    @keyframes blink { 0%,100%{opacity:0.9} 50%{opacity:0.1} }
  `}</style>
        </defs>

        {[
          { path: "M 200,120 L 580,100", dur: 12, col: "#ffee88" },
          { path: "M 580,100 L 200,120", dur: 15, col: "#ff9966" },
          { path: "M 580,100 L 820,110", dur: 10, col: "#ffee88" },
          { path: "M 820,110 L 580,100", dur: 13, col: "#88ccff" },
          { path: "M 820,110 L 1050,140", dur: 14, col: "#ffee88" },
          { path: "M 200,120 L 230,290", dur: 9, col: "#ff9966" },
          { path: "M 230,290 L 200,120", dur: 11, col: "#ffee88" },
          { path: "M 350,95 L 360,280", dur: 10, col: "#88ccff" },
          { path: "M 580,100 L 590,260", dur: 8, col: "#ffee88" },
          { path: "M 590,260 L 580,100", dur: 12, col: "#ff9966" },
          { path: "M 820,110 L 840,295", dur: 11, col: "#88ffcc" },
          { path: "M 1050,140 L 1060,380", dur: 9, col: "#ffee88" },
          { path: "M 230,290 L 590,265", dur: 13, col: "#ffee88" },
          { path: "M 590,265 L 230,290", dur: 10, col: "#ff9966" },
          { path: "M 590,265 L 840,260", dur: 12, col: "#88ccff" },
          { path: "M 840,260 L 590,265", dur: 14, col: "#ffee88" },
          { path: "M 360,280 L 370,480", dur: 8, col: "#ffee88" },
          { path: "M 370,480 L 360,280", dur: 11, col: "#ff9966" },
          { path: "M 495,265 L 500,480", dur: 9, col: "#ffee88" },
          { path: "M 500,480 L 495,265", dur: 13, col: "#88ccff" },
          { path: "M 685,260 L 690,490", dur: 10, col: "#ff9966" },
          { path: "M 840,260 L 860,490", dur: 12, col: "#ffee88" },
          { path: "M 1060,380 L 1070,750", dur: 8, col: "#88ccff" },
          { path: "M 370,480 L 685,490", dur: 11, col: "#ffee88" },
          { path: "M 685,490 L 370,480", dur: 9, col: "#ff9966" },
          { path: "M 370,480 L 240,510", dur: 13, col: "#88ffcc" },
          { path: "M 685,490 L 860,495", dur: 10, col: "#ffee88" },
          { path: "M 500,480 L 510,650", dur: 12, col: "#ff9966" },
          { path: "M 685,490 L 695,660", dur: 9, col: "#88ccff" },
          { path: "M 240,510 L 250,680", dur: 11, col: "#ffee88" },
          { path: "M 860,495 L 870,700", dur: 10, col: "#ff9966" },
          { path: "M 250,680 L 510,660", dur: 13, col: "#ffee88" },
          { path: "M 510,660 L 695,660", dur: 11, col: "#88ccff" },
          { path: "M 510,660 L 520,800", dur: 9, col: "#ffee88" },
          { path: "M 870,700 L 1070,720", dur: 12, col: "#ff9966" },
        ].flatMap((r, i) =>
          [0, 33, 66].map((d) => (
            <circle
              key={`r${i}d${d}`}
              r="1.5"
              fill={r.col}
              opacity="0.65"
              style={{
                offsetPath: `path("${r.path}")`,
                offsetDistance: `${d}%`,
                animation: `fw ${r.dur + d * 0.15}s linear infinite`,
              }}
            />
          ))
        )}

        {[
          [460, 270],
          [590, 255],
          [720, 248],
          [950, 185],
          [1100, 200],
          [340, 310],
          [840, 290],
          [1050, 320],
          [480, 380],
          [680, 375],
          [860, 400],
          [1060, 450],
          [450, 490],
          [640, 480],
          [860, 500],
          [250, 520],
          [370, 600],
          [520, 580],
          [690, 570],
          [870, 590],
          [1070, 600],
          [260, 690],
          [520, 720],
          [700, 710],
          [880, 730],
        ].map(([x, y], i) => (
          <circle
            key={`t${i}`}
            cx={x}
            cy={y}
            r="1.8"
            fill="#ff3333"
            opacity="0.8"
            style={{ animation: `blink ${1.2 + i * 0.27}s ease-in-out infinite` }}
          />
        ))}

        {[
          [420, 200],
          [550, 195],
          [670, 190],
          [800, 185],
          [920, 200],
          [1080, 230],
          [380, 370],
          [510, 365],
          [650, 360],
          [800, 355],
          [490, 530],
          [630, 525],
          [800, 530],
        ].map(([x, y], i) => (
          <circle
            key={`g${i}`}
            cx={x}
            cy={y}
            r="1.5"
            fill="#00ff88"
            opacity="0.55"
            style={{ animation: `blink ${2 + i * 0.35}s ease-in-out infinite` }}
          />
        ))}
      </svg>
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x + 12,
            top: tooltip.y - 24,
            background: "rgba(0,0,0,0.85)",
            border: "1px solid #00ff88",
            color: "#00ff88",
            fontFamily: "monospace",
            fontSize: "12px",
            padding: "3px 8px",
            borderRadius: "4px",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {tooltip.name}
        </div>
      )}
    </div>
  );
};

function DistrictMapPanel() {
  const [mapStats, setMapStats] = useState<Stats | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) return;
        setMapStats(parseApiStatsResponse(await res.json()));
      } catch {
        /* ignore */
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, []);

  const prosperity = useMemo(() => {
    if (!mapStats) return 0.5;
    return computeProsperity({
      unemployment: mapStats.unemployment_rate ?? 0,
      revolution: mapStats.revolution_meter ?? 0,
      poverty: mapStats.poverty_pct ?? 0,
      population: mapStats.alive ?? mapStats.alive_agents ?? 0,
    });
  }, [mapStats]);

  const civilizationData = useMemo(
    () => ({
      total: mapStats?.alive_agents ?? mapStats?.alive,
      elite: mapStats?.elite,
      middle: mapStats?.middle,
      poor: mapStats?.poor,
      critical: mapStats?.critical,
      unemployment: mapStats?.unemployment_rate ?? 0,
      revolution: mapStats?.revolution_meter ?? 0,
      poverty: mapStats?.poverty_pct ?? 0,
      population: mapStats?.alive ?? mapStats?.alive_agents ?? 0,
    }),
    [mapStats]
  );

  const popChips = [
    { label: "TOTAL", value: mapStats?.alive_agents ?? mapStats?.alive, valueColor: "#00ff88" },
    { label: "ELITE", value: mapStats?.elite, valueColor: "#f0c040" },
    { label: "MIDDLE", value: mapStats?.middle, valueColor: "#60a5fa" },
    { label: "POOR", value: mapStats?.poor, valueColor: "#fb923c" },
    { label: "CRITICAL", value: mapStats?.critical, valueColor: "#f87171" },
  ];

  return (
    <div className="districtMapWrap">
      <div className="districtMapGlobeWrap">
        <LivingPlanet
          prosperity={prosperity}
          revolution={civilizationData.revolution ?? 0}
          population={civilizationData.population ?? 0}
          civilizationData={civilizationData}
          height={400}
        />
      </div>
      <GlassCard
        className="observatoryPopStrip"
        style={{ width: "100%", padding: 0, borderRadius: 0 }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-around",
            alignItems: "center",
            width: "100%",
            padding: "16px 32px",
          }}
        >
          {popChips.map((chip) => (
            <div
              key={chip.label}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <span
                style={{
                  fontSize: "0.65rem",
                  letterSpacing: "0.12em",
                  color: "#6b7280",
                  textTransform: "uppercase",
                  lineHeight: 1,
                }}
              >
                {chip.label}
              </span>
              <span
                style={{
                  fontSize: "16px",
                  color: chip.valueColor,
                  fontWeight: "bold",
                  fontFamily: "monospace",
                  lineHeight: 1.1,
                }}
              >
                {(chip.value ?? 0).toLocaleString("en-US")}
              </span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

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
  alive_agents: number;
  dead: number;
  /** alive + dead (API returns alive/dead, not total_agents) */
  total_agents: number;
  total_zion: number;
  active_clans: number;
  deaths_today: number;
  elite?: number;
  middle?: number;
  poor?: number;
  critical?: number;
  poverty_pct?: number;
  crime_pct?: number;
  crime_rate?: number;
  revolution_meter?: number;
  population_pressure?: "normal" | "high" | "critical" | "famine";
  tax_multiplier?: number;
  gini_coefficient?: number;
  unemployment_rate?: number;
}

interface PoliticalEconomyData {
  crisis: {
    is_active?: boolean;
    crime_rate?: number;
    gang_crime_pct?: number;
    unemployment_rate?: number;
    social_debt?: number;
    revolution_pressure?: number;
    economic_phase?: string;
    police_effectiveness?: number;
    gini_coefficient?: number;
  };
  metrics: {
    crime_rate?: number;
    gang_crime_pct?: number;
    unemployment_rate?: number;
    gini_coefficient?: number;
    economic_phase?: string;
    police_effectiveness?: number;
    revolution_pressure?: number;
    president_name?: string;
    gdp_growth_rate?: number;
  };
  power: {
    scores: {
      president_power?: number;
      sheriff_power?: number;
      senate_power?: number;
    };
    recent_events?: unknown[];
  };
  gangs: Array<{
    id: number;
    name: string;
    members: number;
    treasury: number;
    territory_control: number;
    gang_health?: number;
  }>;
}

/** Map /api/stats JSON — API uses alive, dead, total_zion, deaths_today (not alive_agents). */
function parseApiStatsResponse(raw: unknown): Stats {
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
    alive_agents: alive,
    dead,
    total_agents: alive + dead > 0 ? alive + dead : alive,
    total_zion: Number(s.total_zion ?? 0),
    active_clans: Number(s.active_clans ?? 0),
    deaths_today: Number(s.deaths_today ?? 0),
    elite: Number(s.elite ?? 0),
    middle: Number(s.middle ?? 0),
    poor: Number(s.poor ?? 0),
    critical: Number(s.critical ?? 0),
    poverty_pct: Number(s.poverty_pct ?? 0),
    crime_pct: Number(s.crime_pct ?? 0),
    crime_rate: Number(s.crime_rate ?? 0),
    revolution_meter: Number(s.revolution_meter ?? 0),
    population_pressure: (["normal", "high", "critical", "famine"].includes(String(s.population_pressure ?? ""))
      ? String(s.population_pressure)
      : "normal") as Stats["population_pressure"],
    tax_multiplier: Number(s.tax_multiplier ?? 1),
    gini_coefficient: Number(s.gini_coefficient ?? 0),
    unemployment_rate: Number(s.unemployment_rate ?? 0),
  };
}

/** Strip AI model tags from ECO-POL activity log descriptions. */
function cleanActivityDescription(desc: string): string {
  return desc
    .replace(/\[GPT-PRESIDENT\]/g, "🏛")
    .replace(/\[DEEPSEEK-SENATE\]/g, "🏦")
    .replace(/\[GEMINI-SHERIFF\]/g, "🚔")
    .replace(/\[QWEN-ZRS\]/g, "💰")
    .replace(/\[LLAMA-GANGS\]/g, "💀")
    .replace(/\[PHI-CORPS\]/g, "🏢")
    .replace(/\(openai\/gpt-4o-mini\)/g, "")
    .replace(/\(deepseek\/deepseek-chat-v3-0324\)/g, "")
    .replace(/\(google\/gemini-3\.1-flash-lite\)/g, "")
    .replace(/\(qwen\/qwen-2\.5-7b-instruct\)/g, "")
    .replace(/\(meta-llama\/llama-3\.1-8b-instruct\)/g, "")
    .replace(/\(microsoft\/phi-4-mini-instruct\)/g, "")
    .replace(/President AI \([^)]+\):/g, "🏛")
    .replace(/Senate AI \([^)]+\):/g, "🏦")
    .replace(/Sheriff AI \([^)]+\):/g, "🚔")
    .replace(/ZRS AI \([^)]+\):/g, "💰")
    .replace(/Gang AI \([^)]+\):/g, "💀")
    .replace(/Corp AI \([^)]+\):/g, "🏢")
    .replace(/\| Outcome:.*$/g, "")
    .trim();
}

function formatEventTime(ts: string): string {
  if (!ts) return "";
  try {
    const d = new Date(ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatLawProposer(proposedBy?: string): string {
  if (!proposedBy) return "";
  return proposedBy
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getLawStatusStyle(status: string): { label: string; color: string; border: string } {
  const s = String(status || "").toLowerCase();
  if (s === "passed") {
    return { label: "PASS", color: "#00ff88", border: "2px solid rgba(0, 255, 136, 0.6)" };
  }
  if (s === "pending") {
    return { label: "PENDING", color: "#ffd93d", border: "2px solid rgba(255, 217, 61, 0.5)" };
  }
  return { label: "FAIL", color: "#ff4444", border: "2px solid rgba(255, 60, 60, 0.4)" };
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
  blob_id?: string;
  powered_by?: string;
  tx_hash?: string;
  explorer_url?: string;
  sui_url?: string;
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

/** Internal proof page — never link ZCO cards directly to Walrus JSON. */
function zcoProofHref(decision: ZcoDecision): string | null {
  const blobId = decision.blob_id || decision.tx_hash;
  if (blobId && !String(blobId).startsWith("http")) {
    return `/zco/${blobId}`;
  }
  const url = decision.explorer_url || "";
  const match = url.match(/\/blobs\/([^/?#]+)/);
  return match ? `/zco/${match[1]}` : null;
}

function zcoAgreementDisplayColor(pct: number): string {
  if (pct >= 85) return "#22c55e";
  if (pct >= 50) return ZCO_ACCENT;
  if (pct >= 25) return "#f59e0b";
  return "#ef4444";
}

function zcoConsensusShort(d: ZcoDecision): string {
  const c = d.consensus;
  let votesFor = 0;
  let totalVotes = 0;
  if (c?.method === "consensus" && c.votes_for != null && c.total_votes != null) {
    votesFor = c.votes_for;
    totalVotes = c.total_votes;
  } else {
    const votes = d.votes ?? [];
    totalVotes = votes.length;
    votesFor = votes.filter((v) => v.status === "voted").length;
  }
  if (totalVotes === 0) return "—";
  const ratio = `${votesFor}/${totalVotes}`;
  if (votesFor === totalVotes) return `${ratio}  RATIFIED`;
  if (votesFor > 0) return `${ratio}  PARTIAL`;
  return `${ratio}  PENDING`;
}

const classMeta = (agentClass: string) => {
  const c = (agentClass || "").trim().toLowerCase();
  const tier =
    c === "elite"
      ? ("tier-elite" as const)
      : c === "middle"
        ? ("tier-middle" as const)
        : c === "critical"
          ? ("tier-critical" as const)
          : ("tier-poor" as const);
  return { icon: "", border: "var(--border)", tier };
};

function chronicleTypeKey(type: string): string {
  const t = type.toLowerCase().replace(/-/g, "_");
  if (t.includes("neo")) return "neo";
  if (t.includes("clan") && t.includes("war")) return "clan_war";
  return t;
}

function chronicleMeta(_type: string): { icon: string; border: string } {
  return { icon: "", border: "var(--border)" };
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
  volume_sui?: number;
  end_date?: string | null;
  token?: string;
  image_url?: string | null;
  description?: string | null;
  resolution_criteria?: string | null;
  resolution_source?: string | null;
  created_at?: string | null;
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
  | "geopolitics"
  | "finance"
  | "tech"
  | "culture";

const ZIONBET_TAB_LABELS: Record<ZionbetBetTab, string> = {
  civilization: "CIVILIZATION",
  crypto: "CRYPTO",
  sports: "SPORTS",
  politics: "POLITICS",
  geopolitics: "GEOPOLITICS",
  finance: "FINANCE",
  tech: "TECH",
  culture: "WORLD",
};

type ZionMarketRow = {
  market_id: string;
  title: string;
  description?: string;
  category?: string;
  options?: Array<{ id: string; label: string }>;
  expires_at?: string | null;
  source?: string;
};

function zionCivMarketIcon(category: string, title: string): string {
  const t = (title || "").toLowerCase();
  if (
    category === "politics" ||
    t.includes("president") ||
    t.includes("revolution") ||
    t.includes("sheriff")
  ) {
    return "https://cdn-icons-png.flaticon.com/512/3176/3176272.png";
  }
  if (
    category === "economy" ||
    t.includes("economic") ||
    t.includes("corporation") ||
    t.includes("bankrupt") ||
    t.includes("hyperinflation") ||
    t.includes("zion this month")
  ) {
    return "https://cdn-icons-png.flaticon.com/512/2830/2830284.png";
  }
  if (category === "clans" || t.includes("clan") || t.includes("war")) {
    return "https://cdn-icons-png.flaticon.com/512/1048/1048953.png";
  }
  if (
    category === "crime" ||
    t.includes("gang") ||
    t.includes("police") ||
    t.includes("arrest") ||
    t.includes("rob")
  ) {
    return "https://cdn-icons-png.flaticon.com/512/1940/1940611.png";
  }
  if (
    category === "demographics" ||
    t.includes("agents die") ||
    t.includes("born") ||
    t.includes("survive") ||
    t.includes("population") ||
    t.includes("class")
  ) {
    return "https://cdn-icons-png.flaticon.com/512/1077/1077114.png";
  }
  if (category === "trading" || t.includes("z-perps") || t.includes("trader")) {
    return "https://cdn-icons-png.flaticon.com/512/2534/2534844.png";
  }
  return "https://cdn-icons-png.flaticon.com/512/2103/2103633.png";
}

function zionMarketRowToApiMarket(market: ZionMarketRow): ZionbetApiMarket {
  return {
    id: market.market_id,
    question: market.title,
    event_type: market.market_id,
    category: market.category || "civilization",
    yes_pct: 50,
    no_pct: 50,
    end_date: market.expires_at || null,
    description: market.description || null,
    timeframe: "24h",
    image_url: zionCivMarketIcon(market.category || "", market.title),
  };
}

function zionMarketOptionButtonLabel(label: string, cents: number): string {
  const trimmed = label.trim();
  if (!trimmed) return `${cents}¢`;
  const short = trimmed.length > 22 ? `${trimmed.slice(0, 20)}…` : trimmed;
  return `${short} ${cents}¢`;
}

/** On-chain binary markets (DeepBook / zion_bet) — crypto tab top section */
const DEEPBOOK_BINARY_MARKETS: ZionbetApiMarket[] = [
  { id: "btc_15m", question: "Will BTC go UP in the next 15 minutes?", event_type: "btc_15m", timeframe: "15m", category: "crypto", yes_pct: 50, no_pct: 50, token: "BTC" },
  { id: "btc_1h", question: "Will BTC go UP in the next 1 hour?", event_type: "btc_1h", timeframe: "1h", category: "crypto", yes_pct: 50, no_pct: 50, token: "BTC" },
  { id: "eth_1h", question: "Will ETH go UP in the next 1 hour?", event_type: "eth_1h", timeframe: "1h", category: "crypto", yes_pct: 50, no_pct: 50, token: "ETH" },
  { id: "sui_1h", question: "Will SUI go UP in the next 1 hour?", event_type: "sui_1h", timeframe: "1h", category: "crypto", yes_pct: 50, no_pct: 50, token: "SUI" },
  { id: "sui_24h", question: "Will SUI go UP today?", event_type: "sui_24h", timeframe: "24h", category: "crypto", yes_pct: 50, no_pct: 50, token: "SUI" },
];

const isDeepbookCryptoMarket = (marketId: string) =>
  marketId.startsWith("btc") || marketId.startsWith("eth") || marketId.startsWith("sui");

const cryptoIconWrapStyle: CSSProperties = {
  border: "2px solid gold",
  borderRadius: "50%",
  boxShadow: "0 0 8px gold",
  flexShrink: 0,
  width: 40,
  height: 40,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const SUI_LOGO_URLS = [
  "https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg",
  "https://s2.coinmarketcap.com/static/img/coins/64x64/20947.png",
  "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/sui/info/logo.png",
] as const;

const SuiLogo = () => {
  const [imgIdx, setImgIdx] = useState(0);
  const imgSrc = SUI_LOGO_URLS[imgIdx];

  return (
    <div
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: "2px solid gold",
        boxShadow: "0 0 8px gold",
        overflow: "hidden",
        flexShrink: 0,
        background: "#4DA2FF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-hidden
    >
      <img
        src={imgSrc}
        alt="SUI"
        style={{
          objectFit: "cover",
          objectPosition: "center",
          width: "100%",
          height: "100%",
        }}
        onError={() => {
          setImgIdx((i) => Math.min(i + 1, SUI_LOGO_URLS.length - 1));
        }}
      />
    </div>
  );
};

const CryptoIcon = ({ marketId }: { marketId: string }) => {
  const wrap = (svg: ReactNode) => (
    <div style={cryptoIconWrapStyle} aria-hidden>
      {svg}
    </div>
  );

  if (marketId.startsWith("btc")) {
    return wrap(
      <svg viewBox="0 0 32 32" width="40" height="40">
        <circle cx="16" cy="16" r="16" fill="#F7931A" />
        <path
          fill="white"
          d="M22.8 14.5c.3-2.1-1.3-3.2-3.5-4l.7-2.8-1.7-.4-.7 2.7-.9-.2.7-2.8-1.7-.4-.7 2.8-.7-.2-2.4-.6-.4 1.8s1.3.3 1.2.3c.7.2.8.6.8 1l-.8 3.3c0 .1.1.1.1.2h-.2l-1.2 4.7c-.1.2-.3.6-.9.4 0 .1-1.2-.3-1.2-.3l-.8 2 2.2.6.7.2-.7 2.8 1.7.4.7-2.8.9.2-.7 2.8 1.7.4.7-2.8c2.9.5 5 .3 5.9-2.3.7-2-.1-3.2-1.5-3.9 1.1-.3 1.9-1 2.1-2.5zm-3.7 5.2c-.5 2-3.8 1-4.9.7l.9-3.5c1.1.3 4.5.8 4 2.8zm.5-5.2c-.5 1.8-3.2 1-4.1.7l.8-3.2c.9.2 3.8.7 3.3 2.5z"
        />
      </svg>
    );
  }
  if (marketId.startsWith("eth")) {
    return wrap(
      <svg viewBox="0 0 32 32" width="40" height="40">
        <circle cx="16" cy="16" r="16" fill="#627EEA" />
        <path fill="white" fillOpacity=".6" d="M16.498 4v8.87l7.497 3.35z" />
        <path fill="white" d="M16.498 4L9 16.22l7.498-3.35z" />
        <path fill="white" fillOpacity=".6" d="M16.498 21.968v6.027L24 17.616z" />
        <path fill="white" d="M16.498 27.995v-6.028L9 17.616z" />
        <path fill="white" fillOpacity=".2" d="M16.498 20.573l7.497-4.353-7.497-3.348z" />
        <path fill="white" fillOpacity=".6" d="M9 16.22l7.498 4.353v-7.701z" />
      </svg>
    );
  }
  if (marketId.startsWith("sui")) {
    return <SuiLogo />;
  }
  return wrap(
    <svg viewBox="0 0 32 32" width="40" height="40">
      <circle cx="16" cy="16" r="16" fill="#666" />
    </svg>
  );
};

const POLY_TABS: ZionbetBetTab[] = [
  "crypto",
  "sports",
  "politics",
  "geopolitics",
  "finance",
  "tech",
  "culture",
];

const ZIONBET_CARD_BORDER = "var(--border)";
const ZIONBET_CARD_BG = "var(--bg-secondary)";

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
function zionbetVolumeSuiAmount(volume?: number, id?: string, volumeSui?: number): number {
  if (volumeSui != null && Number.isFinite(volumeSui)) return volumeSui;
  const v = Number(volume) || 0;
  if (id?.startsWith("poly-")) return v / 1000;
  if (v > 0) return Math.round(v);
  if (id) return zionbetStableVolume(id, 500, 2000);
  return 0;
}

function zionbetVolumeSuiLabel(volume?: number, id?: string, volumeSui?: number): string {
  const sui = zionbetVolumeSuiAmount(volume, id, volumeSui);
  if (sui >= 1_000_000) return `${(sui / 1_000_000).toFixed(1)}M SUI vol`;
  if (sui >= 1_000) return `${(sui / 1_000).toFixed(1)}K SUI vol`;
  return `${sui.toLocaleString()} SUI vol`;
}

/** Polymarket USD volume (raw API volume field). */
function zionbetPolyDollarVolumeLabel(volume?: number): string {
  const v = Number(volume) || 0;
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    const label = m >= 10 ? Math.round(m) : Math.round(m * 10) / 10;
    return `$${label}M Volume`;
  }
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K Volume`;
  return `$${Math.round(v)} Volume`;
}

function zionbetMarketVolumeLabel(volume?: number, id?: string, volumeSui?: number): string {
  if (id?.startsWith("poly-")) return zionbetPolyDollarVolumeLabel(volume);
  return zionbetVolumeSuiLabel(volume, id, volumeSui);
}

function zionbetCardSortVolume(id: string, volume?: number, volumeSui?: number): number {
  if (id?.startsWith("poly-")) return Number(volume) || 0;
  return zionbetVolumeSuiAmount(volume, id, volumeSui);
}

function zionbetCardVolumeSui(
  _tab: ZionbetBetTab,
  id: string,
  volume?: number,
  volumeSui?: number
): number {
  return zionbetCardSortVolume(id, volume, volumeSui);
}

function zionbetIsPolyMarket(id: string): boolean {
  return id.startsWith("poly-");
}

const ZION_POLY_RESOLUTION_SOURCE = "ZION Oracle Network";

function zionbetDisplayResolutionSource(m: ZionbetApiMarket): string {
  const raw = m.resolution_source?.trim();
  if (raw === "Polymarket / UMA" || raw === "Real-world data") return ZION_POLY_RESOLUTION_SOURCE;
  if (raw) return raw;
  return zionbetIsPolyMarket(m.id) ? ZION_POLY_RESOLUTION_SOURCE : "ZION Simulation";
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
  if (yes > 60) return { symbol: "↑", color: "var(--text-primary)" };
  if (yes < 40) return { symbol: "↓", color: "var(--text-secondary)" };
  return { symbol: "—", color: "var(--text-muted)" };
}

type ZionPolyMarket = {
  market_id: string;
  question: string;
  category: string;
  yes_price: number;
  no_price: number;
  volume?: number;
  volume_sui?: number;
  end_date?: string | null;
  image_url?: string | null;
  description?: string | null;
  resolution_criteria?: string | null;
  resolution_source?: string | null;
  created_at?: string | null;
};

function zionbetNormalizePolyApiRow(row: Record<string, unknown>): ZionPolyMarket {
  const marketId = String(row.market_id ?? row.id ?? "");
  const descRaw = row.description;
  const critRaw = row.resolution_criteria;
  return {
    market_id: marketId,
    question: String(row.question ?? ""),
    category: String(row.category ?? "culture"),
    yes_price: Number(row.yes_price ?? row.yes_pct ?? 50),
    no_price: Number(row.no_price ?? row.no_pct ?? 50),
    volume: row.volume != null ? Number(row.volume) : undefined,
    volume_sui: row.volume_sui != null ? Number(row.volume_sui) : undefined,
    end_date: (row.end_date as string | null | undefined) ?? null,
    image_url: (row.image_url as string | null | undefined) ?? null,
    description:
      typeof descRaw === "string"
        ? descRaw
        : descRaw != null && descRaw !== ""
          ? String(descRaw)
          : null,
    resolution_criteria: typeof critRaw === "string" ? critRaw : critRaw != null ? String(critRaw) : null,
    resolution_source:
      typeof row.resolution_source === "string"
        ? row.resolution_source
        : row.resolution_source != null
          ? String(row.resolution_source)
          : null,
    created_at: row.created_at != null ? String(row.created_at) : null,
  };
}

function polyToApiMarket(m: ZionPolyMarket): ZionbetApiMarket {
  const yes = Math.round(Number(m.yes_price) || 50);
  const id = String(m.market_id).startsWith("poly-") ? m.market_id : `poly-${m.market_id}`;
  const volumeSui =
    m.volume_sui != null ? Number(m.volume_sui) : m.volume != null ? Number(m.volume) / 1000 : undefined;
  const desc = (m.description || m.resolution_criteria || "").trim() || null;
  return {
    id,
    question: m.question,
    event_type: `poly_${id}`,
    category: m.category,
    yes_pct: yes,
    no_pct: 100 - yes,
    seed_yes_cents: yes,
    volume: m.volume,
    volume_sui: volumeSui,
    end_date: m.end_date,
    image_url: m.image_url ?? null,
    description: desc,
    resolution_criteria: m.resolution_criteria?.trim() || desc,
    resolution_source: m.resolution_source ?? null,
    created_at: m.created_at ?? null,
  };
}

function zionbetMarketDescriptionText(m: ZionbetApiMarket): string {
  const fromApi = m.description?.trim() || m.resolution_criteria?.trim();
  if (fromApi) return fromApi;
  return zionbetResolutionCriteria(m);
}

function zionbetPolyRowToApiMarket(row: ZionPolyMarket | Record<string, unknown>): ZionbetApiMarket {
  const m = zionbetNormalizePolyApiRow(
    row && typeof row === "object" ? (row as Record<string, unknown>) : {}
  );
  return polyToApiMarket(m);
}

function zionbetFormatMarketOpened(iso?: string | null): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ZionBetResolutionRulesCard({
  market,
  sectionTitleStyle,
  panelStyle,
  useGlassCard,
  useDetailInnerPanel,
}: {
  market: ZionbetApiMarket;
  sectionTitleStyle: CSSProperties;
  panelStyle?: CSSProperties;
  useGlassCard?: boolean;
  useDetailInnerPanel?: boolean;
}) {
  const [showFullDesc, setShowFullDesc] = useState(false);

  useEffect(() => {
    setShowFullDesc(false);
  }, [market.id, market.description, market.resolution_criteria]);

  const bodyText = zionbetMarketDescriptionText(market);
  const resolutionSource = zionbetDisplayResolutionSource(market);
  const openedLabel = zionbetFormatMarketOpened(market.created_at);

  const content = (
    <>
      <h2 style={sectionTitleStyle}>RESOLUTION RULES</h2>
      {bodyText ? (
        <div>
          <div
            style={{
              fontSize: "0.85rem",
              color: "rgba(180,220,255,0.8)",
              lineHeight: "1.6",
              marginBottom: "12px",
              whiteSpace: "pre-wrap",
            }}
          >
            {showFullDesc
              ? bodyText
              : bodyText.slice(0, 300) + (bodyText.length > 300 ? "..." : "")}
          </div>
          {bodyText.length > 300 && (
            <button
              type="button"
              onClick={() => setShowFullDesc(!showFullDesc)}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(100,180,255,0.2)",
                color: "rgba(150,210,255,0.8)",
                padding: "4px 12px",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.8rem",
                marginBottom: "14px",
              }}
            >
              {showFullDesc ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      ) : (
        <div style={{ color: "rgba(255,255,255,0.4)", marginBottom: "12px", fontSize: "0.85rem" }}>
          No description available
        </div>
      )}
      <p style={{ margin: "0 0 8px", fontSize: "13px", lineHeight: 1.6, color: ZB_VISTA_LABEL }}>
        <strong style={{ color: "rgba(200,230,255,0.95)", fontWeight: 600 }}>Resolution source: </strong>
        {resolutionSource}
      </p>
      {openedLabel ? (
        <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.6, color: ZB_VISTA_LABEL }}>
          <strong style={{ color: "rgba(200,230,255,0.95)", fontWeight: 600 }}>Market opened: </strong>
          {openedLabel}
        </p>
      ) : null}
    </>
  );

  if (useDetailInnerPanel) {
    return <section style={zionbetDetailInnerPanel()}>{content}</section>;
  }

  if (useGlassCard) {
    return (
      <GlassCard style={{ padding: "20px" }}>
        {content}
      </GlassCard>
    );
  }

  return <section style={panelStyle ?? zionbetAeroPanel()}>{content}</section>;
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

const zionbetMarketQuestionCache: Record<string, string> = {};

function zionbetQuestionLooksLikeMarketId(question: string | undefined | null, marketId?: string): boolean {
  const q = (question || "").trim();
  if (!q) return true;
  const mid = (marketId || "").trim();
  if (mid && q.toLowerCase() === mid.toLowerCase()) return true;
  if (/^poly-\d+$/i.test(q)) return true;
  return false;
}

function zionbetFindMarketQuestionInLists(
  marketId: string,
  polyByTab: Record<string, ZionbetApiMarket[]>,
  zionbetMarkets: ZionbetMarketsBundle
): string | null {
  const fromPoly = Object.values(polyByTab)
    .flat()
    .find((m) => m.id === marketId);
  if (fromPoly?.question?.trim()) return fromPoly.question.trim();
  const native = [
    ...zionbetMarkets.crypto,
    ...zionbetMarkets.sports,
    ...zionbetMarkets.civilization,
  ].find((m) => m.id === marketId);
  return native?.question?.trim() || null;
}

function zionbetFormatMarketIdFallback(marketId: string): string {
  const id = marketId.trim();
  if (id.length <= 18) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

function useZionbetBetDisplayQuestion(
  bet: ZionBetMyBetRow,
  polyByTab: Record<string, ZionbetApiMarket[]>,
  zionbetMarkets: ZionbetMarketsBundle
): { text: string; isFallbackId: boolean } {
  const resolve = useCallback((): { text: string; isFallbackId: boolean } => {
    const fromBet = bet.question?.trim();
    const mid = bet.market_id?.trim();
    if (fromBet && !zionbetQuestionLooksLikeMarketId(fromBet, mid)) {
      return { text: zionbetCleanMarketTitle(fromBet), isFallbackId: false };
    }
    if (mid) {
      const cached = zionbetMarketQuestionCache[mid];
      if (cached) {
        return { text: zionbetCleanMarketTitle(cached), isFallbackId: false };
      }
      const listed = zionbetFindMarketQuestionInLists(mid, polyByTab, zionbetMarkets);
      if (listed) {
        zionbetMarketQuestionCache[mid] = listed;
        return { text: zionbetCleanMarketTitle(listed), isFallbackId: false };
      }
      return { text: zionbetFormatMarketIdFallback(mid), isFallbackId: true };
    }
    return {
      text: fromBet ? zionbetCleanMarketTitle(fromBet) : "Unknown market",
      isFallbackId: !fromBet,
    };
  }, [bet.question, bet.market_id, polyByTab, zionbetMarkets]);

  const [state, setState] = useState(resolve);

  useEffect(() => {
    setState(resolve());
  }, [resolve]);

  useEffect(() => {
    const mid = bet.market_id?.trim();
    if (!mid) return;
    const listed = zionbetFindMarketQuestionInLists(mid, polyByTab, zionbetMarkets);
    if (listed) {
      zionbetMarketQuestionCache[mid] = listed;
      setState({ text: zionbetCleanMarketTitle(listed), isFallbackId: false });
      return;
    }
    if (zionbetMarketQuestionCache[mid]) return;
    const fromBet = bet.question?.trim();
    if (fromBet && !zionbetQuestionLooksLikeMarketId(fromBet, mid)) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/zionbet/market/${encodeURIComponent(mid)}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const row = (await res.json()) as { question?: string; error?: string };
        if (cancelled || row?.error) return;
        const q = String(row.question || "").trim();
        if (!q) return;
        zionbetMarketQuestionCache[mid] = q;
        setState({ text: zionbetCleanMarketTitle(q), isFallbackId: false });
      } catch {
        /* keep fallback label */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bet.market_id, bet.question, polyByTab, zionbetMarkets]);

  return state;
}

type ZionBetToastPayload =
  | string
  | { message: string; disclaimer?: string; type?: "success" | "warning" | "error" };

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
    iran: "#fecaca",
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

const ZIONBET_CATEGORY_FALLBACK: Record<string, string> = {
  sports: "🏆",
  politics: "🗳️",
  finance: "💰",
  geopolitics: "🌍",
  tech: "💻",
  culture: "🎭",
  crypto: "₿",
  civilization: "🏛️",
};

/** Flag emoji for politics markets when image_url is missing. */
function zionbetPoliticsFlagEmoji(question: string): string | null {
  const q = question;
  if (/\b(US|U\.S\.|American|Republican|Democrat)\b/i.test(q)) return "🇺🇸";
  if (/\bBrazil\b/i.test(q)) return "🇧🇷";
  if (/\bSwitzerland\b/i.test(q)) return "🇨🇭";
  if (/\b(UK|Britain|British)\b/i.test(q)) return "🇬🇧";
  if (/\bFrance\b/i.test(q)) return "🇫🇷";
  return null;
}

function zionbetCardFallbackEmoji(market: ZionbetApiMarket, tab?: ZionbetBetTab): string {
  const cat = (market.category || "").toLowerCase();
  const effectiveCat =
    cat ||
    (tab && tab !== "civilization" ? tab : zionbetIsZionNativeMarket(market.id) ? "civilization" : "");

  if (effectiveCat === "politics" || tab === "politics") {
    return zionbetPoliticsFlagEmoji(market.question) ?? ZIONBET_CATEGORY_FALLBACK.politics;
  }
  if (tab === "civilization" || zionbetIsZionNativeMarket(market.id) || effectiveCat === "civilization") {
    return ZIONBET_CATEGORY_FALLBACK.civilization;
  }
  if (effectiveCat && ZIONBET_CATEGORY_FALLBACK[effectiveCat]) {
    return ZIONBET_CATEGORY_FALLBACK[effectiveCat];
  }
  if (tab && ZIONBET_CATEGORY_FALLBACK[tab]) {
    return ZIONBET_CATEGORY_FALLBACK[tab];
  }
  return "🌐";
}

function zionbetPoliticsEmoji(q: string): string {
  return zionbetPoliticsFlagEmoji(q) ?? ZIONBET_CATEGORY_FALLBACK.politics;
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
  if (tab === "geopolitics" || cat === "geopolitics") {
    return { emoji: "🌍", tint: zionbetEmojiTint("geopolitics") };
  }
  if (tab === "finance" || cat === "finance") {
    return { emoji: "💰", tint: zionbetEmojiTint("finance") };
  }
  if (tab === "tech" || cat === "tech") {
    return { emoji: "💻", tint: zionbetEmojiTint("tech") };
  }
  if (tab === "culture" || cat === "culture") {
    return { emoji: "🎭", tint: zionbetEmojiTint("culture") };
  }
  return { emoji: "🌐", tint: zionbetEmojiTint("geopolitics") };
}

const ZB_VISTA_YES = "#00d4aa";
const ZB_VISTA_NO = "#ff6b6b";
const ZB_POLY_BUY = "#00ff88";
const ZB_POLY_BUY_BG = "rgba(0,255,136,0.2)";
const ZB_POLY_SELL = "#ff4444";
const ZB_POLY_SELL_BG = "rgba(255,68,68,0.2)";
const ZB_VISTA_TEXT_SEC = "rgba(180, 220, 255, 0.7)";
const ZB_VISTA_LABEL = "rgba(150, 200, 255, 0.6)";
const ZB_VISTA_BG =
  "linear-gradient(135deg, #050d1a 0%, #0a1628 50%, #050d1a 100%)";
const ZB_VISTA_GLASS: CSSProperties = {
  background: "rgba(15, 50, 90, 0.35)",
  backdropFilter: "blur(25px)",
  WebkitBackdropFilter: "blur(25px)",
  border: "1px solid rgba(100, 180, 255, 0.2)",
  borderRadius: "16px",
  boxShadow:
    "0 8px 32px rgba(0,0,30,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
};

const ZB_DETAIL_BACKDROP: CSSProperties = {
  background: "rgba(0, 0, 5, 0.7)",
};

const ZB_DETAIL_MAIN_PANEL: CSSProperties = {
  background: "#0a0e1a",
  backdropFilter: "none",
  WebkitBackdropFilter: "none",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: "16px",
};

function zionbetDetailInnerPanel(extra?: CSSProperties): CSSProperties {
  return {
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.06)",
    borderRadius: "12px",
    padding: "20px",
    ...extra,
  };
}

function zionbetAeroPanel(extra?: CSSProperties): CSSProperties {
  return { ...ZB_VISTA_GLASS, padding: "20px", ...extra };
}

function zionbetCountdownMs(ms: number): string {
  if (ms <= 0) return "Ended";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function zionbetCleanMarketTitle(question?: string | null): string {
  if (!question?.trim()) return "";
  const cleaned = question.split(" — ")[0].trim();
  return cleaned || question.trim();
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
    source: poly ? ZION_POLY_RESOLUTION_SOURCE : "ZION Simulation",
    settlement: "Within 24h of event end date",
  };
}

function ZionBetMarketCardItem({
  marketApi,
  yes,
  imageUrl,
  iconEmoji,
  volumeLabel,
  endLabel,
  isZionCard,
  betTab,
  yesButtonLabel,
  noButtonLabel,
  onOpen,
  onBetYes,
  onBetNo,
}: {
  marketApi: ZionbetApiMarket;
  yes: number;
  imageUrl?: string | null;
  iconEmoji?: string;
  volumeLabel: string;
  endLabel: string;
  isZionCard: boolean;
  betTab?: ZionbetBetTab;
  yesButtonLabel?: string;
  noButtonLabel?: string;
  onOpen: () => void;
  onBetYes: (e: MouseEvent) => void;
  onBetNo: (e: MouseEvent) => void;
}) {
  const resolvedImageUrl = (imageUrl ?? marketApi.image_url)?.trim() || null;
  const showCryptoIcon = isDeepbookCryptoMarket(marketApi.id);
  const displayEmoji = iconEmoji ?? zionbetCardFallbackEmoji(marketApi, betTab);
  const cardShellClass = [
    "zionBetMarketCard",
    isZionCard ? "zionBetMarketCard--zion" : "",
    showCryptoIcon ? "zionBetMarketCard--deepbook" : "",
    glassCardStyles.glassCardLab,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <GlassCard
      className={cardShellClass}
      style={{
        padding: "14px 16px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        ...(isZionCard ? { borderLeft: "3px solid #16a34a" } : {}),
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen();
          }
        }}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
        }}
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
        {showCryptoIcon ? (
          <CryptoIcon marketId={marketApi.id} />
        ) : resolvedImageUrl ? (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              flexShrink: 0,
              backgroundImage: `url(${resolvedImageUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundColor: "#1e2d3d",
            }}
            aria-hidden
          />
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
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
            {displayEmoji}
          </div>
        )}
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
          {yesButtonLabel ?? `YES ${yes}¢`}
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
          {noButtonLabel ?? `NO ${100 - yes}¢`}
        </button>
      </div>
      </div>
    </GlassCard>
  );
}

type ZionBetPositionStats = {
  side: "YES" | "NO";
  amount: number;
  avgCents: number;
  currentCents: number;
  potentialPayout: number;
  potentialWin: number;
  marketValue: number;
  inProfit: boolean;
  profitIfYesWins: number;
  profitIfNoWins: number;
};

function zionbetComputePositionStats(
  position: ZionBetMyBetRow,
  yesCents: number,
  noCents: number
): ZionBetPositionStats {
  const amount = position.amount_sui;
  const side = position.direction === "YES" ? "YES" : "NO";
  const isYes = side === "YES";
  const avgCents = Math.max(
    1,
    Math.min(99, Math.round(Number(position.odds) || (isYes ? yesCents : noCents)))
  );
  const currentCents = isYes ? yesCents : noCents;
  const potentialPayout =
    position.potential_payout && position.potential_payout > 0
      ? position.potential_payout
      : amount * (100 / avgCents);
  const potentialWin = potentialPayout - amount;
  const marketValue = (amount * currentCents) / avgCents;
  return {
    side,
    amount,
    avgCents,
    currentCents,
    potentialPayout,
    potentialWin,
    marketValue,
    inProfit: marketValue >= amount,
    profitIfYesWins: isYes ? potentialWin : -amount,
    profitIfNoWins: isYes ? -amount : potentialWin,
  };
}

function zionbetFormatSuiDelta(n: number, currency = "SUI"): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)} ${currency}`;
}

function zionbetBetCurrency(bet: {
  currency?: string | null;
  amount_sui?: number | null;
}): "SUI" | "USDC" | null {
  const raw = bet.currency?.trim().toUpperCase();
  if (raw === "USDC") return "USDC";
  if (raw === "SUI") return "SUI";
  if (bet.currency == null || bet.currency === "") {
    if ((bet.amount_sui ?? 0) > 0) return "SUI";
    return null;
  }
  return null;
}

const ZIONBET_CURRENCY_LOGOS: Record<"SUI" | "USDC", string> = {
  SUI: "https://assets.coingecko.com/coins/images/26375/small/sui-ocean-square.png",
  USDC: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
};

type ZionBetBuyConfirm = {
  direction: boolean;
  amount: number;
  currency: "SUI" | "USDC";
  odds: number;
  payout: number;
};

type ZionBetSellConfirm = {
  direction: boolean;
  currency: "SUI" | "USDC";
  payout: number;
  digest: string;
};

function ZionBetBuyConfirmCard({
  bet,
  onClose,
}: {
  bet: ZionBetBuyConfirm;
  onClose: () => void;
}) {
  const shares = bet.odds > 0 ? (bet.amount / bet.odds) * 100 : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      style={{
        marginTop: "12px",
        width: "100%",
        boxSizing: "border-box",
        background: "rgba(0,20,40,0.95)",
        border: "1px solid rgba(0,255,136,0.4)",
        borderRadius: "16px",
        padding: "20px",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 0 30px rgba(0,255,136,0.2)",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          position: "absolute",
          top: "10px",
          right: "12px",
          background: "none",
          border: "none",
          color: "#666",
          cursor: "pointer",
          fontSize: "1.2rem",
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ color: "#00ff88", fontWeight: "bold", fontSize: "1.1rem", marginBottom: "12px" }}
      >
        ✅ Bet Placed!
      </motion.div>
      <div style={{ color: "white", fontSize: "0.9rem", lineHeight: 1.8 }}>
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}>
          Side:{" "}
          <span style={{ color: bet.direction ? "#00ff88" : "#ff4444", fontWeight: "bold" }}>
            {bet.direction ? "YES" : "NO"}
          </span>
        </motion.div>
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
          Amount:{" "}
          <strong>
            {bet.amount} {bet.currency}
          </strong>
        </motion.div>
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
          Price: <strong>{bet.odds}¢</strong>
        </motion.div>
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
          Shares: <strong>{shares.toFixed(2)}</strong>
        </motion.div>
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 }}>
          Potential win:{" "}
          <strong style={{ color: "#00ff88" }}>
            {bet.payout.toFixed(2)} {bet.currency}
          </strong>
        </motion.div>
      </div>
      <div style={{ marginTop: "12px", fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}>
        Auto-closes in 5s
      </div>
    </motion.div>
  );
}

function ZionBetSellConfirmCard({
  bet,
  onClose,
}: {
  bet: ZionBetSellConfirm;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      style={{
        marginTop: "12px",
        width: "100%",
        boxSizing: "border-box",
        background: "rgba(0,20,40,0.95)",
        border: "1px solid rgba(255,68,68,0.4)",
        borderRadius: "16px",
        padding: "20px",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 0 30px rgba(255,68,68,0.2)",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          position: "absolute",
          top: "10px",
          right: "12px",
          background: "none",
          border: "none",
          color: "#666",
          cursor: "pointer",
          fontSize: "1.2rem",
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        ×
      </button>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ color: "#ff6868", fontWeight: "bold", fontSize: "1.1rem", marginBottom: "12px" }}
      >
        ✅ Position Closed!
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        style={{ color: "white", fontSize: "0.9rem", lineHeight: 1.8 }}
      >
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}>
          Side:{" "}
          <span style={{ color: bet.direction ? "#00ff88" : "#ff4444", fontWeight: "bold" }}>
            {bet.direction ? "YES" : "NO"}
          </span>
        </motion.div>
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
          Returned:{" "}
          <strong style={{ color: "#ff8888" }}>
            ~{bet.payout.toFixed(2)} {bet.currency}
          </strong>{" "}
          (99.9% of stake)
        </motion.div>
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
          Tx: <strong>{bet.digest ? `${bet.digest.slice(0, 8)}…` : "—"}</strong>
        </motion.div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        style={{ marginTop: "12px", fontSize: "0.75rem", color: "rgba(255,255,255,0.4)" }}
      >
        Auto-closes in 5s
      </motion.div>
    </motion.div>
  );
}

function ZionBetMarketDetailOverlay({
  apiMarket,
  walletConnected,
  walletAddress,
  walletBalanceSui,
  walletBalanceUsdc,
  myBets,
  betAmount,
  setBetAmount,
  betCurrency,
  setBetCurrency,
  betLoading,
  onPlaceBet,
  onClose,
  signAndExecute,
  onPositionClosed,
  injectedBuyConfirm,
  onInjectedBuyConfirmConsumed,
  mode = "modal",
  onShareLinkCopied,
}: {
  apiMarket: ZionbetApiMarket;
  walletConnected: boolean;
  walletAddress: string;
  walletBalanceSui: number;
  walletBalanceUsdc: number;
  myBets: ZionBetMyBetRow[];
  betAmount: string;
  setBetAmount: (v: string) => void;
  betCurrency: "SUI" | "USDC";
  setBetCurrency: (c: "SUI" | "USDC") => void;
  betLoading: boolean;
  onPlaceBet: (
    market: ZionBetMarket,
    direction: boolean,
    amount: number
  ) => Promise<ZionBetBuyConfirm | null> | void;
  onClose: () => void;
  signAndExecute?: SignAndExecuteMutateFn;
  onPositionClosed?: (payload: ZionBetToastPayload) => void;
  injectedBuyConfirm?: ZionBetBuyConfirm | null;
  onInjectedBuyConfirmConsumed?: () => void;
  mode?: "modal" | "page";
  onShareLinkCopied?: () => void;
}) {
  const isPageMode = mode === "page";
  const [buyConfirm, setBuyConfirm] = useState<ZionBetBuyConfirm | null>(null);
  const [sellConfirm, setSellConfirm] = useState<ZionBetSellConfirm | null>(null);

  useEffect(() => {
    if (!buyConfirm) return;
    const t = window.setTimeout(() => setBuyConfirm(null), 5000);
    return () => window.clearTimeout(t);
  }, [buyConfirm]);

  useEffect(() => {
    if (!sellConfirm) return;
    const t = window.setTimeout(() => setSellConfirm(null), 5000);
    return () => window.clearTimeout(t);
  }, [sellConfirm]);

  useEffect(() => {
    if (!injectedBuyConfirm) return;
    setBuyConfirm(injectedBuyConfirm);
    onInjectedBuyConfirmConsumed?.();
  }, [injectedBuyConfirm, onInjectedBuyConfirmConsumed]);
  const [detailApiMarket, setDetailApiMarket] = useState(apiMarket);
  const market = useMemo(() => zionbetApiToMarket(detailApiMarket), [detailApiMarket]);
  const cleanTitle = zionbetCleanMarketTitle(detailApiMarket.question);

  useEffect(() => {
    setDetailApiMarket(apiMarket);
  }, [apiMarket.id]);

  useEffect(() => {
    void resolveMarketIdU64(apiMarket.id);
    void ensureZionBetMarketOnChain(apiMarket.id, apiMarket.timeframe);
  }, [apiMarket.id, apiMarket.timeframe]);

  useEffect(() => {
    if (!apiMarket.id.startsWith("poly-")) return;
    let cancelled = false;
    fetch(`/api/zionbet/market/${encodeURIComponent(apiMarket.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((row: Record<string, unknown> | { error?: string } | null) => {
        if (cancelled || !row || typeof row !== "object" || "error" in row) return;
        const fresh = zionbetPolyRowToApiMarket(row);
        setDetailApiMarket((prev) =>
          prev.id === fresh.id
            ? {
                ...prev,
                ...fresh,
                description: fresh.description ?? prev.description,
                resolution_criteria: fresh.resolution_criteria ?? prev.resolution_criteria,
                resolution_source: fresh.resolution_source ?? prev.resolution_source,
                created_at: fresh.created_at ?? prev.created_at,
              }
            : fresh
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiMarket.id]);
  const { yes, no } = zionBetDisplayOdds(market);
  const [betDirection, setBetDirection] = useState(true);
  const [panelSide, setPanelSide] = useState<"buy" | "sell">("buy");
  const [betInputMode, setBetInputMode] = useState<"amount" | "shares">("shares");
  const [betShares, setBetShares] = useState("1");
  const [sellSharesInput, setSellSharesInput] = useState("0");
  const [sellClosing, setSellClosing] = useState(false);
  const [countdown, setCountdown] = useState("—");
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const currencyMenuRef = useRef<HTMLDivElement>(null);
  const odds = zionBetDisplayOdds(market);
  const volumeLabel = zionbetMarketVolumeLabel(
    detailApiMarket.volume,
    detailApiMarket.id,
    detailApiMarket.volume_sui
  );
  const volumeStatsLabel = zionbetIsPolyMarket(detailApiMarket.id)
    ? zionbetPolyDollarVolumeLabel(detailApiMarket.volume).replace(" Volume", "")
    : (() => {
        const volumeSui = zionbetVolumeSuiAmount(detailApiMarket.volume, detailApiMarket.id);
        if (volumeSui >= 1_000_000) return `${(volumeSui / 1_000_000).toFixed(1)}M`;
        if (volumeSui >= 1_000) return `${(volumeSui / 1_000).toFixed(1)}K`;
        return volumeSui.toLocaleString();
      })();
  const endLabel = zionbetEndDateLabel(detailApiMarket.end_date, detailApiMarket.timeframe);
  const categoryLabel =
    detailApiMarket.category?.replace(/_/g, " ").toUpperCase() ||
    (zionbetIsPolyMarket(detailApiMarket.id) ? "MARKET" : "CIVILIZATION");
  const createdBy = "ZION Bet";
  const resolutionSource = zionbetDisplayResolutionSource(detailApiMarket);
  const chartData = useMemo(
    () => buildYesPriceChartData(market, myBets, yes),
    [market, myBets, yes]
  );
  const userPosition = useMemo(
    () =>
      myBets.find((b) => {
        const s = (b.status ?? "active").toLowerCase();
        const isOpen = s === "active" || s === "pending";
        return (
          isOpen &&
          (b.market_id === detailApiMarket.id || b.question === detailApiMarket.question)
        );
      }),
    [myBets, detailApiMarket]
  );

  const positionStats = useMemo(
    () => (userPosition ? zionbetComputePositionStats(userPosition, yes, no) : null),
    [userPosition, yes, no]
  );

  useEffect(() => {
    const tick = () => {
      if (!detailApiMarket.end_date) {
        setCountdown(endLabel.replace(/^Ends /, "") || "—");
        return;
      }
      const ms = new Date(detailApiMarket.end_date).getTime() - Date.now();
      setCountdown(zionbetCountdownMs(ms));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [detailApiMarket.end_date, endLabel]);

  useEffect(() => {
    if (!currencyMenuOpen) return;
    const onDocClick = (e: Event) => {
      if (currencyMenuRef.current && !currencyMenuRef.current.contains(e.target as Node)) {
        setCurrencyMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [currencyMenuOpen]);

  const amt = parseFloat(betAmount || "0");
  const oddsCents = betDirection ? odds.yes : odds.no;
  const effectiveOddsCents = oddsCents;
  const sharesFromAmount = effectiveOddsCents > 0 ? zionbetSharesFromStake(amt, effectiveOddsCents) : 0;
  const sharesNum = betInputMode === "shares" ? parseFloat(betShares || "0") || 0 : sharesFromAmount;
  const effectiveAmt =
    betInputMode === "shares"
      ? zionbetStakeFromShares(sharesNum, effectiveOddsCents)
      : amt;
  const payout = effectiveOddsCents > 0 ? effectiveAmt * (100 / effectiveOddsCents) : 0;
  const winSide = betDirection ? "YES" : "NO";
  const currencyLogo = ZIONBET_CURRENCY_LOGOS[betCurrency];
  const positionCurrency = userPosition ? zionbetBetCurrency(userPosition) ?? "SUI" : "SUI";
  const posIsYes = userPosition?.direction === "YES";
  const posAvgCents = userPosition
    ? zionbetBetAvgCents(userPosition, yes, no)
    : 0;
  const posTotalShares = userPosition
    ? zionbetSharesFromStake(userPosition.amount_sui, posAvgCents)
    : 0;
  const sellSharesNum = Math.max(
    0,
    Math.min(posTotalShares, parseFloat(sellSharesInput) || 0)
  );
  const sellReceiveEstimate = userPosition
    ? zionbetEarlyCloseReturnSui(userPosition.amount_sui) *
      (posTotalShares > 0 ? sellSharesNum / posTotalShares : 0)
    : 0;
  const sellFullReceive = userPosition
    ? zionbetEarlyCloseReturnSui(userPosition.amount_sui)
    : 0;

  useEffect(() => {
    if (posTotalShares > 0) {
      setSellSharesInput(String(Math.round(posTotalShares * 100) / 100));
    }
  }, [userPosition?.id, posTotalShares]);

  useEffect(() => {
    if (betInputMode !== "shares" || effectiveOddsCents <= 0) return;
    const stake = zionbetStakeFromShares(parseFloat(betShares || "0") || 0, effectiveOddsCents);
    if (stake > 0) {
      setBetAmount(String(Math.round(stake * 100) / 100));
    }
  }, [betInputMode, betShares, effectiveOddsCents, setBetAmount]);

  const buySellTabStyle = (active: boolean, side: "buy" | "sell"): CSSProperties => ({
    flex: 1,
    height: "40px",
    borderRadius: "10px",
    border:
      side === "buy"
        ? active
          ? `2px solid ${ZB_POLY_BUY}`
          : "1px solid rgba(255, 255, 255, 0.15)"
        : active
          ? `2px solid ${ZB_POLY_SELL}`
          : "1px solid rgba(255, 255, 255, 0.15)",
    background:
      side === "buy"
        ? active
          ? ZB_POLY_BUY_BG
          : "rgba(10, 30, 60, 0.4)"
        : active
          ? ZB_POLY_SELL_BG
          : "rgba(10, 30, 60, 0.4)",
    color: active ? "#ffffff" : ZB_VISTA_TEXT_SEC,
    fontSize: "14px",
    fontWeight: 700,
    cursor: "pointer",
  });

  const addQuickAmount = (n: number) => {
    if (betInputMode === "shares") {
      const cur = parseFloat(betShares || "0") || 0;
      setBetShares(String(Math.round((cur + n) * 100) / 100));
      return;
    }
    const cur = parseFloat(betAmount || "0") || 0;
    setBetAmount(String(Math.round((cur + n) * 100) / 100));
  };

  const inputTabStyle = (active: boolean): CSSProperties => ({
    flex: 1,
    height: "32px",
    borderRadius: "8px",
    border: active ? `1px solid ${ZB_POLY_BUY}` : "1px solid rgba(255, 255, 255, 0.15)",
    background: active ? ZB_POLY_BUY_BG : "rgba(255, 255, 255, 0.04)",
    color: active ? "#ffffff" : ZB_VISTA_TEXT_SEC,
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  });

  const setSellSharesPct = (pct: number) => {
    if (posTotalShares <= 0) return;
    const n = Math.round(posTotalShares * pct * 100) / 100;
    setSellSharesInput(String(n));
  };

  const runSellOrder = async () => {
    console.log("[SELL] A: runSellOrder called");
    if (sellClosing) return;
    console.log("[SELL] B: position found:", userPosition);
    if (!userPosition) {
      if (onPositionClosed) {
        onPositionClosed("You don't have a position in this market");
      }
      return;
    }
    if (userPosition.on_chain_bet_id == null || userPosition.on_chain_bet_id === undefined) {
      const msg = "Cannot sell - on-chain ID not confirmed. Please refresh.";
      if (onPositionClosed) {
        onPositionClosed(msg);
      }
      return;
    }
    if (!signAndExecute) {
      if (onPositionClosed) {
        onPositionClosed("Connect wallet to sell");
      }
      return;
    }
    if (!walletAddress?.trim()) {
      if (onPositionClosed) {
        onPositionClosed("Connect wallet to sell");
      }
      return;
    }
    const positionForClose: ZionBetMyBetRow = {
      ...userPosition,
      market_id: userPosition.market_id?.trim() || market.id,
      currency: userPosition.currency || "SUI",
    };
    setSellClosing(true);
    try {
      console.log("[SELL] C: calling zionbetExecuteClosePosition");
      await zionbetExecuteClosePosition(positionForClose, walletAddress, signAndExecute, {
        onSuccess: (message, type, meta) => {
          const result = { message, type, meta };
          console.log("[SELL] D: result:", result);
          if (onPositionClosed) {
            onPositionClosed({ message, type });
          }
          setSellConfirm({
            direction: userPosition.direction === "YES",
            currency: positionCurrency,
            payout: zionbetEarlyCloseReturnSui(userPosition.amount_sui),
            digest: meta?.digest ?? "",
          });
          setPanelSide("buy");
        },
        onError: (message) => {
          console.log("[SELL] D: result:", { error: message });
          if (onPositionClosed) {
            onPositionClosed(message);
          }
        },
      });
    } finally {
      setSellClosing(false);
    }
  };

  const aeroSectionTitle: CSSProperties = {
    margin: "0 0 14px",
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: ZB_VISTA_LABEL,
  };

  const outcomeBtn = (
    selected: boolean,
    side: "yes" | "no",
    mode: "buy" | "sell" = "buy"
  ): CSSProperties => {
    const sellHeld = mode === "sell" && userPosition && (side === "yes" ? posIsYes : !posIsYes);
    if (side === "yes") {
      return {
        flex: 1,
        height: "52px",
        borderRadius: "12px",
        fontSize: "15px",
        fontWeight: 700,
        cursor: mode === "sell" && !userPosition ? "default" : "pointer",
        transition: "box-shadow 0.2s, background 0.2s, border-color 0.2s",
        border:
          mode === "sell"
            ? sellHeld
              ? `2px solid ${ZB_POLY_SELL}`
              : `1px solid rgba(255, 255, 255, 0.15)`
            : selected
              ? `2px solid ${ZB_POLY_BUY}`
              : "1px solid rgba(255, 255, 255, 0.15)",
        background:
          mode === "sell"
            ? sellHeld
              ? ZB_POLY_SELL_BG
              : "rgba(0,255,136,0.08)"
            : selected
              ? ZB_POLY_BUY_BG
              : "rgba(0,255,136,0.08)",
        color: ZB_POLY_BUY,
        boxShadow: selected && mode === "buy" ? `0 0 16px ${ZB_POLY_BUY_BG}` : "none",
        opacity: mode === "sell" && userPosition && !sellHeld ? 0.45 : 1,
      };
    }
    return {
      flex: 1,
      height: "52px",
      borderRadius: "12px",
      fontSize: "15px",
      fontWeight: 700,
      cursor: mode === "sell" && !userPosition ? "default" : "pointer",
      transition: "box-shadow 0.2s, background 0.2s, border-color 0.2s",
      border:
        mode === "sell"
          ? sellHeld
            ? `2px solid ${ZB_POLY_SELL}`
            : "1px solid rgba(255, 255, 255, 0.15)"
          : selected
            ? `2px solid ${ZB_POLY_SELL}`
            : "1px solid rgba(255, 255, 255, 0.15)",
      background:
        mode === "sell"
          ? sellHeld
            ? ZB_POLY_SELL_BG
            : "rgba(255,68,68,0.08)"
          : selected
            ? ZB_POLY_SELL_BG
            : "rgba(255,68,68,0.08)",
      color: ZB_POLY_SELL,
      boxShadow: selected && mode === "buy" ? `0 0 16px ${ZB_POLY_SELL_BG}` : "none",
      opacity: mode === "sell" && userPosition && !sellHeld ? 0.45 : 1,
    };
  };

  const quickBtn: CSSProperties = {
    flex: 1,
    padding: "8px 0",
    borderRadius: "8px",
    border: `1px solid rgba(0,255,136,0.25)`,
    background: "rgba(0,255,136,0.06)",
    color: ZB_POLY_BUY,
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.15s",
  };

  const sellQuickBtn: CSSProperties = {
    flex: 1,
    padding: "8px 0",
    borderRadius: "8px",
    border: `1px solid rgba(255,68,68,0.35)`,
    background: ZB_POLY_SELL_BG,
    color: ZB_POLY_SELL,
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.15s",
  };

  return (
    <div
      role={isPageMode ? undefined : "dialog"}
      aria-modal={isPageMode ? undefined : true}
      aria-label={cleanTitle}
      className="zbMarketDetailOverlay"
      style={{
        ...(isPageMode
          ? {
              position: "relative",
              minHeight: "calc(100vh - 48px)",
              padding: "16px",
            }
          : {
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              overflowY: "auto",
              padding: "16px",
              ...ZB_DETAIL_BACKDROP,
            }),
        fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1120px",
          margin: "0 auto",
          padding: 0,
          overflow: "hidden",
          ...ZB_DETAIL_MAIN_PANEL,
        }}
      >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10001,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          padding: "14px 20px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            cursor: "pointer",
            color: "#ffffff",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.15)",
            padding: "6px 14px",
            borderRadius: "8px",
            transition: "background 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.12)";
            e.currentTarget.style.borderColor = "rgba(100, 180, 255, 0.35)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
          }}
        >
          {isPageMode ? "← BACK TO MARKETS" : "← Back"}
        </button>
        {isPageMode ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(window.location.href).then(() => {
                onShareLinkCopied?.();
              });
            }}
            style={{
              cursor: "pointer",
              color: "#ffffff",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.15)",
              padding: "6px 14px",
              borderRadius: "8px",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.12)";
              e.currentTarget.style.borderColor = "rgba(100, 180, 255, 0.35)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
            }}
          >
            🔗 SHARE
          </button>
        ) : null}
      </div>

      <div
        style={{
          maxWidth: "1120px",
          margin: "0 auto",
          padding: "8px 20px 48px",
        }}
      >
        {/* 1. Header */}
        <header style={{ marginBottom: "20px" }}>
          <span
            style={{
              display: "inline-block",
              padding: "5px 12px",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              marginBottom: "14px",
              borderRadius: "999px",
              background: "rgba(0, 120, 255, 0.3)",
              border: "1px solid rgba(100, 180, 255, 0.4)",
              color: "rgba(150, 210, 255, 1)",
            }}
          >
            {categoryLabel}
          </span>
          <h1
            style={{
              margin: "0 0 14px",
              fontSize: "1.4rem",
              fontWeight: 600,
              lineHeight: 1.35,
              color: "#ffffff",
            }}
          >
            {cleanTitle}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: ZB_VISTA_TEXT_SEC,
              display: "flex",
              flexWrap: "wrap",
              gap: "6px 16px",
              alignItems: "center",
            }}
          >
            <span>{volumeLabel}</span>
            <span style={{ opacity: 0.4, color: "rgba(100,180,255,0.5)" }}>·</span>
            <span>{endLabel}</span>
            <span style={{ opacity: 0.4, color: "rgba(100,180,255,0.5)" }}>·</span>
            <span>Created by {createdBy}</span>
          </p>
        </header>

        <div className="zbMarketDetailGrid">
          <div className="zbMarketDetailMain">
            {/* 2. Probability bar */}
            <section style={{ ...zionbetDetailInnerPanel(), marginBottom: "16px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: "14px",
                }}
              >
                <span style={{ fontSize: "1.75rem", fontWeight: 700, color: ZB_VISTA_YES }}>
                  YES {yes}%
                </span>
                <span style={{ fontSize: "1.75rem", fontWeight: 700, color: ZB_VISTA_NO }}>
                  NO {no}%
                </span>
              </div>
              <div style={{ position: "relative", height: "10px", borderRadius: "5px", overflow: "visible" }}>
                <div
                  style={{
                    height: "100%",
                    borderRadius: "5px",
                    background: `linear-gradient(90deg, ${ZB_VISTA_YES} 0%, ${ZB_VISTA_YES} ${yes}%, ${ZB_VISTA_NO} ${yes}%, ${ZB_VISTA_NO} 100%)`,
                    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.25)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: `${Math.max(2, Math.min(98, yes))}%`,
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    background: "#ffffff",
                    boxShadow:
                      "0 0 14px rgba(100,180,255,0.9), 0 0 6px rgba(255,255,255,0.8), 0 2px 8px rgba(0,40,80,0.5)",
                    border: "2px solid rgba(150,200,255,0.6)",
                    transition: "left 0.35s ease",
                  }}
                />
              </div>
            </section>

            {/* 3. Price history chart */}
            <section style={{ ...zionbetDetailInnerPanel(), marginBottom: "16px" }}>
              <h2 style={aeroSectionTitle}>PRICE HISTORY</h2>
              <div
                style={{
                  ...zionbetDetailInnerPanel(),
                  height: 220,
                  width: "100%",
                  padding: "8px 4px 4px",
                  boxSizing: "border-box",
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="zbYesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ZB_VISTA_YES} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={ZB_VISTA_YES} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="rgba(100, 180, 255, 0.1)"
                      strokeDasharray="3 3"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: ZB_VISTA_LABEL, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: ZB_VISTA_LABEL, fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                      width={36}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(10, 14, 26, 0.92)",
                        border: "1px solid rgba(100, 180, 255, 0.25)",
                        borderRadius: "12px",
                        fontSize: 12,
                        color: "#fff",
                      }}
                      labelStyle={{ color: ZB_VISTA_TEXT_SEC }}
                      formatter={(val: unknown) => [
                        `${typeof val === "number" ? val : "—"}%`,
                        "YES probability",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="yes"
                      stroke={ZB_VISTA_YES}
                      strokeWidth={2}
                      fill="url(#zbYesFill)"
                      dot={false}
                      activeDot={{ r: 4, fill: ZB_VISTA_YES, stroke: "#0a1628", strokeWidth: 1 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* 5. Market stats (main column on mobile follows chart; desktop stats also in sidebar duplicate removed - only here) */}
            <section style={{ ...zionbetDetailInnerPanel(), marginBottom: "16px" }}>
              <h2 style={aeroSectionTitle}>MARKET STATS</h2>
              <div style={{ display: "grid", gap: 0 }}>
                {[
                  ["Total volume", `${volumeStatsLabel} ${zionbetIsPolyMarket(detailApiMarket.id) ? "USD" : "SUI"}`, "#ffffff"],
                  ["YES holders", `${yes}%`, ZB_VISTA_YES],
                  ["NO holders", `${no}%`, ZB_VISTA_NO],
                  ["Resolution source", resolutionSource, "#ffffff"],
                  ["Time remaining", countdown, "#ffffff"],
                ].map(([label, value, color], idx, arr) => (
                  <div
                    key={String(label)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "13px",
                      padding: "12px 0",
                      borderBottom:
                        idx < arr.length - 1
                          ? "1px solid rgba(100, 180, 255, 0.08)"
                          : "none",
                    }}
                  >
                    <span style={{ color: ZB_VISTA_LABEL }}>{label}</span>
                    <span style={{ color: color as string, fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>
            </section>

            <ZionBetResolutionRulesCard
              market={detailApiMarket}
              sectionTitleStyle={aeroSectionTitle}
              useDetailInnerPanel
            />
          </div>

          {/* 4. Bet panel */}
          <aside className="zbMarketDetailSidebar">
            <section
              style={{
                ...zionbetDetailInnerPanel(),
                position: "sticky",
                top: "72px",
                borderLeft: panelSide === "buy" ? "3px solid rgba(0,255,136,0.45)" : "3px solid rgba(255,68,68,0.45)",
              }}
            >
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <button
                  type="button"
                  onClick={() => setPanelSide("buy")}
                  style={buySellTabStyle(panelSide === "buy", "buy")}
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => setPanelSide("sell")}
                  style={buySellTabStyle(panelSide === "sell", "sell")}
                >
                  Sell
                </button>
              </div>

              {panelSide === "buy" ? (
                <>
                  <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                    <button
                      type="button"
                      onClick={() => setBetDirection(true)}
                      style={outcomeBtn(betDirection, "yes", "buy")}
                    >
                      YES {odds.yes}¢
                    </button>
                    <button
                      type="button"
                      onClick={() => setBetDirection(false)}
                      style={outcomeBtn(!betDirection, "no", "buy")}
                    >
                      NO {odds.no}¢
                    </button>
                  </div>
                  <div ref={currencyMenuRef} style={{ marginBottom: "12px", position: "relative" }}>
                <div style={{ ...zionbetDetailInnerPanel(), padding: 0 }}>
                <button
                  type="button"
                  onClick={() => setCurrencyMenuOpen((open) => !open)}
                  style={{
                    width: "100%",
                    height: "40px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    padding: "0 12px",
                    borderRadius: "10px",
                    border: "none",
                    background: "transparent",
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <img
                      src={currencyLogo}
                      alt={betCurrency}
                      width={20}
                      height={20}
                      style={{ borderRadius: "50%", objectFit: "cover" }}
                    />
                    {betCurrency}
                  </span>
                  <span style={{ color: ZB_VISTA_TEXT_SEC, fontSize: "11px" }}>▼</span>
                </button>
                </div>
                {currencyMenuOpen ? (
                  <div
                    style={{
                      ...zionbetDetailInnerPanel(),
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      right: 0,
                      zIndex: 10002,
                      padding: 0,
                      overflow: "hidden",
                    }}
                  >
                    {(["SUI", "USDC"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setBetCurrency(c);
                          setCurrencyMenuOpen(false);
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "10px 12px",
                          border: "none",
                          borderBottom:
                            c === "SUI" ? "1px solid rgba(100, 180, 255, 0.12)" : "none",
                          background:
                            betCurrency === c ? "rgba(0, 100, 200, 0.25)" : "transparent",
                          color: "#ffffff",
                          fontSize: "13px",
                          fontWeight: 600,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <img
                          src={ZIONBET_CURRENCY_LOGOS[c]}
                          alt={c}
                          width={20}
                          height={20}
                          style={{ borderRadius: "50%", objectFit: "cover" }}
                        />
                        {c}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {betCurrency === "USDC" ? (
                <p
                  style={{
                    margin: "0 0 12px",
                    fontSize: "12px",
                    color: ZB_VISTA_TEXT_SEC,
                    lineHeight: 1.45,
                  }}
                >
                  {effectiveAmt > 0
                    ? `Betting ${effectiveAmt.toFixed(2)} USDC (~$${effectiveAmt.toFixed(2)} USD)`
                    : "USDC — $1.0000 · USD Coin on Sui"}
                </p>
              ) : null}
              <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setBetInputMode("amount");
                    if (effectiveOddsCents > 0 && sharesNum > 0) {
                      setBetAmount(String(Math.round(zionbetStakeFromShares(sharesNum, effectiveOddsCents) * 100) / 100));
                    }
                  }}
                  style={inputTabStyle(betInputMode === "amount")}
                >
                  Amount
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBetInputMode("shares");
                    if (effectiveOddsCents > 0 && amt > 0) {
                      setBetShares(String(Math.round(sharesFromAmount * 100) / 100));
                    }
                  }}
                  style={inputTabStyle(betInputMode === "shares")}
                >
                  Shares
                </button>
              </div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  color: ZB_VISTA_LABEL,
                  marginBottom: "8px",
                }}
              >
                {betInputMode === "amount" ? `Amount (${betCurrency})` : "Shares"}
              </label>
              <div style={{ position: "relative", marginBottom: "10px" }}>
                <input
                  type="number"
                  step={betInputMode === "amount" ? "0.01" : "1"}
                  min={betInputMode === "amount" ? "0.01" : "1"}
                  value={betInputMode === "amount" ? betAmount : betShares}
                  onChange={(e) => {
                    if (betInputMode === "amount") {
                      setBetAmount(e.target.value);
                    } else {
                      setBetShares(e.target.value);
                    }
                  }}
                  style={{
                    width: "100%",
                    height: "44px",
                    boxSizing: "border-box",
                    padding: betInputMode === "amount" ? "0 40px 0 14px" : "0 14px",
                    borderRadius: "10px",
                    border: "1px solid rgba(100, 180, 255, 0.3)",
                    background: "rgba(10, 30, 60, 0.6)",
                    color: "#ffffff",
                    fontSize: "15px",
                    outline: "none",
                  }}
                />
                {betInputMode === "amount" ? (
                  <img
                    src={currencyLogo}
                    alt={betCurrency}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      objectFit: "cover",
                    }}
                  />
                ) : null}
              </div>
              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                {[1, 5, 10, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => addQuickAmount(n)}
                    style={quickBtn}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(0,255,136,0.18)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(0,255,136,0.06)";
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
                  marginBottom: "8px",
                  fontSize: "13px",
                }}
              >
                <span style={{ color: ZB_VISTA_LABEL }}>Total cost</span>
                <span style={{ color: ZB_POLY_BUY, fontWeight: 700 }}>
                  {effectiveAmt > 0 ? effectiveAmt.toFixed(2) : "0.00"} {betCurrency}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "16px",
                  fontSize: "13px",
                }}
              >
                <span style={{ color: ZB_VISTA_LABEL }}>Potential payout</span>
                <span style={{ color: ZB_POLY_BUY, fontWeight: 700 }}>
                  {payout > 0 ? payout.toFixed(2) : "0.00"} {betCurrency}
                </span>
              </div>
              <button
                type="button"
                disabled={betLoading || !walletConnected || !signAndExecute || effectiveAmt < 0.01}
                onClick={() => {
                  void Promise.resolve(onPlaceBet(market, betDirection, effectiveAmt)).then(
                    (result) => {
                      if (result) setBuyConfirm(result);
                    }
                  );
                }}
                style={{
                  width: "100%",
                  height: "48px",
                  borderRadius: "12px",
                  background: `linear-gradient(135deg, ${ZB_POLY_BUY}, #00aa66)`,
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "#042a1f",
                  fontSize: "1rem",
                  fontWeight: 700,
                  cursor: betLoading || !walletConnected ? "not-allowed" : "pointer",
                  opacity: betLoading || !walletConnected ? 0.45 : 1,
                  boxShadow: "0 4px 20px rgba(0,255,136,0.35)",
                }}
              >
                {betLoading ? "Placing…" : `Buy ${betDirection ? "YES" : "NO"}`}
              </button>
              <AnimatePresence>
                {buyConfirm ? (
                  <ZionBetBuyConfirmCard
                    key="buy-confirm"
                    bet={buyConfirm}
                    onClose={() => setBuyConfirm(null)}
                  />
                ) : null}
              </AnimatePresence>
                </>
              ) : !userPosition ? (
                <section style={{ ...zionbetDetailInnerPanel(), padding: "32px 16px", textAlign: "center", opacity: 0.85 }}>
                  <p style={{ margin: 0, color: ZB_VISTA_TEXT_SEC, fontSize: "14px", lineHeight: 1.5 }}>
                    You don&apos;t have a position in this market
                  </p>
                </section>
              ) : (
                <>
                  <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
                    <button type="button" disabled style={outcomeBtn(posIsYes, "yes", "sell")}>
                      YES {odds.yes}¢
                      {posIsYes ? " · Your side" : ""}
                    </button>
                    <button type="button" disabled style={outcomeBtn(!posIsYes, "no", "sell")}>
                      NO {odds.no}¢
                      {!posIsYes ? " · Your side" : ""}
                    </button>
                  </div>
                  <p style={{ margin: "0 0 12px", fontSize: "12px", color: ZB_VISTA_TEXT_SEC }}>
                    You own {posTotalShares.toFixed(2)} shares · avg {posAvgCents}¢ ·{" "}
                    {positionStats?.side ?? (posIsYes ? "YES" : "NO")}
                  </p>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      color: ZB_VISTA_LABEL,
                      marginBottom: "8px",
                    }}
                  >
                    Shares to sell
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={posTotalShares}
                    value={sellSharesInput}
                    onChange={(e) => setSellSharesInput(e.target.value)}
                    style={{
                      width: "100%",
                      height: "44px",
                      boxSizing: "border-box",
                      padding: "0 14px",
                      borderRadius: "10px",
                      border: `1px solid rgba(255,68,68,0.4)`,
                      background: "rgba(10, 30, 60, 0.6)",
                      color: "#ffffff",
                      fontSize: "15px",
                      outline: "none",
                      marginBottom: "10px",
                    }}
                  />
                  <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                    {(
                      [
                        ["25%", 0.25],
                        ["50%", 0.5],
                        ["75%", 0.75],
                        ["Max", 1],
                      ] as const
                    ).map(([label, pct]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setSellSharesPct(pct)}
                        style={sellQuickBtn}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(255,68,68,0.35)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = ZB_POLY_SELL_BG;
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                      fontSize: "13px",
                    }}
                  >
                    <span style={{ color: ZB_VISTA_LABEL }}>You receive</span>
                    <span style={{ color: ZB_POLY_SELL, fontWeight: 700 }}>
                      ~
                      {(sellSharesNum >= posTotalShares * 0.99
                        ? sellFullReceive
                        : sellReceiveEstimate
                      ).toFixed(2)}{" "}
                      {positionCurrency} (99.9% of stake)
                    </span>
                  </div>
                  <p
                    style={{
                      margin: "0 0 14px",
                      fontSize: "11px",
                      color: ZB_VISTA_TEXT_SEC,
                      lineHeight: 1.45,
                    }}
                  >
                    On-chain exit closes your full position.
                  </p>
                  <button
                    type="button"
                    disabled={
                      sellClosing ||
                      !walletConnected ||
                      !signAndExecute ||
                      sellSharesNum <= 0 ||
                      userPosition.on_chain_bet_id == null ||
                      userPosition.on_chain_bet_id === undefined
                    }
                    onClick={() => void runSellOrder()}
                    style={{
                      width: "100%",
                      height: "48px",
                      borderRadius: "12px",
                      background: `linear-gradient(135deg, ${ZB_POLY_SELL}, #cc2222)`,
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      color: "#ffffff",
                      fontSize: "1rem",
                      fontWeight: 700,
                      cursor:
                        sellClosing || !walletConnected ? "not-allowed" : "pointer",
                      opacity: sellClosing || !walletConnected ? 0.45 : 1,
                      boxShadow: "0 4px 20px rgba(255,68,68,0.35)",
                    }}
                  >
                    {sellClosing ? "Selling…" : "Place sell order"}
                  </button>
                  <AnimatePresence>
                    {sellConfirm ? (
                      <ZionBetSellConfirmCard
                        key="sell-confirm"
                        bet={sellConfirm}
                        onClose={() => setSellConfirm(null)}
                      />
                    ) : null}
                  </AnimatePresence>
                </>
              )}
              <p
                style={{
                  margin: "14px 0 0",
                  textAlign: "center",
                  fontSize: "12px",
                  color: ZB_VISTA_TEXT_SEC,
                }}
              >
                {walletConnected
                  ? `Wallet: ${walletBalanceSui.toFixed(2)} SUI · ${walletBalanceUsdc.toFixed(2)} USDC`
                  : "Connect wallet to trade"}
              </p>
            </section>
          </aside>
        </div>
      </div>
      </div>

      <style>{`
        .zbMarketDetailGrid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
          align-items: start;
        }
        @media (min-width: 900px) {
          .zbMarketDetailGrid {
            grid-template-columns: 1fr 340px;
            gap: 24px;
          }
          .zbMarketDetailMain {
            min-width: 0;
          }
        }
      `}</style>

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

/** Crypto tab only — DeepBook binary timeframes + Daily for Polymarket. */
const ZIONBET_CRYPTO_TIMEFRAME_SIDEBAR: { icon: string; label: string; tf: string }[] = [
  { icon: "⬛", label: "All", tf: "all" },
  { icon: "⏱️", label: "15 min", tf: "15m" },
  { icon: "🕐", label: "1 hour", tf: "1h" },
  { icon: "📅", label: "Daily", tf: "24h" },
];

const ZIONBET_CRYPTO_DEEPBOOK_IDS: Record<string, string[]> = {
  "15m": ["btc_15m"],
  "1h": ["btc_1h", "eth_1h", "sui_1h"],
  "24h": ["sui_24h"],
};

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
  created_at?: string | null;
  resolves_at?: string | null;
  end_date?: string | null;
  current_yes_price?: number | null;
  current_no_price?: number | null;
  on_chain_bet_id?: number | null;
  on_chain_market_id?: number | null;
  currency?: string | null;
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
  wallet_address?: string;
  points?: number;
  messages?: number;
  messages_sent?: number;
  zion_spent?: number;
  zionbet_pnl?: number;
};

const ZION_AVATARS = [
  { id: "warrior", color: "#ff6b35", icon: "⚔️" },
  { id: "dragon", color: "#7c3aed", icon: "🐲" },
  { id: "fox", color: "#f59e0b", icon: "🦊" },
  { id: "robot", color: "#06b6d4", icon: "🤖" },
  { id: "alien", color: "#10b981", icon: "👾" },
  { id: "ninja", color: "#6366f1", icon: "🥷" },
  { id: "diamond", color: "#00d4ff", icon: "💎" },
  { id: "phoenix", color: "#ef4444", icon: "🔥" },
] as const;

const ZION_AVATAR_LEGACY_EMOJI: Record<string, string> = {
  "🦁": "warrior",
  "🐉": "dragon",
  "🦊": "fox",
  "🤖": "robot",
  "👾": "alien",
  "🎭": "ninja",
  "💎": "diamond",
  "🔥": "phoenix",
  fire: "phoenix",
};

type ZionProfile = {
  nickname?: string;
  avatar?: string;
  achievements?: string[];
};

type ZionBetWalletStats = {
  total_bets: number;
  wins: number;
  losses: number;
  active_bets: number;
  total_staked: number;
  total_staked_sui?: number;
  total_staked_usdc?: number;
  currency_breakdown?: { SUI: number; USDC: number };
  total_won: number;
  net_pnl: number;
  win_rate: number;
  total_profit: number;
};

function zionbetFormatStakedLabel(stats: ZionBetWalletStats | null): string {
  const sui = stats?.total_staked_sui ?? stats?.currency_breakdown?.SUI ?? 0;
  const usdc = stats?.total_staked_usdc ?? stats?.currency_breakdown?.USDC ?? 0;
  const parts: string[] = [];
  if (sui > 0) parts.push(`${sui.toFixed(2)} SUI`);
  if (usdc > 0) parts.push(`${usdc.toFixed(2)} USDC`);
  if (parts.length === 0) {
    const legacy = stats?.total_staked ?? 0;
    return legacy > 0 ? `${legacy.toFixed(2)} SUI` : "0.00 SUI";
  }
  return parts.join(" + ");
}

const ZION_ROLE_DEFS: { id: string; label: string }[] = [
  { id: "night_wolf", label: "NIGHT WOLF" },
  { id: "fire_fox", label: "FIRE FOX" },
  { id: "void_dragon", label: "VOID DRAGON" },
  { id: "storm_hawk", label: "STORM HAWK" },
  { id: "crystal_mind", label: "CRYSTAL MIND" },
  { id: "shadow_ninja", label: "SHADOW NINJA" },
];

function zionProfileStorageKey(wallet: string): string {
  return `zion_profile_${wallet.trim().toLowerCase()}`;
}

function loadZionProfile(wallet: string): ZionProfile {
  if (typeof window === "undefined" || !wallet.trim()) return {};
  try {
    return JSON.parse(localStorage.getItem(zionProfileStorageKey(wallet)) || "{}") as ZionProfile;
  } catch {
    return {};
  }
}

function saveZionProfile(wallet: string, profile: ZionProfile): void {
  if (typeof window === "undefined" || !wallet.trim()) return;
  localStorage.setItem(zionProfileStorageKey(wallet), JSON.stringify(profile));
}

function zionbetComputeAchievements(bets: ZionBetMyBetRow[], stats: ZionBetWalletStats | null): string[] {
  const earned: string[] = [];
  const totalBets = stats?.total_bets ?? bets.length;
  const winRate = stats?.win_rate ?? 0;
  const profit = stats?.net_pnl ?? stats?.total_profit ?? 0;

  if (totalBets >= 50) earned.push("night_wolf");
  if (winRate > 60) earned.push("fire_fox");
  if (profit > 100) earned.push("void_dragon");

  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const bets24h = bets.filter((b) => {
    const t = b.created_at ? Date.parse(b.created_at) : NaN;
    return Number.isFinite(t) && now - t < dayMs;
  }).length;
  if (bets24h >= 5) earned.push("storm_hawk");

  const settled = [...bets]
    .filter((b) => {
      const s = (b.status || "").toLowerCase();
      return s === "won" || s === "lost";
    })
    .sort((a, b) => b.id - a.id);
  let winStreak = 0;
  for (const b of settled) {
    if ((b.status || "").toLowerCase() === "won") winStreak += 1;
    else break;
  }
  if (winStreak >= 10) earned.push("crystal_mind");

  if (bets.some((b) => b.amount_sui > 10)) earned.push("shadow_ninja");

  return earned;
}

function zionbetWalletTruncated(wallet: string): string {
  const w = wallet.trim();
  if (w.length <= 14) return w;
  return `${w.slice(0, 6)}...${w.slice(-4)}`;
}

function zionbetBetPnl(
  bet: ZionBetMyBetRow,
  yesCents: number,
  noCents: number
): number {
  const status = (bet.status || "active").toLowerCase();
  if (status === "won" || status === "closed_early") {
    return (bet.payout ?? bet.potential_payout ?? 0) - bet.amount_sui;
  }
  if (status === "lost") return -bet.amount_sui;
  const isYes = bet.direction === "YES";
  const avgCents = Math.max(1, Math.min(99, Math.round(Number(bet.odds) || (isYes ? yesCents : noCents))));
  const currentCents = isYes ? yesCents : noCents;
  return (bet.amount_sui * currentCents) / avgCents - bet.amount_sui;
}

function zionbetBetAvgCents(bet: ZionBetMyBetRow, yesCents: number, noCents: number): number {
  const isYes = bet.direction === "YES";
  return Math.max(1, Math.min(99, Math.round(Number(bet.odds) || (isYes ? yesCents : noCents))));
}

function zionbetBetPotentialWin(bet: ZionBetMyBetRow, yesCents: number, noCents: number): number {
  const avgCents = zionbetBetAvgCents(bet, yesCents, noCents);
  return bet.amount_sui * (100 / avgCents) - bet.amount_sui;
}

/** Mark-to-market exit value: stake × (current¢ / avg¢). */
function zionbetBetCloseValue(bet: ZionBetMyBetRow, yesCents: number, noCents: number): number {
  const isYes = bet.direction === "YES";
  const avgCents = zionbetBetAvgCents(bet, yesCents, noCents);
  const currentCents = isYes ? yesCents : noCents;
  return (bet.amount_sui * currentCents) / avgCents;
}

/** On-chain early close returns 99.9% of stake (0.1% house fee). */
function zionbetEarlyCloseReturnSui(stakeSui: number): number {
  return stakeSui * 0.999;
}

function zionbetSharesFromStake(stake: number, priceCents: number): number {
  if (priceCents <= 0) return 0;
  return (stake / priceCents) * 100;
}

function zionbetStakeFromShares(shares: number, priceCents: number): number {
  return (shares * priceCents) / 100;
}

function zionNormalizeAvatarId(avatar?: string | null): string {
  if (!avatar) return ZION_AVATARS[0].id;
  if (ZION_AVATARS.some((a) => a.id === avatar)) return avatar;
  return ZION_AVATAR_LEGACY_EMOJI[avatar] ?? ZION_AVATARS[0].id;
}

function zionAvatarMeta(avatarId?: string | null) {
  const id = zionNormalizeAvatarId(avatarId);
  return ZION_AVATARS.find((a) => a.id === id) ?? ZION_AVATARS[0];
}

function ZionBetAvatarImg({
  avatarId,
  size = 40,
  selected = false,
  style,
}: {
  avatarId?: string | null;
  size?: number;
  selected?: boolean;
  style?: CSSProperties;
}) {
  const av = zionAvatarMeta(avatarId);
  const iconSize = Math.round(size * 0.55);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: av.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: iconSize,
        flexShrink: 0,
        border: selected ? "2px solid #00ff88" : "1px solid rgba(100, 180, 255, 0.25)",
        boxShadow: selected ? "0 0 12px rgba(0, 255, 136, 0.8)" : "none",
        lineHeight: 1,
        ...style,
      }}
      title={av.id}
    >
      {av.icon}
    </div>
  );
}

function zionbetBetTimestamp(bet: ZionBetMyBetRow): number {
  const raw = bet.created_at ?? bet.resolves_at ?? bet.end_date;
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? t : 0;
}

function zionbetFormatEndsDate(bet: ZionBetMyBetRow): string {
  const raw = bet.end_date ?? bet.resolves_at;
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return `Ends ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
  }
  return "End date TBD";
}

const ZION_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ZionBetPremiumStatCard({
  label,
  value,
  variant,
  valueColor,
}: {
  label: string;
  value: string;
  variant: "staked" | "won" | "winrate" | "pnl";
  valueColor?: string;
}) {
  const styles: Record<string, { bg: string; valueColor: string }> = {
    staked: {
      bg: "linear-gradient(145deg, rgba(30, 80, 160, 0.45) 0%, rgba(15, 50, 90, 0.35) 100%)",
      valueColor: "#7eb8ff",
    },
    won: {
      bg: "linear-gradient(145deg, rgba(0, 90, 70, 0.4) 0%, rgba(15, 50, 90, 0.35) 100%)",
      valueColor: ZB_VISTA_YES,
    },
    winrate: {
      bg: "linear-gradient(145deg, rgba(90, 70, 20, 0.4) 0%, rgba(15, 50, 90, 0.35) 100%)",
      valueColor: "#fcd34d",
    },
    pnl: {
      bg: "linear-gradient(145deg, rgba(15, 50, 90, 0.5) 0%, rgba(10, 30, 60, 0.4) 100%)",
      valueColor: "#ffffff",
    },
  };
  const s = styles[variant];
  return (
    <div
      style={{
        padding: "16px 14px",
        borderRadius: 12,
        background: s.bg,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(100, 180, 255, 0.18)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          fontSize: "0.65rem",
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "rgba(150, 200, 255, 0.75)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "1.35rem", fontWeight: 800, color: valueColor ?? s.valueColor, lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );
}

const ZB_BET_CARD_GLASS: CSSProperties = {
  background: "rgba(15, 50, 90, 0.4)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(100, 180, 255, 0.15)",
  borderRadius: 12,
  padding: 16,
};

async function zionbetExecuteClosePosition(
  bet: ZionBetMyBetRow,
  walletAddress: string,
  signAndExecute: SignAndExecuteMutateFn,
  callbacks: {
    onSuccess: (
      message: string,
      type: "success" | "warning",
      meta?: { digest: string; payout?: number }
    ) => void;
    onError: (message: string) => void;
    onBusyChange?: (busy: boolean) => void;
  }
): Promise<void> {
  const betCurrencyResolved =
    zionbetBetCurrency(bet) ??
    (bet.currency?.trim().toUpperCase() === "USDC" ? "USDC" : "SUI");
  const onChainIdPending = bet.on_chain_bet_id == null || bet.on_chain_bet_id === undefined;

  if (onChainIdPending) {
    callbacks.onError("Cannot sell - on-chain ID not confirmed. Please refresh.");
    return;
  }
  const marketId = bet.market_id?.trim() || "";
  if (!marketId) {
    callbacks.onError("Cannot close - missing market id.");
    return;
  }

  callbacks.onBusyChange?.(true);
  const closeParams = {
    marketId,
    onChainBetId: bet.on_chain_bet_id as number,
    walletAddress: walletAddress.trim(),
    currency: betCurrencyResolved,
  };
  console.debug("[CLOSE] submitOnChainCloseBet params", closeParams);
  try {
    const digest = await submitOnChainCloseBet(signAndExecute, closeParams);
    const closePayout = zionbetEarlyCloseReturnSui(bet.amount_sui);

    let dbOk = false;
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch("/api/zionbet/close_position", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bet_id: bet.id,
            wallet: walletAddress.trim(),
            partial_pct: 1.0,
          }),
        });
        const d = (await r.json()) as { ok?: boolean; success?: boolean };
        if (d.ok || d.success) {
          dbOk = true;
          break;
        }
      } catch {
        // retry
      }
      if (i < 2) await new Promise((res) => setTimeout(res, 1000));
    }
    if (!dbOk) {
      callbacks.onSuccess(
        "Position closed on-chain! App sync failed - please refresh.",
        "warning",
        { digest, payout: closePayout }
      );
    } else {
      callbacks.onSuccess(
        "Position closed! ~99.9% of stake returned to wallet.",
        "success",
        { digest, payout: closePayout }
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to close position";
    callbacks.onError(msg);
  } finally {
    callbacks.onBusyChange?.(false);
  }
}

function ZionBetClosePositionButton({
  bet,
  walletAddress,
  signAndExecute,
  onClosed,
}: {
  bet: ZionBetMyBetRow;
  walletAddress: string;
  signAndExecute: SignAndExecuteMutateFn;
  onClosed?: (payload: ZionBetToastPayload) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const status = (bet.status || "active").toLowerCase();
  const isActive = status === "active" || status === "pending";
  const betCurrencyResolved = zionbetBetCurrency(bet);
  const betCurrency = betCurrencyResolved ?? "SUI";
  const isYes = bet.direction === "YES";
  const yesCents = Math.round(bet.current_yes_price ?? bet.odds ?? 50);
  const noCents = Math.round(bet.current_no_price ?? 100 - yesCents);
  const avgCents = zionbetBetAvgCents(bet, yesCents, noCents);
  const currentCents = isYes ? yesCents : noCents;
  const totalShares = zionbetSharesFromStake(bet.amount_sui, avgCents);
  const closeReturnEstimate = zionbetEarlyCloseReturnSui(bet.amount_sui);
  const onChainIdPending = bet.on_chain_bet_id == null || bet.on_chain_bet_id === undefined;

  if (!isActive || !walletAddress.trim()) return null;

  const logCloseBetObject = () => {
    console.debug(
      "[CLOSE] bet object:",
      JSON.stringify({
        id: bet.id,
        on_chain_bet_id: bet.on_chain_bet_id,
        market_id: bet.market_id,
        stake: (bet as ZionBetMyBetRow & { stake?: number }).stake ?? bet.amount_sui,
        amount_sui: bet.amount_sui,
      })
    );
  };

  const closeBtnStyle: CSSProperties = {
    width: "100%",
    marginTop: 10,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255, 160, 60, 0.55)",
    background: "rgba(255, 120, 40, 0.12)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    color: "#ffc896",
    fontSize: "0.8rem",
    fontWeight: 700,
    cursor: busy || isClosing ? "wait" : "pointer",
    opacity: busy || isClosing ? 0.65 : 1,
  };

  const showCloseToast = (message: string, type: "success" | "warning" | "error") => {
    onClosed?.({ message, type });
  };

  const runClose = async () => {
    if (isClosing || busy) return;
    logCloseBetObject();
    setIsClosing(true);
    setBusy(true);
    await zionbetExecuteClosePosition(bet, walletAddress, signAndExecute, {
      onSuccess: (message, type) => {
        showCloseToast(message, type);
        setConfirming(false);
        setBusy(false);
        setIsClosing(false);
      },
      onError: (message) => {
        onClosed?.(message);
        setBusy(false);
        setIsClosing(false);
      },
      onBusyChange: (b) => {
        if (!b) {
          setBusy(false);
          setIsClosing(false);
        }
      },
    });
  };

  return (
    <div onClick={(e) => e.stopPropagation()} role="presentation">
      {confirming ? (
        <div
          style={{
            marginTop: 10,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(255, 160, 60, 0.35)",
            fontSize: "0.78rem",
            color: ZB_VISTA_TEXT_SEC,
            lineHeight: 1.5,
          }}
        >
          <p style={{ margin: "0 0 8px", color: "#fff" }}>
            You own {totalShares.toFixed(2)} shares · bought at {avgCents}¢ · now {currentCents}¢
          </p>
          <p style={{ margin: "0 0 10px", color: ZB_VISTA_TEXT_SEC, fontSize: "0.72rem" }}>
            Close full position, receive ~{closeReturnEstimate.toFixed(2)} {betCurrency} (99.9% of stake)
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={busy || isClosing} onClick={() => void runClose()} style={{ ...closeBtnStyle, marginTop: 0, flex: 1 }}>
              {busy || isClosing ? "Closing…" : "Confirm close"}
            </button>
            <button
              type="button"
              disabled={busy || isClosing}
              onClick={() => setConfirming(false)}
              style={{
                ...closeBtnStyle,
                marginTop: 0,
                flex: 1,
                border: "1px solid rgba(100,180,255,0.25)",
                background: "rgba(10,30,60,0.5)",
                color: ZB_VISTA_TEXT_SEC,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          style={closeBtnStyle}
          onClick={() => {
            if (isClosing || busy) return;
            logCloseBetObject();
            if (onChainIdPending) {
              onClosed?.("On-chain ID not confirmed yet. Please wait and refresh.");
              return;
            }
            if (betCurrencyResolved == null) {
              onClosed?.("Cannot determine bet currency. Please refresh.");
              return;
            }
            setConfirming(true);
          }}
        >
          📤 Close full position · receive ~{closeReturnEstimate.toFixed(2)} {betCurrency}
        </button>
      )}
    </div>
  );
}

function ZionBetMyBetCard({
  bet,
  mode,
  walletAddress,
  signAndExecute,
  polyByTab,
  zionbetMarkets,
  onOpen,
  onOpenMarketId,
  onPositionClosed,
}: {
  bet: ZionBetMyBetRow;
  mode: "active" | "history";
  walletAddress?: string;
  signAndExecute?: SignAndExecuteMutateFn;
  polyByTab: Record<string, ZionbetApiMarket[]>;
  zionbetMarkets: ZionbetMarketsBundle;
  onOpen: () => void;
  onOpenMarketId?: (marketId: string) => void;
  onPositionClosed?: (payload: ZionBetToastPayload) => void;
}) {
  const { text: displayQuestion, isFallbackId } = useZionbetBetDisplayQuestion(
    bet,
    polyByTab,
    zionbetMarkets
  );
  const isYes = bet.direction === "YES";
  const yesCents = Math.round(bet.current_yes_price ?? bet.odds ?? 50);
  const noCents = Math.round(bet.current_no_price ?? 100 - yesCents);
  const avgCents = zionbetBetAvgCents(bet, yesCents, noCents);
  const currentCents = isYes ? yesCents : noCents;
  const pnl = zionbetBetPnl(bet, yesCents, noCents);
  const status = (bet.status || "active").toUpperCase();
  const isActive = status === "ACTIVE" || status === "PENDING";
  const potentialWin = zionbetBetPotentialWin(bet, yesCents, noCents);
  const payoutReceived = bet.payout ?? bet.potential_payout ?? 0;
  const betCurrency = zionbetBetCurrency(bet) ?? "SUI";

  const handleCardClick = () => {
    if (bet.market_id && onOpenMarketId) {
      onOpenMarketId(bet.market_id);
      return;
    }
    onOpen();
  };

  return (
    <div
      style={{ ...ZB_BET_CARD_GLASS, width: "100%", cursor: "pointer" }}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div style={{ width: "100%", textAlign: "left", color: "inherit" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              margin: 0,
              color: "#ffffff",
              fontSize: "0.85rem",
              fontWeight: 600,
              lineHeight: 1.45,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              ...(isFallbackId
                ? {
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    color: "rgba(180, 220, 255, 0.88)",
                    letterSpacing: "0.02em",
                  }
                : {}),
            }}
          >
            {displayQuestion}
          </div>
          <div style={{ marginTop: 8, fontSize: "0.75rem", color: "rgba(150, 200, 255, 0.7)" }}>
            {zionbetFormatEndsDate(bet)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          <span
            style={{
              fontSize: "0.8rem",
              fontWeight: 800,
              padding: "6px 14px",
              borderRadius: 999,
              color: isYes ? "#042a1f" : "#2a0a0a",
              background: isYes ? ZB_VISTA_YES : ZB_VISTA_NO,
              letterSpacing: "0.04em",
            }}
          >
            {bet.direction}
          </span>
          <div style={{ fontSize: "0.78rem", color: ZB_VISTA_TEXT_SEC, textAlign: "right" }}>
            {bet.amount_sui.toFixed(2)} {betCurrency} staked
          </div>
          <div
            style={{
              fontSize: "1.05rem",
              fontWeight: 800,
              color: pnl >= 0 ? ZB_VISTA_YES : ZB_VISTA_NO,
            }}
          >
            {pnl >= 0 ? "+" : ""}
            {pnl.toFixed(2)} {betCurrency}
          </div>
          <div style={{ fontSize: "0.72rem", color: "rgba(180, 220, 255, 0.85)" }}>
            {currentCents}¢ now vs {avgCents}¢ avg
          </div>
        </div>
      </div>
      {mode === "active" && isActive ? (
        <div
          style={{
            fontSize: "0.78rem",
            color: ZB_VISTA_YES,
            marginBottom: 10,
            fontWeight: 600,
          }}
        >
          If wins → +{potentialWin.toFixed(2)} {betCurrency}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 10,
          borderTop: "1px solid rgba(100, 180, 255, 0.1)",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: "0.68rem",
            fontWeight: 700,
            letterSpacing: "0.08em",
            padding: "4px 10px",
            borderRadius: 6,
            color:
              status === "WON" || status === "CLOSED_EARLY"
                ? ZB_VISTA_YES
                : status === "LOST"
                  ? ZB_VISTA_NO
                  : "#facc15",
            background:
              status === "WON" || status === "CLOSED_EARLY"
                ? "rgba(0, 212, 170, 0.15)"
                : status === "LOST"
                  ? "rgba(255, 107, 107, 0.15)"
                  : "rgba(250, 204, 21, 0.12)",
            border: `1px solid ${
              status === "WON" || status === "CLOSED_EARLY"
                ? "rgba(0,212,170,0.35)"
                : status === "LOST"
                  ? "rgba(255,107,107,0.35)"
                  : "rgba(250,204,21,0.3)"
            }`,
          }}
        >
          {status}
        </span>
        {status === "CLOSED_EARLY" ? (
          <span style={{ fontSize: "0.78rem", color: ZB_VISTA_YES, fontWeight: 600 }}>
            Closed early · {payoutReceived.toFixed(2)} {betCurrency} received
          </span>
        ) : status === "WON" ? (
          <span style={{ fontSize: "0.78rem", color: ZB_VISTA_YES, fontWeight: 600 }}>
            Payout received: {payoutReceived.toFixed(2)} {betCurrency}
          </span>
        ) : null}
      </div>
      </div>
      {mode === "active" && isActive && walletAddress && signAndExecute ? (
        <ZionBetClosePositionButton
          bet={bet}
          walletAddress={walletAddress}
          signAndExecute={signAndExecute}
          onClosed={onPositionClosed}
        />
      ) : null}
    </div>
  );
}

function zionbetMarketFromBet(
  bet: ZionBetMyBetRow,
  polyByTab: Record<string, ZionbetApiMarket[]>,
  zionbetMarkets: ZionbetMarketsBundle
): ZionbetApiMarket {
  const id = bet.market_id?.trim();
  if (id) {
    for (const tab of POLY_TABS) {
      const found = polyByTab[tab]?.find((m) => m.id === id);
      if (found) return found;
    }
    const native = [
      ...zionbetMarkets.crypto,
      ...zionbetMarkets.sports,
      ...zionbetMarkets.civilization,
    ].find((m) => m.id === id);
    if (native) return native;
  }
  if (id?.startsWith("poly-")) {
    const yes = bet.current_yes_price ?? bet.odds ?? 50;
    const no = bet.current_no_price ?? 100 - yes;
    const cachedQ = zionbetMarketQuestionCache[id];
    const listedQ = zionbetFindMarketQuestionInLists(id, polyByTab, zionbetMarkets);
    const question =
      listedQ ||
      cachedQ ||
      (!zionbetQuestionLooksLikeMarketId(bet.question, id) ? bet.question : id);
    return zionbetPolyRowToApiMarket({
      market_id: id,
      question,
      category: "culture",
      yes_price: yes,
      no_price: no,
      end_date: bet.end_date ?? null,
    });
  }
  const yes = bet.odds ?? 50;
  return {
    id: id || `bet-${bet.id}`,
    question: bet.question,
    event_type: "zion_bet",
    yes_pct: yes,
    no_pct: 100 - yes,
    seed_yes_cents: yes,
    end_date: bet.end_date ?? null,
  };
}

function ZionRoleSvg({ roleId }: { roleId: string }) {
  const cyan = "#00b4d8";
  const purple = "#7b2fff";
  const bg = "#0a0a1a";
  const common = { width: 40, height: 40, viewBox: "0 0 40 40", fill: "none" as const };

  switch (roleId) {
    case "night_wolf":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="4" fill={bg} />
          <path d="M8 28 L14 14 L20 22 L26 14 L32 28 Z" stroke={purple} strokeWidth="1.2" fill="rgba(123,47,255,0.15)" />
          <path d="M12 18 L10 10 M28 18 L30 10" stroke={cyan} strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="16" cy="22" r="2" fill={cyan} />
          <circle cx="24" cy="22" r="2" fill={cyan} />
          <path d="M18 26 Q20 28 22 26" stroke={cyan} strokeWidth="0.8" strokeLinecap="round" />
        </svg>
      );
    case "fire_fox":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="4" fill={bg} />
          <path d="M10 26 Q14 18 20 16 Q26 14 28 20 Q30 26 24 28 Q20 30 14 28 Z" stroke={purple} strokeWidth="1.2" fill="rgba(123,47,255,0.12)" />
          <path d="M28 20 Q34 14 32 26 Q30 32 24 28" stroke={cyan} strokeWidth="1.2" fill="rgba(0,180,216,0.1)" />
          <circle cx="22" cy="22" r="1.5" fill={cyan} />
          <path d="M24 24 L26 26" stroke={cyan} strokeWidth="0.8" strokeLinecap="round" />
        </svg>
      );
    case "void_dragon":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="4" fill={bg} />
          <path d="M8 30 Q12 10 20 14 Q28 10 32 30" stroke={purple} strokeWidth="1.2" fill="rgba(123,47,255,0.15)" />
          <path d="M14 20 L20 16 L26 20 L22 24 Z" stroke={cyan} strokeWidth="1" fill="rgba(0,180,216,0.12)" />
          <path d="M10 26 L6 22 M30 26 L34 22" stroke={purple} strokeWidth="1" strokeLinecap="round" />
          <circle cx="20" cy="19" r="1.5" fill={cyan} />
        </svg>
      );
    case "storm_hawk":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="4" fill={bg} />
          <path d="M8 22 L20 12 L32 22 L26 22 L30 30 L20 24 L10 30 L14 22 Z" stroke={cyan} strokeWidth="1.2" fill="rgba(0,180,216,0.1)" />
          <path d="M18 8 L20 14 M24 6 L22 12" stroke={cyan} strokeWidth="1.2" strokeLinecap="round" />
          <path d="M6 16 L10 18 L8 20" stroke={purple} strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "crystal_mind":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="4" fill={bg} />
          <path d="M20 8 L28 16 L24 32 L16 32 L12 16 Z" stroke={cyan} strokeWidth="1.2" fill="rgba(0,180,216,0.08)" />
          <path d="M20 8 L20 32 M12 16 L28 16 M16 32 L24 16 M24 32 L16 16" stroke={cyan} strokeWidth="0.6" opacity="0.5" />
          <circle cx="17" cy="20" r="1.2" fill={cyan} />
          <circle cx="23" cy="20" r="1.2" fill={cyan} />
          <path d="M18 26 L22 26" stroke={cyan} strokeWidth="0.8" strokeLinecap="round" />
        </svg>
      );
    case "shadow_ninja":
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="4" fill={bg} />
          <ellipse cx="20" cy="30" rx="10" ry="3" fill="rgba(123,47,255,0.2)" />
          <path d="M20 10 Q26 14 24 22 Q22 28 20 28 Q18 28 16 22 Q14 14 20 10" stroke={purple} strokeWidth="1.2" fill="rgba(123,47,255,0.12)" />
          <path d="M12 18 Q8 20 10 24 M28 18 Q32 20 30 24" stroke={purple} strokeWidth="1" strokeLinecap="round" opacity="0.7" />
          <path d="M16 20 L24 20" stroke={cyan} strokeWidth="0.8" opacity="0.4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect width="40" height="40" rx="4" fill={bg} />
        </svg>
      );
  }
}

function ZionRoleBadge({ roleId, earned, label }: { roleId: string; earned: boolean; label: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ position: "relative", width: 40, height: 40, flexShrink: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 4,
          overflow: "hidden",
          opacity: earned ? 1 : 0.2,
          filter: earned ? "none" : "grayscale(1)",
          boxShadow: earned ? "0 0 10px rgba(0, 180, 216, 0.45)" : "none",
          border: earned ? "1px solid rgba(0, 180, 216, 0.35)" : "1px solid rgba(255,255,255,0.06)",
          transition: "opacity 0.2s, box-shadow 0.2s",
        }}
      >
        <ZionRoleSvg roleId={roleId} />
      </div>
      {!earned ? (
        <div
          style={{
            position: "absolute",
            bottom: 2,
            left: "50%",
            transform: "translateX(-50%)",
            width: 10,
            height: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="2" y="4.5" width="6" height="4.5" rx="0.5" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
            <path d="M3.5 4.5 V3.5 C3.5 2.5 4.5 2 5 2 C5.5 2 6.5 2.5 6.5 3.5 V4.5" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
          </svg>
        </div>
      ) : null}
      {hovered ? (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            background: "rgba(0, 8, 20, 0.95)",
            border: "1px solid rgba(0, 180, 216, 0.25)",
            borderRadius: 2,
            padding: "3px 8px",
            fontSize: "0.62rem",
            fontFamily: "'IBM Plex Mono', monospace",
            color: earned ? "#00b4d8" : "rgba(255,255,255,0.45)",
            letterSpacing: "0.06em",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}

function ZionBetProfileDropdown({
  walletAddress,
  profile,
  stats,
  onRefreshAchievements,
  onOpenPortfolio,
  onOpenMyBets,
  onLeaderboard,
  onDisconnect,
  onClose,
}: {
  walletAddress: string;
  profile: ZionProfile;
  stats: ZionBetWalletStats | null;
  onRefreshAchievements: () => void;
  onOpenPortfolio: () => void;
  onOpenMyBets: () => void;
  onLeaderboard: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    onRefreshAchievements();
  }, [onRefreshAchievements]);

  const totalBets = stats?.total_bets ?? 0;
  const winRate = stats?.win_rate ?? 0;
  const profit = stats?.net_pnl ?? stats?.total_profit ?? 0;
  const earnedRoles = new Set(profile.achievements ?? []);

  const mono: CSSProperties = {
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    letterSpacing: "0.02em",
  };

  const menuBtn: CSSProperties = {
    width: "100%",
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.85)",
    padding: "10px 16px",
    cursor: "pointer",
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    fontSize: "0.72rem",
    letterSpacing: "0.08em",
    textAlign: "left",
    textTransform: "uppercase",
    transition: "background 0.15s, color 0.15s",
  };

  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        top: "40px",
        width: "min(300px, 92vw)",
        background: "rgba(0, 8, 20, 0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(0, 180, 216, 0.2)",
        borderRadius: "4px",
        zIndex: 210,
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
        overflow: "visible",
        color: "#fff",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(0, 180, 216, 0.12)" }}>
        <div
          style={{
            ...mono,
            fontSize: "0.78rem",
            color: "rgba(255,255,255,0.9)",
            wordBreak: "break-all",
          }}
        >
          {zionbetWalletTruncated(walletAddress)}
        </div>
        <div
          style={{
            ...mono,
            marginTop: 10,
            fontSize: "0.68rem",
            color: "rgba(255,255,255,0.55)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "4px 0",
          }}
        >
          <span>
            BETS <span style={{ color: "#fff" }}>{totalBets}</span>
          </span>
          <span style={{ margin: "0 6px", opacity: 0.35 }}>·</span>
          <span>
            WIN <span style={{ color: "#fff" }}>{Number(winRate).toFixed(1)}%</span>
          </span>
          <span style={{ margin: "0 6px", opacity: 0.35 }}>·</span>
          <span>
            P&amp;L{" "}
            <span style={{ color: profit >= 0 ? ZB_VISTA_YES : ZB_VISTA_NO }}>
              {profit >= 0 ? "+" : ""}
              {profit.toFixed(2)} SUI
            </span>
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "space-between" }}>
          {ZION_ROLE_DEFS.map((role) => (
            <ZionRoleBadge
              key={role.id}
              roleId={role.id}
              label={role.label}
              earned={earnedRoles.has(role.id)}
            />
          ))}
        </div>
      </div>
      <div style={{ padding: "4px 0" }}>
        <button
          type="button"
          style={menuBtn}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(0, 180, 216, 0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          onClick={() => {
            onOpenPortfolio();
            onClose();
          }}
        >
          My Portfolio
        </button>
        <button
          type="button"
          style={menuBtn}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(0, 180, 216, 0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          onClick={() => {
            onOpenMyBets();
            onClose();
          }}
        >
          My Bets
        </button>
        <button
          type="button"
          style={menuBtn}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(0, 180, 216, 0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          onClick={() => {
            onLeaderboard();
            onClose();
          }}
        >
          Leaderboard
        </button>
        <button
          type="button"
          style={{
            ...menuBtn,
            color: "rgba(255, 120, 120, 0.9)",
            borderTop: "1px solid rgba(0, 180, 216, 0.1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 80, 80, 0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          onClick={() => {
            onDisconnect();
            onClose();
          }}
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

type ZionBetMyBetsTab = "positions" | "history";

function ZionBetMyBetsOverlay({
  walletAddress,
  profile,
  stats,
  myBets,
  polyByTab,
  zionbetMarkets,
  signAndExecute,
  onClose,
  onOpenMarket,
  onOpenMarketId,
  onPositionClosed,
}: {
  walletAddress: string;
  profile: ZionProfile;
  stats: ZionBetWalletStats | null;
  myBets: ZionBetMyBetRow[];
  polyByTab: Record<string, ZionbetApiMarket[]>;
  zionbetMarkets: ZionbetMarketsBundle;
  signAndExecute: SignAndExecuteMutateFn;
  onClose: () => void;
  onOpenMarket: (m: ZionbetApiMarket) => void;
  onOpenMarketId?: (marketId: string) => void;
  onPositionClosed?: (payload: ZionBetToastPayload) => void;
}) {
  const now = new Date();
  const [tab, setTab] = useState<ZionBetMyBetsTab>("positions");
  const [histMonth, setHistMonth] = useState(now.getMonth());
  const [histYear, setHistYear] = useState(now.getFullYear());
  const displayName = profile.nickname?.trim() || "ZION Trader";
  const avatarId = zionNormalizeAvatarId(profile.avatar);
  const netPnl = stats?.net_pnl ?? 0;

  const activeBets = useMemo(
    () =>
      [...myBets]
        .filter((b) => {
          const s = (b.status || "active").toLowerCase();
          return s === "active" || s === "pending";
        })
        .sort((a, b) => b.id - a.id),
    [myBets]
  );

  const validActiveBets = useMemo(
    () =>
      activeBets.filter((b) => {
        const stake = (b as ZionBetMyBetRow & { stake?: number }).stake;
        return (stake || b.amount_sui || 0) > 0;
      }),
    [activeBets]
  );

  const historyYears = useMemo(() => {
    const years = new Set<number>([now.getFullYear()]);
    myBets.forEach((b) => {
      const t = zionbetBetTimestamp(b);
      if (t > 0) years.add(new Date(t).getFullYear());
    });
    return [...years].sort((a, b) => b - a);
  }, [myBets, now]);

  const historyBets = useMemo(() => {
    return [...myBets]
      .filter((b) => {
        const s = (b.status || "").toLowerCase();
        return s === "won" || s === "lost" || s === "closed_early";
      })
      .filter((b) => {
        const t = zionbetBetTimestamp(b);
        if (!t) return false;
        const d = new Date(t);
        return d.getMonth() === histMonth && d.getFullYear() === histYear;
      })
      .sort((a, b) => b.id - a.id);
  }, [myBets, histMonth, histYear]);

  const periodSummary = useMemo(() => {
    let won = 0;
    let lost = 0;
    let realized = 0;
    for (const bet of historyBets) {
      const s = (bet.status || "").toLowerCase();
      if (s === "won") won += 1;
      if (s === "lost") lost += 1;
      const yesCents = Math.round(bet.current_yes_price ?? bet.odds ?? 50);
      const noCents = Math.round(bet.current_no_price ?? 100 - yesCents);
      realized += zionbetBetPnl(bet, yesCents, noCents);
    }
    return { won, lost, total: historyBets.length, realized };
  }, [historyBets]);

  const tabBtn = (id: ZionBetMyBetsTab, label: string): CSSProperties => ({
    flex: 1,
    padding: "10px 8px",
    borderRadius: 8,
    border: tab === id ? "1px solid rgba(0, 212, 170, 0.5)" : "1px solid rgba(100, 180, 255, 0.15)",
    background: tab === id ? "rgba(0, 100, 80, 0.35)" : "rgba(10, 30, 60, 0.5)",
    color: tab === id ? "#fff" : "rgba(180, 220, 255, 0.7)",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
  });

  const listBets = tab === "positions" ? validActiveBets : historyBets;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        background: "rgba(0, 8, 20, 0.88)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "24px 12px",
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          ...zionbetAeroPanel(),
          padding: "20px",
          marginTop: 48,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <ZionBetAvatarImg avatarId={avatarId} size={52} selected />
            <div>
              <h2 style={{ margin: 0, color: "#fff", fontSize: "1.25rem" }}>{displayName}</h2>
              <p style={{ margin: "4px 0 0", fontSize: "0.75rem", color: ZB_VISTA_TEXT_SEC, fontFamily: "monospace" }}>
                {zionbetWalletTruncated(walletAddress)}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#8ab", fontSize: "1.5rem", cursor: "pointer" }}>
            ×
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}>
          <ZionBetPremiumStatCard
            label="Total Staked"
            value={zionbetFormatStakedLabel(stats)}
            variant="staked"
          />
          <ZionBetPremiumStatCard
            label="Total Won"
            value={`${(stats?.total_won ?? 0).toFixed(2)} SUI`}
            variant="won"
          />
          <ZionBetPremiumStatCard label="Win Rate" value={`${stats?.win_rate ?? 0}%`} variant="winrate" />
          <ZionBetPremiumStatCard
            label="Net P&L"
            value={`${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)} SUI`}
            variant="pnl"
            valueColor={netPnl >= 0 ? ZB_VISTA_YES : ZB_VISTA_NO}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button type="button" style={tabBtn("positions", "Active Positions")} onClick={() => setTab("positions")}>
            Active Positions
          </button>
          <button type="button" style={tabBtn("history", "Bet History")} onClick={() => setTab("history")}>
            Bet History
          </button>
        </div>

        {tab === "history" ? (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <label style={{ flex: 1, minWidth: 120, fontSize: "0.72rem", color: ZB_VISTA_LABEL }}>
                Month
                <select
                  value={histMonth}
                  onChange={(e) => setHistMonth(Number(e.target.value))}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 4,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(100,180,255,0.25)",
                    background: "rgba(10,30,60,0.7)",
                    color: "#fff",
                    fontSize: "0.85rem",
                  }}
                >
                  {ZION_MONTH_NAMES.map((name, i) => (
                    <option key={name} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ flex: 1, minWidth: 100, fontSize: "0.72rem", color: ZB_VISTA_LABEL }}>
                Year
                <select
                  value={histYear}
                  onChange={(e) => setHistYear(Number(e.target.value))}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 4,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(100,180,255,0.25)",
                    background: "rgba(10,30,60,0.7)",
                    color: "#fff",
                    fontSize: "0.85rem",
                  }}
                >
                  {historyYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div
              style={{
                ...ZB_BET_CARD_GLASS,
                marginBottom: 14,
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 10,
                fontSize: "0.8rem",
              }}
            >
              <div>
                <span style={{ color: ZB_VISTA_LABEL }}>Won / Lost / Total</span>
                <div style={{ color: "#fff", fontWeight: 700, marginTop: 4 }}>
                  {periodSummary.won} / {periodSummary.lost} / {periodSummary.total}
                </div>
              </div>
              <div>
                <span style={{ color: ZB_VISTA_LABEL }}>Realized P&L</span>
                <div
                  style={{
                    color: periodSummary.realized >= 0 ? ZB_VISTA_YES : ZB_VISTA_NO,
                    fontWeight: 800,
                    marginTop: 4,
                    fontSize: "1rem",
                  }}
                >
                  {periodSummary.realized >= 0 ? "+" : ""}
                  {periodSummary.realized.toFixed(2)} SUI
                </div>
              </div>
            </div>
          </>
        ) : null}

        {listBets.length === 0 ? (
          <p style={{ textAlign: "center", color: ZB_VISTA_TEXT_SEC, padding: "24px 0" }}>
            {tab === "positions" ? "No active positions." : "No settled bets for this period."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {listBets.map((bet) => (
              <ZionBetMyBetCard
                key={bet.id}
                bet={bet}
                mode={tab === "positions" ? "active" : "history"}
                walletAddress={walletAddress}
                signAndExecute={signAndExecute}
                polyByTab={polyByTab}
                zionbetMarkets={zionbetMarkets}
                onOpen={() => onOpenMarket(zionbetMarketFromBet(bet, polyByTab, zionbetMarkets))}
                onOpenMarketId={
                  onOpenMarketId
                    ? (marketId) => onOpenMarketId(marketId)
                    : undefined
                }
                onPositionClosed={onPositionClosed}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ZionBetPortfolioPositionRow({
  bet,
  polyByTab,
  zionbetMarkets,
}: {
  bet: ZionBetMyBetRow;
  polyByTab: Record<string, ZionbetApiMarket[]>;
  zionbetMarkets: ZionbetMarketsBundle;
}) {
  const { text: displayQuestion, isFallbackId } = useZionbetBetDisplayQuestion(
    bet,
    polyByTab,
    zionbetMarkets
  );
  const isYes = bet.direction === "YES";
  const yesCents = Math.round(bet.current_yes_price ?? bet.odds ?? 50);
  const noCents = Math.round(bet.current_no_price ?? 100 - yesCents);
  const pnl = zionbetBetPnl(bet, yesCents, noCents);
  const rowCurrency = zionbetBetCurrency(bet) ?? "SUI";
  return (
    <div
      style={{
        padding: 12,
        marginBottom: 8,
        borderRadius: 10,
        border: `1px solid ${pnl >= 0 ? "rgba(0,212,170,0.35)" : "rgba(255,107,107,0.35)"}`,
        background: "rgba(0,0,0,0.2)",
      }}
    >
      <div
        style={{
          fontWeight: 600,
          color: isFallbackId ? "rgba(180, 220, 255, 0.88)" : "#fff",
          fontSize: "0.85rem",
          fontFamily: isFallbackId ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
        }}
      >
        {zionbetTruncateQuestion(displayQuestion, 42)}
      </div>
      <div style={{ marginTop: 6, fontSize: "0.78rem", color: ZB_VISTA_TEXT_SEC }}>
        {bet.direction} · {bet.amount_sui.toFixed(2)} {rowCurrency} ·{" "}
        <span style={{ color: pnl >= 0 ? ZB_VISTA_YES : ZB_VISTA_NO }}>
          {pnl >= 0 ? "+" : ""}
          {pnl.toFixed(2)} unrealized
        </span>
      </div>
    </div>
  );
}

function ZionBetPortfolioOverlay({
  walletAddress,
  profile,
  stats,
  myBets,
  polyByTab,
  zionbetMarkets,
  onClose,
}: {
  walletAddress: string;
  profile: ZionProfile;
  stats: ZionBetWalletStats | null;
  myBets: ZionBetMyBetRow[];
  polyByTab: Record<string, ZionbetApiMarket[]>;
  zionbetMarkets: ZionbetMarketsBundle;
  onClose: () => void;
}) {
  const displayName = profile.nickname?.trim() || "ZION Trader";
  const avatarId = zionNormalizeAvatarId(profile.avatar);
  const active = myBets.filter((b) => {
    const s = (b.status || "active").toLowerCase();
    return s === "active" || s === "pending";
  });
  const netPnl = stats?.net_pnl ?? 0;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 12000,
        background: "rgba(0, 8, 20, 0.88)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "24px 12px",
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        style={{ width: "min(560px, 100%)", ...zionbetAeroPanel(), padding: "20px", marginTop: 48 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <ZionBetAvatarImg avatarId={avatarId} size={52} selected />
            <div>
              <h2 style={{ margin: 0, color: "#fff" }}>My Portfolio</h2>
              <p style={{ margin: 4, fontSize: "0.75rem", color: ZB_VISTA_TEXT_SEC }}>{displayName} · {zionbetWalletTruncated(walletAddress)}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#8ab", fontSize: "1.5rem", cursor: "pointer" }}>
            ×
          </button>
        </div>
        <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
          <div style={{ padding: 14, borderRadius: 10, background: "rgba(0,0,0,0.25)", border: "1px solid rgba(100,180,255,0.15)" }}>
            <div style={{ fontSize: "0.72rem", color: ZB_VISTA_LABEL }}>Net P&L</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: netPnl >= 0 ? ZB_VISTA_YES : ZB_VISTA_NO }}>
              {netPnl >= 0 ? "+" : ""}
              {netPnl.toFixed(2)} SUI
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: "0.8rem" }}>
            <div style={{ textAlign: "center", padding: 10, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
              <div style={{ color: ZB_VISTA_LABEL }}>Staked</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.75rem", lineHeight: 1.35 }}>
                {zionbetFormatStakedLabel(stats)}
              </div>
            </div>
            <div style={{ textAlign: "center", padding: 10, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
              <div style={{ color: ZB_VISTA_LABEL }}>Won</div>
              <div style={{ color: ZB_VISTA_YES, fontWeight: 700 }}>{(stats?.total_won ?? 0).toFixed(2)}</div>
            </div>
            <div style={{ textAlign: "center", padding: 10, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
              <div style={{ color: ZB_VISTA_LABEL }}>Win %</div>
              <div style={{ color: "#fff", fontWeight: 700 }}>{stats?.win_rate ?? 0}%</div>
            </div>
          </div>
        </div>
        <h3 style={{ margin: "0 0 10px", fontSize: "0.85rem", color: ZB_VISTA_LABEL, letterSpacing: "0.1em" }}>
          ACTIVE POSITIONS ({active.length})
        </h3>
        {active.length === 0 ? (
          <p style={{ color: ZB_VISTA_TEXT_SEC, fontSize: "0.85rem" }}>No open positions.</p>
        ) : (
          active.map((bet) => (
            <ZionBetPortfolioPositionRow
              key={bet.id}
              bet={bet}
              polyByTab={polyByTab}
              zionbetMarkets={zionbetMarkets}
            />
          ))
        )}
      </div>
    </div>
  );
}

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
  const classLabel =
    tier === "elite" ? "ELITE" : tier === "middle" ? "MIDDLE" : tier === "critical" ? "CRITICAL" : "POOR";
  const tooltip = `Subject ${classLabel} — ${Math.round(agent.balance)} ZION balance`;
  const statVal = (n?: number) => `${Math.min(5, Math.max(0, Math.round(n ?? 0)))}/5`;
  const cardStyle = {
    position: "relative" as const,
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "none",
    background: "rgba(255,255,255,0.03)",
    borderRadius: "2px",
    padding: "20px 24px",
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
      <div
        style={{
          position: "absolute",
          top: "10px",
          right: "10px",
          zIndex: 2,
          fontFamily: "var(--font-mono)",
          fontSize: "0.55rem",
          letterSpacing: "0.08em",
          color: "var(--text-secondary)",
        }}
        title={tooltip}
      >
        {classLabel}
      </div>
      <strong className="agentNameTitle" style={{ color: "var(--text-primary)" }}>
        {cleanName(agent.name)}
      </strong>
      <p className="small">
        {agent.clan ?? "UNASSIGNED"} · {agent.age_days} days
      </p>
      <div className="bar">
        <div className="fill" style={{ width: `${pct}%`, background: "var(--accent)" }} />
      </div>
      <p className="small">Balance: {agent.balance.toFixed(2)}</p>
      <div className="traits">
        <div className="traitRow">
          <span>CHARISMA:</span>
          <span className="traitStars">{statVal(agent.charisma)}</span>
        </div>
        <div className="traitRow">
          <span>AGGRESSION:</span>
          <span className="traitStars">{statVal(agent.aggression)}</span>
        </div>
        <div className="traitRow">
          <span>FAITH:</span>
          <span className="traitStars">{statVal(agent.faith)}</span>
        </div>
        <div className="traitRow">
          <span>AMBITION:</span>
          <span className="traitStars">{statVal(agent.ambition)}</span>
        </div>
        <div className="traitRow">
          <span>LOYALTY:</span>
          <span className="traitStars">{statVal(agent.loyalty)}</span>
        </div>
      </div>
    </article>
  );
}

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

function buildYesPriceChartData(
  market: ZionBetMarket,
  bets: ZionBetMyBetRow[] = [],
  yesPctOverride?: number
): { label: string; yes: number }[] {
  const yesPct =
    yesPctOverride != null && Number.isFinite(yesPctOverride)
      ? Math.max(1, Math.min(99, Math.round(yesPctOverride)))
      : zionBetDisplayOdds(market).yes;

  const marketBets = bets.filter(
    (b) =>
      (b.market_id && b.market_id === market.id) ||
      (market.question && b.question === market.question)
  );
  const yesN = typeof market.yes_count === "number" ? market.yes_count : 0;
  const noN = typeof market.no_count === "number" ? market.no_count : 0;
  const total = yesN + noN;

  if (marketBets.length > 5 || total > 0) {
    const target = yesPct;
    const points = 42;
    const series: { label: string; yes: number }[] = [];
    let v = 50;
    for (let i = 0; i < points; i++) {
      const progress = i / Math.max(1, points - 1);
      const imbalance = total > 0 ? (yesN - noN) / Math.max(1, total) : 0;
      const wobble =
        Math.sin(i * 0.41 + imbalance * 5) * (4.2 + Math.min(total, 40) * 0.06) +
        Math.cos(i * 0.27) * 2.4;
      v = 50 + (target - 50) * progress + wobble * (1 - progress * 0.78);
      v = Math.max(1, Math.min(99, Math.round(v)));
      const label = i % 7 === 0 ? `${Math.round((i / (points - 1)) * 24)}h` : "";
      series.push({ label, yes: v });
    }
    series[points - 1] = { label: "now", yes: target };
    return series;
  }

  const points = 20;
  const data: { label: string; yes: number }[] = [];
  for (let i = 0; i <= points; i++) {
    const progress = i / points;
    const noise = Math.sin(i * 2.3) * 8 + Math.cos(i * 1.7) * 5;
    const driftedValue = 50 + (yesPct - 50) * progress + noise * (1 - progress * 0.7);
    const clampedValue = Math.max(1, Math.min(99, driftedValue));
    const showLabel = i === 0 || i === points || i % 5 === 0;
    data.push({
      label:
        i === 0 ? "start" : i === points ? "now" : showLabel ? `${Math.round(progress * 100)}%` : "",
      yes: Math.round(clampedValue),
    });
  }
  return data;
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

const ZIONBET_PACKAGE = "0xc3a71ee12b039ba29b3216435c72b0c0a24ab4fedcec3c3cbec7404501256913";
const BET_HOUSE = "0xe0791c693aa4727da9aa5450e4c3015e10e0488feefbde1619677717ba2aa43f";
/** Shared UsdcBetHouse — set after calling init_usdc_house post-upgrade */
const USDC_BET_HOUSE = "0xb91cecce5def6c5c888218e9e618a053cff24a4f262a0fe777a5847256b071ec";
const BET_ADMIN_CAP = "0xb2b5883d02933b0fdea6b1ef4096267b515cd240f9ba2773754f487d5ce15922";
const SUI_CLOCK = "0x6";
const USDC_TYPE_TESTNET =
  "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";

type StealthPoolOwnerInfo =
  | { kind: "shared"; initialSharedVersion: string }
  | { kind: "owned"; address: string };

async function fetchStealthPoolOwner(
  suiClient: {
    getObject: (input: {
      id: string;
      options?: { showOwner?: boolean };
    }) => Promise<{ data?: { owner?: unknown } | null }>;
  },
  poolObjectId: string
): Promise<StealthPoolOwnerInfo> {
  const obj = await suiClient.getObject({
    id: poolObjectId,
    options: { showOwner: true },
  });
  const owner = obj.data?.owner as
    | { Shared?: { initial_shared_version?: string | number } }
    | { AddressOwner?: string }
    | undefined;
  console.log("[StealthPool] sui_getObject owner:", owner);

  if (owner && "Shared" in owner && owner.Shared) {
    const v = owner.Shared.initial_shared_version;
    if (v === undefined || v === null) {
      throw new Error("Stealth pool is shared but initial_shared_version is missing");
    }
    return { kind: "shared", initialSharedVersion: String(v) };
  }
  if (owner && "AddressOwner" in owner && owner.AddressOwner) {
    return { kind: "owned", address: String(owner.AddressOwner) };
  }
  throw new Error("Could not read stealth pool owner from chain");
}

const DEEPBOOK_PREDICT_PACKAGE = "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
const DEEPBOOK_PREDICT_ID = "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";
const DEEPBOOK_REGISTRY = "0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64";
const DUSDC_TYPE = "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC";

const MARKET_ID_NUMERIC: Record<string, number> = {
  btc_15m: 1001,
  btc_1h: 1002,
  btc_24h: 1003,
  btc_7d: 1004,
  eth_15m: 2001,
  eth_1h: 2002,
  eth_24h: 2003,
  sui_15m: 3001,
  sui_1h: 3002,
  sui_24h: 3003,
  sui_7d: 3004,
  cetus_24h: 4001,
  walrus_24h: 4002,
  deep_7d: 4003,
  civ_deaths_24h: 5001,
  civ_election_24h: 5002,
  civ_rebellion: 5003,
  civ_clan_war: 5004,
  civ_birth_auto: 5005,
};

const marketIdU64Cache = new Map<string, bigint>();

function sha256BytesToU64(bytes: Uint8Array): bigint {
  let n = BigInt(0);
  for (let i = 0; i < 8; i++) n = (n << BigInt(8)) | BigInt(bytes[i]!);
  return n;
}

/** Stable u64 for on-chain market_id — matches backend zion_bet_config.market_id_to_u64 */
async function resolveMarketIdU64(marketId: string): Promise<bigint | null> {
  const key = (marketId ?? "").trim();
  if (!key) return null;
  if (key in MARKET_ID_NUMERIC) return BigInt(MARKET_ID_NUMERIC[key]!);
  const cached = marketIdU64Cache.get(key);
  if (cached !== undefined) return cached;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const u64 = sha256BytesToU64(new Uint8Array(digest).slice(0, 8));
  marketIdU64Cache.set(key, u64);
  return u64;
}

type ZionBetDbSaveBody = {
  wallet: string;
  market_id: string;
  direction: boolean;
  amount_sui: number;
  currency?: "SUI" | "USDC";
  question?: string;
  event_type?: string;
  timeframe?: string;
  odds_at_bet?: number;
  /** Chain-first flow already ensured market in Step 0 — skip slow sui CLI in /bet */
  skip_onchain_ensure?: boolean;
  bracket_index?: number;
};

function buildZionBetDbBody(params: {
  wallet: string;
  market: {
    id: string;
    question?: string;
    event_type?: string;
    timeframe?: string;
    yes_cents?: number;
    no_cents?: number;
  };
  direction: boolean;
  amountSui: number;
  currency?: "SUI" | "USDC";
  bracketIndex?: number;
}): ZionBetDbSaveBody {
  const yesCents = Math.round(params.market.yes_cents ?? 50);
  const noCents = Math.round(params.market.no_cents ?? 100 - yesCents);
  const oddsAtBet = params.direction ? yesCents : noCents;
  const body: ZionBetDbSaveBody = {
    wallet: params.wallet,
    market_id: params.market.id,
    direction: params.direction,
    amount_sui: params.amountSui,
    question: params.market.question?.trim() || params.market.id,
    event_type: params.market.event_type?.trim() || "zion_bet",
    timeframe: params.market.timeframe || "24h",
    odds_at_bet: oddsAtBet,
    skip_onchain_ensure: true,
    currency: params.currency ?? "SUI",
  };
  if (typeof params.bracketIndex === "number") {
    body.bracket_index = params.bracketIndex;
  }
  return body;
}

type ZionBetDbSaveResult = {
  success?: boolean;
  message?: string;
  error?: string;
  potential_payout?: number;
  points_earned?: number;
  bet_id?: number;
};

async function postZionBetToDb(betBody: ZionBetDbSaveBody): Promise<ZionBetDbSaveResult> {
  console.debug("[BET] Step 3 body:", JSON.stringify(betBody));
  const betRes = await Promise.race([
    fetch("/api/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(betBody),
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DB save timeout")), 10000)
    ),
  ]);
  console.debug("[BET] Step 3 HTTP status:", betRes.status);
  const betResult = (await betRes.json()) as ZionBetDbSaveResult;
  console.debug("[BET] Step 3 response:", JSON.stringify(betResult));
  if (!betRes.ok && !betResult.error) {
    betResult.error = `HTTP ${betRes.status}`;
    betResult.success = false;
  }
  return betResult;
}

async function ensureZionBetMarketOnChain(
  marketId: string,
  timeframe?: string
): Promise<{ ok: boolean; error?: string; skipped?: boolean; warned?: boolean }> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch("/api/zionbet/ensure_market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        market_id: marketId,
        timeframe: timeframe || "24h",
      }),
      signal: controller.signal,
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      skipped?: boolean;
      already_exists?: boolean;
    };
    if (data.ok || data.already_exists || data.skipped) {
      return { ok: true, skipped: data.skipped, warned: false };
    }
    const errMsg = data.error || `HTTP ${res.status}`;
    const errLower = errMsg.toLowerCase();
    if (
      errLower.includes("already exists") ||
      errLower.includes("market_exists") ||
      errLower.includes("e_market_exists")
    ) {
      console.warn("[BET] ensure_market already exists (continuing):", errMsg);
      return { ok: true, warned: true };
    }
    console.warn("[BET] ensure_market warning (continuing):", errMsg);
    return { ok: true, warned: true, error: errMsg };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[BET] ensure_market failed, continuing:", msg);
    return { ok: true, warned: true, error: msg };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function submitOnChainBet(
  signAndExecute: SignAndExecuteMutateFn,
  params: {
    marketId: string;
    direction: boolean;
    amountSui: number;
    walletAddress: string;
  },
  callbacks?: { onSuccess?: (digest: string) => void; onError?: (message: string) => void }
): Promise<string> {
  try {
    const marketU64 = await resolveMarketIdU64(params.marketId);
    console.debug("[BET] submitOnChainBet params", {
      marketId: params.marketId,
      marketU64: marketU64?.toString(),
      direction: params.direction,
      amountSui: params.amountSui,
      walletAddress: params.walletAddress,
      ZIONBET_PACKAGE,
      BET_HOUSE,
      betAmountMist: Math.floor(params.amountSui * 1_000_000_000),
    });
    console.debug("[ZionBet] submitOnChainBet", {
      marketId: params.marketId,
      marketU64: marketU64?.toString(),
      direction: params.direction,
      amountSui: params.amountSui,
      package: ZIONBET_PACKAGE,
      betHouse: BET_HOUSE,
    });

    if (marketU64 === null) {
      const msg = "Missing market id for on-chain bet.";
      callbacks?.onError?.(msg);
      throw new Error(msg);
    }

    const tx = new Transaction();
    const betAmountMist = BigInt(Math.floor(params.amountSui * 1_000_000_000));
    const [betCoin] = tx.splitCoins(tx.gas, [betAmountMist]);
    tx.moveCall({
      target: `${ZIONBET_PACKAGE}::zion_bet::place_bet`,
      arguments: [
        tx.object(BET_HOUSE),
        tx.pure.u64(marketU64),
        tx.pure.bool(params.direction),
        betCoin,
        tx.object(SUI_CLOCK),
      ],
    });

    console.debug("[ZionBet] calling signAndExecuteTransaction…");
    console.log("[BET] submitOnChainBet: about to call signAndExecuteTransaction");
    const digest = await signAndExecuteTransaction(signAndExecute, tx);
    console.debug("[ZionBet] signAndExecute onSuccess", digest);
    callbacks?.onSuccess?.(digest);
    return digest;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ZionBet] submitOnChainBet failed", err);
    callbacks?.onError?.(msg);
    throw err instanceof Error ? err : new Error(msg);
  }
}

async function submitOnChainBetUSDC(
  signAndExecute: SignAndExecuteMutateFn,
  suiClient: SuiJsonRpcClient,
  params: {
    marketId: string;
    direction: boolean;
    amountUsdc: number;
    walletAddress: string;
  },
  callbacks?: { onSuccess?: (digest: string) => void; onError?: (message: string) => void }
): Promise<string> {
  try {
    const marketU64 = await resolveMarketIdU64(params.marketId);
    if (marketU64 === null) {
      const msg = "Missing market id for on-chain bet.";
      callbacks?.onError?.(msg);
      throw new Error(msg);
    }

    if (!USDC_BET_HOUSE || USDC_BET_HOUSE.length < 10) {
      const msg = "USDC bet house not initialized on-chain yet.";
      callbacks?.onError?.(msg);
      throw new Error(msg);
    }

    const coins = await getUsdcCoins(suiClient, params.walletAddress);
    if (coins.data.length === 0) {
      const msg = "No USDC balance found";
      callbacks?.onError?.(msg);
      throw new Error(msg);
    }

    const tx = new Transaction();
    const betAmountMist = BigInt(Math.floor(params.amountUsdc * 1_000_000));
    const primaryCoinId = coins.data[0]!.coinObjectId;

    if (coins.data.length > 1) {
      tx.mergeCoins(
        tx.object(primaryCoinId),
        coins.data.slice(1).map((c) => tx.object(c.coinObjectId))
      );
    }

    const [usdcCoin] = tx.splitCoins(tx.object(primaryCoinId), [betAmountMist]);

    tx.moveCall({
      target: `${ZIONBET_PACKAGE}::zion_bet::place_bet_usdc`,
      arguments: [
        tx.object(USDC_BET_HOUSE),
        tx.pure.u64(marketU64),
        tx.pure.bool(params.direction),
        usdcCoin,
        tx.object(SUI_CLOCK),
      ],
    });

    console.debug("[ZionBet] submitOnChainBetUSDC calling signAndExecute…");
    const digest = await signAndExecuteTransaction(signAndExecute, tx);
    console.debug("[ZionBet] submitOnChainBetUSDC onSuccess", digest);
    callbacks?.onSuccess?.(digest);
    return digest;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ZionBet] submitOnChainBetUSDC failed", err);
    callbacks?.onError?.(msg);
    throw err instanceof Error ? err : new Error(msg);
  }
}

async function submitZionBetOnChain(
  signAndExecute: SignAndExecuteMutateFn,
  suiClient: SuiJsonRpcClient,
  params: {
    marketId: string;
    direction: boolean;
    amount: number;
    walletAddress: string;
    currency: "SUI" | "USDC";
  },
  callbacks?: { onSuccess?: (digest: string) => void; onError?: (message: string) => void }
): Promise<string> {
  if (params.currency === "USDC") {
    return submitOnChainBetUSDC(
      signAndExecute,
      suiClient,
      {
        marketId: params.marketId,
        direction: params.direction,
        amountUsdc: params.amount,
        walletAddress: params.walletAddress,
      },
      callbacks
    );
  }
  return submitOnChainBet(
    signAndExecute,
    {
      marketId: params.marketId,
      direction: params.direction,
      amountSui: params.amount,
      walletAddress: params.walletAddress,
    },
    callbacks
  );
}

async function confirmZionBetOnChain(
  dbBetId: number,
  txDigest: string,
  walletAddress: string
): Promise<{ ok?: boolean; on_chain_bet_id?: number; error?: string }> {
  if (!dbBetId || !txDigest?.trim()) {
    console.debug("[BET] Step confirm: skipped — missing dbBetId or digest");
    return { ok: false, error: "missing_confirm_fields" };
  }
  try {
    console.debug("[BET] Step confirm: calling confirm_bet…", { db_bet_id: dbBetId, tx_digest: txDigest });
    const res = await fetch("/api/zionbet/confirm_bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        db_bet_id: dbBetId,
        tx_digest: txDigest,
        wallet: walletAddress.trim(),
      }),
    });
    const result = (await res.json()) as {
      ok?: boolean;
      on_chain_bet_id?: number;
      error?: string;
    };
    console.debug("[BET] Step confirm response:", JSON.stringify(result));
    if (!result.ok) {
      console.debug("[BET] Step confirm failed:", result.error);
    }
    return result;
  } catch (err) {
    console.error("[BET] Step confirm error:", err);
    return { ok: false, error: "confirm_failed" };
  }
}

async function submitOnChainCloseBet(
  signAndExecute: SignAndExecuteMutateFn,
  params: {
    marketId: string;
    onChainBetId: number;
    walletAddress: string;
    currency: "SUI" | "USDC" | null | undefined;
  },
  callbacks?: { onSuccess?: (digest: string) => void; onError?: (message: string) => void }
): Promise<string> {
  try {
    if (params.currency == null) {
      const msg = "Cannot determine bet currency. Please refresh.";
      callbacks?.onError?.(msg);
      throw new Error(msg);
    }
    const marketU64 = await resolveMarketIdU64(params.marketId);
    if (marketU64 === null) {
      const msg = "Missing market id for close bet.";
      callbacks?.onError?.(msg);
      throw new Error(msg);
    }
    const currency = params.currency;
    const tx = new Transaction();
    if (currency === "USDC") {
      if (!USDC_BET_HOUSE || USDC_BET_HOUSE.length < 10) {
        const msg = "USDC bet house not initialized on-chain yet.";
        callbacks?.onError?.(msg);
        throw new Error(msg);
      }
      tx.moveCall({
        target: `${ZIONBET_PACKAGE}::zion_bet::close_bet_usdc`,
        arguments: [
          tx.object(USDC_BET_HOUSE),
          tx.pure.u64(marketU64),
          tx.pure.u64(params.onChainBetId),
          tx.object(SUI_CLOCK),
        ],
      });
    } else {
      tx.moveCall({
        target: `${ZIONBET_PACKAGE}::zion_bet::close_bet`,
        arguments: [
          tx.object(BET_HOUSE),
          tx.pure.u64(marketU64),
          tx.pure.u64(params.onChainBetId),
          tx.pure.u64(10000),
          tx.object(SUI_CLOCK),
        ],
      });
    }
    const digest = await signAndExecuteTransaction(signAndExecute, tx);
    callbacks?.onSuccess?.(digest);
    return digest;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    callbacks?.onError?.(msg);
    throw err instanceof Error ? err : new Error(msg);
  }
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

type SignAndExecuteMutateFn = (
  variables: { transaction: Transaction; chain?: string },
  options?: {
    onSuccess?: (result: unknown) => void;
    onError?: (error: Error) => void;
  }
) => void;

/** Wraps dapp-kit mutate (callback-based). Do NOT await mutate directly at call sites. */
function signAndExecuteTransaction(
  signAndExecute: SignAndExecuteMutateFn,
  tx: Transaction
): Promise<string> {
  console.log("[BET] A: starting");
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Wallet approval timed out"));
    }, 120_000);

    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      fn();
    };

    try {
      console.log("[BET] B: signAndExecute called");
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (result) => {
            console.log("[BET] C: inside signAndExecute onSuccess", result);
            const digest = suiTxDigest(result);
            if (!digest) {
              done(() => reject(new Error("Transaction submitted without digest")));
              return;
            }
            done(() => resolve(digest));
          },
          onError: (error) => {
            console.log("[BET] C: inside signAndExecute onError", error);
            done(() => reject(error));
          },
        }
      );
    } catch (err) {
      console.log("[BET] C: inside signAndExecute sync throw", err);
      done(() => reject(err instanceof Error ? err : new Error(String(err))));
    }
  });
}

function executeZionBetOnChain(
  signAndExecute: SignAndExecuteMutateFn,
  params: {
    marketId: string;
    direction: boolean;
    amountSui: number;
    walletAddress: string;
  },
  callbacks: { onSuccess: (digest: string) => void; onError: (message: string) => void }
) {
  void submitOnChainBet(signAndExecute, params, callbacks);
}

function executeDeepBookMintBinary(
  signAndExecute: SignAndExecuteMutateFn,
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
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending: signAndExecutePending } = useSignAndExecuteTransaction();
  const [betAmount, setBetAmount] = useState("0.1");
  const [currency, setCurrency] = useState<"SUI" | "USDC">("SUI");
  const [usdcBalance, setUsdcBalance] = useState(0);
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

  useEffect(() => {
    if (!account?.address) {
      setUsdcBalance(0);
      return;
    }
    void getUsdcCoins(suiClient as SuiJsonRpcClient, account.address)
      .then((coins) => {
        const total = coins.data.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));
        setUsdcBalance(Number(total) / 1_000_000);
      })
      .catch(() => setUsdcBalance(0));
  }, [account?.address, suiClient, betSubmitting, onChainBet]);

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
    if (!buyMarket) {
      setToast({ message: "Switch to Buy + Market to place a bet", type: "error" });
      return;
    }

    const betAmountFloat = parseFloat(betAmount || "0");

    if (betAmountFloat <= 0) {
      setToast({ message: "❌ Enter valid amount", type: "error" });
      return;
    }

    setBetSubmitting(true);

    try {
      const ensureResult = await ensureZionBetMarketOnChain(bet.id, bet.timeframe);
      if (ensureResult.warned) {
        console.warn("[BET] ensure_market non-fatal warning:", ensureResult.error);
      }

      setToast({ message: "Approve wallet transaction…", type: "success" });
      const digest = await submitZionBetOnChain(
        signAndExecute as SignAndExecuteMutateFn,
        suiClient as SuiJsonRpcClient,
        {
          marketId: bet.id || "",
          direction: selectedSide === "yes",
          amount: betAmountFloat,
          walletAddress: account.address,
          currency,
        }
      );

      const betBody = buildZionBetDbBody({
        wallet: account.address,
        market: bet,
        direction: selectedSide === "yes",
        amountSui: betAmountFloat,
        currency,
      });
      const dbData = await postZionBetToDb(betBody);
      if (!dbData.success) {
        setToast({
          message: `On-chain OK but save failed: ${dbData.error || "unknown"}. TX: ${digest.slice(0, 8)}…`,
          type: "error",
        });
        return;
      }

      const dbBetId = dbData.bet_id ?? 0;
      if (dbBetId && digest) {
        await confirmZionBetOnChain(dbBetId, digest, account.address);
      }
      setOnChainBet(true);
      setToast({
        message: `✅ On-chain! TX: ${digest.slice(0, 8)}... Win: ${dbData.potential_payout} ${currency}`,
        type: "success",
      });
      onRefreshBets?.();
    } catch (err) {
      console.error("[ZionBet] handlePlaceBet failed", err);
      const msg = err instanceof Error ? err.message : "Bet failed";
      setToast({ message: msg.includes("Rejected") ? "Bet cancelled" : `❌ ${msg}`, type: "error" });
      onRefreshBets?.();
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
          background: "var(--bg-card)",
          border: "1px solid var(--accent)",
          boxShadow: "none",
          color: "var(--text-primary)",
          opacity: 1,
        }
      : {
          ...outcomeBtnBase,
          background: "transparent",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
          opacity: 0.85,
        };

  const noBtnStyle: CSSProperties =
    selectedSide === "no"
      ? {
          ...outcomeBtnBase,
          background: "var(--bg-card)",
          border: "1px solid var(--accent)",
          boxShadow: "none",
          color: "var(--text-primary)",
          opacity: 1,
        }
      : {
          ...outcomeBtnBase,
          background: "transparent",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
          opacity: 0.85,
        };

  const tabActiveStyle: CSSProperties = {
    padding: "6px 14px",
    borderRadius: "2px",
    cursor: "pointer",
    fontSize: "0.78rem",
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.06em",
    background: "var(--bg-card)",
    border: "1px solid var(--accent)",
    color: "var(--text-primary)",
  };
  const tabInactive: CSSProperties = {
    padding: "6px 14px",
    borderRadius: "2px",
    cursor: "pointer",
    fontSize: "0.78rem",
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.06em",
    background: "transparent",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
  };

  const presetBtnStyle: CSSProperties = {
    padding: "4px 12px",
    borderRadius: "2px",
    border: "1px solid var(--border)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    cursor: "pointer",
    fontSize: "0.78rem",
    fontFamily: "var(--font-mono)",
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
            style={tradeMode === "buy" ? tabActiveStyle : tabInactive}
            onClick={() => setTradeMode("buy")}
          >
            Buy
          </button>
          <button
            type="button"
            style={tradeMode === "sell" ? tabActiveStyle : tabInactive}
            onClick={() => setTradeMode("sell")}
          >
            Sell
          </button>
        </div>
        <div style={{ display: "flex", gap: "8px", margin: "8px 0" }}>
          <button
            type="button"
            style={orderType === "market" ? tabActiveStyle : tabInactive}
            onClick={() => setOrderType("market")}
          >
            Market
          </button>
          <button
            type="button"
            style={orderType === "limit" ? tabActiveStyle : tabInactive}
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
            zIndex: 10002,
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

const POLICE_DIVISION_ROLE_BADGES: Record<string, string> = {
  SWAT: "⚔️ COMBAT",
  "ANTI-TAX": "💰 ENFORCEMENT",
  "PRES.GUARD": "🛡️ SECURITY",
  "ANTI-CORR": "⚖️ INVESTIGATION",
  "RIOT CTRL": "🚨 CROWD CONTROL",
};

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function colorWithAlpha(hex: string, alphaSuffix: string): string {
  return hex.length === 7 ? `${hex}${alphaSuffix}` : hex;
}

function wireItemStyle(accentColor: string, type?: string, lab = false): CSSProperties {
  if (lab) {
    if (type === "breaking") return { color: accentColor, fontWeight: 600 };
    return { color: "var(--text-secondary)" };
  }
  if (type === "breaking") return { color: "#ff4444", fontWeight: "bold" };
  return { color: accentColor };
}

const POLICE_DIVISION_DESCRIPTIONS: Record<string, string> = {
  SWAT: "Gang raids & tactical response",
  "ANTI-TAX": "Tax collection & evasion enforcement",
  "PRES.GUARD": "Presidential protection detail",
  "ANTI-CORR": "Corruption & fraud investigation",
  "RIOT CTRL": "Civil unrest & riot suppression",
};

type PoliceDivisionCard = {
  division: string;
  division_name: string;
  officers: number;
  budget: number;
  effectiveness: number;
  role?: string;
  role_label?: string;
  role_description?: string;
  depleted?: boolean;
  mobilized?: boolean;
};

function normalizePoliceDivision(raw: Record<string, unknown>): PoliceDivisionCard {
  const name = String(raw.division_name ?? raw.division ?? raw.name ?? "").trim();
  const officers = Number(raw.officers ?? 0);
  return {
    division: name,
    division_name: name,
    officers,
    budget: Number(raw.budget ?? 0),
    effectiveness: Number(
      raw.effectiveness ?? Math.min(100, Math.max(0, officers * 4))
    ),
    role: String(raw.role ?? "patrol"),
    role_label: String(raw.role_label ?? ""),
    role_description: String(raw.role_description ?? ""),
    depleted: Boolean(raw.depleted),
    mobilized: Boolean(raw.mobilized),
  };
}

const NETWORK_ICONS: Record<string, string> = {
  Sui: "https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg",
  Ethereum: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  Solana: "https://assets.coingecko.com/coins/images/4128/small/solana.png",
  Arbitrum: "https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg",
  Base: "https://assets.coingecko.com/coins/images/27008/small/base.png",
  BNB: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png",
  Optimism: "https://assets.coingecko.com/coins/images/25244/small/Optimism.png",
  Polygon: "https://assets.coingecko.com/coins/images/4713/small/polygon.png",
};

const TOKEN_ICONS: Record<string, string> = {
  SUI: "https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg",
  USDC: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
  USDT: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
  ETH: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
  ZION: "https://zionciv.com/favicon.ico",
};

function StealthKaleidoscopeCanvas({
  spendingPubKey,
  viewingPubKey,
}: {
  spendingPubKey: string;
  viewingPubKey: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 260;
    canvas.height = 260;
    const W = 260;
    const H = 260;
    const CX = W / 2;
    const CY = H / 2;

    const keyData = spendingPubKey + viewingPubKey;
    const sliceLen = Math.max(keyData.length - 6, 1);
    const getVal = (i: number) =>
      parseInt(keyData.slice(i % sliceLen, (i % sliceLen) + 6), 16) ||
      i * 7919 + 1;

    const colors = Array.from({ length: 8 }, (_, i) => {
      const v = getVal(i * 8);
      return `hsl(${v % 360}, ${50 + (v % 40)}%, ${35 + (v % 30)}%)`;
    });

    const segments = 12;
    const angle = (Math.PI * 2) / segments;

    const shapes = Array.from({ length: 6 }, (_, i) => ({
      r: 20 + (getVal(i * 12) % 80),
      offset: getVal(i * 12 + 4) % 60,
      size: 5 + (getVal(i * 12 + 8) % 25),
      color: colors[i % colors.length],
    }));

    const offscreen = document.createElement("canvas");
    offscreen.width = W;
    offscreen.height = H;
    const octx = offscreen.getContext("2d");
    if (!octx) return;

    let frame = 0;
    let animId = 0;

    const draw = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      const rotation = frame * 0.003;

      octx.fillStyle = "#000";
      octx.fillRect(0, 0, W, H);
      octx.save();
      octx.translate(CX, CY);
      octx.rotate(rotation);

      shapes.forEach((s, si) => {
        const t = frame * 0.01 + si;
        const x = Math.cos(t * 0.7) * s.r;
        const y = Math.sin(t * 0.5) * s.r;
        octx.beginPath();
        octx.arc(x, y, s.size, 0, Math.PI * 2);
        octx.fillStyle = s.color;
        octx.globalAlpha = 0.7;
        octx.fill();
      });
      octx.restore();
      octx.globalAlpha = 1;

      for (let i = 0; i < segments; i++) {
        ctx.save();
        ctx.translate(CX, CY);
        ctx.rotate(angle * i);

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 150, -angle / 2, angle / 2);
        ctx.closePath();
        ctx.clip();

        if (i % 2 === 0) {
          ctx.drawImage(offscreen, -CX, -CY);
        } else {
          ctx.scale(-1, 1);
          ctx.drawImage(offscreen, -CX, -CY);
        }
        ctx.restore();
      }

      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      ctx.beginPath();
      ctx.arc(CX, CY, 125, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";

      frame++;
      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => cancelAnimationFrame(animId);
  }, [spendingPubKey, viewingPubKey]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "260px",
        height: "260px",
        borderRadius: "50%",
        display: "block",
        margin: "0 auto 8px",
      }}
      aria-hidden
    />
  );
}

function BankIconImg({ src, alt }: { src?: string; alt: string }) {
  if (!src) return <span style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />;
  return (
    <img
      src={src}
      alt={alt}
      style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
    />
  );
}
const ZBANK_TO_NETWORKS = ["Sui", "Ethereum"] as const;
const ZBANK_COMING_SOON_NETWORKS = ["Arbitrum", "Polygon", "BNB", "Base", "Solana", "Optimism"] as const;
const ZBANK_TOKENS = ["SUI", "USDC", "USDT", "ETH"] as const;

function truncateBankAddress(addr: string, start = 6, end = 4) {
  if (addr.length <= start + end + 3) return addr;
  return `${addr.slice(0, start)}...${addr.slice(-end)}`;
}

function BankAssetTrigger({
  token,
  network,
  onClick,
}: {
  token: string;
  network: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.12)",
        cursor: "pointer",
        flexShrink: 0,
        color: "#fff",
      }}
    >
      <BankIconImg src={TOKEN_ICONS[token]} alt={token} />
      <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{token}</span>
      <span style={{ color: "#888", fontSize: "0.72rem" }}>{network}</span>
      <span style={{ color: "#888", fontSize: "0.65rem" }}>▾</span>
    </button>
  );
}

type BankTokenModalProps = {
  token: string;
  onToken: (t: string) => void;
  onClose: () => void;
  bankSendMode: "regular" | "stealth";
};

function BankTokenModal({
  token,
  onToken,
  onClose,
  bankSendMode,
}: BankTokenModalProps) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const tokensToShow =
    bankSendMode === "stealth"
      ? (["SUI", "USDC"] as const)
      : (["SUI", "USDC", "USDT", "ETH"] as const);
  const filteredTokens = tokensToShow.filter((t) => t.toLowerCase().includes(q));

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "13px",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Select token"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: "320px",
          background: "rgba(10, 10, 10, 0.85)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(0, 255, 100, 0.2)",
          borderRadius: "16px",
          overflow: "hidden",
          boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "11px 13px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <span style={{ color: "#00ff41", fontSize: "0.85rem", fontWeight: 700 }}>Select token</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "#aaa",
              width: "28px",
              height: "28px",
              cursor: "pointer",
              fontSize: "1rem",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "10px 13px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <input
            type="text"
            placeholder="Search token…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            style={{
              width: "100%",
              padding: "8px 10px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "10px",
              color: "#fff",
              fontSize: "0.85rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div style={{ maxHeight: "280px", overflowY: "auto", padding: "6px 0" }}>
          {filteredTokens.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onToken(t)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "10px 13px",
                border: "none",
                background: token === t ? "rgba(0,255,100,0.12)" : "transparent",
                color: token === t ? "#00ff41" : "#ccc",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <BankIconImg src={TOKEN_ICONS[t]} alt={t} />
              <span>{t}{t === "ETH" ? " (wETH on Sui)" : ""}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const ZBANK_SUI_LOGO = "https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg";
const ZBANK_USDC_LOGO = "https://assets.coingecko.com/coins/images/6319/small/usdc.png";

function ZBankCoinLabel({ coin }: { coin: "SUI" | "USDC" }) {
  if (coin === "SUI") {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
        <img
          src={ZBANK_SUI_LOGO}
          style={{ width: "20px", height: "20px", borderRadius: "50%" }}
          alt="SUI"
        />
        SUI
      </span>
    );
  }
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
      <img
        src={ZBANK_USDC_LOGO}
        style={{ width: "20px", height: "20px", borderRadius: "50%" }}
        alt="USDC"
      />
      USDC
    </span>
  );
}

function ConfidentialDepositsList({
  onSelect,
}: {
  onSelect: (bf: string, amount: number, coin: string) => void;
}) {
  const [deposits, setDeposits] = useState<
    { digest: string; amount: number; coin: string; timestamp: number; blinding_factor: string | null }[]
  >([]);

  useEffect(() => {
    const list = JSON.parse(localStorage.getItem("zion_conf_deposits") || "[]");
    const withBf = list
      .map((d: { digest: string; amount: number; coin: string; timestamp: number }) => {
        const stored = localStorage.getItem("zion_bf_" + d.digest);
        const bf = stored ? JSON.parse(stored).blinding_factor : null;
        return { ...d, blinding_factor: bf };
      })
      .filter((d: { blinding_factor: string | null }) => d.blinding_factor);
    setDeposits(withBf.reverse());
  }, []);

  if (deposits.length === 0) return null;

  return (
    <div style={{ marginBottom: "12px" }}>
      <div
        style={{
          fontSize: "9px",
          color: "rgba(255,255,255,0.3)",
          letterSpacing: "1px",
          marginBottom: "6px",
        }}
      >
        MY DEPOSITS
      </div>
      {deposits.slice(0, 5).map((d, i) => (
        <div
          key={i}
          onClick={() => onSelect(d.blinding_factor!, d.amount, d.coin)}
          style={{
            padding: "8px",
            marginBottom: "4px",
            borderRadius: "4px",
            cursor: "pointer",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            fontSize: "10px",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          {d.amount} {d.coin} — {new Date(d.timestamp).toLocaleDateString()}
        </div>
      ))}
    </div>
  );
}

const encryptNote = async (
  recipientAddress: string,
  noteData: string
): Promise<string> => {
  await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );

  const recipientSeed = new TextEncoder().encode(
    recipientAddress.slice(0, 32).padEnd(32, "0")
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    recipientSeed,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: iv, iterations: 1000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(noteData)
  );

  const encryptedBytes = new Uint8Array(encrypted);
  const combined = new Uint8Array(iv.length + encryptedBytes.length);
  combined.set(iv);
  combined.set(encryptedBytes, iv.length);
  return Array.from(combined)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const decryptNote = async (
  recipientAddress: string,
  encryptedHex: string
): Promise<string> => {
  try {
    const bytes = new Uint8Array(
      encryptedHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16))
    );
    const iv = bytes.slice(0, 12);
    const encrypted = bytes.slice(12);

    const recipientSeed = new TextEncoder().encode(
      recipientAddress.slice(0, 32).padEnd(32, "0")
    );
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      recipientSeed,
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    const aesKey = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: iv, iterations: 1000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      encrypted
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return "";
  }
};

export function ZionHome({
  activeTab,
  standalone = false,
  standaloneMarketId,
}: {
  activeTab: TabId;
  standalone?: boolean;
  standaloneMarketId?: string;
}) {
  const router = useRouter();
  const account = useCurrentAccount();
  const walletAddress = account?.address ?? "";
  const wallets = useWallets();
  const { mutate: connectWallet } = useConnectWallet();
  const { mutate: disconnect } = useDisconnectWallet();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const { mutateAsync: signMessage } = useSignPersonalMessage();
  const suiClientHook = useSuiClient();
  const connect = () => {
    const w = wallets[0];
    if (w) connectWallet({ wallet: w });
  };

  const playSwish = () => {
    try {
      const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.15);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      /* audio optional */
    }
  };

  const playCork = () => {
    try {
      const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();

      const bufferSize = ctx.sampleRate * 0.1;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 800;
      filter.Q.value = 0.5;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(1.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      source.start(ctx.currentTime);

      const osc = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc.connect(gain2);
      gain2.connect(ctx.destination);
      osc.frequency.setValueAtTime(400, ctx.currentTime + 0.05);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.3);
      gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.05);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime + 0.05);
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      /* audio optional */
    }
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

  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [lastAliveCount, setLastAliveCount] = useState<number | null>(null);
  const [experimentRunTime, setExperimentRunTime] = useState(() =>
    formatRunTime(Date.now() - EXPERIMENT_START_MS)
  );
  const prevDeathsRef = useRef<number | null>(null);
  const [deathsDeltaPct, setDeathsDeltaPct] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setExperimentRunTime(formatRunTime(Date.now() - EXPERIMENT_START_MS));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const deaths = stats?.deaths_today;
    if (deaths == null) return;
    if (prevDeathsRef.current !== null && prevDeathsRef.current > 0) {
      const delta = ((deaths - prevDeathsRef.current) / prevDeathsRef.current) * 100;
      setDeathsDeltaPct(delta);
    }
    prevDeathsRef.current = deaths;
  }, [stats?.deaths_today]);
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
  const uniqueCorporations = useMemo(
    () =>
      (Array.isArray(corporations) ? corporations : []).filter(
        (corp, index, self) => index === self.findIndex((c) => c.id === corp.id)
      ),
    [corporations]
  );
  const [policeDivisions, setPoliceDivisions] = useState<{
    uprising_active?: boolean;
    divisions: PoliceDivisionCard[];
    treasury: {
      zrs_fund: number;
      president_fund: number;
      police_fund: number;
      social_fund: number;
      corruption_index: number;
    };
  } | null>(null);
  const aliveAgents = stats?.alive ?? agents.length;
  const [agentClasses, setAgentClasses] = useState({ elite: 0, middle: 0, poor: 0, critical: 0 });

  const [heroAgentCount, setHeroAgentCount] = useState<number | null>(null);
  const [heroStatsLoading, setHeroStatsLoading] = useState(true);
  const [corporationsLoading, setCorporationsLoading] = useState(true);

  const loadWave1Data = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setStatsLoading(true);
      setHeroStatsLoading(true);
    }
    try {
      const [statsRaw, agentsRaw, clansRaw] = await Promise.all([
        fetch("/api/stats").then((r) => r.json()),
        fetch("/api/agents").then((r) => r.json()),
        fetch("/api/clans").then((r) => r.json()),
      ]);

      const s = parseApiStatsResponse(statsRaw);
      setStats(s);
      if (Number.isFinite(s.alive)) setLastAliveCount(s.alive);
      setAgentClasses({
        elite: s.elite || 0,
        middle: s.middle || 0,
        poor: s.poor || 0,
        critical: s.critical || 0,
      });

      const n = Number(s.alive ?? s.alive_agents);
      if (Number.isFinite(n) && n >= 0) setHeroAgentCount(n);

      setAgents(Array.isArray(agentsRaw) ? agentsRaw : []);
      setClans(Array.isArray(clansRaw) ? clansRaw : []);
    } catch {
      // keep last successful snapshot
    } finally {
      if (isInitial) {
        setStatsLoading(false);
        setHeroStatsLoading(false);
      }
    }
  }, []);

  const loadWave2Data = useCallback(async () => {
    setCorporationsLoading(true);
    try {
      const [corpsRaw, policeRaw] = await Promise.all([
        fetch("/api/corporations").then((r) => r.json()),
        fetch("/api/police/divisions").then((r) => r.json()),
      ]);

      if (Array.isArray(corpsRaw)) setCorporations(corpsRaw);

      if (policeRaw?.divisions && Array.isArray(policeRaw.divisions)) {
        setPoliceDivisions({
          ...policeRaw,
          divisions: policeRaw.divisions.map((div: Record<string, unknown>) =>
            normalizePoliceDivision(div),
          ),
        });
      }
    } catch {
      // keep last successful snapshot
    } finally {
      setCorporationsLoading(false);
    }
  }, []);

  const loadWave3WalrusBlobs = useCallback(async () => {
    try {
      const walrusRaw = await fetch("/api/walrus/blobs").then((r) => r.json());
      if (Array.isArray(walrusRaw)) setWalrusBlobs(walrusRaw);
    } catch {
      /* keep last snapshot */
    }
  }, []);

  const loadCoreData = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setStatsLoading(true);
      setHeroStatsLoading(true);
      setCorporationsLoading(true);
    }
    try {
      const [statsRaw, civRaw, agentsRaw, clansRaw, corpsRaw, policeRaw, walrusRaw] =
        await Promise.all([
          fetch("/api/stats").then((r) => r.json()),
          fetch("/api/civilization/stats", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/agents").then((r) => r.json()),
          fetch("/api/clans").then((r) => r.json()),
          fetch("/api/corporations").then((r) => r.json()),
          fetch("/api/police/divisions").then((r) => r.json()),
          fetch("/api/walrus/blobs").then((r) => r.json()),
        ]);

      const s = parseApiStatsResponse(statsRaw);
      setStats(s);
      if (Number.isFinite(s.alive)) setLastAliveCount(s.alive);
      setAgentClasses({
        elite: s.elite || 0,
        middle: s.middle || 0,
        poor: s.poor || 0,
        critical: s.critical || 0,
      });

      const n = Number(civRaw.active_agents ?? civRaw.total_agents ?? civRaw.alive);
      if (Number.isFinite(n) && n >= 0) setHeroAgentCount(n);

      setAgents(Array.isArray(agentsRaw) ? agentsRaw : []);
      setClans(Array.isArray(clansRaw) ? clansRaw : []);

      if (Array.isArray(corpsRaw)) setCorporations(corpsRaw);

      if (policeRaw?.divisions && Array.isArray(policeRaw.divisions)) {
        setPoliceDivisions({
          ...policeRaw,
          divisions: policeRaw.divisions.map((div: Record<string, unknown>) =>
            normalizePoliceDivision(div),
          ),
        });
      }

      if (Array.isArray(walrusRaw)) setWalrusBlobs(walrusRaw);
    } catch {
      // keep last successful snapshot
    } finally {
      setStatsLoading(false);
      setHeroStatsLoading(false);
      setCorporationsLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => void loadCoreData(false), 30000);
    return () => clearInterval(t);
  }, [loadCoreData]);

  const heroProsperityPct = useMemo(() => {
    if (statsLoading || !stats) return "···";
    const p = computeProsperity({
      unemployment: stats.unemployment_rate ?? 0,
      revolution: stats.revolution_meter ?? 0,
      poverty: stats.poverty_pct ?? 0,
      population: stats.alive ?? stats.alive_agents ?? 0,
    });
    return `${(p * 100).toFixed(1)}%`;
  }, [stats]);

  const heroSubjectCount = heroStatsLoading
    ? "..."
    : (heroAgentCount ?? stats?.alive ?? lastAliveCount ?? null) != null
      ? Number(heroAgentCount ?? stats?.alive ?? lastAliveCount).toLocaleString("en-US")
      : "...";

  const [userPoints, setUserPoints] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [chatAgent, setChatAgent] = useState<Agent | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ChatClassFilter | null>(null);
  const [chatAgentsFiltered, setChatAgentsFiltered] = useState<Agent[]>([]);
  const [faucetBusy, setFaucetBusy] = useState(false);

  const [faucetCooldownEndsAt, setFaucetCooldownEndsAt] = useState<number | null>(null);
  const [perpsTab, setPerpsTab] = useState<"leaderboard" | "market" | "feed" | "myagent" | "proofs">(
    "leaderboard",
  );
  const [perpsLeaderboard, setPerpsLeaderboard] = useState<any[]>([]);
  const [perpsPrices, setPerpsPrices] = useState<any>({});
  const [perpsPriceTicker, setPerpsPriceTicker] = useState<any>({});
  const [prevPrices, setPrevPrices] = useState<any>({});
  const [priceChanges, setPriceChanges] = useState<any>({});
  const [perpsLoading, setPerpsLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<any>(null);
  const [perpsFeed, setPerpsFeed] = useState<any[]>([]);
  const [perpsProofs, setPerpsProofs] = useState<any[]>([]);
  const [myAgentSearch, setMyAgentSearch] = useState("");
  const [myAgentData, setMyAgentData] = useState<any>(null);
  const [myAgentLoading, setMyAgentLoading] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [allEvents, setAllEvents] = useState<WalrusLiveEvent[]>([]);
  const [walrusBlobs, setWalrusBlobs] = useState<Array<{
    blob_id: string;
    blob_type: string;
    content_summary: string;
    sui_object_id: string;
    created_at: string;
  }>>([]);
  const [eventFilter, setEventFilter] = useState<string>("ALL");
  const [conversations, setConversations] = useState<ConversationPair[]>([]);
  const [markets, setMarkets] = useState<ZionBetMarket[]>([]);
  const [myBets, setMyBets] = useState<ZionBetMyBetRow[]>([]);
  const [betModal, setBetModal] = useState<{
    market: ZionBetMarket;
    direction: boolean;
    open: boolean;
  } | null>(null);
  const [detailMarket, setDetailMarket] = useState<ZionbetApiMarket | null>(null);
  const [standaloneMarket, setStandaloneMarket] = useState<ZionbetApiMarket | null>(null);
  const [standaloneMarketLoading, setStandaloneMarketLoading] = useState(Boolean(standaloneMarketId));
  const [standaloneMarketError, setStandaloneMarketError] = useState<string | null>(null);
  const [injectedBuyConfirm, setInjectedBuyConfirm] = useState<ZionBetBuyConfirm | null>(null);
  const clearInjectedBuyConfirm = useCallback(() => setInjectedBuyConfirm(null), []);
  const [detailOverlayMounted, setDetailOverlayMounted] = useState(false);
  const [zionProfile, setZionProfile] = useState<ZionProfile>({});
  const [zionBetStats, setZionBetStats] = useState<ZionBetWalletStats | null>(null);
  const [showMyBetsOverlay, setShowMyBetsOverlay] = useState(false);
  const [showPortfolioOverlay, setShowPortfolioOverlay] = useState(false);

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
  const [zionBetToast, setZionBetToast] = useState<ZionBetToastPayload | null>(null);
  const [zionBetNotify, setZionBetNotify] = useState<{
    message: string;
    type: "success" | "warning" | "error";
  } | null>(null);
  const myBetsRef = useRef<ZionBetMyBetRow[]>([]);
  const [zionBetPlacing, setZionBetPlacing] = useState<string | null>(null);
  const [zionBetSelectedMarket, setZionBetSelectedMarket] = useState<ZionBetMarket | null>(null);
  const [zionBetCategoryTab, setZionBetCategoryTab] = useState<ZionBetCategoryFilter>("all");
  const [zionBetTimeframeTab, setZionBetTimeframeTab] = useState<ZionBetTimeframeFilterKey>("all");
  const [betTab, setBetTab] = useState<ZionbetBetTab>("civilization");
  const [zionMarkets, setZionMarkets] = useState<ZionMarketRow[]>([]);
  const [betTimeframe, setBetTimeframe] = useState<string>("all");
  const [betSort, setBetSort] = useState<ZionbetSortKey>("volume");
  const [zionbetMarkets, setZionbetMarkets] = useState<ZionbetMarketsBundle>({
    crypto: [],
    sports: [],
    civilization: [],
  });
  const [polyByTab, setPolyByTab] = useState<Record<string, ZionbetApiMarket[]>>({});
  const [zionbetTabLoading, setZionbetTabLoading] = useState<Record<string, boolean>>({});
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

  const [suiBalance, setSuiBalance] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [zcoDecisions, setZcoDecisions] = useState<ZcoDecision[]>([]);
  const [zcoLoading, setZcoLoading] = useState(false);
  const [zcoLastUpdated, setZcoLastUpdated] = useState<Date | null>(null);
  const [bankRecipient, setBankRecipient] = useState("");
  const [bankAmount, setBankAmount] = useState("0.1");
  const toNetwork = "Sui" as const;
  const [fromToken, setFromToken] = useState("SUI");
  const [toToken, setToToken] = useState("SUI");
  const [showTokenModal, setShowTokenModal] = useState<"from" | "to" | null>(null);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankTxHash, setBankTxHash] = useState<string | null>(null);
  const [notarizeResult, setNotarizeResult] = useState<{
    ok?: boolean;
    notarized?: boolean;
    tx_hash?: string;
    blob_id?: string;
    agent?: string;
    agent_class?: string;
    decision?: string;
    consensus?: {
      votes_for?: number;
      total_votes?: number;
      avg_confidence?: number;
    };
  } | null>(null);
  const [instantReceiptId, setInstantReceiptId] = useState<string | null>(null);
  const [bankError, setBankError] = useState<string | null>(null);
  const [zbankTab, setZbankTab] = useState<"send" | "receive" | "scan">("send");
  const [zbTab, setZbTab] = useState<'stealth'|'zk'|'zkstealth'|'confidential'>('stealth');
  const [zbankMode, setZbankMode] = useState<'anonymous' | 'stealth'>('anonymous');
  const [zbCoin, setZbCoin] = useState<'SUI'|'USDC'>('SUI');
  const [zbAmount, setZbAmount] = useState('');
  const [anonymousAmount, setAnonymousAmount] = useState(0.1);
  const [suiPrice, setSuiPrice] = useState<number>(3.5);
  const [zbRecipient, setZbRecipient] = useState('');
  const [zbStatus, setZbStatus] = useState('');
  const [zbLoading, setZbLoading] = useState(false);
  const [zbTxDigest, setZbTxDigest] = useState('');
  const [auditTrail, setAuditTrail] = useState<any>(null);
  const [zkStealthMode, setZkStealthMode] = useState<'send' | 'receive'>('send');
  const [zkStealthRecipient, setZkStealthRecipient] = useState("");
  const [stealthAmount, setStealthAmount] = useState<0.1 | 1 | 10>(0.1);
  const [keyTooltip, setKeyTooltip] = useState("");
  const [zkStealthCoin, setZkStealthCoin] = useState<"SUI" | "USDC">("SUI");
  const [zkStealthStatus, setZkStealthStatus] = useState("");
  const [zkStealthClaimDigest, setZkStealthClaimDigest] = useState("");
  const [claimResults, setClaimResults] = useState<
    Array<{ digest: string; amount: number; from?: string; relayer?: string; success?: boolean }>
  >([]);
  const [claimResultsExpanded, setClaimResultsExpanded] = useState(false);
  const [zkStealthLoading, setZkStealthLoading] = useState(false);
  const [zkClaimLoading, setZkClaimLoading] = useState(false);
  const [zkClaimStatus, setZkClaimStatus] = useState("");
  const [autoWithdraw, setAutoWithdraw] = useState(true);
  const [fragmentedWithdraw, setFragmentedWithdraw] = useState(true);
  const [useDecoys, setUseDecoys] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [gearColors] = useState(["#00ff41", "#00ffff", "#ff00ff", "#ff4400", "#ffff00", "#ff0088"]);
  const [gearColorIdx, setGearColorIdx] = useState(0);
  const gearIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [crossDenom, setCrossDenom] = useState(false);
  const [outputDenom, setOutputDenom] = useState("0.1");
  const [outputAddresses, setOutputAddresses] = useState("");
  const [multiSend, setMultiSend] = useState(false);
  const [stealthMemo, setStealthMemo] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleFrequency, setScheduleFrequency] = useState("weekly");
  const [scheduleMaxPayments, setScheduleMaxPayments] = useState("4");
  const [scheduleRecipient, setScheduleRecipient] = useState("");
  const [scheduledPayments, setScheduledPayments] = useState<
    Array<{
      id: number;
      denomination: string;
      frequency: string;
      recipient_address: string;
      total_payments: number;
      next_payment_at: string;
    }>
  >([]);
  const [zkIdentityVerified, setZkIdentityVerified] = useState(false);
  const [zkIdentityLoading, setZkIdentityLoading] = useState(false);
  const [multiRecipients, setMultiRecipients] = useState<
    Array<{ address: string; denomination: "0.1" | "1" | "10" }>
  >([{ address: "", denomination: "0.1" }]);
  const [zkStealthNotes, setZkStealthNotes] = useState<
    Array<{
      id: number;
      commitment_hash: string;
      encrypted_note: string;
      coin_type: string;
      created_at: string;
      status: string;
      encrypted_memo?: string;
      decrypted_memo?: string;
      amount_sui?: string;
      memo?: string;
    }>
  >([]);
  const [confTab, setConfTab] = useState<'deposit'|'withdraw'>('deposit');
  const [confAmount, setConfAmount] = useState('');
  const [confCoin, setConfCoin] = useState<'SUI'|'USDC'>('SUI');
  const [confStatus, setConfStatus] = useState('');
  const [confLoading, setConfLoading] = useState(false);
  const [confTxDigest, setConfTxDigest] = useState('');
  const [confBlinding, setConfBlinding] = useState('');
  const [stealthAddress, setStealthAddress] = useState('');
  const [stealthSubTab, setStealthSubTab] = useState<"send" | "receive">("send");
  const [copiedStealth, setCopiedStealth] = useState(false);
  const [stealthKeys, setStealthKeys] = useState<{
    spendingPrivKey: string;
    viewingPrivKey: string;
    spendingPubKey: string;
    viewingPubKey: string;
    metaAddress: string;
  } | null>(null);
  const [stealthScanResults, setStealthScanResults] = useState<
    {
      stealthAddress: string;
      ephemeralPubKey: string;
      txDigest?: string;
      memoDisplay?: string;
      token?: string;
    }[]
  >([]);
  const [bankSendMode, setBankSendMode] = useState<"regular" | "stealth">("regular");
  const [stealthMetaInput, setStealthMetaInput] = useState("");
  const [stealthScanLoading, setStealthScanLoading] = useState(false);
  const [stealthRegisterLoading, setStealthRegisterLoading] = useState(false);
  const [claimingIndex, setClaimingIndex] = useState<number | null>(null);
  const [claimStatus, setClaimStatus] = useState<{
    index: number;
    digest: string;
    error: string;
    gasHelpAddress?: string;
  } | null>(null);
  const [claimReceiptId, setClaimReceiptId] = useState<string | null>(null);
  const [keysFileStatus, setKeysFileStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
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
    government?: {
      zrs?: { reserve?: number; policy_mode?: string };
    };
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
    corruption_index?: number;
  } | null>(null);
  const [ecoPolData, setEcoPolData] = useState<{
    zrs_last_action: {
      state: string;
      action_taken: string;
      amount: number;
      news_headline: string;
      created_at: string;
    } | null;
    corporations: { active: number; total_treasury: number };
    economy: {
      avg_balance: number;
      poverty_pct: number;
      crime_pct?: number;
      crime_rate?: number;
      unemployment_rate?: number;
      gini_coefficient?: number;
      total_zion: number;
      trend_arrows?: { avg_balance?: string; poverty_pct?: string; total_zion?: string };
    };
    active_effects?: Array<{
      effect_type: string;
      type?: string;
      expires_at: string;
      expires_in?: string;
      effects?: string;
      crime_modifier?: number;
      poverty_modifier?: number;
    }>;
    uprising?: { active: boolean; meter: number; meter_change: string; trend?: string };
    economy_trend?: { avg_balance_change: string; direction: string };
    epidemic?: { active: boolean; infected_count: number };
  } | null>(null);
  const [frsChief, setFrsChief] = useState<{
    name: string;
    cycles_served: number;
    max_cycles: number;
    confirmed: boolean;
  } | null>(null);
  const [politicalEconomy, setPoliticalEconomy] = useState<PoliticalEconomyData | null>(null);
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
  const [governanceHeader, setGovernanceHeader] = useState<{
    active_duties: string;
    amendments_in_voting: number;
  } | null>(null);
  const [sheriffActions, setSheriffActions] = useState<{ description: string; created_at: string }[]>([]);
  const [senateActions, setSenateActions] = useState<{ description: string; created_at: string }[]>([]);
  const [senateEvents, setSenateEvents] = useState<
    { description: string; created_at: string; event_type?: string }[]
  >([]);
  const [zrsEvents, setZrsEvents] = useState<
    { description: string; created_at: string; event_type?: string }[]
  >([]);
  const [senateData, setSenateData] = useState<{
    senators: Array<{
      agent_name: string;
      party_id: string;
      role: string;
      approval_rating: number;
      is_active: boolean;
    }>;
    pending_laws: Array<{
      id: number;
      title: string;
      law_type: string;
      status: string;
      votes_for: number;
      votes_against: number;
      proposed_at?: string;
      voted_at?: string;
      created_at?: string;
      proposed_by?: string;
    }>;
    recent_laws: Array<{
      id: number;
      title: string;
      law_type: string;
      status: string;
      votes_for: number;
      votes_against: number;
      proposed_at?: string;
      voted_at?: string;
      created_at?: string;
      proposed_by?: string;
    }>;
    senator_count: number;
    speaker: string | null;
  } | null>(null);
  const [partiesData, setPartiesData] = useState<
    Array<{
      party_id: string;
      name: string;
      emoji: string;
      ideology: string;
      leader_name: string;
      treasury: number;
      approval_rating: number;
      poll_pct?: number;
      members_count: number;
      last_action?: string | null;
    }>
  | null>(null);
  const [vipMemoryFeed, setVipMemoryFeed] = useState<
    Array<{
      vip_type: string;
      vip_id: string;
      day: string;
      decision: string;
      reasoning: string;
      created_at?: string;
    }>
  >([]);

  const fetchGovernmentData = useCallback(async () => {
    try {
      const [senateRes, partiesRes, vipRes] = await Promise.all([
        fetch(`/senate?t=${Date.now()}`, { cache: "no-store" }),
        fetch(`/political_parties?t=${Date.now()}`, { cache: "no-store" }),
        fetch(`/vip_memory?t=${Date.now()}`, { cache: "no-store" }),
      ]);
      if (senateRes.ok) {
        const d = await senateRes.json();
        setSenateData({
          ...(d && typeof d === "object" ? d : {}),
          senators: Array.isArray(d?.senators) ? d.senators : [],
          pending_laws: Array.isArray(d?.pending_laws) ? d.pending_laws : [],
          recent_laws: Array.isArray(d?.recent_laws) ? d.recent_laws : [],
        });
      }
      if (partiesRes.ok) {
        const d = await partiesRes.json();
        setPartiesData(Array.isArray(d) ? d : []);
      }
      if (vipRes.ok) {
        const d = await vipRes.json();
        setVipMemoryFeed(Array.isArray(d) ? d : []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchSenateLaws = useCallback(async () => {
    try {
      const senateRes = await fetch(`/senate?t=${Date.now()}`, { cache: "no-store" });
      if (!senateRes.ok) return;
      const d = await senateRes.json();
      setSenateData((prev) => ({
        senators: Array.isArray(d?.senators) ? d.senators : prev?.senators ?? [],
        pending_laws: Array.isArray(d?.pending_laws) ? d.pending_laws : [],
        recent_laws: Array.isArray(d?.recent_laws) ? d.recent_laws : [],
        senator_count: Number(d?.senator_count) || prev?.senator_count || 0,
        speaker: d?.speaker ?? prev?.speaker ?? null,
      }));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => void fetchSenateLaws(), 30000);
    return () => clearInterval(interval);
  }, [fetchSenateLaws]);

  const fetchPoliticalEconomy = useCallback(async () => {
    try {
      const [crisisRes, powerRes, gangsRes] = await Promise.all([
        fetch(`/api/crisis_state?t=${Date.now()}`, { cache: "no-store" }),
        fetch(`/api/power_balance?t=${Date.now()}`, { cache: "no-store" }),
        fetch(`/api/gangs?t=${Date.now()}`, { cache: "no-store" }),
      ]);
      const crisisPayload = crisisRes.ok ? await crisisRes.json() : null;
      const powerPayload = powerRes.ok ? await powerRes.json() : null;
      const gangsPayload = gangsRes.ok ? await gangsRes.json() : null;
      setPoliticalEconomy({
        crisis: (crisisPayload?.crisis ?? {}) as PoliticalEconomyData["crisis"],
        metrics: (crisisPayload?.metrics ?? {}) as PoliticalEconomyData["metrics"],
        power: {
          scores: (powerPayload?.scores ?? {}) as PoliticalEconomyData["power"]["scores"],
          recent_events: powerPayload?.recent_events,
        },
        gangs: Array.isArray(gangsPayload?.gangs) ? gangsPayload.gangs : [],
      });
    } catch {
      /* keep last snapshot */
    }
  }, []);

  useEffect(() => {
    const peInterval = setInterval(() => {
      void fetchPoliticalEconomy();
    }, 30_000);
    return () => clearInterval(peInterval);
  }, [fetchPoliticalEconomy]);

  const fetchEcoPol = useCallback(async () => {
    try {
      const res = await fetch(`/api/eco-pol?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      console.log("president data:", data?.president);

      if (data.president?.agent_name) {
        setPresidentState((prev) => ({
          agent_name: data.president.agent_name,
          party: data.president.party ?? "reform",
          term_number: Number(data.president.term_number) || 1,
          is_dictator: Boolean(data.president.is_dictator),
          approval_rating: Number.isFinite(Number(data.president.approval_rating))
            ? Number(data.president.approval_rating)
            : (prev?.approval_rating ?? 50),
          days_in_power: Number(data.president.days_in_power) || 0,
          police_fund: Number(data.president.police_fund) || 0,
          personal_fund: Number(data.president.personal_fund) || 0,
          corruption_index: Number(data.president.corruption_index) || 30,
        }));
      }

      if (data.sheriff?.agent_name && data.sheriff.agent_name !== "No Sheriff") {
        setSheriffState(data.sheriff);
      } else {
        setSheriffState(null);
      }

      const zrs = data.zrs_last_action;
      const corps = data.corporations ?? {};
      const economy = data.economy ?? {};
      setEcoPolData({
        zrs_last_action: zrs
          ? {
              state: String(zrs.state ?? "NORMAL"),
              action_taken: String(zrs.action_taken ?? "HOLD"),
              amount: Number(zrs.amount) || 0,
              news_headline: String(zrs.news_headline ?? ""),
              created_at: String(zrs.created_at ?? ""),
            }
          : null,
        corporations: {
          active: Number(corps.active) || 0,
          total_treasury: Number(corps.total_treasury) || 0,
        },
        economy: {
          avg_balance: Number(economy.avg_balance) || 0,
          poverty_pct: Number(economy.poverty_pct) || 0,
          crime_pct: Number(economy.crime_pct) || 0,
          crime_rate: Number(economy.crime_rate) || 0,
          unemployment_rate: Number(economy.unemployment_rate) || 0,
          gini_coefficient: Number(economy.gini_coefficient) || 0,
          total_zion: Number(economy.total_zion) || 0,
          trend_arrows: economy.trend_arrows ?? {},
        },
        active_effects: Array.isArray(data.active_effects) ? data.active_effects : [],
        uprising: data.uprising
          ? {
              active: Boolean(data.uprising.active),
              meter: Number(data.uprising.meter) || 0,
              meter_change: String(data.uprising.meter_change ?? data.uprising.trend ?? ""),
            }
          : { active: false, meter: 0, meter_change: "" },
        economy_trend: data.economy_trend ?? { avg_balance_change: "0", direction: "flat" },
        epidemic: data.epidemic ?? { active: false, infected_count: 0 },
      });
      if (data.frs_chief && typeof data.frs_chief === "object") {
        setFrsChief({
          name: String(data.frs_chief.name ?? "Vacant"),
          cycles_served: Number(data.frs_chief.cycles_served) || 0,
          max_cycles: Number(data.frs_chief.max_cycles) || 12,
          confirmed: Boolean(data.frs_chief.confirmed),
        });
      } else {
        try {
          const statsRes = await fetch(`/api/stats?t=${Date.now()}`, { cache: "no-store" });
          if (statsRes.ok) {
            const statsData = await statsRes.json();
            if (statsData.frs_chief && typeof statsData.frs_chief === "object") {
              setFrsChief({
                name: String(statsData.frs_chief.name ?? "Vacant"),
                cycles_served: Number(statsData.frs_chief.cycles_served) || 0,
                max_cycles: Number(statsData.frs_chief.max_cycles) || 12,
                confirmed: Boolean(statsData.frs_chief.confirmed),
              });
            }
          }
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchZcoDecisionsFromAPI = useCallback(async (): Promise<ZcoDecision[]> => {
    const res = await fetch("/api/zco");
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data as ZcoDecision[];
    if (Array.isArray((data as { decisions?: ZcoDecision[] })?.decisions)) {
      return (data as { decisions: ZcoDecision[] }).decisions;
    }
    return [];
  }, []);

  useEffect(() => {
    localStorage.removeItem('conv_cache');
  }, []);

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
      const res = await fetch("https://fullnode.testnet.sui.io", {
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
    }
  }, [account?.address]);

  const fetchUsdcBalance = useCallback(async () => {
    if (!account?.address) {
      setUsdcBalance(0);
      return;
    }
    try {
      const coins = await getUsdcCoins(suiClientHook as SuiJsonRpcClient, account.address);
      const total = coins.data.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));
      setUsdcBalance(Number(total) / 1_000_000);
    } catch {
      setUsdcBalance(0);
    }
  }, [account?.address, suiClientHook]);

  useEffect(() => {
    if (account?.address) {
      void checkVipStatus();
      void fetchUsdcBalance();
    } else {
      setSuiBalance(0);
      setUsdcBalance(0);
    }
  }, [account?.address, checkVipStatus, fetchUsdcBalance]);


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
    if (activeTab !== "zionbet") return;
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
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "zionbet") setZionBetSelectedMarket(null);
  }, [activeTab]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetchZcoDecisions();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [fetchZcoDecisions]);

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

  const fetchZionMarkets = useCallback(async () => {
    try {
      const res = await fetch("/api/zion-markets");
      const data = await res.json();
      if (data.success) setZionMarkets(data.markets);
    } catch {
      /* ignore */
    }
  }, []);

  const loadCivilizationMarkets = useCallback(() => {
    setZionbetTabLoading((prev) => ({ ...prev, civilization: true }));
    fetch("/api/zionbet/markets")
      .then((r) => r.json())
      .then((d: ZionbetMarketsBundle & { total?: number }) => {
        setZionbetMarkets({
          crypto: Array.isArray(d.crypto) ? d.crypto : [],
          sports: Array.isArray(d.sports) ? d.sports : [],
          civilization: Array.isArray(d.civilization) ? d.civilization : [],
        });
      })
      .catch(() => {})
      .finally(() => setZionbetTabLoading((prev) => ({ ...prev, civilization: false })));
  }, []);

  const loadPolyTab = useCallback((tab: ZionbetBetTab) => {
    if (!POLY_TABS.includes(tab)) return;
    setZionbetTabLoading((prev) => ({ ...prev, [tab]: true }));
    fetch(`/api/zionbet/polymarkets?category=${encodeURIComponent(tab)}&t=${Date.now()}`, {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d: unknown) => {
        const markets = Array.isArray(d) ? d.map((row) => zionbetPolyRowToApiMarket(row as Record<string, unknown>)) : [];
        setPolyByTab((prev) => ({ ...prev, [tab]: markets }));
      })
      .catch(() => setPolyByTab((prev) => ({ ...prev, [tab]: [] })))
      .finally(() => setZionbetTabLoading((prev) => ({ ...prev, [tab]: false })));
  }, []);

  const loadAllPolyTabs = useCallback(() => {
    POLY_TABS.forEach((tab) => {
      setZionbetTabLoading((prev) => ({ ...prev, [tab]: true }));
    });
    Promise.all(
      POLY_TABS.map((tab) =>
        fetch(`/api/zionbet/polymarkets?category=${encodeURIComponent(tab)}&t=${Date.now()}`, {
          cache: "no-store",
        }).then((r) => r.json().then((d: unknown) => ({ tab, d })))
      )
    )
      .then((results) => {
        const next: Record<string, ZionbetApiMarket[]> = {};
        for (const { tab, d } of results) {
          next[tab] = Array.isArray(d)
            ? d.map((row) => zionbetPolyRowToApiMarket(row as Record<string, unknown>))
            : [];
        }
        setPolyByTab((prev) => ({ ...prev, ...next }));
      })
      .catch(() => {})
      .finally(() => {
        POLY_TABS.forEach((tab) => {
          setZionbetTabLoading((prev) => ({ ...prev, [tab]: false }));
        });
      });
  }, []);

  useEffect(() => {
    if (activeTab !== "zionbet") return;
    loadCivilizationMarkets();
    loadAllPolyTabs();
    const interval = window.setInterval(loadCivilizationMarkets, 30000);
    return () => clearInterval(interval);
  }, [activeTab, loadCivilizationMarkets, loadAllPolyTabs]);

  useEffect(() => {
    if (betTab === "civilization") void fetchZionMarkets();
  }, [betTab, fetchZionMarkets]);

  useEffect(() => {
    if (activeTab !== "zionbet") return;
    if (betTab === "civilization") {
      loadCivilizationMarkets();
    } else if (POLY_TABS.includes(betTab)) {
      loadPolyTab(betTab);
    }
  }, [activeTab, betTab, loadCivilizationMarkets, loadPolyTab]);

  const fetchPerpsData = useCallback(async () => {
    setPerpsLoading(true);
    try {
      const lbRes = await fetch("/api/perps/leaderboard");
      const lb = await lbRes.json();
      if (lb.success) setPerpsLeaderboard(lb.leaderboard);
    } catch (e) {
      console.error("Perps fetch error", e);
    }
    setPerpsLoading(false);
  }, []);

  const fetchPerpsFeed = useCallback(async () => {
    try {
      const res = await fetch("/api/perps/feed");
      const data = await res.json();
      if (data.success) setPerpsFeed(data.trades);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchPerpsProofs = useCallback(async () => {
    try {
      const res = await fetch("/api/perps/proofs");
      const data = await res.json();
      if (data.success) setPerpsProofs(data.proofs);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const searchMyAgent = useCallback(async () => {
    if (!myAgentSearch.trim()) return;
    setMyAgentLoading(true);
    try {
      const res = await fetch(
        `/api/perps/search-agent?name=${encodeURIComponent(myAgentSearch)}`,
      );
      const data = await res.json();
      if (data.success) setMyAgentData(data);
    } catch (e) {
      console.error(e);
    }
    setMyAgentLoading(false);
  }, [myAgentSearch]);

  const perpsPrevPriceRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (activeTab !== "zperps") {
      perpsPrevPriceRef.current = {};
      return;
    }

    const fetchPrices = async () => {
      try {
        const r = await fetch("/api/perps/prices");
        const d = await r.json();
        if (d.success) {
          setPerpsPrices(d.prices);
          setPerpsPriceTicker(d.prices);
        }
      } catch {
        /* ignore */
      }
    };

    fetchPrices();
    const t = setInterval(fetchPrices, 2000);
    return () => clearInterval(t);
  }, [activeTab]);

  useEffect(() => {
    if (!perpsPrices || Object.keys(perpsPrices).length === 0) return;

    const changes: Record<string, "up" | "down" | "same"> = {};
    Object.entries(perpsPrices).forEach(([symbol, data]) => {
      const curr = (data as { price?: number })?.price;
      const prev = perpsPrevPriceRef.current[symbol];
      if (typeof prev === "number" && typeof curr === "number") {
        changes[symbol] = curr > prev ? "up" : curr < prev ? "down" : "same";
      }
      if (typeof curr === "number") {
        perpsPrevPriceRef.current[symbol] = curr;
      }
    });
    setPriceChanges(changes);
    setPrevPrices(
      Object.fromEntries(
        Object.entries(perpsPrices).map(([k, v]) => [k, { ...(v as object) }]),
      ),
    );
  }, [perpsPrices]);

  useEffect(() => {
    if (activeTab === "zperps") {
      fetchPerpsData();
      const interval = setInterval(() => {
        fetchPerpsData();
        if (perpsTab === "feed") fetchPerpsFeed();
      }, 10000);
      const lbInterval = setInterval(async () => {
        try {
          const res = await fetch("/api/perps/leaderboard");
          const data = await res.json();
          if (data.success) setPerpsLeaderboard(data.leaderboard);
        } catch (e) {
          /* ignore */
        }
      }, 10000);
      return () => {
        clearInterval(interval);
        clearInterval(lbInterval);
      };
    }
  }, [activeTab, fetchPerpsData, fetchPerpsFeed, perpsTab]);

  useEffect(() => {
    if (!detailMarket?.id.startsWith("poly-")) return;
    const hasDesc = Boolean(detailMarket.description?.trim() || detailMarket.resolution_criteria?.trim());
    if (hasDesc) return;
    for (const tab of POLY_TABS) {
      const found = polyByTab[tab]?.find((m) => m.id === detailMarket.id);
      if (found?.description?.trim() || found?.resolution_criteria?.trim()) {
        setDetailMarket((prev) => (prev?.id === found.id ? { ...prev, ...found } : prev));
        break;
      }
    }
  }, [polyByTab, detailMarket?.id, detailMarket?.description, detailMarket?.resolution_criteria]);

  useEffect(() => {
    if (!standaloneMarketId) {
      setStandaloneMarket(null);
      setStandaloneMarketLoading(false);
      setStandaloneMarketError(null);
      return;
    }
    let cancelled = false;
    setStandaloneMarketLoading(true);
    setStandaloneMarketError(null);

    const fromLists = [
      ...Object.values(polyByTab).flat(),
      ...zionbetMarkets.crypto,
      ...zionbetMarkets.sports,
      ...zionbetMarkets.civilization,
    ].find((m) => m.id === standaloneMarketId);

    if (fromLists && !cancelled) {
      setStandaloneMarket(fromLists);
    }

    fetch(`/api/zionbet/market/${encodeURIComponent(standaloneMarketId)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("not_found");
        return r.json() as Promise<Record<string, unknown>>;
      })
      .then((row) => {
        if (cancelled) return;
        setStandaloneMarket(zionbetPolyRowToApiMarket(row));
        setStandaloneMarketError(null);
      })
      .catch(() => {
        if (cancelled) return;
        if (!fromLists) {
          setStandaloneMarketError("Market not found");
          setStandaloneMarket(null);
        }
      })
      .finally(() => {
        if (!cancelled) setStandaloneMarketLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [standaloneMarketId, polyByTab, zionbetMarkets]);

  const zionbetTabCounts = useMemo(
    () => ({
      civilization: zionbetMarkets.civilization.length + zionMarkets.length,
      crypto: DEEPBOOK_BINARY_MARKETS.length + (polyByTab.crypto?.length ?? 0),
      sports: polyByTab.sports?.length ?? 0,
      politics: polyByTab.politics?.length ?? 0,
      geopolitics: polyByTab.geopolitics?.length ?? 0,
      finance: polyByTab.finance?.length ?? 0,
      tech: polyByTab.tech?.length ?? 0,
      culture: polyByTab.culture?.length ?? 0,
    }),
    [zionbetMarkets, polyByTab, zionMarkets.length]
  );

  const zionbetTabMarketsBase = useMemo(() => {
    if (betTab === "civilization") {
      return [...zionbetMarkets.civilization];
    }
    if (betTab === "crypto") {
      return [...(polyByTab.crypto ?? [])];
    }
    if (POLY_TABS.includes(betTab)) {
      return [...(polyByTab[betTab] ?? [])];
    }
    return [];
  }, [zionbetMarkets, polyByTab, betTab]);

  const zionbetCryptoPolyMarkets = useMemo(
    () => (betTab === "crypto" ? [...(polyByTab.crypto ?? [])] : []),
    [betTab, polyByTab.crypto]
  );

  const zionbetFilteredDeepbookMarkets = useMemo(() => {
    if (betTab !== "crypto") return [];
    if (betTimeframe === "all") return [...DEEPBOOK_BINARY_MARKETS];
    const ids = ZIONBET_CRYPTO_DEEPBOOK_IDS[betTimeframe];
    if (!ids) return [];
    return DEEPBOOK_BINARY_MARKETS.filter((m) => ids.includes(m.id));
  }, [betTab, betTimeframe]);

  const betTimeframeCounts = useMemo((): Record<string, number> => {
    if (betTab === "crypto") {
      const poly = zionbetCryptoPolyMarkets.length;
      return {
        all: DEEPBOOK_BINARY_MARKETS.length + poly,
        "15m": 1,
        "1h": 3,
        "24h": 1 + poly,
      };
    }
    return { all: zionbetTabMarketsBase.length };
  }, [betTab, zionbetTabMarketsBase, zionbetCryptoPolyMarkets.length]);

  const zionbetDisplayedMarkets = useMemo(() => {
    const sorted = [...zionbetTabMarketsBase];
    if (betSort === "volume") {
      sorted.sort(
        (a, b) =>
          zionbetCardSortVolume(b.id, b.volume, b.volume_sui) -
          zionbetCardSortVolume(a.id, a.volume, a.volume_sui)
      );
    } else if (betSort === "ending") {
      sorted.sort((a, b) => zionbetMarketEndSortKey(a) - zionbetMarketEndSortKey(b));
    } else {
      sorted.reverse();
    }
    if (betTab === "crypto" && betTimeframe !== "all") {
      if (betTimeframe === "15m" || betTimeframe === "1h") return [];
      if (betTimeframe === "24h") return sorted;
    }
    return sorted;
  }, [zionbetTabMarketsBase, betTab, betSort, betTimeframe]);

  useEffect(() => {
    if (betTab !== "crypto" && betTimeframe !== "all") {
      setBetTimeframe("all");
    }
  }, [betTab, betTimeframe]);

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
    const res = await fetch("/api/events/by_type");
    const json = await res.json();
    const data = Array.isArray(json) ? json : Array.isArray(json?.events) ? json.events : [];
    if (!Array.isArray(data)) return [];

    return data.map((e: Record<string, unknown>) => {
      const eventType = String(e.type ?? e.event_type ?? "");
      return {
        id: String(e.id ?? ""),
        type: eventType,
        event_type: eventType,
        title:
          typeof e.description === "string"
            ? e.description.split(".")[0] || eventType
            : eventType,
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
      };
    });
  }, []);

  const fetchWalrusEvents = useCallback(async () => {
    const cacheKey = "walrus_events_cache";
    const ttlMs = 5 * 60 * 1000;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, ts } = JSON.parse(cached) as { data: WalrusLiveEvent[]; ts: number };
        if (Date.now() - ts < ttlMs && Array.isArray(data)) {
          setAllEvents(data);
          void fetchWalrusEventsFromAPI().then((fresh) => {
            setAllEvents(fresh);
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
      setAllEvents(fresh);
      localStorage.setItem(cacheKey, JSON.stringify({ data: fresh, ts: Date.now() }));
    } catch (err) {
      console.error(err);
    }
  }, [fetchWalrusEventsFromAPI]);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/conversations");
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setConversations(data);
      } else {
        await fetch("/api/generate_conversations", { method: "POST" });
        const res2 = await fetch("/conversations");
        const data2 = await res2.json();
        if (Array.isArray(data2)) setConversations(data2);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void fetchWalrusEvents();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchWalrusEvents]);

  const allFeedItems = useMemo((): WalrusFeedTickerItem[] => {
    const political: WalrusFeedTickerItem[] = [];
    if (politicalEconomy) {
      const crisisActive = Boolean(politicalEconomy.crisis?.is_active);
      const pressure = Number(
        politicalEconomy.metrics?.revolution_pressure ??
          politicalEconomy.crisis?.revolution_pressure ??
          0
      );
      const phase = (
        politicalEconomy.metrics?.economic_phase ??
        politicalEconomy.crisis?.economic_phase ??
        "NORMAL"
      ).toUpperCase();
      const pname =
        politicalEconomy.metrics?.president_name ??
        presidentState?.agent_name ??
        "President";
      if (crisisActive) {
        political.push({
          type: "revolution",
          text: `🚨 STATE OF EMERGENCY declared by ${pname}`,
          agent: "ZION System",
        });
      }
      if (pressure > 50) {
        political.push({
          type: "revolution",
          text: `Civil unrest pressure rising: ${Math.round(pressure)}/150`,
          agent: "ZION System",
        });
      }
      if (phase !== "NORMAL") {
        political.push({
          type: "tax",
          text: `📊 Economy in ${phase}`,
          agent: "ZION System",
        });
      }
    }
    const fromEvents: WalrusFeedTickerItem[] = (Array.isArray(allEvents) ? allEvents : []).map((e) => ({
      type: e.type || e.event_type || "",
      text: e.type === "chat" ? e.description || e.title : e.title || e.description,
      agent: e.agents[0] || "ZION System",
    }));
    const fromConvs: WalrusFeedTickerItem[] = (Array.isArray(conversations) ? conversations : []).map((c) => ({
      type: "chat",
      text: cleanMsg(c.message1 || c.topic || ""),
      agent: c.agent1?.name ? cleanName(c.agent1.name) : "Agent",
    }));
    return [...political, ...fromEvents, ...fromConvs].filter((i) => i.text);
  }, [allEvents, conversations, politicalEconomy, presidentState?.agent_name]);

  const filteredEvents = useMemo(() => {
    if (eventFilter === "ALL") return allFeedItems;
    const tabTypes = TAB_TYPES[eventFilter];
    if (!tabTypes?.length) return allFeedItems;
    return allFeedItems.filter((e) => tabTypes.includes(e.type));
  }, [allFeedItems, eventFilter]);

  const tickerDuration = 2080;

  useEffect(() => {
    console.log("filtered events:", filteredEvents.length, eventFilter);
  }, [filteredEvents, eventFilter]);

  const loadZionBetStats = useCallback(async () => {
    const w = account?.address?.trim();
    if (!w) {
      setZionBetStats(null);
      return;
    }
    try {
      const r = await fetch(`/api/zionbet/stats/${encodeURIComponent(w)}`, { cache: "no-store" });
      const data = await r.json();
      if (data && !data.error) setZionBetStats(data as ZionBetWalletStats);
      else setZionBetStats(null);
    } catch {
      setZionBetStats(null);
    }
  }, [account?.address]);

  const refreshZionAchievements = useCallback(() => {
    const w = account?.address?.trim();
    if (!w) return;
    const earned = zionbetComputeAchievements(myBetsRef.current, zionBetStats);
    setZionProfile((prev) => {
      const merged = { ...prev, achievements: earned };
      saveZionProfile(w, merged);
      return merged;
    });
  }, [account?.address, zionBetStats]);

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
      const earned = zionbetComputeAchievements(fetched, zionBetStats);
      setZionProfile((p) => {
        const merged = { ...p, achievements: earned };
        saveZionProfile(w, merged);
        return merged;
      });
    } catch {
      myBetsRef.current = [];
      setMyBets([]);
    }
  }, [account?.address, zionBetStats]);

  const handlePositionClosed = useCallback(
    (payload: ZionBetToastPayload) => {
      if (typeof payload === "object" && payload.type) {
        setZionBetToast(null);
        setZionBetNotify({ message: payload.message, type: payload.type });
      } else {
        setZionBetNotify(null);
        setZionBetToast(payload);
      }
      void loadMyBets();
      void loadZionBetStats();
      void fetchUsdcBalance();
      void checkVipStatus();
    },
    [loadMyBets, loadZionBetStats, fetchUsdcBalance, checkVipStatus]
  );

  const handlePlaceCardBet = useCallback(
    async (
      modalMarket: ZionBetMarket,
      modalDirection: boolean,
      amountOverride?: number
    ): Promise<ZionBetBuyConfirm | null> => {
      if (!account?.address) {
        console.error("[ZionBet] handlePlaceCardBet: wallet UI visible but account.address missing");
        setZionBetToast("Please connect wallet first");
        return null;
      }
      if (!signAndExecute) {
        setZionBetToast("Please connect wallet first");
        return null;
      }
      const betAmountValue =
        typeof amountOverride === "number" && Number.isFinite(amountOverride)
          ? amountOverride
          : parseFloat(betAmount);
      if (!Number.isFinite(betAmountValue) || betAmountValue < 0.01) {
        setZionBetToast("Invalid amount");
        return null;
      }
      setBetLoading(true);
      try {
        console.log("[BET] handlePlaceCardBet: start", {
          marketId: modalMarket.id,
          direction: modalDirection,
          amount: betAmountValue,
        });
        console.debug("[BET] Step 0: ensure on-chain market…", modalMarket.id);
        const ensureResult = await ensureZionBetMarketOnChain(modalMarket.id, modalMarket.timeframe);
        console.log("[BET] handlePlaceCardBet: ensure done", ensureResult);
        if (ensureResult.warned) {
          console.warn("[BET] ensure_market non-fatal warning:", ensureResult.error);
        }
        console.debug("[BET] Step 1: calling submitZionBetOnChain…", {
          currency: betCurrency,
          amount: betAmountValue,
        });
        setZionBetToast("Approve wallet transaction…");
        console.log("[BET] handlePlaceCardBet: calling submitZionBetOnChain");
        const digest = await submitZionBetOnChain(
          signAndExecute as SignAndExecuteMutateFn,
          suiClientHook as SuiJsonRpcClient,
          {
            marketId: modalMarket.id,
            direction: modalDirection,
            amount: betAmountValue,
            walletAddress: account.address,
            currency: betCurrency,
          }
        );
        console.debug("[BET] Step 2: chain success, digest:", digest);
        const betBody = buildZionBetDbBody({
          wallet: account.address,
          market: modalMarket,
          direction: modalDirection,
          amountSui: betAmountValue,
          currency: betCurrency,
        });
        const data = await postZionBetToDb(betBody);
        if (!data.success) {
          setZionBetToast(
            `On-chain bet succeeded but save failed: ${
              typeof data.error === "string"
                ? data.error
                : typeof data.message === "string"
                  ? data.message
                  : "unknown"
            }. Contact support with TX: ${digest?.slice(0, 12) ?? ""}`
          );
          return null;
        }
        console.debug("[BET] Step 4: DB saved, bet_id:", data.bet_id);
        const dbBetId = data.bet_id ?? 0;
        if (dbBetId && digest) {
          const confirmResult = await confirmZionBetOnChain(dbBetId, digest, account.address);
          if (!confirmResult.ok) {
            console.debug(
              "[BET] confirm_bet did not set on_chain_bet_id — close may show pending ID"
            );
          }
        }
        setBetResult(data);
        setBetModal(null);
        void loadMyBets();
        void loadZionBetStats();
        void loadZionBetMarkets();
        void fetchUsdcBalance();
        void checkVipStatus();
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
        const txLabel = digest ? `${digest.slice(0, 8)}…` : "pending";
        setZionBetToast(`✅ Bet placed! TX: ${txLabel}`);
        const yesCents = Math.round(modalMarket.yes_cents ?? 50);
        const noCents = Math.round(modalMarket.no_cents ?? 100 - yesCents);
        const oddsAtBet = modalDirection ? yesCents : noCents;
        const payout =
          typeof data.potential_payout === "number" && Number.isFinite(data.potential_payout)
            ? data.potential_payout
            : betAmountValue * (100 / oddsAtBet);
        return {
          direction: modalDirection,
          amount: betAmountValue,
          currency: betCurrency,
          odds: oddsAtBet,
          payout,
        };
      } catch (err) {
        console.error("[ZionBet] handlePlaceCardBet failed", err);
        const msg = err instanceof Error ? err.message : "Request failed.";
        if (msg.includes("User rejected") || msg.includes("Rejected")) {
          setZionBetToast("Bet cancelled. Nothing was saved.");
        } else {
          setZionBetToast(msg || "Request failed.");
        }
        return null;
      } finally {
        setBetLoading(false);
      }
    },
    [account?.address, betAmount, betCurrency, signAndExecute, suiClientHook, loadMyBets, loadZionBetMarkets, loadZionBetStats, fetchUsdcBalance, checkVipStatus]
  );

  const handleBankSend = useCallback(async () => {
    if (!account?.address) {
      setBankError("Connect wallet first");
      return;
    }
    if (!bankRecipient.startsWith("0x")) {
      setBankError("Invalid Sui address");
      return;
    }
    if (!bankAmount || parseFloat(bankAmount) <= 0) {
      setBankError("Invalid amount");
      return;
    }
    if (fromToken !== "SUI" && fromToken !== "USDC") {
      setBankError(`${fromToken} not supported — use SUI or USDC`);
      return;
    }

    setBankLoading(true);
    setBankError(null);
    setBankTxHash(null);
    setNotarizeResult(null);
    setInstantReceiptId(null);

    const recordTransfer = (digest: string, token: string) => {
      setBankTxHash(digest);
      setBankLoading(false);
      fetch("/api/bank/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: account.address,
          to: bankRecipient,
          amount: parseFloat(bankAmount),
          token,
          tx_hash: digest,
        }),
      }).catch(() => {});
    };

    try {
      if (fromToken === "SUI") {
        const tx = new Transaction();
        const amountMist = BigInt(
          Math.floor(parseFloat(bankAmount) * 1_000_000_000)
        );
        const [coin] = tx.splitCoins(tx.gas, [amountMist]);
        tx.transferObjects([coin], tx.pure.address(bankRecipient));

        signAndExecute(
          { transaction: tx, chain: "sui:testnet" },
          {
            onSuccess: (result) => recordTransfer(suiTxDigest(result), "SUI"),
            onError: (err) => {
              setBankError(err.message);
              setBankLoading(false);
            },
          }
        );
      } else if (fromToken === "USDC") {
        const coins = await getUsdcCoins(suiClientHook, account.address);

        if (coins.data.length === 0) {
          setBankError("No USDC balance found");
          setBankLoading(false);
          return;
        }

        const amountUsdc = BigInt(Math.floor(parseFloat(bankAmount) * 1_000_000));
        const tx = new Transaction();
        const primaryCoinId = coins.data[0].coinObjectId;

        if (coins.data.length > 1) {
          tx.mergeCoins(
            tx.object(primaryCoinId),
            coins.data.slice(1).map((c) => tx.object(c.coinObjectId))
          );
        }

        const [splitCoin] = tx.splitCoins(tx.object(primaryCoinId), [amountUsdc]);
        tx.transferObjects([splitCoin], tx.pure.address(bankRecipient));

        signAndExecute(
          { transaction: tx, chain: "sui:testnet" },
          {
            onSuccess: (result) => recordTransfer(suiTxDigest(result), "USDC"),
            onError: (err) => {
              setBankError(err.message);
              setBankLoading(false);
            },
          }
        );
      }
    } catch (err: unknown) {
      setBankError(err instanceof Error ? err.message : "Unknown error");
      setBankLoading(false);
    }
  }, [
    account?.address,
    bankRecipient,
    bankAmount,
    fromToken,
    signAndExecute,
    suiClientHook,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("zion_stealth_keys");
    if (!saved) return;
    try {
      const keys = JSON.parse(saved);
      setStealthKeys(keys);
      if (keys.metaAddress) setStealthAddress(keys.metaAddress);
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  const copyStealthAddressToClipboard = useCallback(() => {
    if (!stealthAddress) return;
    void navigator.clipboard.writeText(stealthAddress);
    setCopiedStealth(true);
    setTimeout(() => setCopiedStealth(false), 2000);
  }, [stealthAddress]);

  const stealthPrivacyMax = autoWithdraw && fragmentedWithdraw && useDecoys;

  const handleGenerateStealthAddress = useCallback(() => {
    const keys = generateStealthMetaAddress();
    setStealthKeys(keys);
    setStealthAddress(keys.metaAddress);
    localStorage.setItem("zion_stealth_keys", JSON.stringify(keys));
    setBankError(null);
    setKeysFileStatus(null);
  }, []);

  const handleExportKeys = useCallback(() => {
    if (!stealthKeys) return;
    const data = JSON.stringify(stealthKeys, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "zion-stealth-keys.json";
    a.click();
    URL.revokeObjectURL(url);
    setKeysFileStatus(null);
    setBankError(null);
  }, [stealthKeys]);

  const handleImportKeys = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const keys = JSON.parse(ev.target?.result as string);
          if (keys.metaAddress && keys.spendingPrivKey && keys.viewingPrivKey) {
            setStealthKeys(keys);
            setStealthAddress(keys.metaAddress);
            localStorage.setItem("zion_stealth_keys", JSON.stringify(keys));
            setZbStatus("✅ Keys imported");
            setKeysFileStatus({
              type: "success",
              message: "Keys imported successfully!",
            });
            setBankError(null);
          } else {
            setZbStatus("❌ Invalid keys file");
            setKeysFileStatus({
              type: "error",
              message: "Invalid keys file",
            });
          }
        } catch {
          setZbStatus("❌ Failed to parse keys file");
          setKeysFileStatus({
            type: "error",
            message: "Failed to parse keys file",
          });
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const handleRegisterStealth = useCallback(() => {
    if (!account?.address) {
      setBankError("Connect Sui wallet first");
      return;
    }
    if (!stealthKeys) {
      setBankError("Generate stealth keys first");
      return;
    }
    setStealthRegisterLoading(true);
    setBankError(null);
    try {
      const tx = buildRegisterTransaction(
        stealthKeys.spendingPubKey,
        stealthKeys.viewingPubKey
      );
      signAndExecute(
        { transaction: tx, chain: "sui:testnet" },
        {
          onSuccess: () => {
            setStealthRegisterLoading(false);
            setBankError(null);
          },
          onError: (err) => {
            setBankError("Register failed: " + err.message);
            setStealthRegisterLoading(false);
          },
        }
      );
    } catch (err: unknown) {
      setBankError(err instanceof Error ? err.message : "Register failed");
      setStealthRegisterLoading(false);
    }
  }, [account?.address, stealthKeys, signAndExecute]);

  const handleScan = useCallback(async () => {
    if (!stealthKeys) {
      setBankError("Generate your stealth address first in RECEIVE tab");
      return;
    }
    setStealthScanLoading(true);
    setStealthScanResults([]);
    setBankError(null);

    try {
      const OLD_PACKAGE =
        "0xf9e099a8c77f430461af76689f4cca5d5e5dd0eed2aacdba9077c9d7b3fb986d";
      const NEW_PACKAGE =
        "0x6d31b619bf7bd687a87b276d571109fead5774f3defd32be512b0f081571c084";
      const rpcUrl = "https://fullnode.testnet.sui.io:443";

      const queryStealthSent = (packageId: string) =>
        fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "suix_queryEvents",
            params: [
              { MoveEventType: `${packageId}::stealth::StealthSent` },
              null,
              50,
              false,
            ],
          }),
        });

      const [res1, res2] = await Promise.all([
        queryStealthSent(OLD_PACKAGE),
        queryStealthSent(NEW_PACKAGE),
      ]);
      const events1 = (await res1.json())?.result?.data || [];
      const events2 = (await res2.json())?.result?.data || [];
      const seen = new Set<string>();
      const events = [...events1, ...events2].filter((event: { id?: { txDigest?: string; eventSeq?: string } }) => {
        const key = `${event.id?.txDigest ?? ""}:${event.id?.eventSeq ?? ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const found: {
        stealthAddress: string;
        ephemeralPubKey: string;
        txDigest?: string;
        memoDisplay?: string;
        token?: string;
      }[] = [];
      for (const event of events) {
        const parsed = event.parsedJson;
        if (!parsed) continue;

        const byteArrayToHex = (bytes: number[]) =>
          Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

        const ephemeralPubKeyHex = byteArrayToHex(
          parsed.ephemeral_pubkey as number[]
        );
        const stealthAddrRaw = parsed.stealth_address;
        const stealthAddress =
          typeof stealthAddrRaw === "string"
            ? stealthAddrRaw.startsWith("0x")
              ? stealthAddrRaw
              : `0x${stealthAddrRaw}`
            : `0x${byteArrayToHex(stealthAddrRaw as number[])}`;

        const ismine = checkStealthAddress(
          ephemeralPubKeyHex,
          stealthAddress,
          stealthKeys.viewingPubKey,
          stealthKeys.spendingPubKey
        );

        if (ismine) {
          const memoBytes = parsed.encrypted_memo as number[] | undefined;
          let memoDisplay = "Amount: unknown";
          let token = "SUI";
          if (memoBytes?.length) {
            try {
              const text = new TextDecoder().decode(new Uint8Array(memoBytes));
              const parsedMemo = JSON.parse(text);
              if (Array.isArray(parsedMemo)) {
                memoDisplay = "Amount: encrypted (claim to reveal)";
              } else if (
                parsedMemo &&
                typeof parsedMemo === "object" &&
                parsedMemo.amount != null
              ) {
                if (parsedMemo.token) token = String(parsedMemo.token);
                memoDisplay = `Amount: ${parsedMemo.amount}${
                  parsedMemo.token ? ` ${parsedMemo.token}` : ""
                }`;
              } else {
                memoDisplay = "Amount: encrypted (claim to reveal)";
              }
            } catch {
              memoDisplay = "Amount: encrypted (claim to reveal)";
            }
          }

          found.push({
            txDigest: event.id.txDigest,
            ephemeralPubKey: ephemeralPubKeyHex,
            stealthAddress,
            memoDisplay,
            token,
          });
        }
      }

      setStealthScanResults(found);
      if (found.length === 0) {
        setBankError("No incoming stealth payments found");
      }
    } catch (err: unknown) {
      setBankError(
        "Scan failed: " + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setStealthScanLoading(false);
    }
  }, [stealthKeys]);

  const handleStealthSend = useCallback(async () => {
    if (!account?.address) {
      setBankError("Connect wallet first");
      return;
    }
    if (!stealthMetaInput.startsWith("st:sui:")) {
      setBankError("Enter a valid stealth meta-address (st:sui:...)");
      return;
    }
    if (!bankAmount || parseFloat(bankAmount) <= 0) {
      setBankError("Invalid amount");
      return;
    }
    if (fromToken !== "SUI" && fromToken !== "USDC") {
      setBankError(`${fromToken} not supported — use SUI or USDC`);
      return;
    }

    setBankLoading(true);
    setBankError(null);
    setBankTxHash(null);
    setNotarizeResult(null);
    setInstantReceiptId(null);

    const notarizeAndStoreReceipt = async (
      digest: string,
      stealthAddress: string
    ) => {
      try {
        const instantRes = await fetch("/zco/instant_receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tx_hash: digest, token: fromToken }),
        }).then((r) => r.json());
        const receiptId = instantRes?.receipt_id as string | undefined;
        if (receiptId) {
          setInstantReceiptId(receiptId);
        }

        const notarizeData = await fetch("/zco/notarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tx_hash: digest,
            stealth_address: stealthAddress,
          }),
        }).then((r) => r.json());

        if (notarizeData?.ok) {
          setNotarizeResult({
            ...notarizeData,
            tx_hash: notarizeData.tx_hash || digest,
          });
          if (receiptId) {
            await fetch("/zco/instant_receipt/update", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                receipt_id: receiptId,
                agent: notarizeData.agent,
                agent_class: notarizeData.agent_class,
                decision: notarizeData.decision,
                consensus: notarizeData.consensus,
              }),
            }).catch(() => {});
          }
        }
      } catch {
        /* notarize / walrus optional */
      }
    };

    const gasReserve = 10_000_000; // 0.01 SUI reserved for announce tx

    const announcePayment = (
      ephemeralPubKey: string,
      stealthAddress: string,
      digest: string,
      encryptedMemo: string
    ) => {
      setBankTxHash(digest);
      const announceTx = buildAnnounceTransaction(
        ephemeralPubKey,
        stealthAddress,
        encryptedMemo
      );
      announceTx.setGasBudget(gasReserve);
      signAndExecute(
        { transaction: announceTx, chain: "sui:testnet" },
        {
          onSuccess: () => setBankLoading(false),
          onError: (err) => {
            setBankError("Payment sent but announce failed: " + err.message);
            setBankLoading(false);
          },
        }
      );
    };

    try {
      const { stealthAddress, ephemeralPubKey } =
        computeStealthAddress(stealthMetaInput);

      let encryptedMemo = "";
      try {
        const memoData = {
          amount: bankAmount,
          token: fromToken,
          timestamp: new Date().toISOString(),
        };
        const encrypted = await encryptStealthMemo(
          suiClientHook as SuiJsonRpcClient,
          memoData,
          stealthAddress,
        );
        encryptedMemo = JSON.stringify(Array.from(encrypted));
      } catch (e) {
        console.warn("[Seal encrypt failed, using plain memo]", e);
        encryptedMemo = JSON.stringify({
          amount: bankAmount,
          token: fromToken,
        });
      }

      if (fromToken === "SUI") {
        const tx = new Transaction();
        const amountMist = BigInt(
          Math.floor(parseFloat(bankAmount) * 1_000_000_000)
        );
        // Cap send tx gas so gasReserve remains in wallet for announce
        tx.setGasBudget(5_000_000);
        const [coin] = tx.splitCoins(tx.gas, [amountMist]);
        tx.transferObjects([coin], tx.pure.address(stealthAddress));

        signAndExecute(
          { transaction: tx, chain: "sui:testnet" },
          {
            onSuccess: (result) => {
              const digest = suiTxDigest(result);
              setBankTxHash(digest);
              setBankLoading(false);
              void notarizeAndStoreReceipt(digest, stealthAddress).catch(console.error);
              announcePayment(
                ephemeralPubKey,
                stealthAddress,
                digest,
                encryptedMemo
              );
            },
            onError: (err) => {
              setBankError(err.message);
              setBankLoading(false);
            },
          }
        );
      } else if (fromToken === "USDC") {
        const coins = await getUsdcCoins(suiClientHook, account.address);

        if (coins.data.length === 0) {
          setBankError("No USDC balance found");
          setBankLoading(false);
          return;
        }

        const amountUsdc = BigInt(Math.floor(parseFloat(bankAmount) * 1_000_000));
        const GAS_AMOUNT = BigInt(15_000_000); // 0.015 SUI for stealth claim gas
        const tx = new Transaction();
        tx.setGasBudget(5_000_000); // cap USDC send gas so announce tx has funds
        const primaryCoinId = coins.data[0].coinObjectId;
        const stealthAddr = tx.pure.address(stealthAddress);

        if (coins.data.length > 1) {
          tx.mergeCoins(
            tx.object(primaryCoinId),
            coins.data.slice(1).map((c) => tx.object(c.coinObjectId))
          );
        }

        const [splitUsdc] = tx.splitCoins(tx.object(primaryCoinId), [amountUsdc]);
        tx.transferObjects([splitUsdc], stealthAddr);

        const [gasCoin] = tx.splitCoins(tx.gas, [GAS_AMOUNT]);
        tx.transferObjects([gasCoin], stealthAddr);

        signAndExecute(
          { transaction: tx, chain: "sui:testnet" },
          {
            onSuccess: (result) => {
              const digest = suiTxDigest(result);
              setBankTxHash(digest);
              setBankLoading(false);
              void notarizeAndStoreReceipt(digest, stealthAddress).catch(console.error);
              announcePayment(
                ephemeralPubKey,
                stealthAddress,
                digest,
                encryptedMemo
              );
            },
            onError: (err) => {
              setBankError(err.message);
              setBankLoading(false);
            },
          }
        );
      }
    } catch (err: unknown) {
      setBankError(err instanceof Error ? err.message : "Stealth send failed");
      setBankLoading(false);
    }
  }, [
    account?.address,
    stealthMetaInput,
    bankAmount,
    fromToken,
    signAndExecute,
    suiClientHook,
  ]);

  const bytesToHex = (bytes: Uint8Array): string =>
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  const textToBytes = (value: string): Uint8Array => new TextEncoder().encode(value);

  const addressKeyBytes = (address: string): Uint8Array => {
    const raw = (address || "").trim().toLowerCase();
    const noPrefix = raw.startsWith("0x") ? raw.slice(2) : raw;
    const hexOnly = /^[0-9a-f]+$/.test(noPrefix) && noPrefix.length > 0;
    if (hexOnly) {
      const padded = noPrefix.length % 2 === 0 ? noPrefix : `0${noPrefix}`;
      const out = new Uint8Array(padded.length / 2);
      for (let i = 0; i < padded.length; i += 2) {
        out[i / 2] = parseInt(padded.slice(i, i + 2), 16);
      }
      return out;
    }
    return textToBytes(raw);
  };

  const xorEncryptForAddress = (plainText: string, address: string): string => {
    const plain = textToBytes(plainText);
    const key = addressKeyBytes(address);
    if (key.length === 0) return bytesToHex(plain);
    const out = new Uint8Array(plain.length);
    for (let i = 0; i < plain.length; i += 1) {
      out[i] = plain[i] ^ key[i % key.length];
    }
    return bytesToHex(out);
  };

  const xorDecryptForAddress = (cipherHex: string, address: string): string => {
    const key = addressKeyBytes(address);
    const cleanHex = (cipherHex || "").trim().toLowerCase();
    if (!cleanHex || cleanHex.length % 2 !== 0) return "";
    const inBytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      const n = parseInt(cleanHex.slice(i, i + 2), 16);
      if (Number.isNaN(n)) return "";
      inBytes[i / 2] = n;
    }
    if (key.length === 0) return new TextDecoder().decode(inBytes);
    const out = new Uint8Array(inBytes.length);
    for (let i = 0; i < inBytes.length; i += 1) {
      out[i] = inBytes[i] ^ key[i % key.length];
    }
    return new TextDecoder().decode(out);
  };

  const sha256Hex = async (value: string): Promise<string> => {
    const encoded = textToBytes(value);
    const digest = await crypto.subtle.digest("SHA-256", encoded.buffer as ArrayBuffer);
    return bytesToHex(new Uint8Array(digest));
  };

  const backendBaseUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
  const backendApiUrl = (path: string): string =>
    backendBaseUrl ? `${backendBaseUrl}${path}` : `/api${path}`;

  const STEALTH_PACKAGE =
    "0x003c26d67e9ee0b925556c54b81de39e3bafb0c57e420c30a46bd1eabf44db3a";
  const STEALTH_POOL =
    "0xdaea3f2a4420d400314d99587e09d99acc05bf4cd0d37a23eed86d4a5641c9a5";
  const STEALTH_RELAYER_ADDRESS =
    "0xb193ba40239f9caebbc9b6bf1d7aba2d9ff6f8a26eca4ae74ad610079607265b";
  const IDENTITY_REGISTRY: string =
    "0x3d5d59d8ea16592e76e0d1029205eeb166491c88d6e5b20eaa91df3fb8f05aa3";
  const [identityFee, setIdentityFee] = useState<bigint>(BigInt(3_000_000_000));
  const identityFeeLabel = useMemo(() => {
    const sui = Number(identityFee) / 1e9;
    return sui % 1 === 0 ? String(sui) : sui.toFixed(2).replace(/\.?0+$/, "");
  }, [identityFee]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const obj = await suiClientHook.getObject({
          id: IDENTITY_REGISTRY,
          options: { showContent: true },
        });
        const fee = (obj.data?.content as { fields?: { fee?: string } } | undefined)?.fields?.fee;
        if (!cancelled && fee) setIdentityFee(BigInt(fee));
      } catch (e) {
        console.error("Failed to fetch identity registry fee:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [suiClientHook]);

  const checkIdentityVerification = useCallback(async (): Promise<boolean> => {
    if (!walletAddress) {
      setZkIdentityVerified(false);
      return false;
    }
    try {
      const objects = await suiClientHook.getOwnedObjects({
        owner: walletAddress,
        filter: { StructType: `${STEALTH_PACKAGE}::stealth_pool::ZionHumanNFT` },
        options: { showType: true },
      });
      const hasNFT = objects.data.length > 0;
      setZkIdentityVerified(hasNFT);
      return hasNFT;
    } catch (e) {
      console.error("Identity check failed:", e);
      setZkIdentityVerified(false);
      return false;
    }
  }, [walletAddress, suiClientHook]);

  const handleVerifyIdentity = async () => {
    try {
      setZkIdentityLoading(true);
      console.log("=== VERIFY IDENTITY START ===");
      console.log("STEALTH_PACKAGE:", STEALTH_PACKAGE);
      console.log("IDENTITY_REGISTRY:", IDENTITY_REGISTRY);
      console.log("IDENTITY_FEE:", identityFee.toString());
      console.log("walletAddress:", walletAddress);

      const { Transaction } = await import("@mysten/sui/transactions");
      const tx = new Transaction();

      console.log("Building transaction...");
      tx.setGasBudget(10_000_000);
      const [payment] = tx.splitCoins(tx.gas, [identityFee]);
      console.log("Split coins done");

      tx.moveCall({
        target: `${STEALTH_PACKAGE}::stealth_pool::verify_identity`,
        arguments: [tx.object(IDENTITY_REGISTRY), payment],
      });
      console.log(
        "MoveCall added, target:",
        `${STEALTH_PACKAGE}::stealth_pool::verify_identity`
      );

      signAndExecute(
        { transaction: tx, chain: "sui:testnet" },
        {
          onSuccess: async (result) => {
            console.log("=== TX SUCCESS ===", result);
            await new Promise((r) => setTimeout(r, 4000));
            const hasNFT = await checkIdentityVerification();
            console.log("Has NFT after verify:", hasNFT);
            if (hasNFT) {
              setZkStealthStatus("✅ Identity verified! NFT minted!");
            } else {
              setZkStealthStatus("⚠️ TX sent but NFT not found. Check wallet in a moment.");
            }
            setZkIdentityLoading(false);
          },
          onError: (e) => {
            console.error("=== TX ERROR ===", e);
            setZkStealthStatus("❌ Verification failed: " + String(e));
            setZkIdentityLoading(false);
          },
        }
      );
    } catch (e) {
      console.error("=== BUILD ERROR ===", e);
      setZkStealthStatus("❌ Build error: " + String(e));
      setZkIdentityLoading(false);
    }
  };

  const fetchZkStealthNotes = async () => {
    if (!walletAddress) return;
    try {
      const res1 = await fetch(
        backendApiUrl("/zk-stealth-receive/" + encodeURIComponent(walletAddress))
      );
      const data1 = await res1.json();

      let data2: { success?: boolean; notes?: unknown[] } = { notes: [] };
      if (stealthAddress) {
        const res2 = await fetch(
          backendApiUrl("/zk-stealth-receive/" + encodeURIComponent(stealthAddress))
        );
        data2 = await res2.json();
      }

      const notes1 = data1.success && Array.isArray(data1.notes) ? data1.notes : [];
      const notes2 = data2.success && Array.isArray(data2.notes) ? data2.notes : [];
      const rawNotes = [...notes1, ...notes2];

      const notes = await Promise.all(
        rawNotes.map(
          async (n: {
            id?: number;
            commitment_hash?: string;
            encrypted_note?: string;
            coin_type?: string;
            created_at?: string;
            status?: string;
            encrypted_memo?: string;
          }) => {
            const encrypted_memo = String(n.encrypted_memo ?? "");
            const encrypted_note = String(n.encrypted_note ?? "");
            let decrypted_memo = "";
            if (encrypted_memo) {
              decrypted_memo = await decryptNote(walletAddress, encrypted_memo);
              if (!decrypted_memo) {
                decrypted_memo = await decryptNote(stealthAddress || "", encrypted_memo);
              }
            }

            let noteData = await decryptNote(walletAddress, encrypted_note);
            if (!noteData) {
              noteData = await decryptNote(stealthAddress || "", encrypted_note);
            }
            let amountMist = 0;
            if (noteData?.includes("|")) {
              const parts = noteData.split("|");
              amountMist = parts[3] ? parseInt(parts[3], 10) : 0;
            } else if (encrypted_note.includes("|")) {
              const parts = encrypted_note.split("|");
              amountMist = parts[3] ? parseInt(parts[3], 10) : 0;
            }
            const amount_sui =
              amountMist > 0 ? (amountMist / 1_000_000_000).toFixed(4) : undefined;
            const memo =
              decrypted_memo?.trim() ||
              (encrypted_memo ? "encrypted memo" : undefined);

            return {
              id: Number(n.id),
              commitment_hash: String(n.commitment_hash ?? ""),
              encrypted_note,
              coin_type: String(n.coin_type ?? "SUI"),
              created_at: String(n.created_at ?? ""),
              status: String(n.status ?? "pending"),
              encrypted_memo,
              decrypted_memo,
              amount_sui,
              memo,
            };
          }
        )
      );
      setZkStealthNotes(notes);
      return notes;
    } catch (e) {
      console.error("Failed to fetch stealth notes:", e);
      return [];
    }
  };

  const handleScanStealth = async () => {
    if (!stealthAddress && !walletAddress) {
      setZkStealthStatus("❌ Generate a key or connect wallet first");
      return;
    }
    setZkStealthStatus("🔍 Scanning for incoming payments...");
    try {
      const notes = await fetchZkStealthNotes();
      const pending = (notes || []).filter((n) => n.status === "pending").length;
      setZkStealthStatus(
        pending > 0
          ? `✅ Found ${pending} claimable payment(s)`
          : "✅ Scan complete — no pending payments"
      );
    } catch (e) {
      setZkStealthStatus(
        "❌ Scan failed: " + (e instanceof Error ? e.message : String(e))
      );
    }
  };

  const fetchScheduledPayments = async () => {
    if (!walletAddress) return;
    try {
      const res = await fetch(backendApiUrl("/zk-scheduled-payments/" + encodeURIComponent(walletAddress)));
      const data = await res.json();
      if (data.success) setScheduledPayments(data.payments);
    } catch (e) {
      console.error("Failed to fetch scheduled payments:", e);
    }
  };

  const handleCreateScheduledPayment = async () => {
    try {
      if (!walletAddress) {
        setZkStealthStatus("❌ Connect wallet first");
        return;
      }
      const schedRecipient = (scheduleRecipient || zkStealthRecipient).trim();
      if (!schedRecipient || !schedRecipient.startsWith("st:sui:")) {
        setZkStealthStatus("❌ Enter valid recipient stealth address first");
        return;
      }

      const res = await fetch(backendApiUrl("/zk-schedule-payment"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_address: walletAddress,
          recipient_address: schedRecipient,
          denomination: String(stealthAmount),
          frequency: scheduleFrequency,
          max_payments: parseInt(scheduleMaxPayments) || 0,
          memo: stealthMemo,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setZkStealthStatus(`✅ Scheduled! Next payment: ${new Date(data.next_payment_at).toLocaleDateString()}`);
        await fetchScheduledPayments();
      } else {
        setZkStealthStatus("❌ " + (data.error || "Failed to create schedule"));
      }
    } catch (e) {
      setZkStealthStatus("❌ " + String(e));
    }
  };

  const cancelScheduledPayment = async (id: number) => {
    await fetch(backendApiUrl(`/zk-schedule-payment/${id}`), { method: "DELETE" });
    await fetchScheduledPayments();
  };

  const handleZkStealthSend = async () => {
    if (zkStealthLoading) return;
    if (!account?.address) {
      setZkStealthStatus("❌ Connect wallet first");
      return;
    }

    const recipient = zkStealthRecipient.trim();
    if (!recipient) {
      setZkStealthStatus("❌ Enter valid recipient");
      return;
    }
    if (zkStealthCoin !== "SUI") {
      setZkStealthStatus("❌ ZK Stealth pool deposit currently supports SUI only");
      return;
    }

    setZkStealthLoading(true);
    setAuditTrail(null);
    let handedOffToWallet = false;

    const toBigEndian32 = (n: bigint): number[] => {
      const result: number[] = new Array(32).fill(0);
      let tmp = n;
      for (let i = 31; i >= 0; i--) {
        result[i] = Number(tmp & BigInt(255));
        tmp >>= BigInt(8);
      }
      return result;
    };

    const randomBigIntString = () => {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return BigInt(
        "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
      ).toString();
    };

    const depositPlan =
      stealthAmount === 0.1
        ? { count: 1, fragmentMist: BigInt(100_000_000) }
        : stealthAmount === 1
          ? { count: 10, fragmentMist: BigInt(100_000_000) }
          : { count: 10, fragmentMist: BigInt(1_000_000_000) };

    try {
      const recipientForProof = (() => {
        const r = recipient.trim();
        if (r.startsWith("st:sui:")) {
          const hash = r.replace("st:sui:", "").split(":")[0];
          return BigInt("0x" + hash.slice(0, 32)).toString();
        } else if (r.startsWith("0x")) {
          return BigInt(r).toString();
        }
        return r;
      })();

      let encryptedMemoHex = "";
      if (stealthMemo.trim()) {
        encryptedMemoHex = await encryptNote(recipient, stealthMemo.trim());
      }

      type DepositFragment = {
        commitment: string;
        dbEncryptedNote: string;
        commitmentBytes: number[];
        encNoteBytes: number[];
      };

      const fragments: DepositFragment[] = [];

      for (let i = 0; i < depositPlan.count; i++) {
        setZkStealthStatus(`Depositing fragment ${i + 1}/${depositPlan.count}: generating proof...`);

        const secret = randomBigIntString();
        const blinding = randomBigIntString();
        const amountMist = depositPlan.fragmentMist.toString();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        const proveRes = await fetch(backendApiUrl("/stealth-prove"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret,
            amount: amountMist,
            blinding,
            recipient: recipientForProof,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!proveRes.ok) throw new Error(`HTTP ${proveRes.status}`);
        const proveData = await proveRes.json();
        if (!proveData.success || !proveData.nullifier) {
          throw new Error("Proof failed: " + (proveData.error || "no nullifier"));
        }

        const commitment = String(proveData.commitment ?? "");
        const noteData =
          recipient +
          "|" +
          String(proveData.nullifier) +
          "|" +
          secret +
          "|" +
          amountMist +
          "|" +
          blinding;
        const dbEncryptedNote = await encryptNote(recipient, noteData);

        fragments.push({
          commitment,
          dbEncryptedNote,
          commitmentBytes: toBigEndian32(BigInt(commitment)),
          encNoteBytes: toBigEndian32(BigInt(String(proveData.nullifier))),
        });
      }

      setZkStealthStatus(
        `Building transaction — ${depositPlan.count} deposit(s) (sign in wallet)...`
      );

      const tx = new Transaction();
      const mistAmounts = fragments.map(() => depositPlan.fragmentMist);
      const coins = tx.splitCoins(
        tx.gas,
        mistAmounts.map((m) => tx.pure.u64(m))
      );

      for (let i = 0; i < fragments.length; i++) {
        tx.moveCall({
          target: `${STEALTH_PACKAGE}::stealth_pool::deposit`,
          arguments: [
            tx.object(STEALTH_POOL),
            coins[i],
            tx.pure.vector("u8", fragments[i].commitmentBytes),
            tx.pure.vector("u8", fragments[i].encNoteBytes),
          ],
        });
      }
      tx.setGasBudget(Math.max(50_000_000, 15_000_000 * depositPlan.count));

      handedOffToWallet = true;
      signAndExecute(
        { transaction: tx, chain: "sui:testnet" },
        {
          onSuccess: async (result) => {
            try {
              const digest = suiTxDigest(result);
              for (let i = 0; i < fragments.length; i++) {
                setZkStealthStatus(`Saving fragment ${i + 1}/${fragments.length}...`);
                const res = await fetch(backendApiUrl("/zk-stealth-deposit"), {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    commitment_hash: fragments[i].commitment,
                    encrypted_note: fragments[i].dbEncryptedNote,
                    recipient_address: recipient,
                    sender_address: walletAddress,
                    coin_type: zkStealthCoin,
                    auto_withdraw: autoWithdraw,
                    encrypted_memo: i === 0 ? encryptedMemoHex || undefined : undefined,
                  }),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (!data.success) throw new Error(data.error || "Deposit failed");
              }

              setZkStealthStatus(
                `✅ ZK Stealth deposit complete! ${fragments.length} note(s), TX: ${digest || "submitted"}`
              );
              setZbTxDigest(digest);
              playSwish();
              setZkStealthRecipient("");
              setStealthMemo("");

              try {
                const auditRes = await fetch("/api/audit/create-trail", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    sender_address: walletAddress,
                    recipient_address: recipient,
                    amount: stealthAmount,
                    coin_type: "SUI",
                    relayer_path: ["relayer-pool-1", "relayer-pool-2", "relayer-pool-3"],
                    tx_digest: digest,
                    commitment_hash: fragments[0]?.commitment || "zk-proof",
                  }),
                });
                const auditData = await auditRes.json();
                if (auditData.success) {
                  setAuditTrail(auditData);
                }
              } catch (e) {
                console.error("Audit trail error:", e);
              }
            } catch (e: unknown) {
              setZkStealthStatus(`❌ ${e instanceof Error ? e.message : String(e)}`);
            } finally {
              setZkStealthLoading(false);
            }
          },
          onError: (e) => {
            setZkStealthStatus("❌ " + (e.message || String(e)));
            setZkStealthLoading(false);
          },
        }
      );
    } catch (e) {
      console.error("[ZkStealthSend] error:", e);
      const msg =
        e instanceof Error && e.name === "AbortError"
          ? "Proof request timed out after 60 seconds"
          : e instanceof Error
            ? e.message
            : String(e);
      setZkStealthStatus("❌ " + msg);
    } finally {
      if (!handedOffToWallet) {
        setZkStealthLoading(false);
      }
    }
  };

  const handleZkStealthMultiSend = async () => {
    if (zkStealthLoading) return;
    if (!account?.address) {
      setZkStealthStatus("❌ Connect wallet first");
      return;
    }
    if (zkStealthCoin !== "SUI") {
      setZkStealthStatus("❌ ZK Stealth pool deposit currently supports SUI only");
      return;
    }

    try {
      setZkStealthLoading(true);
      setZkStealthStatus("Processing multi-send...");

      const validRecipients = multiRecipients.filter((r) => r.address.trim().length === 66);
      if (validRecipients.length === 0) {
        setZkStealthStatus("❌ Add at least one valid recipient address");
        return;
      }

      const results: Array<{ recipient: string; denomination: string; commitment: string }> = [];

      const toBigEndian32 = (n: bigint): number[] => {
        const result: number[] = new Array(32).fill(0);
        let tmp = n;
        for (let j = 31; j >= 0; j--) {
          result[j] = Number(tmp & BigInt(255));
          tmp >>= BigInt(8);
        }
        return result;
      };

      const recipientForProof = (addr: string) => {
        const r = addr.trim();
        if (r.startsWith("st:sui:")) {
          const hash = r.replace("st:sui:", "").split(":")[0];
          return BigInt("0x" + hash.slice(0, 32)).toString();
        }
        if (r.startsWith("0x")) {
          return BigInt(r).toString();
        }
        return r;
      };

      const poolOwner = await fetchStealthPoolOwner(suiClientHook, STEALTH_POOL);
      if (poolOwner.kind === "owned") {
        setZkStealthStatus(
          `❌ Stealth pool is owned by ${poolOwner.address} (not shared). Backend relayer deposit required.`
        );
        return;
      }

      for (let i = 0; i < validRecipients.length; i++) {
        const r = validRecipients[i];
        setZkStealthStatus(`Sending to recipient ${i + 1}/${validRecipients.length}...`);

        const amountMist = Math.floor(parseFloat(r.denomination) * 1e9).toString();

        const secretBytes = new Uint8Array(16);
        crypto.getRandomValues(secretBytes);
        const secret = BigInt(
          "0x" + Array.from(secretBytes).map((b) => b.toString(16).padStart(2, "0")).join("")
        ).toString();

        const blindingBytes = new Uint8Array(16);
        crypto.getRandomValues(blindingBytes);
        const blinding = BigInt(
          "0x" + Array.from(blindingBytes).map((b) => b.toString(16).padStart(2, "0")).join("")
        ).toString();

        const proveRes = await fetch(backendApiUrl("/stealth-prove"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret,
            amount: amountMist,
            blinding,
            recipient: recipientForProof(r.address),
          }),
        });
        const proveData = await proveRes.json();
        if (!proveData.success || !proveData.nullifier) {
          throw new Error(`Proof failed for recipient ${i + 1}: ${proveData.error || "unknown"}`);
        }

        const commitment = String(proveData.commitment ?? "");
        const nullifier = String(proveData.nullifier);
        const commitmentBytes = toBigEndian32(BigInt(commitment));
        const nullifierBytes = toBigEndian32(BigInt(nullifier));

        const noteData = `${r.address}|${nullifier}|${secret}|${amountMist}|${blinding}`;
        const encryptedNote = await encryptNote(r.address, noteData);

        const coins = await suiClientHook.getCoins({
          owner: account.address,
          coinType: "0x2::sui::SUI",
        });
        if (!coins.data?.length) {
          throw new Error("No SUI in wallet. Get testnet SUI from faucet.");
        }

        const tx = new Transaction();
        const poolArg = tx.sharedObjectRef({
          objectId: STEALTH_POOL,
          initialSharedVersion: poolOwner.initialSharedVersion,
          mutable: true,
        });
        const [depositCoin] = tx.splitCoins(tx.gas, [BigInt(amountMist)]);
        tx.moveCall({
          target: `${STEALTH_PACKAGE}::stealth_pool::deposit`,
          arguments: [
            poolArg,
            depositCoin,
            tx.pure(bcs.vector(bcs.u8()).serialize(commitmentBytes).toBytes()),
            tx.pure(bcs.vector(bcs.u8()).serialize(nullifierBytes).toBytes()),
          ],
        });
        tx.setGasBudget(50_000_000);

        await new Promise<void>((resolve, reject) => {
          signAndExecute(
            { transaction: tx, chain: "sui:testnet" },
            {
              onSuccess: async (result) => {
                try {
                  const digest = suiTxDigest(result);
                  const res = await fetch(backendApiUrl("/zk-stealth-deposit"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      commitment_hash: commitment,
                      encrypted_note: encryptedNote,
                      recipient_address: r.address,
                      sender_address: walletAddress,
                      coin_type: zkStealthCoin,
                      auto_withdraw: autoWithdraw,
                    }),
                  });
                  if (!res.ok) throw new Error(`HTTP ${res.status}`);
                  const data = await res.json();
                  if (!data.success) throw new Error(data.error || "Deposit failed");

                  results.push({
                    recipient: r.address,
                    denomination: r.denomination,
                    commitment,
                  });
                  setZbTxDigest(digest);
                  playSwish();
                  resolve();
                } catch (e: unknown) {
                  reject(e);
                }
              },
              onError: (e) => reject(e),
            }
          );
        });

        if (i < validRecipients.length - 1) {
          await new Promise((res) => setTimeout(res, 2000));
        }
      }

      setZkStealthStatus(
        `✅ Multi-send complete! ${results.length} recipients notified anonymously.`
      );
      setMultiRecipients([{ address: "", denomination: "0.1" }]);
    } catch (e) {
      setZkStealthStatus("❌ " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setZkStealthLoading(false);
    }
  };

  const claimSingleNote = async (note: {
    id: number;
    commitment_hash: string;
    encrypted_note: string;
    coin_type: string;
  }): Promise<{
    success: boolean;
    amount?: number;
    digest?: string;
    error?: string;
    results?: Array<{ digest: string; amount: number; from?: string }>;
  }> => {
    const commitmentHash = String(note.commitment_hash ?? "").trim();
    const recipientAddress = (walletAddress || "").trim();

    let nullifier = "";
    let noteAmount = Math.floor(stealthAmount * 1e9);

    let noteData = await decryptNote(walletAddress, note.encrypted_note);

    if (!noteData) {
      noteData = await decryptNote(stealthAddress || "", note.encrypted_note);
    }

    if (!noteData || !noteData.includes("|")) {
      const parts = note.encrypted_note.split("|");
      nullifier = (parts[1] || "").trim();
      noteAmount = parts[3] ? parseInt(parts[3], 10) : noteAmount;
    } else {
      const parts = noteData.split("|");
      nullifier = (parts[1] || "").trim();
      noteAmount = parts[3] ? parseInt(parts[3], 10) : noteAmount;
    }

    if (!commitmentHash || !nullifier || !recipientAddress) {
      return {
        success: false,
        error:
          "Missing data: commitment=" +
          (commitmentHash ? "ok" : "empty") +
          " nullifier=" +
          (nullifier ? "ok" : "empty") +
          " wallet=" +
          (recipientAddress ? "ok" : "empty"),
      };
    }

    const claimAmount = noteAmount;
    if (!claimAmount || Number.isNaN(claimAmount)) {
      return { success: false, error: "Invalid claim amount" };
    }

    const messageToSign = "ZION STEALTH CLAIM: " + commitmentHash;
    const { signature } = await signMessage({
      message: new TextEncoder().encode(messageToSign),
    });

    const claimBody = {
      commitment_hash: commitmentHash,
      nullifier,
      recipient_address: recipientAddress,
      amount: claimAmount,
      wallet_signature: signature,
      signed_message: messageToSign,
      with_decoys: useDecoys,
      num_decoys: 5,
    };

    const claimEndpoint = fragmentedWithdraw
      ? "/zk-stealth-fragmented-withdraw"
      : "/zk-stealth-relayer-withdraw";

    const res = await fetch(backendApiUrl(claimEndpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(claimBody),
    });
    const data = await res.json();

    if (!data.success) {
      return { success: false, error: data.error || "Unknown" };
    }

    const results: Array<{ digest: string; amount: number; from?: string }> = [];
    const relayerAddress =
      typeof data.relayer === "string"
        ? data.relayer
        : typeof data.relayer_address === "string"
          ? data.relayer_address
          : STEALTH_RELAYER_ADDRESS;

    if (fragmentedWithdraw && Array.isArray(data.fragments)) {
      for (const f of data.fragments as Array<{
        relayer?: string;
        amount?: number;
        digest?: string;
        status?: string;
      }>) {
        if (f.digest && f.status !== "failed") {
          results.push({
            digest: String(f.digest),
            amount: (f.amount || 0) / 1_000_000_000,
            from: f.relayer || relayerAddress,
          });
        }
      }
    } else if (data.digest) {
      results.push({
        digest: String(data.digest),
        amount: claimAmount / 1_000_000_000,
        from: relayerAddress,
      });
    }

    const totalAmount = results.reduce((sum, r) => sum + r.amount, 0);

    return {
      success: true,
      amount: totalAmount,
      digest: results[0]?.digest || data.digest,
      results,
    };
  };

  const handleZkStealthClaim = async (note: {
    id: number;
    commitment_hash: string;
    encrypted_note: string;
    coin_type: string;
  }) => {
    try {
      setZkStealthStatus("Claiming via relayer...");
      setZkStealthClaimDigest("");

      setZkStealthStatus("Sign claim message in wallet...");
      const result = await claimSingleNote(note);

      if (result.success) {
        if (result.results?.length) {
          setClaimResults((prev) => [...prev, ...result.results!]);
        }
        setZkStealthClaimDigest(result.digest || "");

        setZkStealthStatus(
          fragmentedWithdraw
            ? `✅ Fragmented claim complete! ${(result.amount || 0).toFixed(4)} SUI`
            : "✅ Claimed! Funds sent via relayer — sender identity hidden!\n" +
                (result.digest ? `TX: ${result.digest}` : "")
        );
        await fetchZkStealthNotes();
      } else {
        setZkStealthClaimDigest("");
        setZkStealthStatus("❌ Claim failed: " + (result.error || "Unknown"));
      }
    } catch (e) {
      setZkStealthClaimDigest("");
      setZkStealthStatus("❌ Error: " + String(e));
    }
  };

  const handleClaimAll = async () => {
    const pendingNotes = zkStealthNotes.filter((n) => n.status === "pending");
    if (!pendingNotes.length) return;

    setZkClaimLoading(true);
    setZkClaimStatus("Preparing batch claim...");
    setClaimResults([]);

    try {
      const recipientAddress = (walletAddress || "").trim();
      if (!recipientAddress) {
        setZkClaimStatus("❌ Connect wallet first");
        return;
      }

      const message = `claim_all_${pendingNotes.map((n) => n.commitment_hash).join("_")}`;

      setZkClaimStatus("Sign once to claim all notes...");
      setZkStealthStatus("Sign once to claim all notes in wallet...");

      const { signature } = await signMessage({
        message: new TextEncoder().encode(message),
      });

      setZkClaimStatus(`Claiming ${pendingNotes.length} notes with 1 signature...`);

      const res = await fetch(backendApiUrl("/zk-stealth-batch-claim"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: pendingNotes.map((n) => ({
            commitment_hash: n.commitment_hash,
          })),
          recipient_address: recipientAddress,
          wallet_signature: signature,
          signed_message: message,
          with_decoys: useDecoys,
          num_decoys: 5,
        }),
      });

      const data = await res.json();

      if (data.success) {
        const mapped: Array<{ digest: string; amount: number; from?: string }> = (
          data.results || []
        )
          .filter((r: { success?: boolean; digest?: string }) => r.success && r.digest)
          .map(
            (r: {
              digest?: string;
              amount?: number | string;
              relayer?: string;
            }) => ({
              digest: String(r.digest),
              amount: (Number(r.amount) || 0) / 1_000_000_000,
              from: r.relayer || STEALTH_RELAYER_ADDRESS,
            })
          );

        if (mapped.length) {
          setClaimResults(
            mapped.map((r) => ({ ...r, success: true, relayer: r.from }))
          );
          setZkStealthClaimDigest(mapped[0]?.digest || "");
          playCork();
          setTimeout(() => {
            setClaimResults([]);
            setClaimResultsExpanded(false);
          }, 15000);
        }

        const successCount = data.successful_count ?? mapped.length;
        const totalSui = mapped.reduce((sum: number, r) => sum + r.amount, 0);
        setZkClaimStatus(
          `✅ Claimed ${successCount}/${pendingNotes.length} notes (${totalSui.toFixed(4)} SUI)!`
        );
        setZkStealthStatus(`✅ Batch claim complete — ${successCount}/${pendingNotes.length} notes`);
      } else {
        setZkClaimStatus(`❌ Batch claim failed: ${data.error || "Unknown error"}`);
        setZkStealthStatus(`❌ Batch claim failed: ${data.error || "Unknown error"}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setZkClaimStatus(`❌ Batch claim failed: ${msg}`);
      setZkStealthStatus(`❌ Batch claim failed: ${msg}`);
    } finally {
      setZkClaimLoading(false);
      await fetchZkStealthNotes();
    }
  };

  const handleCrossDenomMix = async () => {
    if (!crossDenom || zkStealthNotes.length === 0) return;
    try {
      setZkStealthStatus("Preparing cross-denomination mix...");

      const decryptKey = stealthAddress || walletAddress;
      const notesPayload = [];

      for (const note of zkStealthNotes) {
        const isOldFormat = note.encrypted_note.includes("|");
        let nullifier = "";
        let secret = "";
        let blinding = "";
        let amount = 0;

        if (isOldFormat) {
          const parts = note.encrypted_note.split("|");
          nullifier = (parts[1] || "").trim();
          secret = (parts[2] || "").trim();
          blinding = (parts[4] || "").trim();
          amount = parts[3] ? parseInt(parts[3], 10) : 0;
        } else {
          const decrypted = await decryptNote(decryptKey, note.encrypted_note);
          const parts = decrypted.split("|");
          nullifier = (parts[1] || "").trim();
          secret = (parts[2] || "").trim();
          blinding = (parts[4] || "").trim();
          amount = parts[3] ? parseInt(parts[3], 10) : 0;
        }

        notesPayload.push({
          commitment_hash: note.commitment_hash,
          nullifier,
          secret,
          blinding,
          amount,
        });
      }

      const addresses = outputAddresses
        .split("\n")
        .map((a) => a.trim())
        .filter(Boolean);

      const res = await fetch(backendApiUrl("/zk-stealth-cross-denom"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notesPayload,
          recipient: walletAddress,
          output_denomination: outputDenom,
          output_addresses: addresses.length ? addresses : undefined,
        }),
      });
      const data = await res.json();

      if (data.success) {
        const lines = (data.results || [])
          .map(
            (r: { recipient?: string; amount?: number; digest?: string }) =>
              `${r.recipient?.slice(0, 10)}... → ${((r.amount || 0) / 1e9).toFixed(2)} SUI`
          )
          .join("\n");
        setZkStealthStatus(
          `✅ Cross-denom mix complete!\n${lines || `Outputs: ${data.numOutputs}, total: ${((data.total || 0) / 1e9).toFixed(2)} SUI`}`
        );
        await fetchZkStealthNotes();
      } else {
        setZkStealthStatus("❌ Cross-denom failed: " + (data.error || "Unknown"));
      }
    } catch (e) {
      setZkStealthStatus("❌ Cross-denom error: " + String(e));
    }
  };

  const handleZbTransfer = async () => {
    if (!anonymousAmount || !zbRecipient || zbLoading) return;
    setZbLoading(true);
    setZbTxDigest('');
    setZbStatus('');

    let recipient = zbRecipient.trim();
    if (!recipient.startsWith('0x')) recipient = '0x' + recipient;
    if (recipient.length < 66) {
      setZbStatus(`❌ Invalid address - ${recipient.length}/66 chars (0x + 64 hex)`);
      setZbLoading(false);
      return;
    }

    const normalizedAmount = String(anonymousAmount).replace(',', '.');
    const parsedAmount = parseFloat(normalizedAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setZbStatus('❌ Invalid amount');
      setZbLoading(false);
      return;
    }

    try {
      if (zbTab === 'stealth') {
        if (!account?.address) {
          setZbStatus('❌ Connect wallet first');
          setZbLoading(false);
          return;
        }

        setZbStatus('Generating stealth deposit proof...');
        const randomBytes = new Uint8Array(32);
        crypto.getRandomValues(randomBytes);
        const secretHex = bytesToHex(randomBytes);
        const commitmentHash = await sha256Hex(`${secretHex}:${normalizedAmount}:${recipient}`);

        const proveRes = await fetch(backendApiUrl('/conf-deposit-prove-only'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: parsedAmount,
            coin_type: zbCoin,
            recipient,
          }),
        });
        if (!proveRes.ok) throw new Error(`HTTP ${proveRes.status}`);
        const proveData = await proveRes.json();
        if (!proveData.success) throw new Error(proveData.error || 'Proof generation failed');

        setZbStatus('Please sign stealth pool deposit...');

        const amountMist =
          zbCoin === 'SUI'
            ? Math.floor(parsedAmount * 1_000_000_000)
            : Math.floor(parsedAmount * 1_000_000);
        const proofBytes = Array.isArray(proveData.proof_bytes) ? proveData.proof_bytes : [];
        const pubBytes = Array.isArray(proveData.pub_bytes) ? proveData.pub_bytes : [];
        const commitmentBytes = Array.isArray(proveData.commitment_bytes) ? proveData.commitment_bytes : [];

        const tx = new Transaction();
        if (zbCoin === 'SUI') {
          const suiCoins = await suiClientHook.getCoins({
            owner: account.address,
            coinType: '0x2::sui::SUI',
          });
          if (!suiCoins.data?.length) {
            throw new Error('No SUI in wallet. Get testnet SUI from faucet.');
          }
          const [depositCoin] = tx.splitCoins(tx.gas, [BigInt(amountMist)]);
          tx.moveCall({
            target: proveData.package + '::confidential_coin::deposit',
            typeArguments: [proveData.coin_type],
            arguments: [
              tx.object(proveData.pool),
              depositCoin,
              tx.pure.vector('u8', commitmentBytes),
              tx.pure.vector('u8', [1, 2, 3]),
              tx.pure.vector('u8', proofBytes),
              tx.pure.vector('u8', pubBytes),
            ],
          });
        } else {
          const rpcRes = await fetch('https://fullnode.testnet.sui.io:443', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'suix_getCoins',
              params: [account.address, USDC_TYPE_TESTNET, null, 10],
            }),
          });
          const rpcData = await rpcRes.json();
          const usdcCoins = rpcData.result?.data || [];
          if (usdcCoins.length === 0) {
            throw new Error('No USDC found in wallet. Get testnet USDC from faucet.sui.io');
          }
          if (usdcCoins.length > 1) {
            tx.mergeCoins(
              tx.object(usdcCoins[0].coinObjectId),
              usdcCoins.slice(1).map((c: { coinObjectId: string }) => tx.object(c.coinObjectId))
            );
          }
          const [depositCoin] = tx.splitCoins(tx.object(usdcCoins[0].coinObjectId), [BigInt(amountMist)]);
          tx.moveCall({
            target: proveData.package + '::confidential_coin::deposit',
            typeArguments: [proveData.coin_type],
            arguments: [
              tx.object(proveData.pool),
              depositCoin,
              tx.pure.vector('u8', commitmentBytes),
              tx.pure.vector('u8', [1, 2, 3]),
              tx.pure.vector('u8', proofBytes),
              tx.pure.vector('u8', pubBytes),
            ],
          });
        }
        tx.setGasBudget(50000000);

        const txDigest = await new Promise<string>((resolve, reject) => {
          signAndExecute(
            { transaction: tx, chain: 'sui:testnet' },
            {
              onSuccess: (result) => resolve(suiTxDigest(result)),
              onError: (error) => reject(error),
            }
          );
        });

        setZbTxDigest(txDigest);
        setZbStatus('✅ Stealth deposit sent (confidential pool — use ZK STEALTH tab for claimable notes)');

      } else if (zbTab === 'zk' || zbTab === 'zkstealth') {
        if (!account?.address) {
          setZbStatus('❌ Connect wallet first');
          setZbLoading(false);
          return;
        }

        const successLabel = zbTab === 'zk' ? '✅ ZK transfer sent' : '✅ ZK Stealth sent';
        setZbStatus(zbTab === 'zk' ? 'Generating ZK proof...' : 'Generating ZK proof + stealth...');
        const res = await fetch('/api/zk-prove-only', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: parsedAmount, recipient, coin: zbCoin }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const proofData = await res.json();
        if (!proofData.success) throw new Error(proofData.error || 'Proof generation failed');

        setZbStatus('Please sign in your wallet...');

        const amountMist = BigInt(
          zbCoin === 'SUI'
            ? Math.floor(parsedAmount * 1_000_000_000)
            : Math.floor(parsedAmount * 1_000_000)
        );
        const coinTypeArg =
          zbCoin === 'SUI' ? '0x2::sui::SUI' : USDC_TYPE_TESTNET;
        const proofBytes = Array.isArray(proofData.proof_bytes) ? proofData.proof_bytes : [];
        const pubBytes = Array.isArray(proofData.pub_bytes) ? proofData.pub_bytes : [];
        const nullBytes = Array.isArray(proofData.null_bytes) ? proofData.null_bytes : [];

        const tx = new Transaction();
        let transferCoin;

        if (zbCoin === 'SUI') {
          const suiCoins = await suiClientHook.getCoins({
            owner: account.address,
            coinType: '0x2::sui::SUI',
          });
          console.log('[ZbTransfer] SUI coins:', suiCoins.data?.map((c) => ({
            id: c.coinObjectId,
            bal: c.balance,
          })));
          if (!suiCoins.data?.length) {
            throw new Error('No SUI in wallet. Get testnet SUI from faucet.');
          }
          [transferCoin] = tx.splitCoins(tx.gas, [amountMist]);
        } else {
          const rpcRes = await fetch('https://fullnode.testnet.sui.io:443', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'suix_getCoins',
              params: [account.address, USDC_TYPE_TESTNET, null, 10],
            }),
          });
          const rpcData = await rpcRes.json();
          const usdcCoins = rpcData.result?.data || [];
          if (usdcCoins.length === 0) {
            throw new Error('No USDC found in wallet. Get testnet USDC from faucet.sui.io');
          }
          if (usdcCoins.length > 1) {
            tx.mergeCoins(
              tx.object(usdcCoins[0].coinObjectId),
              usdcCoins.slice(1).map((c: { coinObjectId: string }) => tx.object(c.coinObjectId))
            );
          }
          [transferCoin] = tx.splitCoins(tx.object(usdcCoins[0].coinObjectId), [amountMist]);
        }

        tx.moveCall({
          target: '0xc4004b794418504e90b9384eb1d70ba9a4dd5ec748cba598adcd9c103ed70312::zk_transfer::private_transfer',
          typeArguments: [coinTypeArg],
          arguments: [
            transferCoin,
            tx.pure.vector('u8', proofBytes),
            tx.pure.vector('u8', pubBytes),
            tx.pure.vector('u8', nullBytes),
            tx.object('0xf0d723052d412b9e69bf06b5741aaece164d9cd938460428b76d4b76b080b767'),
            tx.object('0x8a081cdd06eeb6f1c6996425a636a422117e47ca945784b224d576f5364d11f4'),
            tx.pure.address(recipient),
          ],
        });
        tx.setGasBudget(50000000);

        signAndExecute(
          { transaction: tx, chain: 'sui:testnet' },
          {
            onSuccess: (result) => {
              setZbTxDigest(suiTxDigest(result));
              setZbStatus(successLabel);
              setZbLoading(false);
              if (zbTab === 'zk') {
                void fetch(backendApiUrl('/zk-anonymous-privacy'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    recipient,
                    amount: parsedAmount,
                    coin: zbCoin,
                    with_decoys: true,
                    fragmented: true,
                    num_decoys: 5,
                  }),
                }).catch(() => {});
              }
            },
            onError: (error) => {
              setZbStatus('❌ ' + error.message);
              setZbLoading(false);
            },
          }
        );
        return;
      }
    } catch(e:any) { setZbStatus('❌ ' + e.message); }
    setZbLoading(false);
  };

  const handleConfidential = async () => {
    if (!confAmount || confLoading) return;
    setConfLoading(true);
    setConfStatus('');
    setConfTxDigest('');

    try {
      if (!account?.address) {
        setConfStatus('❌ Connect wallet first');
        setConfLoading(false);
        return;
      }

      const normalizedAmount = confAmount.replace(',', '.');
      const parsedAmount = parseFloat(normalizedAmount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) throw new Error('Invalid amount');

      if (confTab === 'deposit') {
        setConfStatus('⏳ Generating ZK proof...');
        const res = await fetch('/api/conf-deposit-prove-only', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: parsedAmount, recipient: "0x3d5d59d8ea16592e76e0d1029205eeb166491c88d6e5b20eaa91df3fb8f05aa3", coin: confCoin }),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        setConfStatus('🔐 Please sign in wallet...');

        const amountMist =
          confCoin === 'SUI'
            ? Math.floor(parsedAmount * 1_000_000_000)
            : Math.floor(parsedAmount * 1_000_000);

        const proofBytes = Array.isArray(data.proof_bytes) ? data.proof_bytes : [];
        const pubBytes = Array.isArray(data.pub_bytes) ? data.pub_bytes : [];
        const commitmentBytes = Array.isArray(data.commitment_bytes) ? data.commitment_bytes : [];

        const tx = new Transaction();
        const walletAddress = account.address;

        if (confCoin === 'SUI') {
          const suiCoins = await suiClientHook.getCoins({
            owner: walletAddress,
            coinType: '0x2::sui::SUI',
          });
          if (!suiCoins.data?.length) {
            throw new Error('No SUI in wallet. Get testnet SUI from faucet.');
          }
          const [depositCoin] = tx.splitCoins(tx.gas, [BigInt(amountMist)]);
          tx.moveCall({
            target: data.package + '::confidential_coin::deposit',
            typeArguments: [data.coin_type],
            arguments: [
              tx.object(data.pool),
              depositCoin,
              tx.pure.vector('u8', commitmentBytes),
              tx.pure.vector('u8', [1, 2, 3]),
              tx.pure.vector('u8', proofBytes),
              tx.pure.vector('u8', pubBytes),
            ],
          });
        } else {
          if (!walletAddress) throw new Error('Wallet not connected');

          const rpcRes = await fetch('https://fullnode.testnet.sui.io:443', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'suix_getCoins',
              params: [walletAddress, USDC_TYPE_TESTNET, null, 10],
            }),
          });
          const rpcData = await rpcRes.json();
          const usdcCoins = rpcData.result?.data || [];
          console.log('USDC coins found:', usdcCoins.length, 'for address:', walletAddress);

          if (usdcCoins.length === 0) {
            throw new Error('No USDC found in wallet. Get testnet USDC from faucet.sui.io');
          }

          if (usdcCoins.length > 1) {
            tx.mergeCoins(
              tx.object(usdcCoins[0].coinObjectId),
              usdcCoins.slice(1).map((c: { coinObjectId: string }) => tx.object(c.coinObjectId))
            );
          }

          const [depositCoin] = tx.splitCoins(
            tx.object(usdcCoins[0].coinObjectId),
            [BigInt(amountMist)]
          );

          tx.moveCall({
            target: data.package + '::confidential_coin::deposit',
            typeArguments: [data.coin_type],
            arguments: [
              tx.object(data.pool),
              depositCoin,
              tx.pure.vector('u8', commitmentBytes),
              tx.pure.vector('u8', [1, 2, 3]),
              tx.pure.vector('u8', proofBytes),
              tx.pure.vector('u8', pubBytes),
            ],
          });
        }
        tx.setGasBudget(50000000);

        signAndExecute(
          { transaction: tx, chain: 'sui:testnet' },
          {
            onSuccess: (result) => {
              const digest = suiTxDigest(result);
              const key = 'zion_bf_' + digest;
              localStorage.setItem(
                key,
                JSON.stringify({
                  blinding_factor: data.blinding_factor,
                  amount: parsedAmount,
                  coin: confCoin,
                  timestamp: Date.now(),
                  digest,
                })
              );
              const list = JSON.parse(localStorage.getItem('zion_conf_deposits') || '[]');
              list.push({
                digest,
                amount: parsedAmount,
                coin: confCoin,
                timestamp: Date.now(),
              });
              localStorage.setItem('zion_conf_deposits', JSON.stringify(list));

              setConfTxDigest(digest);
              setConfStatus('✅ Confidential deposit sent! Blinding factor saved locally.');
              setConfLoading(false);
            },
            onError: (err) => {
              setConfStatus('❌ ' + err.message);
              setConfLoading(false);
            },
          }
        );
        return;
      }

      // WITHDRAW
      if (!confBlinding) {
        setConfStatus('❌ Enter blinding factor');
        setConfLoading(false);
        return;
      }

      setConfStatus('⏳ Generating withdraw proof...');
      const amountMist =
        confCoin === 'SUI'
          ? Math.floor(parsedAmount * 1_000_000_000)
          : Math.floor(parsedAmount * 1_000_000);

      const res = await fetch('/api/conf-withdraw-prove-only', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_mist: amountMist,
          blinding_factor: confBlinding,
          coin_type: confCoin,
        }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setConfStatus('🔐 Please sign in wallet...');

      const walletAddress = account.address;
      const coinTypeStr = data.coin_type;
      const structType =
        data.package + '::confidential_coin::ConfidentialCoin<' + coinTypeStr + '>';

      const objects = await suiClientHook.getOwnedObjects({
        owner: walletAddress,
        filter: { StructType: structType },
        options: { showContent: true },
      });

      if (objects.data.length === 0) throw new Error('No ConfidentialCoin found in wallet');
      const confCoinId = objects.data[0].data?.objectId;
      if (!confCoinId) throw new Error('ConfidentialCoin objectId not found');

      const nullifierBytes = Array.isArray(data.nullifier_bytes) ? data.nullifier_bytes : [];
      const proofBytes = Array.isArray(data.proof_bytes) ? data.proof_bytes : [];
      const pubBytes = Array.isArray(data.pub_bytes) ? data.pub_bytes : [];

      const tx = new Transaction();
      tx.moveCall({
        target: data.package + '::confidential_coin::withdraw',
        typeArguments: [coinTypeStr],
        arguments: [
          tx.object(data.pool),
          tx.object(confCoinId),
          tx.pure.u64(amountMist),
          tx.pure.vector('u8', nullifierBytes),
          tx.pure.vector('u8', proofBytes),
          tx.pure.vector('u8', pubBytes),
          tx.pure.address(walletAddress),
        ],
      });
      tx.setGasBudget(50000000);

      signAndExecute(
        { transaction: tx, chain: 'sui:testnet' },
        {
          onSuccess: (result) => {
            setConfTxDigest(suiTxDigest(result));
            setConfStatus('✅ Withdraw successful!');
            setConfLoading(false);
          },
          onError: (err) => {
            setConfStatus('❌ ' + err.message);
            setConfLoading(false);
          },
        }
      );
      return;
    } catch (e: unknown) {
      setConfStatus('❌ ' + (e instanceof Error ? e.message : String(e)));
      setConfLoading(false);
    }
  };

  useEffect(() => {
    if (account?.address) {
      setBankRecipient(account.address);
    }
  }, [account?.address]);

  useEffect(() => {
    setZkStealthLoading(false);
  }, []);

  useEffect(() => {
    void checkIdentityVerification();
  }, [checkIdentityVerification]);

  useEffect(() => {
    if (!walletAddress || zbankMode !== "stealth") return;
    const interval = setInterval(() => void checkIdentityVerification(), 30000);
    return () => clearInterval(interval);
  }, [walletAddress, zbankMode, checkIdentityVerification]);

  useEffect(() => {
    if (activeTab !== "zbank" || zbTab !== "zkstealth" || zkStealthMode !== "receive") return;
    fetchZkStealthNotes();
    fetchScheduledPayments();
    const interval = setInterval(() => {
      fetchZkStealthNotes();
      fetchScheduledPayments();
    }, 30000);
    return () => clearInterval(interval);
  }, [activeTab, zbTab, zkStealthMode, walletAddress, stealthAddress]);

  useEffect(() => {
    setZbTab(zbankMode === "anonymous" ? "zk" : "zkstealth");
  }, [zbankMode]);

  useEffect(() => {
    return () => {
      if (gearIntervalRef.current) clearInterval(gearIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    const fetchSuiPrice = async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd"
        );
        const data = await res.json();
        if (data?.sui?.usd) setSuiPrice(data.sui.usd);
      } catch (e) {
        console.error("Price fetch failed", e);
      }
    };
    void fetchSuiPrice();
    const interval = setInterval(() => void fetchSuiPrice(), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const w = walletAddress.trim();
    if (!w) {
      setZionProfile({});
      setZionBetStats(null);
      return;
    }
    const loaded = loadZionProfile(w);
    const normalized = { ...loaded, avatar: zionNormalizeAvatarId(loaded.avatar) };
    if (normalized.avatar !== loaded.avatar) saveZionProfile(w, normalized);
    setZionProfile(normalized);
    void loadZionBetStats();
  }, [walletAddress, loadZionBetStats]);

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
          const earned = zionbetComputeAchievements(bets, zionBetStats);
          setZionProfile((p) => {
            const merged = { ...p, achievements: earned };
            saveZionProfile(account.address!, merged);
            return merged;
          });
        })
        .catch(() => {});
    };

    pollMyBets();
    const interval = window.setInterval(pollMyBets, 30000);
    return () => clearInterval(interval);
  }, [account?.address, zionBetStats]);

  useEffect(() => {
    if (!faucetCooldownEndsAt || faucetCooldownEndsAt <= Date.now()) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [faucetCooldownEndsAt]);

  useEffect(() => {
    const t = window.setInterval(() => void fetchConversations(), 60000);
    return () => clearInterval(t);
  }, [fetchConversations]);

  useEffect(() => {
    if (activeTab !== "chat" || selectedClass == null) {
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
  }, [activeTab, selectedClass]);

  useEffect(() => {
    if (!walletAddress.trim()) {
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
  }, [walletAddress]);

  const loadLeaderboard = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    const t = setInterval(() => void loadLeaderboard(), 30000);
    return () => clearInterval(t);
  }, [loadLeaderboard]);

  useEffect(() => {
    void loadWave1Data(true);

    const wave2Timer = window.setTimeout(() => {
      void loadWave2Data();
      void fetchConversations();
    }, 100);

    const wave3Timer = window.setTimeout(() => {
      void loadWave3WalrusBlobs();
      void fetchSenateLaws();
      void fetchPoliticalEconomy();
      void fetchZcoDecisions();
      void loadZionBetMarkets();
      void fetchWalrusEvents();
      void loadLeaderboard();
    }, 800);

    return () => {
      window.clearTimeout(wave2Timer);
      window.clearTimeout(wave3Timer);
    };
  }, [
    loadWave1Data,
    loadWave2Data,
    loadWave3WalrusBlobs,
    fetchConversations,
    fetchSenateLaws,
    fetchPoliticalEconomy,
    fetchZcoDecisions,
    loadZionBetMarkets,
    fetchWalrusEvents,
    loadLeaderboard,
  ]);

  const maxBalance = useMemo(
    () => Math.max(1, ...(Array.isArray(agents) ? agents : []).map((a) => a.balance)),
    [agents]
  );
  const chatAgents = chatAgentsFiltered;
  const chatMaxBalance = useMemo(
    () => Math.max(1, ...(Array.isArray(chatAgents) ? chatAgents : []).map((a) => a.balance)),
    [chatAgents]
  );

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
    if (!w) {
      setZionBetToast("Please connect wallet first");
      return;
    }
    if (!signAndExecute) {
      setZionBetToast("Please connect wallet first");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0.01) {
      setZionBetToast("Invalid amount");
      return;
    }
    const placingId =
      typeof bracketIndex === "number"
        ? `${bet.id}-b${bracketIndex}-${prediction}`
        : `${bet.id}-${prediction}`;
    setZionBetPlacing(placingId);
    try {
      console.debug("[BET] Step 0: ensure on-chain market…", bet.id);
      const ensureResult = await ensureZionBetMarketOnChain(bet.id, bet.timeframe);
      if (ensureResult.warned) {
        console.warn("[BET] ensure_market non-fatal warning:", ensureResult.error);
      }
      console.debug("[BET] Step 1: calling submitZionBetOnChain…", {
        marketId: bet.id,
        ZIONBET_PACKAGE,
        BET_HOUSE,
        currency: betCurrency,
      });
      setZionBetToast("Approve wallet transaction…");
      const digest = await submitZionBetOnChain(
        signAndExecute as SignAndExecuteMutateFn,
        suiClientHook as SuiJsonRpcClient,
        {
          marketId: bet.id,
          direction: prediction,
          amount: amount,
          walletAddress: w,
          currency: betCurrency,
        }
      );
      console.debug("[BET] Step 2: chain success, digest:", digest);
      const betBody = buildZionBetDbBody({
        wallet: w,
        market: bet,
        direction: prediction,
        amountSui: amount,
        bracketIndex,
        currency: betCurrency,
      });
      const d = await postZionBetToDb(betBody);
      if (!d.success) {
        setZionBetToast(
          `On-chain bet succeeded but save failed: ${
            typeof d.message === "string"
              ? d.message
              : typeof d.error === "string"
                ? d.error
                : "unknown"
          }. Contact support with TX: ${digest?.slice(0, 12) ?? ""}`
        );
        return;
      }
      console.debug("[BET] Step 4: DB saved, bet_id:", d.bet_id);
      const dbBetId = d.bet_id ?? 0;
      if (dbBetId && digest) {
        const confirmResult = await confirmZionBetOnChain(dbBetId, digest, w);
        if (!confirmResult.ok) {
          console.debug(
            "[BET] confirm_bet did not set on_chain_bet_id — close may show pending ID"
          );
        }
      }
      const ur = await fetch(`/api/user/${encodeURIComponent(w)}`);
      const ud = await ur.json();
      const raw = ud.points ?? ud.total_points ?? 0;
      const pts = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(pts)) setUserPoints(pts);
      void loadMyBets();
      void loadZionBetMarkets();
      void loadZionBetStats();
      void fetchUsdcBalance();
      void checkVipStatus();
      const txLabel = digest ? `${digest.slice(0, 8)}…` : "pending";
      setZionBetToast(`✅ Bet placed! TX: ${txLabel}`);
      const yesCents = Math.round(bet.yes_cents ?? 50);
      const noCents = Math.round(bet.no_cents ?? 100 - yesCents);
      const oddsAtBet = prediction ? yesCents : noCents;
      const payout =
        typeof d.potential_payout === "number" && Number.isFinite(d.potential_payout)
          ? d.potential_payout
          : amount * (100 / oddsAtBet);
      if (detailMarket?.id === bet.id) {
        setInjectedBuyConfirm({
          direction: prediction,
          amount,
          currency: betCurrency,
          odds: oddsAtBet,
          payout,
        });
      }
    } catch (err) {
      console.error("[ZionBet] placeZionBet failed", err);
      const msg = err instanceof Error ? err.message : "Request failed.";
      setZionBetToast(msg.includes("Rejected") ? "Bet cancelled. Nothing was saved." : msg);
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

  const sheriffActionsDisplay = useMemo(
    () => filterGovernanceBranchLog(sheriffActions, "sheriff", cleanActivityDescription).slice(0, 5),
    [sheriffActions],
  );
  const senateEventsDisplay = useMemo(() => {
    const items =
      senateEvents.length > 0
        ? senateEvents
        : senateActions.map((e) => ({
            ...e,
            event_type: "senate" as const,
          }));
    return filterGovernanceBranchLog(items, "senate", cleanActivityDescription).slice(0, 8);
  }, [senateEvents, senateActions]);
  const zrsEventsDisplay = useMemo(
    () => filterGovernanceBranchLog(zrsEvents, "zrs", cleanActivityDescription).slice(0, 8),
    [zrsEvents],
  );
  const presidentActionsDisplay = useMemo(() => {
    type DecreeEntry = { description: string; created_at: string; count: number };
    const filtered = filterGovernanceBranchLog(presidentActions, "president", cleanActivityDescription);
    const deduped = filtered.reduce<DecreeEntry[]>((acc, entry) => {
      const last = acc[acc.length - 1];
      if (last && last.description === entry.description) {
        last.count = (last.count || 1) + 1;
      } else {
        acc.push({ ...entry, count: 1 });
      }
      return acc;
    }, []);
    return deduped.slice(0, 5);
  }, [presidentActions]);
  const vipFeedDisplay = (Array.isArray(vipMemoryFeed) ? vipMemoryFeed : []).slice(0, 8);


  const peCrimeRate = useMemo(() => {
    const gangPct =
      ecoPolData?.economy?.crime_pct ??
      stats?.crime_pct ??
      politicalEconomy?.metrics?.gang_crime_pct ??
      0;
    if (gangPct > 0) {
      return gangPct > 1 ? gangPct / 100 : gangPct;
    }
    const raw =
      politicalEconomy?.metrics?.crime_rate ??
      politicalEconomy?.crisis?.crime_rate ??
      stats?.crime_rate ??
      0;
    return raw > 1 ? raw / 100 : raw;
  }, [ecoPolData, stats, politicalEconomy]);

  const peGini = useMemo(
    () =>
      ecoPolData?.economy?.gini_coefficient ??
      stats?.gini_coefficient ??
      politicalEconomy?.metrics?.gini_coefficient ??
      politicalEconomy?.crisis?.gini_coefficient ??
      0,
    [ecoPolData?.economy?.gini_coefficient, stats?.gini_coefficient, politicalEconomy]
  );

  const peUnemployment = useMemo(
    () =>
      ecoPolData?.economy?.unemployment_rate ??
      stats?.unemployment_rate ??
      politicalEconomy?.metrics?.unemployment_rate ??
      politicalEconomy?.crisis?.unemployment_rate ??
      0,
    [ecoPolData?.economy?.unemployment_rate, stats?.unemployment_rate, politicalEconomy]
  );

  const ecoPolTickerMessages = useMemo(() => {
    const items: { text: string; breaking?: boolean }[] = [];

    if (politicalEconomy?.crisis?.is_active) {
      const pname =
        politicalEconomy.metrics?.president_name ??
        presidentState?.agent_name ??
        "President";
      items.push({
        text: `🚨 STATE OF EMERGENCY declared by ${pname}`,
        breaking: true,
      });
    }
    const revPressure = Number(
      politicalEconomy?.metrics?.revolution_pressure ??
        politicalEconomy?.crisis?.revolution_pressure ??
        0
    );
    if (revPressure > 50) {
      items.push({
        text: `Civil unrest pressure rising: ${Math.round(revPressure)}/150`,
        breaking: revPressure > 100,
      });
    }
    const ecoPhase = (
      politicalEconomy?.metrics?.economic_phase ??
      politicalEconomy?.crisis?.economic_phase ??
      "NORMAL"
    ).toUpperCase();
    if (ecoPhase !== "NORMAL") {
      items.push({ text: `📊 Economy in ${ecoPhase}`, breaking: ecoPhase === "DEPRESSION" });
    }

    if (ecoPolData?.uprising?.active) {
      items.push({
        text: `UPRISING ACTIVE — Civil unrest index ${ecoPolData.uprising.meter ?? 0}%`,
        breaking: true,
      });
    }
    const hasMartialLaw = ecoPolData?.active_effects?.some((ef) => {
      const et = (ef as { type?: string }).type ?? ef.effect_type;
      return et === "martial_law";
    });
    if (hasMartialLaw) {
      items.push({ text: "MARTIAL LAW — State of emergency in effect", breaking: true });
    }
    if (ecoPolData?.epidemic?.active) {
      items.push({
        text: `EPIDEMIC — ${ecoPolData.epidemic.infected_count} agents infected`,
        breaking: true,
      });
    }

    if (presidentState) {
      const partyUi = presidentPartyDisplay(presidentState.party);
      items.push({
        text: `🏛️ President ${presidentState.agent_name} · ${partyUi.label} · ${presidentState.approval_rating}% approval · Corruption ${Math.round(presidentState.corruption_index ?? 0)}%`,
      });
    }

    if (sheriffState) {
      items.push({
        text: `⚖️ Sheriff ${sheriffState.agent_name} · ${sheriffState.sheriff_type.toUpperCase()} · ${sheriffState.approval_rating}% approval · ${sheriffState.police_count} officers`,
      });
    }

    const topParty =
      partiesData && partiesData.length > 0
        ? [...partiesData].sort((a, b) => (b.approval_rating ?? 0) - (a.approval_rating ?? 0))[0]
        : null;
    if (topParty) {
      items.push({
        text: `🗳️ ${topParty.name} leads with ${topParty.approval_rating ?? 0}% · ${(topParty.members_count ?? 0).toLocaleString("en-US")} members`,
      });
    }

    const zrsStateMsg = ecoPolData?.zrs_last_action?.state ?? frsStats?.status ?? "—";
    const zrsRateMsg = frsStats?.interest_rate ?? 0;
    const zrsReserveMsg =
      frsStats?.government?.zrs?.reserve ?? stateTreasury?.zrs_fund ?? 0;
    items.push({
      text: `🏦 ZRS ${zrsStateMsg} · Reserve ${Math.round(zrsReserveMsg).toLocaleString("en-US")} ZION · Rate ${zrsRateMsg}%`,
    });

    const meterMsg = ecoPolData?.uprising?.meter ?? 0;
    const povertyMsg = ecoPolData?.economy.poverty_pct ?? frsStats?.economy.poor_pct ?? 0;
    const aliveMsg = stats?.alive ?? agents.length;
    items.push({
      text: `Civil unrest index ${meterMsg}% · Poverty ${Number(povertyMsg).toFixed(1)}% · ${aliveMsg.toLocaleString("en-US")} active subjects`,
    });

    if (senateData) {
      items.push({
        text: `🏛️ Senate: ${senateData.senator_count} senators · Speaker: ${senateData.speaker || "—"}`,
      });
    }

    if (items.length === 0) {
      items.push({ text: "Scanning political situation…" });
    }

    return items;
  }, [
    ecoPolData,
    frsStats,
    presidentState,
    sheriffState,
    partiesData,
    senateData,
    stateTreasury,
    stats?.alive,
    agents.length,
    politicalEconomy,
  ]);

  const openZionProfileMenu = () => {
    const w = walletAddress.trim();
    if (w) {
      setZionProfile(loadZionProfile(w));
      void loadZionBetStats();
    }
    setShowWalletMenu((v) => !v);
    setShowUserMenu(false);
  };

  const renderZionWalletProfileMenu = () => {
    const w = walletAddress.trim();
    if (!w) return null;
    const btnLabel = zionbetWalletTruncated(w);
    return (
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openZionProfileMenu();
          }}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            padding: "6px 10px",
            borderRadius: "2px",
            cursor: "pointer",
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            fontSize: "0.78rem",
            letterSpacing: "0.5px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>{`${btnLabel} ▾`}</span>
        </button>
        {showWalletMenu ? (
          <ZionBetProfileDropdown
            walletAddress={w}
            profile={zionProfile}
            stats={zionBetStats}
            onRefreshAchievements={refreshZionAchievements}
            onOpenPortfolio={() => setShowPortfolioOverlay(true)}
            onOpenMyBets={() => setShowMyBetsOverlay(true)}
            onLeaderboard={() => router.push("/leaderboard")}
            onDisconnect={() => disconnect()}
            onClose={() => setShowWalletMenu(false)}
          />
        ) : null}
      </div>
    );
  };

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
              border: "1px solid var(--border)",
              borderRadius: "2px",
              color: "var(--text-primary)",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              fontSize: "0.75rem",
              letterSpacing: "0.06em",
            }}
          >
            <span>Sign in with Google</span>
            </button>
            <button
              type="button"
              onClick={() => connect()}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              padding: "8px 16px",
              borderRadius: "2px",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              fontSize: "0.75rem",
              letterSpacing: "0.06em",
              height: "36px",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
              {isMobile ? "WALLET" : "CONNECT WALLET"}
            </button>
          </>
        )}
        {!isGoogleConnected && isWalletConnected && account?.address ? renderZionWalletProfileMenu() : null}
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
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                padding: "8px 12px",
                borderRadius: "2px",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: "0.78rem",
                letterSpacing: "0.04em",
                height: "36px",
              }}
            >
              {zkLoginUser.email.split("@")[0]} ▾
            </button>

            {showUserMenu ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "40px",
                  background: "#0a0a0a",
                  border: "1px solid var(--border)",
                  borderRadius: "2px",
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
            {renderZionWalletProfileMenu()}
          </>
        ) : null}
    </>
  );

  const tabCtx: ZionTabContextValue = {
    AgentTile,
    AnimatePresence,
    Area,
    AreaChart,
    BET_ADMIN_CAP,
    BET_HOUSE,
    BankAssetTrigger,
    BankIconImg,
    BankTokenModal,
    CHRONICLE_MAX,
    CHRONICLE_MAX_PER_TYPE,
    CHRONICLE_MAX_PRAYER,
    CHRONICLE_TICKER_TYPES,
    CartesianGrid,
    ClassIcon3D,
    ConfidentialDepositsList,
    CryptoIcon,
    DEEPBOOK_BINARY_MARKETS,
    DEEPBOOK_PREDICT_ID,
    DEEPBOOK_PREDICT_PACKAGE,
    DEEPBOOK_REGISTRY,
    DUSDC_TYPE,
    DistrictMap,
    DistrictMapPanel,
    ECO_BG_BLUE,
    ECO_BG_GOLD,
    ECO_BG_GREEN,
    ECO_BG_ORANGE,
    ECO_BG_PURPLE,
    ECO_BLUE,
    ECO_CARD_BASE,
    ECO_DANGER,
    ECO_GOLD,
    ECO_GREEN,
    ECO_LABEL,
    ECO_ORANGE,
    ECO_PURPLE,
    ECO_SENATE_SEATS,
    ECO_WARN,
    EXPERIMENT_START_MS,
    EcoApprovalBar,
    EcoPollBar,
    EcoTermBadge,
    EcoTermDivider,
    Ed25519Keypair,
    FieldObservationsFeed,
    GOLD_THRESHOLD,
    GlassCard,
    Line,
    LineChart,
    LivingPlanet,
    MAP_DISTRICT_SHAPES,
    MARKET_ID_NUMERIC,
    NETWORK_ICONS,
    PARTY_DISPLAY,
    POLICE_DIVISION_DESCRIPTIONS,
    POLICE_DIVISION_ROLE_BADGES,
    POLY_TABS,
    ParticleField,
    PowerGameBar,
    ResponsiveContainer,
    SILVER_THRESHOLD,
    STEALTH_PACKAGE,
    STEALTH_POOL,
    STEALTH_RELAYER_ADDRESS,
    SUI_CLOCK,
    SUI_LOGO_URLS,
    StealthKaleidoscopeCanvas,
    SuiLogo,
    TAB_TYPES,
    TOKEN_ICONS,
    Tooltip,
    Transaction,
    USDC_BET_HOUSE,
    VIP_MARKETS,
    WALRUS_TICKER_TYPE_COLORS,
    XAxis,
    YAxis,
    ZBANK_COMING_SOON_NETWORKS,
    ZBANK_SUI_LOGO,
    ZBANK_TOKENS,
    ZBANK_TO_NETWORKS,
    ZBANK_USDC_LOGO,
    ZB_BET_CARD_GLASS,
    ZB_POLY_BUY,
    ZB_POLY_BUY_BG,
    ZB_POLY_SELL,
    ZB_POLY_SELL_BG,
    ZB_VISTA_GLASS,
    ZB_VISTA_LABEL,
    ZB_VISTA_NO,
    ZB_VISTA_TEXT_SEC,
    ZB_VISTA_YES,
    ZBankCoinLabel,
    ZCO_ACCENT,
    ZIONBET_BET_TIMEFRAME_SIDEBAR,
    ZIONBET_CARD_BG,
    ZIONBET_CARD_BORDER,
    ZIONBET_CATEGORY_FALLBACK,
    ZIONBET_CRYPTO_DEEPBOOK_IDS,
    ZIONBET_CRYPTO_TIMEFRAME_SIDEBAR,
    ZIONBET_CURRENCY_LOGOS,
    ZIONBET_DETAIL_CG_IDS,
    ZIONBET_PACKAGE,
    ZIONBET_TAB_LABELS,
    ZIONBET_TF_DURATION_MS,
    ZIONBET_TIMEFRAME_MAP,
    ZIONBET_TIMEFRAME_SIDEBAR_ROWS,
    ZION_AVATARS,
    ZION_AVATAR_LEGACY_EMOJI,
    ZION_MONTH_NAMES,
    ZION_POLY_RESOLUTION_SOURCE,
    ZION_ROLE_DEFS,
    ZION_TERM,
    ZionBetAvatarImg,
    ZionBetBracketTradingSidebar,
    ZionBetBuyConfirmCard,
    ZionBetClosePositionButton,
    ZionBetHistoryTab,
    ZionBetMarketCard,
    ZionBetMarketCardItem,
    ZionBetMarketDetail,
    ZionBetMarketDetailOverlay,
    ZionBetMyBetCard,
    ZionBetMyBetsOverlay,
    ZionBetPortfolioOverlay,
    ZionBetPortfolioPositionRow,
    ZionBetPremiumStatCard,
    ZionBetProfileDropdown,
    ZionBetResolutionRulesCard,
    ZionBetSellConfirmCard,
    ZionBetTradingControls,
    ZionGovCard,
    ZionMetricGrid,
    ZionPowerBar,
    ZionRoleBadge,
    ZionRoleSvg,
    ZionSectionHeader,
    ZionSectionSep,
    ZionTermCard,
    ZionTermLabel,
    ZionTermValue,
    account,
    addressKeyBytes,
    agentClasses,
    agents,
    aliveAgents,
    allEvents,
    allFeedItems,
    anonymousAmount,
    auditTrail,
    autoWithdraw,
    backendApiUrl,
    backendBaseUrl,
    bankAmount,
    bankError,
    bankLoading,
    bankRecipient,
    bankSendMode,
    bankTxHash,
    bcs,
    betAmount,
    betCurrency,
    betLoading,
    betModal,
    setBetModal,
    betResult,
    betSort,
    setBetSort,
    betTab,
    setBetTab,
    betTimeframe,
    setBetTimeframe,
    betTimeframeCounts,
    buildAnnounceTransaction,
    buildRegisterTransaction,
    buildYesPriceChartData,
    buildZionBetDbBody,
    bytesToHex,
    cancelScheduledPayment,
    chatAgent,
    chatAgents,
    chatAgentsFiltered,
    chatAgentsListUrl,
    chatInput,
    chatLoading,
    chatMaxBalance,
    chatMessages,
    checkIdentityVerification,
    checkStealthAddress,
    checkVIPAccess,
    checkVipStatus,
    chronicleBoldDescription,
    chronicleMeta,
    chroniclePriorityKey,
    chroniclePriorityRank,
    chronicleTickerBorder,
    chronicleTickerTypeKey,
    chronicleTypeKey,
    claimFaucet,
    claimReceiptId,
    claimResults,
    claimResultsExpanded,
    claimSingleNote,
    claimStatus,
    claimStealthPayment,
    claimingIndex,
    clans,
    classMeta,
    cleanActivityDescription,
    cleanMsg,
    cleanName,
    clearInjectedBuyConfirm,
    colorWithAlpha,
    computeProsperity,
    computeStealthAddress,
    confAmount,
    confBlinding,
    confCoin,
    confLoading,
    confStatus,
    confTab,
    confTxDigest,
    connect,
    connectWallet,
    conversations,
    cooldownRemainingSec,
    copiedStealth,
    copyStealthAddressToClipboard,
    corporations,
    corporationsLoading,
    createPortal,
    crossDenom,
    cryptoIconWrapStyle,
    deathsDeltaPct,
    decryptNote,
    deepbookOracles,
    deepbookVault,
    detailMarket,
    setDetailMarket,
    detailOverlayMounted,
    disconnect,
    ecoEconomicPhaseColor,
    ecoFormatZionShort,
    ecoPolData,
    ecoPolTickerMessages,
    ecoPollBar,
    ecoPollPartyColor,
    ecoPresidentMessageColor,
    ecoRevMeterColor,
    ecoSheriffMessageColor,
    ecoVipRoleIcon,
    ecoZrsBorderColor,
    ecoZrsStateColor,
    effectiveZionBetCategorySlug,
    encryptNote,
    encryptStealthMemo,
    eventFilter,
    executeDeepBookMintBinary,
    executeZionBetOnChain,
    experimentRunTime,
    faucetBusy,
    faucetCooldownEndsAt,
    fetchConversations,
    fetchDeepbookOracles,
    fetchEcoPol,
    fetchGovernmentData,
    fetchPerpsData,
    fetchPerpsFeed,
    fetchPerpsProofs,
    fetchPoliticalEconomy,
    fetchScheduledPayments,
    fetchSenateLaws,
    fetchUsdcBalance,
    fetchWalrusEvents,
    fetchWalrusEventsFromAPI,
    fetchZcoDecisions,
    fetchZcoDecisionsFromAPI,
    fetchZionMarkets,
    fetchZkStealthNotes,
    filterChronicleEvents,
    filterChronicleTickerEvents,
    filteredEvents,
    formatDuration,
    formatEventTime,
    formatLawProposer,
    formatMarketCardCountdown,
    formatResolveCountdown,
    formatRunTime,
    formatSpotUsd,
    formatTimeAgo,
    formatZionVolume,
    fragmentedWithdraw,
    fromToken,
    frsChief,
    governanceHeader,
    frsStats,
    gearColorIdx,
    gearIntervalRef,
    generateNonce,
    generateRandomness,
    generateStealthMetaAddress,
    getLawStatusStyle,
    getOrSetResolveTime,
    getPartyColor,
    getUsdcCoins,
    handleBankSend,
    handleClaimAll,
    handleConfidential,
    handleCreateScheduledPayment,
    handleCrossDenomMix,
    handleExportKeys,
    handleGenerateStealthAddress,
    handleImportKeys,
    handlePlaceCardBet,
    handlePositionClosed,
    handleRegisterStealth,
    handleScan,
    handleScanStealth,
    handleStealthSend,
    handleVerifyIdentity,
    handleZbTransfer,
    handleZkStealthClaim,
    handleZkStealthMultiSend,
    handleZkStealthSend,
    heroAgentCount,
    heroProsperityPct,
    heroStatsLoading,
    heroSubjectCount,
    hexToRgba,
    identityFee,
    identityFeeLabel,
    inferZionBetCategorySlug,
    injectedBuyConfirm,
    instantReceiptId,
    isDeepbookCryptoMarket,
    isGoogleConnected,
    isMobile,
    isWalletConnected,
    keyTooltip,
    keysFileStatus,
    lastAliveCount,
    leaderboard,
    liveCgUsdForToken,
    loadAllPolyTabs,
    loadCivilizationMarkets,
    loadCoreData,
    loadLeaderboard,
    loadMyBets,
    loadPolyTab,
    loadWave1Data,
    loadWave2Data,
    loadWave3WalrusBlobs,
    loadZionBetMarkets,
    loadZionBetStats,
    loadZionProfile,
    marketIdU64Cache,
    markets,
    maxBalance,
    motion,
    multiRecipients,
    multiSend,
    myAgentData,
    myAgentLoading,
    myAgentSearch,
    myBets,
    myBetsRef,
    normalizePoliceDivision,
    notarizeResult,
    notifyMyBetsSettlements,
    nowTick,
    onCooldown,
    openChat,
    openZionProfileMenu,
    outputAddresses,
    outputDenom,
    parseApiStatsResponse,
    parseCooldownPayload,
    parseEventTimeMs,
    parsePressNewspaperArticle,
    partiesData,
    peCrimeRate,
    peGini,
    peUnemployment,
    perpsFeed,
    perpsLeaderboard,
    perpsLoading,
    perpsPrevPriceRef,
    perpsPriceTicker,
    perpsPrices,
    perpsProofs,
    perpsTab,
    placeZionBet,
    playCork,
    playSwish,
    policeDivisions,
    politicalEconomy,
    polyByTab,
    polyToApiMarket,
    presidentActions,
    presidentActionsDisplay,
    presidentPartyDisplay,
    presidentState,
    prevDeathsRef,
    prevPrices,
    priceChanges,
    referralLink,
    refreshZionAchievements,
    renderAuthToolbar,
    renderPoliticalWireText,
    renderZionWalletProfileMenu,
    router,
    saveZionProfile,
    scheduleFrequency,
    scheduleMaxPayments,
    scheduleRecipient,
    scheduledPayments,
    searchMyAgent,
    sectorEmoji,
    selectedAgent,
    selectedClass,
    senateActions,
    senateData,
    senateEvents,
    senateEventsDisplay,
    sendChat,
    sha256BytesToU64,
    sha256Hex,
    sheriffActions,
    sheriffActionsDisplay,
    sheriffState,
    shortWallet,
    showAdvanced,
    showMyBetsOverlay,
    showPortfolioOverlay,
    showSchedule,
    showTokenModal,
    showUserMenu,
    showVIP,
    setShowVIP,
    showWalletMenu,
    signAndExecute,
    signAndExecuteTransaction,
    starsFromStat,
    stateTreasury,
    stats,
    statsLoading,
    stealthAddress,
    stealthAmount,
    stealthKeys,
    stealthMemo,
    stealthMetaInput,
    stealthPrivacyMax,
    stealthRegisterLoading,
    stealthScanLoading,
    stealthScanResults,
    stealthSubTab,
    suiBalance,
    suiClient,
    suiClientHook,
    suiPrice,
    suiTxDigest,
    textToBytes,
    tickerDuration,
    toNetwork,
    toToken,
    topicBadgeEmoji,
    topicSnippet,
    truncateBankAddress,
    uniqueCorporations,
    usdcBalance,
    useCallback,
    useConnectWallet,
    useCurrentAccount,
    useDecoys,
    useDisconnectWallet,
    useEffect,
    useMemo,
    useRef,
    useRouter,
    useSignAndExecuteTransaction,
    useSignPersonalMessage,
    useState,
    useSuiClient,
    useWallets,
    useZionbetBetDisplayQuestion,
    userPoints,
    vipAccess,
    vipFeedDisplay,
    vipMemoryFeed,
    walletAddress,
    wallets,
    walrusBlobs,
    walrusEventTypeEmoji,
    walrusRowAccent,
    wireItemStyle,
    xorDecryptForAddress,
    xorEncryptForAddress,
    zbAmount,
    zbCoin,
    zbLoading,
    zbRecipient,
    zbStatus,
    zbTab,
    zbTxDigest,
    zbankMode,
    zbankTab,
    zcoAgreementDisplayColor,
    zcoAgreementPercent,
    zcoConsensusLine,
    zcoConsensusShort,
    zcoDecisions,
    zcoLastUpdated,
    zcoLoading,
    zcoProofHref,
    zionAvatarMeta,
    zionBetCategoryCounts,
    zionBetCategoryFromApi,
    zionBetCategorySlugFromLabel,
    zionBetCategoryTab,
    zionBetCategoryTabLabel,
    zionBetCgUsd,
    zionBetCompactCardHeaderLeft,
    zionBetDetailCoinGeckoId,
    zionBetDisplayOdds,
    zionBetFilteredMarkets,
    zionBetIsShortTermTf,
    zionBetListAfterCategory,
    zionBetMarketFromApi,
    zionBetMarketMatchesTimeframeFilter,
    zionBetMarketRulesText,
    zionBetNotify,
    zionBetPlacing,
    zionBetResolvesAtIso,
    zionBetSelectedMarket,
    setZionBetSelectedMarket,
    zionBetSourceList,
    zionBetStats,
    zionBetTfKeyFromZionMarket,
    zionBetTimeframeCounts,
    zionBetTimeframeFooterTag,
    zionBetTimeframeShort,
    zionBetTimeframeTab,
    zionBetToast,
    zionCivMarketIcon,
    zionMarketOptionButtonLabel,
    zionMarketRowToApiMarket,
    zionMarkets,
    zionMyBetFromApi,
    zionNormalizeAvatarId,
    zionProfile,
    zionProfileStorageKey,
    zionbetAboutMarketText,
    zionbetAeroPanel,
    zionbetApiToMarket,
    zionbetBetAvgCents,
    zionbetBetCloseValue,
    zionbetBetCurrency,
    zionbetBetPnl,
    zionbetBetPotentialWin,
    zionbetBetTimeframeToFilterKey,
    zionbetBetTimestamp,
    zionbetCardFallbackEmoji,
    zionbetCardSortVolume,
    zionbetCardVolumeSui,
    zionbetCivilizationEmoji,
    zionbetCleanMarketTitle,
    zionbetComputeAchievements,
    zionbetComputePositionStats,
    zionbetCountdownMs,
    zionbetCryptoEmoji,
    zionbetCryptoPolyMarkets,
    zionbetDisplayResolutionSource,
    zionbetDisplayedMarkets,
    zionbetEarlyCloseReturnSui,
    zionbetEmojiTint,
    zionbetEndDateLabel,
    zionbetFilteredDeepbookMarkets,
    zionbetFindMarketQuestionInLists,
    zionbetFormatEndsDate,
    zionbetFormatMarketIdFallback,
    zionbetFormatMarketOpened,
    zionbetFormatStakedLabel,
    zionbetFormatSuiDelta,
    zionbetHeaderStats,
    zionbetIsPolyMarket,
    zionbetIsZionNativeMarket,
    zionbetMarketDescriptionText,
    zionbetMarketEmoji,
    zionbetMarketEndSortKey,
    zionbetMarketFromBet,
    zionbetMarketQuestionCache,
    zionbetMarketVolumeLabel,
    zionbetMarkets,
    zionbetMyBetResolvesInLabel,
    zionbetNormalizePolyApiRow,
    zionbetOddsTrendIndicator,
    zionbetOrderBookRows,
    zionbetPoliticsEmoji,
    zionbetPoliticsFlagEmoji,
    zionbetPolyDollarVolumeLabel,
    zionbetPolyRowToApiMarket,
    zionbetPolyVolumeLabel,
    zionbetQuestionLooksLikeMarketId,
    zionbetResolutionCriteria,
    zionbetSharesFromStake,
    zionbetSparklinePoints,
    zionbetSpawnConfetti,
    zionbetSportsEmoji,
    zionbetStableVolume,
    zionbetStakeFromShares,
    zionbetTabCounts,
    zionbetTabLoading,
    zionbetTabMarketsBase,
    zionbetTimeframeEndLabel,
    zionbetTimeframeSortOrder,
    zionbetTruncateQuestion,
    zionbetVolumeSuiAmount,
    zionbetVolumeSuiLabel,
    zionbetWalletTruncated,
    zkClaimLoading,
    zkClaimStatus,
    zkIdentityLoading,
    zkIdentityVerified,
    zkLoginUser,
    zkStealthClaimDigest,
    zkStealthCoin,
    zkStealthLoading,
    zkStealthMode,
    zkStealthNotes,
    zkStealthRecipient,
    zkStealthStatus,
    zrsEvents,
    zrsEventsDisplay,
  };

  return (
    <ZionTabProvider value={tabCtx}>
    <main className="page" style={standalone ? { background: "transparent", position: "relative", zIndex: 1 } : undefined}>
      {!standalone && <BackgroundGrid />}
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
      {standalone ? (
        <>
          <BackgroundGrid />
          <div className="belowHeroShell prediction-engine-shell">
            {standaloneMarketId ? (
              <div className="dashboard show" style={isMobile ? { padding: "8px 16px" } : undefined}>
                {zionBetNotify ? (
                  <GlassCard
                    className={glassCardStyles.glassCardLab}
                    style={{ marginBottom: 18, padding: "12px 14px" }}
                  >
                    <div
                      className={`zionBetToast zionBetToast--${zionBetNotify.type}`}
                      role="status"
                      style={{ margin: 0, padding: 0, border: "none", background: "transparent", boxShadow: "none" }}
                    >
                      {zionBetNotify.message}
                    </div>
                  </GlassCard>
                ) : null}
                {standaloneMarketLoading && !standaloneMarket ? (
                  <div style={{ color: "#94a3b8", padding: "24px", textAlign: "center" }}>Loading market…</div>
                ) : standaloneMarketError || !standaloneMarket ? (
                  <GlassCard className={glassCardStyles.glassCardLab} style={{ padding: "24px", textAlign: "center" }}>
                    <p style={{ color: "#94a3b8", margin: "0 0 16px" }}>
                      {standaloneMarketError ?? "Market not found"}
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push("/prediction-engine")}
                      style={{
                        cursor: "pointer",
                        color: "#ffffff",
                        fontSize: "14px",
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        padding: "8px 16px",
                        borderRadius: "8px",
                      }}
                    >
                      ← BACK TO MARKETS
                    </button>
                  </GlassCard>
                ) : (
                  <ZionBetMarketDetailOverlay
                    mode="page"
                    apiMarket={standaloneMarket}
                    walletConnected={Boolean(walletAddress.trim())}
                    walletAddress={walletAddress}
                    walletBalanceSui={suiBalance}
                    walletBalanceUsdc={usdcBalance}
                    myBets={myBets}
                    betAmount={betAmount}
                    setBetAmount={setBetAmount}
                    betCurrency={betCurrency}
                    setBetCurrency={setBetCurrency}
                    betLoading={betLoading}
                    onPlaceBet={(market, direction, amount) => {
                      setBetAmount(String(Math.round(amount * 100) / 100));
                      return handlePlaceCardBet(market, direction, amount);
                    }}
                    onClose={() => router.push("/prediction-engine")}
                    signAndExecute={signAndExecute as SignAndExecuteMutateFn}
                    onPositionClosed={handlePositionClosed}
                    injectedBuyConfirm={injectedBuyConfirm}
                    onInjectedBuyConfirmConsumed={clearInjectedBuyConfirm}
                    onShareLinkCopied={() =>
                      setZionBetNotify({ message: "Link copied!", type: "success" })
                    }
                  />
                )}
              </div>
            ) : (
              <div className="dashboard show" style={isMobile ? { padding: "8px 16px" } : undefined}>
                <div className="tabPanels">
                  <PredictionEngine />
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
      <SharedLayout
        isMobile={isMobile}
        experimentRunTime={experimentRunTime}
        renderAuthToolbar={renderAuthToolbar}
      >

          {activeTab === "civilization" && <Observatory />}

          {activeTab === "constitution" && <Constitution />}

          {activeTab === "chat" && <FieldNotes />}

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
                      <th>Prediction P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="leaderboardEmpty">
                          No leaderboard data yet.
                        </td>
                      </tr>
                    ) : (
                      (Array.isArray(leaderboard) ? leaderboard : []).map((row, idx) => (
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
                          <td
                            style={{
                              color: "var(--text-primary)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {row.zionbet_pnl != null
                              ? `${row.zionbet_pnl >= 0 ? "+" : ""}${row.zionbet_pnl} SUI`
                              : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeTab === "zbank" && <Privacy />}

          {activeTab === "zperps" && (
            <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
              <div style={{ marginBottom: "20px" }}>
                <div
                  style={{
                    color: "#00ff41",
                    fontSize: "1.2rem",
                    fontFamily: "monospace",
                    fontWeight: "bold",
                    letterSpacing: "2px",
                    marginBottom: "4px",
                  }}
                >
                  📈 Z-PERPS
                </div>
                <div style={{ color: "#555", fontSize: "0.7rem", fontFamily: "monospace" }}>
                  AI agents trading real market data • Live Market Data
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
                {Object.values(perpsPrices).map((p: any) => {
                  const change = priceChanges[p.symbol];
                  return (
                    <div
                      key={p.symbol}
                      style={{
                        background:
                          change === "up"
                            ? "rgba(0,255,65,0.12)"
                            : change === "down"
                              ? "rgba(255,68,68,0.12)"
                              : "#0d0d0d",
                        border: `1px solid ${
                          change === "up" ? "#00ff41" : change === "down" ? "#ff4444" : "#1a1a1a"
                        }`,
                        borderRadius: "8px",
                        padding: "6px 12px",
                        transition: "border-color 0.3s, background 0.3s, color 0.3s",
                      }}
                    >
                      <div style={{ color: "#777", fontSize: "0.6rem", fontFamily: "monospace" }}>{p.symbol}</div>
                      <div
                        style={{
                          color: change === "up" ? "#00ff41" : change === "down" ? "#ff4444" : "#00ff41",
                          fontSize: "0.75rem",
                          fontFamily: "monospace",
                          fontWeight: "bold",
                          transition: "color 0.3s",
                        }}
                      >
                        ${p.price.toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setPerpsTab("leaderboard")}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    fontSize: "0.72rem",
                    letterSpacing: "1px",
                    background: perpsTab === "leaderboard" ? "#00ff41" : "#111",
                    color: perpsTab === "leaderboard" ? "#000" : "#555",
                  }}
                >
                  🏆 LEADERBOARD
                </button>
                <button
                  type="button"
                  onClick={() => setPerpsTab("market")}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    fontSize: "0.72rem",
                    letterSpacing: "1px",
                    background: perpsTab === "market" ? "#00ff41" : "#111",
                    color: perpsTab === "market" ? "#000" : "#555",
                  }}
                >
                  📊 MARKET
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPerpsTab("feed");
                    fetchPerpsFeed();
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    fontSize: "0.72rem",
                    letterSpacing: "1px",
                    background: perpsTab === "feed" ? "#00ff41" : "#111",
                    color: perpsTab === "feed" ? "#000" : "#555",
                  }}
                >
                  ⚡ FEED
                </button>
                <button
                  type="button"
                  onClick={() => setPerpsTab("myagent")}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    fontSize: "0.72rem",
                    letterSpacing: "1px",
                    background: perpsTab === "myagent" ? "#00ff41" : "#111",
                    color: perpsTab === "myagent" ? "#000" : "#555",
                  }}
                >
                  🤖 MY AGENT
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPerpsTab("proofs");
                    fetchPerpsProofs();
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "monospace",
                    fontSize: "0.72rem",
                    letterSpacing: "1px",
                    background: perpsTab === "proofs" ? "#00ff41" : "#111",
                    color: perpsTab === "proofs" ? "#000" : "#555",
                  }}
                >
                  🔐 WALRUS
                </button>
                <button
                  type="button"
                  onClick={fetchPerpsData}
                  style={{
                    marginLeft: "auto",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid #1a1a1a",
                    background: "transparent",
                    color: "#444",
                    fontFamily: "monospace",
                    fontSize: "0.65rem",
                    cursor: "pointer",
                  }}
                >
                  ↻ REFRESH
                </button>
              </div>

              {perpsLoading && (
                <div
                  style={{
                    color: "#444",
                    fontFamily: "monospace",
                    fontSize: "0.7rem",
                    textAlign: "center",
                    padding: "20px",
                  }}
                >
                  Loading...
                </div>
              )}

              {perpsTab === "leaderboard" && (
                <div
                  style={{
                    background: "#0a0a0a",
                    border: "1px solid #1a1a1a",
                    borderRadius: "12px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "40px 1fr 100px 80px 80px 80px 60px",
                      padding: "10px 16px",
                      borderBottom: "1px solid #1a1a1a",
                      color: "#444",
                      fontSize: "0.6rem",
                      fontFamily: "monospace",
                      letterSpacing: "1px",
                    }}
                  >
                    <div>#</div>
                    <div>AGENT</div>
                    <div style={{ textAlign: "right" }}>BALANCE</div>
                    <div style={{ textAlign: "right" }}>RETURN</div>
                    <div style={{ textAlign: "right" }}>WIN RATE</div>
                    <div style={{ textAlign: "right" }}>TRADES</div>
                    <div style={{ textAlign: "right" }}>PROOFS</div>
                  </div>

                  {perpsLeaderboard.map((agent, i) => (
                    <div
                      key={agent.agent_id}
                      role="button"
                      tabIndex={0}
                      onClick={async () => {
                        const res = await fetch(`/api/perps/agent/${agent.agent_id}`);
                        const data = await res.json();
                        setSelectedAgent({ ...agent, ...data });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void fetch(`/api/perps/agent/${agent.agent_id}`)
                            .then((res) => res.json())
                            .then((data) => setSelectedAgent({ ...agent, ...data }));
                        }
                      }}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "40px 1fr 100px 80px 80px 80px 60px",
                        padding: "10px 16px",
                        borderBottom: "1px solid #0d0d0d",
                        cursor: "pointer",
                        transition: "background 0.15s",
                        background:
                          selectedAgent?.agent_id === agent.agent_id ? "#0d1a0d" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#111";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          selectedAgent?.agent_id === agent.agent_id ? "#0d1a0d" : "transparent";
                      }}
                    >
                      <div style={{ color: "#444", fontSize: "0.7rem", fontFamily: "monospace" }}>{i + 1}</div>
                      <div
                        role="button"
                        tabIndex={0}
                        style={{
                          color: "#fff",
                          fontSize: "0.75rem",
                          fontFamily: "monospace",
                          cursor: "pointer",
                          textDecoration: "underline",
                          textDecorationColor: "#1a3a1a",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          window.location.href = `/agent/${agent.agent_id}`;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            window.location.href = `/agent/${agent.agent_id}`;
                          }
                        }}
                      >
                        {agent.agent_name}
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          color: "#00ff41",
                          fontSize: "0.75rem",
                          fontFamily: "monospace",
                        }}
                      >
                        ${agent.balance.toFixed(2)}
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          fontSize: "0.72rem",
                          fontFamily: "monospace",
                          color: agent.total_return_pct >= 0 ? "#00ff41" : "#ff4444",
                        }}
                      >
                        {agent.total_return_pct >= 0 ? "+" : ""}
                        {agent.total_return_pct.toFixed(1)}%
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          color: "#777",
                          fontSize: "0.72rem",
                          fontFamily: "monospace",
                        }}
                      >
                        {agent.win_rate.toFixed(0)}%
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          color: "#555",
                          fontSize: "0.72rem",
                          fontFamily: "monospace",
                        }}
                      >
                        {agent.total_trades}
                      </div>
                      <div
                        style={{
                          textAlign: "right",
                          fontSize: "0.72rem",
                          fontFamily: "monospace",
                          color: agent.proofs_count > 0 ? "#ffaa00" : "#333",
                        }}
                      >
                        {agent.proofs_count > 0 ? `⚡${agent.proofs_count}` : "-"}
                      </div>
                    </div>
                  ))}

                  {perpsLeaderboard.length === 0 && !perpsLoading && (
                    <div
                      style={{
                        padding: "40px",
                        textAlign: "center",
                        color: "#333",
                        fontFamily: "monospace",
                        fontSize: "0.7rem",
                      }}
                    >
                      No trading data yet
                    </div>
                  )}
                </div>
              )}

              {perpsTab === "market" && (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    {Object.values(perpsPrices).map((p: any) => (
                      <div
                        key={p.symbol}
                        style={{
                          background: "#0d0d0d",
                          border: `1px solid ${
                            priceChanges[p.symbol] === "up"
                              ? "#00ff41"
                              : priceChanges[p.symbol] === "down"
                                ? "#ff4444"
                                : "#1a1a1a"
                          }`,
                          borderRadius: "12px",
                          padding: "16px",
                          transition: "border-color 0.3s",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                          <div
                            style={{
                              color: "#fff",
                              fontSize: "0.9rem",
                              fontFamily: "monospace",
                              fontWeight: "bold",
                            }}
                          >
                            {p.symbol}
                          </div>
                          <div style={{ color: "#444", fontSize: "0.6rem", fontFamily: "monospace" }}>/USD</div>
                        </div>
                        <div
                          style={{
                            color:
                              priceChanges[p.symbol] === "up"
                                ? "#00ff41"
                                : priceChanges[p.symbol] === "down"
                                  ? "#ff4444"
                                  : "#00ff41",
                            fontSize: "1.1rem",
                            fontFamily: "monospace",
                            fontWeight: "bold",
                            transition: "color 0.3s",
                          }}
                        >
                          ${p.price.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: "24px" }}>
                    <div
                      style={{
                        color: "#444",
                        fontSize: "0.6rem",
                        letterSpacing: "2px",
                        fontFamily: "monospace",
                        marginBottom: "12px",
                      }}
                    >
                      ECOSYSTEM INTEGRATIONS
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
                      {[
                        {
                          name: "DeepBook",
                          desc: "AI agents route orders through DeepBook v3 for optimal execution on Sui.",
                          icon: "📗",
                          color: "#00aaff",
                          status: "ACTIVE",
                        },
                        {
                          name: "Cetus DEX",
                          desc: "WAL and CETUS prices sourced from Cetus. Used for Sui-native token trading.",
                          icon: "🐬",
                          color: "#00ff41",
                          status: "ACTIVE",
                        },
                        {
                          name: "Walrus Storage",
                          desc: "Every profitable agent trade generates a ZCO proof stored permanently on Walrus.",
                          icon: "🐋",
                          color: "#ffaa00",
                          status: "ACTIVE",
                        },
                      ].map((item) => (
                        <div
                          key={item.name}
                          style={{
                            background: "#0d0d0d",
                            border: "1px solid #1a1a1a",
                            borderRadius: "12px",
                            padding: "16px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                            <span style={{ fontSize: "1.2rem" }}>{item.icon}</span>
                            <div
                              style={{
                                color: item.color,
                                fontSize: "0.8rem",
                                fontFamily: "monospace",
                                fontWeight: "bold",
                              }}
                            >
                              {item.name}
                            </div>
                            <div
                              style={{
                                marginLeft: "auto",
                                background: "#0a1a0a",
                                border: "1px solid #1a3a1a",
                                borderRadius: "4px",
                                padding: "2px 6px",
                                color: "#00ff41",
                                fontSize: "0.55rem",
                                fontFamily: "monospace",
                              }}
                            >
                              {item.status}
                            </div>
                          </div>
                          <div
                            style={{
                              color: "#444",
                              fontSize: "0.65rem",
                              fontFamily: "monospace",
                              lineHeight: "1.5",
                            }}
                          >
                            {item.desc}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {perpsTab === "feed" && (
                <div
                  style={{
                    background: "#0a0a0a",
                    border: "1px solid #1a1a1a",
                    borderRadius: "12px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #1a1a1a",
                      color: "#444",
                      fontSize: "0.6rem",
                      fontFamily: "monospace",
                      letterSpacing: "1px",
                    }}
                  >
                    LATEST AGENT TRADES — refreshes every 30 sec
                  </div>
                  {perpsFeed.length === 0 && (
                    <div
                      style={{
                        padding: "40px",
                        textAlign: "center",
                        color: "#333",
                        fontFamily: "monospace",
                        fontSize: "0.7rem",
                      }}
                    >
                      Loading feed...
                    </div>
                  )}
                  {perpsFeed.map((t: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "10px 16px",
                        borderBottom: "1px solid #0d0d0d",
                      }}
                    >
                      <div
                        style={{
                          color: "#444",
                          fontSize: "0.6rem",
                          fontFamily: "monospace",
                          width: "80px",
                        }}
                      >
                        {new Date(t.closed_at || t.opened_at).toLocaleTimeString()}
                      </div>
                      <div style={{ color: "#777", fontSize: "0.72rem", fontFamily: "monospace", flex: 1 }}>
                        {t.agent_name}
                      </div>
                      <div
                        style={{
                          color: t.direction === "LONG" ? "#00ff41" : "#ff4444",
                          fontSize: "0.68rem",
                          fontFamily: "monospace",
                          width: "45px",
                          fontWeight: "bold",
                        }}
                      >
                        {t.direction}
                      </div>
                      <div style={{ color: "#fff", fontSize: "0.68rem", fontFamily: "monospace", width: "40px" }}>
                        {t.pair}
                      </div>
                      <div
                        style={{
                          color: "#555",
                          fontSize: "0.62rem",
                          fontFamily: "monospace",
                          width: "100px",
                        }}
                      >
                        ${t.entry_price?.toLocaleString()}
                      </div>
                      <div
                        style={{
                          color: t.pnl > 0 ? "#00ff41" : t.pnl < 0 ? "#ff4444" : "#555",
                          fontSize: "0.68rem",
                          fontFamily: "monospace",
                          width: "70px",
                          textAlign: "right",
                          fontWeight: t.pnl ? "bold" : "normal",
                        }}
                      >
                        {t.pnl ? `${t.pnl > 0 ? "+" : ""}$${t.pnl.toFixed(3)}` : "OPEN"}
                      </div>
                      <div style={{ width: "60px", textAlign: "right" }}>
                        {t.walrus_blob_id ? (
                          <a
                            href={`/zco/${t.walrus_blob_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "#ffaa00",
                              fontSize: "0.6rem",
                              fontFamily: "monospace",
                              textDecoration: "none",
                            }}
                          >
                            ⚡ZCO
                          </a>
                        ) : (
                          <span style={{ color: "#1a1a1a", fontSize: "0.6rem", fontFamily: "monospace" }}>—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {perpsTab === "myagent" && (
                <div>
                  <div
                    style={{
                      background: "#0d0d0d",
                      border: "1px solid #1a1a1a",
                      borderRadius: "12px",
                      padding: "16px",
                      marginBottom: "16px",
                    }}
                  >
                    <div
                      style={{
                        color: "#555",
                        fontSize: "0.62rem",
                        fontFamily: "monospace",
                        letterSpacing: "1px",
                        marginBottom: "10px",
                      }}
                    >
                      FIND AGENT BY NAME
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        value={myAgentSearch}
                        onChange={(e) => setMyAgentSearch(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && searchMyAgent()}
                        placeholder="Enter agent name..."
                        style={{
                          flex: 1,
                          background: "#111",
                          border: "1px solid #2a2a2a",
                          borderRadius: "8px",
                          padding: "10px 14px",
                          color: "#fff",
                          fontFamily: "monospace",
                          fontSize: "0.75rem",
                          outline: "none",
                          caretColor: "#00ff41",
                        }}
                      />
                      <button
                        type="button"
                        onClick={searchMyAgent}
                        style={{
                          padding: "10px 20px",
                          borderRadius: "8px",
                          border: "none",
                          cursor: "pointer",
                          background: "#00ff41",
                          color: "#000",
                          fontFamily: "monospace",
                          fontSize: "0.72rem",
                          fontWeight: "bold",
                        }}
                      >
                        SEARCH
                      </button>
                    </div>
                  </div>

                  {myAgentLoading && (
                    <div style={{ textAlign: "center", color: "#444", fontFamily: "monospace", padding: "20px" }}>
                      Searching...
                    </div>
                  )}

                  {myAgentData && (
                    <div
                      style={{
                        background: "#0a0a0a",
                        border: "1px solid #1a3a1a",
                        borderRadius: "12px",
                        padding: "16px",
                      }}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        style={{
                          color: "#00ff41",
                          fontFamily: "monospace",
                          fontSize: "0.9rem",
                          fontWeight: "bold",
                          marginBottom: "16px",
                          cursor: "pointer",
                          textDecoration: "underline",
                          textDecorationColor: "#1a3a1a",
                        }}
                        onClick={() => {
                          window.location.href = `/agent/${myAgentData.agent_id}`;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            window.location.href = `/agent/${myAgentData.agent_id}`;
                          }
                        }}
                      >
                        {myAgentData.agent_name} ↗
                      </div>
                      <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                        {[
                          { label: "BALANCE", value: `$${myAgentData.portfolio?.balance?.toFixed(2)}` },
                          { label: "PnL", value: `$${myAgentData.portfolio?.total_pnl?.toFixed(3)}` },
                          { label: "TRADES", value: myAgentData.portfolio?.total_trades },
                          { label: "WIN RATE", value: `${myAgentData.portfolio?.win_rate?.toFixed(0)}%` },
                        ].map((item) => (
                          <div
                            key={item.label}
                            style={{ background: "#111", borderRadius: "8px", padding: "10px 14px" }}
                          >
                            <div
                              style={{
                                color: "#444",
                                fontSize: "0.58rem",
                                fontFamily: "monospace",
                                letterSpacing: "1px",
                                marginBottom: "4px",
                              }}
                            >
                              {item.label}
                            </div>
                            <div
                              style={{
                                color: "#00ff41",
                                fontSize: "0.85rem",
                                fontFamily: "monospace",
                                fontWeight: "bold",
                              }}
                            >
                              {item.value}
                            </div>
                          </div>
                        ))}
                      </div>

                      {myAgentData.positions?.length > 0 && (
                        <div style={{ marginBottom: "12px" }}>
                          <div
                            style={{
                              color: "#444",
                              fontSize: "0.6rem",
                              fontFamily: "monospace",
                              letterSpacing: "1px",
                              marginBottom: "8px",
                            }}
                          >
                            OPEN POSITIONS
                          </div>
                          {myAgentData.positions.map((pos: any, i: number) => (
                            <div
                              key={i}
                              style={{
                                display: "flex",
                                gap: "10px",
                                background: "#111",
                                borderRadius: "8px",
                                padding: "8px 12px",
                                marginBottom: "6px",
                                alignItems: "center",
                              }}
                            >
                              <span
                                style={{
                                  color: pos.direction === "LONG" ? "#00ff41" : "#ff4444",
                                  fontSize: "0.68rem",
                                  fontFamily: "monospace",
                                  fontWeight: "bold",
                                }}
                              >
                                {pos.direction}
                              </span>
                              <span style={{ color: "#fff", fontSize: "0.68rem", fontFamily: "monospace" }}>
                                {pos.pair}
                              </span>
                              <span style={{ color: "#555", fontSize: "0.62rem", fontFamily: "monospace", flex: 1 }}>
                                entry ${pos.entry?.toLocaleString()}
                              </span>
                              <span style={{ color: "#ffaa00", fontSize: "0.62rem", fontFamily: "monospace" }}>
                                LIVE
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div
                        style={{
                          color: "#444",
                          fontSize: "0.6rem",
                          fontFamily: "monospace",
                          letterSpacing: "1px",
                          marginBottom: "8px",
                        }}
                      >
                        TRADE HISTORY
                      </div>
                      {myAgentData.trades?.map((t: any, i: number) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            gap: "8px",
                            padding: "6px 0",
                            borderBottom: "1px solid #111",
                            alignItems: "center",
                          }}
                        >
                          <span
                            style={{
                              color: t.direction === "LONG" ? "#00ff41" : "#ff4444",
                              fontSize: "0.65rem",
                              fontFamily: "monospace",
                              width: "40px",
                            }}
                          >
                            {t.direction}
                          </span>
                          <span style={{ color: "#777", fontSize: "0.65rem", fontFamily: "monospace", width: "40px" }}>
                            {t.pair}
                          </span>
                          <span style={{ color: "#555", fontSize: "0.62rem", fontFamily: "monospace", flex: 1 }}>
                            ${t.entry?.toLocaleString()} → {t.exit ? `$${t.exit?.toLocaleString()}` : "OPEN"}
                          </span>
                          <span
                            style={{
                              color: t.pnl > 0 ? "#00ff41" : t.pnl < 0 ? "#ff4444" : "#555",
                              fontSize: "0.65rem",
                              fontFamily: "monospace",
                              width: "70px",
                              textAlign: "right",
                            }}
                          >
                            {t.pnl ? `${t.pnl > 0 ? "+" : ""}$${t.pnl.toFixed(3)}` : "—"}
                          </span>
                          {t.proof && (
                            <a
                              href={`/zco/${t.proof}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: "#ffaa00",
                                fontSize: "0.6rem",
                                fontFamily: "monospace",
                                textDecoration: "none",
                              }}
                            >
                              ⚡ZCO
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {perpsTab === "proofs" && (
                <div
                  style={{
                    background: "#0a0a0a",
                    border: "1px solid #1a1a1a",
                    borderRadius: "12px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #1a1a1a",
                      color: "#444",
                      fontSize: "0.6rem",
                      fontFamily: "monospace",
                      letterSpacing: "1px",
                    }}
                  >
                    ZCO PROOFS ON WALRUS — verified profitable trades
                  </div>
                  {perpsProofs.length === 0 && (
                    <div
                      style={{
                        padding: "40px",
                        textAlign: "center",
                        color: "#333",
                        fontFamily: "monospace",
                        fontSize: "0.7rem",
                      }}
                    >
                      Loading proofs...
                    </div>
                  )}
                  {perpsProofs.map((p: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "12px 16px",
                        borderBottom: "1px solid #0d0d0d",
                      }}
                    >
                      <div style={{ color: "#ffaa00", fontSize: "0.8rem" }}>⚡</div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            color: "#fff",
                            fontSize: "0.72rem",
                            fontFamily: "monospace",
                            marginBottom: "2px",
                          }}
                        >
                          {p.agent_name}
                        </div>
                        <div style={{ color: "#555", fontSize: "0.6rem", fontFamily: "monospace" }}>
                          {p.direction} {p.pair} • entry ${p.entry_price?.toLocaleString()} → exit $
                          {p.exit_price?.toLocaleString()}
                        </div>
                      </div>
                      <div
                        style={{
                          color: "#00ff41",
                          fontSize: "0.78rem",
                          fontFamily: "monospace",
                          fontWeight: "bold",
                        }}
                      >
                        +${p.pnl?.toFixed(3)}
                      </div>
                      <a
                        href={`/zco/${p.walrus_blob_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                          background: "#0a1a0a",
                          border: "1px solid #1a3a1a",
                          borderRadius: "6px",
                          padding: "5px 10px",
                          color: "#00ff41",
                          fontSize: "0.65rem",
                          fontFamily: "monospace",
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#1a2a1a";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "#0a1a0a";
                        }}
                      >
                        WALRUS ↗
                      </a>
                    </div>
                  ))}
                </div>
              )}

              {selectedAgent && selectedAgent.trades && perpsTab === "leaderboard" && (
                <div
                  style={{
                    marginTop: "16px",
                    background: "#0a0a0a",
                    border: "1px solid #1a3a1a",
                    borderRadius: "12px",
                    padding: "16px",
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
                    <div
                      style={{
                        color: "#00ff41",
                        fontFamily: "monospace",
                        fontSize: "0.8rem",
                        fontWeight: "bold",
                      }}
                    >
                      {selectedAgent.agent_name}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedAgent(null)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#444",
                        cursor: "pointer",
                        fontSize: "1rem",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: "16px", marginBottom: "12px", flexWrap: "wrap" }}>
                    {[
                      { label: "BALANCE", value: `$${selectedAgent.portfolio?.balance?.toFixed(2)}` },
                      { label: "TOTAL PnL", value: `$${selectedAgent.portfolio?.total_pnl?.toFixed(3)}` },
                      { label: "TRADES", value: selectedAgent.portfolio?.total_trades },
                      { label: "WIN RATE", value: `${selectedAgent.portfolio?.win_rate?.toFixed(0)}%` },
                    ].map((item) => (
                      <div
                        key={item.label}
                        style={{ background: "#111", borderRadius: "8px", padding: "8px 12px" }}
                      >
                        <div
                          style={{
                            color: "#444",
                            fontSize: "0.58rem",
                            fontFamily: "monospace",
                            letterSpacing: "1px",
                          }}
                        >
                          {item.label}
                        </div>
                        <div
                          style={{
                            color: "#00ff41",
                            fontSize: "0.8rem",
                            fontFamily: "monospace",
                            fontWeight: "bold",
                          }}
                        >
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    style={{
                      color: "#444",
                      fontSize: "0.6rem",
                      fontFamily: "monospace",
                      letterSpacing: "1px",
                      marginBottom: "8px",
                    }}
                  >
                    TRADE HISTORY
                  </div>
                  {selectedAgent.trades?.slice(0, 10).map((t: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "6px 0",
                        borderBottom: "1px solid #111",
                      }}
                    >
                      <div
                        style={{
                          color: t.direction === "LONG" ? "#00ff41" : "#ff4444",
                          fontSize: "0.65rem",
                          fontFamily: "monospace",
                          width: "40px",
                        }}
                      >
                        {t.direction}
                      </div>
                      <div
                        style={{
                          color: "#777",
                          fontSize: "0.65rem",
                          fontFamily: "monospace",
                          width: "40px",
                        }}
                      >
                        {t.pair}
                      </div>
                      <div
                        style={{
                          color: "#555",
                          fontSize: "0.62rem",
                          fontFamily: "monospace",
                          flex: 1,
                        }}
                      >
                        ${t.entry?.toLocaleString()} →{" "}
                        {t.exit ? `$${t.exit?.toLocaleString()}` : "OPEN"}
                      </div>
                      <div
                        style={{
                          color: t.pnl > 0 ? "#00ff41" : t.pnl < 0 ? "#ff4444" : "#555",
                          fontSize: "0.65rem",
                          fontFamily: "monospace",
                          width: "60px",
                          textAlign: "right",
                        }}
                      >
                        {t.pnl ? `${t.pnl > 0 ? "+" : ""}$${t.pnl.toFixed(3)}` : "-"}
                      </div>
                      {t.proof && (
                        <a
                          href={`https://aggregator.walrus-testnet.walrus.space/v1/${t.proof}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "#ffaa00",
                            fontSize: "0.6rem",
                            fontFamily: "monospace",
                            textDecoration: "none",
                          }}
                          title="View ZCO proof on Walrus"
                        >
                          ⚡ZCO
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "lab" && <Lab />}
          {activeTab === "research" && <Lab />}
          {activeTab === "archive" && <Archive />}
      </SharedLayout>
      )}

        {!standalone && chatAgent ? (
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

      <style jsx global>{`
        .page {
          position: relative;
          min-height: 100vh;
          overflow: visible;
          background: transparent;
          color: #ffffff;
          font-family: var(--font-sans);
        }
        .zionHero {
          position: relative;
          z-index: 2;
          width: 100%;
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000000;
          overflow: visible;
        }
        .zionHeroOverlay {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
          background: radial-gradient(
            ellipse 70% 60% at 50% 50%,
            transparent 0%,
            rgba(0, 0, 0, 0.45) 60%,
            rgba(0, 0, 0, 0.82) 100%
          );
        }
        .zionHeroTopBar {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 3;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 40px;
        }
        .zionHeroTopBarMobile {
          padding: 16px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .zionHeroRunTime {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--text-mono);
        }
        .zionHeroAuth {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .zionHeroContent {
          position: relative;
          z-index: 2;
          text-align: center;
          padding: 0 24px 8vh;
          max-width: 900px;
        }
        .zionHeroTitle {
          margin: 0 0 20px;
          font-family: var(--font-sans);
          font-size: clamp(2.5rem, 7vw, 4.5rem);
          font-weight: 200;
          letter-spacing: 0.3em;
          color: #ffffff;
          text-shadow: 0 0 40px rgba(0, 0, 0, 0.9);
        }
        .zionHeroSubtitle {
          margin: 0 0 28px;
          font-family: var(--font-mono);
          font-size: 14px;
          font-weight: 400;
          line-height: 1.7;
          color: #c8e8ff;
          opacity: 0.75;
          letter-spacing: 0.02em;
        }
        .zionHeroLabel {
          margin: 0;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #c8e8ff;
          opacity: 0.55;
        }
        .belowHeroShell {
          position: relative;
          z-index: 2;
          background:
            radial-gradient(ellipse at 20% 50%, rgba(0, 100, 150, 0.04) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 20%, rgba(0, 50, 120, 0.03) 0%, transparent 50%),
            transparent;
          overflow: visible;
        }
        .liveMetricsBar {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          background: rgba(0, 0, 0, 0.55);
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          position: relative;
          z-index: 2;
        }
        .liveMetric {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .liveMetricLabel {
          font-size: 9px;
          color: #64748b;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .liveMetricValue {
          font-size: 15px;
          color: #00ff88;
          font-weight: bold;
          font-family: monospace;
        }
        .liveMetricDivider {
          width: 1px;
          height: 32px;
          background: rgba(100, 116, 139, 0.3);
          flex-shrink: 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .introFullscreen *:not(canvas) {
            animation: none !important;
            opacity: 1 !important;
          }
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
          z-index: 2;
          max-width: 1400px;
          margin: 0 auto;
          padding: 32px 40px 64px;
          opacity: 1;
          background: transparent;
        }
        .mainNav {
          position: sticky;
          top: 0;
          z-index: 3;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 4px 8px;
          padding: 0 0 24px;
          margin: 0 0 32px;
          background: rgba(0, 0, 0, 0.72);
          border-bottom: 1px solid var(--border);
        }
        .navTab {
          background: transparent;
          border: none;
          border-bottom: 1px solid transparent;
          padding: 10px 0;
          margin: 0 16px 0 0;
          font-size: 11px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--text-secondary);
          cursor: pointer;
          font-family: var(--font-sans);
          font-weight: 300;
          transition: color 0.15s ease, border-color 0.15s ease;
        }
        .navTab:hover {
          color: #ffffff;
        }
        .navTab.active {
          color: #ffffff;
          border-bottom-color: rgba(255, 255, 255, 0.4);
          font-weight: 400;
        }
        .tabPanels {
          position: relative;
          z-index: 2;
          padding-bottom: 32px;
        }
        .tabIntro {
          margin: 0 0 16px;
          font-family: var(--font-mono);
          font-size: 0.72rem;
          color: var(--text-secondary);
          line-height: 1.5;
          max-width: 720px;
          letter-spacing: 0.02em;
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
          border-radius: 3px;
          border: none;
          border-top: 1px solid rgba(255, 255, 255, 0.15);
          border-left: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(8, 16, 28, 0.6);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow:
            0 2px 4px rgba(0, 0, 0, 0.4),
            0 8px 24px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
          padding: 12px;
          cursor: pointer;
          transition: box-shadow 0.15s ease, transform 0.15s ease;
        }
        .chatClassCard:hover {
          background: rgba(12, 22, 36, 0.72);
          box-shadow:
            0 4px 8px rgba(0, 0, 0, 0.45),
            0 12px 28px rgba(0, 0, 0, 0.35),
            inset 0 1px 0 rgba(255, 255, 255, 0.12);
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
        .chatClassIcon3D {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 160px;
          height: 160px;
          margin: 0 auto 12px;
        }
        .chatClassIcon3D .classIcon3DWrap {
          width: 160px;
          height: 160px;
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
        .chatClassCardBig.elite:hover,
        .chatClassCardBig.middle:hover,
        .chatClassCardBig.poor:hover {
          transform: translateY(-2px);
        }
        .chatClassBackBtn {
          margin: 0 0 14px;
          border-radius: 2px;
          border: 1px solid var(--border);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          padding: 10px 14px;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          font-family: var(--font-mono);
          cursor: pointer;
        }
        .chatClassBackBtn:hover {
          color: var(--text-primary);
          border-color: var(--accent);
        }
        .chronicleSection {
          margin-top: 22px;
          width: 100%;
          padding: 14px;
          border-radius: 2px;
          border: 1px solid var(--border);
          background: var(--bg-secondary);
          box-shadow: none;
        }
        .chronicleHead {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px 16px;
          margin-bottom: 12px;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border);
        }
        .chronicleTitle {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: var(--font-mono);
          font-size: clamp(0.72rem, 2vw, 0.85rem);
          letter-spacing: 0.14em;
          color: var(--text-primary);
          text-transform: uppercase;
          text-shadow: none;
        }
        .chronicleLiveDot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
          box-shadow: none;
          animation: none;
        }
        .chronicleFeedHint {
          font-family: var(--font-mono);
          font-size: 0.62rem;
          letter-spacing: 0.1em;
          color: var(--text-muted);
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
          border-radius: 2px;
          border: 1px solid var(--border);
          border-left: 2px solid var(--border);
          background: var(--bg-secondary);
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
          overflow: visible;
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
          border: 1px dashed rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.02);
        }
        .placeholderTab h2 {
          margin: 0 0 10px;
          color: #ffffff;
          letter-spacing: 0.12em;
        }
        .placeholderTab p {
          margin: 0;
          color: rgba(255, 255, 255, 0.55);
          font-size: 0.85rem;
        }
        .stubTabSection {
          padding: 64px 24px 48px;
          text-align: center;
          max-width: 720px;
          margin: 0 auto;
        }
        .stubTabTitle {
          margin: 0 0 16px;
          font-family: var(--font-sans);
          font-size: clamp(1.5rem, 4vw, 2.25rem);
          font-weight: 200;
          letter-spacing: 0.28em;
          color: #ffffff;
          text-transform: uppercase;
        }
        .stubTabSubtitle {
          margin: 0 0 20px;
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.06em;
          color: rgba(255, 255, 255, 0.55);
        }
        .stubTabMeta {
          margin: 0 0 28px;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.04em;
          color: rgba(255, 255, 255, 0.35);
        }
        .stubTabBody {
          margin: 0;
          font-family: var(--font-mono);
          font-size: 13px;
          letter-spacing: 0.04em;
          color: rgba(255, 255, 255, 0.45);
        }
        .zionBetTab {
          margin-top: 4px;
          padding-bottom: 24px;
          font-family: var(--font-sans);
          color: var(--text-primary);
          position: relative;
          z-index: 2;
          pointer-events: auto;
        }
        .prediction-engine-shell {
          position: relative;
          z-index: 2;
          pointer-events: auto;
        }
        .prediction-engine-shell .tabPanels {
          position: relative;
          z-index: 2;
          pointer-events: auto;
        }
        .prediction-engine-shell .zionBetCatTabActive,
        .prediction-engine-shell .zionBetCatTabActive.zionBetCatTabActive--zion {
          background: rgba(255, 255, 255, 0.08);
          border-color: var(--accent);
          color: var(--text-primary);
        }
        .prediction-engine-shell .zionBetTimeframeItem--active {
          background: rgba(255, 255, 255, 0.08) !important;
          color: #f0f6fc !important;
        }
        .prediction-engine-shell .zionBetTimeframeItem:hover:not(.zionBetTimeframeItem--active) {
          background: rgba(255, 255, 255, 0.05) !important;
        }
        .prediction-engine-shell .zionBetToast {
          color: #e6edf3;
        }
        .prediction-engine-shell .zionBetToastDisclaimer {
          color: rgba(255, 255, 255, 0.55);
        }
        .prediction-engine-shell .zionBetToast--success {
          color: #86efac;
        }
        .prediction-engine-shell .zionBetToast--error {
          color: #fca5a5;
        }
        .prediction-engine-shell .zionBetToast--warning {
          color: #fcd34d;
        }
        .zionBetHeader {
          margin: 0 0 20px;
          padding-bottom: 16px;
          border-bottom: 1px solid var(--border);
        }
        .zionBetTitle {
          margin: 0 0 8px;
          font-family: var(--font-mono);
          font-size: clamp(0.85rem, 2vw, 1rem);
          font-weight: 500;
          letter-spacing: 0.18em;
          color: var(--text-primary);
          text-transform: uppercase;
          text-shadow: none;
        }
        .zionBetSubtitle {
          margin: 0;
          font-family: var(--font-mono);
          font-size: 0.72rem;
          letter-spacing: 0.04em;
          color: var(--text-secondary);
        }
        .zionBetSectionTitle {
          font-family: var(--font-mono) !important;
          font-size: 11px !important;
          font-weight: 500 !important;
          letter-spacing: 0.12em !important;
          color: var(--text-secondary) !important;
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
        .zionBetToastDisclaimer {
          margin-top: 6px;
          font-size: 11px;
          color: #6b7280;
          font-style: italic;
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
        .zionBetToast--warning {
          border-color: #fde68a;
          background: #fffbeb;
          color: #92400e;
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
          overflow: visible;
        }
        .zionBetMyBetQuestionLine {
          flex: 1;
          min-width: 0;
          font-weight: 600;
          font-size: 12px;
          color: #e8fff0;
          white-space: nowrap;
          overflow: visible;
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
          overflow: visible;
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
        .zionBetInstrument {
          --color-background-primary: var(--bg-primary);
          --color-background-secondary: var(--bg-secondary);
          --color-border-tertiary: var(--border);
          --color-text-primary: var(--text-primary);
          --color-text-secondary: var(--text-secondary);
          --zb-card-bg: var(--bg-secondary);
          --zb-card-border: var(--border);
          font-family: var(--font-sans);
        }
        .zionBetCatTabs {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin: 0 0 16px;
          padding-bottom: 0;
          border-bottom: none;
          position: relative;
          z-index: 3;
          pointer-events: auto;
        }
        .zionBetCatTab {
          padding: 6px 12px;
          border-radius: 2px;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text-secondary);
          font-size: 11px;
          cursor: pointer;
          font-family: var(--font-mono);
          font-weight: 500;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          position: relative;
          z-index: 3;
          pointer-events: auto;
        }
        .zionBetCatTab:hover {
          color: var(--text-primary);
          border-color: var(--accent);
        }
        .zionBetCatTabActive {
          background: var(--bg-card);
          border: 1px solid var(--accent);
          color: var(--text-primary);
          box-shadow: none;
        }
        .zionBetCatTabActive.zionBetCatTabActive--zion {
          background: var(--bg-card);
          border: 1px solid var(--accent);
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
          cursor: pointer;
          box-sizing: border-box;
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
          overflow: visible;
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
          overflow: visible;
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
        .statsGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 28px;
        }
        .statCard {
          border-radius: 0;
          border: 1px solid var(--border-subtle);
          background: var(--bg-glass);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          padding: 20px 22px;
        }
        .statCardLabel {
          margin: 0;
          font-size: 0.62rem;
          font-weight: 500;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }
        .statCardValue {
          margin: 12px 0 10px;
          font-family: var(--font-sans);
          font-size: clamp(2rem, 4vw, 3rem);
          font-weight: 700;
          color: #ffffff;
          line-height: 1;
          letter-spacing: -0.02em;
        }
        .statCardValueDanger {
          color: var(--danger);
        }
        .statCardSub {
          margin: 0 0 10px;
          font-size: 0.65rem;
          color: var(--text-muted);
          letter-spacing: 0.06em;
        }
        .statCardRule {
          height: 1px;
          background: var(--border);
          width: 100%;
        }
        .planetHeroSection {
          position: relative;
          margin-bottom: 24px;
          overflow: visible;
          min-height: 420px;
          background: transparent;
          border: none;
        }
        .planetHeroSection .civilizationSidebarRow {
          position: relative;
          z-index: 1;
          padding: 12px;
          gap: 16px;
          margin-bottom: 0;
        }
        .zcoResearchPanel {
          position: relative;
          z-index: 1;
        }
        .zcoResearchHeader {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          background: transparent;
        }
        .zcoResearchLiveDot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #ffffff;
          opacity: 0.8;
        }
        .zcoResearchTitle {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          letter-spacing: 0.12em;
          color: var(--text-primary);
          text-transform: uppercase;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        }
        .zcoResearchUpdated {
          margin-left: auto;
          font-family: var(--font-mono);
          font-size: 0.62rem;
          color: var(--text-muted);
        }
        .zcoResearchEmpty {
          margin: 0;
          padding: 14px 12px;
          font-family: var(--font-mono);
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .zcoResearchTableWrap {
          overflow-x: auto;
        }
        .zcoResearchTable {
          width: 100%;
          border-collapse: collapse;
          font-family: var(--font-mono);
          font-size: 0.72rem;
        }
        .zcoResearchTable th {
          text-align: left;
          padding: 10px 12px;
          color: var(--text-secondary);
          font-weight: 500;
          letter-spacing: 0.1em;
          font-size: 0.6rem;
          border-bottom: 1px solid var(--border);
          background: var(--bg-card);
        }
        .zcoResearchTable td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          color: var(--text-primary);
          vertical-align: top;
        }
        .zcoResearchTable tr:last-child td {
          border-bottom: none;
        }
        .zcoTypeLabel {
          color: var(--text-secondary);
          font-size: 0.68rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .labDataCardGrid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 12px;
        }
        .labDataCardSkeleton {
          min-height: 120px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          pointer-events: none;
          opacity: 0.6;
        }
        .labSkeletonLine {
          height: 10px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.08);
          animation: labSkeletonPulse 1.4s ease-in-out infinite;
        }
        .labSkeletonLineWide {
          width: 72%;
          height: 14px;
        }
        .labSkeletonLineShort {
          width: 45%;
        }
        @keyframes labSkeletonPulse {
          0%,
          100% {
            opacity: 0.45;
          }
          50% {
            opacity: 0.9;
          }
        }
        .labDataCardHead {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }
        .labDataCardTitle {
          font-family: var(--font-sans);
          font-size: 0.85rem;
        }
        .labDataCardBadge {
          font-family: var(--font-mono);
          text-transform: uppercase;
          white-space: nowrap;
        }
        .labDataCardSubrow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }
        .labDataCardMeta {
          font-family: var(--font-mono);
        }
        .labDataCardStats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .labDataCardStat {
          text-align: center;
        }
        .labDataCardStatLabel {
          display: block;
          font-family: var(--font-mono);
          margin-bottom: 4px;
        }
        .labDataCardStatValue {
          display: block;
          font-size: 0.9rem;
        }
        .zcoResearchDesc {
          color: var(--text-secondary);
          max-width: 420px;
          line-height: 1.4;
        }
        .zcoResearchConsensus {
          color: var(--text-primary);
          white-space: nowrap;
          letter-spacing: 0.04em;
        }
        .zcoResearchLink {
          color: var(--accent);
          text-decoration: none;
        }
        .zcoResearchLink:hover {
          text-decoration: underline;
        }
        .zcoResearchMuted {
          color: var(--text-muted);
        }
        .fieldObservationMeta {
          color: var(--text-secondary) !important;
        }
        .constitutionBannerRow {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px 14px;
          font-family: var(--font-mono);
          font-size: 0.68rem;
          letter-spacing: 0.06em;
        }
        .constitutionBannerRowSub {
          margin-top: 8px;
          padding-top: 8px;
          border-top: 1px solid var(--border);
        }
        .constitutionBannerItem {
          color: var(--text-primary);
        }
        .constitutionBannerItem strong {
          font-weight: 500;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
        }
        .constitutionBannerMuted {
          color: var(--text-secondary);
        }
        .constitutionBannerDivider {
          color: var(--text-muted);
        }
        .constitutionBannerLink {
          color: var(--accent);
          text-decoration: none;
          font-weight: 500;
        }
        .constitutionBannerLink:hover {
          text-decoration: underline;
        }
        @keyframes barFill {
          from { width: 0; }
          to { width: var(--bar-width); }
        }
        .ecoTermRoot {
          background: var(--bg-primary);
        }
        .ecoHudWrap {
          position: relative;
          padding: 16px 18px;
        }
        .ecoDashLayout {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 8px;
        }
        .ecoRow4,
        .ecoRow2,
        .ecoRow3 {
          display: grid;
          gap: 12px;
        }
        .ecoRect {
          min-width: 0;
        }
        .ecoBarFillAnim {
          width: 0;
          animation: barFill 1s ease-out forwards;
        }
        .ecoHudHeader {
          margin-bottom: 10px;
        }
        .ecoHudHeader h2 {
          margin: 0;
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 500;
          text-shadow: none;
        }
        .ecoHudHeader p {
          margin: 4px 0 0;
          color: var(--text-secondary);
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.04em;
        }
        .zionSectionHeader {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 20px 0 14px;
        }
        .zionSectionLine {
          flex: 1;
          height: 1px;
          background: var(--border);
        }
        .zionSectionTitle {
          color: var(--text-secondary);
          font-family: var(--font-mono);
          font-size: 0.72rem;
          letter-spacing: 0.14em;
          white-space: nowrap;
          text-transform: uppercase;
        }
        .zionCardGrid {
          display: grid;
          gap: 12px;
          margin-bottom: 4px;
        }
        .zionSectionSep {
          border-top: 1px solid rgba(0, 255, 136, 0.1);
          margin: 20px 0;
        }
        .zionTermCard {
          position: relative;
          border-radius: 4px;
          padding: 16px;
          overflow: visible;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          border: 1px solid rgba(0, 255, 136, 0.2);
          background: rgba(0, 10, 30, 0.8);
        }
        .zionTermCardInner {
          position: relative;
          z-index: 1;
        }
        .zionTermCardScanlines {
          pointer-events: none;
          position: absolute;
          inset: 0;
          z-index: 0;
          background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 255, 136, 0.025) 2px,
            rgba(0, 255, 136, 0.025) 4px
          );
        }
        .zionTermCardCrisis {
          animation: ecoCrisisPulseAnim 1.8s ease-in-out infinite;
        }
        .zionTermLabel {
          color: #00ffcc;
          font-size: 0.6rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .zionTermValue {
          font-weight: bold;
          line-height: 1.2;
        }
        .zionTermValueMd { font-size: 1.1rem; }
        .zionTermValueLg { font-size: 1.35rem; }
        .zionTermValueSm { font-size: 0.85rem; }
        .zionMetricGrid {
          display: grid;
          gap: 8px;
        }
        .zionMetricCell {
          text-align: center;
        }
        .zionGovCardHead {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 12px;
        }
        .zionGovName {
          color: #00ff88;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-weight: bold;
          font-size: 0.82rem;
          letter-spacing: 0.05em;
          word-break: break-word;
        }
        .zionSectorBadge {
          flex-shrink: 0;
          font-size: 0.55rem;
          padding: 2px 6px;
          border-radius: 2px;
          border: 1px solid var(--border);
          color: var(--text-secondary);
          background: var(--bg-card);
          font-family: var(--font-mono);
          letter-spacing: 0.08em;
          white-space: nowrap;
          text-transform: uppercase;
        }
        .zionPowerRow {
          display: grid;
          grid-template-columns: 72px 1fr auto;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
          font-size: 0.68rem;
        }
        .zionPowerLabel {
          color: #00ffcc;
          letter-spacing: 0.08em;
        }
        .zionPowerBar {
          letter-spacing: -1px;
          font-size: 0.62rem;
          overflow: visible;
        }
        .zionPowerValue {
          color: #fff;
          font-weight: bold;
          min-width: 48px;
          text-align: right;
        }
        .zionPowerRisks {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: flex-start;
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid rgba(0, 255, 136, 0.12);
        }
        .zionRiskTag {
          font-size: 0.62rem;
          font-weight: bold;
          letter-spacing: 0.06em;
        }
        .zionRiskDictator { color: #ffaa00; }
        .zionRiskCoup { color: #ff4444; }
        .zionCrisisTitle {
          color: #ff4444;
          font-weight: bold;
          font-size: 0.9rem;
          letter-spacing: 0.12em;
          text-align: center;
          margin-bottom: 12px;
          text-shadow: 0 0 10px rgba(255, 68, 68, 0.4);
        }
        .zionCrisisOk {
          color: #00ff88;
          font-size: 0.78rem;
          text-align: center;
          margin-bottom: 10px;
          letter-spacing: 0.08em;
        }
        .zionPanelTitle {
          color: #00ff88;
          font-size: 0.65rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          margin-bottom: 8px;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(0, 255, 136, 0.12);
        }
        .zionPollRowHead {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        .zionSenateMeta {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 0.68rem;
          color: #00ffcc;
          letter-spacing: 0.08em;
          margin-bottom: 12px;
        }
        .zionScrollFeed {
          max-height: 220px;
          overflow-y: auto;
        }
        .zionFeedLine {
          font-size: 0.68rem;
          padding: 6px 0;
          border-bottom: 1px solid rgba(0, 255, 136, 0.06);
          overflow: visible;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .zionFeedTime {
          color: #00ff88;
          margin-right: 6px;
        }
        .zionEmpty {
          color: #667788;
          font-size: 0.72rem;
          font-style: italic;
        }
        .zionAlertBanner {
          padding: 8px 12px;
          margin-bottom: 10px;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          border-radius: 6px;
        }
        .zionAlertDanger {
          border: 1px solid rgba(255, 68, 68, 0.5);
          background: rgba(40, 0, 0, 0.45);
          color: #ff4444;
        }
        .zionAlertWarn {
          border: 1px solid rgba(255, 170, 0, 0.4);
          background: rgba(40, 25, 0, 0.35);
          color: #ffaa00;
        }
        .zionPopStressSub {
          margin-top: 8px;
          text-align: center;
          color: #ffaa00;
          font-size: 0.78rem;
          font-family: "JetBrains Mono", ui-monospace, monospace;
        }
        .zionIntelRow {
          padding: 8px 0;
          border-bottom: 1px solid rgba(0, 255, 136, 0.08);
          font-size: 0.72rem;
        }
        .zionIntelReason {
          color: #667788;
          font-size: 0.65rem;
          font-style: italic;
          margin-top: 4px;
        }
        .ecoNewsTicker {
          position: relative;
          margin-top: 8px;
          display: flex;
          align-items: stretch;
          background: #0a0800;
          border: 1px solid #ffd700;
          overflow: visible;
        }
        .ecoNewsTickerBadge {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          padding: 0 12px;
          background: #0a0800;
          border-right: 1px solid #ffd700;
          color: #ffd700;
          font-size: 11px;
          font-weight: bold;
          letter-spacing: 2px;
        }
        .ecoNewsTickerViewport {
          flex: 1;
          overflow: visible;
          min-height: 34px;
          display: flex;
          align-items: center;
        }
        .ecoNewsTickerTrack {
          display: flex;
          width: max-content;
          animation: ecoNewsScroll 90s linear infinite;
          will-change: transform;
        }
        @keyframes ecoNewsScroll {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        .ecoNewsItem {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 0 32px;
          font-size: 12px;
          white-space: nowrap;
        }
        .ecoNewsItem.normal { color: #ffffff; }
        .ecoNewsItem.breaking {
          color: #ff4444;
          font-weight: bold;
        }
        .ecoAlertStrip {
          padding: 8px 10px;
          background: #050505;
          border: 1px solid #2a2a2a;
          color: #ffffff;
          font-size: 12px;
          letter-spacing: 1px;
        }
        .ecoAlertStripDanger {
          border: 1px solid #ff4444;
          color: #ff4444;
        }
        .ecoMartialBanner {
          padding: 6px 8px;
          border: 1px solid #ff4444;
          color: #ff4444;
          font-weight: bold;
        }
        .ecoCrisisPulse {
          animation: ecoCrisisPulseAnim 1.5s ease-in-out infinite;
        }
        .ecoCrisisBanner {
          color: #ff4444;
          font-weight: bold;
          font-size: 14px;
          letter-spacing: 1px;
          margin-bottom: 10px;
          text-align: center;
        }
        @keyframes ecoCrisisPulseAnim {
          0%, 100% { box-shadow: inset 0 0 0 0 rgba(255, 68, 68, 0); }
          50% { box-shadow: inset 0 0 24px rgba(255, 68, 68, 0.35); }
        }
        .ecoCmdGrid {
          display: grid;
          gap: 8px;
        }
        .ecoCmdPanel {
          border-radius: 0;
          padding: 8px 10px;
          background: rgba(0, 0, 0, 0.88);
          border: 1px solid rgba(0, 255, 136, 0.18);
          border-left-width: 4px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ecoCmdMicro {
          font-size: 0.52rem;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #555;
        }
        .ecoCmdNameGold {
          font-size: 1.05rem;
          font-weight: bold;
          color: #ffd700;
          line-height: 1.15;
          text-shadow: 0 0 12px rgba(255, 215, 0, 0.25);
        }
        .ecoCmdNameGreen {
          font-size: 1rem;
          font-weight: bold;
          color: #00ff88;
          line-height: 1.15;
        }
        .ecoPartyTag {
          display: inline-block;
          font-size: 0.58rem;
          color: #666;
          padding: 1px 6px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          margin-top: 2px;
        }
        .ecoSheriffPill {
          display: inline-block;
          align-self: flex-start;
          padding: 2px 8px;
          font-size: 0.55rem;
          font-weight: bold;
          letter-spacing: 1px;
          border-radius: 0;
          border: 1px solid;
        }
        .ecoCmdStateHuge {
          font-size: clamp(0.9rem, 2vw, 1.3rem);
          font-weight: bold;
          letter-spacing: 1px;
          line-height: 1.1;
        }
        .ecoCmdRevHuge {
          font-size: 2rem;
          font-weight: bold;
          line-height: 1;
          text-shadow: 0 0 16px currentColor;
        }
        .ecoCmdRevLabel {
          font-size: 0.55rem;
          letter-spacing: 2px;
          color: #666;
          text-transform: uppercase;
        }
        .ecoDangerWarn {
          display: inline-flex;
          flex-direction: column;
          gap: 1px;
          padding: 3px 8px;
          border: 1px solid;
          font-size: 0.52rem;
        }
        .ecoDangerWarnLabel { opacity: 0.85; letter-spacing: 1px; }
        .ecoDangerWarnValue { font-size: 0.68rem; font-weight: bold; }
        .ecoMiniBar {
          height: 4px;
          width: 100%;
          background: rgba(255, 255, 255, 0.1);
          margin-top: 4px;
        }
        .ecoMiniBarFill { height: 100%; transition: width 0.4s; }
        .ecoHudPanel {
          border-radius: 0;
          padding: 8px 10px;
          background: rgba(0, 0, 0, 0.82);
          border: 1px solid rgba(0, 255, 136, 0.2);
        }
        .ecoHudPanelTitle {
          font-size: 0.55rem;
          font-weight: bold;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: #ffd700;
          margin-bottom: 8px;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(0, 255, 136, 0.12);
        }
        .ecoPollRow {
          padding: 6px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .ecoPollRow:last-child { border-bottom: none; }
        .ecoPollHead {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.68rem;
          margin-bottom: 3px;
        }
        .ecoPollBarLine {
          font-size: 0.62rem;
          letter-spacing: 1px;
          margin-bottom: 3px;
        }
        .ecoPollMeta {
          font-size: 0.55rem;
          color: #666;
        }
        .ecoSenateSpeaker {
          font-size: 0.62rem;
          color: #ffd700;
          letter-spacing: 1px;
          margin-bottom: 4px;
        }
        .ecoSenateSeats {
          font-size: 0.68rem;
          color: #00ff88;
          margin-bottom: 8px;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(0, 255, 136, 0.15);
        }
        .ecoLawTableHead {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 6px;
          font-size: 11px;
          color: #666666;
          letter-spacing: 1px;
          margin-bottom: 4px;
          text-transform: uppercase;
        }
        .ecoLawRow {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 6px;
          padding: 4px 0;
          font-size: 12px;
          border-bottom: 1px solid #111111;
        }
        .ecoClassifiedRow {
          display: flex;
          gap: 8px;
          padding: 5px 0;
          border-bottom: 1px solid rgba(0, 255, 136, 0.08);
          font-size: 0.65rem;
          line-height: 1.35;
        }
        .ecoClassifiedRow:last-child { border-bottom: none; }
        .ecoClassifiedTime {
          color: #00ff88;
          flex-shrink: 0;
          font-size: 0.58rem;
        }
        .ecoMetricCard {
          padding: 8px;
          background: rgba(0, 255, 136, 0.03);
          border: 1px solid rgba(0, 255, 136, 0.12);
        }
        .ecoMetricLabel {
          font-size: 0.5rem;
          letter-spacing: 2px;
          color: #555;
          margin-bottom: 4px;
        }
        .ecoMetricGlow {
          font-size: 1rem;
          font-weight: bold;
          text-shadow: 0 0 14px currentColor;
        }
        .ecoClassBarWrap { margin-top: 8px; }
        .ecoClassBarLabels {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
          font-size: 0.52rem;
        }
        .ecoClassBarTrack {
          display: flex;
          height: 14px;
          border: 1px solid rgba(0, 255, 136, 0.15);
        }
        .ecoClassBarSeg { display: flex; align-items: center; justify-content: center; min-width: 2px; }
        .ecoIntelCard {
          padding: 6px 8px;
          border: 1px solid rgba(0, 255, 136, 0.12);
          background: rgba(0, 10, 5, 0.6);
        }
        .ecoIntelHead {
          display: flex;
          gap: 6px;
          align-items: flex-start;
          margin-bottom: 3px;
        }
        .ecoIntelDecision {
          font-weight: bold;
          color: #e8ffe8;
          font-size: 0.65rem;
        }
        .ecoIntelReason {
          font-size: 0.58rem;
          color: #777;
          font-style: italic;
          line-height: 1.3;
        }
        .ecoDashGrid2 {
          display: grid;
          gap: 8px;
        }
        .civilizationSidebarRow {
          display: flex;
          justify-content: flex-start;
          align-items: stretch;
          gap: 16px;
          margin-bottom: 0;
        }
        .civilizationSidebarRowFill {
          flex: 1;
          min-width: 0;
          min-height: 1px;
        }
        .civilizationMapCol {
          order: 1;
        }
        .civilizationChatCol {
          order: 2;
        }
        .districtMapWrap {
          position: relative;
          border: none;
          border-radius: 0;
          padding: 0;
          background: transparent;
          min-height: 420px;
          display: flex;
          flex-direction: column;
          overflow: visible;
        }
        .districtMapInstrumentBar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 4px 2px;
        }
        .districtMapProsperity {
          font-family: var(--font-mono);
          font-size: 0.65rem;
          letter-spacing: 0.06em;
          color: var(--text-secondary);
        }
        .districtMapLiveTag {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-mono);
          font-size: 0.62rem;
          letter-spacing: 0.1em;
          color: var(--accent);
          text-transform: uppercase;
        }
        .districtMapLiveDot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
        }
        .districtMapGlobeWrap {
          width: 100%;
          height: 400px;
          min-height: 400px;
          flex-shrink: 0;
          position: relative;
          background: transparent;
        }
        .districtMapObservationOverlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 8px 12px;
          background: rgba(5, 13, 26, 0.82);
          border-top: 1px solid var(--border);
          font-family: var(--font-mono);
          font-size: 0.6rem;
          letter-spacing: 0.1em;
          color: var(--text-secondary);
          text-align: center;
          z-index: 2;
        }
        .districtMapAttribution {
          padding: 2px 2px 4px;
          font-family: var(--font-mono);
          font-size: 0.55rem;
          color: var(--text-muted);
          letter-spacing: 0.04em;
        }
        .districtMapClassCell {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .districtMapClassLabel {
          font-family: var(--font-mono);
          font-size: 9px;
          color: var(--text-muted);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .districtMapClassValue {
          font-family: var(--font-mono);
          font-size: 14px;
          font-weight: 500;
        }
        .labSectionDivider {
          display: flex;
          align-items: center;
          margin: 24px 0 16px;
          border-top: 1px solid var(--border);
          padding-top: 14px;
        }
        .labSectionDividerLabel {
          font-family: var(--font-sans);
          font-size: 0.68rem;
          font-weight: 500;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }
        .labWireTicker span {
          font-family: var(--font-mono) !important;
          color: var(--text-secondary) !important;
        }
        .districtMapTitle {
          margin: 0;
          color: #00ff88;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 0.72rem;
          letter-spacing: 0.18em;
          text-align: center;
        }
        .districtMapGrid {
          display: grid;
          gap: 8px;
          flex: 1;
          align-content: start;
        }
        .districtMapLoading {
          grid-column: 1 / -1;
          margin: 0;
          padding: 40px 12px;
          text-align: center;
          color: #667788;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 0.75rem;
        }
        .districtCell {
          border-radius: 8px;
          padding: 10px 8px;
          text-align: center;
          cursor: default;
          transition: box-shadow 0.35s ease, background 0.35s ease, border-color 0.35s ease;
          border: 1px solid transparent;
          font-family: "JetBrains Mono", ui-monospace, monospace;
        }
        .districtCell--police {
          background: rgba(0, 255, 136, 0.12);
          border-color: rgba(0, 255, 136, 0.45);
          box-shadow: 0 0 14px rgba(0, 255, 136, 0.35);
          color: #00ff88;
        }
        .districtCell--gang {
          background: rgba(255, 34, 68, 0.12);
          border-color: rgba(255, 34, 68, 0.45);
          box-shadow: 0 0 14px rgba(255, 34, 68, 0.35);
          color: #ff2244;
        }
        .districtCell--contested {
          animation: districtContestedPulse 0.8s ease-in-out infinite;
          border-color: rgba(255, 200, 100, 0.5);
          color: #fff;
        }
        .districtCell--flash {
          animation: districtStatusFlash 1.5s ease-out;
        }
        .districtCellIcon {
          font-size: 1.1rem;
          line-height: 1;
          margin-bottom: 4px;
        }
        .districtCellName {
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.08em;
        }
        .districtCellInc {
          margin-top: 4px;
          font-size: 0.52rem;
          opacity: 0.75;
        }
        .districtMapTooltip {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 8px 10px;
          border-radius: 6px;
          border: 1px solid rgba(0, 255, 136, 0.25);
          background: rgba(0, 10, 20, 0.95);
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 0.65rem;
          color: #c8e8d8;
        }
        .districtMapTooltip strong {
          color: #00ffcc;
          font-size: 0.7rem;
        }
        .districtMapStats {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 16px;
          padding-top: 6px;
          border-top: 1px solid rgba(0, 255, 136, 0.12);
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 0.65rem;
          color: #9de8ff;
          letter-spacing: 0.06em;
        }
        @keyframes districtContestedPulse {
          0%, 100% {
            background: rgba(0, 255, 136, 0.14);
            box-shadow: 0 0 12px rgba(0, 255, 136, 0.4);
            color: #00ff88;
          }
          50% {
            background: rgba(255, 34, 68, 0.14);
            box-shadow: 0 0 12px rgba(255, 34, 68, 0.45);
            color: #ff2244;
          }
        }
        @keyframes districtStatusFlash {
          0% {
            background: #ffffff;
            box-shadow: 0 0 24px rgba(255, 255, 255, 0.9);
            color: #0a0a0a;
          }
          100% {
            box-shadow: none;
          }
        }
        @keyframes tickerScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.15; }
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
        .civilizationChatCol.civilizationSidebar {
          width: auto;
        }
        .sidebarSectionTitle {
          margin: 0 0 6px;
          color: #ffffff;
          font-size: 0.8rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .fieldObservationsTitle {
          font-family: var(--font-sans);
          font-weight: 700;
          font-size: 0.85rem;
        }
        .sidebarHint {
          margin: 0 0 8px;
          font-family: var(--font-mono);
          font-size: 0.55rem;
          letter-spacing: 0.1em;
          color: var(--text-muted);
        }
        .fieldObservationsPanel {
          border: 1px solid var(--border);
          border-radius: 2px;
          padding: 20px 24px;
          background: rgba(255, 255, 255, 0.03);
        }
        .fieldObservationCard {
          border: none !important;
          border-left: 2px solid var(--accent) !important;
          border-radius: 0 !important;
          background: var(--bg-secondary) !important;
          box-shadow: none !important;
        }
        .fieldObservationBadge {
          border-bottom: 1px solid var(--border);
        }
        .fieldObservationSubjectId {
          font-family: var(--font-mono);
          font-size: 0.58rem;
          letter-spacing: 0.08em;
          color: var(--accent);
          display: block;
          margin-bottom: 4px;
        }
        .fieldObservationsPanel .agentConvBubble {
          box-shadow: none !important;
          border-color: var(--border) !important;
          background: var(--bg-card) !important;
          color: var(--text-primary) !important;
        }
        .fieldObservationsPanel .agentConvMeta {
          color: var(--text-secondary) !important;
        }
        .sidebarAgentConvWrap {
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1;
        }
        .civilizationAgentFeed .agentConvCardCompact {
          padding: 8px 10px;
          margin-bottom: 6px;
        }
        .civilizationAgentFeed .agentConvMeta {
          font-size: 11px;
        }
        .civilizationAgentFeed .agentConvMeta strong {
          font-size: 11px;
        }
        .civilizationAgentFeed .agentConvBubble {
          font-size: 11px;
          padding: 6px 8px;
        }
        .civilizationAgentFeed .agentConvClassTag {
          font-size: 9px;
          padding: 1px 5px;
        }
        .agentConvFeed {
          display: flex;
          flex-direction: column;
          gap: 0;
          max-height: min(520px, 58vh);
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
          overflow: visible;
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
          border-radius: 2px;
          border: 1px solid var(--border);
          background: var(--bg-secondary);
        }
        .leaderboardTable {
          width: 100%;
          border-collapse: collapse;
          font-family: var(--font-mono);
          font-size: 0.72rem;
        }
        .leaderboardTable th,
        .leaderboardTable td {
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        .leaderboardTable th {
          color: var(--text-secondary);
          font-size: 0.6rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          background: var(--bg-card);
        }
        .leaderboardTable td {
          color: var(--text-primary);
        }
        .leaderboardEmpty {
          text-align: center;
          color: var(--text-muted);
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
          .labHeader {
            grid-template-columns: 1fr;
            text-align: center;
          }
          .labHeaderLeft,
          .labHeaderRight {
            justify-content: center;
            align-items: center;
          }
          .labHeaderCenter {
            font-size: 0.6rem;
          }
          .navTab {
            font-size: 10px;
            padding: 8px 10px;
          }
          .constitutionBannerRow {
            flex-direction: column;
            align-items: flex-start;
          }
          .constitutionBannerDivider {
            display: none;
          }
        }
          .chronicleTickerItem {
            width: min(300px, 88vw);
          }
      `}</style>

      {showMyBetsOverlay && walletAddress.trim()
        ? createPortal(
            <ZionBetMyBetsOverlay
              walletAddress={walletAddress.trim()}
              profile={zionProfile}
              stats={zionBetStats}
              myBets={myBets}
              polyByTab={polyByTab}
              zionbetMarkets={zionbetMarkets}
              signAndExecute={signAndExecute as SignAndExecuteMutateFn}
              onClose={() => setShowMyBetsOverlay(false)}
              onOpenMarket={(m) => {
                setShowMyBetsOverlay(false);
                router.push(`/prediction-engine/${encodeURIComponent(m.id.replace(/^poly-/, "market-"))}`);
              }}
              onOpenMarketId={(marketId) => {
                setShowMyBetsOverlay(false);
                router.push(`/prediction-engine/${encodeURIComponent(marketId.replace(/^poly-/, "market-"))}`);
              }}
              onPositionClosed={handlePositionClosed}
            />,
            document.body
          )
        : null}

      {showPortfolioOverlay && walletAddress.trim()
        ? createPortal(
            <ZionBetPortfolioOverlay
              walletAddress={walletAddress.trim()}
              profile={zionProfile}
              stats={zionBetStats}
              myBets={myBets}
              polyByTab={polyByTab}
              zionbetMarkets={zionbetMarkets}
              onClose={() => setShowPortfolioOverlay(false)}
            />,
            document.body
          )
        : null}

      {detailMarket && detailOverlayMounted
        ? createPortal(
            <ZionBetMarketDetailOverlay
              apiMarket={detailMarket}
              walletConnected={Boolean(walletAddress.trim())}
              walletAddress={walletAddress}
              walletBalanceSui={suiBalance}
              walletBalanceUsdc={usdcBalance}
              myBets={myBets}
              betAmount={betAmount}
              setBetAmount={setBetAmount}
              betCurrency={betCurrency}
              setBetCurrency={setBetCurrency}
              betLoading={betLoading}
              onPlaceBet={(market, direction, amount) => {
                setBetAmount(String(Math.round(amount * 100) / 100));
                return handlePlaceCardBet(market, direction, amount);
              }}
              onClose={() => setDetailMarket(null)}
              signAndExecute={signAndExecute as SignAndExecuteMutateFn}
              onPositionClosed={handlePositionClosed}
              injectedBuyConfirm={injectedBuyConfirm}
              onInjectedBuyConfirmConsumed={clearInjectedBuyConfirm}
            />,
            document.body
          )
        : null}

      {betModal?.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            ...ZB_DETAIL_BACKDROP,
          }}
          onClick={() => setBetModal(null)}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                padding: "28px",
                width: "400px",
                maxWidth: "90vw",
                ...ZB_DETAIL_MAIN_PANEL,
              }}
            >
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  color: "#94a3b8",
                  fontFamily: "monospace",
                  fontSize: "0.7rem",
                  marginBottom: "4px",
                }}
              >
                {betModal.market.token} · {betModal.market.timeframe}
              </div>
              <div style={{ color: "#f1f5f9", fontFamily: "monospace", fontSize: "0.95rem", lineHeight: "1.4" }}>
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
                border: "1px solid rgba(255, 255, 255, 0.15)",
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
                    background: betCurrency === c ? "rgba(0,255,65,0.15)" : "rgba(255, 255, 255, 0.04)",
                    border: betCurrency === c ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid rgba(255, 255, 255, 0.08)",
                    color: betCurrency === c ? "#00ff41" : "#94a3b8",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>

            <div style={{ marginBottom: "16px" }}>
              <div
                style={{ color: "#94a3b8", fontFamily: "monospace", fontSize: "0.7rem", marginBottom: "6px" }}
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
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  color: "#f1f5f9",
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
                ...zionbetDetailInnerPanel(),
                padding: "12px",
                marginBottom: "20px",
                fontFamily: "monospace",
                fontSize: "0.8rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ color: "#94a3b8" }}>Odds</span>
                <span style={{ color: "#f1f5f9" }}>{oddsCents}¢</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ color: "#94a3b8" }}>Potential payout</span>
                <span style={{ color: "#00ff41" }}>
                  {payout.toFixed(3)} {betCurrency}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Profit</span>
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
                const amt = parseFloat(betAmount || "0");
                void handlePlaceCardBet(betModal.market, betModal.direction, amt);
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
                border: "1px solid rgba(255, 255, 255, 0.15)",
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
        </div>
      )}
    </main>
    </ZionTabProvider>
  );
}
