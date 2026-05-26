/**
 * SplineTrajectory — smooth arc and path movement for projectiles,
 * knockback arcs, Meteor Strike descents, Charge dashes, and camera dollies.
 *
 * Three.js tools used:
 *   THREE.CubicBezierCurve3   — lob/arc trajectories (explicit control points)
 *   THREE.CatmullRomCurve3    — smooth paths through N waypoints, closed loops
 *   THREE.TubeGeometry         — visible glowing trail along any curve
 *   THREE.MathUtils            — lerp, clamp for easing helpers
 *
 * ─── Weapon / skill mappings ──────────────────────────────────────
 *   Scythe  → Meteor Strike : arcPath(casterPos, targetPos, { apexHeight:14 })
 *   Greatsword → Charge     : arcPath(start, end, { apexHeight:0.5, easing:'easeIn' })
 *   Bow     → Cobra Shot    : arcPath(barrel, target, { apexHeight:3 })
 *   Any hit → Knockback arc : arcPath(victim, landPos, { apexHeight:4 })
 *   AI      → Patrol loop   : smoothPath(waypoints, { closed:true })
 *   Camera  → Kill-cam      : smoothPath([camPos, mid, behindTarget])
 *
 * ─── Usage ────────────────────────────────────────────────────────
 *
 *   // Create a lobbed arc
 *   const traj = SplineTrajectory.arcPath(
 *     caster.mesh.position,
 *     target.mesh.position,
 *     { apexHeight: 10 }
 *   );
 *
 *   // Attach a glowing trail to the scene
 *   const trail = traj.buildTrail({ color: 0xff4400 });
 *   scene.add(trail);
 *
 *   // Drive a mesh along the arc over 1.4 seconds
 *   const mover = new TrajectoryMover(meteorMesh, traj, {
 *     duration: 1.4,
 *     easing: 'easeIn',
 *     onComplete: () => { spawnGroundSlamVFX(scene, target.mesh.position, { meteor:true }); }
 *   });
 *   mover.start();
 *
 *   // Per-frame
 *   mover.update(delta);   // returns true when done
 */

import * as THREE from 'three';

// ── SplineTrajectory ─────────────────────────────────────────────

export class SplineTrajectory {
  /** @private — use static factory methods */
  constructor(curve) {
    /** @type {THREE.CubicBezierCurve3 | THREE.CatmullRomCurve3} */
    this.curve = curve;
  }

  // ── Factory methods ──────────────────────────────────────────────

  /**
   * Lob / arc trajectory using CubicBezierCurve3.
   * Ideal for: Meteor Strike, knockback arc, lobbed arrows, thrown swords.
   *
   * The arc peaks at `apexHeight` above the midpoint between start and end.
   * Control points are positioned at the 1/3 and 2/3 marks, lifted by
   * `apexHeight`, so the projectile smoothly accelerates out, peaks, and
   * dives toward the target.
   *
   * @param {THREE.Vector3} start
   * @param {THREE.Vector3} end
   * @param {object}        [opts]
   * @param {number}        [opts.apexHeight]    peak height above start/end midpoint (default 6)
   * @param {number}        [opts.apexBias]      0=near start, 1=near end (default 0.5)
   * @param {number}        [opts.lateralCurve]  sideways bow for curving paths (default 0)
   * @returns {SplineTrajectory}
   */
  static arcPath(start, end, opts = {}) {
    const apexH  = opts.apexHeight   ?? 6;
    const bias   = opts.apexBias     ?? 0.5;
    const latOff = opts.lateralCurve ?? 0;

    // Midpoint lifted to the apex
    const apex = start.clone().lerp(end, bias);
    apex.y = Math.max(start.y, end.y) + apexH;

    // Optional lateral offset — perpendicular to the start→end vector on XZ
    if (latOff !== 0) {
      const dir  = end.clone().sub(start).setY(0).normalize();
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      apex.addScaledVector(perp, latOff);
    }

    // CubicBezier: ctrl1 = start→apex halfway, ctrl2 = end→apex halfway
    const ctrl1 = start.clone().lerp(apex, 0.5);
    const ctrl2 = end.clone().lerp(apex, 0.5);

    return new SplineTrajectory(
      new THREE.CubicBezierCurve3(start.clone(), ctrl1, ctrl2, end.clone())
    );
  }

  /**
   * Smooth path through N waypoints using CatmullRomCurve3.
   * Ideal for: patrol loops, camera dollies, zone placement paths.
   *
   * @param {THREE.Vector3[]} points
   * @param {object}          [opts]
   * @param {boolean}         [opts.closed]      loop back to first point (default false)
   * @param {number}          [opts.tension]     Catmull-Rom tension 0→1 (default 0.5)
   * @param {'centripetal'|'chordal'|'catmullrom'} [opts.curveType]
   * @returns {SplineTrajectory}
   */
  static smoothPath(points, opts = {}) {
    return new SplineTrajectory(
      new THREE.CatmullRomCurve3(
        points,
        opts.closed    ?? false,
        opts.curveType ?? 'centripetal',  // centripetal avoids cusps
        opts.tension   ?? 0.5,
      )
    );
  }

  /**
   * Quick direct line expressed as a 2-point CatmullRomCurve3.
   * Useful when you want a uniform API but no arc.
   */
  static linePath(start, end) {
    // 4 points (start, lerp33, lerp66, end) so CatmullRom has something to interpolate
    return new SplineTrajectory(
      new THREE.CatmullRomCurve3([
        start.clone(),
        start.clone().lerp(end, 0.33),
        start.clone().lerp(end, 0.67),
        end.clone(),
      ])
    );
  }

  // ── Sampling ────────────────────────────────────────────────────

  /**
   * Sample position + tangent at normalized t ∈ [0, 1].
   * Uses arc-length parameterization so movement speed is uniform.
   *
   * @param {number} t
   * @returns {{ position: THREE.Vector3, tangent: THREE.Vector3 }}
   */
  sample(t) {
    const u = this.curve.getUtoTmapping(THREE.MathUtils.clamp(t, 0, 1), null);
    return {
      position: this.curve.getPoint(u),
      tangent:  this.curve.getTangent(u).normalize(),
    };
  }

  /**
   * Return N evenly spaced points sampled from the curve.
   * @param {number} count
   * @returns {THREE.Vector3[]}
   */
  getPoints(count = 50) {
    return this.curve.getSpacedPoints(count);
  }

  /** Arc length in world units. */
  get length() {
    return this.curve.getLength();
  }

  // ── Trail Geometry ───────────────────────────────────────────────

  /**
   * Build a TubeGeometry mesh that follows the entire trajectory.
   * Used for: meteor trail, charge streak, projectile wake.
   *
   * @param {object} [opts]
   * @param {number} [opts.color]      hex (default 0xff6600)
   * @param {number} [opts.radius]     tube cross-section radius (default 0.07)
   * @param {number} [opts.segments]   tubular segments (default 64)
   * @param {number} [opts.radial]     radial segments (default 6)
   * @param {boolean}[opts.additive]   additive blending (default true)
   * @returns {THREE.Mesh}
   */
  buildTrail(opts = {}) {
    const color    = opts.color    ?? 0xff6600;
    const radius   = opts.radius   ?? 0.07;
    const segs     = opts.segments ?? 64;
    const radial   = opts.radial   ?? 6;
    const additive = opts.additive ?? true;

    const geo = new THREE.TubeGeometry(this.curve, segs, radius, radial, false);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });

    return new THREE.Mesh(geo, mat);
  }

  /**
   * Build a fading trail — tube tapers from bright head to transparent tail.
   * Uses a ShaderMaterial with a per-vertex alpha attribute derived from the
   * parametric position along the tube.
   *
   * @param {object} [opts]
   * @param {number} [opts.color]
   * @param {number} [opts.radius]
   * @param {number} [opts.segments]
   * @returns {THREE.Mesh}
   */
  buildFadingTrail(opts = {}) {
    const color  = opts.color    ?? 0xff6600;
    const radius = opts.radius   ?? 0.09;
    const segs   = opts.segments ?? 80;
    const radSeg = 8;

    const geo = new THREE.TubeGeometry(this.curve, segs, radius, radSeg, false);

    // Build per-vertex alpha: 0 at start (tail), 1 at end (head)
    const vertCount = geo.attributes.position.count;
    const alphas    = new Float32Array(vertCount);
    const vPerRing  = radSeg + 1;

    for (let ring = 0; ring <= segs; ring++) {
      const a = ring / segs;                     // 0 = tube start, 1 = tube end
      for (let v = 0; v < vPerRing; v++) {
        const idx = ring * vPerRing + v;
        if (idx < vertCount) alphas[idx] = a;
      }
    }

    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
      },
      vertexShader: /* glsl */`
        attribute float aAlpha;
        varying   float vAlpha;
        void main() {
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3  uColor;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(uColor, vAlpha * 0.85);
        }
      `,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      side:        THREE.DoubleSide,
    });

    return new THREE.Mesh(geo, mat);
  }
}

// ── TrajectoryMover ──────────────────────────────────────────────

/**
 * Drives a THREE.Object3D along a SplineTrajectory over time with easing.
 *
 * Pattern from annihilatetrainer Hadouken.js — velocity-based position applied
 * each frame, adapted to use spline sampling instead of straight-line translation.
 *
 * @example
 * // Meteor Strike
 * const traj  = SplineTrajectory.arcPath(skyPos, targetPos, { apexHeight: 12 });
 * const trail = traj.buildFadingTrail({ color: 0xff4400 });
 * scene.add(trail);
 *
 * const mover = new TrajectoryMover(meteorMesh, traj, {
 *   duration:    1.4,
 *   easing:      'easeIn',
 *   faceForward: true,
 *   onComplete:  () => {
 *     scene.remove(trail);
 *     trail.geometry.dispose(); trail.material.dispose();
 *     spawnGroundSlamVFX(scene, targetPos, { meteor: true, radius: 6 });
 *   },
 * });
 * mover.start();
 *
 * // Game loop:
 * mover.update(delta);
 */
export class TrajectoryMover {
  /**
   * @param {THREE.Object3D}   object
   * @param {SplineTrajectory} trajectory
   * @param {object}           [opts]
   * @param {number}           [opts.duration]     seconds to traverse full path (default 1.0)
   * @param {'linear'|'easeIn'|'easeOut'|'easeInOut'|'easeOutBounce'} [opts.easing]
   * @param {boolean}          [opts.faceForward]  rotate object toward path tangent (default true)
   * @param {Function}         [opts.onComplete]   called once when t reaches 1
   */
  constructor(object, trajectory, opts = {}) {
    this.object      = object;
    this.traj        = trajectory;
    this.duration    = opts.duration    ?? 1.0;
    this.easing      = opts.easing      ?? 'easeInOut';
    this.faceForward = opts.faceForward ?? true;
    this.onComplete  = opts.onComplete  ?? null;

    this._elapsed = -1;
    this._done    = false;
  }

  start() {
    this._elapsed = 0;
    this._done    = false;
  }

  /**
   * Advance the mover by `dt` seconds.
   * @param {number} dt
   * @returns {boolean} true when fully complete
   */
  update(dt) {
    if (this._elapsed < 0 || this._done) return this._done;

    this._elapsed += dt;
    const rawT = Math.min(1, this._elapsed / this.duration);
    const t    = _ease(rawT, this.easing);

    const { position, tangent } = this.traj.sample(t);
    this.object.position.copy(position);

    if (this.faceForward && tangent.lengthSq() > 1e-6) {
      this.object.lookAt(position.clone().add(tangent));
    }

    if (rawT >= 1 && !this._done) {
      this._done = true;
      this.onComplete?.();
    }

    return this._done;
  }

  reset() {
    this._elapsed = -1;
    this._done    = false;
  }
}

// ── Easing helpers ───────────────────────────────────────────────

function _ease(t, type) {
  switch (type) {
    case 'easeIn':        return t * t;
    case 'easeOut':       return t * (2 - t);
    case 'easeInOut':     return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case 'easeOutBounce': return _bounceOut(t);
    default:              return t;
  }
}

function _bounceOut(t) {
  if (t < 1 / 2.75)      return 7.5625 * t * t;
  if (t < 2 / 2.75)      return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  if (t < 2.5 / 2.75)    return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
}
