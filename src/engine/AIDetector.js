/**
 * AIDetector — Trigger-sphere target acquisition (annihilatetrainer Ai.js pattern).
 *
 * Each AI unit gets a detector: a zero-mass body with GROUP_TRIGGER that overlaps
 * enemy character bodies. beginContact sets the target; endContact clears it.
 * The detector body syncs to the owner's physics body each frame.
 */

import * as CANNON from 'cannon-es';
import { GROUP_TRIGGER, GROUP_PLAYER, GROUP_ENEMY } from './PhysicsWorld.js';

export class AIDetector {
  /**
   * @param {CANNON.World} world
   * @param {CANNON.Body} ownerBody  — the character physics body
   * @param {object}      opts
   * @param {number}      opts.radius      — detection sphere radius
   * @param {number}      opts.targetGroup — which group to detect (GROUP_PLAYER for enemy AI)
   */
  constructor(world, ownerBody, opts = {}) {
    this.world = world;
    this.ownerBody = ownerBody;
    this.target = null;
    this.enabled = true;

    const radius = opts.radius || 12;
    const targetGroup = opts.targetGroup || GROUP_PLAYER;

    this.body = new CANNON.Body({
      mass: 0,
      collisionFilterGroup: GROUP_TRIGGER,
      collisionFilterMask: targetGroup,
      collisionResponse: false,
    });
    this.body.belongTo = { isTrigger: true, detector: this };
    this.body.addShape(new CANNON.Sphere(radius));
    world.addBody(this.body);

    // Annihilatetrainer Ai.js pattern: beginContact → acquire, endContact → release
    this.body.addEventListener('beginContact', (event) => {
      if (!this.enabled) return;
      const other = event.body.belongTo;
      if (other && (other.isPlayer || other.isEnemy)) {
        this.target = other;
      }
    });

    this.body.addEventListener('endContact', (event) => {
      const other = event.body.belongTo;
      if (other && other === this.target) {
        this.target = null;
      }
    });
  }

  /** Sync detector position to owner body (called each frame). */
  update() {
    this.body.position.copy(this.ownerBody.position);
  }

  /** Get the current detected target (or null). */
  getTarget() {
    return this.enabled ? this.target : null;
  }

  dispose() {
    this.world.removeBody(this.body);
    this.target = null;
  }
}
