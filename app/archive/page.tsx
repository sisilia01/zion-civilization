import Link from "next/link";
import type { CSSProperties } from "react";
import ArchivePanel from "./ArchivePanel";

export const dynamic = "force-dynamic";

const pageStyle: CSSProperties = {
  background: "transparent",
  minHeight: "100vh",
  color: "#e2e8f0",
  fontFamily: "Inter, system-ui, sans-serif",
  position: "relative",
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
  position: "relative",
  zIndex: 1,
};

const wrapStyle: CSSProperties = {
  maxWidth: "56rem",
  margin: "0 auto",
  padding: "32px 20px 48px",
  position: "relative",
  zIndex: 1,
};

export default function ArchivePage() {
  return (
    <div style={pageStyle}>
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
        aria-hidden
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.75,
          }}
        >
          <source src="/videos/archive_bg.mp4" type="video/mp4" />
        </video>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,10,0.45)",
          }}
        />
      </div>
      <nav style={navStyle} aria-label="Archive navigation">
        <Link href="/" style={{ color: "#94a3b8", textDecoration: "none" }}>
          ← OBSERVATORY
        </Link>
        <span style={{ color: "#00b4d8" }}>ARCHIVE</span>
      </nav>
      <div style={wrapStyle}>
        <ArchivePanel />
      </div>
    </div>
  );
}
