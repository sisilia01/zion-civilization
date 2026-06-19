"use client";

import type { CSSProperties } from "react";

export function ZionUserAvatarBadge({
  size = 52,
  style,
}: {
  size?: number;
  style?: CSSProperties;
}) {
  const fontSize = Math.round(size * 0.42);

  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.45)",
        border: "1px solid var(--border)",
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
        color: "var(--accent)",
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize,
        fontWeight: 700,
        letterSpacing: "-0.02em",
        ...style,
      }}
    >
      Z
    </div>
  );
}
