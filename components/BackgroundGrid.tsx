"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ISourceOptions } from "@tsparticles/engine";
import { ParticlesBackground } from "@/components/ParticlesBackground";

/** Observatory background — cyan/teal grid (~hsla 185,70%,55%) with hue sweep */
const OBSERVATORY_BG_PARTICLES = {
  background: { color: "transparent" },
  fpsLimit: 60,
  particles: {
    number: { value: 449 },
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
      opacity: 0.128,
    },
    move: {
      enable: true,
      speed: 0.2,
      random: true,
      direction: "none",
      outModes: { default: "out" },
    },
    size: { value: 1.2 },
    opacity: { value: 0.508 },
  },
} as ISourceOptions;

export default function BackgroundGrid() {
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
        <ParticlesBackground options={OBSERVATORY_BG_PARTICLES} id="observatory-bg" />
      </ParticlesProvider>
    </div>,
    document.body,
  );
}
