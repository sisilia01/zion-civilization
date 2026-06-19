"use client";

import { useState } from "react";
import { ZionRoleIcon } from "@/components/achievements/ZionRoleIcon";

export function ZionRoleBadge({
  roleId,
  earned,
  label,
  size = 40,
  showTooltip = true,
}: {
  roleId: string;
  earned: boolean;
  label: string;
  size?: number;
  showTooltip?: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 4,
          overflow: "hidden",
          opacity: earned ? 1 : 0.2,
          filter: earned ? "none" : "grayscale(1)",
          boxShadow: earned ? "0 0 10px rgba(0, 180, 216, 0.45)" : "none",
          border: earned ? "1px solid rgba(0, 180, 216, 0.35)" : "1px solid rgba(255,255,255,0.06)",
          transition: "opacity 0.2s, box-shadow 0.2s",
        }}
      >
        <ZionRoleIcon roleId={roleId} size={size} />
      </div>
      {!earned ? (
        <div
          style={{
            position: "absolute",
            bottom: 2,
            left: "50%",
            transform: "translateX(-50%)",
            width: 10,
            height: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="2" y="4.5" width="6" height="4.5" rx="0.5" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
            <path d="M3.5 4.5 V3.5 C3.5 2.5 4.5 2 5 2 C5.5 2 6.5 2.5 6.5 3.5 V4.5" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
          </svg>
        </div>
      ) : null}
      {showTooltip && hovered ? (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            whiteSpace: "nowrap",
            background: "rgba(0, 8, 20, 0.95)",
            border: "1px solid rgba(0, 180, 216, 0.25)",
            borderRadius: 2,
            padding: "3px 8px",
            fontSize: "0.62rem",
            fontFamily: "'IBM Plex Mono', monospace",
            color: earned ? "#00b4d8" : "rgba(255,255,255,0.45)",
            letterSpacing: "0.06em",
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}
