/**
 * Weapon Definitions — 5 weapon classes with unique abilities.
 * Each weapon has Q/E/R/F/P abilities with cooldowns, costs, and effect types.
 */

export const WeaponTypes = {
  GREATSWORD: 'greatsword',
  BOW: 'bow',
  SABRES: 'sabres',
  SCYTHE: 'scythe',
  RUNEBLADE: 'runeblade'
};

export const WeaponDefinitions = {
  [WeaponTypes.GREATSWORD]: {
    name: 'Greatsword', title: 'IMMORTAL',
    description: 'Defensive tank with rage-powered devastation',
    primaryResource: 'rage', baseAttackDamage: 45, attackSpeed: 0.8, range: 2.5,
    abilities: {
      Q: { name: 'Fullguard', description: 'Block all damage for 3 seconds. Generates rage on block.', cooldown: 7, cost: 0, costType: null, duration: 3, effect: 'shield' },
      E: { name: 'Charge', description: 'Dash forward dealing damage to enemies in path.', cooldown: 8, cost: 0, costType: null, damage: 60, distance: 10, effect: 'dash' },
      R: { name: 'Colossus Smash', description: 'Lightning strike from above dealing massive damage.', cooldown: 5, cost: 25, costType: 'rage', damage: 120, aoeRadius: 4, effect: 'aoe_strike' },
      F: { name: 'Divine Wind', description: 'Throw your sword, dealing damage and pulling enemies.', cooldown: 1.5, cost: 10, costType: 'rage', damage: 40, range: 15, effect: 'projectile_pull' },
      P: { name: 'Berserker Rage', description: 'Ultimate: Enter rage mode, doubling damage for 8 seconds.', cooldown: 60, cost: 100, costType: 'rage', duration: 8, effect: 'buff_damage' }
    }
  },
  [WeaponTypes.BOW]: {
    name: 'Bow', title: 'VIPER',
    description: 'Ranged sniper with deadly precision',
    primaryResource: 'energy', baseAttackDamage: 30, attackSpeed: 1.2, range: 25,
    abilities: {
      Q: { name: 'Frost Bite', description: 'Fire 5 frost arrows that slow enemies.', cooldown: 5, cost: 50, costType: 'energy', damage: 15, projectileCount: 5, slowDuration: 3, effect: 'multi_projectile' },
      E: { name: 'Cobra Shot', description: 'Venomous arrow dealing damage over time.', cooldown: 2, cost: 60, costType: 'energy', damage: 20, dotDamage: 40, dotDuration: 4, effect: 'dot_projectile' },
      R: { name: 'Viper Sting', description: 'Piercing arrow that heals you for damage dealt.', cooldown: 2, cost: 60, costType: 'energy', damage: 50, healPercent: 0.5, effect: 'lifesteal_projectile' },
      F: { name: 'Cloudkill', description: 'Rain of arrows creating a poison zone.', cooldown: 4, cost: 40, costType: 'energy', damage: 10, tickRate: 0.5, duration: 5, radius: 5, effect: 'aoe_zone' },
      P: { name: 'Death Mark', description: 'Ultimate: Mark target for death, next hit deals triple damage.', cooldown: 45, cost: 0, costType: null, duration: 10, damageMultiplier: 3, effect: 'debuff_target' }
    }
  },
  [WeaponTypes.SABRES]: {
    name: 'Sabres', title: 'ASSASSIN',
    description: 'Stealth burst with deadly combos',
    primaryResource: 'energy', baseAttackDamage: 25, attackSpeed: 2.0, range: 1.5,
    abilities: {
      Q: { name: 'Shadow Step', description: 'Teleport behind target enemy.', cooldown: 6, cost: 40, costType: 'energy', range: 15, effect: 'teleport_behind' },
      E: { name: 'Blade Dance', description: 'Spin attack hitting all nearby enemies.', cooldown: 3, cost: 30, costType: 'energy', damage: 40, radius: 3, effect: 'aoe_melee' },
      R: { name: 'Eviscerate', description: 'Critical strike dealing bonus damage to low HP targets.', cooldown: 1, cost: 50, costType: 'energy', damage: 80, executeThreshold: 0.3, executeMultiplier: 2, effect: 'execute' },
      F: { name: 'Vanish', description: 'Become invisible for 3 seconds. Next attack crits.', cooldown: 12, cost: 60, costType: 'energy', duration: 3, effect: 'stealth' },
      P: { name: 'Shadow Dance', description: 'Ultimate: Reset all cooldowns and gain 50% attack speed.', cooldown: 90, cost: 0, costType: null, duration: 10, effect: 'reset_cooldowns' }
    }
  },
  [WeaponTypes.SCYTHE]: {
    name: 'Scythe', title: 'WEAVER',
    description: 'Fire and Ice caster with devastating spells',
    primaryResource: 'mana', baseAttackDamage: 35, attackSpeed: 1.0, range: 3,
    abilities: {
      Q: { name: 'Fireball', description: 'Launch a fireball that explodes on impact.', cooldown: 3, cost: 30, costType: 'mana', damage: 70, splashRadius: 3, effect: 'fireball' },
      E: { name: 'Frost Nova', description: 'Freeze all nearby enemies for 2 seconds.', cooldown: 8, cost: 50, costType: 'mana', damage: 30, freezeDuration: 2, radius: 5, effect: 'frost_nova' },
      R: { name: 'Meteor Strike', description: 'Call down a meteor at target location.', cooldown: 12, cost: 80, costType: 'mana', damage: 150, castTime: 1.5, radius: 6, effect: 'meteor' },
      F: { name: 'Blink', description: 'Instantly teleport a short distance.', cooldown: 4, cost: 20, costType: 'mana', distance: 8, effect: 'blink' },
      P: { name: 'Elemental Fury', description: 'Ultimate: Spells cast twice for 10 seconds.', cooldown: 60, cost: 100, costType: 'mana', duration: 10, effect: 'double_cast' }
    }
  },
  [WeaponTypes.RUNEBLADE]: {
    name: 'Runeblade', title: 'TEMPLAR',
    description: 'Life-steal knight with holy magic',
    primaryResource: 'mana', baseAttackDamage: 40, attackSpeed: 1.1, range: 2,
    abilities: {
      Q: { name: 'Holy Strike', description: 'Smite enemy, healing for damage dealt.', cooldown: 4, cost: 25, costType: 'mana', damage: 50, healPercent: 0.3, effect: 'melee_lifesteal' },
      E: { name: 'Divine Shield', description: 'Shield yourself and nearby allies.', cooldown: 10, cost: 60, costType: 'mana', shieldAmount: 100, duration: 5, radius: 5, effect: 'aoe_shield' },
      R: { name: 'Judgment', description: 'Holy beam dealing damage and healing allies it passes.', cooldown: 6, cost: 50, costType: 'mana', damage: 80, healAmount: 50, width: 2, range: 15, effect: 'beam' },
      F: { name: 'Consecration', description: 'Create holy ground that damages enemies and heals allies.', cooldown: 8, cost: 40, costType: 'mana', damagePerTick: 20, healPerTick: 15, duration: 6, radius: 4, effect: 'ground_zone' },
      P: { name: 'Divine Intervention', description: 'Ultimate: Become invulnerable and fully heal over 3 seconds.', cooldown: 120, cost: 0, costType: null, duration: 3, effect: 'full_heal_invuln' }
    }
  }
};
