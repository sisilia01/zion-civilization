"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import styles from "./GlassCard.module.css";

type GlassCardProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

let liquidGLInit: Promise<unknown> | null = null;

function ensureLiquidGL(): Promise<unknown> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!liquidGLInit) {
    liquidGLInit = import("liquidgl").then(({ default: liquidGL }) =>
      liquidGL({
        target: ".liquidGL",
        snapshot: "body",
        resolution: 1.5,
        refraction: 0.008,
        bevelDepth: 0.08,
        bevelWidth: 0.15,
        frost: 0,
        shadow: true,
        specular: true,
        reveal: "fade",
        tilt: false,
      })
    );
  }
  return liquidGLInit;
}

export function GlassCard({ children, className, style }: GlassCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const tiltRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    ensureLiquidGL().then(() => {
      if (cancelled) return;
      import("liquidgl").then(({ default: liquidGL }) => {
        if (!cancelled && el.isConnected) {
          liquidGL.registerDynamic(el);
        }
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const applyTilt = useCallback((tiltX: number, tiltY: number, glareAngle: number) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `perspective(600px) rotateX(${tiltY}deg) rotateY(${tiltX}deg)`;
    el.style.setProperty("--glare-angle", `${glareAngle}deg`);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const xNorm = (e.clientX - rect.left) / rect.width - 0.5;
      const yNorm = (e.clientY - rect.top) / rect.height - 0.5;
      const tiltX = Math.max(-3, Math.min(3, xNorm * 6));
      const tiltY = Math.max(-3, Math.min(3, -yNorm * 6));
      tiltRef.current = { x: tiltX, y: tiltY };

      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const glareAngle =
        (Math.atan2(cy - rect.height / 2, cx - rect.width / 2) * 180) / Math.PI + 90;

      applyTilt(tiltX, tiltY, glareAngle);
    },
    [applyTilt]
  );

  const handleMouseLeave = useCallback(() => {
    tiltRef.current = { x: 0, y: 0 };
    applyTilt(0, 0, 135);
  }, [applyTilt]);

  const classes = [styles.glassCard, "liquidGL", className].filter(Boolean).join(" ");

  return (
    <div
      ref={ref}
      className={classes}
      style={style}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className={styles.cardContent}>{children}</div>
    </div>
  );
}
