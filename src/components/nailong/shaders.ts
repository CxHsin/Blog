// Ribbon geometry and unraveling adapted from Clément Grellier's Unwoven (MIT).
// See UNWOVEN-LICENSE.md in this directory.
export const vertexShader = /* glsl */ `
attribute float aThread;
attribute float aRim;
uniform float uTime;
uniform float uSeed;
uniform float uWave;
uniform float uPitch;
uniform float uHeight;
uniform vec2 uViewport;
uniform float uMotion;
varying vec2 vUv;
varying float vTear;
varying float vRim;
varying float vRandom;
float hash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }
void main() {
  vUv = uv;
  vRim = aRim;
  vec4 world = modelMatrix * vec4(position, 1.0);
  // Saurow's speed-driven wave: frequency depends on pitch, never image count.
  float phase = world.x * 6.283185 / (1.82 * uPitch);
  float s = sin(phase), c = cos(phase);
  world.x += s * c * uWave * -0.05;
  world.y += s * uWave * uHeight * 0.8;
  world.z += (c * uHeight * 0.8 + position.y * s * uHeight * 0.2) * uWave;
  vec4 projected = projectionMatrix * viewMatrix * world;
  float screenX = projected.x / projected.w;
  float zone = min(0.52, 760.0 / uViewport.x);
  float tear = smoothstep(1.0 - zone, 1.0, abs(screenX)) * uMotion;
  float direction = screenX < 0.0 ? -1.0 : 1.0;
  float randomA = hash(aThread + uSeed * 57.0);
  float randomB = hash(aThread * 3.7 + uSeed * 91.0);
  vRandom = randomA;
  float t = pow(tear, 1.4);
  float run = t * (60.0 + randomA * 420.0);
  run *= 0.85 + 0.15 * sin(uTime * (1.0 + randomB * 2.0) + randomA * 6.2831);
  // Displace in clip space to preserve the reference's CSS-pixel tear zones.
  projected.x += direction * run * 2.0 / uViewport.x * projected.w;
  float drift = (randomA - 0.5) * 170.0 * t * t;
  drift += sin(screenX * uViewport.x * 0.01 + uTime * (1.6 + randomA * 2.2) + randomA * 6.2831) * (5.0 + 13.0 * randomA) * t;
  projected.y += drift * 2.0 / uViewport.y * projected.w;
  vTear = tear;
  gl_Position = projected;
}
`
export const fragmentShader = /* glsl */ `
uniform sampler2D uMap;
uniform vec2 uCrop;
uniform vec2 uCardSize;
uniform vec3 uBackground;
varying vec2 vUv;
varying float vTear;
varying float vRim;
varying float vRandom;
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  float tear = vTear, rim = abs(vRim);
  float coreWidth = mix(0.8, 0.16 + vRandom * 0.12, smoothstep(0.0, 0.85, tear));
  float threadAlpha = 1.0 - smoothstep(coreWidth - 0.10, coreWidth + 0.06, rim);
  threadAlpha = mix(1.0, threadAlpha, smoothstep(0.03, 0.30, tear));
  float cardAlpha = 1.0 - smoothstep(-1.5, 0.5, sdRoundBox((vUv - 0.5) * uCardSize, uCardSize * 0.5, 12.0));
  vec4 sampleColor = texture2D(uMap, (vUv - 0.5) * uCrop + 0.5);
  float alpha = sampleColor.a * cardAlpha * threadAlpha * (1.0 - smoothstep(0.75, 1.0, tear) * 0.65);
  if (alpha < 0.003) discard;
  vec3 color = sampleColor.rgb;
  color *= 1.0 - tear * 0.4 * rim * rim;
  color += tear * 0.18 * (1.0 - smoothstep(0.0, 0.45, rim));
  color = mix(color, uBackground, smoothstep(0.55, 1.0, tear) * 0.8);
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
