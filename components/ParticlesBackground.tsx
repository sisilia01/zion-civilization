"use client";

import { useCallback, useEffect, useRef } from "react";
import Particles from "@tsparticles/react";
import type { Container, ISourceOptions, IRgb } from "@tsparticles/engine";

const LINK_S = 75;
const LINK_L = 55;
const INITIAL_HUE = 185;

function hslToRgb(h: number, s: number, l: number): IRgb {
  const sat = s / 100;
  const light = l / 100;
  const chroma = sat * Math.min(light, 1 - light);
  const huePrime = h / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (huePrime < 1) {
    r = chroma;
    g = x;
  } else if (huePrime < 2) {
    r = x;
    g = chroma;
  } else if (huePrime < 3) {
    g = chroma;
    b = x;
  } else if (huePrime < 4) {
    g = x;
    b = chroma;
  } else if (huePrime < 5) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }

  const m = light - chroma / 2;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function updateLinkHue(container: Container, hue: number) {
  const hsl = `hsl(${hue}, ${LINK_S}%, ${LINK_L}%)`;
  const rgb = hslToRgb(hue, LINK_S, LINK_L);
  const linksOpt = container.actualOptions?.particles?.links as
    | { color?: { value?: unknown } }
    | undefined;

  if (linksOpt?.color && typeof linksOpt.color === "object" && "value" in linksOpt.color) {
    linksOpt.color.value = hsl;
  }

  const particlesManager = container.particles as typeof container.particles & {
    linksColor?: IRgb;
    linksColors: Map<string, IRgb | string | undefined>;
  };

  particlesManager.linksColor = rgb;
  particlesManager.linksColors.clear();

  for (const particle of container.particles.filter(() => true)) {
    const particleLinks = particle.options.links as { color?: { value?: unknown } } | undefined;
    if (particleLinks?.color && typeof particleLinks.color === "object" && "value" in particleLinks.color) {
      particleLinks.color.value = hsl;
    }
    const links = (particle as typeof particle & { links?: Array<{ color?: IRgb }> }).links;
    if (links) {
      for (const link of links) {
        link.color = rgb;
      }
    }
  }
}

export function ParticlesBackground({
  options,
  id,
}: {
  options: ISourceOptions;
  id: string;
}) {
  const containerRef = useRef<Container | null>(null);
  const hueRef = useRef(INITIAL_HUE);

  const particlesLoaded = useCallback((container?: Container) => {
    if (container) {
      containerRef.current = container;
      updateLinkHue(container, hueRef.current);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      hueRef.current = (hueRef.current + 0.3) % 360;
      const container = containerRef.current;
      if (container) {
        updateLinkHue(container, hueRef.current);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <Particles
      id={`tsparticles-${id}`}
      options={options}
      particlesLoaded={particlesLoaded}
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0, pointerEvents: "none" }}
    />
  );
}
