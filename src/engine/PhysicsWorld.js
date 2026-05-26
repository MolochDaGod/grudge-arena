/**
 * PhysicsWorld — cannon-es rigid-body physics with collision groups.
 *
 * Collision-group bitmask pattern from annihilatetrainer global.js.
 * Powers of 2 starting at 2 to avoid the cannon-es default (1).
 */

import * as CANNON from 'cannon-es';

// ── Collision Groups (power-of-2 bitmask) ───────────────────────
export const GROUP_SCENE            = 2;
export const GROUP_PLAYER           = 4;
export const GROUP_ENEMY            = 8;
export const GROUP_PLAYER_ATTACKER  = 16;
export const GROUP_ENEMY_ATTACKER   = 32;
export const GROUP_TRIGGER          = 64;
export const GROUP_SHIELD           = 128;

// ── Fixed timestep config ───────────────────────────────────────
const FIXED_DT = 1 / 60;
const MAX_SUB_STEPS = 3;

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -9.82, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 10;
    this.world.allowSleep = false;

    // Default contact material — low friction, no bounce
    this.world.defaultContactMaterial = new CANNON.ContactMaterial(
      new CANNON.Material(), new CANNON.Material(),
      { friction: 0.1, restitution: 0 },
    );

    // Ground plane (Y=0)
    const groundBody = new CANNON.Body({
      mass: 0,
      collisionFilterGroup: GROUP_SCENE,
      collisionFilterMask: GROUP_PLAYER | GROUP_ENEMY,
    });
    groundBody.addShape(new CANNON.Plane());
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    groundBody.belongTo = { isScene: true };
    this.world.addBody(groundBody);
  }

  /** Step physics forward by `delta` seconds. */
  step(delta) {
    this.world.step(FIXED_DT, delta, MAX_SUB_STEPS);
  }

  /**
   * Create a character capsule body (sphere + cylinder, fixedRotation).
   * Mirrors the annihilatetrainer Maria.js body construction.
   *
   * @param {CANNON.Vec3|{x,y,z}} position
   * @param {number} radius   — capsule radius (default 0.5)
   * @param {number} height   — total capsule height (default 1.8)
   * @param {number} group    — collision group bitmask
   * @param {number} mask     — collision mask bitmask
   * @returns {CANNON.Body}
   */
  createCharacterBody(position, radius = 0.5, height = 1.8, group, mask) {
    const body = new CANNON.Body({
      mass: 60,
      fixedRotation: true,
      collisionFilterGroup: group,
      collisionFilterMask: mask,
    });

    const cylHeight = height - radius * 2;
    body.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(0, cylHeight / 2, 0));
    body.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(0, -cylHeight / 2, 0));
    body.addShape(new CANNON.Cylinder(radius, radius, cylHeight, 8));

    body.position.set(position.x || 0, position.y || 0, position.z || 0);
    this.world.addBody(body);
    return body;
  }

  /**
   * One-way sync: physics body position → Three.js mesh position.
   * @param {THREE.Object3D} mesh
   * @param {CANNON.Body} body
   * @param {number} heightOffset — subtract from Y so mesh feet align with ground
   */
  syncMeshToBody(mesh, body, heightOffset = 0.9) {
    mesh.position.set(
      body.position.x,
      body.position.y - heightOffset,
      body.position.z,
    );
  }

  /**
   * One-way sync: Three.js mesh position → physics body position.
   * Used when the controller directly moves the mesh (player input).
   */
  syncBodyToMesh(body, mesh, heightOffset = 0.9) {
    body.position.set(
      mesh.position.x,
      mesh.position.y + heightOffset,
      mesh.position.z,
    );
    body.velocity.set(0, 0, 0);
  }

  /** Remove a body from the world. */
  removeBody(body) {
    if (body) this.world.removeBody(body);
  }

  /** Add a raw body (for hitboxes, detectors, projectiles). */
  addBody(body) {
    this.world.addBody(body);
  }
}
