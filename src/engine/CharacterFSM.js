/**
 * CharacterFSM — XState finite state machine for arena characters
 * 
 * Adapted from annihilate Maria.js FSM with our hotkey mapping:
 *   LMB → attack, RMB → heavy, Space → jump, Ctrl → dash,
 *   Q → block, 1-5 → skill1..skill5
 * 
 * State tags (annihilate pattern):
 *   canMove: WASD movement allowed
 *   canDamage: hitbox active, can deal damage
 *   knockDown: attack sends target to knockdown state
 */

import { createMachine, interpret } from 'xstate';

/**
 * Create a character FSM for the given character reference.
 * @param {Object} char - { fadeToAction, oaction, body, direction, facing, mesh, ... }
 * @returns XState service (interpreter)
 */
export function createCharacterFSM(char) {
  const machine = createMachine(
    {
      id: 'character',
      initial: 'idle',
      states: {
        // ── Grounded states ────────────────────────────
        idle: {
          entry: 'playIdle',
          on: {
            run:     'run',
            attack:  'attackStart',
            heavy:   'heavyStart',
            jump:    'jump',
            dash:    'dash',
            block:   'block',
            hit:     'hit',
            skill:   'skill',
            air:     'fall',
            die:     'dead',
          },
        },
        run: {
          entry: 'playRun',
          on: {
            stop:    'idle',
            attack:  'attackStart',
            heavy:   'heavyStart',
            jump:    'jump',
            dash:    'dash',
            block:   'block',
            hit:     'hit',
            skill:   'skill',
            air:     'fall',
            die:     'dead',
          },
          tags: ['canMove'],
        },

        // ── Attack combo chain (annihilate: attack → fist → strike) ──
        attackStart: {
          entry: 'playAttack1',
          on: {
            hit:    'hit',
            dash:   'dash',
            die:    'dead',
          },
          tags: ['canDamage'],
          initial: 'main',
          states: {
            main: {
              on: {
                finish: { target: '#character.idle' },
                attack: { target: 'prepareNext' },
              },
            },
            prepareNext: {
              on: {
                finish: { target: '#character.attack2' },
              },
            },
          },
        },
        attack2: {
          entry: 'playAttack2',
          on: {
            hit:    'hit',
            dash:   'dash',
            die:    'dead',
          },
          tags: ['canDamage'],
          initial: 'main',
          states: {
            main: {
              on: {
                finish: { target: '#character.idle' },
                attack: { target: 'prepareNext' },
              },
            },
            prepareNext: {
              on: {
                finish: { target: '#character.attack3' },
              },
            },
          },
        },
        attack3: {
          entry: 'playAttack3',
          on: {
            finish: 'idle',
            hit:    'hit',
            dash:   'dash',
            die:    'dead',
          },
          tags: ['canDamage', 'knockDown'],
        },

        // ── Heavy attack (RMB) ────────────────────────
        heavyStart: {
          entry: 'playHeavy',
          on: {
            finish: 'idle',
            hit:    'hit',
            dash:   'dash',
            die:    'dead',
          },
          tags: ['canDamage', 'knockDown'],
        },

        // ── Skill (1-5) ──────────────────────────────
        skill: {
          entry: 'playSkill',
          on: {
            finish: 'idle',
            hit:    'hit',
            die:    'dead',
          },
        },

        // ── Jump / Air states ─────────────────────────
        jump: {
          entry: ['playJump', 'doJump'],
          on: {
            finish: 'fall',
            land:   'idle',
            attack: 'airAttack',
            jump:   'doubleJump',
            hit:    'hit',
            dash:   'airDash',
            die:    'dead',
          },
          tags: ['canMove'],
        },
        doubleJump: {
          entry: ['playJump', 'doJump'],
          on: {
            finish: 'fall',
            land:   'idle',
            attack: 'airAttack',
            hit:    'hit',
            dash:   'airDash',
            die:    'dead',
          },
          tags: ['canMove'],
        },
        fall: {
          entry: 'playFall',
          on: {
            land:   'idle',
            attack: 'airAttack',
            jump:   'doubleJump',
            hit:    'hit',
            dash:   'airDash',
            die:    'dead',
          },
          tags: ['canMove'],
        },
        airAttack: {
          entry: 'playAirAttack',
          on: {
            finish: 'fall',
            land:   'idle',
            die:    'dead',
          },
          tags: ['canDamage'],
        },
        airDash: {
          entry: 'playAirDash',
          on: {
            finish: 'fall',
            land:   'idle',
            hit:    'hit',
            die:    'dead',
          },
        },

        // ── Dash (300ms → idle, annihilate pattern) ───
        dash: {
          entry: 'playDash',
          on: {
            attack: 'dashAttack',
            hit:    'hit',
            die:    'dead',
          },
          after: {
            300: 'idle',
          },
        },
        dashAttack: {
          entry: 'playDashAttack',
          on: {
            finish: 'idle',
            hit:    'hit',
            die:    'dead',
          },
          tags: ['canDamage'],
        },

        // ── Block (hold Q) ───────────────────────────
        block: {
          entry: 'playBlock',
          on: {
            blockRelease: 'idle',
            hit:          'hit', // Can still be hit while blocking (reduced damage)
            die:          'dead',
          },
        },

        // ── Hit / Stagger ────────────────────────────
        hit: {
          entry: 'playHit',
          on: {
            hit:    'hit', // Can be hit again (annihilate pattern)
            finish: [
              { target: 'fall', cond: 'isAir' },
              { target: 'idle' },
            ],
            die:    'dead',
          },
        },

        // ── Dead (terminal) ──────────────────────────
        dead: {
          entry: 'playDead',
          type: 'final',
        },
      },
    },
    {
      actions: {
        playIdle:       () => char.fadeToAction('idle'),
        playRun:        () => char.fadeToAction('run'),
        playAttack1:    () => { char.fadeToAction('attack1', 0); char.onAttack?.(1); },
        playAttack2:    () => { char.fadeToAction('attack2', 0); char.onAttack?.(2); },
        playAttack3:    () => { char.fadeToAction('attack3', 0); char.onAttack?.(3); },
        playHeavy:      () => { char.fadeToAction('swing', 0); char.onAttack?.('heavy'); },
        playSkill:      () => char.onSkill?.(),
        playJump:       () => char.fadeToAction('jump'),
        doJump:         () => char.body?.jump(5.2),
        playFall:       () => char.fadeToAction('jump', 0.3), // reuse jump anim for fall
        playAirAttack:  () => { char.fadeToAction('attack1', 0); char.onAttack?.('air'); },
        playDash:       () => {
          char.fadeToAction('roll', 0);
          char.body?.dash(char.facing.x, char.facing.y, 15);
          char.onDash?.();
        },
        playAirDash:    () => {
          char.fadeToAction('roll', 0);
          char.body?.dash(char.facing.x, char.facing.y, 11);
        },
        playDashAttack: () => { char.fadeToAction('attack1', 0); char.onAttack?.('dash'); },
        playBlock:      () => char.fadeToAction('block'),
        playHit:        () => { char.fadeToAction('hurt', 0); char.onHit?.(); },
        playDead:       () => { char.fadeToAction('dead', 0); char.onDeath?.(); },
      },
      guards: {
        isAir: () => char.body?.isAir ?? false,
      },
    }
  );

  const service = interpret(machine);
  service.start();

  // Animation finish → send 'finish' event (annihilate pattern)
  // This must be wired up by the character after registering animations
  char._fsmService = service;

  return service;
}
