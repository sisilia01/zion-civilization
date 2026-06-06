"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function calculateProsperity(
  unemployment: number,
  revolution: number,
  poverty: number,
  population: number
): number {
  const employScore = Math.max(0, 1 - unemployment / 100);
  const stabilityScore = Math.max(0, 1 - revolution / 100);
  const wealthScore = Math.max(0, 1 - poverty / 100);
  const popScore = Math.min(1, population / 20000);
  return employScore * 0.35 + stabilityScore * 0.25 + wealthScore * 0.25 + popScore * 0.15;
}

const TEX_W = 1024;
const TEX_H = 512;

const CONTINENT_SPECS = [
  { cx: 220, cy: 180, size: 110, seed: 101 },
  { cx: 560, cy: 150, size: 140, seed: 202 },
  { cx: 520, cy: 300, size: 90, seed: 303 },
  { cx: 270, cy: 340, size: 80, seed: 404 },
  { cx: 780, cy: 360, size: 60, seed: 505 },
];

type ContinentPoly = { points: { x: number; y: number }[] };

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function buildContinentPoly(cx: number, cy: number, size: number, seed: number): ContinentPoly {
  const rand = seededRandom(seed);
  const pointCount = 12 + Math.floor(rand() * 8);
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2;
    const noise = 0.4 + rand() * 0.6;
    const r = size * noise;
    points.push({
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r * 0.6,
    });
  }
  return { points };
}

function pointInPoly(x: number, y: number, poly: ContinentPoly): boolean {
  let inside = false;
  const pts = poly.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x;
    const yi = pts[i].y;
    const xj = pts[j].x;
    const yj = pts[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isLandPixel(x: number, y: number, continents: ContinentPoly[]): boolean {
  if (y >= 470) return false;
  return continents.some((poly) => pointInPoly(x, y, poly));
}

function drawContinentFromPoly(
  ctx: CanvasRenderingContext2D,
  poly: ContinentPoly,
  centerX: number,
  centerY: number,
  size: number,
  prosperity: number,
  ridgeSeed: number
) {
  ctx.beginPath();
  poly.points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();

  const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size);
  if (prosperity > 0.7) {
    grad.addColorStop(0, "#2a5c1a");
    grad.addColorStop(0.5, "#3a7a28");
    grad.addColorStop(0.8, "#5a9a3a");
    grad.addColorStop(1, "#7ab04a");
  } else if (prosperity > 0.4) {
    grad.addColorStop(0, "#6b5a3a");
    grad.addColorStop(0.5, "#8B7355");
    grad.addColorStop(1, "#a89060");
  } else {
    grad.addColorStop(0, "#8B6914");
    grad.addColorStop(0.5, "#c4a265");
    grad.addColorStop(1, "#d4b88a");
  }
  ctx.fillStyle = grad;
  ctx.fill();

  const rand = seededRandom(ridgeSeed);
  for (let m = 0; m < 3; m++) {
    ctx.beginPath();
    const mx = centerX + (rand() - 0.5) * size;
    const my = centerY + (rand() - 0.5) * size * 0.6;
    ctx.moveTo(mx - size * 0.2, my);
    ctx.quadraticCurveTo(mx, my - size * 0.15, mx + size * 0.2, my);
    ctx.strokeStyle = prosperity > 0.5 ? "#1a3a10" : "#5a3a10";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function drawOceanBase(ctx: CanvasRenderingContext2D, prosperity: number) {
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, TEX_H);
  if (prosperity < 0.3) {
    oceanGrad.addColorStop(0, "#1a1510");
    oceanGrad.addColorStop(0.3, "#2a2018");
    oceanGrad.addColorStop(0.5, "#3a2a1a");
    oceanGrad.addColorStop(0.7, "#2a2018");
    oceanGrad.addColorStop(1, "#1a1510");
  } else {
    oceanGrad.addColorStop(0, "#0a1a3a");
    oceanGrad.addColorStop(0.3, "#0d2d5a");
    oceanGrad.addColorStop(0.5, "#1a4a7a");
    oceanGrad.addColorStop(0.7, "#0d2d5a");
    oceanGrad.addColorStop(1, "#0a1a3a");
  }
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  if (prosperity >= 0.3) {
    const shimmerRand = seededRandom(777);
    for (let i = 0; i < 200; i++) {
      const sx = shimmerRand() * TEX_W;
      const sy = shimmerRand() * TEX_H;
      ctx.beginPath();
      ctx.ellipse(
        sx,
        sy,
        20 + shimmerRand() * 40,
        10 + shimmerRand() * 20,
        shimmerRand() * Math.PI,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "rgba(30, 80, 130, 0.15)";
      ctx.fill();
    }
  }
}

function buildContinents(prosperity: number): ContinentPoly[] {
  return CONTINENT_SPECS.map((spec) =>
    buildContinentPoly(spec.cx, spec.cy, spec.size, spec.seed)
  );
}

function createDayTexture(prosperity: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d")!;

  drawOceanBase(ctx, prosperity);

  CONTINENT_SPECS.forEach((spec) => {
    const poly = buildContinentPoly(spec.cx, spec.cy, spec.size, spec.seed);
    drawContinentFromPoly(ctx, poly, spec.cx, spec.cy, spec.size, prosperity, spec.seed + 9000);
  });

  ctx.beginPath();
  ctx.rect(0, 470, TEX_W, 42);
  ctx.fillStyle = "rgba(220,235,255,0.7)";
  ctx.fill();

  ctx.fillStyle = prosperity > 0.3 ? "rgba(235,245,255,0.65)" : "rgba(200,210,220,0.35)";
  ctx.beginPath();
  ctx.ellipse(TEX_W / 2, 12, TEX_W * 0.28, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function cityLightCount(prosperity: number): number {
  if (prosperity < 0.3) return 3 + Math.floor(Math.random() * 4);
  if (prosperity < 0.6) return 25 + Math.floor(Math.random() * 20);
  if (prosperity < 0.8) return 80 + Math.floor(Math.random() * 40);
  return 150 + Math.floor(Math.random() * 80);
}

function createNightTexture(prosperity: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  const continents = buildContinents(prosperity);
  const count = cityLightCount(prosperity);
  const lightRand = seededRandom(Math.floor(prosperity * 10000) + 42);
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < count * 50) {
    attempts++;
    const lx = lightRand() * TEX_W;
    const ly = 20 + lightRand() * (TEX_H - 80);
    if (!isLandPixel(lx, ly, continents)) continue;

    const lightSize = 1 + lightRand() * 2;
    ctx.beginPath();
    ctx.arc(lx, ly, lightSize, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, ${180 + Math.floor(lightRand() * 75)}, 50, ${0.6 + lightRand() * 0.4})`;
    ctx.fill();
    placed++;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function createCloudTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, TEX_W, TEX_H);

  for (let band = 0; band < 8; band++) {
    const cy = (0.15 + band * 0.1) * TEX_H;
    for (let i = 0; i < 18; i++) {
      const cx = Math.random() * TEX_W;
      const len = 80 + Math.random() * 160;
      const angle = (Math.random() - 0.5) * 0.4;
      ctx.save();
      ctx.translate(cx, cy + (Math.random() - 0.5) * 40);
      ctx.rotate(angle);
      const g = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.3, "rgba(255,255,255,0.45)");
      g.addColorStop(0.5, "rgba(255,255,255,0.65)");
      g.addColorStop(0.7, "rgba(255,255,255,0.45)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(-len / 2, -8 - Math.random() * 12, len, 16 + Math.random() * 20);
      ctx.restore();
    }
  }

  for (let i = 0; i < 60; i++) {
    const x = Math.random() * TEX_W;
    const y = Math.random() * TEX_H;
    const r = 25 + Math.random() * 45;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function createStarSprite(): THREE.CanvasTexture {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.15, "rgba(255,255,255,0.85)");
  g.addColorStop(0.4, "rgba(255,255,255,0.2)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function createSatellite(): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x888899,
    metalness: 0.85,
    roughness: 0.25,
  });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x2244aa,
    metalness: 0.6,
    roughness: 0.35,
    emissive: 0x112244,
    emissiveIntensity: 0.15,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.035), bodyMat);
  const panelL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.07), panelMat);
  panelL.position.x = -0.075;
  const panelR = panelL.clone();
  panelR.position.x = 0.075;
  const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.04), bodyMat);
  antenna.position.y = 0.03;
  group.add(body, panelL, panelR, antenna);
  return group;
}

function satelliteCount(prosperity: number): number {
  if (prosperity < 0.3) return 0;
  if (prosperity < 0.6) return 1;
  if (prosperity < 0.8) return 2;
  return 3;
}

const PLANET_VERT = `
varying vec2 vUv;
varying vec3 vNormalW;
void main() {
  vUv = uv;
  vNormalW = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PLANET_FRAG = `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform vec3 sunDirection;
varying vec2 vUv;
varying vec3 vNormalW;
void main() {
  vec3 sunDir = normalize(sunDirection);
  float ndl = dot(normalize(vNormalW), sunDir);
  float dayFactor = smoothstep(-0.15, 0.35, ndl);
  vec3 dayCol = texture2D(dayMap, vUv).rgb;
  vec3 nightCol = texture2D(nightMap, vUv).rgb;
  vec3 col = mix(nightCol * 1.35, dayCol, dayFactor);
  gl_FragColor = vec4(col, 1.0);
}
`;

const ATMOS_VERT = `
varying vec3 vNormalW;
void main() {
  vNormalW = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ATMOS_FRAG = `
uniform vec3 glowColor;
uniform float intensity;
uniform float aurora;
uniform float time;
varying vec3 vNormalW;
void main() {
  vec3 n = normalize(vNormalW);
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  float fresnel = 1.0 - max(dot(n, viewDir), 0.0);
  float equator = 1.0 - abs(n.y) * 0.65;
  float rim = pow(fresnel, 2.2) * equator * intensity;
  float auroraWave = sin(n.x * 14.0 + time * 0.8) * 0.5 + 0.5;
  float polar = pow(abs(n.y), 0.35);
  vec3 auroraCol = vec3(0.25, 0.95, 0.55) * aurora * auroraWave * polar * rim * 1.5;
  vec3 col = glowColor * rim + auroraCol;
  gl_FragColor = vec4(col, rim * 0.55 + aurora * polar * 0.15);
}
`;

export interface PlanetVisualizationProps {
  prosperity: number;
  height?: number;
}

export function PlanetVisualization({ prosperity, height = 400 }: PlanetVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    camera.position.set(0, 0, 3.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, height);
    container.appendChild(renderer.domElement);

    const starSprite = createStarSprite();
    const starCount = 2000;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 40 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);
      const tint = Math.random();
      if (tint < 0.15) {
        starCol[i * 3] = 0.7;
        starCol[i * 3 + 1] = 0.85;
        starCol[i * 3 + 2] = 1.0;
      } else if (tint < 0.3) {
        starCol[i * 3] = 1.0;
        starCol[i * 3 + 1] = 0.95;
        starCol[i * 3 + 2] = 0.75;
      } else {
        starCol[i * 3] = 1.0;
        starCol[i * 3 + 1] = 1.0;
        starCol[i * 3 + 2] = 1.0;
      }
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        size: 1.0,
        sizeAttenuation: true,
        map: starSprite,
        transparent: true,
        opacity: 0.92,
        vertexColors: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    scene.add(stars);

    const p = Math.max(0, Math.min(1, prosperity));
    const dayTex = createDayTexture(p);
    const nightTex = createNightTexture(p);
    const cloudTex = createCloudTexture();

    const sunDirection = new THREE.Vector3(0.8, 0.35, 0.5).normalize();

    const planetMat = new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: dayTex },
        nightMap: { value: nightTex },
        sunDirection: { value: sunDirection },
      },
      vertexShader: PLANET_VERT,
      fragmentShader: PLANET_FRAG,
    });

    const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), planetMat);
    scene.add(planet);

    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.015, 64, 64),
      new THREE.MeshPhongMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      })
    );
    scene.add(clouds);

    const glowColor =
      p < 0.3
        ? new THREE.Color(0.35, 0.12, 0.08)
        : p < 0.6
          ? new THREE.Color(0.2, 0.45, 0.85)
          : new THREE.Color(0.35, 0.65, 1.0);
    const atmosIntensity = p < 0.3 ? 0.12 : p < 0.6 ? 0.28 : 0.38 + p * 0.25;

    const atmosMat = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: glowColor },
        intensity: { value: atmosIntensity },
        aurora: { value: p >= 0.8 ? 1.0 : 0 },
        time: { value: 0 },
      },
      vertexShader: ATMOS_VERT,
      fragmentShader: ATMOS_FRAG,
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 64), atmosMat);
    scene.add(atmosphere);

    scene.add(new THREE.AmbientLight(0x111122, 0.05));
    const sun = new THREE.DirectionalLight(0xfff8ee, 2.2);
    sun.position.copy(sunDirection.clone().multiplyScalar(8));
    scene.add(sun);

    const satMeshes: THREE.Object3D[] = [];
    const satOrbits: { pivot: THREE.Group; speed: number; angle: number }[] = [];
    const nSats = satelliteCount(p);
    for (let i = 0; i < nSats; i++) {
      const sat = createSatellite();
      const pivot = new THREE.Group();
      pivot.rotation.x = (Math.PI / 5) * (i + 1) + i * 0.4;
      pivot.rotation.y = i * 1.7;
      sat.position.set(1.28 + i * 0.06, 0, 0);
      pivot.add(sat);
      scene.add(pivot);
      satMeshes.push(sat);
      const period = 30 + i * 7.5;
      satOrbits.push({ pivot, speed: (Math.PI * 2) / period, angle: i * 2.1 });
    }

    const planetRotSpeed = (Math.PI * 2) / 120;
    const cloudRotSpeed = (Math.PI * 2) / 90;

    let animId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      const delta = clock.getDelta();

      planet.rotation.y += planetRotSpeed * delta;
      clouds.rotation.y += cloudRotSpeed * delta;

      atmosMat.uniforms.time.value = t;

      satOrbits.forEach((o) => {
        o.angle += o.speed * delta;
        o.pivot.rotation.z = o.angle;
      });

      camera.position.y = Math.sin(t * 0.4) * 0.002;
      camera.position.x = Math.cos(t * 0.25) * 0.002;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = container.clientWidth;
      if (w <= 0) return;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
      renderer.setPixelRatio(window.devicePixelRatio);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);
    onResize();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      renderer.dispose();
      planet.geometry.dispose();
      planetMat.dispose();
      dayTex.dispose();
      nightTex.dispose();
      cloudTex.dispose();
      starSprite.dispose();
      clouds.geometry.dispose();
      (clouds.material as THREE.Material).dispose();
      atmosphere.geometry.dispose();
      atmosMat.dispose();
      starGeo.dispose();
      (stars.material as THREE.Material).dispose();
      satMeshes.forEach((sat) => {
        sat.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        });
      });
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [height, prosperity]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height,
        overflow: "hidden",
        background: "#000000",
        borderRadius: 8,
      }}
    />
  );
}
