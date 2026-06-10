"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type BiotechWaveFieldProps = {
  /** Full-viewport ambient field vs. contained hero panel */
  variant?: "fullscreen" | "hero";
  className?: string;
  /** Animation speed multiplier (0.3–0.5 recommended) */
  speed?: number;
  /** Overall brightness */
  intensity?: number;
};

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uPointScale;
  attribute float aPhase;
  varying vec3 vPos;
  varying float vWave;

  void main() {
    vec3 pos = position;
    float t = uTime * uSpeed;
    float wave =
      sin(pos.x * 0.32 + t + aPhase) * cos(pos.z * 0.26 + t * 0.72) * 1.6
      + sin(pos.x * 0.11 + pos.z * 0.14 + t * 0.38 + aPhase) * 2.2
      + sin(pos.x * 0.05 - pos.z * 0.08 + t * 0.55) * 0.9;
    pos.y += wave;
    vPos = pos;
    vWave = wave;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float depth = -mvPosition.z;
    gl_PointSize = uPointScale * mix(0.8, 2.8, smoothstep(6.0, 32.0, depth));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  varying vec3 vPos;
  varying float vWave;

  void main() {
    vec2 cxy = 2.0 * gl_PointCoord - 1.0;
    float r = dot(cxy, cxy);
    if (r > 1.0) discard;
    float soft = 1.0 - smoothstep(0.25, 1.0, r);

    float t = uTime * 0.22 + vPos.x * 0.07 + vPos.z * 0.05 + vWave * 0.15;
    vec3 cyan = vec3(0.62, 0.94, 1.0);
    vec3 purple = vec3(0.78, 0.48, 1.0);
    vec3 gold = vec3(1.0, 0.84, 0.52);
    vec3 white = vec3(0.96, 0.98, 1.0);

    float b1 = 0.5 + 0.5 * sin(t);
    float b2 = 0.5 + 0.5 * sin(t + 2.094);
    float b3 = 0.5 + 0.5 * sin(t + 4.188);
    vec3 iridescent = mix(cyan, purple, b1);
    iridescent = mix(iridescent, gold, b2 * 0.42);
    iridescent = mix(iridescent, white, b3 * 0.25);

    float chroma = sin(vPos.x * 0.18 + uTime * 0.4) * 0.04;
    iridescent.r += chroma;
    iridescent.b -= chroma * 0.6;

    vec3 color = iridescent * (0.5 + soft * 0.5) * uIntensity;
    gl_FragColor = vec4(color, soft * 0.72);
  }
`;

export function BiotechWaveField({
  variant = "fullscreen",
  className = "",
  speed = 0.4,
  intensity,
}: BiotechWaveFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isHero = variant === "hero";
    const grid = isHero ? 140 : 96;
    const spread = isHero ? 34 : 48;
    const resolvedIntensity = intensity ?? (isHero ? 1.0 : 0.55);
    const pointScale = isHero ? 2.4 : 1.6;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, isHero ? 0.028 : 0.018);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    camera.position.set(0, isHero ? 11 : 14, isHero ? 22 : 28);
    camera.lookAt(0, -1.5, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 1);
    container.appendChild(renderer.domElement);

    const count = grid * grid;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    let idx = 0;
    for (let i = 0; i < grid; i++) {
      for (let j = 0; j < grid; j++) {
        const u = i / (grid - 1) - 0.5;
        const v = j / (grid - 1) - 0.5;
        positions[idx * 3] = u * spread;
        positions[idx * 3 + 1] = 0;
        positions[idx * 3 + 2] = v * spread;
        phases[idx] = Math.random() * Math.PI * 2;
        idx++;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: speed },
        uIntensity: { value: resolvedIntensity },
        uPointScale: { value: pointScale },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.rotation.x = -0.42;
    scene.add(points);

    // Secondary distant point haze for depth
    const hazeCount = isHero ? 800 : 500;
    const hazePos = new Float32Array(hazeCount * 3);
    for (let i = 0; i < hazeCount; i++) {
      hazePos[i * 3] = (Math.random() - 0.5) * spread * 1.4;
      hazePos[i * 3 + 1] = Math.random() * 8 - 2;
      hazePos[i * 3 + 2] = (Math.random() - 0.5) * spread * 1.2 - 8;
    }
    const hazeGeo = new THREE.BufferGeometry();
    hazeGeo.setAttribute("position", new THREE.BufferAttribute(hazePos, 3));
    const hazeMat = new THREE.PointsMaterial({
      color: 0xaaccff,
      size: 0.35,
      transparent: true,
      opacity: isHero ? 0.18 : 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const haze = new THREE.Points(hazeGeo, hazeMat);
    scene.add(haze);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const clock = new THREE.Clock();

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const elapsed = clock.getElapsedTime();
      if (!reducedMotion) {
        material.uniforms.uTime.value = elapsed;
        points.rotation.z = Math.sin(elapsed * 0.08) * 0.06;
        camera.position.x = Math.sin(elapsed * 0.12) * (isHero ? 1.2 : 2.5);
        camera.position.z = (isHero ? 22 : 28) + Math.cos(elapsed * 0.1) * 1.5;
        camera.lookAt(0, -1.5, 0);
        haze.rotation.y = elapsed * 0.03;
      }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      geometry.dispose();
      material.dispose();
      hazeGeo.dispose();
      hazeMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [variant, speed, intensity]);

  return (
    <div
      ref={containerRef}
      className={className}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        background: "#000000",
        overflow: "hidden",
        pointerEvents: "none",
      }}
    />
  );
}
