"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import type { Agent } from "@/lib/types";

function gradientFor(agent: Agent) {
  if (agent.dustDays > 0 || agent.classType === "dying") return "from-[#ff2e2e] via-[#ff7b7b] to-[#8f0016]";
  if (agent.classType === "elite") return "from-[#fff2b0] via-[#ffd700] to-[#8a6a00]";
  if (agent.classType === "middle") return "from-[#9fe3ff] via-[#4fa2ff] to-[#2a4f9b]";
  return "from-[#b7b7b7] via-[#707070] to-[#3f3f3f]";
}

export function AgentCard({ agent }: { agent: Agent }) {
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const rotateX = useSpring(rx, { stiffness: 160, damping: 18 });
  const rotateY = useSpring(ry, { stiffness: 160, damping: 18 });

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.015 }}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const px = (x / r.width - 0.5) * 12;
        const py = (y / r.height - 0.5) * -12;
        ry.set(px);
        rx.set(py);
      }}
      onMouseLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
      className="group relative rounded-2xl p-[1px] zion-holo-border"
    >
      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${gradientFor(agent)} opacity-80`} />
      <div className="relative rounded-[15px] border border-white/10 bg-[#0a0a0f]/95 p-4 shadow-[inset_0_0_40px_rgba(120,80,255,0.08)]">
        <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-white/35" />
        <div className="pointer-events-none absolute right-2 top-2 h-3 w-3 border-r border-t border-white/35" />
        <div className="pointer-events-none absolute left-2 bottom-2 h-3 w-3 border-l border-b border-white/35" />
        <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b border-white/35" />
        <div className="pointer-events-none absolute inset-0 rounded-[15px] bg-[repeating-linear-gradient(to_bottom,rgba(255,255,255,0.03)_0px,rgba(255,255,255,0.03)_1px,transparent_1px,transparent_3px)] opacity-30" />
        <div className="relative flex items-center justify-between">
          <h3 className="font-semibold text-white">{agent.name}</h3>
          <span className="text-[11px] uppercase tracking-[0.16em] text-white/60">{agent.classType}</span>
        </div>
        <dl className="relative mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-white/45">Balance</dt>
            <dd className="font-[family-name:var(--font-jetbrains)]">{agent.balance.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-white/45">Age</dt>
            <dd className="font-[family-name:var(--font-jetbrains)]">{agent.age}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-white/45">Clan</dt>
            <dd>{agent.clan}</dd>
          </div>
        </dl>
      </div>
    </motion.article>
  );
}

