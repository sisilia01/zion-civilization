"use client";

import { useEffect, useRef } from "react";
import styles from "./SiteFooter.module.css";

const GRID = 40;
const ATTRACT_RADIUS = 80;
const MAX_PULL = 14;
const DAMPING = 0.85;
const SPRING = 0.08;
const BASE_OPACITY = 0.05;
const MAX_OPACITY = 0.25;

type GridNode = {
  originX: number;
  originY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export function SiteFooterStrings() {
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
    const mouse = { x: -9999, y: -9999, active: false };

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
      const t = Math.min(1, avg / MAX_PULL);
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
            ctxEl.strokeStyle = `rgba(0,180,216,${lineOpacity(node, right)})`;
            ctxEl.lineWidth = 0.75;
            ctxEl.stroke();
          }

          if (row < rows - 1) {
            const down = gridNodes[row + 1][col];
            ctxEl.beginPath();
            ctxEl.moveTo(node.x, node.y);
            ctxEl.lineTo(down.x, down.y);
            ctxEl.strokeStyle = `rgba(0,180,216,${lineOpacity(node, down)})`;
            ctxEl.lineWidth = 0.75;
            ctxEl.stroke();
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
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
      mouse.active = true;
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

  return <canvas ref={canvasRef} className={styles.stringsCanvas} aria-hidden />;
}
