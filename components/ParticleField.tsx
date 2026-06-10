"use client";

import "@react-three/fiber";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/** Grid tiers: ~129k / ~176k / ~200k particles */
const GRID_TIERS = [360, 420, 447] as const;

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const RAY_HIT = new THREE.Vector3();

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec2 uMouseWorld;
  uniform float uRepulsionRadius;
  uniform float uMouseStrength;

  attribute float aSeed;

  varying float vElevation;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  void main() {
    vec3 basePos = position;
    float t = uTime * 0.08;

    float wave =
      sin(basePos.x * 2.1 + t) * 1.2
      + sin(basePos.x * 0.7 + t * 1.3) * 1.8
      + sin(basePos.z * 1.4 + t * 0.8) * 1.4
      + sin(basePos.x * 0.35 + basePos.z * 0.42 + t * 0.5) * 0.9
      + snoise(vec3(basePos.x * 0.12, basePos.z * 0.12, t)) * 1.5;

    vec3 pos = basePos;
    pos.y += wave;

    vec2 diff = basePos.xz - uMouseWorld;
    float dist = length(diff);
    float radius = max(uRepulsionRadius, 0.001);
    float influence = smoothstep(radius, 0.0, dist) * uMouseStrength;

    if (dist > 0.0001 && influence > 0.0001) {
      vec2 forceDir = diff / dist;
      float forceMag = (1.0 - dist / radius) * 1.5 * influence;
      pos.xz += forceDir * forceMag;
    }

    vElevation = wave;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = 1.6 * (280.0 / max(-mvPosition.z, 1.0));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;

  varying float vElevation;

  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float dist = length(c);
    if (dist > 0.5) discard;

    float core = 1.0 - smoothstep(0.0, 0.1, dist);
    float halo = 1.0 - smoothstep(0.1, 0.48, dist);

    float crest = smoothstep(0.75, 2.4, vElevation);

    float hue = sin(uTime * 0.314) * 0.5 + 0.5;

    vec3 cyan = vec3(0.0, 0.706, 0.847);
    vec3 purple = vec3(0.482, 0.184, 1.0);
    vec3 teal = vec3(0.0, 0.898, 0.8);

    vec3 crestColor;
    if (hue < 0.333) {
      crestColor = mix(cyan, purple, hue / 0.333);
    } else if (hue < 0.666) {
      crestColor = mix(purple, teal, (hue - 0.333) / 0.333);
    } else {
      crestColor = mix(teal, cyan, (hue - 0.666) / 0.334);
    }

    vec3 darkBlue = vec3(0.039, 0.086, 0.157);
    vec3 color = mix(darkBlue, crestColor, crest);

    float luminance = core * mix(0.25, 1.2, crest) + halo * mix(0.02, 0.16, crest);
    float alpha = core * mix(0.28, 0.85, crest) + halo * mix(0.02, 0.06, crest);

    gl_FragColor = vec4(color * luminance, alpha);
  }
`;

type MouseState = {
  ndc: THREE.Vector2;
  active: boolean;
};

type ParticleWaveProps = {
  gridSize: number;
  mouseRef: React.RefObject<MouseState>;
};

function ParticleWave({ gridSize, mouseRef }: ParticleWaveProps) {
  const spread = 52;
  const { camera, size } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const geometry = useMemo(() => {
    const count = gridSize * gridSize;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    let idx = 0;
    for (let iy = 0; iy < gridSize; iy++) {
      for (let ix = 0; ix < gridSize; ix++) {
        const u = (ix / (gridSize - 1) - 0.5) * spread;
        const v = (iy / (gridSize - 1) - 0.5) * spread;
        positions[idx * 3] = u;
        positions[idx * 3 + 1] = 0;
        positions[idx * 3 + 2] = v;
        seeds[idx] = Math.random();
        idx++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    return geo;
  }, [gridSize, spread]);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMouseWorld: { value: new THREE.Vector2(0, 0) },
        uRepulsionRadius: { value: 2.0 },
        uMouseStrength: { value: 0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
  }, []);

  const points = useMemo(() => new THREE.Points(geometry, material), [geometry, material]);

  useFrame((state) => {
    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;

    const mouse = mouseRef.current;

    if (mouse?.active) {
      u.uMouseStrength.value = 1.0;
      raycaster.setFromCamera(mouse.ndc, camera);
      if (raycaster.ray.intersectPlane(GROUND_PLANE, RAY_HIT)) {
        u.uMouseWorld.value.set(RAY_HIT.x, RAY_HIT.z);
      }
    } else {
      u.uMouseStrength.value = THREE.MathUtils.lerp(
        u.uMouseStrength.value as number,
        0.0,
        0.15,
      );
    }

    const camDist = camera.position.distanceTo(new THREE.Vector3(0, 0, 0));
    const persp = camera as THREE.PerspectiveCamera;
    const vFov = (persp.fov * Math.PI) / 180;
    const visibleHeight = 2 * Math.tan(vFov / 2) * camDist;
    const visibleWidth = visibleHeight * (size.width / Math.max(size.height, 1));
    u.uRepulsionRadius.value = visibleWidth * 0.15;
  });

  return <primitive object={points} />;
}

function ParticleScene({
  tierIndex,
  onLowFps,
  mouseRef,
}: {
  tierIndex: number;
  onLowFps: () => void;
  mouseRef: React.RefObject<MouseState>;
}) {
  const gridSize = GRID_TIERS[tierIndex] ?? GRID_TIERS[2];
  const deltas = useRef<number[]>([]);
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 8, 20);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame((_, delta) => {
    deltas.current.push(delta);
    if (deltas.current.length >= 45) {
      const avg = deltas.current.reduce((a, b) => a + b, 0) / deltas.current.length;
      if (avg > 0.02) onLowFps();
      deltas.current = [];
    }
  });

  return (
    <>
      <ParticleWave gridSize={gridSize} mouseRef={mouseRef} />
      <EffectComposer>
        <Bloom intensity={0.4} luminanceThreshold={0.3} luminanceSmoothing={0.9} mipmapBlur />
      </EffectComposer>
    </>
  );
}

type ParticleFieldProps = {
  className?: string;
  variant?: "hero" | "background";
};

export function ParticleField({ className = "" }: ParticleFieldProps) {
  const [tierIndex, setTierIndex] = useState(2);
  const [visible, setVisible] = useState(false);
  const mouse = useRef<MouseState>({
    ndc: new THREE.Vector2(0, 0),
    active: false,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleLowFps = useCallback(() => {
    setTierIndex((t) => Math.max(0, t - 1));
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.active = true;
      mouse.current.ndc.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
    };

    const onLeave = () => {
      mouse.current.active = false;
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) setTierIndex(0);
    const narrow = window.innerWidth < 768;
    if (narrow) setTierIndex((t) => Math.min(t, 1));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 100);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        background: "#000000",
        touchAction: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.4s ease",
      }}
      aria-hidden
    >
      <Canvas
        dpr={[1, 2]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        frameloop="always"
        camera={{ fov: 42, near: 0.1, far: 200, position: [0, 8, 20] }}
        style={{ width: "100%", height: "100%", display: "block", background: "transparent" }}
      >
        <ParticleScene tierIndex={tierIndex} onLowFps={handleLowFps} mouseRef={mouse} />
      </Canvas>
    </div>
  );
}
