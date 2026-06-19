import * as THREE from "three";

export const USE_STORM_SPRITES = true;

export const TEST_STORM_SPRITE_COUNT = 2;
export const TEST_STORM_SPRITE_INTENSITY = 1.0;

const HURRICANE_TEX = "/textures/hurricane.png";
const SURFACE_RADIUS = 1.014;
const STORM_SIZE = 0.18;
const SPIN_PER_FRAME = 0.012;

const STORM_SITES = [
  { lat: 22, lon: -58, driftLat: 0.08, driftLon: 0.12 },
  { lat: 14, lon: -135, driftLat: -0.05, driftLon: 0.1 },
];

const HURRICANE_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const HURRICANE_FRAG = `
uniform sampler2D uMap;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec4 tex = texture2D(uMap, vUv);
  float lum = max(tex.r, max(tex.g, tex.b));
  vec2 centered = vUv - 0.5;
  float dist = length(centered) * 2.0;
  float edge = 1.0 - smoothstep(0.68, 0.98, dist);
  float alpha = lum * edge * uOpacity;
  vec3 glow = mix(tex.rgb, vec3(0.96, 0.98, 1.0), 0.35) * lum;
  gl_FragColor = vec4(glow, alpha);
}
`;

const _zAxis = new THREE.Vector3(0, 0, 1);
const _worldNormal = new THREE.Vector3();
const _pos = new THREE.Vector3();
const noop = { update() {}, dispose() {} };

/** @param {number} lat @param {number} lon @returns {THREE.Vector3} */
function latLonToNormal(lat, lon) {
  const latR = (lat * Math.PI) / 180;
  const lonR = (lon * Math.PI) / 180;
  const cosLat = Math.cos(latR);
  return new THREE.Vector3(
    cosLat * Math.sin(lonR),
    Math.sin(latR),
    cosLat * Math.cos(lonR)
  );
}

/** @param {THREE.Texture} tex */
function createHurricaneMaterial(tex) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: tex },
      uOpacity: { value: 0.92 },
    },
    vertexShader: HURRICANE_VERT,
    fragmentShader: HURRICANE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
}

/**
 * Hurricane discs tangent to the planet — luminance-masked, no square halo.
 * @param {THREE.Object3D} planet
 * @param {THREE.Vector3} lightDir
 */
export function createStormSpriteVfx(planet, lightDir) {
  if (!USE_STORM_SPRITES) return noop;

  try {
    const tex = new THREE.TextureLoader().load(
      HURRICANE_TEX,
      () => console.log("[storm sprites] hurricane texture loaded:", HURRICANE_TEX),
      undefined,
      (err) => console.error("[storm sprites] texture load failed:", err)
    );
    tex.encoding = THREE.sRGBEncoding;

    const group = new THREE.Group();
    group.renderOrder = 3;
    planet.add(group);

    const planeGeo = new THREE.PlaneGeometry(STORM_SIZE, STORM_SIZE);

    /** @type {Array<{ anchor: THREE.Object3D, plane: THREE.Mesh, mat: THREE.ShaderMaterial, userData: object }>} */
    const storms = STORM_SITES.map((site, i) => {
      const mat = createHurricaneMaterial(tex);
      const plane = new THREE.Mesh(planeGeo, mat);
      plane.frustumCulled = false;
      plane.renderOrder = 3;

      const anchor = new THREE.Object3D();
      const localNormal = latLonToNormal(site.lat, site.lon);
      anchor.position.copy(localNormal).multiplyScalar(SURFACE_RADIUS);
      anchor.quaternion.setFromUnitVectors(_zAxis, localNormal.clone().normalize());
      anchor.add(plane);

      anchor.userData = {
        lat: site.lat,
        lon: site.lon,
        driftLat: site.driftLat,
        driftLon: site.driftLon,
        localNormal: localNormal.clone(),
        spinDir: i === 0 ? 1 : -1,
      };

      group.add(anchor);
      return { anchor, plane, mat, userData: anchor.userData };
    });

    console.log("[storm sprites] tangent planes enabled, count:", TEST_STORM_SPRITE_COUNT);

    return {
      update(_t, delta, intensity, count, frameScale = delta * 60) {
        const active = Math.min(Math.max(0, Math.floor(count)), storms.length);
        for (let i = 0; i < storms.length; i++) {
          const { anchor, plane, mat, userData: ud } = storms[i];
          if (i >= active || intensity <= 0.01) {
            anchor.visible = false;
            continue;
          }
          anchor.visible = true;

          ud.lat += ud.driftLat * delta;
          ud.lon += ud.driftLon * delta;
          ud.localNormal.copy(latLonToNormal(ud.lat, ud.lon));

          _pos.copy(ud.localNormal).multiplyScalar(SURFACE_RADIUS);
          anchor.position.copy(_pos);
          anchor.quaternion.setFromUnitVectors(_zAxis, ud.localNormal.clone().normalize());

          _worldNormal.copy(ud.localNormal).applyQuaternion(planet.quaternion);
          anchor.visible = _worldNormal.dot(lightDir) > 0.04;

          plane.rotation.z += SPIN_PER_FRAME * frameScale * ud.spinDir;
          mat.uniforms.uOpacity.value = 0.78 + intensity * 0.2;
        }
      },
      dispose() {
        tex.dispose();
        planeGeo.dispose();
        storms.forEach(({ mat }) => mat.dispose());
        if (group.parent) group.parent.remove(group);
      },
    };
  } catch (e) {
    console.error("[storm sprites] init failed, disabled", e);
    return noop;
  }
}
