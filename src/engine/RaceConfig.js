/**
 * RaceConfig — 6 playable races across 3 factions
 *
 * Defines: faction identity, faction colors (for gear tinting), and
 * mesh prefixes for future FBX equipment support.
 *
 * NOTE: Stat scaling comes from equipped gear (Cloth/Leather/Metal × 6 sets)
 * and the 8-attribute point allocation system with diminishing returns —
 * NOT from race multipliers. All races start at equal base stats.
 *
 * Weapon types (from shared/definitions/types.ts):
 *   sword, axe, mace, dagger, bow, staff, wand, spear, fist
 *
 * Classes (from classSkillTrees.ts): Warrior, Mage, Ranger, Worge
 * Weapon skills (from weaponSkillsNew.ts): per-weapon skill trees with
 *   primary/secondary/ability/ultimate slots
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
    gearTint: 0xc9a84c,  // Gold/bronze for Crusade
    scale: 1.0,
    heightOffset: 0,
  },

  barbarian: {
    name: 'Barbarian',
    faction: Factions.CRUSADE,
    prefix: 'BRB_',
    gearTint: 0xaa5522,   // Dark bronze
    scale: 1.12,
    heightOffset: 0.06,
  },

  elf: {
    name: 'Elf',
    faction: Factions.FABLED,
    prefix: 'ELF_',
    gearTint: 0x88ccaa,   // Teal/silver for Fabled
    scale: 1.05,
    heightOffset: 0.02,
  },

  dwarf: {
    name: 'Dwarf',
    faction: Factions.FABLED,
    prefix: 'DWF_',
    gearTint: 0x6688aa,   // Steel blue
    scale: 0.85,
    heightOffset: -0.08,
  },

  orc: {
    name: 'Orc',
    faction: Factions.LEGION,
    prefix: 'ORC_',
    gearTint: 0x884422,   // Dark rust for Legion
    scale: 1.08,
    heightOffset: 0.04,
  },

  undead: {
    name: 'Undead',
    faction: Factions.LEGION,
    prefix: 'UD_',
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

/**
 * Resolve weapon type — any race can use any weapon.
 * Class/weapon restrictions are handled by the class skill tree system,
 * not by race. This just passes through the preferred weapon.
 */
export function resolveWeapon(_raceId, preferred) {
  return preferred;
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
