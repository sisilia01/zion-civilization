"use client";

import { useEffect, useRef } from "react";

export function IrisCanvas({ size = 300 }: { size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const pupilR = size * 0.26;
    const irisOuterR = size * 0.48;

    ctx.fillStyle = "#000005";
    ctx.fillRect(0, 0, size, size);

    const halo = ctx.createRadialGradient(cx, cy, pupilR, cx, cy, irisOuterR);
    halo.addColorStop(0, "rgba(0,40,60,0)");
    halo.addColorStop(0.5, "rgba(0,120,160,0.12)");
    halo.addColorStop(0.85, "rgba(40,180,220,0.20)");
    halo.addColorStop(1, "rgba(0,30,50,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, irisOuterR, 0, Math.PI * 2);
    ctx.fill();

    const N = 900;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.02;
      const startR = pupilR * (0.95 + Math.random() * 0.15);
      const endR = irisOuterR * (0.7 + Math.random() * 0.3);

      const x1 = cx + Math.cos(angle) * startR;
      const y1 = cy + Math.sin(angle) * startR;
      const x2 = cx + Math.cos(angle) * endR;
      const y2 = cy + Math.sin(angle) * endR;

      const warm = Math.random() < 0.08;
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      if (warm) {
        grad.addColorStop(0, "rgba(60,30,10,0.0)");
        grad.addColorStop(0.5, "rgba(180,90,40,0.4)");
        grad.addColorStop(1, "rgba(255,160,90,0.7)");
      } else {
        grad.addColorStop(0, "rgba(0,20,35,0.0)");
        grad.addColorStop(0.45, "rgba(0,110,150,0.5)");
        grad.addColorStop(0.85, "rgba(80,200,240,0.85)");
        grad.addColorStop(1, "rgba(160,235,255,0.95)");
      }
      ctx.strokeStyle = grad;
      ctx.globalAlpha = 0.5 + Math.random() * 0.5;
      ctx.lineWidth = 0.4 + Math.random() * 1.0;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      const midR = (startR + endR) / 2;
      const midAngle = angle + (Math.random() - 0.5) * 0.04;
      const mx = cx + Math.cos(midAngle) * midR;
      const my = cy + Math.sin(midAngle) * midR;
      ctx.quadraticCurveTo(mx, my, x2, y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = "rgba(150,225,255,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, irisOuterR * 0.99, 0, Math.PI * 2);
    ctx.stroke();

    const pupilGrad = ctx.createRadialGradient(cx, cy, pupilR * 0.7, cx, cy, pupilR * 1.1);
    pupilGrad.addColorStop(0, "#000000");
    pupilGrad.addColorStop(0.85, "#000000");
    pupilGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = pupilGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, pupilR * 1.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(80,200,240,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, pupilR, 0, Math.PI * 2);
    ctx.stroke();
  }, [size]);

  return (
    <canvas
      ref={ref}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "block",
        filter: "drop-shadow(0 0 30px rgba(0,150,200,0.4))",
      }}
    />
  );
}
