"use client";

import { useEffect, useRef } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+-";

function randomChar() {
  return CHARS[Math.floor(Math.random() * CHARS.length)]!;
}

type Particle = {
  x: number;
  y: number;
  vy: number;
  char: string;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
};

function sampleWordPoints(word: string, width: number, height: number, step: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) return [] as { x: number; y: number }[];
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  ctx.font = `700 ${Math.min(width, height) * 0.3}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(word, width / 2, height / 2);
  const img = ctx.getImageData(0, 0, width, height).data;
  const points: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (img[(y * width + x) * 4]! > 120) points.push({ x, y });
    }
  }
  return points;
}

export function MatrixIntro({ onComplete }: { onComplete: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const particles: Particle[] = [];
    const COUNT = 2600;
    const RAIN_MS = 3000;
    const FORM_MS = 1000;
    const FADE_MS = 1000;
    const start = performance.now();
    let phase: "rain" | "form" | "fade" = "rain";
    let phaseStart = start;
    let targets: { x: number; y: number }[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vy: 4 + Math.random() * 6.5,
        char: randomChar(),
        sx: 0,
        sy: 0,
        tx: 0,
        ty: 0,
      });
    }

    const loop = (now: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.fillRect(0, 0, w, h);
      ctx.font = '13px "JetBrains Mono", monospace';
      ctx.textBaseline = "top";

      if (phase === "rain" && now - start >= RAIN_MS) {
        phase = "form";
        phaseStart = now;
        targets = sampleWordPoints("ZION", w, h, Math.max(3, Math.floor(w / 180)));
        particles.forEach((p, i) => {
          p.sx = p.x;
          p.sy = p.y;
          const t = targets[i % targets.length] ?? { x: w / 2, y: h / 2 };
          p.tx = t.x;
          p.ty = t.y;
        });
      }

      if (phase === "form" && now - phaseStart >= FORM_MS) {
        phase = "fade";
        phaseStart = now;
      }

      if (phase === "rain") {
        for (const p of particles) {
          p.y += p.vy;
          if (p.y > h + 16) {
            p.y = -16;
            p.x = Math.random() * w;
          }
          if (Math.random() < 0.2) p.char = randomChar();
          ctx.fillStyle = "rgba(0,255,65,0.82)";
          ctx.fillText(p.char, p.x, p.y);
        }
      } else {
        const t = Math.min(1, (now - phaseStart) / (phase === "form" ? FORM_MS : FADE_MS));
        const alpha = phase === "fade" ? 1 - t : 1;
        const ease = 1 - (1 - Math.min(1, (now - (start + RAIN_MS)) / FORM_MS)) ** 3;
        for (const p of particles) {
          const x = p.sx + (p.tx - p.sx) * ease;
          const y = p.sy + (p.ty - p.sy) * ease;
          if (Math.random() < 0.2) p.char = randomChar();
          ctx.fillStyle = `rgba(255,215,0,${0.9 * alpha})`;
          ctx.fillText(p.char, x, y);
        }
        const fontSize = Math.min(w, h) * 0.34;
        ctx.strokeStyle = `rgba(255,215,0,${0.35 * alpha})`;
        ctx.lineWidth = 3;
        ctx.font = `800 ${fontSize}px "Orbitron", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.strokeText("ZION", w / 2, h / 2);
        ctx.fillStyle = `rgba(255,230,130,${0.2 * alpha})`;
        ctx.fillText("ZION", w / 2, h / 2);

        ctx.strokeStyle = `rgba(158,220,255,${0.55 * alpha})`;
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 7; i++) {
          const startX = w / 2 - fontSize * 0.9 + Math.random() * fontSize * 1.8;
          const startY = h / 2 - fontSize * 0.7 + Math.random() * fontSize * 0.15;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          let x = startX;
          let y = startY;
          for (let s = 0; s < 7; s++) {
            x += (Math.random() - 0.5) * 28;
            y += 8 + Math.random() * 16;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        if (phase === "fade" && t >= 1 && !doneRef.current) {
          doneRef.current = true;
          onComplete();
          return;
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [onComplete]);

  return <canvas ref={canvasRef} className="fixed inset-0 z-[100] h-screen w-screen bg-black" />;
}

