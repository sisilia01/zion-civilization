"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createCometVfx } from "./vfx/cometVfx";

export function computeProsperity({
  unemployment = 0,
  revolution = 0,
  poverty = 0,
  population = 0,
}) {
  const employScore = Math.max(0, 1 - unemployment / 100);
  const stabilityScore = Math.max(0, 1 - revolution / 100);
  const wealthScore = Math.max(0, 1 - poverty / 100);
  const popScore = Math.min(1, population / 20000);
  return employScore * 0.35 + stabilityScore * 0.25 + wealthScore * 0.25 + popScore * 0.15;
}

/** Same scale as computeProsperity popScore — 0..1 normalized population. */
export function normalizePopulation(population = 0) {
  return Math.min(1, Math.max(0, population / 20000));
}

/** Polar aurora on planet surface only — off by default (atmosphere aurora reads as a solid green pole). */
const USE_AURORA = false;

const AURORA_NOISE_GLSL = USE_AURORA
  ? `
  float auroraPole = smoothstep(0.84, 0.97, lat);
  float auroraNight = nightSide * smoothstep(0.15, 0.5, nightSide);
  float auroraBand = auroraPole * auroraNight;
  float ribbonA = abs(sin(dot(vPosition.xz, vec2(11.0, 7.0)) + uTime * 0.75));
  float ribbonB = abs(sin(vPosition.x * 19.0 - vPosition.z * 15.0 + uTime * 0.45));
  float ribbons = smoothstep(0.78, 1.0, ribbonA * ribbonB);
  float shimmer = 0.35 + 0.65 * sin(uTime * 0.55 + lat * 18.0 + dot(vPosition.xz, vec2(6.0, 4.0)));
  vec3 auroraTint = mix(vec3(0.1, 0.62, 0.38), vec3(0.18, 0.55, 0.72), sin(uTime * 0.22 + lat * 8.0) * 0.5 + 0.5);
  color += auroraTint * auroraBand * ribbons * shimmer * 0.07;
`
  : "";

const AURORA_TEXTURED_GLSL = USE_AURORA
  ? `
  float auroraPole = smoothstep(0.84, 0.97, poleLat);
  float auroraNight = nightSide * smoothstep(0.15, 0.5, nightSide);
  float auroraBand = auroraPole * auroraNight;
  float ribbonA = abs(sin(N.x * 22.0 + N.z * 14.0 + uTime * 0.75));
  float ribbonB = abs(sin(N.x * 17.0 - N.z * 21.0 + uTime * 0.42));
  float ribbons = smoothstep(0.78, 1.0, ribbonA * ribbonB);
  float shimmer = 0.35 + 0.65 * sin(uTime * 0.55 + poleLat * 18.0 + N.x * 9.0);
  vec3 auroraTint = mix(vec3(0.1, 0.62, 0.38), vec3(0.18, 0.55, 0.72), sin(uTime * 0.22 + N.z * 7.0) * 0.5 + 0.5);
  surface += auroraTint * auroraBand * ribbons * shimmer * 0.07;
`
  : "";

const NOISE_GLSL = `
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
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 7; i++) {
    if (i >= octaves) break;
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

float ridged(vec3 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 7; i++) {
    if (i >= octaves) break;
    value += amplitude * (1.0 - abs(snoise(p * frequency)));
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}
`;

const PLANET_FRAG = `
uniform float uProsperity;
uniform vec3 uLightDir;
uniform float uTime;
uniform vec3 uCameraPos;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vPosition;

${NOISE_GLSL}

void main() {
  float lat = abs(vPosition.y);
  float latJitter = snoise(vPosition * 1.2 + vec3(180.0)) * 0.05;
  float adjLat = lat + latJitter;

  float continentNoise = fbm(vPosition * 1.6 + vec3(10.0), 5);
  float seaLevel = mix(0.05, -0.02, uProsperity);
  float coastNoise = snoise(vPosition * 14.0 + vec3(500.0, 120.0, 340.0)) * 0.014;
  coastNoise += snoise(vPosition * 24.0 + vec3(720.0, 280.0, 110.0)) * 0.009;
  float coastDetail = fbm(vPosition * 20.0 + vec3(333.0, 777.0, 111.0), 6);
  float landMask = smoothstep(-0.025, 0.14, continentNoise - seaLevel + coastNoise + coastDetail * 0.028);

  float elev = fbm(vPosition * 2.8 + vec3(40.0), 4);
  float ridge = ridged(vPosition * 3.8 + vec3(70.0), 4);
  float mountains = smoothstep(0.52, 0.78, ridge) * landMask;

  vec3 tropicalForest = vec3(0.04, 0.44, 0.10);
  vec3 tropicalDesert = vec3(0.82, 0.58, 0.22);
  vec3 temperateLand = vec3(0.18, 0.52, 0.18);
  vec3 borealLand = vec3(0.22, 0.42, 0.18);
  vec3 tundraLand = vec3(0.52, 0.50, 0.38);
  vec3 polarIce = vec3(0.93, 0.96, 0.99);

  float equatorW = 1.0 - smoothstep(0.0, 0.16, adjLat);
  float desertBelt = smoothstep(0.14, 0.24, adjLat) * (1.0 - smoothstep(0.26, 0.36, adjLat));
  float tempBelt = smoothstep(0.28, 0.38, adjLat) * (1.0 - smoothstep(0.52, 0.62, adjLat));
  float borealBelt = smoothstep(0.50, 0.60, adjLat) * (1.0 - smoothstep(0.68, 0.78, adjLat));
  float tundraBelt = smoothstep(0.66, 0.76, adjLat) * (1.0 - smoothstep(0.80, 0.90, adjLat));
  float polarBelt = smoothstep(0.78, 0.88, adjLat);

  vec3 biome = tropicalForest * equatorW;
  float desertPatch = smoothstep(0.68, 0.86, fbm(vPosition * 2.0 + vec3(120.0), 3));
  biome = mix(biome, tropicalDesert, desertBelt * desertPatch);
  biome = mix(biome, temperateLand, tempBelt);
  biome = mix(biome, borealLand, borealBelt);
  biome = mix(biome, tundraLand, tundraBelt);
  biome = mix(biome, polarIce, polarBelt);

  vec3 deadTint = vec3(0.36, 0.28, 0.18);
  vec3 landColor = mix(deadTint, biome, mix(0.4, 1.0, uProsperity));
  float landLuma = dot(landColor, vec3(0.299, 0.587, 0.114));
  landColor = mix(vec3(landLuma), landColor, 1.22);
  landColor = clamp(landColor, 0.0, 1.0);

  landColor = mix(landColor, vec3(0.40, 0.36, 0.30), mountains * 0.65);
  landColor = mix(landColor, vec3(0.94, 0.96, 0.99), smoothstep(0.72, 0.90, ridge) * mountains * 0.8);

  float rainShadow = mountains * smoothstep(0.18, 0.32, adjLat);
  landColor = mix(landColor, vec3(0.76, 0.63, 0.36), rainShadow * 0.35);

  float lakeMask = smoothstep(0.34, 0.40, elev) * (1.0 - smoothstep(0.40, 0.46, elev));
  lakeMask *= smoothstep(0.74, 0.88, fbm(vPosition * 4.5 + vec3(95.0), 2)) * landMask;
  vec3 lakeColor = vec3(0.10, 0.32, 0.52);
  landColor = mix(landColor, lakeColor, lakeMask);

  float riverRidge = ridged(vPosition * 5.5 + vec3(160.0), 3);
  float river = smoothstep(0.90, 0.96, riverRidge) * smoothstep(0.48, 0.72, ridge) * landMask;
  landColor = mix(landColor, vec3(0.07, 0.26, 0.36), river * 0.55);

  float deepFactor = smoothstep(0.12, 0.50, continentNoise) * (1.0 - landMask);
  vec3 deepOcean = mix(vec3(0.01, 0.05, 0.18), vec3(0.015, 0.10, 0.28), uProsperity);
  vec3 shallowTurquoise = vec3(0.10, 0.42, 0.52);
  vec3 midOcean = mix(vec3(0.03, 0.16, 0.36), vec3(0.05, 0.22, 0.46), uProsperity);

  float coastFBM = fbm(vPosition * 22.0 + vec3(180.0, 420.0, 90.0), 6);
  float shelfRim = smoothstep(0.475, 0.495, landMask) * (1.0 - smoothstep(0.495, 0.512, landMask));
  float coastBand = (1.0 - landMask) * smoothstep(0.30, 0.50, landMask + coastFBM * 0.04 + 0.04);
  float depthFromCoast = coastBand * 0.82 + shelfRim * 0.98;
  vec3 oceanColor = mix(deepOcean, shallowTurquoise, depthFromCoast);
  oceanColor = mix(oceanColor, midOcean, deepFactor * 0.42 * (1.0 - depthFromCoast));
  oceanColor = mix(oceanColor, shallowTurquoise * 1.12, shelfRim);

  float delta = river * smoothstep(0.46, 0.54, 1.0 - landMask);
  oceanColor = mix(oceanColor, vec3(0.52, 0.54, 0.46), delta * 0.45);

  landColor = mix(landColor, polarIce, polarBelt * landMask * 0.85);
  oceanColor = mix(oceanColor, vec3(0.82, 0.88, 0.94), polarBelt * (1.0 - landMask) * 0.6);

  float micro = fbm(vPosition * 11.0 + vec3(240.0), 3);
  float microDetail = fbm(vPosition * 19.0 + vec3(891.0, 234.0, 567.0), 3);
  landColor *= 0.965 + micro * 0.07 + microDetail * 0.05;
  oceanColor *= 0.97 + micro * 0.04;
  float microIslands = smoothstep(0.49, 0.535, fbm(vPosition * 9.0 + vec3(310.0), 4) + coastNoise * 0.5);
  oceanColor = mix(oceanColor, landColor, microIslands * (1.0 - landMask) * coastBand * 0.55);

  vec3 N = normalize(vNormal);
  float bumpLow = fbm(vPosition * 7.0 + vec3(55.0), 4) * landMask;
  float bumpHi = fbm(vPosition * 15.0 + vec3(891.0, 234.0, 567.0), 3) * landMask * 0.45;
  float bump = bumpLow + ridge * 0.4 + bumpHi;
  N = normalize(N + vPosition * (bump - 0.5) * 0.22);
  vec3 L = normalize(uLightDir);
  vec3 V = normalize(uCameraPos - vWorldPos);
  float intensity = dot(N, L);
  float dayAmount = smoothstep(-0.04, 0.14, intensity);
  float nightSide = 1.0 - smoothstep(-0.02, 0.06, intensity);
  float twilight = smoothstep(-0.1, 0.0, intensity) * (1.0 - smoothstep(0.0, 0.1, intensity));

  vec3 shadowShift = L * 0.045;
  float cumulus = fbm((vPosition - shadowShift) * 4.5 + vec3(300.0, uTime * 0.018, 0.0), 5);
  float cloudShadow = smoothstep(0.08, 0.48, cumulus) * 0.62;
  cloudShadow *= mix(0.08, 0.88, uProsperity) * dayAmount;

  float habitable = clamp(tempBelt + equatorW * 0.55, 0.0, 1.0);
  float coastalBias = smoothstep(0.38, 0.58, fbm(vPosition * 3.2 + vec3(80.0), 3));
  float cityNoise = fbm(vPosition * 14.0 + vec3(120.0, 40.0, 0.0), 4);
  float cityCluster = smoothstep(mix(0.68, 0.52, uProsperity), mix(0.76, 0.62, uProsperity), cityNoise);
  float cityMask = cityCluster * landMask * habitable * (0.45 + coastalBias * 0.55);
  cityMask *= smoothstep(0.08, 0.3, uProsperity);
  cityMask *= mix(0.35, 1.0, smoothstep(0.82, 0.96, fbm(vPosition * 18.0 + vec3(200.0), 2)));

  float surfaceLand = max(landMask, lakeMask);
  vec3 surfaceColor = mix(oceanColor, landColor, surfaceLand);

  vec3 H = normalize(L + V);
  vec3 T = normalize(cross(N, L));
  float ripple = fbm(vPosition * 95.0 + vec3(uTime * 0.25, 0.0, uTime * 0.18), 4);
  float ripple2 = fbm(vPosition * 140.0 + vec3(0.0, uTime * 0.35, uTime * 0.12), 3);
  float brokenRipple = ripple * 0.65 + ripple2 * 0.35;
  float specBase = pow(max(dot(N, H), 0.0), 72.0) * (1.0 - surfaceLand);
  float aniso = pow(max(abs(dot(H, T)), 0.0), 4.5);
  float spec = specBase * (0.35 + 0.65 * brokenRipple) * (0.3 + 0.7 * aniso);
  spec *= dayAmount * max(intensity, 0.0) * mix(0.35, 1.0, uProsperity);
  vec3 specular = vec3(1.0, 0.98, 0.92) * spec * 0.65;

  vec3 R = reflect(-L, N);
  float glintStreak = pow(max(abs(dot(normalize(R - N * dot(R, N)), T)), 0.0), 2.0);
  float glintRipple = 0.55 + 0.45 * sin(dot(vPosition, L) * 180.0 + uTime * 2.4 + brokenRipple * 6.0);
  float glintCore = pow(max(dot(R, V), 0.0), 80.0) * glintStreak;
  float sunGlint = glintCore * glintRipple * (0.55 + 0.45 * aniso);
  sunGlint *= (1.0 - surfaceLand) * dayAmount * smoothstep(0.08, 0.38, intensity);
  vec3 glintCol = vec3(0.82, 0.92, 0.98) * sunGlint * 1.8;

  float waterFresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.5);
  vec3 skyReflect = vec3(0.28, 0.48, 0.72) * waterFresnel * (1.0 - surfaceLand) * dayAmount * 0.32;

  vec3 dayCol = surfaceColor * max(intensity, 0.0) * 1.08 + specular + glintCol + skyReflect;
  dayCol *= 1.0 - cloudShadow * 0.32;

  vec3 earthshineCol = vec3(0.02, 0.025, 0.06) + surfaceColor * 0.03;
  vec3 cityLights = cityMask * uProsperity * vec3(1.0, 0.85, 0.5) * 3.5 * nightSide;

  vec3 nightCol = earthshineCol + cityLights;
  vec3 color = mix(nightCol, dayCol, dayAmount);
  color += vec3(1.0, 0.48, 0.14) * twilight * 0.08;
  color += cityMask * vec3(1.0, 0.65, 0.28) * twilight * 0.03 * uProsperity;
${AURORA_NOISE_GLSL}
  float limbFog = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
  vec3 limbHaze = mix(vec3(0.02, 0.05, 0.1), vec3(0.04, 0.08, 0.14), uProsperity);
  color = mix(color, color * 0.82 + limbHaze, limbFog * 0.32);

  gl_FragColor = vec4(color, 1.0);
}
`;

const PLANET_VERT = `
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vPosition;
void main() {
  vPosition = normalize(position);
  vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CLOUD_LOW_FRAG = `
uniform float uProsperity;
uniform vec3 uLightDir;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPosition;
${NOISE_GLSL}

float cyclonePattern(vec3 p, vec2 center, float spin) {
  vec2 d = p.xz - center;
  float r = length(d);
  float angle = atan(d.y, d.x) + r * spin + uTime * 0.0008;
  return fbm(vec3(cos(angle) * r, p.y * 0.8, sin(angle) * r) * 3.0 + vec3(500.0), 6);
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uLightDir);
  float intensity = dot(N, L);
  float dayAmount = smoothstep(-0.04, 0.14, intensity);
  float nightSide = 1.0 - smoothstep(-0.02, 0.06, intensity);
  float twilight = smoothstep(-0.08, 0.0, intensity) * (1.0 - smoothstep(0.0, 0.08, intensity));

  vec3 drift = vec3(uTime * 0.00028, uTime * 0.00018, uTime * 0.00014);
  float cumulus = fbm(vPosition * 5.5 + vec3(300.0) + drift, 7);
  float cyclone1 = cyclonePattern(vPosition, vec2(0.32, -0.18), 6.2);
  float cyclone2 = cyclonePattern(vPosition, vec2(-0.48, 0.42), 5.6);
  float cycloneMask = smoothstep(0.42, 0.66, cyclone1) * 0.6 + smoothstep(0.44, 0.68, cyclone2) * 0.5;

  float density = smoothstep(0.02, 0.36, cumulus);
  density *= smoothstep(1.0, 0.48, cumulus);
  density = density * 0.65 + cycloneMask * 0.42;
  density = smoothstep(0.0, 0.55, density);
  density *= mix(0.06, 0.94, uProsperity);

  vec3 cloudCol = mix(vec3(0.12, 0.14, 0.22), vec3(0.98, 0.99, 1.0), smoothstep(-0.02, 0.34, intensity));
  cloudCol = mix(cloudCol, vec3(0.40, 0.48, 0.58), nightSide * 0.75);
  cloudCol += vec3(1.0, 0.55, 0.28) * twilight * 0.24;

  float rim = pow(1.0 - max(dot(N, L), 0.0), 2.0) * dayAmount;
  cloudCol += vec3(0.90, 0.94, 1.0) * rim * density * 0.48;

  float alpha = density * mix(0.16, 0.55, uProsperity) * mix(0.28, 1.0, dayAmount);
  alpha *= smoothstep(0.0, 0.18, density);
  gl_FragColor = vec4(cloudCol * mix(0.1, 1.0, dayAmount), alpha);
}
`;

const CLOUD_HIGH_FRAG = `
uniform float uProsperity;
uniform vec3 uLightDir;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vPosition;
${NOISE_GLSL}

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uLightDir);
  float intensity = dot(N, L);
  float dayAmount = smoothstep(-0.04, 0.14, intensity);
  float nightSide = 1.0 - smoothstep(-0.02, 0.06, intensity);
  float twilight = smoothstep(-0.08, 0.0, intensity) * (1.0 - smoothstep(0.0, 0.08, intensity));
  float latStretch = abs(vPosition.y);

  vec3 drift = vec3(uTime * 0.00044, uTime * 0.00022, uTime * 0.00036);
  float cirrus = fbm(vPosition * vec3(11.0, 2.8, 11.0) + vec3(420.0) + drift, 7);
  cirrus = smoothstep(0.50, 0.78, cirrus + latStretch * 0.14);
  cirrus *= smoothstep(1.0, 0.62, cirrus + latStretch * 0.08);
  float density = cirrus * mix(0.05, 0.52, uProsperity);
  density = smoothstep(0.0, 0.45, density);

  vec3 cloudCol = mix(vec3(0.14, 0.16, 0.24), vec3(0.92, 0.94, 0.98), smoothstep(-0.02, 0.28, intensity));
  cloudCol = mix(cloudCol, vec3(0.35, 0.40, 0.52), nightSide * 0.8);
  cloudCol += vec3(1.0, 0.48, 0.20) * twilight * 0.18;

  float rim = pow(1.0 - max(dot(N, L), 0.0), 2.6) * dayAmount;
  cloudCol += vec3(0.86, 0.91, 0.97) * rim * density * 0.38;

  float alpha = density * mix(0.05, 0.18, uProsperity) * mix(0.15, 0.75, dayAmount);
  alpha *= smoothstep(0.0, 0.22, density);
  gl_FragColor = vec4(cloudCol * mix(0.08, 1.0, dayAmount), alpha);
}
`;

const CLOUD_VERT = `
varying vec3 vNormal;
varying vec3 vPosition;
void main() {
  vPosition = normalize(position);
  vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ATMOS_FRAG = `
uniform float uProsperity;
uniform float uTime;
uniform vec3 uCameraPos;
uniform vec3 uLightDir;
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
  vec3 N = normalize(vNormal);
  vec3 camDir = normalize(vWorldPos - uCameraPos);
  float rim = 1.0 - clamp(dot(N, camDir), 0.0, 1.0);
  float fres = pow(rim, 4.6);

  vec3 atmoColor = vec3(0.3, 0.55, 1.0);
  float sunFacing = dot(N, normalize(uLightDir));
  float dayMask = smoothstep(-0.05, 0.45, sunFacing);

  vec3 col = atmoColor * fres * 0.72;
  col *= mix(0.45, 1.0, dayMask);
  float alpha = fres * 0.28 * mix(0.35, 1.0, dayMask);

  gl_FragColor = vec4(col, alpha);
}
`;

const ATMOS_VERT = `
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
  vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const STAR_VERT = `
attribute float aPhase;
attribute float aSize;
attribute float aBright;
attribute float aMilky;
attribute float aFreq;
varying vec3 vColor;
varying float vPhase;
varying float vBright;
varying float vMilky;
varying float vFreq;
uniform float uTime;
void main() {
  vColor = color;
  vPhase = aPhase;
  vBright = aBright;
  vMilky = aMilky;
  vFreq = aFreq;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float isHero = smoothstep(0.55, 0.9, aBright);
  float amp = mix(0.30, 0.40, isHero);
  float freq = mix(aFreq, aFreq * 0.42, isHero);
  float wave = sin(uTime * freq + aPhase);
  float twinkle = 1.0 - amp * 0.5 * (1.0 - wave);
  gl_PointSize = aSize * (0.9 + 0.1 * twinkle) * (280.0 / -mvPosition.z) * (1.0 + aMilky * 0.3);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const STAR_FRAG = `
varying vec3 vColor;
varying float vPhase;
varying float vBright;
varying float vMilky;
varying float vFreq;
uniform float uTime;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float core = exp(-d * d * 16.0);
  float isHero = smoothstep(0.55, 0.9, vBright);
  float amp = mix(0.32, 0.42, isHero);
  float freq = mix(vFreq, vFreq * 0.42, isHero);
  float wave = sin(uTime * freq + vPhase);
  float twinkle = 1.0 - amp * 0.5 * (1.0 - wave);
  float halo = vBright * exp(-d * d * 6.0) * 0.28;
  float alpha = (core + halo) * twinkle;
  vec3 col = vColor * (1.0 + vBright * 0.35);
  gl_FragColor = vec4(col * twinkle, alpha);
}
`;

const UNSHARP_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uAmount: { value: 0.2 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uAmount;
    varying vec2 vUv;
    void main() {
      vec2 px = 1.0 / uResolution;
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec3 blur = (
        texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb +
        texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb +
        texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb +
        texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb
      ) * 0.25;
      gl_FragColor = vec4(clamp(c + (c - blur) * uAmount, 0.0, 1.0), 1.0);
    }
  `,
};

function createFoilNormalMap() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = Math.sin(x * 0.45) * Math.cos(y * 0.38) * 0.5 + Math.random() * 0.15;
      const i = (y * size + x) * 4;
      img.data[i] = Math.floor((n * 0.5 + 0.5) * 255);
      img.data[i + 1] = Math.floor(128 + n * 40);
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 16;
  return tex;
}

function markShadows(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

function markDepth(mesh) {
  mesh.traverse((child) => {
    if (!child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((m) => {
      m.depthTest = true;
      if (!m.transparent) m.depthWrite = true;
    });
  });
}

/** @param {THREE.Material} planetMat */
function forceOpaquePlanetMaterial(planetMat) {
  planetMat.transparent = false;
  planetMat.opacity = 1.0;
  planetMat.depthWrite = true;
  planetMat.depthTest = true;
  planetMat.blending = THREE.NormalBlending;
  planetMat.side = THREE.FrontSide;
  planetMat.needsUpdate = true;
  console.log(
    "planet mat:",
    planetMat.transparent,
    planetMat.opacity,
    planetMat.depthWrite,
    planetMat.depthTest,
    planetMat.blending
  );
  console.log("day map:", planetMat.map);
}

/** @type {THREE.CanvasTexture | null} */
let solarCellGridTexCache = null;
/** @type {THREE.CanvasTexture | null} */
let zionDecalTexCache = null;
/** @type {THREE.CanvasTexture | null} */
let flagDecalTexCache = null;

function createSolarCellGridTexture() {
  if (solarCellGridTexCache) return solarCellGridTexCache;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#101028";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(90, 100, 140, 0.42)";
    ctx.lineWidth = 1;
    const cols = 10;
    const rows = 4;
    for (let c = 0; c <= cols; c++) {
      const x = (c / cols) * size;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    for (let r = 0; r <= rows; r++) {
      const y = (r / rows) * size;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(120, 160, 220, 0.08)";
    ctx.fillRect(0, 0, size, size);
  }
  solarCellGridTexCache = new THREE.CanvasTexture(canvas);
  solarCellGridTexCache.colorSpace = THREE.SRGBColorSpace;
  solarCellGridTexCache.wrapS = solarCellGridTexCache.wrapT = THREE.RepeatWrapping;
  solarCellGridTexCache.repeat.set(2, 1);
  solarCellGridTexCache.anisotropy = 8;
  return solarCellGridTexCache;
}

function createZionDecalTexture() {
  if (zionDecalTexCache) return zionDecalTexCache;
  const w = 256;
  const h = 96;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(40, 34, 12, 0.35)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#b8941f";
    ctx.font = "700 52px Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ZION", w / 2, h / 2 + 2);
  }
  zionDecalTexCache = new THREE.CanvasTexture(canvas);
  zionDecalTexCache.colorSpace = THREE.SRGBColorSpace;
  zionDecalTexCache.anisotropy = 8;
  return zionDecalTexCache;
}

function createFlagDecalTexture() {
  if (flagDecalTexCache) return flagDecalTexCache;
  const w = 128;
  const h = 80;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const stripeH = h / 13;
    for (let i = 0; i < 13; i++) {
      ctx.fillStyle = i % 2 === 0 ? "#b22234" : "#ffffff";
      ctx.fillRect(0, i * stripeH, w, stripeH + 1);
    }
    const cantonW = w * 0.42;
    const cantonH = stripeH * 7;
    ctx.fillStyle = "#3c3b6e";
    ctx.fillRect(0, 0, cantonW, cantonH);
    ctx.fillStyle = "#ffffff";
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 6; col++) {
        const sx = 8 + col * 9 + (row % 2 ? 4.5 : 0);
        const sy = 6 + row * 8;
        if (sx < cantonW - 2) {
          ctx.beginPath();
          ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  flagDecalTexCache = new THREE.CanvasTexture(canvas);
  flagDecalTexCache.colorSpace = THREE.SRGBColorSpace;
  flagDecalTexCache.anisotropy = 8;
  return flagDecalTexCache;
}

/** @param {-1 | 1} side left (-1) or right (+1) wing along local X */
function createHeroSolarPanel(side) {
  const panelGroup = new THREE.Group();
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x142d5c,
    metalness: 0.6,
    roughness: 0.2,
    emissive: 0x0a1830,
    emissiveIntensity: 0.08,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x080810, metalness: 0.9, roughness: 0.35 });
  const panelW = 0.42;
  const panelH = 0.07;
  const panelT = 0.001;
  const base = new THREE.Mesh(new THREE.BoxGeometry(panelW, panelH, panelT, 24, 6, 1), panelMat);
  markShadows(base);
  panelGroup.add(base);
  for (let c = 1; c < 12; c++) {
    const vLine = new THREE.Mesh(new THREE.BoxGeometry(0.0005, panelH * 0.96, panelT * 1.6), frameMat);
    vLine.position.x = -panelW / 2 + (panelW / 12) * c;
    markShadows(vLine);
    panelGroup.add(vLine);
  }
  for (let r = 1; r < 4; r++) {
    const hLine = new THREE.Mesh(new THREE.BoxGeometry(panelW * 0.98, 0.0005, panelT * 1.6), frameMat);
    hLine.position.y = -panelH / 2 + (panelH / 4) * r;
    markShadows(hLine);
    panelGroup.add(hLine);
  }
  panelGroup.position.x = side * (0.11 + panelW / 2);
  panelGroup.userData.panelMat = panelMat;
  return panelGroup;
}

/** @param {Date} date */
function getDayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const now = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((now - start) / 86400000);
}

/** Real-world subsolar direction for current UTC (Y = north pole). @param {THREE.Vector3} out */
function updateRealtimeSunDirection(out) {
  const now = new Date();
  const dayOfYear = getDayOfYear(now);
  const declination = ((23.45 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365.25);
  const utcHours =
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600 + now.getUTCMilliseconds() / 3600000;
  const subsolarLon = ((utcHours * 15 - 180) * Math.PI) / 180;
  const cosDec = Math.cos(declination);
  const sunX = cosDec * Math.cos(subsolarLon);
  const sunY = Math.sin(declination);
  const sunZ = cosDec * Math.sin(subsolarLon);
  // Sun position vector from Earth center (matches shader dot(N, sunDir) convention).
  return out.set(sunX, sunY, sunZ).normalize();
}

function createHeroSatellite() {
  const group = new THREE.Group();
  const foilMat = new THREE.MeshStandardMaterial({
    color: 0xd4af6a,
    metalness: 1.0,
    roughness: 0.25,
    normalMap: createFoilNormalMap(),
    normalScale: new THREE.Vector2(0.35, 0.35),
  });
  const structureMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.92, roughness: 0.28 });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.95, roughness: 0.35 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe8e8ee, metalness: 0.15, roughness: 0.55 });
  const sensorMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.4 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.11, 32, 8), foilMat);
  body.rotation.z = Math.PI / 2;
  markShadows(body);
  group.add(body);
  const capF = new THREE.Mesh(new THREE.SphereGeometry(0.038, 24, 16), foilMat);
  capF.position.x = 0.055;
  markShadows(capF);
  group.add(capF);
  const capB = new THREE.Mesh(new THREE.SphereGeometry(0.038, 24, 16), foilMat);
  capB.position.x = -0.055;
  markShadows(capB);
  group.add(capB);

  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.18, 16, 1), structureMat);
  boom.rotation.z = Math.PI / 2;
  markShadows(boom);
  group.add(boom);

  const panelL = createHeroSolarPanel(-1);
  const panelR = createHeroSolarPanel(1);
  group.add(panelL);
  group.add(panelR);

  const dishStem = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.04, 8), structureMat);
  dishStem.position.set(0, 0.06, 0.025);
  markShadows(dishStem);
  group.add(dishStem);
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.95, roughness: 0.18, side: THREE.DoubleSide })
  );
  dish.position.set(0, 0.085, 0.025);
  dish.rotation.x = -0.35;
  markShadows(dish);
  group.add(dish);

  const radL = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.09, 0.045, 1, 8, 4), whiteMat);
  radL.position.set(-0.04, -0.02, 0.04);
  markShadows(radL);
  group.add(radL);
  const radR = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.09, 0.045, 1, 8, 4), whiteMat);
  radR.position.set(0.04, -0.02, 0.04);
  markShadows(radR);
  group.add(radR);

  for (let i = 0; i < 3; i++) {
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.006, 0.006), sensorMat);
    cam.position.set(-0.02 + i * 0.02, 0.04, -0.035);
    markShadows(cam);
    group.add(cam);
  }

  const wireAngles = [
    [0.2, 0.3, 0.1],
    [0.5, -0.2, 0.4],
    [-0.3, 0.6, -0.1],
    [0.8, 0.1, -0.5],
  ];
  wireAngles.forEach(([rx, ry, rz], w) => {
    const wire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0004, 0.0004, 0.06 + w * 0.012, 4),
      w % 2 ? copperMat : foilMat
    );
    wire.position.set(-0.03 + w * 0.02, 0.02, 0.02);
    wire.rotation.set(rx, ry, rz);
    markShadows(wire);
    group.add(wire);
  });

  const navLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.0012, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xcc1100, transparent: true, opacity: 0.85 })
  );
  navLight.position.set(0.05, 0.025, 0.03);
  group.add(navLight);

  const satLight = new THREE.PointLight(0xa8c8ff, 0.12, 0.45);
  satLight.position.set(0, 0, 0);
  group.add(satLight);

  group.userData.panels = [panelL, panelR];
  group.userData.navLight = navLight;
  group.userData.satLight = satLight;
  group.userData.foilMat = foilMat;
  group.userData.dishMat = dish.material;
  group.scale.set(0.52, 0.52, 0.52);
  markDepth(group);
  return group;
}

/** @type {{ bodyGeo: THREE.BoxGeometry, panelGeo: THREE.BoxGeometry, armGeo: THREE.CylinderGeometry, bodyMat: THREE.MeshStandardMaterial, panelMat: THREE.MeshStandardMaterial, armMat: THREE.MeshStandardMaterial } | null} */
let distantSatPartsCache = null;

function getDistantSatParts() {
  if (distantSatPartsCache) return distantSatPartsCache;
  const bodyGeo = new THREE.BoxGeometry(0.034, 0.026, 0.026);
  const panelGeo = new THREE.BoxGeometry(0.13, 0.03, 0.001);
  const armGeo = new THREE.CylinderGeometry(0.001, 0.001, 0.024, 4);
  bodyGeo.userData.keepAlive = true;
  panelGeo.userData.keepAlive = true;
  armGeo.userData.keepAlive = true;
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    metalness: 0.55,
    roughness: 0.52,
  });
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x101030,
    metalness: 0.42,
    roughness: 0.38,
    emissive: 0x040810,
    emissiveIntensity: 0.03,
  });
  const armMat = new THREE.MeshStandardMaterial({
    color: 0x444444,
    metalness: 0.7,
    roughness: 0.42,
  });
  bodyMat.userData.keepAlive = true;
  panelMat.userData.keepAlive = true;
  armMat.userData.keepAlive = true;
  distantSatPartsCache = { bodyGeo, panelGeo, armGeo, bodyMat, panelMat, armMat };
  return distantSatPartsCache;
}

function createDistantSatellite() {
  const { bodyGeo, panelGeo, armGeo, bodyMat, panelMat, armMat } = getDistantSatParts();
  const group = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  markShadows(body);
  group.add(body);

  [-1, 1].forEach((side) => {
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(side * 0.024, 0, 0);
    markShadows(arm);
    group.add(arm);
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(side * 0.095, 0, 0);
    markShadows(panel);
    group.add(panel);
  });

  group.scale.set(0.14, 0.14, 0.14);
  group.userData.isDistant = true;
  markDepth(group);
  return group;
}

/** @type {THREE.CanvasTexture | null} */
let softStarTextureCache = null;

function getSoftStarTexture() {
  if (softStarTextureCache) return softStarTextureCache;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.18, "rgba(255,255,255,0.85)");
    g.addColorStop(0.45, "rgba(255,255,255,0.12)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  softStarTextureCache = new THREE.CanvasTexture(canvas);
  softStarTextureCache.colorSpace = THREE.SRGBColorSpace;
  return softStarTextureCache;
}

function buildStarLayerData({
  count,
  radius,
  radiusJitter = 4,
  sizeMin,
  sizeMax,
  sizePower = 2.8,
  brightChance = 0.02,
  heroCount = 0,
}) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const freqs = new Float32Array(count);
  const sizes = new Float32Array(count);
  const brights = new Float32Array(count);
  const milky = new Float32Array(count);

  const spectral = [
    { w: 0.08, r: 0.65, g: 0.78, b: 1.0 },
    { w: 0.14, r: 0.82, g: 0.88, b: 1.0 },
    { w: 0.20, r: 0.95, g: 0.95, b: 1.0 },
    { w: 0.25, r: 1.0, g: 0.98, b: 0.88 },
    { w: 0.18, r: 1.0, g: 0.85, b: 0.55 },
    { w: 0.15, r: 1.0, g: 0.55, b: 0.35 },
  ];

  for (let i = 0; i < count; i++) {
    const r = radius + (Math.random() - 0.5) * radiusJitter;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);

    let roll = Math.random();
    let spec = spectral[0];
    for (const s of spectral) {
      roll -= s.w;
      if (roll <= 0) {
        spec = s;
        break;
      }
    }
    colors[i * 3] = spec.r;
    colors[i * 3 + 1] = spec.g;
    colors[i * 3 + 2] = spec.b;

    phases[i] = Math.random() * Math.PI * 2;
    freqs[i] = 0.4 + Math.random() * 1.4;
    sizes[i] = sizeMin + Math.pow(Math.random(), sizePower) * (sizeMax - sizeMin);
    brights[i] = Math.random() < brightChance ? 0.75 + Math.random() * 0.25 : 0;
    milky[i] = 0;
  }

  const heroPalette = [
    { r: 0.72, g: 0.86, b: 1.0 },
    { r: 0.88, g: 0.94, b: 1.0 },
    { r: 1.0, g: 0.94, b: 0.72 },
    { r: 1.0, g: 0.82, b: 0.55 },
    { r: 0.78, g: 0.9, b: 1.0 },
    { r: 1.0, g: 0.88, b: 0.62 },
  ];
  const usedHero = new Set();
  for (let h = 0; h < heroCount; h++) {
    let idx = Math.floor(Math.random() * count);
    for (let guard = 0; guard < count && usedHero.has(idx); guard++) {
      idx = (idx + 1) % count;
    }
    usedHero.add(idx);
    const pal = heroPalette[h % heroPalette.length];
    colors[idx * 3] = pal.r;
    colors[idx * 3 + 1] = pal.g;
    colors[idx * 3 + 2] = pal.b;
    brights[idx] = 0.9 + Math.random() * 0.1;
    freqs[idx] = 0.32 + Math.random() * 0.38;
    sizes[idx] = Math.max(sizes[idx], sizeMax * 0.82);
  }

  return { positions, colors, phases, freqs, sizes, brights, milky };
}

function createStarPointsMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });
}

/** @param {ReturnType<typeof buildStarLayerData>} data @param {THREE.ShaderMaterial} material @param {number} renderOrder */
function createPointsFromStarData(data, material, renderOrder) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(data.phases, 1));
  geo.setAttribute("aFreq", new THREE.BufferAttribute(data.freqs, 1));
  geo.setAttribute("aSize", new THREE.BufferAttribute(data.sizes, 1));
  geo.setAttribute("aBright", new THREE.BufferAttribute(data.brights, 1));
  geo.setAttribute("aMilky", new THREE.BufferAttribute(data.milky, 1));
  const points = new THREE.Points(geo, material);
  points.renderOrder = renderOrder;
  points.frustumCulled = false;
  return points;
}

/** Layered starfield: mid (r~60) + near (r~30) for parallax depth under OrbitControls. @param {THREE.Scene} scene */
function createLayeredStarfield(scene) {
  const midMat = createStarPointsMaterial();
  const nearMat = createStarPointsMaterial();

  const midData = buildStarLayerData({
    count: 1500,
    radius: 60,
    radiusJitter: 6,
    sizeMin: 0.18,
    sizeMax: 1.0,
    sizePower: 3.5,
    brightChance: 0.006,
  });
  const nearData = buildStarLayerData({
    count: 600,
    radius: 30,
    radiusJitter: 3,
    sizeMin: 0.45,
    sizeMax: 3.2,
    sizePower: 2.4,
    brightChance: 0.045,
    heroCount: 7,
  });

  const midStars = createPointsFromStarData(midData, midMat, -14);
  const nearStars = createPointsFromStarData(nearData, nearMat, -9);
  scene.add(midStars);
  scene.add(nearStars);

  console.log("[sky] layered starfield: mid=1500@r60 near=600@r30");

  return {
    midMat,
    nearMat,
    update(_t, _delta, frameScale) {
      midStars.rotation.y += 0.00005 * frameScale;
      midStars.rotation.x += 0.000012 * frameScale;
      nearStars.rotation.y += 0.00009 * frameScale;
      nearStars.rotation.z += 0.000022 * frameScale;
    },
    dispose() {
      disposeObject(midStars);
      disposeObject(nearStars);
    },
  };
}

/** Equirectangular Milky Way panorama path (fetch via `npm run fetch-milkyway`). */
const MILKYWAY_TEXTURE_PATH = "/textures/milkyway.jpg";
/** Real astronomy skybox — falls back to procedural Points if texture missing/invalid. */
const USE_REAL_SKY = true;

function sampleImageMean(image, sampleW = 256, sampleH = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, sampleW, sampleH);
  const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
  let sum = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  return sum / n;
}

/** @returns {{ ok: boolean, w: number, h: number, mean: number, ratio: number }} */
function validateMilkyWayTexture(image) {
  const w = image.width;
  const h = image.height;
  const ratio = w / h;
  const mean = sampleImageMean(image) ?? 0;
  const ok = Math.abs(ratio - 2) <= 0.15 && mean >= 2 && mean <= 60;
  return { ok, w, h, mean, ratio };
}

/** @param {THREE.Scene} scene @param {THREE.WebGLRenderer} renderer */
function loadMilkyWaySky(scene, renderer) {
  return new Promise((resolve) => {
    if (!USE_REAL_SKY) {
      resolve(null);
      return;
    }
    new THREE.TextureLoader().load(
      MILKYWAY_TEXTURE_PATH,
      (texture) => {
        const img = texture.image;
        const v = validateMilkyWayTexture(img);
        if (!v.ok) {
          console.warn("[sky] milkyway.jpg failed validation — procedural stars only", v);
          texture.dispose();
          resolve(null);
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        const brightness = v.mean < 12 ? 1.75 : v.mean < 25 ? 1.35 : 1.0;
        const mat = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.BackSide,
          depthWrite: false,
        });
        mat.color.setScalar(brightness);
        const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 64, 64), mat);
        sky.renderOrder = -20;
        sky.frustumCulled = false;
        scene.add(sky);
        console.log(
          "[sky] Milky Way loaded:",
          v.w,
          "x",
          v.h,
          "mean=",
          v.mean.toFixed(2),
          "brightness=",
          brightness
        );
        resolve({ mesh: sky, texture, material: mat, validation: v });
      },
      undefined,
      (err) => {
        console.warn("[sky] milkyway.jpg not found — procedural stars only", err);
        resolve(null);
      }
    );
  });
}

function createSpaceEffects(scene) {
  const milkyAxis = new THREE.Vector3(0.55, 0.45, 0.7).normalize();
  const milkyCount = 900;
  const milkyPos = new Float32Array(milkyCount * 3);
  const milkyCol = new Float32Array(milkyCount * 3);
  for (let i = 0; i < milkyCount; i++) {
    const r = 40 + Math.random() * 10;
    const spread = new THREE.Vector3(
      (Math.random() - 0.5) * 0.35,
      (Math.random() - 0.5) * 0.35,
      (Math.random() - 0.5) * 0.35
    );
    const dir = milkyAxis.clone().multiplyScalar(0.82 + (Math.random() - 0.5) * 0.28).add(spread).normalize();
    milkyPos[i * 3] = dir.x * r;
    milkyPos[i * 3 + 1] = dir.y * r;
    milkyPos[i * 3 + 2] = dir.z * r;
    const b = 0.35 + Math.random() * 0.45;
    milkyCol[i * 3] = b * 0.82;
    milkyCol[i * 3 + 1] = b * 0.88;
    milkyCol[i * 3 + 2] = b;
  }
  const milkyGeo = new THREE.BufferGeometry();
  milkyGeo.setAttribute("position", new THREE.BufferAttribute(milkyPos, 3));
  milkyGeo.setAttribute("color", new THREE.BufferAttribute(milkyCol, 3));
  const milkyStars = new THREE.Points(
    milkyGeo,
    new THREE.PointsMaterial({
      map: getSoftStarTexture(),
      size: 0.55,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
      sizeAttenuation: true,
      alphaTest: 0.02,
    })
  );
  scene.add(milkyStars);

  const shootSegs = 14;
  const shootPos = new Float32Array(shootSegs * 3);
  const shootGeo = new THREE.BufferGeometry();
  shootGeo.setAttribute("position", new THREE.BufferAttribute(shootPos, 3));
  const shootingGroup = new THREE.Group();
  shootingGroup.visible = false;
  shootingGroup.add(
    new THREE.Line(
      shootGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false })
    )
  );
  scene.add(shootingGroup);

  const state = {
    shooting: { active: false, start: new THREE.Vector3(), end: new THREE.Vector3(), progress: 0, duration: 0.55 },
    nextShooting: 50 + Math.random() * 60,
  };

  const tmpV = new THREE.Vector3();

  const spawnShooting = () => {
    const r = 38 + Math.random() * 6;
    const a = Math.random() * Math.PI * 2;
    state.shooting.start.set(Math.cos(a) * r, (Math.random() - 0.5) * 10, Math.sin(a) * r - 10);
    state.shooting.end.copy(state.shooting.start).add(new THREE.Vector3(2.5, -1.2, 0.8));
    state.shooting.progress = 0;
    state.shooting.duration = 0.45 + Math.random() * 0.25;
    state.shooting.active = true;
    shootingGroup.visible = true;
  };

  return {
    update(t, delta, camera) {
      if (!state.shooting.active && t >= state.nextShooting) spawnShooting();
      if (state.shooting.active) {
        state.shooting.progress += delta / state.shooting.duration;
        if (state.shooting.progress >= 1) {
          state.shooting.active = false;
          shootingGroup.visible = false;
          state.nextShooting = t + 70 + Math.random() * 80;
        } else {
          for (let i = 0; i < shootSegs; i++) {
            const f = i / (shootSegs - 1);
            tmpV.lerpVectors(state.shooting.start, state.shooting.end, Math.max(0, state.shooting.progress - f * 0.06));
            shootPos[i * 3] = tmpV.x;
            shootPos[i * 3 + 1] = tmpV.y;
            shootPos[i * 3 + 2] = tmpV.z;
          }
          shootGeo.attributes.position.needsUpdate = true;
        }
      }

      milkyStars.position.copy(camera.position).multiplyScalar(0.015);
    },
    dispose() {
      disposeObject(milkyStars);
      disposeObject(shootingGroup);
    },
  };
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry && !child.geometry.userData?.keepAlive) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        if (!m.userData?.keepAlive) m.dispose();
      });
    }
  });
}

const EARTH_TEXTURE_CANDIDATES = {
  day: ["/textures/earth_day_nasa.jpg", "/textures/earth_day.jpg"],
  night: ["/textures/earth_night_8k.png", "/textures/earth_night.jpg"],
  normal: ["/textures/earth_normal_8k.jpg", "/textures/earth_normal.jpg"],
  specular: ["/textures/earth_specular_8k.jpg", "/textures/earth_specular.jpg"],
  clouds: ["/textures/earth_clouds_8k.png", "/textures/earth_clouds.png"],
};

/** @param {THREE.Texture} tex @param {THREE.WebGLRenderer} renderer @param {{ srgb?: boolean }} [opts] */
function configureGlobeTexture(tex, renderer, opts = {}) {
  tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
}

/** @param {THREE.WebGLRenderer} renderer */
function loadEarthTextures(renderer) {
  const loader = new THREE.TextureLoader();

  /** @param {string} key @param {string[]} urls @param {boolean} srgb */
  const loadOne = (key, urls, srgb) =>
    new Promise((resolve, reject) => {
      const tryUrl = (index) => {
        if (index >= urls.length) {
          reject(new Error(`Failed to load ${key} from ${urls.join(", ")}`));
          return;
        }
        const url = urls[index];
        loader.load(
          url,
          (tex) => {
            configureGlobeTexture(tex, renderer, { srgb });
            console.log(`[textures] ${key}: ${url} (${tex.image?.width || "?"}x${tex.image?.height || "?"})`);
            resolve({ key, tex });
          },
          undefined,
          () => tryUrl(index + 1)
        );
      };
      tryUrl(0);
    });

  return Promise.all([
    loadOne("day", EARTH_TEXTURE_CANDIDATES.day, true),
    loadOne("night", EARTH_TEXTURE_CANDIDATES.night, true),
    loadOne("normal", EARTH_TEXTURE_CANDIDATES.normal, false),
    loadOne("specular", EARTH_TEXTURE_CANDIDATES.specular, false),
    loadOne("clouds", EARTH_TEXTURE_CANDIDATES.clouds, true),
  ]).then((results) => {
    /** @type {Record<string, THREE.Texture>} */
    const textures = {};
    results.forEach(({ key, tex }) => {
      textures[key] = tex;
    });
    return textures;
  });
}

/** @param {THREE.Vector3} lightDir @param {number} prosperity */
function createNoisePlanetMaterial(lightDir, prosperity) {
  return new THREE.ShaderMaterial({
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
    uniforms: {
      uProsperity: { value: prosperity },
      uLightDir: { value: lightDir.clone() },
      uTime: { value: 0 },
      uCameraPos: { value: new THREE.Vector3(0, 0, 4.2) },
    },
  });
}

const TEXTURED_PLANET_SURFACE_FRAG = `
{
  vec3 N = normalize(vWorldPos);
  vec3 L = normalize(uLightDir);
  vec3 V = normalize(uCameraPos - vWorldPos);
  vec3 H = normalize(L + V);
  float sunDot = dot(N, L);
  float dayAmount = smoothstep(-0.1, 0.4, sunDot);

  vec3 dayColor = texture2D(map, vMapUv).rgb;
  float sunFacing = max(sunDot, 0.0);
  vec3 dayLit = dayColor * (1.0 + sunFacing * 0.3);

  float specMask = texture2D(uSpecularMap, vMapUv).r;
  float oceanSheen = pow(max(dot(N, H), 0.0), 24.0) * specMask * sunFacing;
  dayLit += vec3(0.85, 0.92, 1.0) * oceanSheen * 0.16;

  float daySideMask = smoothstep(0.05, 0.55, sunDot);
  float viewRim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.2);
  float sunLimb = daySideMask * viewRim * smoothstep(0.12, 0.7, sunDot);
  dayLit += vec3(1.0, 0.93, 0.72) * sunLimb * 0.14;

  float poleLat = abs(N.y);
  float poleMask = smoothstep(0.58, 0.9, poleLat);
  dayLit += vec3(0.16, 0.18, 0.2) * poleMask * sunFacing * 0.32;

  vec3 nightTex = texture2D(uNightMap, vMapUv).rgb;
  float cityLum = dot(nightTex, vec3(0.299, 0.587, 0.114));
  float thr = mix(0.28, 0.08, uPopulation);
  float cityMask = smoothstep(thr, thr + 0.15, cityLum);

  vec3 warmColor = vec3(1.0, 0.82, 0.48);
  vec3 redColor = vec3(1.0, 0.35, 0.12);
  vec3 cityTint = mix(warmColor, redColor, uRevolution * cityMask);
  float cityBright = mix(2.0, 6.0, uPopulation);
  vec3 cityGlow = nightTex * cityMask * cityTint * cityBright;

  float nightSide = 1.0 - dayAmount;
  vec3 nightBase = dayColor * 0.03;
  vec3 nightColor = nightBase + cityGlow * nightSide;

  vec3 surface = mix(nightColor, dayLit, dayAmount);
${AURORA_TEXTURED_GLSL}
  gl_FragColor = vec4(surface, 1.0);
}`;

function patchTexturedPlanetShader(shader) {
  shader.uniforms.uLightDir = { value: new THREE.Vector3(5, 0.35, 1.2).normalize() };
  shader.uniforms.uProsperity = { value: 0.5 };
  shader.uniforms.uRevolution = { value: 0 };
  shader.uniforms.uPopulation = { value: 0.5 };
  shader.uniforms.uTime = { value: 0 };
  shader.uniforms.uNightMap = { value: null };
  shader.uniforms.uSpecularMap = { value: null };
  shader.uniforms.uCameraPos = { value: new THREE.Vector3(0, 0, 4.2) };

  if (!shader.vertexShader.includes("varying vec3 vWorldNormal")) {
    shader.vertexShader = "varying vec3 vWorldNormal;\nvarying vec3 vWorldPos;\n" + shader.vertexShader;
  }
  if (!shader.fragmentShader.includes("uniform sampler2D uNightMap")) {
    shader.fragmentShader =
      "varying vec3 vWorldNormal;\nvarying vec3 vWorldPos;\nuniform vec3 uLightDir;\nuniform vec3 uCameraPos;\nuniform float uProsperity;\nuniform float uRevolution;\nuniform float uPopulation;\nuniform float uTime;\nuniform sampler2D uNightMap;\nuniform sampler2D uSpecularMap;\n" +
      shader.fragmentShader;
  }

  shader.vertexShader = shader.vertexShader.replace(
    "#include <defaultnormal_vertex>",
    `#include <defaultnormal_vertex>
    vWorldNormal = normalize(mat3(modelMatrix) * transformedNormal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`
  );

  if (shader.fragmentShader.includes("#include <opaque_fragment>")) {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      TEXTURED_PLANET_SURFACE_FRAG
    );
  } else {
    shader.fragmentShader = shader.fragmentShader.replace(
      "gl_FragColor = vec4( outgoingLight, diffuseColor.a );",
      TEXTURED_PLANET_SURFACE_FRAG
    );
  }
}

function createTexturedPlanetMaterial(textures, lightDir) {
  const mat = new THREE.MeshStandardMaterial({
    map: textures.day,
    normalMap: textures.normal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    metalness: 0.02,
    roughness: 0.78,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    envMapIntensity: 0,
  });

  mat.onBeforeCompile = (shader) => {
    patchTexturedPlanetShader(shader);
    shader.uniforms.uLightDir.value.copy(lightDir);
    shader.uniforms.uNightMap.value = textures.night;
    shader.uniforms.uSpecularMap.value = textures.specular;
    mat.userData.shader = shader;
  };

  mat.customProgramCacheKey = () => "textured-planet-zion-v20-daynight-fix";
  return mat;
}

const TEXTURED_CLOUD_VERT = `
varying vec2 vUv;
varying vec3 vWorldNormal;
void main() {
  vUv = uv;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TEXTURED_CLOUD_FRAG = `
uniform sampler2D uCloudMap;
uniform sampler2D uNightMap;
uniform vec3 uLightDir;
uniform float uProsperity;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorldNormal;
void main() {
  vec4 tex = texture2D(uCloudMap, vUv);
  if (tex.a < 0.03) discard;

  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightDir);
  float dayAmount = smoothstep(-0.1, 0.4, dot(N, L));

  vec3 dayCloud = tex.rgb;
  vec3 nightCloud = tex.rgb * 0.05;

  vec3 nightTex = texture2D(uNightMap, vUv).rgb;
  float cityLum = dot(nightTex, vec3(0.299, 0.587, 0.114));
  float cityMask = smoothstep(0.12, 0.35, cityLum);
  nightCloud += vec3(1.0, 0.82, 0.48) * cityMask * 0.15 * tex.a;

  vec3 col = mix(nightCloud, dayCloud, dayAmount);

  float nightSide = 1.0 - dayAmount;
  float stormHash = fract(sin(dot(floor(vUv * 48.0), vec2(127.1, 311.7))) * 43758.5453);
  float flashPeriod = stormHash * 14.0 + 18.0;
  float flashPhase = fract(uTime / flashPeriod + stormHash * 4.1);
  float flash = smoothstep(0.0, 0.01, flashPhase) * (1.0 - smoothstep(0.01, 0.09, flashPhase));
  flash *= step(0.93, stormHash) * nightSide * uProsperity * tex.a;
  col += vec3(0.72, 0.88, 1.0) * flash * 3.0;
  gl_FragColor = vec4(col, tex.a * 0.88);
}
`;

/** @param {THREE.Texture} cloudTex @param {THREE.Texture} nightTex @param {THREE.Vector3} lightDir */
function createTexturedCloudMaterial(cloudTex, nightTex, lightDir) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCloudMap: { value: cloudTex },
      uNightMap: { value: nightTex },
      uLightDir: { value: lightDir.clone() },
      uProsperity: { value: 0.5 },
      uTime: { value: 0 },
    },
    vertexShader: TEXTURED_CLOUD_VERT,
    fragmentShader: TEXTURED_CLOUD_FRAG,
    transparent: true,
    depthWrite: false,
  });
}

function createNoiseCloudLayers(scene, lightDir, prosperity) {
  const cloudLowMat = new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_LOW_FRAG,
    uniforms: {
      uProsperity: { value: prosperity },
      uLightDir: { value: lightDir.clone() },
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
  });
  const cloudsLow = new THREE.Mesh(new THREE.SphereGeometry(1.010, 128, 128), cloudLowMat);
  scene.add(cloudsLow);

  const cloudHighMat = new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_HIGH_FRAG,
    uniforms: {
      uProsperity: { value: prosperity },
      uLightDir: { value: lightDir.clone() },
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
  });
  const cloudsHigh = new THREE.Mesh(new THREE.SphereGeometry(1.018, 128, 128), cloudHighMat);
  scene.add(cloudsHigh);

  return { cloudsLow, cloudsHigh, cloudLowMat, cloudHighMat };
}

/**
 * @typedef {Object} CivilizationData
 * @property {number} [total]
 * @property {number} [elite]
 * @property {number} [middle]
 * @property {number} [poor]
 * @property {number} [critical]
 * @property {number} [unemployment]
 * @property {number} [revolution]
 * @property {number} [poverty]
 * @property {number} [population]
 */

/** @param {{ prosperity?: number, revolution?: number, population?: number, civilizationData?: CivilizationData, height?: number, showHud?: boolean }} props */
export function LivingPlanet({
  prosperity = 0.5,
  revolution = 0,
  population = 0,
  civilizationData,
  height = 400,
  showHud = false,
}) {
  const containerRef = useRef(null);
  const targetProsperityRef = useRef(Math.max(0, Math.min(1, prosperity)));
  const currentProsperityRef = useRef(Math.max(0, Math.min(1, prosperity)));
  const targetRevolutionRef = useRef(Math.max(0, Math.min(100, revolution)));
  const currentRevolutionRef = useRef(Math.max(0, Math.min(100, revolution)));
  const targetPopulationRef = useRef(normalizePopulation(population));
  const currentPopulationRef = useRef(normalizePopulation(population));

  useEffect(() => {
    targetProsperityRef.current = Math.max(0, Math.min(1, prosperity));
  }, [prosperity]);

  useEffect(() => {
    targetRevolutionRef.current = Math.max(0, Math.min(100, revolution));
  }, [revolution]);

  useEffect(() => {
    targetPopulationRef.current = normalizePopulation(population);
  }, [population]);

  const initDoneRef = useRef(false);
  const resizeRef = useRef(/** @type {(() => void) | null} */ (null));
  const viewportRef = useRef(null);
  const canvasElRef = useRef(/** @type {HTMLCanvasElement | null} */ (null));
  const controlsRef = useRef(/** @type {import("three/examples/jsm/controls/OrbitControls.js").OrbitControls | null} */ (null));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fsBtnHover, setFsBtnHover] = useState(false);
  const [interactionActive, setInteractionActive] = useState(false);

  useEffect(() => {
    const canvas = canvasElRef.current;
    const controls = controlsRef.current;
    if (canvas) {
      canvas.style.pointerEvents = interactionActive ? "auto" : "none";
      canvas.style.cursor = interactionActive ? "grab" : "";
    }
    if (controls) {
      controls.enabled = interactionActive;
    }
  }, [interactionActive]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!interactionActive) return;
      const root = containerRef.current;
      if (root && !root.contains(e.target)) {
        setInteractionActive(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setInteractionActive(false);
      }
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [interactionActive]);

  const handlePlanetActivate = useCallback((e) => {
    if (!interactionActive) {
      e.stopPropagation();
      setInteractionActive(true);
    }
  }, [interactionActive]);

  const handlePassiveWheel = useCallback(
    (e) => {
      if (interactionActive) return;
      window.scrollBy({ top: e.deltaY, left: e.deltaX, behavior: "auto" });
    },
    [interactionActive]
  );

  useEffect(() => {
    const onFullscreenChange = () => {
      const el = containerRef.current;
      const active = !!el && document.fullscreenElement === el;
      setIsFullscreen(active);
      resizeRef.current?.();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch (err) {
      console.warn("[LivingPlanet] fullscreen toggle failed:", err);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const viewport = viewportRef.current;
    if (!container || !viewport || initDoneRef.current) return;
    initDoneRef.current = true;

    let disposed = false;
    let animId = 0;

    const MAX_PIXEL_RATIO = 2;
    const getPixelRatio = () => Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const isContainerFullscreen = () => document.fullscreenElement === container;
    const getW = () => {
      const w = isContainerFullscreen() ? window.innerWidth : container.clientWidth;
      return Math.max(w || 800, 1);
    };
    const getH = () => {
      const h = isContainerFullscreen() ? window.innerHeight : container.clientHeight;
      return Math.max(h || height || 600, 1);
    };

    console.log("CONTAINER:", container.clientWidth, "x", container.clientHeight);

    /** @type {THREE.WebGLRenderer | null} */
    let renderer = null;
    let cleanupFn = () => {};

    const run = async () => {
    try {
      console.log("[init] start creating objects");

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);

      const w = getW();
      const h = getH();
      const camZ = w / h > 1.5 ? 4.6 : 4.2;

      const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 200);
      camera.position.set(0, 0, camZ);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(getPixelRatio());
      renderer.setSize(w, h, false);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      renderer.domElement.style.pointerEvents = "none";
      viewport.appendChild(renderer.domElement);
      canvasElRef.current = renderer.domElement;

      const controls = new OrbitControls(camera, renderer.domElement);
      controlsRef.current = controls;
      controls.enabled = false;
      controls.target.set(0, 0, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.enableZoom = true;
      controls.minDistance = 2.5;
      controls.maxDistance = 6;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.35;
      controls.update();

      const initPr = getPixelRatio();
      const expectedW = Math.round(w * initPr);
      const expectedH = Math.round(h * initPr);
      console.log(
        "[canvas] container", w, "x", h,
        "internal", renderer.domElement.width, "x", renderer.domElement.height,
        "expected", expectedW, "x", expectedH,
        "dpr", initPr,
        "match", renderer.domElement.width === expectedW && renderer.domElement.height === expectedH
      );

      const lightDir = new THREE.Vector3();
      updateRealtimeSunDirection(lightDir);
      const ambientLight = new THREE.AmbientLight(0x1a2840, 0.25);
      scene.add(ambientLight);
      const dirLight = new THREE.DirectionalLight(0xfff5e0, 4.0);
      dirLight.position.set(lightDir.x * 12, lightDir.y * 12, lightDir.z * 12);
      dirLight.target.position.set(0, 0, 0);
      scene.add(dirLight);
      scene.add(dirLight.target);
      const earthFill = new THREE.HemisphereLight(0x3a5880, 0x080a10, 0.12);
      scene.add(earthFill);
      console.log("sun pos:", dirLight.position.x, dirLight.position.y, dirLight.position.z, "intensity:", dirLight.intensity);
      console.log("camera pos:", camera.position.x, camera.position.y, camera.position.z);
      console.log("[debug] step 2 — ambient intensity:", ambientLight.intensity, "(0.4 would reveal texture if sun-only issue)");
      console.log("[debug] toneMappingExposure:", renderer.toneMappingExposure);
      console.log("[init] lights added, children:", scene.children.length);

      const USE_REAL_TEXTURES = true;
      let useTexturedPlanet = false;
      /** @type {THREE.Mesh} */
      let planet;
      /** @type {THREE.Material} */
      let planetMat;
      /** @type {THREE.Mesh | null} */
      let clouds = null;
      /** @type {THREE.Mesh | null} */
      let cloudsLow = null;
      /** @type {THREE.Mesh | null} */
      let cloudsHigh = null;
      /** @type {THREE.ShaderMaterial | null} */
      let cloudMat = null;
      /** @type {THREE.ShaderMaterial | null} */
      let cloudLowMat = null;
      /** @type {THREE.ShaderMaterial | null} */
      let cloudHighMat = null;
      /** @type {Record<string, THREE.Texture> | null} */
      let loadedTextures = null;

      if (USE_REAL_TEXTURES) {
        try {
          loadedTextures = await loadEarthTextures(renderer);
          if (disposed) return;
          planetMat = createTexturedPlanetMaterial(loadedTextures, lightDir);
          forceOpaquePlanetMaterial(planetMat);
          planet = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 256), planetMat);
          planet.renderOrder = 0;
          markDepth(planet);
          scene.add(planet);
          renderer.compile(scene, camera);
          if (!planetMat.userData.shader) {
            console.warn("[textures] planet shader patch missing after compile");
          }
          cloudMat = createTexturedCloudMaterial(loadedTextures.clouds, loadedTextures.night, lightDir);
          cloudMat.depthWrite = false;
          clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 128, 128), cloudMat);
          clouds.renderOrder = 1;
          scene.add(clouds);
          useTexturedPlanet = true;
          console.log("[textures] real NASA maps loaded from /public/textures/");
        } catch (texErr) {
          console.error("[textures] failed, fallback to noise planet:", texErr.message || texErr);
        }
      }

      if (!useTexturedPlanet) {
        planetMat = createNoisePlanetMaterial(lightDir, currentProsperityRef.current);
        forceOpaquePlanetMaterial(planetMat);
        planet = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 256), planetMat);
        planet.renderOrder = 0;
        markDepth(planet);
        scene.add(planet);
        const noiseClouds = createNoiseCloudLayers(scene, lightDir, currentProsperityRef.current);
        cloudsLow = noiseClouds.cloudsLow;
        cloudsHigh = noiseClouds.cloudsHigh;
        cloudLowMat = noiseClouds.cloudLowMat;
        cloudHighMat = noiseClouds.cloudHighMat;
      }

      console.log("[init] planet added, textured:", useTexturedPlanet, "children:", scene.children.length);

      const atmosMat = new THREE.ShaderMaterial({
        vertexShader: ATMOS_VERT,
        fragmentShader: ATMOS_FRAG,
        uniforms: {
          uProsperity: { value: currentProsperityRef.current },
          uTime: { value: 0 },
          uCameraPos: { value: camera.position.clone() },
          uLightDir: { value: lightDir.clone() },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      });
      const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.025, 128, 128), atmosMat);
      atmosphere.renderOrder = 2;
      scene.add(atmosphere);
      console.log("[debug] step 4 — atmosphere visible: true (fresnel fixed to rim-only)");

      /** @type {{ mesh: THREE.Mesh, texture: THREE.Texture, material: THREE.Material } | null} */
      let milkySky = null;
      if (USE_REAL_SKY) {
        milkySky = await loadMilkyWaySky(scene, renderer);
        if (!milkySky) {
          console.warn("[sky] USE_REAL_SKY: no valid milkyway.jpg — procedural Points only");
        }
      }

      const starfield = createLayeredStarfield(scene);

      const heroSat = createHeroSatellite();
      heroSat.userData = { radius: 1.38, angle: 0.8, orbitPeriod: 800, isHero: true };
      scene.add(heroSat);

      const distantSat2 = createDistantSatellite();
      distantSat2.userData = {
        radius: 1.72,
        angle: 2.35,
        orbitPeriod: 1150,
        inclinationX: (35 * Math.PI) / 180,
        nodeAngle: 0.85,
        isDistant: true,
      };
      scene.add(distantSat2);

      const distantSat3 = createDistantSatellite();
      distantSat3.userData = {
        radius: 1.62,
        angle: 4.85,
        orbitPeriod: 980,
        inclinationX: (-60 * Math.PI) / 180,
        nodeAngle: 2.35,
        isDistant: true,
      };
      scene.add(distantSat3);

      const satellites = [heroSat, distantSat2, distantSat3];

      const spaceFx = createSpaceEffects(scene);
      const cometVfx = createCometVfx(scene, lightDir);
      console.log("[init] all done, children:", scene.children.length);
      console.log("[LivingPlanet] camera pos", camera.position.x, camera.position.y, camera.position.z);

      const USE_BLOOM = true;
      /** @type {EffectComposer | null} */
      let composer = null;
      /** @type {UnrealBloomPass | null} */
      let bloomPass = null;
      /** @type {ShaderPass | null} */
      let fxaaPass = null;
      /** @type {ShaderPass | null} */
      let sharpenPass = null;
      let useBloom = USE_BLOOM;

      const updatePostUniforms = (rw, rh, pr) => {
        if (fxaaPass) {
          fxaaPass.uniforms.resolution.value.set(1 / (rw * pr), 1 / (rh * pr));
        }
        if (sharpenPass) {
          sharpenPass.uniforms.uResolution.value.set(rw * pr, rh * pr);
        }
      };

      if (USE_BLOOM) {
        try {
          const bw = Math.max(container.clientWidth, 1) || 800;
          const bh = Math.max(container.clientHeight, 1) || 600;
          composer = new EffectComposer(renderer);
          if (composer.renderTarget1?.texture) {
            composer.renderTarget1.texture.colorSpace = THREE.SRGBColorSpace;
          }
          if (composer.renderTarget2?.texture) {
            composer.renderTarget2.texture.colorSpace = THREE.SRGBColorSpace;
          }
          composer.addPass(new RenderPass(scene, camera));
          bloomPass = new UnrealBloomPass(new THREE.Vector2(bw, bh), 0.32, 0.5, 0.65);
          bloomPass.renderToScreen = false;
          composer.addPass(bloomPass);
          fxaaPass = new ShaderPass(FXAAShader);
          fxaaPass.renderToScreen = false;
          composer.addPass(fxaaPass);
          sharpenPass = new ShaderPass(UNSHARP_SHADER);
          sharpenPass.renderToScreen = true;
          composer.addPass(sharpenPass);
          composer.setPixelRatio(initPr);
          composer.setSize(bw, bh);
          updatePostUniforms(bw, bh, initPr);
          console.log("[bloom] enabled", bw, "x", bh, "dpr", initPr, "+ FXAA + sharpen");
        } catch (e) {
          console.error("[bloom] failed, fallback to direct render", e);
          useBloom = false;
          composer = null;
          bloomPass = null;
          fxaaPass = null;
          sharpenPass = null;
        }
      }

      const satWorldPos = new THREE.Vector3();
      const satPerp = new THREE.Vector3();
      const lightProj = new THREE.Vector3();
      const orbitPos = new THREE.Vector3();
      const orbitAxisX = new THREE.Vector3(1, 0, 0);
      const orbitAxisY = new THREE.Vector3(0, 1, 0);
      const isInPlanetShadow = (satPos) => {
        const dotL = satPos.dot(lightDir);
        if (dotL >= 0) return false;
        lightProj.copy(lightDir).multiplyScalar(dotL);
        satPerp.copy(satPos).sub(lightProj);
        return satPerp.length() < 0.98;
      };

      const clock = new THREE.Clock();

      const resize = () => {
        if (disposed) return;
        const rw = getW();
        const rh = getH();
        camera.aspect = rw / rh;
        camera.updateProjectionMatrix();
        const pr = getPixelRatio();
        renderer.setPixelRatio(pr);
        renderer.setSize(rw, rh, false);
        if (useBloom && composer) {
          composer.setPixelRatio(pr);
          composer.setSize(rw, rh);
          updatePostUniforms(rw, rh, pr);
        }
      };
      resizeRef.current = resize;
      window.addEventListener("resize", resize);
      const ro = new ResizeObserver(resize);
      ro.observe(container);
      resize();

      const animate = () => {
        if (disposed) return;
        animId = requestAnimationFrame(animate);
        const delta = clock.getDelta();
        const t = clock.getElapsedTime();
        const frameScale = delta * 60;

        currentProsperityRef.current += (targetProsperityRef.current - currentProsperityRef.current) * 0.02;
        currentRevolutionRef.current += (targetRevolutionRef.current - currentRevolutionRef.current) * 0.02;
        currentPopulationRef.current += (targetPopulationRef.current - currentPopulationRef.current) * 0.02;
        const p = currentProsperityRef.current;
        const revNorm = currentRevolutionRef.current / 100;
        const pop = currentPopulationRef.current;

        updateRealtimeSunDirection(lightDir);
        dirLight.position.set(lightDir.x * 12, lightDir.y * 12, lightDir.z * 12);
        atmosMat.uniforms.uLightDir.value.copy(lightDir);

        if (useTexturedPlanet && planetMat.userData.shader) {
          planetMat.userData.shader.uniforms.uProsperity.value = p;
          planetMat.userData.shader.uniforms.uRevolution.value = revNorm;
          planetMat.userData.shader.uniforms.uPopulation.value = pop;
          planetMat.userData.shader.uniforms.uTime.value = t;
          planetMat.userData.shader.uniforms.uLightDir.value.copy(lightDir);
          planetMat.userData.shader.uniforms.uCameraPos.value.copy(camera.position);
        } else if (planetMat.uniforms) {
          planetMat.uniforms.uProsperity.value = p;
          planetMat.uniforms.uTime.value = t;
          planetMat.uniforms.uLightDir.value.copy(lightDir);
          planetMat.uniforms.uCameraPos.value.copy(camera.position);
        }
        if (cloudMat) {
          cloudMat.uniforms.uProsperity.value = p;
          cloudMat.uniforms.uTime.value = t;
          cloudMat.uniforms.uLightDir.value.copy(lightDir);
        }
        if (cloudLowMat) {
          cloudLowMat.uniforms.uProsperity.value = p;
          cloudLowMat.uniforms.uTime.value = t;
          cloudLowMat.uniforms.uLightDir.value.copy(lightDir);
        }
        if (cloudHighMat) {
          cloudHighMat.uniforms.uProsperity.value = p;
          cloudHighMat.uniforms.uTime.value = t;
          cloudHighMat.uniforms.uLightDir.value.copy(lightDir);
        }
        atmosMat.uniforms.uProsperity.value = p;
        atmosMat.uniforms.uTime.value = t;
        atmosMat.uniforms.uCameraPos.value.copy(camera.position);
        starfield.midMat.uniforms.uTime.value = t;
        starfield.nearMat.uniforms.uTime.value = t;
        starfield.update(t, delta, frameScale);

        const planetSpin = 0.00025 * frameScale;
        const cloudExtraDrift = 0.000135 * frameScale;
        const cloudSpin = planetSpin + cloudExtraDrift;
        planet.rotation.y += planetSpin;
        if (clouds) {
          clouds.rotation.y += cloudSpin;
          clouds.rotation.x = 0.011;
        } else {
          if (cloudsLow) {
            cloudsLow.rotation.y += cloudSpin;
            cloudsLow.rotation.x = 0.009;
          }
          if (cloudsHigh) {
            cloudsHigh.rotation.y += cloudSpin + cloudExtraDrift * 0.12;
            cloudsHigh.rotation.x = 0.013;
          }
        }
        atmosphere.rotation.y += planetSpin;

        controls.update();

        const visibleSat = p > 0.2;
        satellites.forEach((sat) => {
          const cfg = sat.userData;
          sat.visible = visibleSat;
          if (!sat.visible) return;
          cfg.angle += ((Math.PI * 2) / cfg.orbitPeriod) * delta;
          const angle = cfg.angle;
          const radius = cfg.radius;

          if (cfg.inclinationX !== undefined) {
            orbitPos.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
            if (cfg.nodeAngle) orbitPos.applyAxisAngle(orbitAxisY, cfg.nodeAngle);
            orbitPos.applyAxisAngle(orbitAxisX, cfg.inclinationX);
            sat.position.copy(orbitPos);
          } else {
            sat.position.set(
              Math.cos(angle) * radius,
              Math.sin(angle * 0.5) * radius * 0.3,
              Math.sin(angle) * radius
            );
          }

          const ud = sat.userData;
          sat.lookAt(0, 0, 0);

          if (cfg.isDistant) return;

          sat.rotation.z += Math.sin(t * 0.31) * 0.0008 * frameScale;
          sat.rotation.x += Math.cos(t * 0.17) * 0.0005 * frameScale;
          satWorldPos.copy(sat.position);
          const inPlanetShadow = isInPlanetShadow(satWorldPos);
          if (ud.navLight) ud.navLight.visible = Math.sin(t * Math.PI) > 0;
          if (ud.satLight) ud.satLight.intensity = inPlanetShadow ? 0.04 : 0.12;
          ud.panels?.forEach((panel, pi) => {
            const side = pi === 0 ? -1 : 1;
            panel.rotation.y = Math.atan2(lightDir.z * side, lightDir.x * side + 0.001) * 0.55;
            panel.rotation.x = Math.asin(Math.max(-0.7, Math.min(0.7, lightDir.y))) * 0.35;
            const panelMat = panel.userData.panelMat;
            if (panelMat) {
              const align = Math.abs(Math.cos(panel.rotation.y - Math.atan2(lightDir.x, lightDir.z)));
              const flash = align > 0.92 ? Math.min(1, (align - 0.92) / 0.08) : 0;
              panelMat.emissiveIntensity = 0.06 + flash * 0.12;
              panelMat.emissive.setHex(flash > 0.5 ? 0x1a3050 : 0x0a1830);
            }
          });
          if (ud.foilMat && !inPlanetShadow) {
            ud.foilMat.roughness = 0.22;
          } else if (ud.foilMat) {
            ud.foilMat.roughness = 0.45;
          }
          if (ud.dishMat) {
            ud.dishMat.metalness = inPlanetShadow ? 0.7 : 0.95;
            ud.dishMat.roughness = inPlanetShadow ? 0.35 : 0.15;
          }
          sat.traverse((child) => {
            if (!child.isMesh || !child.material || child === ud.navLight) return;
            if (child.material.metalness !== undefined) {
              if (child.userData.baseRoughness === undefined) {
                child.userData.baseRoughness = child.material.roughness;
              }
              child.material.roughness = inPlanetShadow
                ? Math.min(0.85, child.userData.baseRoughness + 0.35)
                : child.userData.baseRoughness;
            }
          });
        });

        spaceFx.update(t, delta, camera);
        cometVfx.update(t, delta);
        if (useBloom && composer) {
          try {
            composer.render();
          } catch (e) {
            console.error("[bloom] render failed, fallback to direct render", e);
            useBloom = false;
            renderer.render(scene, camera);
          }
        } else {
          renderer.render(scene, camera);
        }
      };
      animate();

      cleanupFn = () => {
        disposed = true;
        initDoneRef.current = false;
        resizeRef.current = null;
        cancelAnimationFrame(animId);
        window.removeEventListener("resize", resize);
        ro.disconnect();
        disposeObject(planet);
        if (clouds) disposeObject(clouds);
        if (cloudsLow) disposeObject(cloudsLow);
        if (cloudsHigh) disposeObject(cloudsHigh);
        disposeObject(atmosphere);
        starfield.dispose();
        if (milkySky) {
          milkySky.texture.dispose();
          milkySky.material.dispose();
          if (milkySky.mesh.parent) milkySky.mesh.parent.remove(milkySky.mesh);
          milkySky.mesh.geometry.dispose();
        }
        satellites.forEach(disposeObject);
        spaceFx.dispose();
        cometVfx.dispose();
        controls.dispose();
        controlsRef.current = null;
        if (loadedTextures) {
          Object.values(loadedTextures).forEach((tex) => tex.dispose());
        }
        if (composer) {
          composer.renderTarget1?.dispose();
          composer.renderTarget2?.dispose();
        }
        renderer?.dispose();
        canvasElRef.current = null;
        if (renderer?.domElement?.parentNode === viewport) {
          viewport.removeChild(renderer.domElement);
        }
      };
    } catch (e) {
      console.error("[init] CRASHED:", e);
      initDoneRef.current = false;
      if (renderer?.domElement?.parentNode === viewport) {
        viewport.removeChild(renderer.domElement);
      }
      renderer?.dispose();
    }
    };

    run();

    return () => {
      disposed = true;
      cleanupFn();
    };
  }, [height]);

  const hudProsperity = Math.round(prosperity * 100);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: isFullscreen ? "100vh" : `${height}px`,
        minHeight: isFullscreen ? "100vh" : `${height}px`,
        flexShrink: 0,
        overflow: "hidden",
        background: "#000",
      }}
    >
      <div
        ref={viewportRef}
        role="presentation"
        onClick={handlePlanetActivate}
        onWheel={handlePassiveWheel}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          cursor: interactionActive ? "grab" : "default",
          boxShadow: interactionActive ? "inset 0 0 0 1px rgba(0, 180, 216, 0.45)" : "none",
          transition: "box-shadow 0.2s ease",
        }}
      />
      {!interactionActive && (
        <div
          style={{
            position: "absolute",
            bottom: showHud && civilizationData ? 52 : 14,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 3,
            pointerEvents: "none",
            fontFamily: "monospace",
            fontSize: 10,
            letterSpacing: "0.08em",
            color: "rgba(0, 180, 216, 0.55)",
            textTransform: "uppercase",
          }}
        >
          Click to interact
        </div>
      )}
      <button
        type="button"
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
        onClick={(e) => {
          e.stopPropagation();
          toggleFullscreen();
        }}
        onMouseEnter={() => setFsBtnHover(true)}
        onMouseLeave={() => setFsBtnHover(false)}
        style={{
          position: "absolute",
          top: showHud ? 36 : 10,
          right: 10,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 24,
          padding: 0,
          borderRadius: 4,
          border: `1px solid rgba(0, 255, 136, ${fsBtnHover ? 0.75 : 0.45})`,
          background: fsBtnHover ? "rgba(0, 20, 16, 0.82)" : "rgba(0, 0, 0, 0.55)",
          color: fsBtnHover ? "#00ffaa" : "rgba(0, 255, 136, 0.85)",
          cursor: "pointer",
          transition: "background 0.15s, border-color 0.15s, color 0.15s",
          boxShadow: fsBtnHover ? "0 0 8px rgba(0, 255, 136, 0.25)" : "none",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {isFullscreen ? (
            <>
              <path d="M4 14h6v6" />
              <path d="M14 14h6v6" />
              <path d="M4 10h6V4" />
              <path d="M14 10h6V4" />
            </>
          ) : (
            <>
              <path d="M8 3H3v5" />
              <path d="M16 3h5v5" />
              <path d="M8 21H3v-5" />
              <path d="M16 21h5v-5" />
            </>
          )}
        </svg>
      </button>
      {showHud && civilizationData && (
        <>
          <div style={{ position: "absolute", top: 8, left: 12, zIndex: 2, fontFamily: "monospace", fontSize: 10, color: "rgba(0,255,136,0.85)", letterSpacing: 1, pointerEvents: "none" }}>
            PROSPERITY {hudProsperity}%
          </div>
          <div style={{ position: "absolute", top: 8, right: 12, zIndex: 2, fontFamily: "monospace", fontSize: 11, color: "#00ff88", letterSpacing: 2, pointerEvents: "none" }}>
            LIVE MAP
          </div>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2, display: "flex", gap: 20, padding: "8px 12px", background: "rgba(0,0,0,0.45)", borderTop: "1px solid rgba(0,255,136,0.2)", pointerEvents: "none" }}>
            {[
              { label: "TOTAL", value: civilizationData.total, color: "#00ff88" },
              { label: "ELITE", value: civilizationData.elite, color: "#ffd700" },
              { label: "MIDDLE", value: civilizationData.middle, color: "#00aaff" },
              { label: "POOR", value: civilizationData.poor, color: "#ff8800" },
              { label: "CRITICAL", value: civilizationData.critical, color: "#ff2244" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: "rgba(255,255,255,0.4)" }}>{label}</div>
                <div style={{ fontFamily: "monospace", fontSize: 13, color, fontWeight: 700 }}>{value ?? "—"}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default LivingPlanet;
