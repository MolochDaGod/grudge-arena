/**
 * Arena AI — State-driven combat AI for team arena
 *
 * States: idle → engage → approach → attack → retreat → dead
 * Each AI unit picks targets, manages cooldowns, and uses abilities.
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
const RETREAT_HP_THRESHOLD = 0.25;
const ATTACK_COOLDOWN = 1.5; // base seconds between attacks
const ABILITY_CHECK_INTERVAL = 2.0;
const MOVE_SPEED = 4;

export class ArenaAI {
  constructor() {
    /** All AI-controlled units */
    this.units = [];
  }

  /** Register an AI unit: { entity, mesh, controller, team, weaponDef } */
  register(unit) {
    unit.aiState = AI_STATES.IDLE;
    unit.aiTarget = null;
    unit.aiAttackTimer = 0;
    unit.aiAbilityTimer = 0;
    unit.aiCooldowns = {}; // abilityKey → remaining seconds
    this.units.push(unit);
  }

  /** Get all living units on a team */
  getTeamAlive(allUnits, teamId) {
    return allUnits.filter(u => u.team === teamId && !u.entity.hasTag('dead'));
  }

  /** Find nearest enemy unit */
  findNearestEnemy(unit, allUnits) {
    const enemyTeam = unit.team === 'A' ? 'B' : 'A';
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
        // During countdown, just idle
        if (unit.controller?.currentState !== 'idle') {
          unit.controller?.play('idle');
        }
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
          unit.controller?.play('idle');
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
        const weaponRange = unit.weaponDef?.range > 5 ? RANGED_RANGE : MELEE_RANGE;

        if (dist <= weaponRange) {
          unit.aiState = AI_STATES.ATTACK;
          return;
        }

        // Move toward target
        const dir = new THREE.Vector3()
          .subVectors(unit.aiTarget.mesh.position, unit.mesh.position)
          .normalize();
        unit.mesh.position.addScaledVector(dir, MOVE_SPEED * delta);
        this._clampToArena(unit.mesh);

        // Face target
        unit.mesh.lookAt(
          unit.aiTarget.mesh.position.x,
          unit.mesh.position.y,
          unit.aiTarget.mesh.position.z
        );

        // Play run animation
        unit.controller?.play('run');
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
        const weaponRange = unit.weaponDef?.range > 5 ? RANGED_RANGE : MELEE_RANGE;

        // If target moved out of range, re-approach
        if (dist > weaponRange * 1.3) {
          unit.aiState = AI_STATES.APPROACH;
          return;
        }

        // Face target
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

        // Basic attack
        if (unit.aiAttackTimer <= 0) {
          this._performAttack(unit);
          unit.aiAttackTimer = ATTACK_COOLDOWN / (unit.weaponDef?.attackSpeed || 1);
        } else {
          // Idle between attacks
          unit.controller?.play('idle');
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
        unit.mesh.position.addScaledVector(awayDir, MOVE_SPEED * 0.8 * delta);
        this._clampToArena(unit.mesh);
        unit.controller?.play('run');

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
    // Pick random attack animation
    const attacks = ['attack1', 'attack2', 'attack3'];
    const anim = attacks[Math.floor(Math.random() * attacks.length)];
    unit.controller?.playOnce(anim, 1.2);

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
      if (key === 'P') continue; // Save ultimate
      if (unit.aiCooldowns[key] > 0) continue;

      // Check resource cost
      const resources = unit.entity.getComponent('Resources');
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

      // Play cast/attack animation
      const castAnims = ['cast', 'attack1', 'spin', 'aoe'];
      const anim = castAnims.find(a => unit.controller?.actions.has(a)) || 'attack1';
      unit.controller?.playOnce(anim, 1);

      // Apply ability damage to target
      if (ability.damage && unit.aiTarget) {
        const hp = unit.aiTarget.entity.getComponent('Health');
        if (hp && !hp.invulnerable) {
          hp.current = Math.max(0, hp.current - ability.damage);
          if (hp.current <= 0) {
            unit.aiTarget.entity.addTag('dead');
            unit.aiTarget.controller?.play('death', { loop: false });
          }
        }
      }

      return true;
    }
    return false;
  }

  /** Keep AI units inside the arena ring */
  _clampToArena(mesh) {
    mesh.position.x = Math.max(-35, Math.min(35, mesh.position.x));
    mesh.position.z = Math.max(-35, Math.min(35, mesh.position.z));
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
