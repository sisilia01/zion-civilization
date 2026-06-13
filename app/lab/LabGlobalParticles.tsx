"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";
import { ParticlesBackground } from "@/components/ParticlesBackground";

const GLOBAL_BG_PARTICLES = {
  background: { color: "transparent" },
  fpsLimit: 60,
  particles: {
    number: { value: 60 },
    color: {
      value: "#00ff88",
      animation: { h: { enable: true, speed: 8, sync: true } },
    } as any,
    links: {
      enable: true,
      color: {
        value: "#00ff88",
        animation: { h: { enable: true, speed: 8, sync: true } },
      } as any,
      distance: 150,
      opacity: 0.15,
    },
    move: { enable: true, speed: 0.4, random: true },
    size: { value: 2 },
    opacity: { value: 0.4 },
  },
} as ISourceOptions;

export function LabGlobalParticles() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        background: "transparent",
      }}
    >
      <ParticlesProvider init={loadSlim}>
        <ParticlesBackground options={GLOBAL_BG_PARTICLES} id="lab-global-bg" />
      </ParticlesProvider>
    </div>,
    document.body
  );
}
