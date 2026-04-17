/**
 * RaceConfig — 6 playable races across 3 factions
 *
 * Defines: faction identity, weapon class restrictions, stat modifiers,
 * faction colors (for gear tinting), and mesh prefixes for future FBX support.
 *
 * Weapon restrictions follow game design rules:
 *   Warriors (human, barbarian, dwarf): shields, swords, 2h weapons
 *   Mages (elf, undead):                staffs, tomes, maces, wands
 *   Rangers (elf):                      bows, crossbows, guns, daggers, spears
 *   Worge (orc):                        staffs, spears, daggers, bows, hammers, maces
 */

// ── Factions ────────────────────────────────────────────────────

export const Factions = {
  CRUSADE: 'crusade',
  FABLED:  'fabled',
  LEGION:  'legion',
};

export const FactionColors = {
  [Factions.CRUSADE]: { primary: 0xc9a04e, secondary: 0xf0d070, emissive: 0x8b6914 },
  [Factions.FABLED]:  { primary: 0x7ec8e3, secondary: 0xaaddff, emissive: 0x3388aa },
  [Factions.LEGION]:  { primary: 0x8b2020, secondary: 0xff4444, emissive: 0x661010 },
};

// ── Race Definitions ────────────────────────────────────────────

export const Races = {
  human: {
    name: 'Human',
    faction: Factions.CRUSADE,
    prefix: 'WK_',       // Equipment mesh prefix (for FBX customizable models)
    role: 'warrior',
    // Allowed weapon types for this race
    allowedWeapons: ['greatsword', 'sabres', 'runeblade', 'bow'],
    // Default weapon when none specified
    defaultWeapon: 'greatsword',
    // Stat modifiers (multiplied against base stats)
    stats: {
      health: 1.0, damage: 1.0, speed: 1.0, armor: 1.0,
      attackSpeed: 1.0, mana: 1.0, energy: 1.0, rage: 1.0,
    },
    // Visual tint applied to procedural weapon materials
    gearTint: 0xc9a84c,   // Gold/bronze for Crusade
    // Scale config (matches RaceScaleConfig in modelLoader)
    scale: 1.0,
    heightOffset: 0,
  },

  barbarian: {
    name: 'Barbarian',
    faction: Factions.CRUSADE,
    prefix: 'BRB_',
    role: 'berserker',
    allowedWeapons: ['greatsword', 'sabres'],
    defaultWeapon: 'greatsword',
    stats: {
      health: 1.2, damage: 1.15, speed: 0.9, armor: 0.85,
      attackSpeed: 0.9, mana: 0.6, energy: 1.1, rage: 1.3,
    },
    gearTint: 0xaa5522,   // Dark bronze
    scale: 1.12,
    heightOffset: 0.06,
  },

  elf: {
    name: 'Elf',
    faction: Factions.FABLED,
    prefix: 'ELF_',
    role: 'ranger',
    allowedWeapons: ['bow', 'sabres', 'scythe', 'runeblade'],
    defaultWeapon: 'bow',
    stats: {
      health: 0.85, damage: 1.05, speed: 1.15, armor: 0.8,
      attackSpeed: 1.2, mana: 1.15, energy: 1.1, rage: 0.7,
    },
    gearTint: 0x88ccaa,   // Teal/silver for Fabled
    scale: 1.05,
    heightOffset: 0.02,
  },

  dwarf: {
    name: 'Dwarf',
    faction: Factions.FABLED,
    prefix: 'DWF_',
    role: 'tank',
    allowedWeapons: ['greatsword', 'runeblade', 'sabres'],
    defaultWeapon: 'runeblade',
    stats: {
      health: 1.15, damage: 0.95, speed: 0.85, armor: 1.3,
      attackSpeed: 0.85, mana: 1.1, energy: 0.9, rage: 1.1,
    },
    gearTint: 0x6688aa,   // Steel blue
    scale: 0.85,
    heightOffset: -0.08,
  },

  orc: {
    name: 'Orc',
    faction: Factions.LEGION,
    prefix: 'ORC_',
    role: 'bruiser',
    allowedWeapons: ['greatsword', 'sabres', 'bow', 'scythe'],
    defaultWeapon: 'greatsword',
    stats: {
      health: 1.1, damage: 1.2, speed: 0.95, armor: 1.0,
      attackSpeed: 0.95, mana: 0.8, energy: 1.0, rage: 1.2,
    },
    gearTint: 0x884422,   // Dark rust for Legion
    scale: 1.08,
    heightOffset: 0.04,
  },

  undead: {
    name: 'Undead',
    faction: Factions.LEGION,
    prefix: 'UD_',
    role: 'caster',
    allowedWeapons: ['scythe', 'runeblade', 'sabres', 'bow'],
    defaultWeapon: 'scythe',
    stats: {
      health: 0.9, damage: 1.1, speed: 1.0, armor: 0.85,
      attackSpeed: 1.0, mana: 1.3, energy: 0.9, rage: 0.8,
    },
    gearTint: 0x664488,   // Dark purple
    scale: 0.95,
    heightOffset: -0.02,
  },
};

// ── Helpers ──────────────────────────────────────────────────────

/** Get race config or default to human */
export function getRaceConfig(raceId) {
  return Races[raceId] || Races.human;
}

/** Get faction colors for a race */
export function getRaceFactionColors(raceId) {
  const race = getRaceConfig(raceId);
  return FactionColors[race.faction] || FactionColors[Factions.CRUSADE];
}

/** Check if a race can use a weapon type */
export function canRaceUseWeapon(raceId, weaponType) {
  const race = getRaceConfig(raceId);
  return race.allowedWeapons.includes(weaponType);
}

/** Get the best allowed weapon for a race given a preference */
export function resolveWeapon(raceId, preferred) {
  const race = getRaceConfig(raceId);
  if (race.allowedWeapons.includes(preferred)) return preferred;
  return race.defaultWeapon;
}

/** Apply race stat modifiers to base component values */
export function applyRaceStats(raceId, healthMax, baseSpeed) {
  const race = getRaceConfig(raceId);
  return {
    health: Math.round(healthMax * race.stats.health),
    speed: baseSpeed * race.stats.speed,
    damage: race.stats.damage,
    armor: race.stats.armor,
    attackSpeed: race.stats.attackSpeed,
  };
}

// ── Equipment tier colors ───────────────────────────────────────

export const TierConfig = {
  1: { name: 'Common',    color: 0xaaaaaa, emissive: 0x000000, emissiveIntensity: 0,    mult: 1.0 },
  2: { name: 'Uncommon',  color: 0x44cc44, emissive: 0x224422, emissiveIntensity: 0.1,  mult: 1.15 },
  3: { name: 'Rare',      color: 0x4488ff, emissive: 0x112244, emissiveIntensity: 0.15, mult: 1.35 },
  4: { name: 'Epic',      color: 0x9944ff, emissive: 0x220044, emissiveIntensity: 0.2,  mult: 1.6 },
  5: { name: 'Legendary',  color: 0xff8800, emissive: 0x442200, emissiveIntensity: 0.3,  mult: 2.0 },
  6: { name: 'Mythic',    color: 0xff4444, emissive: 0x440000, emissiveIntensity: 0.4,  mult: 2.5 },
  7: { name: 'Ascended',  color: 0xffcc00, emissive: 0x443300, emissiveIntensity: 0.5,  mult: 3.2 },
  8: { name: 'Artifact',  color: 0xff66ff, emissive: 0x440044, emissiveIntensity: 0.6,  mult: 4.0 },
};
