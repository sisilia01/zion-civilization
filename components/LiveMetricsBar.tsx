"use client";

import type { CSSProperties, ReactNode } from "react";

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
  justifyContent: "space-between",
  width: "100%",
  gap: "0px",
  background: "rgba(0, 0, 0, 0.55)",
  borderTop: "1px solid rgba(255, 255, 255, 0.08)",
  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
  padding: "16px 24px",
  position: "relative",
  zIndex: 2,
};

const metricStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "2px",
};

const dividerStyle: CSSProperties = {
  width: "1px",
  height: "32px",
  background: "rgba(100, 116, 139, 0.3)",
  flexShrink: 0,
};

const labelStyle: CSSProperties = {
  fontSize: "9px",
  color: "#64748b",
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const valueStyle: CSSProperties = {
  fontSize: "15px",
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

  const nodes: ReactNode[] = [];
  metrics.forEach(({ label, value }, index) => {
    if (index > 0) {
      nodes.push(<span key={`divider-${label}`} style={dividerStyle} aria-hidden />);
    }
    nodes.push(
      <div key={label} style={metricStyle}>
        <span style={labelStyle}>{label}</span>
        <span style={valueStyle}>{value}</span>
      </div>,
    );
  });

  return (
    <section style={containerStyle} aria-label="Live experiment metrics">
      {nodes}
    </section>
  );
}
