/**
 * Shader Materials Library — GPU programs for spell/environment effects.
 * Each shader has GLSL vertex + fragment code and configurable uniforms.
 */

import * as THREE from 'three';

export const ShaderLibrary = {
  fireball: {
    uniforms: {
      time: { value: 0 }, color1: { value: new THREE.Color(0xff4400) },
      color2: { value: new THREE.Color(0xffcc00) }, noiseScale: { value: 2.0 }, pulseSpeed: { value: 3.0 }
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vNormal; varying vec3 vPosition;
      void main() { vUv = uv; vNormal = normalize(normalMatrix * normal); vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float time; uniform vec3 color1; uniform vec3 color2; uniform float noiseScale; uniform float pulseSpeed;
      varying vec2 vUv; varying vec3 vNormal; varying vec3 vPosition;
      float noise(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main() {
        float n = noise(vPosition * noiseScale + time);
        float pulse = 0.5 + 0.5 * sin(time * pulseSpeed);
        float mixFactor = n * 0.5 + 0.5 * (1.0 - length(vUv - 0.5) * 2.0);
        vec3 color = mix(color1, color2, mixFactor * pulse);
        float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
        color += fresnel * 0.5;
        gl_FragColor = vec4(color, 1.0); }`
  },
  frost: {
    uniforms: {
      time: { value: 0 }, color1: { value: new THREE.Color(0x88ccff) },
      color2: { value: new THREE.Color(0xffffff) }, shimmerSpeed: { value: 2.0 }
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vNormal;
      void main() { vUv = uv; vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float time; uniform vec3 color1; uniform vec3 color2; uniform float shimmerSpeed;
      varying vec2 vUv; varying vec3 vNormal;
      void main() {
        float shimmer = sin(vUv.x * 20.0 + time * shimmerSpeed) * sin(vUv.y * 20.0 + time * shimmerSpeed * 0.7);
        shimmer = shimmer * 0.5 + 0.5;
        vec3 color = mix(color1, color2, shimmer);
        float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
        color += fresnel * vec3(0.5, 0.8, 1.0);
        gl_FragColor = vec4(color, 0.7 + shimmer * 0.3); }`
  },
  shadowBolt: {
    uniforms: { time: { value: 0 }, color1: { value: new THREE.Color(0x220033) }, color2: { value: new THREE.Color(0x8800ff) } },
    vertexShader: `varying vec2 vUv; varying vec3 vPosition;
      void main() { vUv = uv; vPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float time; uniform vec3 color1; uniform vec3 color2; varying vec2 vUv; varying vec3 vPosition;
      void main() {
        float angle = atan(vPosition.y, vPosition.x) + time;
        float swirl = sin(angle * 5.0 + length(vPosition.xy) * 10.0 - time * 3.0) * 0.5 + 0.5;
        vec3 color = mix(color1, color2, swirl);
        float dist = length(vUv - 0.5) * 2.0;
        color = mix(color, color2, pow(dist, 2.0));
        gl_FragColor = vec4(color, 1.0); }`
  },
  heal: {
    uniforms: { time: { value: 0 }, color1: { value: new THREE.Color(0x44ff44) }, color2: { value: new THREE.Color(0xffffaa) } },
    vertexShader: `varying vec2 vUv; varying vec3 vNormal;
      void main() { vUv = uv; vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float time; uniform vec3 color1; uniform vec3 color2; varying vec2 vUv; varying vec3 vNormal;
      void main() {
        float particles = sin(vUv.y * 30.0 + time * 5.0) * sin(vUv.x * 20.0);
        particles = smoothstep(0.7, 1.0, particles);
        vec3 color = mix(color1, color2, vUv.y) + particles * vec3(1.0, 1.0, 0.5);
        float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
        color += fresnel * color2;
        gl_FragColor = vec4(color, 0.6 + particles * 0.4); }`
  },
  animatedSurface: {
    uniforms: {
      time: { value: 0 }, color1: { value: new THREE.Color(0x0044aa) },
      color2: { value: new THREE.Color(0x0088ff) }, waveSpeed: { value: 1.0 }, waveScale: { value: 5.0 }
    },
    vertexShader: `uniform float time; uniform float waveSpeed; uniform float waveScale;
      varying vec2 vUv; varying float vWave;
      void main() { vUv = uv;
        float wave = sin(position.x * waveScale + time * waveSpeed) * cos(position.z * waveScale + time * waveSpeed * 0.7) * 0.2;
        vWave = wave; vec3 pos = position; pos.y += wave;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0); }`,
    fragmentShader: `uniform float time; uniform vec3 color1; uniform vec3 color2; varying vec2 vUv; varying float vWave;
      void main() {
        float ripple = sin(vUv.x * 20.0 + time) * sin(vUv.y * 20.0 + time * 0.8) * 0.5 + 0.5;
        vec3 color = mix(color1, color2, vWave * 2.0 + 0.5 + ripple * 0.3) + vec3(pow(ripple, 4.0) * 0.5);
        gl_FragColor = vec4(color, 0.8); }`
  },
  arenaGround: {
    uniforms: {
      time: { value: 0 }, colorA: { value: new THREE.Color(0x1a1a2e) },
      colorB: { value: new THREE.Color(0x16213e) }, gridColor: { value: new THREE.Color(0x3366ff) }, gridOpacity: { value: 0.15 }
    },
    vertexShader: `varying vec2 vUv; varying vec3 vPosition;
      void main() { vUv = uv; vPosition = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float time; uniform vec3 colorA; uniform vec3 colorB; uniform vec3 gridColor; uniform float gridOpacity;
      varying vec2 vUv; varying vec3 vPosition;
      void main() {
        float dist = length(vPosition.xz) / 30.0;
        vec3 color = mix(colorA, colorB, dist);
        float gridX = step(0.95, mod(vPosition.x, 2.0) / 2.0) + step(mod(vPosition.x, 2.0) / 2.0, 0.05);
        float gridZ = step(0.95, mod(vPosition.z, 2.0) / 2.0) + step(mod(vPosition.z, 2.0) / 2.0, 0.05);
        float pulse = 0.5 + 0.5 * sin(time * 0.5);
        color = mix(color, gridColor, max(gridX, gridZ) * gridOpacity * pulse);
        gl_FragColor = vec4(color, 1.0); }`
  }
};

export function createShaderMaterial(shaderName) {
  const shader = ShaderLibrary[shaderName];
  if (!shader) {
    console.error(`Shader not found: ${shaderName}`);
    return new THREE.MeshBasicMaterial({ color: 0xff00ff });
  }
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(shader.uniforms),
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    transparent: true, side: THREE.DoubleSide
  });
}
