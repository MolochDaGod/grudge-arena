/**
 * PhysicsWorld — thin cannon-es wrapper.
 *
 * Owns one `CANNON.World`, exposes ergonomic body factories (static box /
 * static plane / dynamic box / character capsule) and a fixed-timestep
 * `update(dt)` that game code can call once per frame.  Bodies are returned
 * to the caller so they can attach them to THREE.Object3Ds for visual sync.
 *
 * Coordinate convention: matches three.js — Y is up, +Z is "south".
 *
 * Why cannon-es here (and not Rapier as soulslike-game uses): grudge-creator
 * is the experimentation playground where we already had cannon installed,
 * and the simpler API keeps the demo files small.  Same THREE-side glue
 * works against either physics backend.
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export interface PhysicsWorldOptions {
  /** Gravity in m/s² along -Y. Default -9.82 (Earth). */
  gravity?: number;
  /** Allow bodies to sleep when at rest (perf win for big scenes). */
  allowSleep?: boolean;
  /** Default friction for new contacts. Default 0.4. */
  friction?: number;
  /** Default restitution (bounciness) for new contacts. Default 0.0. */
  restitution?: number;
}

export interface CharacterBodyOptions {
  position: THREE.Vector3;
  /** Total capsule height (radius * 2 + cylindrical span). Default 2.0. */
  height?: number;
  /** Capsule radius. Default 0.35. */
  radius?: number;
  /** Body mass. Default 70 (kg). */
  mass?: number;
  /** Linear damping (air resistance). Default 0.9 to keep characters from sliding. */
  linearDamping?: number;
  /** Lock rotation? Characters usually want this so the capsule stays upright. */
  fixedRotation?: boolean;
}

export class PhysicsWorld {
  readonly world: CANNON.World;
  /** Fixed-step length used by `step()`. Real-time accumulator handles drift. */
  readonly fixedTimeStep = 1 / 60;
  /** Cap on subdivisions per `update()` to prevent spiral-of-death after a tab freeze. */
  readonly maxSubSteps = 4;

  constructor(opts: PhysicsWorldOptions = {}) {
    const gravity = opts.gravity ?? -9.82;
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, gravity, 0),
    });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.allowSleep = opts.allowSleep ?? true;
    this.world.defaultContactMaterial.friction = opts.friction ?? 0.4;
    this.world.defaultContactMaterial.restitution = opts.restitution ?? 0.0;
  }

  // ── Body factories ────────────────────────────────────────────────────────

  /** Infinite static ground plane at y=0. */
  createStaticGround(): CANNON.Body {
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
    body.addShape(new CANNON.Plane());
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    this.world.addBody(body);
    return body;
  }

  /** Static AABB box (e.g. walls, props). `size` is the FULL extent, not half. */
  createStaticBox(size: THREE.Vector3, position: THREE.Vector3): CANNON.Body {
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)));
    body.position.set(position.x, position.y, position.z);
    this.world.addBody(body);
    return body;
  }

  /** Dynamic box. Returns the body so callers can keep a handle for sync. */
  createDynamicBox(
    size: THREE.Vector3,
    position: THREE.Vector3,
    mass = 1,
  ): CANNON.Body {
    const body = new CANNON.Body({ mass });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)));
    body.position.set(position.x, position.y, position.z);
    this.world.addBody(body);
    return body;
  }

  /**
   * Approximate a character capsule using two spheres + a cylinder.  Cannon
   * doesn't ship a true capsule primitive, so we compose one.  The body's
   * origin sits at the capsule's geometric centre — visual code should offset
   * the rendered mesh by `-(height / 2)` along Y to put feet at body.y - h/2.
   */
  createCharacterCapsule(opts: CharacterBodyOptions): CANNON.Body {
    const radius = opts.radius ?? 0.35;
    const height = opts.height ?? 2.0;
    const cylH   = Math.max(0.001, height - radius * 2);
    const mass   = opts.mass ?? 70;

    const body = new CANNON.Body({
      mass,
      position: new CANNON.Vec3(opts.position.x, opts.position.y, opts.position.z),
      linearDamping: opts.linearDamping ?? 0.9,
      fixedRotation: opts.fixedRotation ?? true,
    });

    // Bottom hemisphere
    body.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(0, -cylH / 2, 0));
    // Cylinder torso (cannon's Cylinder default axis is Y — matches ours)
    body.addShape(new CANNON.Cylinder(radius, radius, cylH, 12));
    // Top hemisphere
    body.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(0,  cylH / 2, 0));

    if (opts.fixedRotation ?? true) body.updateMassProperties();
    this.world.addBody(body);
    return body;
  }

  // ── Step + cleanup ────────────────────────────────────────────────────────

  /** Advance the world by `dt` seconds (real time). Internally fixed-step. */
  update(dt: number): void {
    // Clamp dt so a multi-second tab freeze doesn't spawn 600 substeps.
    const clamped = Math.min(dt, this.fixedTimeStep * this.maxSubSteps);
    this.world.step(this.fixedTimeStep, clamped, this.maxSubSteps);
  }

  /** Sync a THREE.Object3D to a CANNON.Body's transform. */
  syncMesh(mesh: THREE.Object3D, body: CANNON.Body): void {
    mesh.position.set(body.position.x, body.position.y, body.position.z);
    mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
  }

  /** Remove a body from the world. */
  removeBody(body: CANNON.Body): void {
    this.world.removeBody(body);
  }

  /** Tear down — removes every body. World object itself is GC'd by caller. */
  dispose(): void {
    for (const b of [...this.world.bodies]) this.world.removeBody(b);
  }
}
