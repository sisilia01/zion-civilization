"use client";

import Particles from "@tsparticles/react";
import type { ISourceOptions } from "@tsparticles/engine";

export function ParticlesBackground({
  options,
  id,
}: {
  options: ISourceOptions;
  id: string;
}) {
  return (
    <Particles
      id={`tsparticles-${id}`}
      options={options}
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
    />
  );
}
