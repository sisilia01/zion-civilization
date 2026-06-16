import Link from "next/link";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { LabGlobalParticles } from "@/app/lab/LabGlobalParticles";
import { PrivacyPanel } from "./PrivacyPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy — ZION Civilization",
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

export default function PrivacyPage() {
  return (
    <>
      <div style={pageBgStyle} aria-hidden />
      <LabGlobalParticles />
      <div style={pageStyle} className="privacy-page">
        <nav style={navStyle} aria-label="Privacy navigation">
          <Link href="/" style={{ color: "#00b4d8", textDecoration: "none" }}>
            ← OBSERVATORY
          </Link>
          <span style={{ color: "#94a3b8" }}>PRIVACY</span>
        </nav>
        <div style={wrapStyle}>
          <PrivacyPanel />
        </div>
      </div>
    </>
  );
}
