import * as THREE from "three";
import { SpriteParticleEmitter } from "./SpriteParticleEmitter";

export const USE_UNREST = false;

const GLOW_TEX = "/textures/comet_glow.png";
const NIGHT_TEX = "/textures/earth_night.jpg";
const MAX_CITY_ANCHORS = 24;
const SURFACE_RADIUS = 1.004;
const CITY_BRIGHT_THRESHOLD = 0.16;
const FIRE_CORE = 0xff8018; // vec3(1.0, 0.5, 0.15)
const FIRE_DARK_RED = 0x660808;
const FIRE_HALO = 0x991010;

const _worldNormal = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _jitter = new THREE.Vector3();

const noop = { update() {}, dispose() {} };

/** @param {number} u @param {number} v @returns {THREE.Vector3} */
function uvToNormal(u, v) {
  const lon = (u - 0.5) * 2 * Math.PI;
  const lat = (0.5 - v) * Math.PI;
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(cosLat * Math.sin(lon), Math.sin(lat), cosLat * Math.cos(lon));
}

/** @param {THREE.Vector3} n @returns {{ u: number, v: number }} */
function normalToUV(n) {
  return {
    u: (0.5 + Math.atan2(n.z, n.x) / (2 * Math.PI)) % 1,
    v: 0.5 - Math.asin(Math.max(-1, Math.min(1, n.y))) / Math.PI,
  };
}

/**
 * @param {Uint8ClampedArray} pixels
 * @param {number} width
 * @param {number} height
 * @param {number} u
 * @param {number} v
 */
function sampleNightBrightness(pixels, width, height, u, v) {
  const px = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
  const py = Math.min(height - 1, Math.max(0, Math.floor(v * height)));
  const i = (py * width + px) * 4;
  const r = pixels[i];
  const g = pixels[i + 1];
  const b = pixels[i + 2];
  return Math.max(r, g, b) / 255;
}

/**
 * Load night-lights texture once and read pixel data for city sampling.
 * @returns {Promise<{ pixels: Uint8ClampedArray, width: number, height: number }>}
 */
function loadNightLightMap() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas 2d unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve({ pixels: data, width, height });
    };
    img.onerror = () => reject(new Error("failed to load earth_night.jpg"));
    img.src = NIGHT_TEX;
  });
}

/**
 * Pick city fire anchors where Black Marble night lights are bright (= land cities).
 * @param {{ pixels: Uint8ClampedArray, width: number, height: number }} nightMap
 * @param {number} count
 */
function buildCityAnchors(nightMap, count) {
  const { pixels, width, height } = nightMap;
  /** @type {Array<{ localNormal: THREE.Vector3, brightness: number, emitAcc: number, phase: number }>} */
  const candidates = [];

  for (let attempt = 0; attempt < 12000 && candidates.length < count * 6; attempt++) {
    const u = Math.random();
    const v = Math.random();
    const brightness = sampleNightBrightness(pixels, width, height, u, v);
    if (brightness < CITY_BRIGHT_THRESHOLD) continue;

    const normal = uvToNormal(u, v);
    const check = normalToUV(normal);
    const verify = sampleNightBrightness(pixels, width, height, check.u, check.v);
    if (verify < CITY_BRIGHT_THRESHOLD * 0.85) continue;

    candidates.push({
      localNormal: normal,
      brightness: verify,
      emitAcc: Math.random(),
      phase: Math.random() * Math.PI * 2,
    });
  }

  candidates.sort((a, b) => b.brightness - a.brightness);

  /** @type {typeof candidates} */
  const picked = [];
  for (const c of candidates) {
    if (picked.length >= count) break;
    let tooClose = false;
    for (const p of picked) {
      if (c.localNormal.dot(p.localNormal) > 0.82) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) picked.push(c);
  }

  console.log(`[unrest] ${picked.length} city fire anchors from night-lights texture`);
  return picked;
}

/** Active city fire anchors from revolution 0..100. */
function activeAnchorCount(rev, maxAnchors) {
  if (rev <= 0) return 0;
  if (rev < 12) return 0;
  if (rev <= 35) return Math.min(maxAnchors, 2 + Math.min(1, Math.floor(rev / 25)));
  if (rev <= 65) return Math.min(maxAnchors, 4 + Math.floor((rev - 30) / 8));
  return Math.min(maxAnchors, 8 + Math.floor((rev - 65) / 4));
}

/**
 * Night-side fire flare-ups at real city locations (sampled from earth_night.jpg).
 * @param {THREE.Object3D} planet
 * @param {THREE.Vector3} lightDir normalized sun direction
 */
export async function createUnrestVfx(planet, lightDir) {
  if (!USE_UNREST) return noop;

  try {
    const nightMap = await loadNightLightMap();
    const sites = buildCityAnchors(nightMap, MAX_CITY_ANCHORS);
    if (sites.length === 0) {
      console.warn("[unrest] no city anchors found, disabled");
      return noop;
    }

    const glowTex = new THREE.TextureLoader().load(GLOW_TEX);
    glowTex.encoding = THREE.sRGBEncoding;

    const coreEmitter = new SpriteParticleEmitter(planet, {
      texture: glowTex,
      poolSize: 220,
      renderOrder: 2,
    });
    const haloEmitter = new SpriteParticleEmitter(planet, {
      texture: glowTex,
      poolSize: 120,
      renderOrder: 1,
    });

    const jitterAt = (site, spread) => {
      _pos.copy(site.localNormal).multiplyScalar(SURFACE_RADIUS);
      _jitter.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
      _jitter.addScaledVector(site.localNormal, -_jitter.dot(site.localNormal));
      if (_jitter.lengthSq() > 1e-6) {
        _jitter.normalize().multiplyScalar(spread * Math.random());
        _pos.add(_jitter);
      }
      return _pos;
    };

    const emitCluster = (site, t, revNorm) => {
      const flicker = 0.55 + 0.45 * Math.sin(t * 18 + site.phase);
      const sizePulse = 0.88 + Math.random() * 0.35;

      const corePos = jitterAt(site, 0.012);
      _vel.copy(site.localNormal).multiplyScalar(0.018 + Math.random() * 0.014);
      if (_jitter.lengthSq() > 1e-6) {
        _tangent.copy(_jitter).normalize().multiplyScalar((Math.random() - 0.5) * 0.008);
        _vel.add(_tangent);
      }

      coreEmitter.emit({
        position: corePos,
        velocity: _vel,
        lifetime: 0.9 + Math.random() * 1.1,
        startSize: (0.04 + Math.random() * 0.04) * sizePulse,
        endSize: 0.008 + Math.random() * 0.01,
        startColor: FIRE_CORE,
        endColor: FIRE_DARK_RED,
        startOpacity: (0.55 + revNorm * 0.45) * flicker,
        endOpacity: 0,
      });

      if (Math.random() < 0.65) {
        coreEmitter.emit({
          position: jitterAt(site, 0.018),
          velocity: _vel.clone().multiplyScalar(0.7),
          lifetime: 0.7 + Math.random() * 0.8,
          startSize: (0.03 + Math.random() * 0.03) * sizePulse,
          endSize: 0.006,
          startColor: FIRE_CORE,
          endColor: FIRE_DARK_RED,
          startOpacity: (0.4 + revNorm * 0.4) * flicker,
          endOpacity: 0,
        });
      }

      haloEmitter.emit({
        position: jitterAt(site, 0.025),
        velocity: _vel.clone().multiplyScalar(0.35),
        lifetime: 1.4 + Math.random() * 1.2,
        startSize: 0.12 + Math.random() * 0.06,
        endSize: 0.04 + Math.random() * 0.03,
        startColor: FIRE_HALO,
        endColor: 0x220404,
        startOpacity: (0.18 + revNorm * 0.28) * (0.7 + flicker * 0.3),
        endOpacity: 0,
      });
    };

    return {
      /**
       * @param {number} t
       * @param {number} delta
       * @param {number} revolutionNorm 0..1
       */
      update(t, delta, revolutionNorm) {
        try {
          coreEmitter.update(delta);
          haloEmitter.update(delta);

          const rev = revolutionNorm * 100;
          const activeCount = activeAnchorCount(rev, sites.length);
          if (activeCount <= 0) return;

          const emitRate = revolutionNorm * 14;

          for (let i = 0; i < activeCount; i++) {
            const site = sites[i];
            _worldNormal.copy(site.localNormal).applyQuaternion(planet.quaternion);
            if (_worldNormal.dot(lightDir) >= -0.03) continue;

            site.emitAcc += delta * emitRate;
            while (site.emitAcc >= 1) {
              site.emitAcc -= 1;
              emitCluster(site, t, revolutionNorm);
            }
          }
        } catch (e) {
          console.error("[unrest] update error, skipping frame", e);
        }
      },
      dispose() {
        glowTex.dispose();
        coreEmitter.dispose();
        haloEmitter.dispose();
      },
    };
  } catch (e) {
    console.error("[unrest] init failed, disabled", e);
    return noop;
  }
}
