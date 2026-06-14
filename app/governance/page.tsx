import Link from "next/link";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { GovernancePanel } from "./GovernancePanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Governance — ZION Civilization",
};

const pageStyle: CSSProperties = {
  background: "#050d1a",
  minHeight: "100vh",
  color: "#e2e8f0",
  fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

const navStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  maxWidth: "56rem",
  margin: "0 auto",
  padding: "16px 24px",
  borderBottom: "1px solid rgba(143, 168, 200, 0.2)",
  fontSize: "11px",
  letterSpacing: "0.12em",
};

const wrapStyle: CSSProperties = {
  maxWidth: "90rem",
  margin: "0 auto",
  padding: "32px 20px 48px",
};

export default function GovernancePage() {
  return (
    <>
      <style>{`
        .governance-page {
          --bg-primary: #050d1a;
          --text-primary: rgba(255, 255, 255, 0.92);
          --text-secondary: rgba(255, 255, 255, 0.55);
          --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .governance-page .ecoTermRoot {
          background: transparent;
        }
        .governance-page .ecoHudWrap {
          position: relative;
          padding: 16px 18px;
        }
        .governance-page .ecoDashLayout {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 8px;
        }
        .governance-page .ecoHudHeader {
          margin-bottom: 10px;
        }
        .governance-page .ecoHudHeader h2 {
          margin: 0;
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.18em;
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
          <Link href="/" style={{ color: "#8fa8c8", textDecoration: "none" }}>
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
