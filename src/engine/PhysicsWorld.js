/**
 * PhysicsWorld — Cannon-ES world for arena combat
 * 
 * Follows annihilate/index.js patterns:
 * - Fixed timestep world.step(1/60, dt, 3)
 * - Collision groups as powers of 2
 * - Ground plane + arena walls
 * - body↔mesh sync helper
 */

import * as CANNON from 'cannon-es';

// ── Collision groups (annihilate global.js pattern) ────────────────
export const GROUP = {
  SCENE:          2,    // Ground, walls, pillars
  ROLE:           4,    // Player character
  ENEMY:          8,    // Enemy characters
  ROLE_ATTACKER:  16,   // Player's hitbox (sword swing, projectile)
  ENEMY_ATTACKER: 32,   // Enemy's hitbox
  TRIGGER:        64,   // Pickups, area effects
  SHIELD:         128,  // Shield collision
};

export class PhysicsWorld {
  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -20, 0); // Match annihilate gravity
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.defaultContactMaterial.friction = 0;
    this.world.defaultContactMaterial.restitution = 0;

    // Bodies tracked for mesh sync
    this.bodies = []; // { body, mesh, offset? }

    this._createGround();
    this._createArenaWalls();
  }

  _createGround() {
    const groundBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      collisionFilterGroup: GROUP.SCENE,
      collisionFilterMask: GROUP.ROLE | GROUP.ENEMY | GROUP.ROLE_ATTACKER | GROUP.ENEMY_ATTACKER,
    });
    groundBody.quaternion.setFromEulerXYZ(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);
    this.groundBody = groundBody;
  }

  _createArenaWalls() {
    // Invisible cylinder wall at arena boundary (radius 28)
    // Approximated with 8 box walls around the perimeter
    const wallSize = 20;
    const wallThickness = 2;
    const radius = 30;
    const wallShape = new CANNON.Box(new CANNON.Vec3(wallSize / 2, 5, wallThickness / 2));

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const wall = new CANNON.Body({
        mass: 0,
        shape: wallShape,
        collisionFilterGroup: GROUP.SCENE,
        collisionFilterMask: GROUP.ROLE | GROUP.ENEMY,
      });
      wall.position.set(
        Math.cos(angle) * radius,
        5,
        Math.sin(angle) * radius
      );
      wall.quaternion.setFromEulerXYZ(0, -angle, 0);
      this.world.addBody(wall);
    }
  }

  /** Add a pillar collision body at position */
  addPillar(x, z, radius = 1.5, height = 6) {
    const body = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Cylinder(radius, radius, height, 8),
      collisionFilterGroup: GROUP.SCENE,
      collisionFilterMask: GROUP.ROLE | GROUP.ENEMY | GROUP.ROLE_ATTACKER | GROUP.ENEMY_ATTACKER,
    });
    body.position.set(x, height / 2, z);
    this.world.addBody(body);
    return body;
  }

  /** Register a body+mesh pair for automatic sync */
  register(body, mesh, offset = null) {
    this.bodies.push({ body, mesh, offset });
  }

  /** Step physics and sync all meshes to bodies */
  update(dt) {
    this.world.step(1 / 60, dt, 3);

    for (const { body, mesh, offset } of this.bodies) {
      mesh.position.set(body.position.x, body.position.y, body.position.z);
      if (offset) mesh.position.add(offset);
      // Only sync Y rotation (annihilate: fixedRotation, mesh.rotation.y controlled by facing)
    }
  }
}
