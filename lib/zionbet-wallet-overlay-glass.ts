import type { CSSProperties } from "react";

export const ZION_WALLET_OVERLAY_BACKDROP: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 12000,
  background: "rgba(5, 15, 30, 0.85)",
  backdropFilter: "blur(12px) saturate(1.35)",
  WebkitBackdropFilter: "blur(12px) saturate(1.35)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "24px 12px",
  overflowY: "auto",
};

export const ZION_WALLET_OVERLAY_PANEL: CSSProperties = {
  marginTop: 48,
  padding: 20,
  position: "relative",
};

export const ZION_WALLET_OVERLAY_NESTED_CARD: CSSProperties = {
  background: "var(--bg-card)",
  backdropFilter: "blur(8px) saturate(1.3)",
  WebkitBackdropFilter: "blur(8px) saturate(1.3)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
};
