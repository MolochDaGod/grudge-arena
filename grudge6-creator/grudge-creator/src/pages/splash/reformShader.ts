/**
 * "Reform" / particle-warp-in shader hook.
 *
 * Inspired by the three.js dynamic-particles + postprocessing demo: each
 * vertex starts scattered (with a swirl) and converges to its true position
 * as `uReform` ramps 0 → 1. The character literally assembles out of nothing.
 *
 * Implementation notes
 * ────────────────────
 * • We patch a stock MeshStandardMaterial via `onBeforeCompile` rather than
 *   writing a custom ShaderMaterial. This preserves all the PBR lighting,
 *   IBL, fog, etc. — we're only adding a vertex displacement and an alpha
 *   ramp on top.
 *
 * • The displacement is injected AFTER `<skinning_vertex>` (not after
 *   `<begin_vertex>`). For skinned meshes this matters: if we scatter
 *   pre-skinning, the skin matrix yanks every vertex back toward its bone
 *   and the effect collapses. Post-skinning, the scatter is applied in
 *   mesh-local-post-skin space — clean explosion / convergence regardless
 *   of pose.
 *
 * • Per-vertex random direction is derived from the vertex's own object-
 *   space position via a 3D hash. That keeps the scatter direction stable
 *   per vertex (no per-frame jitter / shimmer) and identical across mesh
 *   re-binds (no re-sampling needed when the same model spawns again).
 *
 * • Uniforms are CLOSED OVER per material — three.js calls `onBeforeCompile`
 *   once per material, with that material's own `shader.uniforms` object.
 *   Each Champion gets its own uReform / uTime values, even though the
 *   underlying program is shared (cacheKey unchanged).
 */
import * as THREE from 'three';

export interface ReformHandle {
  /** 0 = fully scattered, 1 = fully assembled. */
  setReform(v: number, timeSec: number): void;
  /** Disposes of the override (no-op for now — material lifetime owns it). */
  dispose(): void;
}

const VERT_HEADER = /* glsl */`
uniform float uReform;
uniform float uTime;

vec3 _reformHash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7,  74.7)),
           dot(p, vec3(269.5, 183.3, 246.1)),
           dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123) - 0.5;
}
`;

const VERT_DISPLACE = /* glsl */`
{
  // s ∈ [0,1]: 1 = fully scattered, 0 = fully assembled.
  // Easing pow(., 1.6) makes the final 20% of the assembly snap in tight,
  // which reads as "particles slamming into place" rather than a linear melt.
  float s = pow(1.0 - clamp(uReform, 0.0, 1.0), 1.6);

  // Per-vertex stable scatter direction, biased downward + outward so the
  // body looks like it's coalescing UP from the ground.
  vec3 dir = _reformHash3(position) + vec3(0.0, -0.45, 0.0);
  dir = normalize(dir);

  // Swirl the scatter around Y over time — the further out, the more swirl.
  float swirl = s * 1.6 + uTime * 1.4;
  float c = cos(swirl), si = sin(swirl);
  vec3 disp = dir * s * 1.7;
  vec3 swirled = vec3(c * disp.x - si * disp.z, disp.y, si * disp.x + c * disp.z);

  transformed += swirled;
}
`;

const FRAG_HEADER = /* glsl */`
uniform float uReform;
`;

const FRAG_ALPHA = /* glsl */`
// Fade alpha in alongside the assembly. The smoothstep keeps the body fully
// transparent for the first 5% (only particles flying around) and fully
// opaque past 60%, giving the "ghost coalescing into solid form" beat.
diffuseColor.a *= smoothstep(0.05, 0.60, uReform);
`;

const FRAG_EMISSIVE = /* glsl */`
// Pump emissive while reforming so the particles glow against the void.
// Decays to 0 by the time the model is solid.
totalEmissiveRadiance += vec3(0.55, 0.75, 1.10) * (1.0 - smoothstep(0.0, 0.85, uReform)) * 1.2;
`;

export function attachReformShader(mat: THREE.Material): ReformHandle {
  const std = mat as THREE.MeshStandardMaterial;

  // Transparency + no depth-write while dissolved — we'll restore both once
  // the body is fully solid so it joins the depth buffer for shadows / fog.
  std.transparent = true;
  std.depthWrite = false;
  std.side = THREE.DoubleSide; // scattered triangles can flip — render both faces

  const u = {
    uReform: { value: 0 },
    uTime:   { value: 0 },
  };

  // Stash so callers can find/reuse the uniform without going through onBeforeCompile.
  (std.userData as any).reformU = u;

  std.onBeforeCompile = (shader) => {
    shader.uniforms.uReform = u.uReform;
    shader.uniforms.uTime   = u.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',          `#include <common>\n${VERT_HEADER}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${VERT_DISPLACE}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',                  `#include <common>\n${FRAG_HEADER}`)
      .replace('#include <alphamap_fragment>',       `#include <alphamap_fragment>\n${FRAG_ALPHA}`)
      .replace('#include <emissivemap_fragment>',    `#include <emissivemap_fragment>\n${FRAG_EMISSIVE}`);
  };

  // Force re-compile if the material was already used before patching.
  std.needsUpdate = true;

  let solidified = false;
  return {
    setReform(v: number, timeSec: number) {
      u.uReform.value = v;
      u.uTime.value   = timeSec;
      if (!solidified && v >= 0.999) {
        solidified = true;
        std.transparent = false;
        std.depthWrite  = true;
        std.side        = THREE.FrontSide;
        std.needsUpdate = true;
      }
    },
    dispose() {
      // The material itself is owned by the Champion and disposed there.
    },
  };
}
