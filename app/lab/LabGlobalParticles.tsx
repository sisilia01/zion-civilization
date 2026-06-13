"use client";

import { ParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";
import { ParticlesBackground } from "@/components/ParticlesBackground";

const GLOBAL_BG_PARTICLES = {
  background: { color: "transparent" },
  fpsLimit: 60,
  particles: {
    number: { value: 50 },
    color: {
      value: "#00ff88",
      animation: { h: { enable: true, speed: 8, sync: true } },
    },
    links: {
      enable: true,
      color: {
        value: "#00ff88",
        animation: { h: { enable: true, speed: 8, sync: true } },
      },
      distance: 150,
      opacity: 0.12,
    },
    move: { enable: true, speed: 0.4, random: true },
    size: { value: 2 },
    opacity: { value: 0.35 },
  },
} satisfies ISourceOptions;

export function LabGlobalParticles() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    >
      <ParticlesProvider init={loadSlim}>
        <ParticlesBackground options={GLOBAL_BG_PARTICLES} id="lab-global-bg" />
      </ParticlesProvider>
    </div>
  );
}
