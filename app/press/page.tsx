import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { LabGlobalParticles } from "@/app/lab/LabGlobalParticles";
import { PressPanel } from "./PressPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Press — ZION Civilization",
};

const pageStyle: CSSProperties = {
  background: "transparent",
  minHeight: "100vh",
  color: "#e2e8f0",
  fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
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

export default function PressPage() {
  return (
    <>
      <div style={pageBgStyle} aria-hidden />
      <LabGlobalParticles />
      <div style={pageStyle} className="press-page">
        <div style={wrapStyle}>
          <PressPanel />
        </div>
      </div>
    </>
  );
}
