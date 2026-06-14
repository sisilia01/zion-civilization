import Link from "next/link";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { LabGlobalParticles } from "@/app/lab/LabGlobalParticles";
import { GovernancePanel } from "./GovernancePanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Governance — ZION Civilization",
};

const pageStyle: CSSProperties = {
  background: "transparent",
  minHeight: "100vh",
  color: "#e2e8f0",
  fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
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
  fontSize: "11px",
  letterSpacing: "0.12em",
  position: "relative",
  zIndex: 1,
};

const wrapStyle: CSSProperties = {
  maxWidth: "90rem",
  margin: "0 auto",
  padding: "32px 20px 48px",
  position: "relative",
  zIndex: 1,
};

const pageBgStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 0,
  background: "#050d1a",
  pointerEvents: "none",
};

export default function GovernancePage() {
  return (
    <>
      <div style={pageBgStyle} aria-hidden />
      <LabGlobalParticles />
      <style>{`
        .governance-page {
          --bg-primary: #050d1a;
          --text-primary: #e2e8f0;
          --text-secondary: rgba(226, 232, 240, 0.55);
          --accent: #00b4d8;
          --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .governance-page .ecoTermRoot {
          background: transparent;
        }
        .governance-page .ecoHudWrap {
          position: relative;
          padding: 16px 18px;
          background: transparent;
        }
        .governance-page .ecoDashLayout {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 8px;
          background: transparent;
        }
        .governance-page .ecoHudHeader {
          margin-bottom: 0;
        }
        .governance-page .ecoHudHeader h2 {
          margin: 0;
          color: #00b4d8;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-weight: 500;
        }
        .governance-page .ecoHudHeader p {
          margin: 4px 0 0;
          color: var(--text-secondary);
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.04em;
        }
      `}</style>
      <div style={pageStyle} className="governance-page">
        <nav style={navStyle} aria-label="Governance navigation">
          <Link href="/" style={{ color: "#00b4d8", textDecoration: "none" }}>
            ← OBSERVATORY
          </Link>
          <span style={{ color: "#94a3b8" }}>GOVERNANCE INSTRUMENT</span>
        </nav>
        <div style={wrapStyle}>
          <GovernancePanel />
        </div>
      </div>
    </>
  );
}
