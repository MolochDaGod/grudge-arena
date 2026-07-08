/**
 * Arena AI — State-driven combat AI for team arena
 *
 * States: idle → engage → approach → attack → retreat → dead
 * Each AI unit picks targets, manages cooldowns, and uses abilities.
 *
 * Physics integration:
 *   - AIDetector (trigger sphere) for target acquisition
 *   - AIBehaviorFSM (per-class cooldown) for attack gating
 *   - Physics body movement instead of direct mesh.position mutation
 *   - Facing controlled via FSM canFacing tag (annihilatetrainer pattern)
 */

import * as THREE from 'three';

const AI_STATES = {
  IDLE:     'idle',
  ENGAGE:   'engage',
  APPROACH: 'approach',
  ATTACK:   'attack',
  RETREAT:  'retreat',
  DEAD:     'dead',
};

const ENGAGE_RANGE = 25;
const MELEE_RANGE = 2.5;
const RANGED_RANGE = 18;
// Ranged kite: back off if enemy is closer than this (creates an optimal
// firing zone between RANGED_KITE_MIN and RANGED_RANGE).
const RANGED_KITE_MIN = 8;
const RETREAT_HP_THRESHOLD = 0.25;
const ATTACK_COOLDOWN = 1.5; // base seconds between attacks
const ABILITY_CHECK_INTERVAL = 2.0;
const MOVE_SPEED = 4;

/** World XZ → character-local locomotion for baked DirLocoBlend pipeline. */
function driveUnitLocomotion(unit, worldDir, speedScalar, sprinting = false) {
  const ctrl = unit?.controller;
  if (!ctrl) return;

  const maxSpeed =
    unit.entity?.getComponent?.("Movement")?.maxSpeed ||
    unit.weaponDef?.moveSpeed ||
    5;
  const speed01 = Math.min(1, Math.max(0, speedScalar / maxSpeed));

  if (speed01 < 0.05 || !worldDir || worldDir.lengthSq() < 1e-6) {
    if (ctrl.setDirLocomotion) {
      ctrl.setDirLocomotion(0, 0, 0, false, false);
    } else if (ctrl.setGaitFromSpeed) {
      ctrl.setGaitFromSpeed(0, false);
    } else {
      ctrl.play("idle");
    }
    return;
  }

  const dir = worldDir.clone().normalize();
  if (ctrl.setDirLocomotion) {
    const yaw = unit.mesh.rotation.y;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const lx = dir.x * cos - dir.z * sin;
    const lz = dir.x * sin + dir.z * cos;
    ctrl.setDirLocomotion(lx, lz, speed01, sprinting, false);
  } else if (ctrl.setGaitFromSpeed) {
    ctrl.setGaitFromSpeed(speed01, sprinting);
  } else {
    ctrl.play(sprinting ? "run" : "walk");
  }
}

export class ArenaAI {
  constructor() {
    /** All AI-controlled units */
    this.units = [];
    /** @type {import('./engine/ArenaTerrainSystem.js').ArenaTerrainSystem | null} */
    this.terrainSystem = null;
    this.clampRadius = 35;
  }

  /**
   * Register an AI unit.
   * @param {object} unit — { entity, mesh, controller, team, weaponDef }
   * @param {object} [physics] — { detector: AIDetector, behaviorFSM, physicsBody }
   */
  register(unit, physics) {
    unit.aiState = AI_STATES.IDLE;
    unit.aiTarget = null;
    unit.aiAttackTimer = 0;
    unit.aiAbilityTimer = 0;
    unit.aiCooldowns = {}; // abilityKey → remaining seconds
    unit.aiPath = null;
    unit.aiPathIdx = 0;
    // Physics-based systems (optional — falls back to distance checks if absent)
    unit.aiDetector = physics?.detector || null;
    unit.aiBehaviorFSM = physics?.behaviorFSM || null;
    unit.physicsBody = physics?.physicsBody || null;
    this.units.push(unit);
  }

  _moveUnit(unit, worldDir, speed, delta) {
    const dx = worldDir.x * speed * delta;
    const dz = worldDir.z * speed * delta;
    if (this.terrainSystem) {
      const resolved = this.terrainSystem.resolveMove(
        unit.mesh,
        dx,
        dz,
        worldDir.x,
        worldDir.z,
      );
      unit.mesh.position.x = resolved.x;
      unit.mesh.position.z = resolved.z;
      this.terrainSystem.snapMesh(unit.mesh);
    } else if (unit.physicsBody) {
      unit.physicsBody.position.x += dx;
      unit.physicsBody.position.z += dz;
    } else {
      unit.mesh.position.x += dx;
      unit.mesh.position.z += dz;
    }
    this._clampToArena(unit.mesh);
  }

  _ensurePath(unit, targetMesh) {
    if (!this.terrainSystem || !targetMesh) {
      unit.aiPath = null;
      unit.aiPathIdx = 0;
      return null;
    }
    const dest = targetMesh.position;
    if (!unit._aiPathTarget) unit._aiPathTarget = new THREE.Vector3();
    const targetMoved = unit._aiPathTarget.distanceToSquared(dest) > 9;
    if (!unit.aiPath?.length || targetMoved) {
      unit.aiPath = this.terrainSystem.findPath(
        unit.mesh.position.x,
        unit.mesh.position.z,
        dest.x,
        dest.z,
      );
      unit.aiPathIdx = 0;
      unit._aiPathTarget.copy(dest);
    }
    return unit.aiPath;
  }

  _steerAlongPath(unit, targetMesh, speed, delta) {
    const path = this._ensurePath(unit, targetMesh);
    if (!path?.length) {
      const toTarget = new THREE.Vector3()
        .subVectors(targetMesh.position, unit.mesh.position);
      if (toTarget.lengthSq() < 1e-6) return null;
      toTarget.normalize();
      this._moveUnit(unit, toTarget, speed, delta);
      return toTarget;
    }

    while (unit.aiPathIdx < path.length) {
      const wp = path[unit.aiPathIdx];
      const toWp = new THREE.Vector3(wp.x - unit.mesh.position.x, 0, wp.z - unit.mesh.position.z);
      if (toWp.lengthSq() < 2.0 * 2.0) {
        unit.aiPathIdx++;
        continue;
      }
      toWp.normalize();
      this._moveUnit(unit, toWp, speed, delta);
      return toWp;
    }

    const toTarget = new THREE.Vector3()
      .subVectors(targetMesh.position, unit.mesh.position);
    if (toTarget.lengthSq() < 1e-6) return null;
    toTarget.normalize();
    this._moveUnit(unit, toTarget, speed, delta);
    return toTarget;
  }

  /** Get all living units on a team */
  getTeamAlive(allUnits, teamId) {
    return allUnits.filter(u => u.team === teamId && !u.entity.hasTag('dead'));
  }

  /**
   * Find nearest enemy unit.
   * If the unit has a physics AIDetector with an active target, use that
   * (trigger-based acquisition). Otherwise fall back to distance scanning.
   */
  findNearestEnemy(unit, allUnits) {
    if (unit.team === "N") return null;

    // Physics detector target (annihilatetrainer Ai.js pattern)
    if (unit.aiDetector) {
      const detected = unit.aiDetector.getTarget();
      if (detected?.unit) return detected.unit;
    }

    // Fallback: distance scan
    const enemyTeam = unit.team === "A" ? "B" : "A";
    const enemies = this.getTeamAlive(allUnits, enemyTeam);
    if (enemies.length === 0) return null;

    let nearest = null;
    let nearestDist = Infinity;
    for (const e of enemies) {
      const d = unit.mesh.position.distanceToSquared(e.mesh.position);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = e;
      }
    }
    return nearest;
  }

  /** Update all AI units. allUnits = full list from both teams. */
  update(delta, allUnits, isCombatActive) {
    for (const unit of this.units) {
      if (unit.entity.hasTag('dead')) {
        unit.aiState = AI_STATES.DEAD;
        continue;
      }
      if (!isCombatActive) {
        driveUnitLocomotion(unit, null, 0);
        continue;
      }

      // Tick cooldowns
      unit.aiAttackTimer = Math.max(0, unit.aiAttackTimer - delta);
      unit.aiAbilityTimer = Math.max(0, unit.aiAbilityTimer - delta);
      for (const key of Object.keys(unit.aiCooldowns)) {
        unit.aiCooldowns[key] = Math.max(0, unit.aiCooldowns[key] - delta);
      }

      // Check if current target is dead
      if (unit.aiTarget && unit.aiTarget.entity.hasTag('dead')) {
        unit.aiTarget = null;
        unit.aiState = AI_STATES.ENGAGE;
      }

      this._updateUnit(unit, delta, allUnits);
    }
  }

  _updateUnit(unit, delta, allUnits) {
    const health = unit.entity.getComponent('Health');
    const hpPct = health ? health.current / health.max : 1;

    switch (unit.aiState) {
      case AI_STATES.IDLE:
      case AI_STATES.ENGAGE: {
        // Find a target
        const target = this.findNearestEnemy(unit, allUnits);
        if (!target) {
          unit.aiState = AI_STATES.IDLE;
          driveUnitLocomotion(unit, null, 0);
          return;
        }
        unit.aiTarget = target;
        unit.aiState = AI_STATES.APPROACH;
        break;
      }

      case AI_STATES.APPROACH: {
        if (!unit.aiTarget || unit.aiTarget.entity.hasTag('dead')) {
          unit.aiState = AI_STATES.ENGAGE;
          return;
        }

        // Check HP for retreat
        if (hpPct < RETREAT_HP_THRESHOLD) {
          unit.aiState = AI_STATES.RETREAT;
          return;
        }

        const dist = unit.mesh.position.distanceTo(unit.aiTarget.mesh.position);
        const isRanged = (unit.weaponDef?.range ?? 0) > 5;
        const weaponRange = isRanged ? RANGED_RANGE : MELEE_RANGE;

        // Enter ATTACK once in optimal band:
        //   melee  → dist <= MELEE_RANGE
        //   ranged → dist in [RANGED_KITE_MIN, RANGED_RANGE]
        if (isRanged) {
          if (dist <= RANGED_RANGE && dist >= RANGED_KITE_MIN) {
            unit.aiState = AI_STATES.ATTACK;
            return;
          }
        } else if (dist <= weaponRange) {
          unit.aiState = AI_STATES.ATTACK;
          return;
        }

        const toTarget = new THREE.Vector3()
          .subVectors(unit.aiTarget.mesh.position, unit.mesh.position);
        let moveDir;
        if (isRanged && dist < RANGED_KITE_MIN) {
          moveDir = toTarget.clone().normalize().multiplyScalar(-1);
          this._moveUnit(unit, moveDir, MOVE_SPEED, delta);
        } else {
          moveDir = this._steerAlongPath(unit, unit.aiTarget.mesh, MOVE_SPEED, delta);
          if (!moveDir) {
            moveDir = toTarget.clone().normalize();
          }
        }

        // Face target (annihilatetrainer canFacing pattern)
        unit.mesh.lookAt(
          unit.aiTarget.mesh.position.x,
          unit.mesh.position.y,
          unit.aiTarget.mesh.position.z
        );

        driveUnitLocomotion(unit, moveDir, MOVE_SPEED, dist > weaponRange * 2);
        break;
      }

      case AI_STATES.ATTACK: {
        if (!unit.aiTarget || unit.aiTarget.entity.hasTag('dead')) {
          unit.aiState = AI_STATES.ENGAGE;
          return;
        }

        // Check HP for retreat
        if (hpPct < RETREAT_HP_THRESHOLD) {
          unit.aiState = AI_STATES.RETREAT;
          return;
        }

        const dist = unit.mesh.position.distanceTo(unit.aiTarget.mesh.position);
        const isRanged = (unit.weaponDef?.range ?? 0) > 5;
        const weaponRange = isRanged ? RANGED_RANGE : MELEE_RANGE;

        // If target moved out of range, re-approach (melee) or close the gap (ranged)
        if (dist > weaponRange * 1.3) {
          unit.aiState = AI_STATES.APPROACH;
          return;
        }
        // If a ranged unit got melee'd, kite back into the optimal band
        if (isRanged && dist < RANGED_KITE_MIN * 0.75) {
          unit.aiState = AI_STATES.APPROACH;
          return;
        }

        // Melee sticks glued to target — close residual gap every frame so
        // a moving enemy doesn't slip out of melee range.
        if (!isRanged && dist > MELEE_RANGE * 0.8) {
          const dir = new THREE.Vector3()
            .subVectors(unit.aiTarget.mesh.position, unit.mesh.position)
            .normalize();
          this._moveUnit(unit, dir, MOVE_SPEED, delta);
        }

        // Always face target before swinging (WoW snap-to-target)
        unit.mesh.lookAt(
          unit.aiTarget.mesh.position.x,
          unit.mesh.position.y,
          unit.aiTarget.mesh.position.z
        );

      // Try to use an ability
        if (unit.aiAbilityTimer <= 0 && unit.weaponDef?.abilities) {
          const used = this._tryUseAbility(unit);
          if (used) {
            unit.aiAbilityTimer = ABILITY_CHECK_INTERVAL;
            return;
          }
        }

        // Basic attack — use per-class AIBehaviorFSM if available
        if (unit.aiBehaviorFSM) {
          unit.aiBehaviorFSM.attack();
        } else if (unit.aiAttackTimer <= 0) {
          this._performAttack(unit);
          unit.aiAttackTimer = ATTACK_COOLDOWN / (unit.weaponDef?.attackSpeed || 1);
        } else {
          driveUnitLocomotion(unit, null, 0);
        }
        break;
      }

      case AI_STATES.RETREAT: {
        if (!unit.aiTarget) {
          unit.aiState = AI_STATES.ENGAGE;
          return;
        }

        // If HP recovered, re-engage
        if (hpPct > RETREAT_HP_THRESHOLD + 0.1) {
          unit.aiState = AI_STATES.APPROACH;
          return;
        }

        // Move away from target
        const awayDir = new THREE.Vector3()
          .subVectors(unit.mesh.position, unit.aiTarget.mesh.position)
          .normalize();
        this._moveUnit(unit, awayDir, MOVE_SPEED * 0.8, delta);
        driveUnitLocomotion(unit, awayDir, MOVE_SPEED * 0.8, true);

        // Try defensive ability (block, heal, etc.)
        if (unit.aiAbilityTimer <= 0) {
          this._tryDefensiveAbility(unit);
          unit.aiAbilityTimer = ABILITY_CHECK_INTERVAL;
        }
        break;
      }
    }
  }

  _performAttack(unit) {
    // Cycle through the weapon's declared swing anims (WeaponDefinitions),
    // falling back to generic attack1-3 if the weapon didn't set them.
    const attacks = unit.weaponDef?.attackAnims?.length
      ? unit.weaponDef.attackAnims
      : ['attack1', 'attack2', 'attack3'];
    unit._swingIdx = ((unit._swingIdx ?? -1) + 1) % attacks.length;
    unit.controller?.playOnce(attacks[unit._swingIdx], 1.2);

    // Deal damage to target
    if (unit.aiTarget) {
      const targetHP = unit.aiTarget.entity.getComponent('Health');
      if (targetHP && !targetHP.invulnerable) {
        const dmg = unit.weaponDef?.baseAttackDamage || 30;
        const variance = 0.8 + Math.random() * 0.4; // ±20%
        targetHP.current = Math.max(0, targetHP.current - dmg * variance);
        targetHP.lastDamageTime = performance.now();

        // Play hit reaction on target
        if (unit.aiTarget.controller) {
          unit.aiTarget.controller.playOnce('hit', 1.5);
        }

        // Check death
        if (targetHP.current <= 0) {
          unit.aiTarget.entity.addTag('dead');
          unit.aiTarget.controller?.play('death', { loop: false });
          unit.aiTarget = null;
          unit.aiState = AI_STATES.ENGAGE;
        }
      }
    }
  }

  _tryUseAbility(unit) {
    if (!unit.weaponDef?.abilities) return false;

    const entries = Object.entries(unit.weaponDef.abilities);
    // Shuffle for variety
    const shuffled = entries.sort(() => Math.random() - 0.5);

    for (const [key, ability] of shuffled) {
      if (key === "P") continue; // Save ultimate
      if (unit.aiCooldowns[key] > 0) continue;

      // Check resource cost
      const resources = unit.entity.getComponent("Resources");
      if (ability.costType && resources) {
        const pool = resources[ability.costType];
        if (pool && pool.current < (ability.cost || 0)) continue;
      }

      // Use the ability
      unit.aiCooldowns[key] = ability.cooldown || 5;

      // Deduct resource
      if (ability.costType && resources) {
        const pool = resources[ability.costType];
        if (pool) pool.current -= ability.cost || 0;
      }

      // Play the ability's declared skillAnim, then fall back to a
      // sensible cast/slash anim that exists on this weapon.
      const candidates = [
        ability.skillAnim,
        "cast",
        "swing",
        "aoe",
        "attack1",
      ].filter(Boolean);
      const anim =
        candidates.find((a) => unit.controller?.actions.has(a)) || "attack1";
      unit.controller?.playOnce(anim, 1);

      // Apply ability damage to target
      if (ability.damage && unit.aiTarget) {
        const hp = unit.aiTarget.entity.getComponent("Health");
        if (hp && !hp.invulnerable) {
          hp.current = Math.max(0, hp.current - ability.damage);
          if (hp.current <= 0) {
            unit.aiTarget.entity.addTag("dead");
            unit.aiTarget.controller?.play("death", { loop: false });
          }
        }
      }

      return true;
    }
    return false;
  }

  /** Keep AI units inside the arena ring */
  _clampToArena(mesh) {
    const r = this.clampRadius ?? 35;
    mesh.position.x = Math.max(-r, Math.min(r, mesh.position.x));
    mesh.position.z = Math.max(-r, Math.min(r, mesh.position.z));
  }

  _tryDefensiveAbility(unit) {
    if (!unit.weaponDef?.abilities) return;

    // Look for shield/block/heal abilities
    for (const [key, ability] of Object.entries(unit.weaponDef.abilities)) {
      if (unit.aiCooldowns[key] > 0) continue;
      if (!['shield', 'buff_damage', 'stealth'].includes(ability.effect)) continue;

      unit.aiCooldowns[key] = ability.cooldown || 5;
      unit.controller?.playOnce('block', 0.8);

      // Apply shield if applicable
      if (ability.effect === 'shield') {
        const hp = unit.entity.getComponent('Health');
        if (hp) hp.invulnerable = true;
        setTimeout(() => { if (hp) hp.invulnerable = false; }, (ability.duration || 3) * 1000);
      }
      return;
    }
  }
}
