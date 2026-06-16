import Link from "next/link";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { PredictionEnginePanel } from "./PredictionEnginePanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prediction Engine — ZION Civilization",
};

const pageStyle: CSSProperties = {
  background: "transparent",
  minHeight: "100vh",
  color: "#e2e8f0",
  fontFamily: "Inter, system-ui, sans-serif",
  position: "relative",
  zIndex: 1,
};

const navStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  maxWidth: "56rem",
  margin: "0 auto",
  padding: "16px 24px",
  borderBottom: "1px solid rgba(0, 180, 216, 0.2)",
  fontFamily: '"IBM Plex Mono", monospace',
  fontSize: "11px",
  letterSpacing: "0.12em",
};

const wrapStyle: CSSProperties = {
  maxWidth: "90rem",
  margin: "0 auto",
  padding: "32px 20px 48px",
};

export default function PredictionEnginePage() {
  return (
    <div style={pageStyle} className="prediction-engine-page">
      <nav style={navStyle} aria-label="Prediction Engine navigation">
        <Link href="/" style={{ color: "#94a3b8", textDecoration: "none" }}>
          ← OBSERVATORY
        </Link>
        <span style={{ color: "#00b4d8" }}>PREDICTION ENGINE</span>
      </nav>
      <div style={wrapStyle}>
        <PredictionEnginePanel />
      </div>
    </div>
  );
}
