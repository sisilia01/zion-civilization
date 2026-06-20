import type { CSSProperties, ReactNode } from "react";
import { formatTimeUS } from "@/lib/formatDateTime";

export const CONSENSUS_PARTY_COLOR = "#ef4444";
export const REFORM_PARTY_COLOR = "#3b82f6";

export const PARTY_DISPLAY: Record<
  string,
  { label: string; emoji: string; color: string; background: string }
> = {
  consensus: {
    label: "Consensus Party",
    emoji: "🏛️",
    color: CONSENSUS_PARTY_COLOR,
    background: "rgba(239, 68, 68, 0.12)",
  },
  reform: {
    label: "Reform Party",
    emoji: "⚡",
    color: REFORM_PARTY_COLOR,
    background: "rgba(59, 130, 246, 0.12)",
  },
};

const LEGACY_PARTY_MAP: Record<string, keyof typeof PARTY_DISPLAY> = {
  conservative: "consensus",
  conservatives: "consensus",
  red: "consensus",
  centrist: "reform",
  centrists: "reform",
  populist: "reform",
  populists: "reform",
  blue: "reform",
};

export function presidentPartyDisplay(partyId: string | undefined) {
  const key = (partyId || "reform").toLowerCase();
  const mapped = LEGACY_PARTY_MAP[key] ?? key;
  return (
    PARTY_DISPLAY[mapped] ?? {
      label: partyId || "Unknown",
      emoji: "🏛️",
      color: "#aaa",
      background: "rgba(128,128,128,0.08)",
    }
  );
}

export function getPartyColor(party: string) {
  const p = party?.toLowerCase() || "";
  if (p === "consensus" || p.includes("consensus") || p.includes("conservative")) {
    return CONSENSUS_PARTY_COLOR;
  }
  if (
    p === "reform" ||
    p.includes("reform") ||
    p.includes("populist") ||
    p.includes("people") ||
    p.includes("front") ||
    p.includes("centrist")
  ) {
    return REFORM_PARTY_COLOR;
  }
  if (p === "independent" || p.includes("undecided")) {
    return "rgba(148, 163, 184, 0.95)";
  }
  return "rgba(255,255,255,0.4)";
}

export function partyColorWithAlpha(color: string, alpha: number) {
  if (color.startsWith("#") && color.length >= 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

export function partyBadgeStyle(partyId: string): CSSProperties {
  const color = getPartyColor(partyId);
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.06em",
    color,
    background: partyColorWithAlpha(color, 0.14),
    border: `1px solid ${partyColorWithAlpha(color, 0.45)}`,
  };
}

export function renderPoliticalWireText(text: string): ReactNode {
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

export function ecoZrsStateColor(state: string) {
  const s = String(state).toUpperCase();
  if (s === "HYPERINFLATION" || s === "CRISIS" || s === "DEPRESSION") return "#ff4444";
  if (s === "RECESSION") return "#ff8800";
  if (s === "BOOM") return "#00ff88";
  if (s === "STABLE") return "#ffd700";
  if (s === "VOLATILE" || s === "INFLATION") return "#ff8800";
  return "#ffd700";
}

export function ecoRevMeterColor(_meter: number) {
  return "var(--text-primary)";
}

export function ecoEconomicPhaseColor(phase: string): string {
  const p = (phase || "NORMAL").toUpperCase();
  if (p === "BOOM") return "#00ff88";
  if (p === "RECESSION") return "#ff8800";
  if (p === "DEPRESSION") return "#ff4444";
  return "#c8c8c8";
}

export function ecoFormatZionShort(n: number) {
  const v = Math.abs(n);
  if (v >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-US");
}

export function cleanActivityDescription(desc: string): string {
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

export function formatEventTime(ts: string): string {
  if (!ts) return "";
  try {
    const d = new Date(ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`);
    if (Number.isNaN(d.getTime())) return "";
    return formatTimeUS(d);
  } catch {
    return "";
  }
}

export const GOVERNANCE_PARTY_IDS = ["consensus", "reform", "independent"] as const;

export function normalizePartyId(partyId: string | undefined): string {
  const key = (partyId || "reform").toLowerCase();
  return LEGACY_PARTY_MAP[key] ?? (GOVERNANCE_PARTY_IDS.includes(key as (typeof GOVERNANCE_PARTY_IDS)[number]) ? key : "reform");
}

export function filterGovernanceParties<T extends { party_id?: string; name?: string }>(parties: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const party of parties) {
    const raw = String(party.party_id || party.name || "").toLowerCase();
    const id =
      raw === "independent" || raw.includes("undecided")
        ? "independent"
        : normalizePartyId(raw);
    if (!GOVERNANCE_PARTY_IDS.includes(id as (typeof GOVERNANCE_PARTY_IDS)[number]) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push({ ...party, party_id: id });
    if (out.length >= 3) break;
  }
  return out;
}
