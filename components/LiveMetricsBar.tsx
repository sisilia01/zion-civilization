"use client";

import type { CSSProperties } from "react";

type LiveMetricsBarProps = {
  subjectCount: string;
  mortality24h: string;
  prosperityPct: string;
  amendments: string;
  loading?: boolean;
};

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "32px",
  background: "rgba(0, 0, 0, 0.55)",
  borderTop: "1px solid rgba(255, 255, 255, 0.08)",
  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
  padding: "16px 24px",
  position: "relative",
  zIndex: 2,
  flexWrap: "nowrap",
  overflowX: "auto",
};

const metricStyle: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap: "8px",
};

const metricWithDividerStyle: CSSProperties = {
  ...metricStyle,
  borderLeft: "1px solid rgba(100, 116, 139, 0.3)",
  paddingLeft: "32px",
};

const labelStyle: CSSProperties = {
  fontSize: "11px",
  color: "#64748b",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const valueStyle: CSSProperties = {
  fontSize: "11px",
  color: "#00ff88",
  fontWeight: "bold",
  fontFamily: "monospace",
  whiteSpace: "nowrap",
};

export function LiveMetricsBar({
  subjectCount,
  mortality24h,
  prosperityPct,
  amendments,
  loading = false,
}: LiveMetricsBarProps) {
  const metrics = [
    { label: "ACTIVE SUBJECTS", value: subjectCount },
    { label: "MORTALITY 24H", value: loading ? "···" : mortality24h },
    { label: "PROSPERITY INDEX", value: prosperityPct },
    { label: "AMENDMENTS", value: amendments },
  ];

  return (
    <section style={containerStyle} aria-label="Live experiment metrics">
      {metrics.map(({ label, value }, index) => (
        <div key={label} style={index === 0 ? metricStyle : metricWithDividerStyle}>
          <span style={labelStyle}>{label}</span>
          <span style={valueStyle}>{value}</span>
        </div>
      ))}
    </section>
  );
}
