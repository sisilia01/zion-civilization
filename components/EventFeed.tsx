"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { FeedEvent } from "@/lib/types";

function theme(kind: FeedEvent["kind"]) {
  switch (kind) {
    case "death":
      return { emoji: "💀", ring: "ring-red-500/40", text: "text-red-200" };
    case "birth":
      return { emoji: "👶", ring: "ring-emerald-500/40", text: "text-emerald-200" };
    case "war":
      return { emoji: "⚔️", ring: "ring-orange-500/40", text: "text-orange-200" };
    case "neo":
      return { emoji: "👁️", ring: "ring-violet-500/40", text: "text-violet-200" };
    case "catastrophe":
      return { emoji: "🌋", ring: "ring-purple-500/50", text: "text-purple-200" };
    default:
      return { emoji: "•", ring: "ring-white/20", text: "text-white" };
  }
}

export function EventFeed({ events }: { events: FeedEvent[] }) {
  return (
    <aside className="rounded-2xl border border-[#1dff7a]/25 bg-[#020703]/88 p-4 shadow-[0_0_22px_rgba(0,255,106,0.12)]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-[family-name:var(--font-jetbrains)] text-sm font-semibold text-[#87ffb1]">
          Live Events // Terminal
          <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-[#87ffb1]" />
        </h3>
        <span className="text-[10px] uppercase tracking-[0.18em] text-[#00ff41]">API · 10s</span>
      </div>
      <div className="max-h-[72vh] space-y-2 overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {events.map((e) => {
            const t = theme(e.kind);
            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={`rounded-xl bg-black/55 p-3 ring-1 ${t.ring} font-[family-name:var(--font-jetbrains)]`}
              >
                <p className={`text-sm ${t.text} tracking-wide`}>
                  <span className="mr-1 text-base">{t.emoji}</span>
                  {e.title}
                </p>
                <p className="mt-1 text-xs text-[#85ffad]/80">{`> ${e.detail}`}</p>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </aside>
  );
}

