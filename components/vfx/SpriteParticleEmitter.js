import * as THREE from "three";

/**
 * Lightweight pooled billboard sprite emitter for r128 VFX.
 * Particles lerp size, color, and opacity over lifetime — reusable across effects.
 */
export class SpriteParticleEmitter {
  /**
   * @param {THREE.Scene} scene
   * @param {{
   *   texture: THREE.Texture,
   *   poolSize?: number,
   *   blending?: number,
   *   renderOrder?: number,
   * }} options
   */
  constructor(scene, { texture, poolSize = 64, blending = THREE.AdditiveBlending, renderOrder = -5 }) {
    this.group = new THREE.Group();
    this.group.renderOrder = renderOrder;
    /** @type {Array<{
     *   sprite: THREE.Sprite,
     *   mat: THREE.SpriteMaterial,
     *   alive: boolean,
     *   age: number,
     *   lifetime: number,
     *   position: THREE.Vector3,
     *   velocity: THREE.Vector3,
     *   startSize: number,
     *   endSize: number,
     *   startColor: THREE.Color,
     *   endColor: THREE.Color,
     *   startOpacity: number,
     *   endOpacity: number,
     * }>} */
    this.particles = [];

    for (let i = 0; i < poolSize; i++) {
      const mat = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        blending,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.frustumCulled = false;
      this.group.add(sprite);
      this.particles.push({
        sprite,
        mat,
        alive: false,
        age: 0,
        lifetime: 1,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        startSize: 0.1,
        endSize: 0.01,
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(0.5, 0.7, 1),
        startOpacity: 1,
        endOpacity: 0,
      });
    }

    scene.add(this.group);
    this._poolCursor = 0;
  }

  /**
   * @param {{
   *   position: THREE.Vector3,
   *   velocity?: THREE.Vector3,
   *   lifetime?: number,
   *   startSize?: number,
   *   endSize?: number,
   *   startColor?: THREE.Color | number | string,
   *   endColor?: THREE.Color | number | string,
   *   startOpacity?: number,
   *   endOpacity?: number,
   * }} cfg
   */
  emit(cfg) {
    const p = this.particles[this._poolCursor];
    this._poolCursor = (this._poolCursor + 1) % this.particles.length;

    p.alive = true;
    p.age = 0;
    p.lifetime = cfg.lifetime ?? 1;
    p.position.copy(cfg.position);
    p.velocity.copy(cfg.velocity ?? new THREE.Vector3());
    p.startSize = cfg.startSize ?? 0.1;
    p.endSize = cfg.endSize ?? 0.01;
    p.startColor.set(cfg.startColor ?? 0xffffff);
    p.endColor.set(cfg.endColor ?? 0x8888ff);
    p.startOpacity = cfg.startOpacity ?? 1;
    p.endOpacity = cfg.endOpacity ?? 0;
    p.sprite.visible = true;
  }

  /** @param {number} delta */
  update(delta) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;

      p.age += delta;
      if (p.age >= p.lifetime) {
        p.alive = false;
        p.sprite.visible = false;
        p.mat.opacity = 0;
        continue;
      }

      const t = p.age / p.lifetime;
      p.position.addScaledVector(p.velocity, delta);
      p.sprite.position.copy(p.position);

      const size = p.startSize + (p.endSize - p.startSize) * t;
      p.sprite.scale.set(size, size, 1);
      p.mat.color.copy(p.startColor).lerp(p.endColor, t);
      p.mat.opacity = p.startOpacity + (p.endOpacity - p.startOpacity) * t;
      p.sprite.visible = p.mat.opacity > 0.008;
    }
  }

  dispose() {
    this.particles.forEach((p) => {
      p.mat.dispose();
    });
    if (this.group.parent) this.group.parent.remove(this.group);
    this.particles.length = 0;
  }
}
