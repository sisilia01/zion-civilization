"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

const GRID = 40;
const ATTRACT_RADIUS = 90;
const MAX_PULL = 18;
const DAMPING = 0.82;
const SPRING = 0.1;
const BASE_OPACITY = 0.06;
const MAX_OPACITY = 0.55;
const ACCENT_RGB = "61, 122, 181";
const ACCENT = "#3d7ab5";
const ACCENT_BRIGHT = "#4a9eff";

type GridNode = {
  originX: number;
  originY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

function FooterStringsCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const footer = canvas?.closest("footer");
    if (!canvas || !footer) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const footerEl = footer;
    const canvasEl = canvas;
    const ctxEl = ctx;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let gridNodes: GridNode[][] = [];
    let cols = 0;
    let rows = 0;
    let width = 0;
    let height = 0;
    let visible = false;
    let rafId: number | null = null;
    const mouse = { x: -9999, y: -9999, active: false, px: -9999, py: -9999 };

    function buildGrid(w: number, h: number) {
      cols = Math.ceil(w / GRID) + 1;
      rows = Math.ceil(h / GRID) + 1;
      gridNodes = [];

      for (let row = 0; row < rows; row++) {
        gridNodes[row] = [];
        for (let col = 0; col < cols; col++) {
          const originX = col * GRID;
          const originY = row * GRID;
          gridNodes[row][col] = {
            originX,
            originY,
            x: originX,
            y: originY,
            vx: 0,
            vy: 0,
          };
        }
      }
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = footerEl.clientWidth;
      height = footerEl.clientHeight;
      canvasEl.width = Math.max(1, Math.floor(width * dpr));
      canvasEl.height = Math.max(1, Math.floor(height * dpr));
      canvasEl.style.width = `${width}px`;
      canvasEl.style.height = `${height}px`;
      ctxEl.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildGrid(width, height);
    }

    function lineOpacity(a: GridNode, b: GridNode) {
      const devA = Math.hypot(a.x - a.originX, a.y - a.originY);
      const devB = Math.hypot(b.x - b.originX, b.y - b.originY);
      const avg = (devA + devB) / 2;
      const vel = (Math.hypot(a.vx, a.vy) + Math.hypot(b.vx, b.vy)) / 2;
      const t = Math.min(1, (avg / MAX_PULL) * 0.75 + (vel / 4) * 0.25);
      return BASE_OPACITY + t * (MAX_OPACITY - BASE_OPACITY);
    }

    function drawLines() {
      ctxEl.clearRect(0, 0, width, height);

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const node = gridNodes[row][col];

          if (col < cols - 1) {
            const right = gridNodes[row][col + 1];
            ctxEl.beginPath();
            ctxEl.moveTo(node.x, node.y);
            ctxEl.lineTo(right.x, right.y);
            ctxEl.strokeStyle = `rgba(${ACCENT_RGB},${lineOpacity(node, right)})`;
            ctxEl.lineWidth = 0.8;
            ctxEl.stroke();
          }

          if (row < rows - 1) {
            const down = gridNodes[row + 1][col];
            ctxEl.beginPath();
            ctxEl.moveTo(node.x, node.y);
            ctxEl.lineTo(down.x, down.y);
            ctxEl.strokeStyle = `rgba(${ACCENT_RGB},${lineOpacity(node, down)})`;
            ctxEl.lineWidth = 0.8;
            ctxEl.stroke();
          }
        }
      }
    }

    function pluckNearbyNodes() {
      if (!mouse.active || reducedMotion) return;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const node = gridNodes[row][col];
          const dx = mouse.x - node.originX;
          const dy = mouse.y - node.originY;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.001 && dist < ATTRACT_RADIUS) {
            const strength = (1 - dist / ATTRACT_RADIUS) * 2.2;
            node.vx += (dx / dist) * strength;
            node.vy += (dy / dist) * strength;
          }
        }
      }
    }

    function stepNodes() {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const node = gridNodes[row][col];
          let targetX = node.originX;
          let targetY = node.originY;

          if (mouse.active && !reducedMotion) {
            const dx = mouse.x - node.originX;
            const dy = mouse.y - node.originY;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.001 && dist < ATTRACT_RADIUS) {
              const pull = (1 - dist / ATTRACT_RADIUS) * MAX_PULL;
              targetX = node.originX + (dx / dist) * pull;
              targetY = node.originY + (dy / dist) * pull;
            }
          }

          node.vx = (node.vx + (targetX - node.x) * SPRING) * DAMPING;
          node.vy = (node.vy + (targetY - node.y) * SPRING) * DAMPING;
          node.x += node.vx;
          node.y += node.vy;
        }
      }
    }

    function tick() {
      if (!visible) {
        rafId = null;
        return;
      }

      if (!reducedMotion) {
        stepNodes();
      }
      drawLines();
      rafId = requestAnimationFrame(tick);
    }

    function startLoop() {
      if (rafId === null) {
        rafId = requestAnimationFrame(tick);
      }
    }

    function stopLoop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function onMouseMove(event: MouseEvent) {
      const rect = footerEl.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const moved = Math.hypot(x - mouse.px, y - mouse.py);
      mouse.x = x;
      mouse.y = y;
      mouse.px = x;
      mouse.py = y;
      mouse.active = true;
      if (moved > 1.5) {
        pluckNearbyNodes();
      }
    }

    function onMouseLeave() {
      mouse.active = false;
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(footerEl);
    resize();

    footerEl.addEventListener("mousemove", onMouseMove);
    footerEl.addEventListener("mouseleave", onMouseLeave);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false;
        if (visible) {
          startLoop();
        } else {
          stopLoop();
        }
      },
      { rootMargin: "120px 0px" },
    );
    intersectionObserver.observe(footerEl);

    return () => {
      footerEl.removeEventListener("mousemove", onMouseMove);
      footerEl.removeEventListener("mouseleave", onMouseLeave);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      stopLoop();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}

function FooterLink({
  href,
  label,
  external = false,
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  const style: React.CSSProperties = {
    color: "rgba(255, 255, 255, 0.58)",
    fontFamily: '"IBM Plex Mono", monospace',
    fontSize: "11px",
    letterSpacing: "0.06em",
    textDecoration: "none",
    transition: "color 0.15s ease",
  };

  if (external) {
    return (
      <a
        href={href}
        style={style}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={(e) => {
          e.currentTarget.style.color = ACCENT_BRIGHT;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "rgba(255, 255, 255, 0.58)";
        }}
      >
        {label}
      </a>
    );
  }

  return (
    <Link
      href={href}
      style={style}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = ACCENT_BRIGHT;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "rgba(255, 255, 255, 0.58)";
      }}
    >
      {label}
    </Link>
  );
}

function FooterColumnList({ children }: { children: ReactNode }) {
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {children}
    </ul>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section style={{ width: "100%", minWidth: 0 }}>
      <h2
        style={{
          margin: "0 0 14px",
          minHeight: "14px",
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: "10px",
          fontWeight: 500,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: ACCENT,
        }}
      >
        {title}
      </h2>
      <FooterColumnList>{children}</FooterColumnList>
    </section>
  );
}

function FooterListItem({ children }: { children: ReactNode }) {
  return <li style={{ margin: 0 }}>{children}</li>;
}

const DEEPSURGE_URL =
  "https://deepsurge.xyz/projects/1399d32e-7bca-4487-a444-2f8b06fec089";

export default function ZionFooter() {
  return (
    <footer
      aria-label="ZION Civilization footer"
      style={{
        marginTop: "auto",
        position: "relative",
        zIndex: 2,
        overflow: "hidden",
        backgroundColor: "#0a0a0f",
        backgroundImage:
          "linear-gradient(rgba(61, 122, 181, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(61, 122, 181, 0.05) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
        borderTop: "1px solid rgba(61, 122, 181, 0.2)",
      }}
    >
      <FooterStringsCanvas />
      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "20px 32px 14px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "24px 32px",
            alignItems: "start",
          }}
        >
          <FooterColumn title="Community">
            <FooterListItem>
              <FooterLink href="https://discord.gg/rp5tvdre" label="Discord" external />
            </FooterListItem>
            <FooterListItem>
              <FooterLink href="https://x.com/ZionCiv" label="Twitter/X" external />
            </FooterListItem>
            <FooterListItem>
              <FooterLink href="https://www.youtube.com/@ZionCiv" label="YouTube" external />
            </FooterListItem>
            <FooterListItem>
              <FooterLink href="https://medium.com/@zionciv" label="Medium" external />
            </FooterListItem>
            <FooterListItem>
              <FooterLink
                href="https://github.com/sisilia01/zion-civilization"
                label="GitHub"
                external
              />
            </FooterListItem>
          </FooterColumn>

          <FooterColumn title="On-Chain">
            <FooterListItem>
              <FooterLink
                href="https://suiscan.xyz/testnet/object/0xcb6f3abdca6468fc90cd90dabe87b29eab7cacf739a65a318243d0cad78c543d"
                label="Sui Explorer"
                external
              />
            </FooterListItem>
            <FooterListItem>
              <FooterLink
                href="https://aggregator.walrus-testnet.walrus.space"
                label="Walrus Aggregator"
                external
              />
            </FooterListItem>
            <FooterListItem>
              <FooterLink href={DEEPSURGE_URL} label="DeepSurge" external />
            </FooterListItem>
            <FooterListItem>
              <FooterLink href="https://overflow.sui.io" label="Sui Overflow 2026" external />
            </FooterListItem>
          </FooterColumn>

          <FooterColumn title="Docs">
            <FooterListItem>
              <FooterLink href="/faq" label="FAQ" />
            </FooterListItem>
            <FooterListItem>
              <FooterLink href="/whitepaper" label="Whitepaper" />
            </FooterListItem>
          </FooterColumn>
        </div>

        <p
          style={{
            margin: "28px 0 0",
            paddingTop: "18px",
            borderTop: "1px solid rgba(212, 175, 55, 0.12)",
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: "10px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "rgba(212, 175, 55, 0.45)",
            textAlign: "center",
          }}
        >
          ZION Civilization · Sui Overflow 2026
        </p>
      </div>
    </footer>
  );
}
