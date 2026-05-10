"use client";

import { motion } from "framer-motion";
import type { Clan } from "@/lib/types";

export function ClanRankings({ clans }: { clans: Clan[] }) {
  const max = Math.max(1, ...clans.map((c) => c.treasury));
  return (
    <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <h3 className="text-lg font-semibold text-white">Clan Rankings</h3>
      <div className="mt-4 space-y-3">
        {clans.map((clan, i) => {
          const w = (clan.treasury / max) * 100;
          return (
            <div key={clan.id} className="rounded-xl bg-black/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="font-medium text-white">
                  #{i + 1} {clan.name}
                </p>
                <p className="text-xs text-white/60">
                  W/L {clan.wins}/{clan.losses}
                </p>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(3, w)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full rounded-full bg-gradient-to-r from-[#00ff41] to-[#ffd700]"
                />
              </div>
              <p className="mt-1 font-[family-name:var(--font-jetbrains)] text-xs text-white/70">
                Treasury {clan.treasury.toLocaleString()} ZION
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

