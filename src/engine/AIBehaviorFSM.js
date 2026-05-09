/**
 * AIBehaviorFSM — Per-class attack cooldown FSMs.
 *
 * Adapts the annihilatetrainer RobotAi / MutantAi / PaladinAi pattern to
 * XState v5 (createMachine + createActor) for the 4 Grudge Arena classes:
 *   warlord  — 2s cooldown, melee combo
 *   arcanist — 4s cooldown, delayed spell cast
 *   ranger   — 1.5s cooldown, ranged shot
 *   assassin — 1s cooldown, fast double-hit
 *
 * Each FSM gates the character's attack to prevent animation spam.
 * The pattern: canAttack → (send attack to character FSM) → canNotAttack → (timer) → canAttack.
 */

import { createMachine, createActor } from 'xstate';

/** Cooldown configs per class (ms for XState `after`). */
const CLASS_CONFIGS = {
  warlord:  { cooldownMs: 2000, attackEvent: 'attack' },
  arcanist: { cooldownMs: 4000, attackEvent: 'attack', delayMs: 800 },
  ranger:   { cooldownMs: 1500, attackEvent: 'attack' },
  assassin: { cooldownMs: 1000, attackEvent: 'attack', doubleHit: true, secondHitMs: 300 },
};

/**
 * Create an AI behavior FSM for a given class.
 *
 * @param {string} classId         — 'warlord' | 'arcanist' | 'ranger' | 'assassin'
 * @param {object} characterFSM    — XState actor (the character's movement/attack FSM)
 * @param {Function} [onProjectile] — callback to spawn a projectile (arcanist/ranger)
 * @returns {{ actor, attack: () => void }}
 */
export function createAIBehaviorFSM(classId, characterFSM, onProjectile) {
  const cfg = CLASS_CONFIGS[classId] || CLASS_CONFIGS.warlord;

  const machine = createMachine(
    {
      id: `ai_${classId}`,
      initial: 'canAttack',
      states: {
        canAttack: {
          on: {
            attack: { target: 'canNotAttack', actions: 'doAttack' },
          },
        },
        canNotAttack: {
          after: {
            [cfg.cooldownMs]: { target: 'canAttack' },
          },
        },
      },
    },
    {
      actions: {
        doAttack: () => {
          // Primary attack event → character FSM
          characterFSM.send({ type: cfg.attackEvent });

          // Arcanist: delayed projectile after cast animation
          if (cfg.delayMs && onProjectile) {
            setTimeout(() => onProjectile(), cfg.delayMs);
          }
          // Ranger: immediate projectile
          else if (classId === 'ranger' && onProjectile) {
            onProjectile();
          }

          // Assassin: double-hit — second attack event after short delay
          if (cfg.doubleHit) {
            setTimeout(() => {
              characterFSM.send({ type: cfg.attackEvent });
            }, cfg.secondHitMs || 300);
          }
        },
      },
    },
  );

  const actor = createActor(machine);
  actor.start();

  return {
    actor,
    /**
     * Try to attack. If in cooldown, sends 'stop' to prevent run-anim spam
     * (annihilatetrainer RobotAi.attack pattern).
     */
    attack() {
      const snap = actor.getSnapshot();
      if (snap.matches('canNotAttack')) {
        characterFSM.send({ type: 'stop' });
      } else {
        actor.send({ type: 'attack' });
      }
    },
    /** @returns {boolean} */
    get canAttack() {
      return actor.getSnapshot().matches('canAttack');
    },
    dispose() {
      actor.stop();
    },
  };
}
