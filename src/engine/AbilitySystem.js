/**
 * AbilitySystem — Data-driven ability definitions + execution
 *
 * Every ability is defined as a data object:
 *   { name, type, castTime, cooldown, gcd, cost, costType, damage,
 *     range, anim, vfx, sound, effect }
 *
 * Types:
 *   instant  — fires immediately on keypress (GCD applies)
 *   cast     — cast bar fills over castTime, then fires (interruptible)
 *   channel  — continuous effect while holding, drains resource per tick
 *   toggle   — on/off buff (e.g. berserker rage)
 *
 * Supports: GCD, per-ability cooldowns, resource costs,
 * interrupt (hit during cast), school lockout.
 */

export class AbilitySystem {
  constructor(character) {
    this.char = character;
    this.abilities = {};  // slot → AbilityDef
    this.cooldowns = {};  // slot → remaining seconds
    this.gcd = { timer: 0, duration: 1.5 };

    // Cast state
    this.casting = null;  // { slot, ability, progress, duration }
    this.interrupted = false;
    this.schoolLockout = {}; // school → remaining seconds

    // Register in updates
    if (!window.updates) window.updates = [];
    window.updates.push(this);
  }

  /** Define abilities for slots 1-5 */
  setAbilities(defs) {
    for (const [slot, def] of Object.entries(defs)) {
      this.abilities[slot] = def;
      this.cooldowns[slot] = 0;
    }
  }

  /** Try to use ability in slot (called by PlayerController) */
  use(slot) {
    const ability = this.abilities[slot];
    if (!ability) return false;

    // GCD check
    if (this.gcd.timer > 0 && ability.gcd !== false) return false;

    // Cooldown check
    if (this.cooldowns[slot] > 0) return false;

    // School lockout check
    if (ability.school && this.schoolLockout[ability.school] > 0) return false;

    // Resource check
    if (ability.cost && ability.costType) {
      const resources = this.char.resources;
      if (resources?.[ability.costType]?.current < ability.cost) return false;
    }

    // Cast-time ability
    if (ability.type === 'cast' && ability.castTime > 0) {
      this.casting = { slot, ability, progress: 0, duration: ability.castTime };
      this.char.fadeToAction(ability.anim || 'cast');
      return true;
    }

    // Instant ability
    this._execute(slot, ability);
    return true;
  }

  /** Execute an ability (instant or after cast completes) */
  _execute(slot, ability) {
    // Deduct resource
    if (ability.cost && ability.costType && this.char.resources) {
      const pool = this.char.resources[ability.costType];
      if (pool) pool.current -= ability.cost;
    }

    // Start cooldown
    this.cooldowns[slot] = ability.cooldown || 0;

    // Start GCD (unless ability is off-GCD)
    if (ability.gcd !== false) {
      this.gcd.timer = this.gcd.duration;
    }

    // Play animation
    if (ability.anim) {
      this.char.fadeToAction(ability.anim, 0);
    }

    // Execute effect callback
    if (ability.effect) {
      ability.effect(this.char);
    }

    // Send FSM event
    this.char._fsmService?.send('skill');
  }

  /** Interrupt current cast (called when hit) */
  interrupt(school = null) {
    if (!this.casting) return;

    this.interrupted = true;
    const ability = this.casting.ability;
    this.casting = null;

    // School lockout (3 seconds, like WoW)
    if (school || ability.school) {
      this.schoolLockout[school || ability.school] = 3;
    }

    this.char.fadeToAction('idle');
  }

  /** Called every frame */
  update(dt) {
    // Tick GCD
    this.gcd.timer = Math.max(0, this.gcd.timer - dt);

    // Tick cooldowns
    for (const slot of Object.keys(this.cooldowns)) {
      this.cooldowns[slot] = Math.max(0, this.cooldowns[slot] - dt);
    }

    // Tick school lockouts
    for (const school of Object.keys(this.schoolLockout)) {
      this.schoolLockout[school] = Math.max(0, this.schoolLockout[school] - dt);
    }

    // Tick casting
    if (this.casting) {
      this.casting.progress += dt;
      if (this.casting.progress >= this.casting.duration) {
        // Cast complete → fire ability
        const { slot, ability } = this.casting;
        this.casting = null;
        this._execute(slot, ability);
      }
    }
  }

  /** Get cast progress (0-1) for UI */
  get castProgress() {
    if (!this.casting) return 0;
    return this.casting.progress / this.casting.duration;
  }

  /** Get cast name for UI */
  get castName() {
    return this.casting?.ability?.name || '';
  }

  /** Is ability ready? */
  isReady(slot) {
    if (this.gcd.timer > 0) return false;
    if (this.cooldowns[slot] > 0) return false;
    const ability = this.abilities[slot];
    if (ability?.school && this.schoolLockout[ability.school] > 0) return false;
    return true;
  }
}

// ── Predefined Weapon Skill Sets ────────────────────────────────────

export const WEAPON_SKILLS = {
  greatsword: {
    1: { name: 'Fullguard', type: 'instant', cooldown: 7, anim: 'block', school: 'physical',
         effect: (char) => char.onSkillEffect?.('shield') },
    2: { name: 'Charge', type: 'instant', cooldown: 8, anim: 'dash', school: 'physical', damage: 60,
         effect: (char) => char.onSkillEffect?.('charge') },
    3: { name: 'Colossus Smash', type: 'instant', cooldown: 5, cost: 25, costType: 'rage', anim: 'swing', school: 'physical', damage: 120,
         effect: (char) => char.onSkillEffect?.('colossusSmash') },
    4: { name: 'Whirlwind', type: 'instant', cooldown: 10, cost: 30, costType: 'rage', anim: 'spin', school: 'physical', damage: 80,
         effect: (char) => char.onSkillEffect?.('whirlwind') },
    5: { name: 'Berserker Rage', type: 'toggle', cooldown: 60, anim: 'taunt', school: 'physical',
         effect: (char) => char.onSkillEffect?.('berserkerRage') },
  },
  swordShield: {
    1: { name: 'Shield Bash', type: 'instant', cooldown: 6, anim: 'kick', school: 'physical', damage: 40,
         effect: (char) => char.onSkillEffect?.('shieldBash') },
    2: { name: 'Heroic Leap', type: 'instant', cooldown: 15, anim: 'jump', school: 'physical', damage: 80,
         effect: (char) => char.onSkillEffect?.('heroicLeap') },
    3: { name: 'Execute', type: 'instant', cooldown: 3, cost: 20, costType: 'rage', anim: 'attack3', school: 'physical', damage: 150,
         effect: (char) => char.onSkillEffect?.('execute') },
    4: { name: 'Shield Wall', type: 'instant', cooldown: 30, anim: 'block', school: 'physical',
         effect: (char) => char.onSkillEffect?.('shieldWall') },
    5: { name: 'Avatar', type: 'toggle', cooldown: 90, anim: 'powerUp', school: 'physical',
         effect: (char) => char.onSkillEffect?.('avatar') },
  },
  magic: {
    1: { name: 'Fireball', type: 'cast', castTime: 1.5, cooldown: 0, cost: 30, costType: 'mana', anim: 'cast', school: 'fire', damage: 70,
         effect: (char) => char.onSkillEffect?.('fireball') },
    2: { name: 'Frost Nova', type: 'instant', cooldown: 12, cost: 20, costType: 'mana', anim: 'aoe', school: 'frost', damage: 50,
         effect: (char) => char.onSkillEffect?.('frostNova') },
    3: { name: 'Meteor', type: 'cast', castTime: 3, cooldown: 20, cost: 80, costType: 'mana', anim: 'cast2H', school: 'fire', damage: 200,
         effect: (char) => char.onSkillEffect?.('meteor') },
    4: { name: 'Blink', type: 'instant', cooldown: 15, cost: 10, costType: 'mana', anim: 'dodge', school: 'arcane', gcd: false,
         effect: (char) => char.onSkillEffect?.('blink') },
    5: { name: 'Icy Veins', type: 'toggle', cooldown: 60, cost: 0, anim: 'powerUp', school: 'frost',
         effect: (char) => char.onSkillEffect?.('icyVeins') },
  },
  longbow: {
    1: { name: 'Aimed Shot', type: 'cast', castTime: 2, cooldown: 6, cost: 30, costType: 'energy', anim: 'attack3', school: 'physical', damage: 90,
         effect: (char) => char.onSkillEffect?.('aimedShot') },
    2: { name: 'Multi-Shot', type: 'instant', cooldown: 8, cost: 20, costType: 'energy', anim: 'attack1', school: 'physical', damage: 40,
         effect: (char) => char.onSkillEffect?.('multiShot') },
    3: { name: 'Disengage', type: 'instant', cooldown: 20, anim: 'dodgeBack', school: 'physical', gcd: false,
         effect: (char) => char.onSkillEffect?.('disengage') },
    4: { name: 'Freezing Trap', type: 'instant', cooldown: 25, anim: 'crouch', school: 'physical',
         effect: (char) => char.onSkillEffect?.('freezingTrap') },
    5: { name: 'Rapid Fire', type: 'channel', cooldown: 45, cost: 0, anim: 'attack2', school: 'physical', damage: 120,
         effect: (char) => char.onSkillEffect?.('rapidFire') },
  },
  rifle: {
    1: { name: 'Aimed Shot', type: 'cast', castTime: 1.5, cooldown: 6, cost: 20, costType: 'energy', anim: 'aimIdle', school: 'physical', damage: 80,
         effect: (char) => char.onSkillEffect?.('aimedShot') },
    2: { name: 'Explosive Shot', type: 'instant', cooldown: 10, cost: 30, costType: 'energy', anim: 'attack1', school: 'fire', damage: 60,
         effect: (char) => char.onSkillEffect?.('explosiveShot') },
    3: { name: 'Dash', type: 'instant', cooldown: 15, anim: 'sprint', school: 'physical', gcd: false,
         effect: (char) => char.onSkillEffect?.('rifleDash') },
    4: { name: 'Smoke Bomb', type: 'instant', cooldown: 30, anim: 'crouch', school: 'physical',
         effect: (char) => char.onSkillEffect?.('smokeBomb') },
    5: { name: 'Kill Shot', type: 'instant', cooldown: 45, cost: 0, anim: 'attack1', school: 'physical', damage: 200,
         effect: (char) => char.onSkillEffect?.('killShot') },
  },
};
