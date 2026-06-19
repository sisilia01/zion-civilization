"use client";

import { useCurrentAccount } from "@mysten/dapp-kit";
import { useCallback, useEffect, useMemo, useState } from "react";
import glassCardStyles from "@/components/GlassCard.module.css";
import { ZionRoleBadge } from "@/components/achievements/ZionRoleBadge";
import {
  ZION_ACHIEVEMENT_DEFS,
  loadZionProfile,
  mergeAchievementTimestamps,
  saveZionProfile,
  zionbetComputeAchievements,
  type ZionBetWalletStatsInput,
} from "@/lib/zion-achievements";

function formatEarnedDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function AchievementsPanel() {
  const account = useCurrentAccount();
  const wallet = account?.address?.trim() || "";
  const [stats, setStats] = useState<ZionBetWalletStatsInput | null>(null);
  const [loading, setLoading] = useState(false);
  const [earnedIds, setEarnedIds] = useState<string[]>([]);
  const [earnedAt, setEarnedAt] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (!wallet) {
      setStats(null);
      setEarnedIds([]);
      setEarnedAt({});
      return;
    }

    setLoading(true);
    try {
      const [statsRes, betsRes] = await Promise.all([
        fetch(`/api/zionbet/stats/${encodeURIComponent(wallet)}`, { cache: "no-store" }),
        fetch(`/api/my_bets/${encodeURIComponent(wallet)}`, { cache: "no-store" }),
      ]);
      const statsData = statsRes.ok ? await statsRes.json() : null;
      const betsData = betsRes.ok ? await betsRes.json() : [];
      const bets = Array.isArray(betsData) ? betsData : [];
      const nextStats =
        statsData && !statsData.error ? (statsData as ZionBetWalletStatsInput) : null;
      setStats(nextStats);

      const computed = zionbetComputeAchievements(bets, nextStats);
      const profile = loadZionProfile(wallet);
      const merged = mergeAchievementTimestamps(profile, computed);
      saveZionProfile(wallet, merged);
      setEarnedIds(computed);
      setEarnedAt(merged.achievementsEarnedAt ?? {});
    } catch {
      const profile = loadZionProfile(wallet);
      setEarnedIds(profile.achievements ?? []);
      setEarnedAt(profile.achievementsEarnedAt ?? {});
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const earnedSet = useMemo(() => new Set(earnedIds), [earnedIds]);
  const unlockedCount = ZION_ACHIEVEMENT_DEFS.filter((def) => earnedSet.has(def.id)).length;

  const mono = {
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    letterSpacing: "0.04em",
  } as const;

  return (
    <div style={{ maxWidth: "56rem", margin: "0 auto" }}>
      <header style={{ marginBottom: "28px" }}>
        <h1
          style={{
            ...mono,
            fontSize: "1.35rem",
            fontWeight: 500,
            color: "#fff",
            margin: "0 0 8px",
            letterSpacing: "0.12em",
          }}
        >
          ACHIEVEMENTS
        </h1>
        <p style={{ ...mono, fontSize: "0.72rem", color: "rgba(255,255,255,0.55)", margin: 0, lineHeight: 1.5 }}>
          ZionBet role badges earned through trading volume, win rate, streaks, and bold stakes.
        </p>
        <div style={{ ...mono, fontSize: "0.68rem", color: "#00b4d8", marginTop: "12px" }}>
          {wallet
            ? `${unlockedCount} / ${ZION_ACHIEVEMENT_DEFS.length} unlocked${loading ? " · refreshing..." : ""}`
            : "Connect wallet on Observatory to track your unlocks"}
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: "14px",
        }}
      >
        {ZION_ACHIEVEMENT_DEFS.map((def) => {
          const earned = earnedSet.has(def.id);
          const dateLabel = earned ? formatEarnedDate(earnedAt[def.id]) : null;
          return (
            <div
              key={def.id}
              className={glassCardStyles.glassCardNestedSection}
              style={{
                padding: "16px",
                border: earned
                  ? "1px solid rgba(0, 180, 216, 0.35)"
                  : "1px solid rgba(255,255,255,0.08)",
                background: earned ? "rgba(0, 180, 216, 0.04)" : "rgba(255,255,255,0.02)",
                boxShadow: earned ? "0 0 24px rgba(0, 180, 216, 0.08)" : "none",
              }}
            >
              <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                <ZionRoleBadge roleId={def.id} label={def.label} earned={earned} size={56} showTooltip={false} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      ...mono,
                      fontSize: "0.72rem",
                      color: earned ? "#00b4d8" : "rgba(255,255,255,0.45)",
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                    }}
                  >
                    {def.label}
                  </div>
                  <div
                    style={{
                      ...mono,
                      fontSize: "0.58rem",
                      marginTop: "6px",
                      color: earned ? "#00ff88" : "rgba(255,255,255,0.35)",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {earned ? "UNLOCKED" : "LOCKED"}
                  </div>
                  {dateLabel ? (
                    <div style={{ ...mono, fontSize: "0.55rem", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>
                      Earned {dateLabel}
                    </div>
                  ) : null}
                </div>
              </div>
              <p
                style={{
                  ...mono,
                  fontSize: "0.62rem",
                  color: "rgba(255,255,255,0.65)",
                  lineHeight: 1.45,
                  margin: "12px 0 8px",
                }}
              >
                {def.description}
              </p>
              <div
                style={{
                  ...mono,
                  fontSize: "0.58rem",
                  color: "rgba(255,255,255,0.4)",
                  lineHeight: 1.4,
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  paddingTop: "8px",
                }}
              >
                <span style={{ color: "rgba(255,255,255,0.55)" }}>Unlock: </span>
                {def.unlockCondition}
              </div>
            </div>
          );
        })}
      </div>

      {wallet && stats ? (
        <div
          className={glassCardStyles.glassCardNestedSection}
          style={{ marginTop: "20px", padding: "12px 14px", fontSize: "0.62rem", ...mono, color: "#666" }}
        >
          Current stats — bets: {stats.total_bets ?? 0} · win rate:{" "}
          {Number(stats.win_rate ?? 0).toFixed(1)}% · net P&amp;L:{" "}
          {Number(stats.net_pnl ?? stats.total_profit ?? 0).toFixed(2)} SUI
        </div>
      ) : null}
    </div>
  );
}
