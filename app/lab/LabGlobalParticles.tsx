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
    number: { value: 390 },
    paint: {
      color: {
        value: { h: 185, s: 75, l: 55 },
        animation: { h: { enable: true, speed: 8, sync: true } },
      },
      fill: { enable: true },
    } as any,
    links: {
      enable: true,
      color: { value: "hsl(185, 75%, 55%)" },
      distance: 130,
      opacity: 0.105,
    },
    move: {
      enable: true,
      speed: 0.2,
      random: true,
      direction: "none",
      outModes: { default: "out" },
    },
    size: { value: 1.2 },
    opacity: { value: 0.462 },
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
