"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ZionRoleBadge } from "@/components/achievements/ZionRoleBadge";
import { ZION_ACHIEVEMENT_DEFS, type ZionProfile } from "@/lib/zion-achievements";

const ZB_VISTA_YES = "#00d4aa";
const ZB_VISTA_NO = "#ff6b6b";

export type ZionBetWalletStatsDropdown = {
  total_bets?: number;
  win_rate?: number;
  net_pnl?: number;
  total_profit?: number;
} | null;

function zionbetWalletTruncated(wallet: string): string {
  const w = wallet.trim();
  if (w.length <= 14) return w;
  return `${w.slice(0, 6)}...${w.slice(-4)}`;
}

type ZionBetProfileDropdownProps = {
  anchorRef: RefObject<HTMLElement | null>;
  walletAddress: string;
  profile: ZionProfile;
  stats: ZionBetWalletStatsDropdown;
  onRefreshAchievements: () => void;
  onOpenPortfolio: () => void;
  onOpenMyBets: () => void;
  onLeaderboard: () => void;
  onDisconnect: () => void;
  onClose: () => void;
};

export function ZionBetProfileDropdown({
  anchorRef,
  walletAddress,
  profile,
  stats,
  onRefreshAchievements,
  onOpenPortfolio,
  onOpenMyBets,
  onLeaderboard,
  onDisconnect,
  onClose,
}: ZionBetProfileDropdownProps) {
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    function updatePosition() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setPos({
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [anchorRef]);

  useEffect(() => {
    onRefreshAchievements();
  }, [onRefreshAchievements]);

  const totalBets = stats?.total_bets ?? 0;
  const winRate = stats?.win_rate ?? 0;
  const profit = stats?.net_pnl ?? stats?.total_profit ?? 0;
  const earnedRoles = new Set(profile.achievements ?? []);

  const mono: CSSProperties = {
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    letterSpacing: "0.02em",
  };

  const menuBtn: CSSProperties = {
    width: "100%",
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.85)",
    padding: "10px 16px",
    cursor: "pointer",
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    fontSize: "0.72rem",
    letterSpacing: "0.08em",
    textAlign: "left",
    textTransform: "uppercase",
    transition: "background 0.15s, color 0.15s",
  };

  if (!mounted) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        width: "min(300px, 92vw)",
        background: "rgba(0, 8, 20, 0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(0, 180, 216, 0.2)",
        borderRadius: "4px",
        zIndex: 210,
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
        overflow: "visible",
        color: "#fff",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(0, 180, 216, 0.12)" }}>
        <div
          style={{
            ...mono,
            fontSize: "0.78rem",
            color: "rgba(255,255,255,0.9)",
            wordBreak: "break-all",
          }}
        >
          {zionbetWalletTruncated(walletAddress)}
        </div>
        <div
          style={{
            ...mono,
            marginTop: 10,
            fontSize: "0.68rem",
            color: "rgba(255,255,255,0.55)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "4px 0",
          }}
        >
          <span>
            BETS <span style={{ color: "#fff" }}>{totalBets}</span>
          </span>
          <span style={{ margin: "0 6px", opacity: 0.35 }}>·</span>
          <span>
            WIN <span style={{ color: "#fff" }}>{Number(winRate).toFixed(1)}%</span>
          </span>
          <span style={{ margin: "0 6px", opacity: 0.35 }}>·</span>
          <span>
            P&amp;L{" "}
            <span style={{ color: profit >= 0 ? ZB_VISTA_YES : ZB_VISTA_NO }}>
              {profit >= 0 ? "+" : ""}
              {profit.toFixed(2)} SUI
            </span>
          </span>
        </div>
        <Link
          href="/achievements"
          onClick={onClose}
          title="View all achievements"
          style={{
            display: "flex",
            gap: 8,
            marginTop: 14,
            justifyContent: "space-between",
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          {ZION_ACHIEVEMENT_DEFS.map((role) => (
            <ZionRoleBadge
              key={role.id}
              roleId={role.id}
              label={role.label}
              earned={earnedRoles.has(role.id)}
            />
          ))}
        </Link>
      </div>
      <div style={{ padding: "4px 0" }}>
        <button
          type="button"
          style={menuBtn}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(0, 180, 216, 0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          onClick={() => {
            onOpenPortfolio();
            onClose();
          }}
        >
          My Portfolio
        </button>
        <button
          type="button"
          style={menuBtn}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(0, 180, 216, 0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          onClick={() => {
            onOpenMyBets();
            onClose();
          }}
        >
          My Bets
        </button>
        <button
          type="button"
          style={menuBtn}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(0, 180, 216, 0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          onClick={() => {
            onLeaderboard();
            onClose();
          }}
        >
          Leaderboard
        </button>
        <button
          type="button"
          style={{
            ...menuBtn,
            color: "rgba(255, 120, 120, 0.9)",
            borderTop: "1px solid rgba(0, 180, 216, 0.1)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 80, 80, 0.08)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          onClick={() => {
            onDisconnect();
            onClose();
          }}
        >
          Disconnect
        </button>
      </div>
    </div>,
    document.body
  );
}
