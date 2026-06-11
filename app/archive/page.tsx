import Link from "next/link";
import type { CSSProperties } from "react";
import ArchivePanel from "./ArchivePanel";

export const dynamic = "force-dynamic";

const pageStyle: CSSProperties = {
  background: "#050d1a",
  minHeight: "100vh",
  color: "#e2e8f0",
  fontFamily: "Inter, system-ui, sans-serif",
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
  maxWidth: "56rem",
  margin: "0 auto",
  padding: "32px 20px 48px",
};

export default function ArchivePage() {
  return (
    <div style={pageStyle}>
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
