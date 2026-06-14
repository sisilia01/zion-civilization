"use client";

import type { CSSProperties } from "react";
import { dedupeWireItems, type WireNewsItem } from "@/lib/wire-news";

export const WIRE_TICKER_SCROLL_SEC = 150;

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

function renderWireSpan(
  item: WireNewsItem,
  i: number,
  track: string,
  color: string,
  isLab: boolean,
) {
  return (
    <span
      key={`${track}-${item.text}-${item.timestamp ?? i}`}
      style={{ display: "inline-flex", alignItems: "center" }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "0 40px",
          borderRight: "1px solid #ffffff11",
          fontFamily: "monospace",
          fontSize: "0.75rem",
          whiteSpace: "nowrap",
          ...wireItemStyle(color, item.type, isLab),
        }}
      >
        {item.text}
      </span>
      <span
        style={{
          color: isLab ? "var(--text-muted)" : colorWithAlpha(color, "55"),
          padding: "0 20px",
        }}
      >
        ◆
      </span>
    </span>
  );
}

/** Infinite ticker — duplicates content in a second track for seamless -50% scroll (no adjacent dupes at start). */
export function NewsWireTicker({
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
  const unique = dedupeWireItems(items);
  if (!unique.length) return null;

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
            width: "max-content",
            animation: `tickerScroll ${WIRE_TICKER_SCROLL_SEC}s linear infinite`,
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ display: "flex" }}>
            {unique.map((item, i) => renderWireSpan(item, i, "a", color, isLab))}
          </div>
          <div style={{ display: "flex" }} aria-hidden>
            {unique.map((item, i) => renderWireSpan(item, i, "b", color, isLab))}
          </div>
        </div>
      </div>
    </div>
  );
}
