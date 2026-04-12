/**
 * Attacker — Hitbox collision body following annihilate Attacker.js pattern
 *
 * A Cannon-ES body that:
 *   - Has mass=0, DYNAMIC type, collisionResponse=false (passes through)
 *   - Only deals damage when owner's FSM state has 'canDamage' tag
 *   - Follows a weapon bone delegate (sword tip, arrow tip, etc.)
 *   - Collision group: ROLE_ATTACKER masks ENEMY (and vice versa)
 */

import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { GROUP } from './PhysicsWorld.js';

export class Attacker {
  constructor(owner, physicsWorld, options = {}) {
    this.owner = owner;
    this.physicsWorld = physicsWorld;

    const {
      shape = 'box',          // 'box' | 'sphere'
      size = { x: 0.5, y: 0.5, z: 1.5 }, // box half-extents or sphere radius
      team = 'player',
      followBone = null,       // bone name to follow (e.g. 'RightHand')
      offset = { x: 0, y: 0, z: 0 },
    } = options;

    this.followBone = null;
    this.offset = new THREE.Vector3(offset.x, offset.y, offset.z);
    this._worldPos = new THREE.Vector3();

    // Find bone to follow
    if (followBone && owner.mesh) {
      owner.mesh.traverse(node => {
        if (node.isBone && node.name === followBone) {
          this.followBone = node;
        }
      });
    }

    // Collision group based on team
    const myGroup = team === 'player' ? GROUP.ROLE_ATTACKER : GROUP.ENEMY_ATTACKER;
    const myMask = team === 'player' ? (GROUP.ENEMY | GROUP.SHIELD) : GROUP.ROLE;

    // Create Cannon-ES hitbox body (annihilate Attacker.js pattern)
    let cannonShape;
    if (shape === 'sphere') {
      cannonShape = new CANNON.Sphere(size.x || 0.5);
    } else {
      cannonShape = new CANNON.Box(new CANNON.Vec3(size.x, size.y, size.z));
    }

    this.body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.DYNAMIC,
      collisionResponse: false, // Passes through, only triggers events
      collisionFilterGroup: myGroup,
      collisionFilterMask: myMask,
      shape: cannonShape,
    });
    this.body.belongTo = this;

    physicsWorld.addBody(this.body);

    // Collision handler (annihilate pattern)
    this.body.addEventListener('collide', (event) => {
      // Only deal damage during canDamage states
      if (!this.owner.hasTag('canDamage')) return;

      const target = event.body.belongTo;
      if (!target || target === this.owner) return;

      // Check if target can receive damage
      if (target.hit && typeof target.hit === 'function') {
        const damage = this.owner.attackDamage || 30;
        target.hit(damage, event);
      }
    });

    // Register in updates
    if (!window.updates) window.updates = [];
    window.updates.push(this);
  }

  /** Called every frame — sync hitbox to weapon bone position */
  update(dt) {
    if (this.followBone) {
      // Get bone world position
      this.followBone.getWorldPosition(this._worldPos);
      this._worldPos.add(this.offset);
      this.body.position.set(this._worldPos.x, this._worldPos.y, this._worldPos.z);
    } else if (this.owner.body) {
      // Follow character body + forward offset
      const body = this.owner.body.body;
      this.body.position.set(
        body.position.x + this.offset.x,
        body.position.y + this.offset.y,
        body.position.z + this.offset.z
      );
    }
  }

  dispose() {
    this.physicsWorld.removeBody(this.body);
    const idx = window.updates?.indexOf(this);
    if (idx >= 0) window.updates.splice(idx, 1);
  }
}
