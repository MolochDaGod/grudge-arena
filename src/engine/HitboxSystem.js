/**
 * HitboxSystem — Weapon hitbox bodies (annihilatetrainer Attacker / GreatSword pattern).
 *
 * Each melee unit gets a Hitbox: a zero-mass DYNAMIC body with collisionResponse=false.
 * The hitbox syncs to the weapon bone each frame and only processes collisions when
 * the owning character's FSM state has the `canDamage` tag.
 *
 * Collision events use the `collidings` array pattern (isBeginCollide) from Attacker.js
 * to ensure each target is only hit once per swing.
 */

import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import {
  GROUP_PLAYER_ATTACKER, GROUP_ENEMY_ATTACKER,
  GROUP_PLAYER, GROUP_ENEMY, GROUP_SHIELD,
} from './PhysicsWorld.js';

// ── Hitbox ──────────────────────────────────────────────────────

export class Hitbox {
  /**
   * @param {CANNON.World} world
   * @param {object} opts
   * @param {number} opts.group  — collision group (GROUP_PLAYER_ATTACKER or GROUP_ENEMY_ATTACKER)
   * @param {number} opts.mask   — collision mask (GROUP_ENEMY or GROUP_PLAYER)
   * @param {{x:number,y:number,z:number}} opts.size — box half-extents
   */
  constructor(world, opts = {}) {
    this.world = world;
    this.owner = null;          // Unit reference (set by HitboxManager)
    this.isAttacker = true;

    const group = opts.group || GROUP_PLAYER_ATTACKER;
    const mask  = opts.mask  || (GROUP_ENEMY | GROUP_SHIELD);
    const size  = opts.size  || { x: 0.19, y: 0.19, z: 0.74 };

    this.body = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.DYNAMIC,
      collisionResponse: false,
      collisionFilterGroup: group,
      collisionFilterMask: mask,
    });
    this.body.belongTo = this;
    this.body.addShape(new CANNON.Box(new CANNON.Vec3(size.x, size.y, size.z)));
    world.addBody(this.body);

    // Collision tracking (annihilatetrainer Attacker.js pattern)
    this.body.collidings = [];
    this._isCollideShield = false;
    this._isCollideBody   = false;
    this._collideShieldEvt = null;
    this._collideBodyEvt   = null;

    this.body.addEventListener('collide', (event) => {
      const isBegin = !this.body.collidings.includes(event.body);
      if (isBegin) this.body.collidings.push(event.body);
      this._onCollide(event, isBegin);
    });

    this.body.addEventListener('endContact', (event) => {
      const idx = this.body.collidings.indexOf(event.body);
      if (idx !== -1) this.body.collidings.splice(idx, 1);
    });

    // Temp vectors for bone sync
    this._tmpVec = new THREE.Vector3();
    this._tmpQuat = new THREE.Quaternion();
  }

  /**
   * Sync hitbox body to a weapon bone delegate (annihilatetrainer GreatSword.update pattern).
   * @param {THREE.Object3D} boneDelegate — the Object3D parented to the weapon bone
   */
  syncToBone(boneDelegate) {
    if (!boneDelegate) return;
    boneDelegate.getWorldPosition(this._tmpVec);
    boneDelegate.getWorldQuaternion(this._tmpQuat);
    this.body.position.set(this._tmpVec.x, this._tmpVec.y, this._tmpVec.z);
    this.body.quaternion.set(this._tmpQuat.x, this._tmpQuat.y, this._tmpQuat.z, this._tmpQuat.w);
  }

  /**
   * Fallback sync: position hitbox in front of the owner mesh (no bone).
   * @param {THREE.Object3D} mesh
   * @param {number} reach — distance forward from mesh center
   */
  syncToMeshForward(mesh, reach = 1.2) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(mesh.quaternion);
    this.body.position.set(
      mesh.position.x + fwd.x * reach,
      mesh.position.y + 1.0,
      mesh.position.z + fwd.z * reach,
    );
    this.body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
  }

  /**
   * Called each frame AFTER physics step to resolve shield vs body hits.
   * Mirrors GreatSword.update() logic.
   */
  resolveHits() {
    if (this._isCollideShield) {
      const evt = this._collideShieldEvt;
      if (evt?.body?.belongTo?.owner) {
        evt.body.belongTo.owner.onBlocked?.();
      }
    } else if (this._isCollideBody) {
      const evt = this._collideBodyEvt;
      const target = evt?.body?.belongTo;
      if (target) {
        target.onHit?.(evt, this.owner);
      }
    }
    this._isCollideShield = false;
    this._isCollideBody = false;
    this._collideShieldEvt = null;
    this._collideBodyEvt = null;
  }

  /** Internal collide handler (annihilatetrainer GreatSword.collide pattern). */
  _onCollide(event, isBeginCollide) {
    if (!isBeginCollide) return;
    // Only process when owner FSM is in a canDamage state
    if (!this.owner?.canDamage) return;

    const other = event.body.belongTo;
    if (!other) return;

    if (other.isShield) {
      this._isCollideShield = true;
      this._collideShieldEvt = { ...event };
    } else if (other.isEnemy || other.isPlayer) {
      this._isCollideBody = true;
      this._collideBodyEvt = { ...event };
    }
  }

  dispose() {
    this.world.removeBody(this.body);
  }
}

// ── HitboxManager ───────────────────────────────────────────────

export class HitboxManager {
  constructor(physicsWorld) {
    this.physicsWorld = physicsWorld;
    /** @type {Map<number, {hitbox: Hitbox, unit: object}>} — entity.id → entry */
    this.entries = new Map();
  }

  /**
   * Register a hitbox for a unit.
   * @param {object} unit — { entity, mesh, controller, team, weaponDef, ... }
   * @returns {Hitbox}
   */
  register(unit) {
    const isPlayer = unit.team === 'A';
    const group = isPlayer ? GROUP_PLAYER_ATTACKER : GROUP_ENEMY_ATTACKER;
    const mask  = isPlayer ? (GROUP_ENEMY | GROUP_SHIELD) : (GROUP_PLAYER | GROUP_SHIELD);

    // Size based on weapon range
    const range = unit.weaponDef?.range || 2.5;
    const isRanged = range > 5;
    const size = isRanged
      ? { x: 0.1, y: 0.1, z: 0.1 }    // Ranged — tiny hitbox (projectiles do the work)
      : { x: 0.2, y: 0.2, z: range / 3 };

    const hitbox = new Hitbox(this.physicsWorld, { group, mask, size });
    hitbox.owner = {
      unit,
      get canDamage() {
        // Check FSM canDamage tag if ArenaController present
        const ctrl = unit.controller;
        if (ctrl?._fsmService) {
          return ctrl._fsmService.getSnapshot?.()?.hasTag?.('canDamage') ?? false;
        }
        // For AI units, check their _fsmService directly
        if (unit._fsmService) {
          return unit._fsmService.getSnapshot?.()?.hasTag?.('canDamage') ?? false;
        }
        return false;
      },
    };

    this.entries.set(unit.entity.id, { hitbox, unit });
    return hitbox;
  }

  /** Per-frame update: sync all hitbox positions and resolve hits. */
  update() {
    for (const [, entry] of this.entries) {
      const { hitbox, unit } = entry;
      // Sync hitbox to weapon bone or mesh forward
      const boneDelegate = unit.mesh?.getObjectByName?.('sword_joint') ||
                           unit.mesh?.getObjectByName?.('weapon_bone');
      if (boneDelegate) {
        hitbox.syncToBone(boneDelegate);
      } else {
        hitbox.syncToMeshForward(unit.mesh);
      }
      hitbox.resolveHits();
    }
  }

  unregister(entityId) {
    const entry = this.entries.get(entityId);
    if (entry) {
      entry.hitbox.dispose();
      this.entries.delete(entityId);
    }
  }

  dispose() {
    for (const [, entry] of this.entries) entry.hitbox.dispose();
    this.entries.clear();
  }
}
