/** Shader storms disabled — use sprite overlays instead. */
export const USE_STORMS = false;
export const FORCE_STORM_NUCLEAR = false;

export const TEXTURED_CLOUD_VERT = `
varying vec2 vUv;
varying vec3 vWorldNormal;
void main() {
  vUv = uv;
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const TEXTURED_CLOUD_FRAG = `
uniform sampler2D uCloudMap;
uniform vec3 uLightDir;
uniform float uProsperity;
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorldNormal;
void main() {
  vec4 tex = texture2D(uCloudMap, vUv);
  if (tex.a < 0.03) discard;
  float sunDot = dot(normalize(vWorldNormal), normalize(uLightDir));
  float nightSide = smoothstep(0.06, -0.08, sunDot);
  float stormHash = fract(sin(dot(floor(vUv * 48.0), vec2(127.1, 311.7))) * 43758.5453);
  float flashPeriod = stormHash * 14.0 + 18.0;
  float flashPhase = fract(uTime / flashPeriod + stormHash * 4.1);
  float flash = smoothstep(0.0, 0.01, flashPhase) * (1.0 - smoothstep(0.01, 0.09, flashPhase));
  flash *= step(0.93, stormHash) * nightSide * uProsperity * tex.a;
  vec3 col = tex.rgb + vec3(0.72, 0.88, 1.0) * flash * 3.0;
  gl_FragColor = vec4(col, tex.a * 0.88);
}
`;
