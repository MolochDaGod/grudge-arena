/**
 * ProjectilePhysics — Physics-driven projectiles (annihilatetrainer Hadouken pattern).
 *
 * Each projectile has a CANNON.Body (cylinder) and an XState v5 FSM:
 *   move → [rebound | dispose]
 *
 * Movement is applied per-frame along the facing direction.
 * Collide events apply damage or trigger rebound (if hit by a canDamage attacker).
 */

import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { createMachine, createActor } from 'xstate';
import {
  GROUP_PLAYER_ATTACKER, GROUP_ENEMY_ATTACKER,
  GROUP_PLAYER, GROUP_ENEMY,
} from './PhysicsWorld.js';

/** Global registry of live projectiles (updated each frame by game.js). */
export const activeProjectiles = [];

export class PhysicsProjectile {
  /**
   * @param {object} opts
   * @param {CANNON.World} opts.world
   * @param {THREE.Scene}  opts.scene
   * @param {object}       opts.owner       — unit that fired this
   * @param {THREE.Vector2} opts.facing      — XZ direction
   * @param {number}       opts.speed       — units/sec
   * @param {number}       opts.damage
   * @param {number}       opts.color       — hex
   * @param {string}       opts.ownerTeam   — 'A' or 'B'
   * @param {Function}     [opts.onHitTarget] — callback(targetUnit, contactPoint)
   */
  constructor(opts) {
    this.world = opts.world;
    this.scene = opts.scene;
    this.owner = opts.owner;
    this.damage = opts.damage || 40;
    this.speed = opts.speed || 0.18;
    this.onHitTarget = opts.onHitTarget || null;

    // Movement direction (XZ plane)
    this.movement = new THREE.Vector2()
      .copy(opts.facing)
      .normalize()
      .multiplyScalar(this.speed);

    // ── FSM (Hadouken pattern) ──
    const self = this;
    const machine = createMachine(
      {
        id: 'projectile',
        initial: 'move',
        states: {
          move: {
            on: { rebound: 'rebound' },
            after: { 3000: 'dispose' },
          },
          rebound: {
            entry: 'entryRebound',
            after: { 3000: 'dispose' },
          },
          dispose: {
            entry: 'entryDispose',
          },
        },
      },
      {
        actions: {
          entryRebound: () => {
            self.movement.multiplyScalar(-1);
            // Flip collision group so it can now hit the original team
            const isPlayerProjectile = opts.ownerTeam === 'A';
            self.body.collisionFilterGroup = isPlayerProjectile
              ? GROUP_PLAYER_ATTACKER : GROUP_ENEMY_ATTACKER;
            self.body.collisionFilterMask = isPlayerProjectile
              ? GROUP_ENEMY : GROUP_PLAYER;
          },
          entryDispose: () => {
            self.dispose();
          },
        },
      },
    );
    this.actor = createActor(machine);
    this.actor.start();

    // ── Physics body ──
    const isPlayerProjectile = opts.ownerTeam === 'A';
    this.body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.DYNAMIC,
      collisionResponse: false,
      collisionFilterGroup: isPlayerProjectile ? GROUP_PLAYER_ATTACKER : GROUP_ENEMY_ATTACKER,
      collisionFilterMask: isPlayerProjectile
        ? (GROUP_ENEMY | GROUP_PLAYER_ATTACKER)
        : (GROUP_PLAYER | GROUP_ENEMY_ATTACKER),
    });
    this.body.belongTo = this;

    const radius = 0.4;
    const height = 0.3;
    this.body.addShape(new CANNON.Cylinder(radius, radius, height, 8));
    if (opts.owner?.mesh) {
      this.body.position.copy(opts.owner.mesh.position);
      this.body.position.y += 1;
    }
    this.world.addBody(this.body);

    // Collision tracking
    this.body.collidings = [];
    this.body.addEventListener('collide', (event) => {
      const isBegin = !this.body.collidings.includes(event.body);
      if (isBegin) this.body.collidings.push(event.body);
      if (isBegin) this._onCollide(event);
    });
    this.body.addEventListener('endContact', (event) => {
      const idx = this.body.collidings.indexOf(event.body);
      if (idx !== -1) this.body.collidings.splice(idx, 1);
    });

    // ── Three.js mesh ──
    const color = opts.color || 0x00ccff;
    const geo = new THREE.CylinderGeometry(radius, radius, height, 16);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.6,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.scene.add(this.mesh);

    activeProjectiles.push(this);
  }

  /** Per-frame update (called from game.js loop). */
  update(dt) {
    if (this._disposed) return;
    const dtScale = dt * 60;
    this.body.position.x += this.movement.x * dtScale;
    this.body.position.z += this.movement.y * dtScale;
    this.mesh.position.set(this.body.position.x, this.body.position.y, this.body.position.z);
  }

  _onCollide(event) {
    const other = event.body.belongTo;
    if (!other) return;

    if (other.isPlayer || other.isEnemy) {
      // Hit a character
      this.onHitTarget?.(other, event.body.position);
      this.actor.send({ type: 'dispose' });
    } else if (other.isAttacker && other.owner?.canDamage) {
      // Deflected by an active weapon swing → rebound
      this.actor.send({ type: 'rebound' });
    }
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.world.removeBody(this.body);
    this.scene.remove(this.mesh);
    this.mesh.geometry?.dispose();
    this.mesh.material?.dispose();
    this.actor.stop();
    const idx = activeProjectiles.indexOf(this);
    if (idx !== -1) activeProjectiles.splice(idx, 1);
  }
}
