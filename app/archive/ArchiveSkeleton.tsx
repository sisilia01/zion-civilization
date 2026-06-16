"use client";

import { type CSSProperties } from "react";
import { GlassCard } from "@/components/GlassCard";
import glassCardStyles from "@/components/GlassCard.module.css";

const panelShellStyle: CSSProperties = {
  flex: "1 1 280px",
  minWidth: "260px",
  border: "1px solid #1e3a5f",
  borderRadius: "6px",
  padding: "16px",
};

const skeletonRowStyle: CSSProperties = {
  background: "rgba(0,255,136,0.05)",
  border: "1px solid rgba(0,255,136,0.1)",
  borderRadius: "4px",
  height: "14px",
  marginBottom: "8px",
  animation: "archivePulse 1.5s ease-in-out infinite",
};

const skeletonFileStyle: CSSProperties = {
  ...skeletonRowStyle,
  height: "12px",
  width: "72%",
};

export function ArchiveColumnSkeleton({ title }: { title: string }) {
  return (
    <GlassCard className={glassCardStyles.glassCard} style={panelShellStyle}>
      <div
        style={{
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: "11px",
          letterSpacing: "0.12em",
          color: "#00b4d8",
          marginBottom: "8px",
        }}
      >
        {title}
      </div>
      <div style={{ ...skeletonRowStyle, width: "55%", marginBottom: "16px" }} />
      <div style={skeletonFileStyle} />
      <div style={{ ...skeletonFileStyle, width: "64%" }} />
      <div style={{ ...skeletonFileStyle, width: "58%" }} />
      <div style={{ ...skeletonFileStyle, width: "48%" }} />
      <div
        style={{
          ...skeletonRowStyle,
          width: "40%",
          height: "10px",
          marginTop: "20px",
          marginBottom: 0,
        }}
      />
    </GlassCard>
  );
}

export function ArchiveSkeletonGrid() {
  return (
    <>
      <style>{`
        @keyframes archivePulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.85; }
        }
      `}</style>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
        <ArchiveColumnSkeleton title="WEEKLY" />
        <ArchiveColumnSkeleton title="MONTHLY" />
        <ArchiveColumnSkeleton title="ANNUAL" />
      </div>
    </>
  );
}
