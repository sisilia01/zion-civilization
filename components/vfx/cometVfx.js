import * as THREE from "three";
import { SpriteParticleEmitter } from "./SpriteParticleEmitter";

export const USE_COMETS = true;

const COMET_TEXTURE_PATH = "/textures/comet_glow.png";
const COMET_HEAD_SCALE = 0.07;
const COMET_SPAWN_MIN = 15;
const COMET_SPAWN_MAX = 20;
const COMET_FIRST_SPAWN = 4;
const COMET_EMIT_RATE = 135;
const COMET_SPEED = 8.7;
const COMET_CROSS_TIME = 1.8;
const HEAD_FADE_IN = 0.22;
const HEAD_FADE_OUT = 0.38;

const _spawnPos = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _spread = new THREE.Vector3();

/**
 * Comet VFX: bright head sprite + pooled trail particles fading/shrinking away from sun.
 * @param {THREE.Scene} scene
 * @param {THREE.Vector3} sunDir normalized e.g. (3,2,5)
 */
export function createCometVfx(scene, sunDir) {
  if (!USE_COMETS) {
    return { update() {}, dispose() {} };
  }

  const tailAway = sunDir.clone().normalize().multiplyScalar(-1);
  const glowTex = new THREE.TextureLoader().load(COMET_TEXTURE_PATH);
  glowTex.colorSpace = THREE.SRGBColorSpace;

  const headMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xd8eeff,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const cometGroup = new THREE.Group();
  cometGroup.visible = false;
  cometGroup.renderOrder = -5;

  const head = new THREE.Sprite(headMat);
  head.scale.set(COMET_HEAD_SCALE, COMET_HEAD_SCALE, 1);
  head.frustumCulled = false;
  cometGroup.add(head);
  scene.add(cometGroup);

  const trail = new SpriteParticleEmitter(scene, {
    texture: glowTex,
    poolSize: 128,
    renderOrder: -6,
  });

  const state = {
    active: false,
    life: 0,
    maxLife: COMET_CROSS_TIME,
    emitAcc: 0,
    start: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    perp: new THREE.Vector3(),
    arcAmp: 0.3,
    nextSpawn: COMET_FIRST_SPAWN,
  };

  const scheduleNext = (t) => {
    state.nextSpawn = t + COMET_SPAWN_MIN + Math.random() * (COMET_SPAWN_MAX - COMET_SPAWN_MIN);
  };

  const spawnComet = () => {
    const z = -9 - Math.random() * 4;
    const fromLeft = Math.random() > 0.5;
    const y = (Math.random() > 0.5 ? 1.5 : -1.5) + (Math.random() - 0.5) * 1.8;
    state.start.set(fromLeft ? -6 : 6, y, z);
    const diagY = (Math.random() > 0.5 ? 1 : -1) * (0.28 + Math.random() * 0.32);
    state.velocity
      .set(fromLeft ? 1 : -1, diagY, (Math.random() - 0.5) * 0.14)
      .normalize()
      .multiplyScalar(COMET_SPEED);
    _spread.crossVectors(state.velocity, tailAway);
    if (_spread.lengthSq() < 1e-4) _spread.set(0, 1, 0);
    state.perp.copy(_spread.normalize());
    state.arcAmp = 0.32 + Math.random() * 0.28;
    state.maxLife = COMET_CROSS_TIME + Math.random() * 0.35;
    state.life = 0;
    state.emitAcc = 0;
    state.active = true;
    cometGroup.visible = true;
    headMat.opacity = 0;
    console.log("[comet] spawned");
  };

  const emitTrail = (headWorld) => {
    _vel.copy(tailAway).multiplyScalar(2.2 + Math.random() * 1.1);
    _spread.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.06);
    _vel.add(_spread);

    trail.emit({
      position: headWorld,
      velocity: _vel,
      lifetime: 0.55 + Math.random() * 0.38,
      startSize: 0.05 + Math.random() * 0.025,
      endSize: 0.004 + Math.random() * 0.006,
      startColor: 0xd0ecff,
      endColor: 0x3060a0,
      startOpacity: 0.85,
      endOpacity: 0,
    });
  };

  return {
    update(t, delta) {
      if (!state.active && t >= state.nextSpawn) spawnComet();

      trail.update(delta);

      if (!state.active) return;

      state.life += delta;

      _spawnPos.copy(state.start);
      _spawnPos.addScaledVector(state.velocity, state.life);
      const arcT = state.life * 1.35;
      _spawnPos.addScaledVector(state.perp, Math.sin(arcT) * state.arcAmp);
      _spawnPos.y += Math.sin(arcT * 0.65) * state.arcAmp * 0.35;
      cometGroup.position.copy(_spawnPos);

      const fadeIn = Math.min(1, state.life / HEAD_FADE_IN);
      const fadeOut = Math.min(1, (state.maxLife - state.life) / HEAD_FADE_OUT);
      headMat.opacity = fadeIn * fadeOut;

      state.emitAcc += delta * COMET_EMIT_RATE;
      while (state.emitAcc >= 1) {
        emitTrail(_spawnPos);
        state.emitAcc -= 1;
      }

      const done = state.life >= state.maxLife || Math.abs(_spawnPos.x) > 9 || _spawnPos.z > -4;
      if (done) {
        state.active = false;
        cometGroup.visible = false;
        scheduleNext(t);
      }
    },
    dispose() {
      headMat.dispose();
      glowTex.dispose();
      if (cometGroup.parent) cometGroup.parent.remove(cometGroup);
      trail.dispose();
    },
  };
}
