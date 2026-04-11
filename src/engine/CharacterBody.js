/**
 * CharacterBody — Cannon-ES capsule physics body
 * 
 * Follows Maria.js pattern:
 * - Capsule shape (2 spheres + cylinder)
 * - fixedRotation: true (rotation controlled by facing, not physics)
 * - body.belongTo = character ref
 * - Ground raycast for altitude/landing detection
 * - Collision group based on team
 */

import * as CANNON from 'cannon-es';
import { GROUP } from './PhysicsWorld.js';

export class CharacterBody {
  constructor(world, options = {}) {
    const {
      mass = 80,           // Maria default
      radius = 0.5,        // Maria: 0.5
      height = 1.65,       // Maria: 1.65
      position = { x: 0, y: 2, z: 0 },
      team = 'player',     // 'player' | 'enemy'
    } = options;

    this.world = world;
    this.mass = mass;
    this.radius = radius;
    this.height = height;
    this.heightHalf = height / 2;
    this.isAir = false;

    // Collision group based on team (annihilate: GROUP_ROLE vs GROUP_ENEMY)
    const myGroup = team === 'player' ? GROUP.ROLE : GROUP.ENEMY;
    const myMask = GROUP.SCENE | GROUP.ROLE | GROUP.ENEMY
      | (team === 'player' ? GROUP.ENEMY_ATTACKER : GROUP.ROLE_ATTACKER)
      | GROUP.TRIGGER;

    // Capsule body (annihilate: 2 spheres + cylinder)
    this.body = new CANNON.Body({
      mass,
      fixedRotation: true, // Rotation controlled by facing, not physics
      collisionFilterGroup: myGroup,
      collisionFilterMask: myMask,
      linearDamping: 0.01,
    });

    // Build capsule from shapes (annihilate pattern)
    const cylinderHeight = height - radius * 2;
    this.body.addShape(
      new CANNON.Sphere(radius),
      new CANNON.Vec3(0, this.heightHalf - radius, 0) // top sphere
    );
    this.body.addShape(
      new CANNON.Sphere(radius),
      new CANNON.Vec3(0, -this.heightHalf + radius, 0) // bottom sphere
    );
    if (cylinderHeight > 0) {
      this.body.addShape(
        new CANNON.Cylinder(radius, radius, cylinderHeight, 8),
        new CANNON.Vec3(0, 0, 0) // center cylinder
      );
    }

    this.body.position.set(position.x, position.y, position.z);
    this.body.belongTo = null; // Set by character class

    world.addBody(this.body);
  }

  /** Get altitude above ground via raycast (annihilate getAltitude pattern) */
  getAltitude() {
    const from = new CANNON.Vec3(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );
    const to = new CANNON.Vec3(
      this.body.position.x,
      this.body.position.y - 10,
      this.body.position.z
    );
    const result = new CANNON.RaycastResult();
    this.world.raycastClosest(from, to, { collisionFilterMask: GROUP.SCENE }, result);

    if (result.hasHit) {
      return this.body.position.y - this.heightHalf - result.hitPointWorld.y;
    }
    return 999; // No ground found
  }

  /** Check if character is on ground (annihilate: altitude < 0.037) */
  checkGrounded() {
    const alt = this.getAltitude();
    this.isAir = alt > 0.37;
    return !this.isAir;
  }

  /** Jump: set upward velocity (annihilate: body.velocity.y = 5.2) */
  jump(force = 5.2) {
    this.body.velocity.y = force;
  }

  /** Dash: velocity burst in facing direction (annihilate: 15 units) */
  dash(facingX, facingZ, speed = 15) {
    const len = Math.sqrt(facingX * facingX + facingZ * facingZ) || 1;
    this.body.velocity.x = (facingX / len) * speed;
    this.body.velocity.z = (facingZ / len) * speed;
  }

  /** Move by position offset (annihilate: body.position.x += direction.x) */
  move(dx, dz) {
    this.body.position.x += dx;
    this.body.position.z += dz;
  }

  /** Set position directly */
  setPosition(x, y, z) {
    this.body.position.set(x, y, z);
    this.body.velocity.set(0, 0, 0);
  }

  /** Sync a Three.js mesh to this body's position */
  syncMesh(mesh) {
    mesh.position.set(
      this.body.position.x,
      this.body.position.y - this.heightHalf, // Offset so feet touch ground
      this.body.position.z
    );
  }

  dispose() {
    this.world.removeBody(this.body);
  }
}
