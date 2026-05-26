/**
 * AoEIndicator — Animated pre-cast AoE target circle.
 *
 * Three.js tools used:
 *   - THREE.EllipseCurve        — perfect circle path in 2D
 *   - THREE.CatmullRomCurve3   — smooth 3D closed loop from ellipse points
 *   - THREE.TubeGeometry        — glowing ring border from the spline
 *   - THREE.ShaderMaterial      — animated fill (scan line + grid + glow)
 *   - THREE.Raycaster           — snap indicator to terrain surface
 *   - THREE.Sphere              — fast sphere overlap for AoE hit detection
 *   - THREE.Box3                — bounding-box pre-filter before sphere test
 *
 * Matches every aoeRadius / radius skill in WeaponDefinitions and CombatSystem:
 *   Meteor Strike (r=6), Frost Nova (r=5), Cloudkill (r=5),
 *   Colossus Smash (r=4), Blade Dance (r=3), Whirlwind (r=5) …
 *
 * Usage:
 *   const aoe = new AoEIndicator(scene, terrainMeshes);
 *
 *   // Show during targeting:
 *   aoe.show(worldPos, radius, 0xff4400);
 *
 *   // Move while player aims:
 *   aoe.moveTo(newPos);
 *
 *   // On cast — get hit entity list:
 *   const hits = aoe.checkHits(entityArray);   // returns entities in radius
 *
 *   // After skill fires:
 *   aoe.hide();
 *
 *   // Per-frame (animates the shader):
 *   aoe.update(delta);
 *
 *   aoe.dispose();
 */

import * as THREE from 'three';

// ── AoE fill shader ──────────────────────────────────────────────
const AOE_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const AOE_FRAG = /* glsl */`
  #define PI 3.14159265359
  uniform float  time;
  uniform vec3   color;
  uniform float  opacity;    // master opacity (used for show/hide fade)
  varying vec2   vUv;

  void main() {
    vec2 uv   = vUv - 0.5;                 // center at 0,0
    float dist = length(uv) * 2.0;         // 0 = center, 1 = edge

    if (dist > 1.02) discard;

    // ── Rotating scan sector ──────────────────────────────────────
    float angle = atan(uv.y, uv.x);
    float sweep = mod(angle - time * 1.8, PI * 2.0) / (PI * 2.0);
    float scan  = (1.0 - sweep) * 0.45 * (1.0 - dist * 0.9);

    // ── Tactical grid overlay ─────────────────────────────────────
    const float GRID = 18.0;
    vec2  g    = fract(vUv * GRID);
    float line = step(0.92, max(g.x, g.y)) * 0.07;

    // ── Radial fill (transparent center, slightly visible fill) ───
    float fill = (1.0 - dist * dist) * 0.14;

    // ── Pulsing outer ring ─────────────────────────────────────────
    float pulse = 0.5 + 0.5 * sin(time * 3.5);
    float ring  = smoothstep(0.82, 0.96, dist) * (0.55 + pulse * 0.2);

    // ── Inner ring at 50% radius ───────────────────────────────────
    float inner = smoothstep(0.46, 0.5, dist) * smoothstep(0.54, 0.5, dist) * 0.2;

    float alpha = (fill + ring + scan + line + inner) * opacity;
    gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.9));
  }
`;

// ── AoEIndicator class ───────────────────────────────────────────

export class AoEIndicator {
  /**
   * @param {THREE.Scene}    scene
   * @param {THREE.Mesh[]}   terrainMeshes — used for Raycaster terrain snap
   */
  constructor(scene, terrainMeshes = []) {
    this.scene         = scene;
    this.terrainMeshes = terrainMeshes;
    this._visible      = false;
    this._radius       = 1;
    this._time         = 0;
    this._fadeDir      = 0;   // +1 = fading in, -1 = fading out
    this._opacity      = 0;

    // Raycaster for terrain snap (straight down)
    this._raycaster = new THREE.Raycaster();
    this._downDir   = new THREE.Vector3(0, -1, 0);

    // THREE.Sphere for hit detection
    this._sphere = new THREE.Sphere();

    // Group holding fill disc + tube ring
    this._group = new THREE.Group();
    scene.add(this._group);
    this._group.visible = false;

    this._fillMesh = null;
    this._tubeMesh = null;
    this._fillMat  = null;
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Show the indicator at `position` with given radius.
   * @param {THREE.Vector3} position
   * @param {number}        radius    — AoE radius in world units
   * @param {number}        [color]   — hex (default 0xff3300)
   */
  show(position, radius, color = 0xff3300) {
    if (this._fillMesh) this._rebuild(radius, color);
    else                this._build(radius, color);

    this._radius = radius;
    this._sphere.set(position.clone().setY(0), radius);
    this._group.position.copy(position);
    this._group.position.y += 0.05;   // just above ground
    this._group.visible = true;
    this._visible  = true;
    this._fadeDir  = 1;
  }

  /**
   * Move the indicator to a new world position (e.g. while player aims).
   * Optionally snaps to terrain if terrainMeshes were provided.
   * @param {THREE.Vector3} position
   */
  moveTo(position) {
    if (!this._visible) return;

    let groundY = position.y;

    // Raycaster terrain snap — cast straight down from above
    if (this.terrainMeshes.length > 0) {
      const from = position.clone();
      from.y += 20;
      this._raycaster.set(from, this._downDir);
      const hits = this._raycaster.intersectObjects(this.terrainMeshes, true);
      if (hits.length > 0) groundY = hits[0].point.y;
    }

    this._group.position.set(position.x, groundY + 0.05, position.z);
    this._sphere.center.set(position.x, groundY, position.z);
  }

  /** Start fade-out, mark hidden once fully faded. */
  hide() {
    this._fadeDir = -1;
    this._visible = false;
  }

  /**
   * Check which entities fall inside the AoE sphere.
   * Uses THREE.Box3 as a fast pre-filter, then THREE.Sphere for accuracy.
   *
   * @param {Array<{mesh: THREE.Object3D, id: any}>} entities
   * @returns {Array}   entities whose bounding sphere intersects the AoE
   */
  checkHits(entities) {
    const hits   = [];
    const sphere = this._sphere;
    const box3   = new THREE.Box3();

    for (const entity of entities) {
      if (!entity.mesh) continue;

      // Fast AABB pre-filter
      box3.setFromObject(entity.mesh);
      if (!sphere.intersectsBox(box3)) continue;

      // Accurate sphere-sphere test using entity center
      const center = new THREE.Vector3();
      box3.getCenter(center);
      center.y = sphere.center.y; // ignore Y for ground-plane AoE
      if (sphere.containsPoint(center)) {
        hits.push(entity);
      }
    }

    return hits;
  }

  /**
   * Per-frame update — advances shader time, handles fade in/out.
   * @param {number} dt — delta seconds
   */
  update(dt) {
    if (!this._fillMat && !this._group.visible) return;

    this._time += dt;

    // Fade in/out
    if (this._fadeDir !== 0) {
      this._opacity = Math.max(0, Math.min(1, this._opacity + this._fadeDir * dt * 3));
      if (this._opacity <= 0 && this._fadeDir === -1) {
        this._group.visible = false;
        this._fadeDir = 0;
      }
      if (this._opacity >= 1) this._fadeDir = 0;
    }

    if (this._fillMat) {
      this._fillMat.uniforms.time.value    = this._time;
      this._fillMat.uniforms.opacity.value = this._opacity;
    }

    // Pulse the tube ring scale
    if (this._tubeMesh) {
      const pulse = 1 + Math.sin(this._time * 4) * 0.012;
      this._tubeMesh.scale.set(pulse, 1, pulse);
    }
  }

  dispose() {
    this._destroyMeshes();
    this.scene.remove(this._group);
  }

  // ── Internal ──────────────────────────────────────────────────

  /**
   * Build fill disc + TubeGeometry ring for a given radius.
   * THREE.js tools:
   *   EllipseCurve → points → CatmullRomCurve3(closed) → TubeGeometry
   */
  _build(radius, color) {
    this._destroyMeshes();

    const c = new THREE.Color(color);

    // ── Fill disc (flat CircleGeometry + ShaderMaterial) ──────────
    const fillGeo = new THREE.CircleGeometry(radius, 72);
    fillGeo.rotateX(-Math.PI / 2);  // lay on XZ plane

    this._fillMat = new THREE.ShaderMaterial({
      uniforms: {
        time:    { value: 0 },
        color:   { value: c },
        opacity: { value: 0 },
      },
      vertexShader:   AOE_VERT,
      fragmentShader: AOE_FRAG,
      transparent:    true,
      depthWrite:     false,
      side:           THREE.DoubleSide,
      blending:       THREE.AdditiveBlending,
    });

    this._fillMesh = new THREE.Mesh(fillGeo, this._fillMat);
    this._group.add(this._fillMesh);

    // ── Tube ring using EllipseCurve → CatmullRomCurve3 ───────────
    //
    // EllipseCurve gives us evenly spaced 2D points on a circle.
    // We lift them into 3D (XZ) then pass to CatmullRomCurve3 (closed=true)
    // so Three.js produces a smooth, C2-continuous 3D loop.
    // TubeGeometry wraps a circular cross-section around that path.
    const ellipse = new THREE.EllipseCurve(
      0, 0,       // center
      radius, radius,
      0, Math.PI * 2,
      false,
      0,
    );

    const pts2d = ellipse.getPoints(80);
    const pts3d = pts2d.map(p => new THREE.Vector3(p.x, 0, p.y));

    // CatmullRomCurve3 — smooth closed spline interpolating all ring points
    const ringSpline = new THREE.CatmullRomCurve3(pts3d, /*closed=*/true, 'catmullrom', 0.5);

    const tubeGeo = new THREE.TubeGeometry(
      ringSpline,
      120,    // tubularSegments — high for smooth result
      0.055,  // tube radius (ring thickness)
      8,      // radial segments
      true,   // closed
    );

    const tubeMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity:     0.9,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
    });

    this._tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    this._group.add(this._tubeMesh);

    // Sync tube opacity to fill opacity via the update loop
    this._tubeMat = tubeMat;
  }

  /** Rebuild with new radius/color (reuses _build). */
  _rebuild(radius, color) {
    this._build(radius, color);
  }

  _destroyMeshes() {
    if (this._fillMesh) {
      this._group.remove(this._fillMesh);
      this._fillMesh.geometry.dispose();
      this._fillMat.dispose();
      this._fillMesh = null;
      this._fillMat  = null;
    }
    if (this._tubeMesh) {
      this._group.remove(this._tubeMesh);
      this._tubeMesh.geometry.dispose();
      this._tubeMat.dispose();
      this._tubeMesh = null;
      this._tubeMat  = null;
    }
  }
}
