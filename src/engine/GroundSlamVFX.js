/**
 * GroundSlamVFX — Hammer Slam / Meteor Impact / AoE ground collision effect.
 *
 * Procedural Three.js effect, no GLB required.
 * Call `spawnGroundSlamVFX(scene, worldPosition, opts)` when a ground-based AoE
 * skill lands. Call `updateGroundSlamVFX(dt)` once per frame from the game loop.
 *
 * Layers (all world-space, pinned to ground plane Y=origin.y):
 *   1. Center flash disc    — immediate bright disc, fades in 0.25s
 *   2. Shockwave ring       — EllipseCurve→CatmullRomCurve3→TubeGeometry, expands in 0.65s
 *   3. Crack lines          — CatmullRomCurve3 spline arms → LineSegments, fade in 1.2s
 *   4. Rock debris points   — upward + outward particles, gravity-affected, 1.0s
 *
 * Usage:
 *   import { spawnGroundSlamVFX, updateGroundSlamVFX } from './GroundSlamVFX.js';
 *
 *   // On skill apply (pass world-space hit center):
 *   spawnGroundSlamVFX(scene, hitPosition, { radius: 2.5, color: 0xff6600 });
 *
 *   // In game loop:
 *   updateGroundSlamVFX(delta);
 *
 * Meteor / magical variant — add `meteor: true` to opts for a falling-impact
 * feel (impact circle spawns top-down with a brief vertical streak).
 */

import * as THREE from 'three';

/** Active VFX instances — managed internally. */
const _active = [];

// ─── Shared geometry & material caches ───────────────────────────────────────

/** Cheap point sprite for debris — reused across all instances. */
const _debrisMat = new THREE.PointsMaterial({
  size: 0.12,
  vertexColors: true,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Spawn a ground slam VFX at `origin`.
 *
 * @param {THREE.Scene} scene
 * @param {THREE.Vector3} origin   — world-space center (Y = ground height)
 * @param {object} [opts]
 * @param {number} [opts.radius]   — AoE radius in world units (default 2.5)
 * @param {number} [opts.color]    — hex tint (default 0xff6600 orange-fire)
 * @param {boolean} [opts.meteor]  — true for magical/meteor variant (adds streak)
 * @param {number} [opts.debrisCount] — debris particle count (default 60)
 */
export function spawnGroundSlamVFX(scene, origin, opts = {}) {
  const radius       = opts.radius       ?? 2.5;
  const color        = opts.color        ?? 0xff6600;
  const meteor       = opts.meteor       ?? false;
  const debrisCount  = opts.debrisCount  ?? 60;

  const group = new THREE.Group();
  group.position.copy(origin);
  scene.add(group);

  const instance = {
    group,
    scene,
    elapsed: 0,
    radius,
    color: new THREE.Color(color),
    // Sub-parts, each with its own lifetime
    flash:     _makeFlash(color),
    ring:      _makeRing(color),
    cracks:    _makeCracks(color, radius),
    debris:    _makeDebris(color, debrisCount, radius),
    streak:    meteor ? _makeStreak(color) : null,
    disposed:  false,
  };

  group.add(instance.flash.mesh);
  group.add(instance.ring.mesh);
  group.add(instance.cracks.mesh);
  group.add(instance.debris.points);
  if (instance.streak) group.add(instance.streak.mesh);

  _active.push(instance);
  return instance;
}

/**
 * Update all active VFX instances. Call once per frame from game loop.
 * @param {number} dt — delta time in seconds
 */
export function updateGroundSlamVFX(dt) {
  for (let i = _active.length - 1; i >= 0; i--) {
    const inst = _active[i];
    inst.elapsed += dt;

    _updateFlash(inst.flash, inst.elapsed);
    _updateRing(inst.ring, inst.radius, inst.elapsed);
    _updateCracks(inst.cracks, inst.elapsed);
    _updateDebris(inst.debris, dt, inst.elapsed);
    if (inst.streak) _updateStreak(inst.streak, inst.elapsed);

    // Dispose when all layers have expired (longest = cracks at 1.2s)
    if (inst.elapsed >= 1.4 && !inst.disposed) {
      _disposeInstance(inst);
      _active.splice(i, 1);
    }
  }
}

/** Immediately remove all active effects (e.g. scene teardown). */
export function disposeAllGroundSlamVFX() {
  for (const inst of _active) _disposeInstance(inst);
  _active.length = 0;
}

// ─── Layer factories ──────────────────────────────────────────────────────────

/** 1. Center flash — flat disc, Y-up, bright and quick */
function _makeFlash(color) {
  const geo = new THREE.CircleGeometry(0.6, 24);
  geo.rotateX(-Math.PI / 2); // lay flat on XZ plane
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return { mesh: new THREE.Mesh(geo, mat), duration: 0.25 };
}

/** 2. Shockwave ring — EllipseCurve → CatmullRomCurve3(closed) → TubeGeometry.
 *  Starts at zero scale, expands outward to full radius in update.
 *  Using a spline-based tube gives a smoother, thicker glowing ring vs a torus. */
function _makeRing(color) {
  // Build a 3D closed loop from an EllipseCurve — same approach as AoEIndicator
  const ellipse = new THREE.EllipseCurve(0, 0, 1, 1, 0, Math.PI * 2, false, 0);
  const pts2d   = ellipse.getPoints(64);
  const pts3d   = pts2d.map(p => new THREE.Vector3(p.x, 0, p.y));

  // CatmullRomCurve3(closed=true) gives a perfectly smooth C2 ring
  const spline = new THREE.CatmullRomCurve3(pts3d, true, 'catmullrom', 0.5);
  const geo    = new THREE.TubeGeometry(spline, 96, 0.055, 8, true);

  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return { mesh: new THREE.Mesh(geo, mat), duration: 0.65 };
}

/** 3. Crack lines — CatmullRomCurve3 per arm → getSpacedPoints → Line.
 *  Each crack is a smooth organic spline with 4-5 control points that jag
 *  outward from the center. Much more natural-looking than straight line segments. */
function _makeCracks(color, radius) {
  const ARM_COUNT   = 8;
  const allPoints   = [];  // all crack vertices concatenated for one LineSegments draw

  for (let s = 0; s < ARM_COUNT; s++) {
    const baseAngle = (s / ARM_COUNT) * Math.PI * 2;

    // Build 4-6 control points per arm, fanning outward with jitter
    const ctrlPts = [ new THREE.Vector3(0, 0.015, 0) ];
    const steps   = 3 + Math.floor(Math.random() * 3);
    let   r       = 0.12;
    let   angle   = baseAngle + (Math.random() - 0.5) * 0.3;

    for (let i = 0; i < steps; i++) {
      r     += (radius / steps) * (0.6 + Math.random() * 0.8);
      angle += (Math.random() - 0.5) * 0.45;
      const clamped = Math.min(r, radius * 1.15);
      ctrlPts.push(new THREE.Vector3(
        Math.cos(angle) * clamped,
        0.015,
        Math.sin(angle) * clamped,
      ));
    }

    // CatmullRomCurve3 — smooth interpolation through the jagged control points
    const spline = new THREE.CatmullRomCurve3(ctrlPts, false, 'centripetal', 0.5);
    const pts    = spline.getSpacedPoints(20); // 20 samples per arm

    // Pack as line segments (pair-wise: [p0,p1, p1,p2, …])
    for (let i = 0; i < pts.length - 1; i++) {
      allPoints.push(pts[i].x, pts[i].y, pts[i].z);
      allPoints.push(pts[i+1].x, pts[i+1].y, pts[i+1].z);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(allPoints), 3));
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return { mesh: new THREE.LineSegments(geo, mat), duration: 1.2 };
}

/** 4. Rock debris — point particles fly up + outward then arc down */
function _makeDebris(color, count, radius) {
  const positions  = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3); // stored separately
  const colors     = new Float32Array(count * 3);
  const sizes      = new Float32Array(count);

  const baseColor = new THREE.Color(color);

  for (let i = 0; i < count; i++) {
    // Start at center with small random offset
    positions[i * 3]     = (Math.random() - 0.5) * 0.4;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.4;

    // Outward velocity + upward arc — halved from original for smaller arena
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.6 + Math.random() * radius * 0.35; // was 1.5 + radius*0.8
    velocities[i * 3]     = Math.cos(angle) * speed;
    velocities[i * 3 + 1] = 0.8 + Math.random() * 1.2; // was 2 + 3
    velocities[i * 3 + 2] = Math.sin(angle) * speed;

    // Color varies slightly (lighter = more yellow/white for rock dust)
    const bright = 0.6 + Math.random() * 0.4;
    colors[i * 3]     = baseColor.r * bright;
    colors[i * 3 + 1] = baseColor.g * bright;
    colors[i * 3 + 2] = baseColor.b * bright;

    sizes[i] = 0.06 + Math.random() * 0.1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));

  const mat = _debrisMat.clone();

  const points = new THREE.Points(geo, mat);

  return { points, positions, velocities, count, duration: 1.0 };
}

/** Meteor/magic variant — vertical streak above origin that shrinks on impact */
function _makeStreak(color) {
  const vertices = [0, 0, 0,  0, 3.5, 0]; // vertical line, 3.5 units tall
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    linewidth: 2,
  });
  return { mesh: new THREE.Line(geo, mat), duration: 0.2 };
}

// ─── Layer update functions ───────────────────────────────────────────────────

function _updateFlash(layer, t) {
  const p = Math.min(1, t / layer.duration);
  layer.mesh.material.opacity = Math.pow(1 - p, 0.4); // stays bright then drops
  const s = 1 + p * 1.8;
  layer.mesh.scale.set(s, 1, s);
}

function _updateRing(layer, radius, t) {
  const p = Math.min(1, t / layer.duration);
  // Ring TubeGeometry is built at radius=1, so scale to target radius.
  // Add a slight overshoot and bounce-back for a punchy feel.
  const expand = p < 0.7 ? p / 0.7 : 1 + (p - 0.7) * 0.08 * (1 - p);
  layer.mesh.scale.set(expand * radius, 1, expand * radius);
  // Opacity: quick rise then slow fade
  layer.mesh.material.opacity = p < 0.25
    ? p / 0.25
    : Math.pow(1 - (p - 0.25) / 0.75, 0.55);
}

function _updateCracks(layer, t) {
  const p = Math.min(1, t / layer.duration);
  // Instant appear, slow fade
  layer.mesh.material.opacity = Math.max(0, 1 - p * p);
}

const _GRAVITY = 9.8;

function _updateDebris(layer, dt, t) {
  if (t > layer.duration) {
    layer.points.material.opacity = 0;
    return;
  }

  const pos = layer.positions;
  const vel = layer.velocities;
  const count = layer.count;
  const posAttr = layer.points.geometry.attributes.position;

  for (let i = 0; i < count; i++) {
    // Integrate position
    vel[i * 3 + 1] -= _GRAVITY * dt; // gravity on Y
    pos[i * 3]     += vel[i * 3]     * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    // Clamp at ground (Y=0 relative to group origin)
    if (pos[i * 3 + 1] < 0) {
      pos[i * 3 + 1] = 0;
      vel[i * 3 + 1] = 0;
      // Kill horizontal velocity on land (friction)
      vel[i * 3]     *= 0.05;
      vel[i * 3 + 2] *= 0.05;
    }

    posAttr.array[i * 3]     = pos[i * 3];
    posAttr.array[i * 3 + 1] = pos[i * 3 + 1];
    posAttr.array[i * 3 + 2] = pos[i * 3 + 2];
  }

  posAttr.needsUpdate = true;

  // Fade out debris toward end of lifetime
  const life = t / layer.duration;
  layer.points.material.opacity = life < 0.6 ? 1 : Math.pow(1 - (life - 0.6) / 0.4, 1.5);
}

function _updateStreak(layer, t) {
  const p = Math.min(1, t / layer.duration);
  // Shrink streak length to zero on impact
  const s = 1 - p;
  layer.mesh.scale.set(1, s, 1);
  layer.mesh.material.opacity = 1 - p;
}

// ─── Disposal ─────────────────────────────────────────────────────────────────

function _disposeInstance(inst) {
  if (inst.disposed) return;
  inst.disposed = true;

  [inst.flash, inst.ring, inst.cracks].forEach(layer => {
    layer.mesh.geometry?.dispose();
    layer.mesh.material?.dispose();
  });

  inst.debris.points.geometry?.dispose();
  inst.debris.points.material?.dispose();

  if (inst.streak) {
    inst.streak.mesh.geometry?.dispose();
    inst.streak.mesh.material?.dispose();
  }

  inst.scene.remove(inst.group);
}
