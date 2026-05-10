"use client";

import { animate, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { DashboardStats } from "@/lib/types";

function Counter({ value, compact = false }: { value: number; compact?: boolean }) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const ctrl = animate(prev.current, value, {
      duration: 0.9,
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prev.current = value;
    return () => ctrl.stop();
  }, [value]);
  const text = compact && display >= 1_000_000 ? `${(display / 1_000_000).toFixed(2)}M` : display.toLocaleString();
  return <>{text}</>;
}

export function StatsBar({ stats }: { stats: DashboardStats }) {
  const cards = [
    { label: "Total Alive Agents", value: stats.aliveAgents, compact: false, glow: "shadow-[0_0_22px_rgba(0,240,255,0.2)]" },
    { label: "Total ZION in Circulation", value: stats.zionCirculation, compact: true, glow: "shadow-[0_0_22px_rgba(255,215,0,0.24)]" },
    { label: "Deaths Today", value: stats.deathsToday, compact: false, glow: "shadow-[0_0_22px_rgba(255,60,120,0.18)]" },
    { label: "Active Clans", value: stats.activeClans, compact: false, glow: "shadow-[0_0_22px_rgba(140,70,255,0.22)]" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c, i) => (
        <motion.div
          key={c.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i }}
          className={`relative overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] p-4 backdrop-blur-xl ${c.glow}`}
        >
          <div className="pointer-events-none absolute left-2 top-2 h-5 w-5 rounded-full border border-cyan-300/35">
            <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/50" />
          </div>
          <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b border-cyan-300/35" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.12),transparent_38%)]" />
          <p className="relative text-xs uppercase tracking-[0.18em] text-white/55">{c.label}</p>
          <p className="mt-2 font-[family-name:var(--font-jetbrains)] text-2xl text-white">
            <Counter value={c.value} compact={c.compact} />
          </p>
        </motion.div>
      ))}
    </div>
  );
}

