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
  disableTilt?: boolean;
  /** Multiplier for hover tilt (1 = default). Use ~0.05 for subtle tilt. */
  tiltStrength?: number;
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

export function GlassCard({
  children,
  className,
  style,
  disableTilt = false,
  tiltStrength = 1,
}: GlassCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const tiltRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (disableTilt) return;
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
  }, [disableTilt]);

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
      const maxDeg = 3 * tiltStrength;
      const scale = 6 * tiltStrength;
      const tiltX = Math.max(-maxDeg, Math.min(maxDeg, xNorm * scale));
      const tiltY = Math.max(-maxDeg, Math.min(maxDeg, -yNorm * scale));
      tiltRef.current = { x: tiltX, y: tiltY };

      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const glareAngle =
        (Math.atan2(cy - rect.height / 2, cx - rect.width / 2) * 180) / Math.PI + 90;

      applyTilt(tiltX, tiltY, glareAngle);
    },
    [applyTilt, tiltStrength]
  );

  const handleMouseLeave = useCallback(() => {
    tiltRef.current = { x: 0, y: 0 };
    applyTilt(0, 0, 135);
  }, [applyTilt]);

  const classes = [styles.glassCard, disableTilt ? null : "liquidGL", className].filter(Boolean).join(" ");

  return (
    <div
      ref={ref}
      className={classes}
      style={style}
      onMouseMove={disableTilt ? undefined : handleMouseMove}
      onMouseLeave={disableTilt ? undefined : handleMouseLeave}
    >
      <div className={styles.cardContent}>{children}</div>
    </div>
  );
}
