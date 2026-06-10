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
import { LivingPlanet, computeProsperity } from "@/components/LivingPlanet";
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

const PARTY_DISPLAY: Record<
  string,
  { label: string; emoji: string; color: string; background: string }
> = {
  conservatives: {
    label: "Conservative Party",
    emoji: "🎩",
    color: "#ffd700",
    background: "rgba(255,215,0,0.08)",
  },
  centrists: {
    label: "Centrist Alliance",
    emoji: "⚖️",
    color: "#4DA2FF",
    background: "rgba(77,162,255,0.08)",
  },
  populists: {
    label: "People's Front",
    emoji: "✊",
    color: "#ff6464",
    background: "rgba(255,50,50,0.08)",
  },
};

function presidentPartyDisplay(partyId: string | undefined) {
  const key = (partyId || "centrists").toLowerCase();
  if (key === "blue") return PARTY_DISPLAY.centrists;
  if (key === "red") return PARTY_DISPLAY.populists;
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
  if (p.includes("populist") || p.includes("people") || p.includes("front")) return "#ff5050";
  if (p.includes("conservative")) return "#ffc832";
  if (p.includes("centrist")) return "#4488ff";
  return "rgba(255,255,255,0.4)";
};

function renderPoliticalWireText(text: string): ReactNode {
  const pattern = /(People'?s Front|Populists?|Conservatives?|Centrists?)/gi;
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

const ECO_GREEN = "#00ff88";
const ECO_GOLD = "#ffd700";
const ECO_WARN = "#ffd700";
const ECO_DANGER = "#ff4444";
const ECO_PURPLE = "#a78bfa";
const ECO_BLUE = "#4DA2FF";
const ECO_ORANGE = "#ff8800";
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

function ecoRevMeterColor(meter: number) {
  if (meter < 30) return ECO_GREEN;
  if (meter < 60) return ECO_WARN;
  return ECO_DANGER;
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
  if (partyId === "conservatives") return "#ffd700";
  if (partyId === "populists") return "#ff4444";
  return "#4488ff";
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

function EcoTermBadge({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        border: `1px solid ${color}`,
        color,
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

/** RPG-style power bar for ECO-POL dashboard */
function PowerGameBar({
  label,
  value,
  maxValue,
  color,
  emoji,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  emoji: string;
}) {
  const segments = 14;
  const filled = Math.round(Math.min(1, maxValue > 0 ? value / maxValue : 0) * segments);
  const bar = `${"█".repeat(filled)}${"░".repeat(Math.max(0, segments - filled))}`;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "ui-monospace, monospace",
        fontSize: 11,
        marginBottom: 8,
        flexWrap: "wrap",
      }}
    >
      <span style={{ width: 64, color: "#888", flexShrink: 0 }}>{label}:</span>
      <span style={{ color, letterSpacing: -1 }}>{bar}</span>
      <span style={{ color: "#fff", fontWeight: "bold" }}>
        {Math.round(value).toLocaleString("en-US")}
      </span>
      <span>{emoji}</span>
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

/** Lab instrument palette — NASA mission-control aesthetic */
const ZION_TERM = {
  bg: "#050d1a",
  cardBg: "#0d1f3c",
  border: "#1e3a5f",
  label: "#94a3b8",
  accent: "#00b4d8",
  money: "#f59e0b",
  warn: "#ef4444",
  text: "#e2e8f0",
  muted: "#475569",
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
        <span
          className="zionSectorBadge"
          style={{
            color: badgeColor,
            borderColor: `${badgeColor}55`,
            background: `${badgeColor}12`,
          }}
        >
          {badge}
        </span>
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
  const prevProsperityRef = useRef<number | null>(null);
  const [prosperityDelta, setProsperityDelta] = useState<number | null>(null);

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

  useEffect(() => {
    const pct = prosperity * 100;
    if (prevProsperityRef.current !== null) {
      setProsperityDelta(pct - prevProsperityRef.current);
    }
    prevProsperityRef.current = pct;
  }, [prosperity]);

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

  const totalAlive = mapStats?.alive_agents ?? mapStats?.alive;

  const prosperityPct = (prosperity * 100).toFixed(1);
  const deltaStr =
    prosperityDelta !== null
      ? `${prosperityDelta >= 0 ? "+" : ""}${prosperityDelta.toFixed(1)} from last cycle`
      : "baseline cycle";
  const deltaArrow = prosperityDelta !== null && prosperityDelta < 0 ? "↓" : prosperityDelta !== null && prosperityDelta > 0 ? "↑" : "→";

  return (
    <div className="districtMapWrap">
      <div className="districtMapInstrumentBar">
        <span className="districtMapProsperity">
          PROSPERITY INDEX: {prosperityPct}% {deltaArrow} ({deltaStr})
        </span>
        <div className="districtMapLiveTag">
          <span className="districtMapLiveDot" />
          <span>LIVE OBSERVATION</span>
        </div>
      </div>
      <div className="districtMapGlobeWrap">
        <LivingPlanet
          prosperity={prosperity}
          revolution={civilizationData.revolution ?? 0}
          population={civilizationData.population ?? 0}
          civilizationData={civilizationData}
          height={400}
        />
        <div className="districtMapObservationOverlay">
          OBSERVATION POINT · 51.2°N 12.4°E · ALT 420km
        </div>
      </div>
      <div className="districtMapAttribution">
        Earth imagery: NASA Visible Earth / Blue Marble
      </div>
      <div
        style={{
          display: "flex",
          gap: "24px",
          padding: "8px 12px",
          borderTop: "1px solid rgba(0,255,136,0.2)",
          background: "rgba(0,0,0,0.4)",
        }}
      >
        {[
          { label: "TOTAL", value: totalAlive, color: "var(--accent)" },
          { label: "ELITE", value: mapStats?.elite, color: "var(--warning)" },
          { label: "MIDDLE", value: mapStats?.middle, color: "var(--text-primary)" },
          { label: "POOR", value: mapStats?.poor, color: "var(--text-secondary)" },
          { label: "CRITICAL", value: mapStats?.critical, color: "var(--danger)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="districtMapClassCell">
            <span className="districtMapClassLabel">{label}</span>
            <span className="districtMapClassValue" style={{ color }}>
              {(value || 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
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

function isSenateActivityEvent(e: { event_type?: string; type?: string; description?: string }) {
  const eventType = String(e.event_type ?? e.type ?? "");
  const desc = String(e.description ?? "");
  return (
    eventType === "senate" ||
    desc.includes("[DEEPSEEK-SENATE]") ||
    desc.includes("SENATE AI") ||
    desc.includes("Senate blocks") ||
    desc.includes("Senate passes") ||
    desc.includes("impeach") ||
    desc.includes("🏦")
  );
}

function isZrsActivityEvent(e: { event_type?: string; type?: string; description?: string }) {
  const eventType = String(e.event_type ?? e.type ?? "").toLowerCase();
  const desc = String(e.description ?? "");
  return (
    eventType === "economy" ||
    eventType === "zrs" ||
    eventType === "frs" ||
    desc.includes("[QWEN-ZRS]") ||
    desc.includes("ZRS") ||
    desc.includes("FRS Chief") ||
    desc.includes("INFLATION") ||
    desc.includes("interest rate") ||
    desc.includes("QE") ||
    desc.includes("💰")
  );
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
  civilization: "🏛 CIVILIZATION",
  crypto: "₿ CRYPTO",
  sports: "🏆 SPORTS",
  politics: "🗳 POLITICS",
  geopolitics: "🗺️ GEOPOLITICS",
  finance: "💰 FINANCE",
  tech: "💻 TECH",
  culture: "🌍 WORLD",
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
}: {
  market: ZionbetApiMarket;
  sectionTitleStyle: CSSProperties;
}) {
  const [showFullDesc, setShowFullDesc] = useState(false);

  useEffect(() => {
    setShowFullDesc(false);
  }, [market.id, market.description, market.resolution_criteria]);

  const bodyText = zionbetMarketDescriptionText(market);
  const resolutionSource = zionbetDisplayResolutionSource(market);
  const openedLabel = zionbetFormatMarketOpened(market.created_at);

  return (
    <section style={zionbetAeroPanel()}>
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
    </section>
  );
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
  const [hovered, setHovered] = useState(false);
  const resolvedImageUrl = (imageUrl ?? marketApi.image_url)?.trim() || null;
  const showCryptoIcon = isDeepbookCryptoMarket(marketApi.id);
  const displayEmoji = iconEmoji ?? zionbetCardFallbackEmoji(marketApi, betTab);
  const cardBase: CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    background: showCryptoIcon
      ? "linear-gradient(135deg, rgba(255,215,0,0.08) 0%, rgba(20,20,20,1) 100%)"
      : "#0d1117",
    borderRadius: "10px",
    padding: "14px 16px",
    cursor: "pointer",
    transition: "all 0.15s ease",
    ...(showCryptoIcon
      ? {
          border: "2px solid #FFD700",
          boxShadow:
            "0 0 20px rgba(255, 215, 0, 0.6), inset 0 0 20px rgba(255, 215, 0, 0.05)",
        }
      : { border: "1px solid #1e2d3d" }),
  };
  const cardStyle: CSSProperties = hovered
    ? showCryptoIcon
      ? {
          ...cardBase,
          boxShadow:
            "0 0 28px rgba(255, 215, 0, 0.75), inset 0 0 24px rgba(255, 215, 0, 0.08)",
        }
      : {
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
    </article>
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
}) {
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
          : "1px solid rgba(100, 180, 255, 0.15)"
        : active
          ? `2px solid ${ZB_POLY_SELL}`
          : "1px solid rgba(100, 180, 255, 0.15)",
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
    border: active ? `1px solid ${ZB_POLY_BUY}` : "1px solid rgba(100, 180, 255, 0.15)",
    background: active ? ZB_POLY_BUY_BG : "rgba(10, 30, 60, 0.4)",
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
              : `1px solid rgba(0,255,136,0.35)`
            : selected
              ? `2px solid ${ZB_POLY_BUY}`
              : "1px solid rgba(0,255,136,0.35)",
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
            : "1px solid rgba(255,68,68,0.35)"
          : selected
            ? `2px solid ${ZB_POLY_SELL}`
            : "1px solid rgba(255,68,68,0.35)",
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

  const panelAccentBorder =
    panelSide === "buy" ? `1px solid rgba(0,255,136,0.25)` : `1px solid rgba(255,68,68,0.25)`;
  const panelAccentBg =
    panelSide === "buy" ? "rgba(0,255,136,0.04)" : "rgba(255,68,68,0.04)";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={cleanTitle}
      className="zbMarketDetailOverlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        overflowY: "auto",
        background: ZB_VISTA_BG,
        fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10001,
          display: "flex",
          alignItems: "center",
          padding: "14px 20px",
          background: "rgba(10, 30, 60, 0.45)",
          backdropFilter: "blur(30px)",
          WebkitBackdropFilter: "blur(30px)",
          borderBottom: "1px solid rgba(100, 180, 255, 0.15)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
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
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
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
          ← Back
        </button>
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
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
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
            <section style={{ ...zionbetAeroPanel(), marginBottom: "16px" }}>
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
            <section style={{ ...zionbetAeroPanel(), marginBottom: "16px" }}>
              <h2 style={aeroSectionTitle}>PRICE HISTORY</h2>
              <div
                style={{
                  height: 220,
                  width: "100%",
                  borderRadius: "12px",
                  background: "rgba(10, 30, 60, 0.5)",
                  border: "1px solid rgba(100, 180, 255, 0.12)",
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
                        ...ZB_VISTA_GLASS,
                        border: "1px solid rgba(100, 180, 255, 0.25)",
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
            <section style={{ ...zionbetAeroPanel(), marginBottom: "16px" }}>
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

            <ZionBetResolutionRulesCard market={detailApiMarket} sectionTitleStyle={aeroSectionTitle} />
          </div>

          {/* 4. Bet panel */}
          <aside className="zbMarketDetailSidebar">
            <div
              style={{
                ...zionbetAeroPanel(),
                position: "sticky",
                top: "72px",
                border: panelAccentBorder,
                background: `linear-gradient(180deg, ${panelAccentBg} 0%, rgba(10, 30, 60, 0.5) 100%)`,
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
                    border: "1px solid rgba(100, 180, 255, 0.3)",
                    background: "rgba(10, 30, 60, 0.6)",
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
                {currencyMenuOpen ? (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      right: 0,
                      zIndex: 10002,
                      borderRadius: "10px",
                      border: "1px solid rgba(100, 180, 255, 0.35)",
                      background: "rgba(10, 30, 60, 0.95)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
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
                  border: "none",
                  borderRadius: "12px",
                  background: `linear-gradient(135deg, ${ZB_POLY_BUY}, #00aa66)`,
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
                <div
                  style={{
                    padding: "32px 16px",
                    textAlign: "center",
                    borderRadius: "12px",
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid rgba(100,180,255,0.12)",
                    opacity: 0.55,
                  }}
                >
                  <p style={{ margin: 0, color: ZB_VISTA_TEXT_SEC, fontSize: "14px", lineHeight: 1.5 }}>
                    You don&apos;t have a position in this market
                  </p>
                </div>
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
                      border: "none",
                      borderRadius: "12px",
                      background: `linear-gradient(135deg, ${ZB_POLY_SELL}, #cc2222)`,
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
            </div>
          </aside>
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

const ZION_ACHIEVEMENT_DEFS: { id: string; emoji: string; label: string }[] = [
  { id: "first_bet", emoji: "🎯", label: "First Bet" },
  { id: "hot_streak", emoji: "🔥", label: "Hot Streak" },
  { id: "diamond_hands", emoji: "💎", label: "Diamond Hands" },
  { id: "whale", emoji: "🐋", label: "Whale" },
  { id: "oracle", emoji: "🧠", label: "Oracle" },
  { id: "speed_trader", emoji: "⚡", label: "Speed Trader" },
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
  if (bets.length >= 1) earned.push("first_bet");
  if (bets.length > 10) earned.push("speed_trader");
  const staked =
    (stats?.total_staked_sui ?? 0) + (stats?.total_staked_usdc ?? 0) ||
    stats?.total_staked ||
    bets.reduce((s, b) => s + b.amount_sui, 0);
  if (staked > 10) earned.push("whale");
  const settled = [...bets]
    .filter((b) => {
      const s = (b.status || "").toLowerCase();
      return s === "won" || s === "lost";
    })
    .sort((a, b) => b.id - a.id);
  if (settled.length >= 3 && settled.slice(0, 3).every((b) => (b.status || "").toLowerCase() === "won")) {
    earned.push("hot_streak");
  }
  const winRate = stats?.win_rate ?? 0;
  if (settled.length > 5 && winRate > 60) earned.push("oracle");
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  if (
    bets.some((b) => {
      const s = (b.status || "active").toLowerCase();
      if (s !== "active" && s !== "pending") return false;
      const t = b.created_at ? Date.parse(b.created_at) : NaN;
      return Number.isFinite(t) && now - t >= weekMs;
    })
  ) {
    earned.push("diamond_hands");
  }
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

function ZionBetProfileDropdown({
  walletAddress,
  profile,
  stats,
  onProfileChange,
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
  onProfileChange: (p: ZionProfile) => void;
  onRefreshAchievements: () => void;
  onOpenPortfolio: () => void;
  onOpenMyBets: () => void;
  onLeaderboard: () => void;
  onDisconnect: () => void;
  onClose: () => void;
}) {
  const [editingNick, setEditingNick] = useState(false);
  const [nickDraft, setNickDraft] = useState(profile.nickname || "");

  useEffect(() => {
    onRefreshAchievements();
  }, [onRefreshAchievements]);

  useEffect(() => {
    setNickDraft(profile.nickname || "");
  }, [profile.nickname]);

  const displayName = profile.nickname?.trim() || "ZION Trader";
  const avatarId = zionNormalizeAvatarId(profile.avatar);
  const totalBets = stats?.total_bets ?? 0;
  const winRate = stats?.win_rate ?? 0;
  const profit = stats?.net_pnl ?? stats?.total_profit ?? 0;

  const menuBtn: CSSProperties = {
    width: "100%",
    background: "transparent",
    border: "none",
    color: "#c8e6ff",
    padding: "10px 14px",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "0.82rem",
    textAlign: "left",
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  return (
    <div
      style={{
        position: "absolute",
        right: 0,
        top: "40px",
        width: "min(320px, 92vw)",
        background: "linear-gradient(165deg, rgba(12, 35, 70, 0.98) 0%, rgba(8, 18, 40, 0.99) 100%)",
        border: "1px solid rgba(100, 180, 255, 0.35)",
        borderRadius: "12px",
        zIndex: 210,
        boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
        overflow: "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(100, 180, 255, 0.12)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <ZionBetAvatarImg avatarId={avatarId} size={48} selected />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {editingNick ? (
                <input
                  value={nickDraft}
                  onChange={(e) => setNickDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const next = { ...profile, nickname: nickDraft.trim() };
                      onProfileChange(next);
                      saveZionProfile(walletAddress, next);
                      setEditingNick(false);
                    }
                  }}
                  style={{
                    flex: 1,
                    background: "rgba(0,0,0,0.35)",
                    border: "1px solid rgba(100,180,255,0.35)",
                    borderRadius: 6,
                    color: "#fff",
                    padding: "4px 8px",
                    fontSize: "0.85rem",
                  }}
                  autoFocus
                />
              ) : (
                <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.95rem" }}>{displayName}</span>
              )}
              <button
                type="button"
                onClick={() => {
                  if (editingNick) {
                    const next = { ...profile, nickname: nickDraft.trim() };
                    onProfileChange(next);
                    saveZionProfile(walletAddress, next);
                  }
                  setEditingNick(!editingNick);
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  opacity: 0.7,
                }}
                title="Edit nickname"
              >
                ✏️
              </button>
            </div>
            <div style={{ fontSize: "0.72rem", color: "rgba(150,200,255,0.65)", marginTop: 4, fontFamily: "monospace" }}>
              {zionbetWalletTruncated(walletAddress)}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {ZION_AVATARS.map((av) => (
            <button
              key={av.id}
              type="button"
              onClick={() => {
                const next = { ...profile, avatar: av.id };
                onProfileChange(next);
                saveZionProfile(walletAddress, next);
              }}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                cursor: "pointer",
                borderRadius: 8,
              }}
              title={av.id}
            >
              <ZionBetAvatarImg avatarId={av.id} size={40} selected={avatarId === av.id} />
            </button>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            marginTop: 12,
            fontSize: "0.72rem",
          }}
        >
          <div style={{ textAlign: "center", padding: "6px 4px", background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
            <div style={{ color: "rgba(150,200,255,0.7)" }}>Total bets</div>
            <div style={{ color: "#fff", fontWeight: 700, marginTop: 2 }}>{totalBets}</div>
          </div>
          <div style={{ textAlign: "center", padding: "6px 4px", background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
            <div style={{ color: "rgba(150,200,255,0.7)" }}>Win rate</div>
            <div style={{ color: "#fff", fontWeight: 700, marginTop: 2 }}>{winRate}%</div>
          </div>
          <div style={{ textAlign: "center", padding: "6px 4px", background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
            <div style={{ color: "rgba(150,200,255,0.7)" }}>Profit</div>
            <div
              style={{
                color: profit >= 0 ? ZB_VISTA_YES : ZB_VISTA_NO,
                fontWeight: 700,
                marginTop: 2,
              }}
            >
              {profit >= 0 ? "+" : ""}
              {profit.toFixed(2)}
            </div>
          </div>
        </div>
        {(profile.achievements?.length ?? 0) > 0 ? (
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ZION_ACHIEVEMENT_DEFS.filter((a) => profile.achievements?.includes(a.id)).map((a) => (
              <span
                key={a.id}
                title={a.label}
                style={{
                  fontSize: "0.7rem",
                  padding: "3px 8px",
                  borderRadius: 999,
                  background: "rgba(0, 212, 170, 0.12)",
                  border: "1px solid rgba(0, 212, 170, 0.25)",
                  color: "#a8ffe8",
                }}
              >
                {a.emoji} {a.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div style={{ padding: "4px 0" }}>
        <button type="button" style={menuBtn} onClick={() => { onOpenPortfolio(); onClose(); }}>
          📊 My Portfolio
        </button>
        <button type="button" style={menuBtn} onClick={() => { onOpenMyBets(); onClose(); }}>
          🎯 My Bets
        </button>
        <button type="button" style={menuBtn} onClick={() => { onLeaderboard(); onClose(); }}>
          🏆 Leaderboard
        </button>
        <button
          type="button"
          style={{ ...menuBtn, color: "#ff6b6b", borderTop: "1px solid rgba(100,180,255,0.1)" }}
          onClick={() => {
            onDisconnect();
            onClose();
          }}
        >
          🔌 Disconnect Wallet
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
  | "zbank"
  | "zperps"
  | "press"
  | "treasury"; // ECO-POL (display label; id kept for routing)

const LAB_NAV_ITEMS: { id: TabId; label: string }[] = [
  { id: "civilization", label: "OBSERVATORY" },
  { id: "chat", label: "FIELD NOTES" },
  { id: "zionbet", label: "PREDICTION ENGINE" },
  { id: "treasury", label: "GOVERNANCE" },
  { id: "leaderboard", label: "ARCHIVE" },
  { id: "zbank", label: "PRIVACY" },
  { id: "zperps", label: "DERIVATIVES" },
  { id: "press", label: "PRESS" },
];

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

const POLICE_DIVISION_ROLE_BADGES: Record<string, string> = {
  SWAT: "⚔️ COMBAT",
  "ANTI-TAX": "💰 ENFORCEMENT",
  "PRES.GUARD": "🛡️ SECURITY",
  "ANTI-CORR": "⚖️ INVESTIGATION",
  "RIOT CTRL": "🚨 CROWD CONTROL",
};

type WireNewsItem = { text: string; type?: string; timestamp?: string };

const WIRE_TICKER_SCROLL_SEC = 150;

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

function wireItemStyle(accentColor: string, type?: string): CSSProperties {
  if (type === "breaking") return { color: "#ff4444", fontWeight: "bold" };
  return { color: accentColor };
}

/** Matches LIVE EVENTS — WALRUS ticker bar (header + scroll); only accent color varies. */
function NewsWireTicker({
  label,
  items,
  color,
  variant = "default",
}: {
  label: string;
  items: WireNewsItem[];
  color: string;
  variant?: "default" | "lab";
}) {
  if (!items.length) return null;
  const loop = [...items, ...items];
  const isLab = variant === "lab";
  const borderColor = isLab ? "var(--border)" : colorWithAlpha(color, "22");
  const labelColor = isLab ? "var(--accent)" : color;
  return (
    <div
      className={isLab ? "labWireTicker" : undefined}
      style={{
        margin: "16px 0",
        overflow: "hidden",
        borderRadius: isLab ? "2px" : "6px",
        border: `1px solid ${borderColor}`,
        background: isLab ? "var(--bg-secondary)" : hexToRgba(color, 0.02),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "5px 12px",
          background: isLab ? "var(--bg-card)" : hexToRgba(color, 0.06),
          borderBottom: `1px solid ${borderColor}`,
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: labelColor,
            boxShadow: isLab ? "none" : `0 0 6px ${color}`,
          }}
        />
        <span
          style={{
            fontFamily: isLab ? "var(--font-mono)" : "monospace",
            fontSize: "0.65rem",
            color: labelColor,
            letterSpacing: "0.12em",
            textTransform: isLab ? "uppercase" : undefined,
          }}
        >
          {label}
        </span>
      </div>
      <div style={{ overflow: "hidden", padding: "10px 0" }}>
        <div
          style={{
            display: "flex",
            gap: "0",
            animation: `tickerScroll ${WIRE_TICKER_SCROLL_SEC}s linear infinite`,
            whiteSpace: "nowrap",
            width: "max-content",
          }}
        >
          {loop.map((item, i) => (
            <span key={`${item.text}-${i}`} style={{ display: "inline-flex", alignItems: "center" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "0 40px",
                  borderRight: "1px solid #ffffff11",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  whiteSpace: "nowrap",
                  ...wireItemStyle(color, item.type),
                }}
              >
                {item.text}
              </span>
              <span style={{ color: colorWithAlpha(color, "55"), padding: "0 20px" }}>◆</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
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

export default function Home() {
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

  const [showIntro, setShowIntro] = useState(true);
  const [introFading, setIntroFading] = useState(false);
  const [dashboardVisible, setDashboardVisible] = useState(false);
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const matrixCanvasRef = useRef<HTMLCanvasElement>(null);
  const aliveAgents = stats?.alive ?? agents.length;
  const [agentClasses, setAgentClasses] = useState({ elite: 0, middle: 0, poor: 0, critical: 0 });

  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const raw = await fetch("/api/stats").then((r) => r.json());
      console.log("stats data:", raw);
      const s = parseApiStatsResponse(raw);
      setStats(s);
      if (Number.isFinite(s.alive)) setLastAliveCount(s.alive);
      setAgentClasses({
        elite: s.elite || 0,
        middle: s.middle || 0,
        poor: s.poor || 0,
        critical: s.critical || 0,
      });
    } catch {
      // keep last successful snapshot
    } finally {
      setStatsLoading(false);
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
    fetch("/api/police/divisions")
      .then((r) => r.json())
      .then((d) => {
        if (!d?.divisions || !Array.isArray(d.divisions)) return;
        setPoliceDivisions({
          ...d,
          divisions: d.divisions.map((div: Record<string, unknown>) =>
            normalizePoliceDivision(div)
          ),
        });
      })
      .catch(() => {});
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

  const [pressArticles, setPressArticles] = useState<Record<string, string>>({});
  const [pressLoading, setPressLoading] = useState<Record<string, boolean>>({});
  const [activeNewspaper, setActiveNewspaper] = useState("ziontimes");
  const [suiBalance, setSuiBalance] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [pressSuiChecked, setPressSuiChecked] = useState(false);
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
  const [sheriffActions, setSheriffActions] = useState<{ description: string; created_at: string }[]>([]);
  const [senateActions, setSenateActions] = useState<{ description: string; created_at: string }[]>([]);
  const [senateEvents, setSenateEvents] = useState<
    { description: string; created_at: string; event_type?: string }[]
  >([]);
  const [zrsEvents, setZrsEvents] = useState<
    { description: string; created_at: string; event_type?: string }[]
  >([]);
  const [activityLogEvents, setActivityLogEvents] = useState<
    { description: string; created_at: string; event_type?: string; type?: string }[]
  >([]);
  const [policeNews, setPoliceNews] = useState<WireNewsItem[]>([]);
  const [corporateNews, setCorporateNews] = useState<WireNewsItem[]>([]);
  const [clanNews, setClanNews] = useState<WireNewsItem[]>([]);
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
    void fetchSenateLaws();
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
    void fetchPoliticalEconomy();
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
          party: data.president.party ?? "centrists",
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

  const parseWireResponse = (data: unknown): WireNewsItem[] => {
    if (!Array.isArray(data)) return [];
    return data
      .slice(0, 15)
      .map((e: { text?: string; description?: string; type?: string; timestamp?: string }) => ({
        text: String(e.text ?? e.description ?? "").trim(),
        type: e.type,
        timestamp: e.timestamp,
      }))
      .filter((e) => e.text.length > 0);
  };

  const fetchPoliceNews = useCallback(async () => {
    try {
      const res = await fetch("/police-wire", { cache: "no-store" });
      setPoliceNews(parseWireResponse(await res.json()));
    } catch {
      /* ignore */
    }
  }, []);

  const fetchCorporateNews = useCallback(async () => {
    try {
      const res = await fetch("/corporate-wire", { cache: "no-store" });
      setCorporateNews(parseWireResponse(await res.json()));
    } catch {
      /* ignore */
    }
  }, []);

  const fetchClanNews = useCallback(async () => {
    try {
      const res = await fetch("/clan-wire", { cache: "no-store" });
      setClanNews(parseWireResponse(await res.json()));
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
    // Clear old press cache to force server-side caching
    newspapers.forEach((n) => localStorage.removeItem(`press_${n.id}`));
    localStorage.removeItem('conv_cache');
  }, []);

  useEffect(() => {
    if (activeTab !== "civilization") return;
    void fetchPoliceNews();
    void fetchCorporateNews();
    void fetchClanNews();
    const interval = setInterval(() => {
      void fetchPoliceNews();
      void fetchCorporateNews();
      void fetchClanNews();
    }, 60_000);
    return () => clearInterval(interval);
  }, [activeTab, fetchPoliceNews, fetchCorporateNews, fetchClanNews]);

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
    } finally {
      setPressSuiChecked(true);
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
      setPressSuiChecked(false);
      void checkVipStatus();
      void fetchUsdcBalance();
    } else {
      setSuiBalance(0);
      setUsdcBalance(0);
      setPressSuiChecked(false);
    }
  }, [account?.address, checkVipStatus, fetchUsdcBalance]);

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

      const parsedStats = parseApiStatsResponse(stats);
      const alive = parsedStats.alive;
      const deathsToday = parsedStats.deaths_today;
      const totalZion = parsedStats.total_zion;
      const activeClans = parsedStats.active_clans;

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
    void fetchWalrusEvents();
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
          text: `⚠️ Revolution pressure rising: ${Math.round(pressure)}/150`,
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
    if (showIntro || activeTab !== "civilization") return;
    const canvas = matrixCanvasRef.current;
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
      drops = Array(cols)
        .fill(0)
        .map(() => Math.floor(Math.random() * -50));
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
          if (y > window.innerHeight + size && Math.random() > 0.98) {
            drops[i] = Math.floor(Math.random() * -20);
          }
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
  }, [activeTab, dashboardVisible, showIntro]);

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
        setAgents(Array.isArray(a) ? a : []);
        setClans(Array.isArray(c) ? c : []);
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

  const activityEvents = useMemo(
    () =>
      activityLogEvents.length > 0
        ? activityLogEvents
        : allEvents.map((e) => ({
            description: e.description ?? e.title ?? "",
            created_at: e.timestamp ?? "",
            event_type: e.event_type ?? e.type,
            type: e.type,
          })),
    [activityLogEvents, allEvents]
  );

  const sheriffActionsDisplay = sheriffActions.slice(0, 5);
  const senateEventsDisplay = useMemo(() => {
    if (senateEvents.length > 0) return senateEvents.slice(0, 8);
    if (senateActions.length > 0) {
      return senateActions.slice(0, 8).map((e) => ({
        ...e,
        event_type: "senate" as const,
      }));
    }
    return activityEvents.filter(isSenateActivityEvent).slice(0, 8);
  }, [activityEvents, senateEvents, senateActions]);
  const zrsEventsDisplay = useMemo(() => {
    if (zrsEvents.length > 0) return zrsEvents.slice(0, 8);
    const fromActivity = activityEvents.filter(isZrsActivityEvent);
    if (fromActivity.length > 0) return fromActivity.slice(0, 8);
    const zrs = ecoPolData?.zrs_last_action;
    if (zrs?.news_headline || zrs?.action_taken) {
      return [
        {
          description: String(zrs.news_headline || `ZRS ${zrs.state}: ${zrs.action_taken}`),
          created_at: String(zrs.created_at ?? ""),
          event_type: "economy",
        },
      ];
    }
    return [];
  }, [activityEvents, zrsEvents, ecoPolData]);
  const presidentActionsDisplay = useMemo(() => {
    type DecreeEntry = { description: string; created_at: string; count: number };
    const deduped = presidentActions.reduce<DecreeEntry[]>((acc, entry) => {
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

  useEffect(() => {
    if (activeTab !== "treasury") return;

    const isSenateEvent = (e: { event_type?: string; type?: string; description?: string }) => {
      const eventType = String(e.event_type ?? e.type ?? "").toLowerCase();
      const desc = String(e.description ?? "").toLowerCase();
      if (["senate", "economy", "senate_law"].includes(eventType)) return true;
      return ["senate", "bill", "law", "vote", "budget"].some((kw) => desc.includes(kw));
    };

    const fetchActivityLogs = async () => {
      const [presRes, sherRes, senRes, zrsRes, eventsRes] = await Promise.all([
        fetch("/api/president/actions"),
        fetch("/api/sheriff-log"),
        fetch("/api/senate/actions"),
        fetch("/api/zrs/actions"),
        fetch("/api/events?limit=50"),
      ]);
      try {
        const pres = await presRes.json();
        if (Array.isArray(pres)) setPresidentActions(pres);
      } catch {
        /* ignore */
      }
      try {
        const sher = await sherRes.json();
        if (Array.isArray(sher)) setSheriffActions(sher);
      } catch {
        /* ignore */
      }
      let senateActionItems: { description: string; created_at: string; event_type?: string }[] = [];
      try {
        const sen = await senRes.json();
        const senateList = Array.isArray(sen) ? sen : Array.isArray(sen?.actions) ? sen.actions : [];
        if (senateList.length > 0) {
          setSenateActions(senateList);
          senateActionItems = senateList.map((e: { description?: string; created_at?: string }) => ({
            description: String(e.description ?? ""),
            created_at: String(e.created_at ?? ""),
            event_type: "senate",
          }));
        }
      } catch {
        /* ignore */
      }
      try {
        const zrs = await zrsRes.json();
        const zrsList = Array.isArray(zrs) ? zrs : Array.isArray(zrs?.actions) ? zrs.actions : [];
        if (zrsList.length > 0) {
          setZrsEvents(
            zrsList.map((e: { description?: string; created_at?: string; event_type?: string }) => ({
              description: String(e.description ?? ""),
              created_at: String(e.created_at ?? ""),
              event_type: String(e.event_type ?? "economy"),
            }))
          );
        }
      } catch {
        /* ignore */
      }
      try {
        const eventsRaw = await eventsRes.json();
        const normalized = (Array.isArray(eventsRaw) ? eventsRaw : []).map(
          (e: { description?: string; created_at?: string; time?: string; event_type?: string; type?: string }) => ({
            description: String(e.description ?? ""),
            created_at: String(e.created_at ?? e.time ?? ""),
            event_type: String(e.event_type ?? e.type ?? ""),
            type: String(e.type ?? e.event_type ?? ""),
          })
        );
        setActivityLogEvents(normalized);
        const fromEvents = normalized
          .filter(isSenateEvent)
          .map((e) => ({
            description: e.description,
            created_at: e.created_at,
            event_type: e.event_type,
          }));
        const merged = [...fromEvents, ...senateActionItems]
          .filter((e) => e.description)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const seen = new Set<string>();
        const deduped = merged.filter((e) => {
          const key = `${e.description}|${e.created_at}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setSenateEvents(deduped);
      } catch {
        setSenateEvents(senateActionItems);
      }
    };

    const loadEcoHud = async () => {
      await Promise.all([fetchEcoPol(), fetchGovernmentData(), fetchPoliticalEconomy(), fetchActivityLogs()]);
    };
    void loadEcoHud();
    const ecoInterval = setInterval(() => {
      void loadEcoHud();
    }, 60_000);
    fetch("/api/state/treasury").then((r) => r.json()).then((d) => setStateTreasury(d)).catch(() => {});
    fetch("/api/frs/stats")
      .then((r) => r.json())
      .then((d) => setFrsStats(d))
      .catch(() => {});

    return () => clearInterval(ecoInterval);
  }, [activeTab, fetchEcoPol, fetchGovernmentData, fetchPoliticalEconomy]);

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
        text: `⚠️ Revolution pressure rising: ${Math.round(revPressure)}/150`,
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
        text: `UPRISING ACTIVE — Revolution meter ${ecoPolData.uprising.meter ?? 0}%`,
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
      text: `🌡️ Revolution meter ${meterMsg}% · Poverty ${Number(povertyMsg).toFixed(1)}% · ${aliveMsg.toLocaleString("en-US")} agents alive`,
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
    const nick = zionProfile.nickname?.trim();
    const avatarId = zionNormalizeAvatarId(zionProfile.avatar);
    const btnLabel = nick
      ? nick.length > 12
        ? `${nick.slice(0, 10)}…`
        : nick
      : `${w.slice(0, 6)}...${w.slice(-4)}`;
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
            border: "1px solid #00ff41",
            color: "#00ff41",
            padding: "6px 10px 6px 6px",
            borderRadius: "6px",
            cursor: "pointer",
            fontFamily: "monospace",
            fontSize: "0.78rem",
            letterSpacing: "0.5px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <ZionBetAvatarImg avatarId={avatarId} size={26} />
          <span>{`${btnLabel} ▾`}</span>
        </button>
        {showWalletMenu ? (
          <ZionBetProfileDropdown
            walletAddress={w}
            profile={zionProfile}
            stats={zionBetStats}
            onProfileChange={(p) => {
              setZionProfile(p);
              saveZionProfile(w, p);
            }}
            onRefreshAchievements={refreshZionAchievements}
            onOpenPortfolio={() => setShowPortfolioOverlay(true)}
            onOpenMyBets={() => setShowMyBetsOverlay(true)}
            onLeaderboard={() => setActiveTab("leaderboard")}
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
            {renderZionWalletProfileMenu()}
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
      <canvas
        ref={bgCanvasRef}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          opacity: activeTab === "zbank" || activeTab === "civilization" ? 0 : 0.22,
          pointerEvents: "none",
        }}
        aria-hidden
      />
      <div
        className="bg-nebula"
        style={activeTab === "zbank" ? { opacity: 0, background: "#0a0a0a" } : undefined}
      />
      <div
        className="bg-grid"
        style={activeTab === "zbank" ? { display: "none" } : undefined}
      />

      {showIntro && (
        <div
          className="introFullscreen"
          style={{
            position: "fixed",
            inset: 0,
            background: "#000",
            zIndex: 10002,
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
              <div style={{ color: "#00ff41" }}>
                {stats?.alive ? `✓ ${stats.alive.toLocaleString()} agents online` : "Loading agents..."}
              </div>
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
        <header className={`labHeader ${isMobile ? "labHeaderMobile" : ""}`}>
          <div className="labHeaderLeft">
            <span className="labLogo">ZION</span>
            <span className="labSubtitle">Autonomous Civilization Research</span>
          </div>
          <div className="labHeaderCenter">
            <span>EXPERIMENT #001</span>
            <span className="labHeaderSep">·</span>
            <span className="labLiveIndicator">
              <span className="labLiveDot" />
              LIVE
            </span>
            <span className="labHeaderSep">·</span>
            <span>RUN TIME: {experimentRunTime}</span>
          </div>
          <div className="labHeaderRight" aria-label="Sign in">
            {renderAuthToolbar()}
          </div>
        </header>
        <nav
          className="mainNav"
          aria-label="Main navigation"
          style={isMobile ? { flexWrap: "wrap" } : { flexWrap: "nowrap" }}
        >
          {LAB_NAV_ITEMS.map(({ id, label }) => (
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
            <div className="civTabRoot" style={{ position: "relative", zIndex: 1 }}>
              <canvas
                ref={matrixCanvasRef}
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  zIndex: 0,
                  opacity: 0.15,
                  pointerEvents: "none",
                }}
                aria-hidden
              />
              <section
                className="statsGrid"
                style={
                  isMobile
                    ? { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }
                    : { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }
                }
              >
                <article className="statCard">
                  <p className="statCardLabel">SUBJECTS ALIVE</p>
                  <h3 className="statCardValue">
                    {statsLoading
                      ? "—"
                      : (() => {
                          const n = stats?.alive ?? lastAliveCount ?? agents.length;
                          return n != null ? Number(n).toLocaleString("en-US") : "—";
                        })()}
                  </h3>
                  <div className="statCardRule" />
                </article>
                <article className="statCard">
                  <p className="statCardLabel">TOTAL SUPPLY</p>
                  <h3 className="statCardValue">
                    {stats ? Math.round(stats.total_zion).toLocaleString("en-US") : "—"}
                  </h3>
                  <p className="statCardSub">ZION tokens</p>
                  <div className="statCardRule" />
                </article>
                <article className="statCard">
                  <p className="statCardLabel">FATALITIES / 24H</p>
                  <h3 className="statCardValue statCardValueDanger">
                    {stats?.deaths_today?.toLocaleString("en-US") ?? "—"}
                  </h3>
                  <p className="statCardSub">
                    mortality{" "}
                    {deathsDeltaPct !== null
                      ? `${deathsDeltaPct >= 0 ? "+" : ""}${deathsDeltaPct.toFixed(1)}%`
                      : "—"}
                  </p>
                  <div className="statCardRule" />
                </article>
              </section>

              <section className="constitutionBanner" aria-label="Constitution status">
                <div className="constitutionBannerRow">
                  <span className="constitutionBannerItem">
                    <strong>CONSTITUTION v1.0</strong>
                  </span>
                  <span className="constitutionBannerDivider" />
                  <span className="constitutionBannerItem">35 AMENDMENTS ENACTED</span>
                  <span className="constitutionBannerDivider" />
                  <span className="constitutionBannerItem">97.8% RATIFIED</span>
                </div>
                <div className="constitutionBannerRow constitutionBannerRowSub">
                  <span className="constitutionBannerMuted">
                    Walrus: iBQQwgv1N4vejnjy7TrdFpghFHmK9UdN-7sDe3K_cU0
                  </span>
                  <span className="constitutionBannerDivider" />
                  <span className="constitutionBannerMuted">ZCO Tribunal: 3/3</span>
                  <span className="constitutionBannerDivider" />
                  <a href="/whitepaper.md" className="constitutionBannerLink" target="_blank" rel="noopener noreferrer">
                    VIEW DOCUMENT
                  </a>
                </div>
              </section>

              <section
                className="civilizationSidebarRow"
                aria-label="Agent feed and territory map"
                style={{
                  flexDirection: isMobile ? "column" : "row",
                  alignItems: "stretch",
                }}
              >
                <div
                  className="civilizationSidebarRowFill civilizationMapCol"
                  style={{
                    width: isMobile ? "100%" : "65%",
                    flex: isMobile ? "none" : "1 1 65%",
                    minWidth: 0,
                  }}
                >
                  <DistrictMapPanel />
                </div>
                <aside
                  className="civilizationSidebar civilizationChatCol"
                  style={{
                    width: isMobile ? "100%" : "35%",
                    maxWidth: isMobile ? "100%" : "35%",
                    flex: isMobile ? "none" : "0 0 35%",
                    paddingLeft: "24px",
                  }}
                >
                  <div
                    className="sidebarAgentConvWrap civilizationAgentFeed fieldObservationsPanel"
                    style={{
                      height: "100%",
                      minHeight: isMobile ? undefined : 420,
                    }}
                  >
                    <h2 className="sidebarSectionTitle fieldObservationsTitle">
                      FIELD OBSERVATIONS
                    </h2>
                    <p className="sidebarHint">Subject pairs · refresh 60s · last 4</p>
                    <div className="agentConvFeed">
                      {conversations.length === 0 ? (
                        <p className="agentConvEmpty">Scanning agent chatter…</p>
                      ) : (
                        (Array.isArray(conversations) ? conversations : []).slice(0, 4).map((conv, idx, arr) => {
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
                              className={`agentConvCard agentConvCardCompact fieldObservationCard${idx < arr.length - 1 ? " agentConvCardSep" : ""}`}
                            >
                              <div className="agentConvBadge agentConvBadgeCompact fieldObservationBadge">
                                <span className="fieldObservationSubjectId">
                                  SUBJECT ID: AGT-{String(conv.agent1.id).padStart(4, "0")}
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
                                  <div className="agentConvBubble agentConvBubbleLeft">
                                    {leftText}
                                  </div>
                                </div>
                                <div className="agentConvRow agentConvRowRight">
                                  <div className="agentConvMeta agentConvMetaRight" style={{ color: m2.border }}>
                                    <span className="agentConvClassTag">{conv.agent2.class}</span>
                                    <strong>{cleanName(conv.agent2.name)}</strong>
                                    <span aria-hidden>{m2.icon}</span>
                                  </div>
                                  <div className="agentConvBubble agentConvBubbleRight agentConvBubbleAgent2">
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

              {uniqueCorporations.length > 0 && (
                <>
                  <div className="labSectionDivider">
                    <span className="labSectionDividerLabel">CORPORATE SECTOR</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "12px" }}>
                    {uniqueCorporations.map((corp) => (
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
                  <NewsWireTicker label="CORPORATE WIRE" items={corporateNews} color="var(--accent)" variant="lab" />
                </>
              )}

              {policeDivisions && policeDivisions.divisions.length > 0 && (
                <>
                  <div className="labSectionDivider">
                    <span className="labSectionDividerLabel">LAW ENFORCEMENT</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "12px" }}>
                    {policeDivisions.divisions.map((div) => {
                      const divName = div.division_name || div.division || "UNKNOWN";
                      const roleBadge = POLICE_DIVISION_ROLE_BADGES[divName] || "🚔 PATROL";
                      const roleDesc =
                        POLICE_DIVISION_DESCRIPTIONS[divName] || "Division operations";
                      const dimmed = Boolean(div.depleted);
                      const mobilized =
                        Boolean(div.mobilized) ||
                        (policeDivisions.uprising_active && divName === "RIOT CTRL");
                      const statusLabel = mobilized
                        ? "MOBILIZED"
                        : dimmed
                          ? "DEPLETED"
                          : div.officers > 15
                            ? "STRONG"
                            : div.officers > 8
                              ? "MID"
                              : "LOW";
                      const statusColor = mobilized
                        ? "#ff8800"
                        : dimmed
                          ? "#666"
                          : div.officers > 15
                            ? "#00ff41"
                            : div.officers > 8
                              ? "#ffaa00"
                              : "#ff3232";
                      return (
                        <div
                          key={divName}
                          style={{
                            border: mobilized ? "1px solid #ff8800" : "1px solid #1a4a4a",
                            borderRadius: "10px",
                            padding: "14px",
                            background: mobilized
                              ? "rgba(255,120,0,0.06)"
                              : "rgba(0,200,200,0.03)",
                            opacity: dimmed && !mobilized ? 0.45 : 1,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "10px",
                            }}
                          >
                            <span
                              style={{
                                color: "#00cccc",
                                fontFamily: "monospace",
                                fontWeight: "bold",
                                fontSize: "0.85rem",
                              }}
                            >
                              {divName}
                            </span>
                            <span
                              style={{
                                background: "rgba(0,200,200,0.1)",
                                color: "#00cccc",
                                fontSize: "0.6rem",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontFamily: "monospace",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {roleBadge}
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "10px",
                            }}
                          >
                            <span
                              style={{
                                color: "#666",
                                fontFamily: "monospace",
                                fontSize: "0.6rem",
                              }}
                            >
                              {roleDesc}
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
                              {div.effectiveness.toFixed(0)}% EFF
                            </span>
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
                              gap: "8px",
                            }}
                          >
                            <div style={{ textAlign: "center" }}>
                              <div style={{ color: "#555", fontFamily: "monospace", fontSize: "0.6rem" }}>
                                OFFICERS
                              </div>
                              <div
                                style={{
                                  color: "#fff",
                                  fontFamily: "monospace",
                                  fontSize: "0.9rem",
                                  fontWeight: "bold",
                                }}
                              >
                                {div.officers}
                              </div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ color: "#555", fontFamily: "monospace", fontSize: "0.6rem" }}>
                                BUDGET
                              </div>
                              <div
                                style={{
                                  color: "#00cccc",
                                  fontFamily: "monospace",
                                  fontSize: "0.9rem",
                                  fontWeight: "bold",
                                }}
                              >
                                {div.budget.toFixed(0)}
                              </div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <div style={{ color: "#555", fontFamily: "monospace", fontSize: "0.6rem" }}>
                                STATUS
                              </div>
                              <div
                                style={{
                                  color: statusColor,
                                  fontFamily: "monospace",
                                  fontSize: "0.8rem",
                                  fontWeight: "bold",
                                }}
                              >
                                {statusLabel}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <NewsWireTicker label="POLICE WIRE" items={policeNews} color="var(--accent)" variant="lab" />
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
                      {(Array.isArray(clans) ? clans : []).map((clan, idx) => (
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
                  <NewsWireTicker label="CLAN WIRE" items={clanNews} color="var(--accent)" variant="lab" />
                </>
              )}

              <div
                style={{
                  margin: "24px 0 8px",
                  overflow: "hidden",
                  borderRadius: "6px",
                  border: "1px solid #a78bfa33",
                  background: "rgba(167,139,250,0.02)",
                  position: "relative",
                  zIndex: 1,
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
                        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
                        gap: "12px",
                      }}
                    >
                      {(Array.isArray(zcoDecisions) ? zcoDecisions : []).slice(0, 3).map((decision, zidx) => {
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
                            <div
                              style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "8px",
                                marginTop: "8px",
                              }}
                            >
                              {(() => {
                                const proofHref = zcoProofHref(decision);
                                return proofHref ? (
                                  <a
                                    href={proofHref}
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
                                    }}
                                  >
                                    View in Explorer ↗
                                  </a>
                                ) : (
                                  <span
                                    style={{
                                      fontFamily: "monospace",
                                      fontSize: "0.68rem",
                                      color: "#888",
                                    }}
                                  >
                                    ⏳ Storing proof…
                                  </span>
                                );
                              })()}
                              {decision.sui_url ? (
                                <a
                                  href={decision.sui_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    background: "rgba(79, 195, 247, 0.1)",
                                    border: "1px solid #4FC3F744",
                                    color: "#4FC3F7",
                                    fontFamily: "monospace",
                                    fontSize: "0.7rem",
                                    padding: "4px 10px",
                                    borderRadius: "4px",
                                    textDecoration: "none",
                                  }}
                                >
                                  🔗 Sui TX ↗
                                </a>
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
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
                  {typeof zionBetToast === "string" ? (
                    zionBetToast
                  ) : (
                    <>
                      <div>{zionBetToast.message}</div>
                      {zionBetToast.disclaimer ? (
                        <div className="zionBetToastDisclaimer">{zionBetToast.disclaimer}</div>
                      ) : null}
                    </>
                  )}
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
                      Object.entries(ZIONBET_TAB_LABELS) as [ZionbetBetTab, string][]
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
                                  signAndExecute as SignAndExecuteMutateFn,
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
                                  signAndExecute as SignAndExecuteMutateFn,
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
                          {betTab === "crypto" ? (
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
                            {ZIONBET_CRYPTO_TIMEFRAME_SIDEBAR.map(({ icon, label, tf }) => {
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
                          ) : null}
                          <div style={{ flex: 1 }}>
                            {zionbetTabLoading[betTab] ? (
                          <p style={{ fontSize: "0.85rem", color: "#8b9ab1", margin: "24px 0", textAlign: "center" }}>
                            Loading markets…
                          </p>
                        ) : betTab === "crypto" ? (
                          <>
                            {zionbetFilteredDeepbookMarkets.length > 0 ? (
                              <>
                            <h4 style={{ margin: "0 0 12px", color: "#4DA2FF", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                              ⚡ DEEPBOOK PREDICT — Binary markets
                            </h4>
                            <div className={`zionBetPmCardGrid${isMobile ? " zionBetPmCardGrid--mobile" : ""}`} style={{ marginBottom: 20 }}>
                              {zionbetFilteredDeepbookMarkets.map((m) => {
                                const yes = m.yes_pct ?? 50;
                                const market = zionbetApiToMarket(m);
                                return (
                                  <ZionBetMarketCardItem
                                    key={m.id}
                                    marketApi={m}
                                    yes={yes}
                                    betTab="crypto"
                                    volumeLabel={zionbetMarketVolumeLabel(m.volume, m.id, m.volume_sui)}
                                    endLabel={zionbetEndDateLabel(m.end_date, m.timeframe)}
                                    isZionCard={false}
                                    onOpen={() => setDetailMarket(m)}
                                    onBetYes={(e) => { e.stopPropagation(); setBetModal({ market, direction: true, open: true }); }}
                                    onBetNo={(e) => { e.stopPropagation(); setBetModal({ market, direction: false, open: true }); }}
                                  />
                                );
                              })}
                            </div>
                              </>
                            ) : null}
                            {zionbetDisplayedMarkets.length > 0 ? (
                              <>
                                <h4 style={{ margin: "0 0 12px", color: "#8b9ab1", fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase" }}>🌐 CRYPTO MARKETS</h4>
                                <div className={`zionBetPmCardGrid${isMobile ? " zionBetPmCardGrid--mobile" : ""}`}>
                                  {zionbetDisplayedMarkets.map((m) => {
                                    const yes = m.yes_pct ?? m.seed_yes_cents ?? 50;
                                    const market = zionbetApiToMarket(m);
                                    return (
                                      <ZionBetMarketCardItem key={m.id} marketApi={m} yes={yes} betTab="crypto"
                                        volumeLabel={zionbetMarketVolumeLabel(m.volume, m.id, m.volume_sui)}
                                        endLabel={zionbetEndDateLabel(m.end_date, m.timeframe)} isZionCard={false}
                                        onOpen={() => setDetailMarket(m)}
                                        onBetYes={(e) => { e.stopPropagation(); setBetModal({ market, direction: true, open: true }); }}
                                        onBetNo={(e) => { e.stopPropagation(); setBetModal({ market, direction: false, open: true }); }}
                                      />
                                    );
                                  })}
                                </div>
                              </>
                            ) : null}
                            {zionbetFilteredDeepbookMarkets.length === 0 && zionbetDisplayedMarkets.length === 0 ? (
                              <p style={{ fontSize: "0.78rem", color: "#8b9ab1", margin: "12px 0" }}>
                                No active markets in this category
                              </p>
                            ) : null}
                          </>
                        ) : (
                          <>
                            {betTab === "civilization" && zionMarkets.length > 0 ? (
                              <div style={{ marginBottom: "16px" }}>
                                <div
                                  style={{
                                    color: "#444",
                                    fontSize: "0.58rem",
                                    fontFamily: "monospace",
                                    letterSpacing: "2px",
                                    marginBottom: "10px",
                                  }}
                                >
                                  🌍 LIVE ZION CIVILIZATION MARKETS
                                </div>
                                <div className={`zionBetPmCardGrid${isMobile ? " zionBetPmCardGrid--mobile" : ""}`}>
                                  {zionMarkets.map((market) => {
                                    const marketApi = zionMarketRowToApiMarket(market);
                                    const yes = marketApi.yes_pct ?? 50;
                                    const bet = zionbetApiToMarket(marketApi);
                                    const opts = market.options || [];
                                    const yesOpt = opts[0];
                                    const noOpt = opts[1];
                                    return (
                                      <ZionBetMarketCardItem
                                        key={market.market_id}
                                        marketApi={marketApi}
                                        yes={yes}
                                        betTab="civilization"
                                        volumeLabel="ZION Civ"
                                        endLabel={zionbetEndDateLabel(market.expires_at)}
                                        isZionCard
                                        yesButtonLabel={
                                          yesOpt
                                            ? zionMarketOptionButtonLabel(yesOpt.label, yes)
                                            : `YES ${yes}¢`
                                        }
                                        noButtonLabel={
                                          noOpt
                                            ? zionMarketOptionButtonLabel(noOpt.label, 100 - yes)
                                            : `NO ${100 - yes}¢`
                                        }
                                        onOpen={() => setDetailMarket(marketApi)}
                                        onBetYes={(e) => {
                                          e.stopPropagation();
                                          setBetModal({ market: bet, direction: true, open: true });
                                        }}
                                        onBetNo={(e) => {
                                          e.stopPropagation();
                                          setBetModal({ market: bet, direction: false, open: true });
                                        }}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}
                            {zionbetDisplayedMarkets.length === 0 ? (
                              betTab === "civilization" && zionMarkets.length > 0 ? null : (
                                <p style={{ fontSize: "0.78rem", color: "#8b9ab1", margin: "12px 0" }}>
                                  No active markets in this category
                                </p>
                              )
                            ) : (
                          <div className={`zionBetPmCardGrid${isMobile ? " zionBetPmCardGrid--mobile" : ""}`}>
                            {zionbetDisplayedMarkets.map((m) => {
                              const yes = m.yes_pct ?? m.seed_yes_cents ?? 50;
                              const market = zionbetApiToMarket(m);
                              const volumeLabel = zionbetMarketVolumeLabel(m.volume, m.id, m.volume_sui);
                              const endLabel = zionbetEndDateLabel(m.end_date, m.timeframe);
                              const isZionCard =
                                betTab === "civilization" && zionbetIsZionNativeMarket(m.id);
                              return (
                                <ZionBetMarketCardItem
                                  key={m.id}
                                  marketApi={m}
                                  yes={yes}
                                  betTab={betTab}
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
                          </>
                        )}
                          </div>
                        </div>
                      </>
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
                      <th>ZionBet P&L</th>
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
                              color:
                                (row.zionbet_pnl ?? 0) > 0
                                  ? "#00ff41"
                                  : (row.zionbet_pnl ?? 0) < 0
                                    ? "#ff3232"
                                    : undefined,
                              fontWeight: 600,
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

          {activeTab === "zbank" && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                paddingTop: "6px",
                minHeight: "auto",
                width: "100%",
                position: "relative",
                zIndex: 10,
                boxSizing: "border-box",
              }}
            >
<div style={{ fontFamily:'monospace', maxWidth:'480px', margin:'0 auto', padding:'8px', width:'100%', boxSizing:'border-box' }}>
  <style>{`
    input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .zbank-input { color: #ffffff !important; caret-color: #00ff41; }
    .zbank-input::placeholder { color: #444; }
    .memo-input::placeholder { color: #333; }
    .memo-input { caret-color: #00ff41; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
    @keyframes pulse-glow {
      0%,100% { box-shadow: 0 0 4px rgba(0,255,65,0.4); opacity:0.7; }
      50% { box-shadow: 0 0 12px rgba(0,255,65,1); opacity:1; }
    }
    .memo-cursor::after {
      content: '|';
      color: #00ff41;
      animation: blink 1s infinite;
      margin-left: 2px;
    }
  `}</style>
  <div style={{display:'flex', alignItems:'center', background:'#0a0a0a', borderRadius:'16px', padding:'4px', marginBottom:'16px'}}>
    <button
      type="button"
      onClick={() => { setZbankMode('anonymous'); setZbStatus(''); setZbTxDigest(''); setAuditTrail(null); setZkStealthStatus(''); }}
      style={{flex:1, padding:'10px', borderRadius:'12px', border:'none', cursor:'pointer', fontFamily:'monospace', fontSize:'0.8rem', letterSpacing:'1px', background: zbankMode==='anonymous' ? '#00ff41' : 'transparent', color: zbankMode==='anonymous' ? '#000' : '#555', fontWeight:'bold', transition:'all 0.2s'}}
    >
      🔒 ANONYMOUS
    </button>
    <button
      type="button"
      onClick={() => { setZbankMode('stealth'); setStealthSubTab('send'); setZkStealthStatus(''); }}
      style={{flex:1, padding:'10px', borderRadius:'12px', border:'none', cursor:'pointer', fontFamily:'monospace', fontSize:'0.8rem', letterSpacing:'1px', background: zbankMode==='stealth' ? '#00ff41' : 'transparent', color: zbankMode==='stealth' ? '#000' : '#555', fontWeight:'bold', transition:'all 0.2s'}}
    >
      ⚡ STEALTH
    </button>
    <button
      type="button"
      onClick={() => setShowAdvanced(!showAdvanced)}
      onMouseEnter={() => {
        let idx = 0;
        gearIntervalRef.current = setInterval(() => {
          idx = (idx + 1) % gearColors.length;
          setGearColorIdx(idx);
        }, 150);
      }}
      onMouseLeave={() => {
        if (gearIntervalRef.current) clearInterval(gearIntervalRef.current);
        setGearColorIdx(0);
      }}
      style={{width:'34px', height:'34px', borderRadius:'8px', border:'none',
              background:'transparent', cursor:'pointer', fontSize:'1.1rem',
              color: gearColors[gearColorIdx],
              transition:'color 0.15s',
              display:'flex', alignItems:'center', justifyContent:'center'}}
    >
      ⚙
    </button>
  </div>

  {zbankMode === 'anonymous' && (
  <div style={{background:'#0d0d0d', borderRadius:'16px', padding:'16px', marginBottom:'4px', border:'1px solid #2a2a2a'}}>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px'}}>
      <span style={{color:'#777', fontSize:'0.68rem', fontFamily:'monospace'}}>From:</span>
      <span style={{color:'#555', fontSize:'0.68rem', fontFamily:'monospace'}}>{walletAddress ? walletAddress.slice(0,6)+'...'+walletAddress.slice(-4) : 'Connect wallet'}</span>
    </div>
    <div style={{background:'#111', borderRadius:'12px', padding:'14px 16px'}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
          <img
            src={zbCoin === 'SUI'
              ? 'https://s2.coinmarketcap.com/static/img/coins/64x64/20947.png'
              : 'https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png'}
            style={{width:'28px', height:'28px', borderRadius:'50%'}}
            alt={zbCoin}
          />
          <div>
            <div style={{color:'#fff', fontSize:'0.9rem', fontFamily:'monospace', fontWeight:'bold'}}>{zbCoin}</div>
            <div style={{color:'#777', fontSize:'0.65rem'}}>Sui Network</div>
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <input
            className="zbank-input"
            type="number"
            value={anonymousAmount || ''}
            onChange={(e) => setAnonymousAmount(parseFloat(e.target.value) || 0)}
            placeholder="0.00"
            style={{background:'transparent', border:'none', color:'#ffffff', fontSize:'1.4rem', fontFamily:'monospace', fontWeight:'bold', textAlign:'right', width:'130px', outline:'none', MozAppearance:'textfield'}}
          />
          <div style={{color:'#777', fontSize:'0.65rem', textAlign:'right'}}>
            {zbCoin === 'USDC'
              ? `~$${(anonymousAmount || 0).toFixed(2)} USD`
              : `~$${((anonymousAmount || 0) * suiPrice).toFixed(2)} USD`}
          </div>
        </div>
      </div>
      <div style={{display:'flex', gap:'8px', marginTop:'10px'}}>
          <button
            type="button"
            onClick={() => setZbCoin('SUI')}
            style={{
              flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
              padding:'10px', borderRadius:'12px', cursor:'pointer',
              border: zbCoin==='SUI' ? '1px solid #00ff41' : '1px solid #2a2a2a',
              background: zbCoin==='SUI' ? '#0d1a0d' : '#0d0d0d',
              color: zbCoin==='SUI' ? '#00ff41' : '#777',
              fontFamily:'monospace', fontSize:'0.75rem', fontWeight:'bold',
              transition:'all 0.2s'
            }}
          >
            <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/20947.png" style={{width:'16px', height:'16px', borderRadius:'50%'}} alt="SUI" />
            SUI
          </button>
          <button
            type="button"
            onClick={() => setZbCoin('USDC')}
            style={{
              flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:'6px',
              padding:'10px', borderRadius:'12px', cursor:'pointer',
              border: zbCoin==='USDC' ? '1px solid #00aaff' : '1px solid #2a2a2a',
              background: zbCoin==='USDC' ? '#0a0d1a' : '#0d0d0d',
              color: zbCoin==='USDC' ? '#00aaff' : '#777',
              fontFamily:'monospace', fontSize:'0.75rem', fontWeight:'bold',
              transition:'all 0.2s'
            }}
          >
            <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png" style={{width:'16px', height:'16px', borderRadius:'50%'}} alt="USDC" />
            USDC
          </button>
        </div>
    </div>
  </div>
  )}

  {zbankMode === 'anonymous' && (
  <div style={{display:'flex', justifyContent:'center', margin:'-2px 0', zIndex:1, position:'relative'}}>
    <div style={{width:'32px', height:'32px', borderRadius:'50%', background:'#0d0d0d', border:'2px solid #2a3a2a', display:'flex', alignItems:'center', justifyContent:'center', color:'#00ff41', fontSize:'0.9rem'}}>↓</div>
  </div>
  )}

  {zbankMode === 'stealth' && (
    <>
      <div style={{background:'#0d0d0d', border:'1px solid #2a2a2a', borderRadius:'12px', padding:'12px', marginBottom:'8px'}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
            <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/20947.png"
                 style={{width:'24px', height:'24px', borderRadius:'50%'}} alt="SUI"/>
            <div>
              <div style={{fontSize:'0.85rem', fontWeight:'bold', color:'#fff'}}>SUI</div>
              <div style={{fontSize:'0.6rem', color:'#555'}}>{walletAddress ? walletAddress.slice(0,6)+'...'+walletAddress.slice(-4) : 'Connect wallet'}</div>
            </div>
          </div>
          <div style={{display:'flex', gap:'4px', position:'relative', zIndex:10}}>
            <button type="button" onClick={() => { console.log('0.1 clicked'); setStealthAmount(0.1); }}
              style={{padding:'6px 12px', borderRadius:'8px', cursor:'pointer',
                      fontFamily:'monospace', fontSize:'0.7rem', zIndex:10,
                      border: stealthAmount===0.1 ? '1px solid #00ff41' : '1px solid #333',
                      background: stealthAmount===0.1 ? '#0d1a0d' : '#111',
                      color: stealthAmount===0.1 ? '#00ff41' : '#888', position:'relative'}}>
              0.1 SUI
            </button>
            <button type="button" onClick={() => { console.log('1 clicked'); setStealthAmount(1); }}
              style={{padding:'6px 12px', borderRadius:'8px', cursor:'pointer',
                      fontFamily:'monospace', fontSize:'0.7rem', zIndex:10,
                      border: stealthAmount===1 ? '1px solid #00ff41' : '1px solid #333',
                      background: stealthAmount===1 ? '#0d1a0d' : '#111',
                      color: stealthAmount===1 ? '#00ff41' : '#888', position:'relative'}}>
              1 SUI
            </button>
            <button type="button" onClick={() => { console.log('10 clicked'); setStealthAmount(10); }}
              style={{padding:'6px 12px', borderRadius:'8px', cursor:'pointer',
                      fontFamily:'monospace', fontSize:'0.7rem', zIndex:10,
                      border: stealthAmount===10 ? '1px solid #00ff41' : '1px solid #333',
                      background: stealthAmount===10 ? '#0d1a0d' : '#111',
                      color: stealthAmount===10 ? '#00ff41' : '#888', position:'relative'}}>
              10 SUI
            </button>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:'1.2rem', fontWeight:'bold', color:'#fff'}}>{stealthAmount}</div>
            <div style={{fontSize:'0.6rem', color:'#555'}}>~${(stealthAmount * suiPrice).toFixed(2)} USD</div>
          </div>
        </div>
        <div style={{borderTop:'1px solid #1a1a1a', margin:'8px 0'}}></div>
        <div style={{fontSize:'0.6rem', color:'#00ff41', letterSpacing:'1px', marginBottom:'5px'}}>→ RECIPIENT</div>
        <div style={{display:'flex', alignItems:'center', gap:'6px',
                     background:'#111', borderRadius:'8px', padding:'8px 10px',
                     marginBottom:'8px', border:'1px solid #1a3a1a'}}>
          <div style={{width:'18px', height:'18px', borderRadius:'50%', background:'#0d2a0d',
                       display:'flex', alignItems:'center', justifyContent:'center',
                       fontSize:'0.7rem', flexShrink:0,
                       animation:'pulse-glow 1.5s ease-in-out infinite'}}>⚡</div>
          <input value={zkStealthRecipient}
            onChange={(e) => setZkStealthRecipient(e.target.value)}
            placeholder="Paste st:sui:... here"
            className="zbank-input"
            style={{flex:1, width:'100%', background:'transparent', border:'none', color:'#fff',
                    fontFamily:'monospace', fontSize:'0.75rem', outline:'none',
                    caretColor:'#00ff41'}}/>
          <button type="button" onClick={async () => { try { const t = await navigator.clipboard.readText(); setZkStealthRecipient(t.trim()); } catch {} }}
            style={{padding:'4px 8px', borderRadius:'5px', border:'1px solid #1a3a1a',
                    background:'#0a1a0a', color:'#00ff41', fontFamily:'monospace',
                    fontSize:'0.62rem', cursor:'pointer', whiteSpace:'nowrap'}}>
            PASTE
          </button>
        </div>
        <div style={{fontSize:'0.6rem', color:'#555', letterSpacing:'1px', marginBottom:'4px'}}>MEMO</div>
        <textarea value={stealthMemo} onChange={(e) => setStealthMemo(e.target.value.slice(0, 280))}
          rows={2} className="zbank-input"
          placeholder="Private message (optional)"
          style={{width:'100%', background:'#111', border:'1px solid #1a3a1a',
                  borderRadius:'8px', padding:'8px 10px', color:'#fff',
                  fontFamily:'monospace', fontSize:'0.72rem', outline:'none',
                  resize:'none', boxSizing:'border-box', caretColor:'#00ff41'}}/>
      </div>

      <div style={{display:'flex', gap:'4px', marginBottom:'8px', alignItems:'center'}}>
        <button type="button" onClick={handleGenerateStealthAddress}
          style={{padding:'6px 10px', borderRadius:'7px', border:'1px solid #1a3a1a', background:'#0a1a0a', color:'#00ff41', fontFamily:'monospace', fontSize:'0.65rem', cursor:'pointer', whiteSpace:'nowrap'}}>
          🔑 MY KEY
        </button>
        <div style={{flex:1, background:'#0d0d0d', border:'1px solid #1a1a1a', borderRadius:'7px', padding:'6px 8px', color:'#444', fontFamily:'monospace', fontSize:'0.62rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
          {stealthAddress || 'No key generated'}
        </div>
        <button type="button" onClick={copyStealthAddressToClipboard} disabled={!stealthAddress}
          style={{padding:'6px 8px', borderRadius:'7px', border:'1px solid #1a3a1a', background:'transparent', color:'#00ff41', fontFamily:'monospace', fontSize:'0.62rem', cursor: stealthAddress ? 'pointer' : 'default'}}>
          {copiedStealth ? '✓' : 'COPY'}
        </button>
        <div style={{position:'relative'}}>
          <button type="button" onClick={handleExportKeys}
            onMouseEnter={(e) => {
              setKeyTooltip('export');
              e.currentTarget.style.boxShadow = '0 0 12px rgba(0,170,255,0.8), 0 0 4px rgba(0,170,255,0.5)';
              e.currentTarget.style.borderColor = '#00aaff';
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.background = 'rgba(0,170,255,0.1)';
            }}
            onMouseLeave={(e) => {
              setKeyTooltip('');
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.borderColor = '#222';
              e.currentTarget.style.color = '#00aaff';
              e.currentTarget.style.background = 'transparent';
            }}
            style={{padding:'6px 8px', borderRadius:'7px', border:'1px solid #222',
                    background:'transparent', color:'#00aaff', fontSize:'0.85rem', cursor:'pointer',
                    transition:'all 0.2s'}}>
            ↑
          </button>
          {keyTooltip === 'export' && (
            <div style={{position:'absolute', bottom:'110%', left:'50%', transform:'translateX(-50%)',
                         background:'#1a1a1a', border:'1px solid #333', borderRadius:'5px',
                         padding:'3px 8px', color:'#00aaff', fontSize:'0.62rem',
                         whiteSpace:'nowrap', zIndex:100, pointerEvents:'none'}}>
              Export keys
            </div>
          )}
        </div>
        <div style={{position:'relative'}}>
          <button type="button" onClick={handleImportKeys}
            onMouseEnter={(e) => {
              setKeyTooltip('import');
              const el = e.currentTarget as HTMLButtonElement;
              el.style.boxShadow = '0 0 14px rgba(255,170,0,0.9)';
              el.style.borderColor = '#ffaa00';
              el.style.color = '#fff';
              el.style.background = 'rgba(255,170,0,0.15)';
            }}
            onMouseLeave={(e) => {
              setKeyTooltip('');
              const el = e.currentTarget as HTMLButtonElement;
              el.style.boxShadow = 'none';
              el.style.borderColor = '#222';
              el.style.color = '#ffaa00';
              el.style.background = 'transparent';
            }}
            style={{padding:'6px 8px', borderRadius:'7px', border:'1px solid #222',
                    background:'transparent', color:'#ffaa00', fontSize:'0.85rem', cursor:'pointer',
                    transition:'all 0.2s'}}>
            ↓
          </button>
          {keyTooltip === 'import' && (
            <div style={{position:'absolute', bottom:'110%', left:'50%', transform:'translateX(-50%)',
                         background:'#1a1a1a', border:'1px solid #333', borderRadius:'5px',
                         padding:'3px 8px', color:'#ffaa00', fontSize:'0.62rem',
                         whiteSpace:'nowrap', zIndex:100, pointerEvents:'none'}}>
              Import keys
            </div>
          )}
        </div>
      </div>

      <div style={{display:'flex', gap:'4px', marginBottom:'10px'}}>
        <button type="button" onClick={() => setStealthSubTab('send')}
          style={{flex:1, padding:'8px', borderRadius:'8px', border:'none', cursor:'pointer', fontFamily:'monospace', fontSize:'0.72rem',
                  background: stealthSubTab==='send' ? '#0d2a0d' : '#0d0d0d',
                  color: stealthSubTab==='send' ? '#00ff41' : '#444',
                  borderBottom: stealthSubTab==='send' ? '1.5px solid #00ff41' : '1.5px solid transparent'}}>
          ↗ SEND
        </button>
        <button type="button" onClick={() => setStealthSubTab('receive')}
          style={{flex:1, padding:'8px', borderRadius:'8px', border:'none', cursor:'pointer', fontFamily:'monospace', fontSize:'0.72rem',
                  background: stealthSubTab==='receive' ? '#0d2a0d' : '#0d0d0d',
                  color: stealthSubTab==='receive' ? '#00ff41' : '#444',
                  borderBottom: stealthSubTab==='receive' ? '1.5px solid #00ff41' : '1.5px solid transparent'}}>
          ↙ RECEIVE
        </button>
      </div>

      {showAdvanced && stealthSubTab === 'send' && (
        <div style={{background:'#0a0f0a', border:'1px solid #2a3a2a', borderRadius:'12px', padding:'12px', marginBottom:'12px'}}>
          <div style={{color:'#777', fontSize:'0.62rem', letterSpacing:'2px', marginBottom:'10px'}}>ADVANCED SETTINGS</div>
          <button type="button" onClick={() => setMultiSend(!multiSend)}
            style={{padding:'6px 12px', fontSize:'0.68rem', marginBottom:'10px', width:'100%',
                    background: multiSend ? '#0d2a0d' : 'transparent',
                    border: multiSend ? '1px solid #00ff41' : '1px solid #2a3a2a',
                    color: multiSend ? '#00ff41' : '#777',
                    cursor:'pointer', fontFamily:'monospace', borderRadius:'8px'}}>
            {multiSend ? '👥 MULTI-SEND ON' : '👥 MULTI-SEND OFF'}
          </button>
          {multiSend && (
            <div style={{ marginBottom:'10px' }}>
              {multiRecipients.map((r, i) => (
                <div key={i} style={{display:'flex', gap:'6px', marginBottom:'6px', alignItems:'center'}}>
                  <input className="zbank-input" value={r.address}
                    onChange={(e) => { const updated = [...multiRecipients]; updated[i].address = e.target.value; setMultiRecipients(updated); }}
                    placeholder="0x... recipient"
                    style={{flex:1, padding:'8px', background:'#111', border:'1px solid #2a3a2a', color:'#ffffff', fontFamily:'monospace', fontSize:'0.65rem', borderRadius:'8px', outline:'none'}} />
                  <select value={r.denomination}
                    onChange={(e) => { const updated = [...multiRecipients]; updated[i].denomination = e.target.value as "0.1" | "1" | "10"; setMultiRecipients(updated); }}
                    style={{padding:'8px', background:'#111', color:'#00ff41', border:'1px solid #2a3a2a', fontFamily:'monospace', fontSize:'0.65rem', cursor:'pointer', borderRadius:'8px'}}>
                    <option value="0.1">0.1</option><option value="1">1</option><option value="10">10</option>
                  </select>
                  {i > 0 && (
                    <button type="button" onClick={() => setMultiRecipients(multiRecipients.filter((_, j) => j !== i))}
                      style={{padding:'6px 8px', background:'transparent', border:'1px solid #331a1a', color:'#664444', cursor:'pointer', fontFamily:'monospace', borderRadius:'8px', fontSize:'0.65rem'}}>✕</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setMultiRecipients([...multiRecipients, { address: '', denomination: '0.1' }])}
                style={{width:'100%', padding:'6px', background:'transparent', border:'1px dashed #2a3a2a', color:'#777', cursor:'pointer', fontFamily:'monospace', fontSize:'0.65rem', marginBottom:'6px', borderRadius:'8px'}}>
                + ADD RECIPIENT
              </button>
            </div>
          )}
          <div style={{display:'flex', flexWrap:'wrap', gap:'6px', marginBottom:'8px'}}>
            <button type="button" onClick={() => setAutoWithdraw(!autoWithdraw)}
              style={{padding:'6px 10px', fontSize:'0.65rem', background: autoWithdraw ? '#0d2a0d' : 'transparent', border: autoWithdraw ? '1px solid #00ff41' : '1px solid #2a3a2a', color: autoWithdraw ? '#00ff41' : '#777', cursor:'pointer', fontFamily:'monospace', borderRadius:'8px'}}>
              {autoWithdraw ? '⏱ AUTO-WITHDRAW ON' : '⏱ AUTO-WITHDRAW OFF'}
            </button>
            <button type="button" onClick={() => setFragmentedWithdraw(!fragmentedWithdraw)}
              style={{padding:'6px 10px', fontSize:'0.65rem', background: fragmentedWithdraw ? '#0d2a0d' : 'transparent', border: fragmentedWithdraw ? '1px solid #00ff41' : '1px solid #2a3a2a', color: fragmentedWithdraw ? '#00ff41' : '#777', cursor:'pointer', fontFamily:'monospace', borderRadius:'8px'}}>
              {fragmentedWithdraw ? '🔀 FRAGMENTED ON' : '🔀 FRAGMENTED OFF'}
            </button>
            <button type="button" onClick={() => setUseDecoys(!useDecoys)}
              style={{padding:'6px 10px', fontSize:'0.65rem', background: useDecoys ? '#0d2a0d' : 'transparent', border: useDecoys ? '1px solid #00ff41' : '1px solid #2a3a2a', color: useDecoys ? '#00ff41' : '#777', cursor:'pointer', fontFamily:'monospace', borderRadius:'8px'}}>
              {useDecoys ? '👻 DECOYS ON' : '👻 DECOYS OFF'}
            </button>
          </div>
        </div>
      )}

      {stealthSubTab === 'send' && (
        <>
          {(() => {
            const statusMsg = zkStealthStatus;
            const hideStatusForTxCard = zbTxDigest && statusMsg.startsWith('✅');
            if (!statusMsg || hideStatusForTxCard) return null;
            return (
              <div style={{ marginBottom:'12px', padding:'10px', borderRadius:'12px', fontSize:'0.72rem',
                background: statusMsg.startsWith('✅') ? 'rgba(0,255,65,0.08)' : statusMsg.startsWith('❌') ? 'rgba(255,34,68,0.08)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${statusMsg.startsWith('✅') ? '#2a3a2a' : statusMsg.startsWith('❌') ? 'rgba(255,34,68,0.3)' : '#2a2a2a'}`,
                color: statusMsg.startsWith('✅') ? '#00ff41' : statusMsg.startsWith('❌') ? '#ff4466' : '#666',
                whiteSpace: 'pre-line' }}>
                {zkStealthLoading && !statusMsg.startsWith('✅') && !statusMsg.startsWith('❌') && '⏳ '}
                {statusMsg}
              </div>
            );
          })()}

          {multiSend ? (
            <button type="button" onClick={() => handleZkStealthMultiSend()} disabled={zkStealthLoading}
              style={{width:'100%', padding:'16px', borderRadius:'16px', border:'none', background:'#00ff41', color:'#000', fontFamily:'monospace', fontSize:'0.9rem', fontWeight:'bold', letterSpacing:'2px', cursor: zkStealthLoading ? 'wait' : 'pointer', boxShadow:'0 4px 24px rgba(0,255,65,0.2)', transition:'all 0.2s', opacity: zkStealthLoading ? 0.7 : 1}}>
              {zkStealthLoading ? 'PROCESSING...' : `👥 SEND TO ${multiRecipients.filter((r) => r.address.length === 66).length} RECIPIENTS`}
            </button>
          ) : (
            <button type="button" onClick={() => handleZkStealthSend()}
              disabled={zkStealthLoading || !zkStealthRecipient || !zkStealthRecipient.startsWith('st:sui:')}
              style={{width:'100%', padding:'16px', borderRadius:'16px', border:'none', background:'#00ff41', color:'#000', fontFamily:'monospace', fontSize:'0.9rem', fontWeight:'bold', letterSpacing:'2px', boxShadow:'0 4px 24px rgba(0,255,65,0.2)', transition:'all 0.2s',
                      cursor: zkStealthLoading ? 'wait' : (!zkStealthRecipient || !zkStealthRecipient.startsWith('st:sui:')) ? 'not-allowed' : 'pointer',
                      opacity: (!zkStealthRecipient || !zkStealthRecipient.startsWith('st:sui:')) ? 0.4 : zkStealthLoading ? 0.7 : 1}}>
              {zkStealthLoading ? 'PROCESSING...' : '⚡ SEND STEALTH'}
            </button>
          )}

          {zbTxDigest && (
            <div style={{background:'#050f05', border:'1px solid #1a3a1a', borderRadius:'12px', padding:'14px 16px', marginTop:'12px'}}>
              <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px'}}>
                <span style={{color:'#00ff41', fontSize:'1rem'}}>✅</span>
                <span style={{color:'#00ff41', fontSize:'0.75rem', fontFamily:'monospace', letterSpacing:'1px', fontWeight:'bold'}}>TRANSFER SENT</span>
              </div>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'#0a0a0a', borderRadius:'8px', padding:'10px 12px'}}>
                <div>
                  <div style={{color:'#555', fontSize:'0.6rem', letterSpacing:'1px', marginBottom:'3px'}}>TRANSACTION</div>
                  <div style={{color:'#777', fontSize:'0.68rem', fontFamily:'monospace'}}>{zbTxDigest.slice(0,8)}...{zbTxDigest.slice(-6)}</div>
                </div>
                <a href={`https://suiscan.xyz/testnet/tx/${zbTxDigest}`} target="_blank" rel="noopener noreferrer"
                  style={{display:'flex', alignItems:'center', gap:'6px', background:'#0d1a0d', border:'1px solid #1a3a1a', borderRadius:'8px', padding:'8px 12px', color:'#00ff41', fontSize:'0.7rem', fontFamily:'monospace', textDecoration:'none', letterSpacing:'1px'}}>
                  SUISCAN ↗
                </a>
              </div>
            </div>
          )}

          {auditTrail && (
            <div style={{background:'#050f05', border:'1px solid #1a3a1a',
                         borderRadius:'12px', padding:'14px', marginTop:'10px'}}>
              <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px'}}>
                <span>🔐</span>
                <span style={{color:'#00ff41', fontSize:'0.75rem', fontFamily:'monospace',
                              fontWeight:'bold', letterSpacing:'1px'}}>
                  AUDIT TRAIL SAVED
                </span>
                <span style={{marginLeft:'auto', background:'#0a1a0a', border:'1px solid #1a3a1a',
                              borderRadius:'4px', padding:'2px 8px', color:'#00ff41',
                              fontSize:'0.6rem', fontFamily:'monospace'}}>
                  WALRUS
                </span>
              </div>

              <div style={{background:'#0a0a0a', borderRadius:'8px', padding:'10px 12px', marginBottom:'8px'}}>
                <div style={{color:'#555', fontSize:'0.58rem', letterSpacing:'1px', marginBottom:'4px'}}>
                  VIEW KEY ID (public)
                </div>
                <div style={{color:'#777', fontSize:'0.68rem', fontFamily:'monospace'}}>
                  {auditTrail.view_key_id}
                </div>
              </div>

              <div style={{background:'#1a0a0a', border:'1px solid #3a1a1a', borderRadius:'8px',
                           padding:'10px 12px', marginBottom:'8px'}}>
                <div style={{color:'#ff4444', fontSize:'0.58rem', letterSpacing:'1px', marginBottom:'4px'}}>
                  🔑 VIEW KEY SECRET (keep private!)
                </div>
                <div style={{color:'#ff8888', fontSize:'0.65rem', fontFamily:'monospace',
                             wordBreak:'break-all'}}>
                  {auditTrail.view_key_secret}
                </div>
                <div style={{color:'#555', fontSize:'0.58rem', marginTop:'6px'}}>
                  Share this key only with authorized auditors to prove transaction details
                </div>
              </div>

              <div style={{background:'#0a0a0a', borderRadius:'8px', padding:'10px 12px'}}>
                <div style={{color:'#555', fontSize:'0.58rem', letterSpacing:'1px', marginBottom:'4px'}}>
                  WALRUS BLOB ID
                </div>
                <a href={`/zco/${auditTrail.walrus_blob_id}`} target="_blank"
                   rel="noopener noreferrer"
                   style={{color:'#00ff41', fontSize:'0.65rem', fontFamily:'monospace',
                           textDecoration:'none', wordBreak:'break-all'}}>
                  {auditTrail.walrus_blob_id} ↗
                </a>
              </div>

              <button
                type="button"
                onClick={() => {
                  const data = JSON.stringify({
                    view_key_id: auditTrail.view_key_id,
                    view_key_secret: auditTrail.view_key_secret,
                    salt: auditTrail.salt,
                    walrus_blob_id: auditTrail.walrus_blob_id,
                  }, null, 2);
                  void navigator.clipboard.writeText(data);
                }}
                style={{width:'100%', marginTop:'10px', padding:'8px', borderRadius:'8px',
                        border:'1px solid #1a3a1a', background:'transparent', color:'#00ff41',
                        fontFamily:'monospace', fontSize:'0.65rem', cursor:'pointer'}}>
                📋 COPY VIEW KEY (for audit)
              </button>
            </div>
          )}

          <div style={{marginTop:'16px', borderTop:'1px solid #2a3a2a', paddingTop:'16px'}}>
            <button type="button" onClick={() => setShowSchedule(!showSchedule)}
              style={{width:'100%', padding:'8px', fontSize:'0.72rem', background: showSchedule ? '#0d1a0d' : 'transparent',
                      border:'1px solid #2a3a2a', color: showSchedule ? '#00ff41' : '#777', cursor:'pointer', fontFamily:'monospace', borderRadius:'10px'}}>
              {showSchedule ? '📅 SCHEDULE PAYMENT ▲' : '📅 SCHEDULE RECURRING PAYMENT ▼'}
            </button>
            {showSchedule && (
              <div style={{marginTop:'12px'}}>
                <div style={{fontSize:'0.68rem', color:'#777', marginBottom:'8px', fontFamily:'monospace'}}>
                  AUTO-SEND {stealthAmount} SUI TO THIS ADDRESS
                </div>
                <div style={{marginBottom:'10px'}}>
                  <div style={{color:'#555', fontSize:'0.62rem', letterSpacing:'1px', marginBottom:'4px', fontFamily:'monospace'}}>RECIPIENT STEALTH ADDRESS</div>
                  <input value={scheduleRecipient || zkStealthRecipient} onChange={(e) => setScheduleRecipient(e.target.value)}
                    placeholder="st:sui:... recipient address" className="zbank-input"
                    style={{width:'100%', background:'#111', border:'1px solid #2a2a2a', borderRadius:'8px', padding:'8px 12px', fontSize:'0.72rem', fontFamily:'monospace', outline:'none', boxSizing:'border-box', color:'#ffffff'}} />
                </div>
                <div style={{display:'flex', gap:'8px', marginBottom:'8px'}}>
                  {(['daily','weekly','monthly'] as const).map(f => (
                    <button key={f} type="button" onClick={() => setScheduleFrequency(f)}
                      style={{flex:1, padding:'6px', fontSize:'0.68rem', background: scheduleFrequency===f ? '#00ff41' : 'transparent',
                              color: scheduleFrequency===f ? '#000' : '#777', border: scheduleFrequency===f ? '1px solid #00ff41' : '1px solid #2a3a2a',
                              cursor:'pointer', fontFamily:'monospace', textTransform:'uppercase', borderRadius:'8px'}}>{f}</button>
                  ))}
                </div>
                <div style={{display:'flex', gap:'8px', alignItems:'center', marginBottom:'8px'}}>
                  <span style={{fontSize:'0.68rem', color:'#777', fontFamily:'monospace'}}>PAYMENTS:</span>
                  <input className="zbank-input" value={scheduleMaxPayments} onChange={e => setScheduleMaxPayments(e.target.value)}
                    placeholder="0=unlimited" style={{flex:1, padding:'6px', background:'#111', border:'1px solid #2a3a2a', color:'#ffffff', fontFamily:'monospace', fontSize:'0.68rem', borderRadius:'8px', outline:'none'}} />
                  <span style={{fontSize:'0.62rem', color:'#555', fontFamily:'monospace'}}>0=∞</span>
                </div>
                <button type="button" onClick={handleCreateScheduledPayment}
                  style={{width:'100%', padding:'10px', fontSize:'0.75rem', background:'#0d2a0d', border:'1px solid #2a3a2a', color:'#00ff41', cursor:'pointer', fontFamily:'monospace', fontWeight:'bold', borderRadius:'10px'}}>
                  📅 CREATE SCHEDULE
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {stealthSubTab === 'receive' && (
        <div style={{background:'#0d0d0d', borderRadius:'12px', padding:'12px', border:'1px solid #2a2a2a', marginBottom:'8px'}}>
          <button type="button" onClick={() => void handleScanStealth()}
            style={{width:'100%', padding:'10px', borderRadius:'8px', border:'1px solid #222', background:'#111', color:'#777', fontFamily:'monospace', fontSize:'0.72rem', cursor:'pointer'}}>
            🔍 SCAN & CLAIM
          </button>

          {zkStealthNotes.filter((n) => n.status === 'pending').length > 0 &&
            claimResults.length === 0 && (
            <div
              style={{
                background: '#0d0d0d',
                border: '1px solid #1a1a1a',
                borderRadius: '10px',
                padding: '12px 14px',
                marginTop: '10px',
              }}>
              <div
                style={{
                  color: '#444',
                  fontSize: '0.58rem',
                  fontFamily: 'monospace',
                  letterSpacing: '1px',
                  marginBottom: '8px',
                }}>
                📩 INCOMING TRANSFER
              </div>

              <div
                style={{
                  color: '#00ff41',
                  fontSize: '0.85rem',
                  fontFamily: 'monospace',
                  fontWeight: 'bold',
                  marginBottom: '6px',
                }}>
                {zkStealthNotes
                  .filter((n) => n.status === 'pending')
                  .reduce((sum, n) => sum + (parseFloat(n.amount_sui || '0') || 0), 0)
                  .toFixed(4)}{' '}
                SUI
              </div>

              {zkStealthNotes.find((n) => n.status === 'pending' && n.memo) && (
                <div
                  style={{
                    color: '#00ccff',
                    fontSize: '0.65rem',
                    fontFamily: 'monospace',
                    marginBottom: '4px',
                    fontStyle: 'italic',
                  }}>
                  &quot;{zkStealthNotes.find((n) => n.status === 'pending' && n.memo)?.memo}&quot;
                </div>
              )}

              <div
                style={{
                  color: '#333',
                  fontSize: '0.58rem',
                  fontFamily: 'monospace',
                  marginBottom: '12px',
                }}>
                {zkStealthNotes.filter((n) => n.status === 'pending')[0]?.created_at
                  ? new Date(
                      zkStealthNotes.filter((n) => n.status === 'pending')[0].created_at
                    ).toLocaleTimeString()
                  : ''}
                {' · '}
                {zkStealthNotes.filter((n) => n.status === 'pending').length} notes
              </div>

              <button
                type="button"
                onClick={() => void handleClaimAll()}
                disabled={zkClaimLoading}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: 'none',
                  background: zkClaimLoading ? '#111' : '#00ff41',
                  color: zkClaimLoading ? '#777' : '#000',
                  fontFamily: 'monospace',
                  fontSize: '0.72rem',
                  fontWeight: 'bold',
                  cursor: zkClaimLoading ? 'wait' : 'pointer',
                  letterSpacing: '1px',
                  lineHeight: 1.3,
                }}>
                {zkClaimLoading ? zkClaimStatus || '⏳ Claiming...' : '⚡ CLAIM'}
              </button>
            </div>
          )}

          {claimResults.length > 0 && (
            <div
              style={{
                background: '#0a0a0a',
                border: '1px solid #1a3a1a',
                borderRadius: '10px',
                padding: '12px',
                marginTop: '10px',
              }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
                onClick={() => setClaimResultsExpanded(!claimResultsExpanded)}>
                <div
                  style={{
                    color: '#00ff41',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                  }}>
                  ✅ CLAIMED{' '}
                  {claimResults
                    .filter((r) => r.success !== false)
                    .reduce((sum, r) => sum + (r.amount || 0), 0)
                    .toFixed(4)}{' '}
                  SUI
                </div>
                <div
                  style={{
                    color: claimResultsExpanded ? '#ffaa00' : '#00ff41',
                    fontSize: '0.7rem',
                    fontFamily: 'monospace',
                  }}>
                  {claimResultsExpanded ? '▲' : '▼'}
                </div>
              </div>

              {claimResultsExpanded && (
                <div
                  style={{
                    marginTop: '10px',
                    borderTop: '1px solid #1a1a1a',
                    paddingTop: '8px',
                  }}>
                  {claimResults
                    .filter((r) => r.success !== false && r.digest)
                    .map((r, i) => (
                      <div
                        key={`${r.digest}-${i}`}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '4px 0',
                          borderBottom: '1px solid #0d0d0d',
                        }}>
                        <div
                          style={{
                            color: '#333',
                            fontSize: '0.6rem',
                            fontFamily: 'monospace',
                          }}>
                          {r.relayer || r.from
                            ? (r.relayer || r.from)!.slice(0, 14) + '...'
                            : `wallet ${i + 1}`}
                        </div>
                        <div
                          style={{
                            color: '#777',
                            fontSize: '0.62rem',
                            fontFamily: 'monospace',
                          }}>
                          {r.amount ? r.amount.toFixed(4) : '?'} SUI
                        </div>
                        <a
                          href={`https://suiscan.xyz/testnet/tx/${r.digest}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: '#00ff41',
                            fontSize: '0.6rem',
                            fontFamily: 'monospace',
                            textDecoration: 'none',
                          }}>
                          SUISCAN ↗
                        </a>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </>
  )}

  {zbankMode === 'anonymous' && (
  <div style={{background:'#0d0d0d', borderRadius:'16px', padding:'16px', marginTop:'4px', marginBottom:'12px', border:'1px solid #2a2a2a'}}>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px'}}>
      <span style={{color:'#777', fontSize:'0.68rem', fontFamily:'monospace'}}>To:</span>
    </div>
    <div style={{background:'#111', borderRadius:'12px', padding:'14px 16px'}}>
      <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px'}}>
        <img src="https://s2.coinmarketcap.com/static/img/coins/64x64/20947.png" style={{width:'28px', height:'28px', borderRadius:'50%', border:'1px solid #2a2a2a'}} alt="SUI" />
        <div>
          <div style={{color:'#fff', fontSize:'0.9rem', fontFamily:'monospace', fontWeight:'bold'}}>SUI ADDRESS</div>
          <div style={{color:'#777', fontSize:'0.65rem'}}>On-chain · Public</div>
        </div>
      </div>
      <div>
        <input className="zbank-input" value={zbRecipient} onChange={(e) => setZbRecipient(e.target.value)} placeholder="0x..."
          style={{background:'transparent', border:'none', color:'#ffffff', fontSize:'0.85rem', fontFamily:'monospace', width:'100%', outline:'none', padding:'4px 0'}} />
        {zbRecipient && zbRecipient.startsWith('0x') && zbRecipient.length === 66 && (
          <div style={{color:'#00ff41', fontSize:'0.65rem', marginTop:'4px'}}>✓ Valid Sui address</div>
        )}
      </div>
    </div>
  </div>
  )}

  {zbankMode === 'anonymous' && (() => {
    const statusMsg = zbStatus;
    const hideStatusForTxCard = zbTxDigest && statusMsg.startsWith('✅');
    if (!statusMsg || hideStatusForTxCard) return null;
    return (
      <div style={{ marginBottom:'12px', padding:'10px', borderRadius:'12px', fontSize:'0.72rem',
        background: statusMsg.startsWith('✅') ? 'rgba(0,255,65,0.08)' : statusMsg.startsWith('❌') ? 'rgba(255,34,68,0.08)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${statusMsg.startsWith('✅') ? '#2a3a2a' : statusMsg.startsWith('❌') ? 'rgba(255,34,68,0.3)' : '#2a2a2a'}`,
        color: statusMsg.startsWith('✅') ? '#00ff41' : statusMsg.startsWith('❌') ? '#ff4466' : '#666',
        whiteSpace: 'pre-line' }}>
        {zbLoading && !statusMsg.startsWith('✅') && !statusMsg.startsWith('❌') && '⏳ '}
        {statusMsg}
      </div>
    );
  })()}

  {zbankMode === 'anonymous' && (
    <button type="button" onClick={handleZbTransfer}
      disabled={zbLoading || !anonymousAmount || !zbRecipient}
      style={{width:'100%', padding:'16px', borderRadius:'16px', border:'none', background:'#00ff41', color:'#000',
              fontFamily:'monospace', fontSize:'0.9rem', fontWeight:'bold', letterSpacing:'2px', boxShadow:'0 4px 24px rgba(0,255,65,0.2)', transition:'all 0.2s',
              cursor: zbLoading ? 'wait' : 'pointer', opacity: (!anonymousAmount || !zbRecipient) ? 0.5 : zbLoading ? 0.7 : 1}}>
      {zbLoading ? 'PROCESSING...' : '🔒 SEND ANONYMOUSLY'}
    </button>
  )}

  {zbankMode === 'anonymous' && (
  <div style={{marginTop:'16px', borderTop:'1px solid #2a2a2a', paddingTop:'16px'}}>
    <button type="button" onClick={() => setShowSchedule(!showSchedule)}
      style={{width:'100%', padding:'8px', fontSize:'0.72rem', background: showSchedule ? '#0d1a0d' : 'transparent',
              border:'1px solid #2a2a2a', color: showSchedule ? '#00ff41' : '#777', cursor:'pointer', fontFamily:'monospace', borderRadius:'10px'}}>
      {showSchedule ? '📅 SCHEDULE PAYMENT ▲' : '📅 SCHEDULE RECURRING PAYMENT ▼'}
    </button>
    {showSchedule && (
      <div style={{marginTop:'12px'}}>
        <div style={{fontSize:'0.68rem', color:'#777', marginBottom:'8px', fontFamily:'monospace'}}>
          AUTO-SEND {anonymousAmount} {zbCoin} TO THIS ADDRESS
        </div>
        <div style={{display:'flex', gap:'8px', marginBottom:'8px'}}>
          {(['daily','weekly','monthly'] as const).map(f => (
            <button key={f} type="button" onClick={() => setScheduleFrequency(f)}
              style={{flex:1, padding:'6px', fontSize:'0.68rem', background: scheduleFrequency===f ? '#00ff41' : 'transparent',
                      color: scheduleFrequency===f ? '#000' : '#777', border: scheduleFrequency===f ? '1px solid #00ff41' : '1px solid #2a2a2a',
                      cursor:'pointer', fontFamily:'monospace', textTransform:'uppercase', borderRadius:'8px'}}>{f}</button>
          ))}
        </div>
        <div style={{display:'flex', gap:'8px', alignItems:'center', marginBottom:'8px'}}>
          <span style={{fontSize:'0.68rem', color:'#777', fontFamily:'monospace'}}>PAYMENTS:</span>
          <input className="zbank-input" value={scheduleMaxPayments} onChange={e => setScheduleMaxPayments(e.target.value)}
            placeholder="0=unlimited" style={{flex:1, padding:'6px', background:'#111', border:'1px solid #2a2a2a', color:'#ffffff', fontFamily:'monospace', fontSize:'0.68rem', borderRadius:'8px', outline:'none'}} />
          <span style={{fontSize:'0.62rem', color:'#555', fontFamily:'monospace'}}>0=∞</span>
        </div>
        <button type="button" onClick={handleCreateScheduledPayment}
          style={{width:'100%', padding:'10px', fontSize:'0.75rem', background:'#0d2a0d', border:'1px solid #2a2a2a', color:'#00ff41', cursor:'pointer', fontFamily:'monospace', fontWeight:'bold', borderRadius:'10px'}}>
          📅 CREATE SCHEDULE
        </button>
      </div>
    )}
  </div>
  )}

  {zbankMode === 'anonymous' && zbTxDigest && (
    <div style={{background:'#050f05', border:'1px solid #1a3a1a', borderRadius:'12px', padding:'14px 16px', marginTop:'12px'}}>
      <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px'}}>
        <span style={{color:'#00ff41', fontSize:'1rem'}}>✅</span>
        <span style={{color:'#00ff41', fontSize:'0.75rem', fontFamily:'monospace', letterSpacing:'1px', fontWeight:'bold'}}>TRANSFER SENT</span>
      </div>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', background:'#0a0a0a', borderRadius:'8px', padding:'10px 12px'}}>
        <div>
          <div style={{color:'#555', fontSize:'0.6rem', letterSpacing:'1px', marginBottom:'3px'}}>TRANSACTION</div>
          <div style={{color:'#777', fontSize:'0.68rem', fontFamily:'monospace'}}>
            {zbTxDigest.slice(0,8)}...{zbTxDigest.slice(-6)}
          </div>
        </div>
        <a
          href={`https://suiscan.xyz/testnet/tx/${zbTxDigest}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{display:'flex', alignItems:'center', gap:'6px', background:'#0d1a0d', border:'1px solid #1a3a1a', borderRadius:'8px', padding:'8px 12px', color:'#00ff41', fontSize:'0.7rem', fontFamily:'monospace', textDecoration:'none', letterSpacing:'1px', transition:'all 0.2s'}}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#1a2a1a'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#0d1a0d'; }}
        >
          SUISCAN ↗
        </a>
      </div>
    </div>
  )}

  {zbankMode === 'anonymous' && auditTrail && (
    <div style={{background:'#050f05', border:'1px solid #1a3a1a',
                 borderRadius:'12px', padding:'14px', marginTop:'10px'}}>
      <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px'}}>
        <span>🔐</span>
        <span style={{color:'#00ff41', fontSize:'0.75rem', fontFamily:'monospace',
                      fontWeight:'bold', letterSpacing:'1px'}}>
          AUDIT TRAIL SAVED
        </span>
        <span style={{marginLeft:'auto', background:'#0a1a0a', border:'1px solid #1a3a1a',
                      borderRadius:'4px', padding:'2px 8px', color:'#00ff41',
                      fontSize:'0.6rem', fontFamily:'monospace'}}>
          WALRUS
        </span>
      </div>

      <div style={{background:'#0a0a0a', borderRadius:'8px', padding:'10px 12px', marginBottom:'8px'}}>
        <div style={{color:'#555', fontSize:'0.58rem', letterSpacing:'1px', marginBottom:'4px'}}>
          VIEW KEY ID (public)
        </div>
        <div style={{color:'#777', fontSize:'0.68rem', fontFamily:'monospace'}}>
          {auditTrail.view_key_id}
        </div>
      </div>

      <div style={{background:'#1a0a0a', border:'1px solid #3a1a1a', borderRadius:'8px',
                   padding:'10px 12px', marginBottom:'8px'}}>
        <div style={{color:'#ff4444', fontSize:'0.58rem', letterSpacing:'1px', marginBottom:'4px'}}>
          🔑 VIEW KEY SECRET (keep private!)
        </div>
        <div style={{color:'#ff8888', fontSize:'0.65rem', fontFamily:'monospace',
                     wordBreak:'break-all'}}>
          {auditTrail.view_key_secret}
        </div>
        <div style={{color:'#555', fontSize:'0.58rem', marginTop:'6px'}}>
          Share this key only with authorized auditors to prove transaction details
        </div>
      </div>

      <div style={{background:'#0a0a0a', borderRadius:'8px', padding:'10px 12px'}}>
        <div style={{color:'#555', fontSize:'0.58rem', letterSpacing:'1px', marginBottom:'4px'}}>
          WALRUS BLOB ID
        </div>
        <a href={`/zco/${auditTrail.walrus_blob_id}`} target="_blank"
           rel="noopener noreferrer"
           style={{color:'#00ff41', fontSize:'0.65rem', fontFamily:'monospace',
                   textDecoration:'none', wordBreak:'break-all'}}>
          {auditTrail.walrus_blob_id} ↗
        </a>
      </div>

      <button
        type="button"
        onClick={() => {
          const data = JSON.stringify({
            view_key_id: auditTrail.view_key_id,
            view_key_secret: auditTrail.view_key_secret,
            salt: auditTrail.salt,
            walrus_blob_id: auditTrail.walrus_blob_id,
          }, null, 2);
          void navigator.clipboard.writeText(data);
        }}
        style={{width:'100%', marginTop:'10px', padding:'8px', borderRadius:'8px',
                border:'1px solid #1a3a1a', background:'transparent', color:'#00ff41',
                fontFamily:'monospace', fontSize:'0.65rem', cursor:'pointer'}}>
        📋 COPY VIEW KEY (for audit)
      </button>
    </div>
  )}

</div>
            </div>
          )}

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
            <div className="ecoTermRoot">
              <div className="ecoHudWrap">
                <header className="ecoHudHeader">
                  <h2>ZION ECO-POL — GOV MONITOR</h2>
                  <p>Economics · Politics · Central Bank</p>
                </header>

                {(ecoPolData || frsStats || politicalEconomy) && (() => {
                  const meter = ecoPolData?.uprising?.meter ?? 0;
                  const revMeterColor = ecoRevMeterColor(meter);
                  const povertyPct =
                    ecoPolData?.economy.poverty_pct ??
                    stats?.poverty_pct ??
                    frsStats?.economy.poor_pct ??
                    0;
                  const povertyColor =
                    povertyPct < 20 ? "#00ff88" : povertyPct < 40 ? "#ffd700" : povertyPct < 60 ? "#ff8800" : "#ff4444";
                  const zrsState = ecoPolData?.zrs_last_action?.state ?? frsStats?.status ?? "—";
                  const zrsStateColor = ecoZrsStateColor(zrsState);
                  const zrsRate = frsStats?.interest_rate ?? 0;
                  const zrsReserve =
                    frsStats?.government?.zrs?.reserve ?? stateTreasury?.zrs_fund ?? 0;
                  const avgBal = ecoPolData?.economy.avg_balance ?? frsStats?.economy.avg_balance ?? 0;
                  const totalZion = ecoPolData?.economy.total_zion ?? frsStats?.economy.total_money ?? 0;
                  const corpActive = ecoPolData?.corporations.active ?? frsStats?.corporations.count ?? 0;
                  const corpTreasury =
                    ecoPolData?.corporations.total_treasury ?? frsStats?.corporations.total_treasury ?? 0;

                  const presidentPower = Number(politicalEconomy?.power?.scores?.president_power ?? 0);
                  const sheriffPower = Number(politicalEconomy?.power?.scores?.sheriff_power ?? 0);
                  const senatePower = Number(politicalEconomy?.power?.scores?.senate_power ?? 0);
                  const totalPower = (presidentPower || 0) + (sheriffPower || 0) + (senatePower || 0);
                  const presidentPct = totalPower > 0 ? Math.round(((presidentPower || 0) / totalPower) * 100) : 0;
                  const sheriffPct = totalPower > 0 ? Math.round(((sheriffPower || 0) / totalPower) * 100) : 0;
                  const senatePct = totalPower > 0 ? Math.round(((senatePower || 0) / totalPower) * 100) : 0;
                  const powerBar = (pct: number) => {
                    const blocks = 20;
                    const filled = Math.max(0, Math.min(blocks, Math.round((pct / 100) * blocks)));
                    return `${"█".repeat(filled)}${"░".repeat(blocks - filled)}`;
                  };
                  const crisisActive = Boolean(politicalEconomy?.crisis?.is_active);
                  const peCrime = Number(
                    politicalEconomy?.metrics?.crime_rate ?? politicalEconomy?.crisis?.crime_rate ?? 0
                  );
                  const peCrimePct = peCrime > 1 ? peCrime / 100 : peCrime;
                  const pePoliceEff = Number(
                    politicalEconomy?.metrics?.police_effectiveness ??
                      politicalEconomy?.crisis?.police_effectiveness ??
                      0
                  );
                  const pePoliceEffPct = pePoliceEff > 1 ? pePoliceEff / 100 : pePoliceEff;
                  const peRevPressure = Number(
                    politicalEconomy?.metrics?.revolution_pressure ??
                      politicalEconomy?.crisis?.revolution_pressure ??
                      0
                  );
                  const pePhase = (
                    politicalEconomy?.metrics?.economic_phase ??
                    politicalEconomy?.crisis?.economic_phase ??
                    "NORMAL"
                  ).toUpperCase();
                  const pePhaseColor = ecoEconomicPhaseColor(pePhase);
                  const peGangs = politicalEconomy?.gangs ?? [];
                  const dictatorshipRisk = presidentPower > sheriffPower + senatePower;
                  const coupRisk = sheriffPower > presidentPower * 1.5;

                  const gridGov = isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))";
                  const grid4 = isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))";
                  const grid3 = isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))";
                  const grid2 = isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))";
                  const hudPoverty = Number(povertyPct);
                  const hudCorruption = Number(presidentState?.corruption_index ?? 0);
                  const hudCrimePct = peCrimeRate;
                  const hudGini = peGini;
                  const hudUnemployment = peUnemployment;

                  const politicalWireItems: WireNewsItem[] = ecoPolTickerMessages.map((msg) => ({
                    text: msg.text,
                    type: msg.breaking ? "breaking" : undefined,
                  }));

                  return (
                    <div
                      className="ecoDashLayout"
                      style={{
                        background: "#0a0a0f",
                        color: "rgba(255,255,255,0.75)",
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontSize: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: "rgba(255,255,255,0.28)",
                          letterSpacing: 2,
                          marginBottom: 10,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {renderPoliticalWireText(politicalWireItems[0]?.text ?? "LIVE ECO-POL FEED")}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 24,
                          padding: "12px 0",
                          borderBottom: "1px solid rgba(255,255,255,0.08)",
                          marginBottom: 16,
                        }}
                      >
                        <div>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>POVERTY</span>
                          <span style={{ color: "#ff4444", fontSize: 16, fontWeight: 600, marginLeft: 8 }}>
                            {povertyPct.toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>CRIME</span>
                          <span style={{ color: "#ff4444", fontSize: 16, fontWeight: 600, marginLeft: 8 }}>
                            {(hudCrimePct <= 1 ? hudCrimePct * 100 : hudCrimePct).toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>GINI</span>
                          <span style={{ color: "rgba(255,255,255,0.72)", fontSize: 16, fontWeight: 600, marginLeft: 8 }}>
                            {hudGini.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>UNEMPLOYED</span>
                          <span style={{ color: "#ff8800", fontSize: 16, fontWeight: 600, marginLeft: 8 }}>
                            {hudUnemployment.toFixed(1)}%
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>CORRUPTION</span>
                          <span
                            style={{
                              color: hudCorruption > 50 ? "#ff4444" : "rgba(255,255,255,0.72)",
                              fontSize: 16,
                              fontWeight: 600,
                              marginLeft: 8,
                            }}
                          >
                            {Math.round(hudCorruption)}%
                          </span>
                        </div>
                      </div>

                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginBottom: 12 }}>GOVERNMENT</div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
                          gap: 10,
                        }}
                      >
                        {presidentState && (
                          <div style={{ padding: 16, border: "1px solid rgba(255, 200, 50, 0.4)", boxShadow: "0 0 12px rgba(255, 200, 50, 0.08)", borderRadius: 4 }}>
                            <div style={{ fontSize: 11, color: "#ffc832", marginBottom: 12, letterSpacing: 2 }}>
                              EXECUTIVE
                            </div>
                            <div style={{ fontSize: 15, color: "#fff", fontWeight: 600, marginBottom: 4 }}>
                              {presidentState.agent_name}
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
                              {presidentPartyDisplay(presidentState.party).label}
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <tbody>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>APPROVAL</td><td style={{ color: (presidentState.approval_rating ?? 0) > 40 ? "#00ff88" : "#ff4444", fontSize: 13, textAlign: "right" }}>{presidentState.approval_rating ?? 0}%</td></tr>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>FUND</td><td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{Math.round(presidentState.personal_fund ?? 0).toLocaleString("en-US")}</td></tr>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>TERM</td><td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>Day {presidentState.days_in_power ?? 0}</td></tr>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>CORRUPTION</td><td style={{ color: (presidentState.corruption_index ?? 0) > 50 ? "#ff4444" : "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{Math.round(presidentState.corruption_index ?? 0)}%</td></tr>
                              </tbody>
                            </table>
                          </div>
                        )}

                        {sheriffState && (
                          <div style={{ padding: 16, border: "1px solid rgba(120, 160, 80, 0.4)", boxShadow: "0 0 12px rgba(120, 160, 80, 0.08)", borderRadius: 4 }}>
                            <div style={{ fontSize: 11, color: "#78a050", marginBottom: 12, letterSpacing: 2 }}>
                              ENFORCEMENT
                            </div>
                            <div style={{ fontSize: 15, color: "#fff", fontWeight: 600, marginBottom: 4 }}>
                              {sheriffState.agent_name}
                            </div>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
                              {String(sheriffState.sheriff_type || "none").toUpperCase()}
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <tbody>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>APPROVAL</td><td style={{ color: (sheriffState.approval_rating ?? 0) > 40 ? "#00ff88" : "#ff4444", fontSize: 13, textAlign: "right" }}>{sheriffState.approval_rating ?? 0}%</td></tr>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>OFFICERS</td><td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{(sheriffState.police_count ?? 0).toLocaleString("en-US")}</td></tr>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>BUDGET</td><td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{Math.round(sheriffState.police_budget ?? 0).toLocaleString("en-US")}</td></tr>
                                <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>TERM</td><td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>Day {sheriffState.days_in_office ?? 0}</td></tr>
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div style={{ padding: 16, border: "1px solid rgba(180, 190, 200, 0.4)", boxShadow: "0 0 12px rgba(180, 190, 200, 0.08)", borderRadius: 4 }}>
                          {frsChief && (
                            <div style={{background:'#0a0a0a', border:'1px solid #1a2a1a',
                                         borderRadius:'8px', padding:'10px 14px', marginBottom:'8px'}}>
                              <div style={{color:'#444', fontSize:'0.58rem', letterSpacing:'1px', marginBottom:'4px'}}>
                                FRS CHIEF (INDEPENDENT)
                              </div>
                              <div style={{color:'#00ff41', fontSize:'0.78rem', fontFamily:'monospace', fontWeight:'bold'}}>
                                {frsChief.name}
                              </div>
                              <div style={{color:'#555', fontSize:'0.62rem', fontFamily:'monospace'}}>
                                Term: {frsChief.cycles_served}/{frsChief.max_cycles} cycles
                                {frsChief.confirmed ? ' • Senate confirmed' : ' • Pending confirmation'}
                              </div>
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: "#b4bec8", marginBottom: 12, letterSpacing: 2 }}>
                            CENTRAL BANK
                          </div>
                          <div style={{ fontSize: 15, color: "#fff", fontWeight: 600, marginBottom: 4 }}>ZRS</div>
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
                            {String(zrsState).toUpperCase()}
                          </div>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <tbody>
                              <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>RESERVE</td><td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{ecoFormatZionShort(zrsReserve)}</td></tr>
                              <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>RATE</td><td style={{ color: "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{zrsRate}%</td></tr>
                              <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>PHASE</td><td style={{ color: pePhase === "BOOM" ? "#00ff88" : pePhase === "DEPRESSION" ? "#ff4444" : "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{pePhase}</td></tr>
                              <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>METER</td><td style={{ color: meter >= 80 ? "#ff4444" : meter >= 30 ? "rgba(255,255,255,0.72)" : "#00ff88", fontSize: 13, textAlign: "right" }}>{Math.round(meter)}%</td></tr>
                            </tbody>
                          </table>
                        </div>

                        <div
                          style={{
                            padding: 16,
                            border: meter > 30 ? "1px solid rgba(255, 60, 60, 0.4)" : "1px solid rgba(0, 255, 136, 0.2)",
                            boxShadow: meter > 30 ? "0 0 12px rgba(255, 60, 60, 0.08)" : "0 0 12px rgba(0, 255, 136, 0.08)",
                            borderRadius: 4,
                          }}
                        >
                          <div style={{ fontSize: 11, color: meter > 30 ? "#ff4444" : "#00ff88", marginBottom: 12, letterSpacing: 2 }}>
                            STABILITY
                          </div>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <tbody>
                              <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>METER</td><td style={{ color: meter > 30 ? "#ff4444" : "#00ff88", fontSize: 13, textAlign: "right" }}>{Math.round(meter)}%</td></tr>
                              <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>PRESSURE</td><td style={{ color: peRevPressure > 100 ? "#ff4444" : "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{Math.round(peRevPressure)}</td></tr>
                              <tr><td style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: "3px 0" }}>POVERTY</td><td style={{ color: povertyPct > 40 ? "#ff4444" : "rgba(255,255,255,0.72)", fontSize: 13, textAlign: "right" }}>{povertyPct.toFixed(1)}%</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginBottom: 12, marginTop: 24 }}>POWER DISTRIBUTION</div>
                      <div style={{ marginTop: 4, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: 12 }}>
                        {[
                          { label: "PRESIDENT", pct: presidentPct, color: "#00ff88" },
                          { label: "SHERIFF", pct: sheriffPct, color: "rgba(255,255,255,0.5)" },
                          { label: "SENATE", pct: senatePct, color: "#4488ff" },
                        ].map((item) => (
                          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                            <div style={{ width: 80, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{item.label}</div>
                            <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                              <div style={{ width: `${item.pct}%`, height: "100%", background: item.color, borderRadius: 2 }} />
                            </div>
                            <div style={{ width: 35, fontSize: 12, color: item.color, textAlign: "right" }}>{item.pct}%</div>
                          </div>
                        ))}
                      </div>

                      {partiesData && partiesData.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginBottom: 12, marginTop: 24 }}>ELECTION POLL</div>
                          <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: 12 }}>
                            {(Array.isArray(partiesData) ? partiesData : []).slice(0, 3).map((party) => {
                              const rating = Number(party.poll_pct ?? party.approval_rating ?? 0);
                              const partyColor = getPartyColor(String(party.party_id || party.name || ""));
                              return (
                                <div key={party.party_id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                                  <div style={{ width: 120, fontSize: 11, color: partyColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {party.name}
                                  </div>
                                  <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                                    <div style={{ width: `${Math.max(0, Math.min(100, rating))}%`, height: "100%", background: partyColor, borderRadius: 2 }} />
                                  </div>
                                  <div style={{ width: 40, fontSize: 12, color: partyColor, textAlign: "right" }}>{Math.round(rating)}%</div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}

                      {senateData && (
                        <>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginBottom: 12, marginTop: 24 }}>SENATE</div>
                          <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "8px 12px" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                  <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>SENATOR</th>
                                  <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>PARTY</th>
                                  <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>APPROVAL</th>
                                  <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>ROLE</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(Array.isArray(senateData.senators) ? senateData.senators : [])
                                  .filter((s) => s.is_active !== false)
                                  .slice(0, 9)
                                  .map((sen, idx) => {
                                    const role = String(sen.role || "senator").toUpperCase();
                                    const approvalValue = Number(sen.approval_rating ?? 50);
                                    const partyName = String(sen.party_id || "");
                                    const partyColor = getPartyColor(partyName);
                                    const partyBorder = `2px solid ${partyColor.replace(")", ", 0.6)").replace("rgb(", "rgba(")}`;
                                    return (
                                      <tr key={`${sen.agent_name}-${sen.party_id}-${idx}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                        <td style={{ padding: "8px 0 8px 8px", borderLeft: partyBorder, fontSize: 13, color: "#fff" }}>{sen.agent_name}</td>
                                        <td style={{ padding: "8px 0", fontSize: 11, color: partyColor }}>{sen.party_id}</td>
                                        <td style={{ padding: "8px 0", fontSize: 13, color: approvalValue > 50 ? "#00ff88" : "#ff4444", textAlign: "right" }}>{approvalValue}%</td>
                                        <td style={{ padding: "8px 0", fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "right" }}>{role === "SPEAKER" ? "SPEAKER" : "SEN."}</td>
                                      </tr>
                                    );
                                  })}
                              </tbody>
                            </table>
                          </div>

                          {((senateData.pending_laws?.length ?? 0) + (senateData.recent_laws?.length ?? 0) > 0) && (
                            <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "8px 12px", marginTop: 10 }}>
                              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                    <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>TIME</th>
                                    <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <div
                                          style={{
                                            width: 6,
                                            height: 6,
                                            borderRadius: "50%",
                                            background: "#00ff41",
                                            animation: "pulse 2s infinite",
                                            boxShadow: "0 0 6px #00ff41",
                                          }}
                                        />
                                        <span>LAW</span>
                                      </div>
                                    </th>
                                    <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>VOTES</th>
                                    <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>STATUS</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[
                                    ...(Array.isArray(senateData.pending_laws) ? senateData.pending_laws : []),
                                    ...(Array.isArray(senateData.recent_laws) ? senateData.recent_laws : []),
                                  ]
                                    .slice(0, 8)
                                    .map((law) => {
                                      const statusStyle = getLawStatusStyle(law.status);
                                      const proposer = formatLawProposer(law.proposed_by);
                                      return (
                                        <tr key={`law-${law.id}-${law.status}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                          <td
                                            style={{
                                              color: "#444",
                                              fontSize: "0.6rem",
                                              fontFamily: "monospace",
                                              paddingRight: 12,
                                              whiteSpace: "nowrap",
                                              verticalAlign: "top",
                                              paddingTop: 10,
                                            }}
                                          >
                                            {formatEventTime(String(law.voted_at || law.created_at || law.proposed_at || "")) || "—"}
                                          </td>
                                          <td
                                            style={{
                                              padding: "8px 0 8px 8px",
                                              borderLeft: statusStyle.border,
                                              fontSize: 13,
                                              color: "rgba(255,255,255,0.72)",
                                            }}
                                          >
                                            <div>{law.title}</div>
                                            {proposer ? (
                                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                                                by {proposer}
                                              </div>
                                            ) : null}
                                          </td>
                                          <td style={{ padding: "8px 0", fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "right", whiteSpace: "nowrap" }}>
                                            FOR {law.votes_for} / AGAINST {law.votes_against}
                                          </td>
                                          <td style={{ padding: "8px 0", fontSize: 12, color: statusStyle.color, textAlign: "right", fontWeight: 600 }}>
                                            {statusStyle.label}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      )}

                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 3, marginBottom: 12 }}>ACTIVITY LOG</div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)",
                          gap: 10,
                        }}
                      >
                        <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: 10, minHeight: 220 }}>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 10, letterSpacing: 1 }}>PRESIDENT</div>
                          {presidentActionsDisplay.length === 0 ? (
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No activity</div>
                          ) : (
                            presidentActionsDisplay.map((action, i) => {
                              const text = cleanActivityDescription(action.description);
                              return (
                                <div key={`pa-${i}`} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, minWidth: 38 }}>
                                  {formatEventTime(action.created_at) || "—"}
                                </span>
                                  <span style={{ color: /BREAKING/i.test(text) ? "#ff4444" : "rgba(255,255,255,0.7)", fontSize: 12 }}>
                                    {text}
                                    {action.count > 1 ? ` ×${action.count}` : ""}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                        <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: 10, minHeight: 220 }}>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 10, letterSpacing: 1 }}>SHERIFF</div>
                          {sheriffActionsDisplay.length === 0 ? (
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No activity</div>
                          ) : (
                            sheriffActionsDisplay.map((action, i) => {
                              const text = cleanActivityDescription(action.description);
                              return (
                                <div key={`sa-${i}`} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, minWidth: 38 }}>
                                  {formatEventTime(action.created_at) || "—"}
                                </span>
                                  <span style={{ color: /BREAKING/i.test(text) ? "#ff4444" : "rgba(255,255,255,0.7)", fontSize: 12 }}>
                                    {text}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                        <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: 10, minHeight: 220 }}>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 10, letterSpacing: 1 }}>SENATE</div>
                          {senateEventsDisplay.length === 0 ? (
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No activity</div>
                          ) : (
                            senateEventsDisplay.map((e, i) => {
                              const time = formatEventTime(e.created_at) || "—";
                              const text = cleanActivityDescription(e.description);
                              return (
                                <div
                                  key={`sne-${i}`}
                                  style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                                >
                                  <span style={{ color: "#555", fontSize: "0.6rem", minWidth: 38 }}>{time}</span>
                                  <span
                                    style={{
                                      color: e.event_type === "senate_law" ? "#ffd93d" : "#888",
                                      fontSize: 12,
                                    }}
                                  >
                                    {text}
                                  </span>
                                </div>
                              );
                            })
                          )}
                        </div>
                        <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: 10, minHeight: 220 }}>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 10, letterSpacing: 1 }}>ZRS</div>
                          {zrsEventsDisplay.length === 0 ? (
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No activity</div>
                          ) : (
                            zrsEventsDisplay.map((e, i) => {
                              const time = formatEventTime(e.created_at) || "—";
                              const text = cleanActivityDescription(e.description);
                              return (
                                <div
                                  key={`zrs-${i}`}
                                  style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                                >
                                  <span style={{ color: "#555", fontSize: "0.6rem", minWidth: 38 }}>{time}</span>
                                  <span style={{ color: "#00ff41", fontSize: 12 }}>{text}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
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
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: var(--font-sans);
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
          background: var(--bg-primary);
        }
        .bg-grid {
          position: fixed;
          inset: 0;
          z-index: 2;
          opacity: 0.35;
          background-color: var(--bg-secondary);
          background-image:
            linear-gradient(rgba(30, 58, 95, 0.35) 1px, transparent 1px),
            linear-gradient(90deg, rgba(30, 58, 95, 0.35) 1px, transparent 1px);
          background-size: 32px 32px;
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
          padding: 20px 26px 26px;
          opacity: 0;
          transition: opacity 0.8s ease;
        }
        .dashboard.show {
          opacity: 1;
        }
        .labHeader {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 12px 16px;
          padding: 14px 0 12px;
          margin-bottom: 4px;
          border-bottom: 1px solid var(--border);
        }
        .labHeaderMobile {
          grid-template-columns: 1fr;
          text-align: center;
        }
        .labHeaderLeft {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .labHeaderMobile .labHeaderLeft {
          align-items: center;
        }
        .labLogo {
          font-family: var(--font-sans);
          font-size: 1.1rem;
          font-weight: 500;
          letter-spacing: 0.2em;
          color: var(--text-primary);
        }
        .labSubtitle {
          font-size: 0.68rem;
          font-weight: 300;
          color: var(--text-secondary);
          letter-spacing: 0.04em;
        }
        .labHeaderCenter {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-family: var(--font-mono);
          font-size: 0.68rem;
          letter-spacing: 0.08em;
          color: var(--text-secondary);
          white-space: nowrap;
        }
        .labHeaderSep {
          color: var(--text-muted);
        }
        .labLiveIndicator {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--accent);
        }
        .labLiveDot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent);
        }
        .labHeaderRight {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          min-width: 0;
        }
        .labHeaderMobile .labHeaderRight {
          justify-content: center;
        }
        .mainNav {
          position: sticky;
          top: 0;
          z-index: 14;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 4px 2px;
          padding: 0 0 10px;
          margin: 0 -26px 20px;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border);
        }
        .navTab {
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          padding: 10px 14px;
          margin: 0;
          font-size: 12px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-secondary);
          cursor: pointer;
          font-family: var(--font-sans);
          font-weight: 400;
          transition: color 0.15s ease, border-color 0.15s ease;
        }
        .navTab:hover {
          color: var(--text-primary);
        }
        .navTab.active {
          color: var(--text-primary);
          border-bottom: 2px solid var(--accent);
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
        .statsGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 14px;
        }
        .statCard {
          border-radius: 2px;
          border: 1px solid var(--border);
          background: var(--bg-card);
          padding: 16px 18px;
        }
        .statCardLabel {
          margin: 0;
          font-size: 0.62rem;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-secondary);
        }
        .statCardValue {
          margin: 10px 0 8px;
          font-family: var(--font-mono);
          font-size: clamp(1.6rem, 3vw, 2.2rem);
          font-weight: 500;
          color: var(--text-primary);
          line-height: 1.1;
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
        .constitutionBanner {
          border: 1px solid var(--border);
          background: var(--bg-secondary);
          padding: 12px 16px;
          margin-bottom: 16px;
          font-family: var(--font-mono);
          font-size: 0.68rem;
          letter-spacing: 0.06em;
        }
        .constitutionBannerRow {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px 14px;
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
          background: #0a0a1a;
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
          color: #00ff88;
          font-size: 12px;
          letter-spacing: 3px;
          text-transform: uppercase;
          font-weight: bold;
          text-shadow: 0 0 12px rgba(0, 255, 136, 0.35);
        }
        .ecoHudHeader p {
          margin: 4px 0 0;
          color: #00ffcc;
          font-size: 11px;
          letter-spacing: 1px;
          opacity: 0.75;
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
          background: linear-gradient(to right, transparent, rgba(0, 255, 136, 0.35), transparent);
        }
        .zionSectionTitle {
          color: #00ff88;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 0.72rem;
          letter-spacing: 0.2em;
          white-space: nowrap;
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
          overflow: hidden;
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
          border-radius: 4px;
          border: 1px solid;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          letter-spacing: 0.08em;
          white-space: nowrap;
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
          overflow: hidden;
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
          overflow: hidden;
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
          overflow: hidden;
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
          overflow: hidden;
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
          margin-bottom: 18px;
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
          border: 1px solid var(--border);
          border-radius: 2px;
          padding: 12px 14px 10px;
          background: var(--bg-secondary);
          min-height: 420px;
          display: flex;
          flex-direction: column;
          gap: 8px;
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
          margin: 0 0 4px;
          color: var(--text-primary);
          font-size: 0.72rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .fieldObservationsTitle {
          font-family: var(--font-sans);
          font-weight: 500;
        }
        .sidebarHint {
          margin: 0 0 8px;
          font-family: var(--font-mono);
          font-size: 0.55rem;
          letter-spacing: 0.1em;
          color: var(--text-muted);
        }
        .fieldObservationsPanel {
          border: none;
          border-left: 2px solid var(--accent);
          border-radius: 0;
          padding: 16px 16px 16px 14px;
          background: var(--bg-secondary);
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
                setDetailMarket(m);
              }}
              onOpenMarketId={(marketId) => {
                setShowMyBetsOverlay(false);
                const fromLists = [
                  ...Object.values(polyByTab).flat(),
                  ...zionbetMarkets.crypto,
                  ...zionbetMarkets.sports,
                  ...zionbetMarkets.civilization,
                ].find((m) => m.id === marketId);
                const fromBet = myBets.find((b) => b.market_id === marketId);
                if (fromLists) {
                  setDetailMarket(fromLists);
                } else if (fromBet) {
                  setDetailMarket(zionbetMarketFromBet(fromBet, polyByTab, zionbetMarkets));
                }
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
