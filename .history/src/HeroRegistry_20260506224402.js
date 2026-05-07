/**
 * HERO REGISTRY — One entry per playable hero in Grudge Arena.
 *
 * Each hero has a single character model sourced from the appropriate asset
 * pack, three swappable weapon loadout slots, and an AI archetype.
 *
 * MODEL PATH CONVENTION
 * ─────────────────────
 * Place character pack GLBs at the paths listed in each `modelPath`.
 * Until a file exists, `createHeroUnit()` automatically falls back to the
 * generic `/models/<race>.glb` so the game always runs.
 *
 * Pack → directory mapping:
 *   KayKit 6 Humanoid Rigs  →  /models/characters/human/
 *                               /models/characters/barbarian/
 *   KayKit Adventures       →  /models/characters/adventures/
 *   KayKit Undead           →  /models/characters/undead/
 *   Pirates Set             →  /models/characters/pirate/
 *   Ultimate Pack           →  /models/characters/ultimate/
 */

import { Factions } from './engine/RaceConfig.js';

// ── Archetypes ──────────────────────────────────────────────────────────────
// Drives AI decision-making, preferred engagement range, and ability usage.
export const Archetypes = {
  WARRIOR: 'warrior', // heavy melee, sustain fighter
  RANGER:  'ranger',  // ranged primary, mobile
  MAGE:    'mage',    // caster, glass cannon
  ROGUE:   'rogue',   // melee burst, gap-closing
  HYBRID:  'hybrid',  // melee + casting mix
};

// ── Hero Definitions ─────────────────────────────────────────────────────────

export const HeroRegistry = {

  // ═══════════════════════════════════════════════════════════════════════════
  // CRUSADE — HUMAN
  // Source: KayKit 6 Humanoid Rigs (#1–#2) + KayKit Adventures (mage)
  // ═══════════════════════════════════════════════════════════════════════════

  human_knight: {
    id: 'human_knight',
    displayName: 'Knight',
    title: 'The Ironwall',
    race: 'human',
    faction: Factions.CRUSADE,
    archetype: Archetypes.WARRIOR,
    // KayKit Humanoid Rig #1 — heavy-plate male warrior
    modelPath: '/models/characters/human/knight.glb',
    fallbackModel: '/models/human.glb',
    pack: 'kaykit_humanoid',
    weapons: ['greatsword', 'runeblade', 'bow'],
    defaultWeapon: 'greatsword',
    scale: 1.0,
    heightOffset: 0,
    lore: 'A veteran of a hundred crusades. His shield has never broken.',
  },

  human_ranger: {
    id: 'human_ranger',
    displayName: 'Ranger',
    title: 'The Viper',
    race: 'human',
    faction: Factions.CRUSADE,
    archetype: Archetypes.RANGER,
    // KayKit Humanoid Rig #2 — light-armored female archer
    modelPath: '/models/characters/human/ranger.glb',
    fallbackModel: '/models/human.glb',
    pack: 'kaykit_humanoid',
    weapons: ['bow', 'sabres', 'runeblade'],
    defaultWeapon: 'bow',
    scale: 1.0,
    heightOffset: 0,
    lore: 'She never misses. She never forgives.',
  },

  human_mage: {
    id: 'human_mage',
    displayName: 'Mage',
    title: 'The Weaver',
    race: 'human',
    faction: Factions.CRUSADE,
    archetype: Archetypes.MAGE,
    // KayKit Adventures — robed human mage
    modelPath: '/models/characters/adventures/human_mage.glb',
    fallbackModel: '/models/human.glb',
    pack: 'kaykit_adventures',
    weapons: ['scythe', 'bow', 'sabres'],
    defaultWeapon: 'scythe',
    scale: 1.0,
    heightOffset: 0,
    lore: 'Fire and frost bend to his will.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CRUSADE — BARBARIAN
  // Source: KayKit 6 Humanoid Rigs (#3–#4) + KayKit Adventures (warchief)
  // ═══════════════════════════════════════════════════════════════════════════

  barbarian_berserker: {
    id: 'barbarian_berserker',
    displayName: 'Berserker',
    title: 'The Immortal',
    race: 'barbarian',
    faction: Factions.CRUSADE,
    archetype: Archetypes.WARRIOR,
    // KayKit Humanoid Rig #3 — massive armored male berserker
    modelPath: '/models/characters/barbarian/berserker.glb',
    fallbackModel: '/models/barbarian.glb',
    pack: 'kaykit_humanoid',
    weapons: ['greatsword', 'sabres', 'scythe'],
    defaultWeapon: 'greatsword',
    scale: 1.12,
    heightOffset: 0.06,
    lore: 'Rage is his armor. Death is his offering.',
  },

  barbarian_shaman: {
    id: 'barbarian_shaman',
    displayName: 'Shaman',
    title: 'The Stormbringer',
    race: 'barbarian',
    faction: Factions.CRUSADE,
    archetype: Archetypes.HYBRID,
    // KayKit Humanoid Rig #4 — totem-bearing female shaman
    modelPath: '/models/characters/barbarian/shaman.glb',
    fallbackModel: '/models/barbarian.glb',
    pack: 'kaykit_humanoid',
    weapons: ['scythe', 'greatsword', 'bow'],
    defaultWeapon: 'scythe',
    scale: 1.08,
    heightOffset: 0.04,
    lore: 'Thunder answers her call.',
  },

  barbarian_warchief: {
    id: 'barbarian_warchief',
    displayName: 'Warchief',
    title: 'The Unbroken',
    race: 'barbarian',
    faction: Factions.CRUSADE,
    archetype: Archetypes.WARRIOR,
    // KayKit Adventures — battle-scarred warlord bearing trophies
    modelPath: '/models/characters/adventures/barbarian_warchief.glb',
    fallbackModel: '/models/barbarian.glb',
    pack: 'kaykit_adventures',
    weapons: ['greatsword', 'sabres', 'runeblade'],
    defaultWeapon: 'greatsword',
    scale: 1.15,
    heightOffset: 0.08,
    lore: 'Every scar is a battle won.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FABLED — ELF
  // Source: KayKit Adventures (archer + mage), Ultimate Pack (rogue + forest ranger)
  // ═══════════════════════════════════════════════════════════════════════════

  elf_archer: {
    id: 'elf_archer',
    displayName: 'Archer',
    title: 'The Assassin',
    race: 'elf',
    faction: Factions.FABLED,
    archetype: Archetypes.RANGER,
    // KayKit Adventures — lithe female elf archer
    modelPath: '/models/characters/adventures/elf_archer.glb',
    fallbackModel: '/models/elf.glb',
    pack: 'kaykit_adventures',
    weapons: ['bow', 'sabres', 'runeblade'],
    defaultWeapon: 'bow',
    scale: 1.05,
    heightOffset: 0.02,
    lore: 'Shadows are her home. Silence is her weapon.',
  },

  elf_mage: {
    id: 'elf_mage',
    displayName: 'Arcane Mage',
    title: 'The Templar',
    race: 'elf',
    faction: Factions.FABLED,
    archetype: Archetypes.MAGE,
    // KayKit Adventures — robed male elf arcane mage
    modelPath: '/models/characters/adventures/elf_mage.glb',
    fallbackModel: '/models/elf.glb',
    pack: 'kaykit_adventures',
    weapons: ['scythe', 'runeblade', 'bow'],
    defaultWeapon: 'scythe',
    scale: 1.05,
    heightOffset: 0.02,
    lore: 'Ancient magic flows through his blood.',
  },

  elf_rogue: {
    id: 'elf_rogue',
    displayName: 'Shadow Rogue',
    title: 'The Ghost',
    race: 'elf',
    faction: Factions.FABLED,
    archetype: Archetypes.ROGUE,
    // Ultimate Pack — dark-cloaked elf rogue
    modelPath: '/models/characters/ultimate/elf_rogue.glb',
    fallbackModel: '/models/elf.glb',
    pack: 'ultimate_pack',
    weapons: ['sabres', 'bow', 'runeblade'],
    defaultWeapon: 'sabres',
    scale: 1.02,
    heightOffset: 0.01,
    lore: 'You never see her coming.',
  },

  elf_forest_ranger: {
    id: 'elf_forest_ranger',
    displayName: 'Forest Ranger',
    title: 'The Wild',
    race: 'elf',
    faction: Factions.FABLED,
    archetype: Archetypes.RANGER,
    // Ultimate Pack — nature-armored elf ranger with leaf motifs
    modelPath: '/models/characters/ultimate/elf_forest_ranger.glb',
    fallbackModel: '/models/elf.glb',
    pack: 'ultimate_pack',
    weapons: ['bow', 'sabres', 'scythe'],
    defaultWeapon: 'bow',
    scale: 1.05,
    heightOffset: 0.02,
    lore: 'The forest bends to her will.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FABLED — DWARF
  // Source: Ultimate Pack
  // ═══════════════════════════════════════════════════════════════════════════

  dwarf_ironclad: {
    id: 'dwarf_ironclad',
    displayName: 'Ironclad',
    title: 'The Wall',
    race: 'dwarf',
    faction: Factions.FABLED,
    archetype: Archetypes.WARRIOR,
    // Ultimate Pack — heavy-plate dwarf warrior
    modelPath: '/models/characters/ultimate/dwarf_ironclad.glb',
    fallbackModel: '/models/dwarf.glb',
    pack: 'ultimate_pack',
    weapons: ['greatsword', 'runeblade', 'sabres'],
    defaultWeapon: 'greatsword',
    scale: 0.85,
    heightOffset: -0.08,
    lore: 'Built like stone. Hits like a mountain.',
  },

  dwarf_runesmith: {
    id: 'dwarf_runesmith',
    displayName: 'Runesmith',
    title: 'The Forger',
    race: 'dwarf',
    faction: Factions.FABLED,
    archetype: Archetypes.HYBRID,
    // Ultimate Pack — forge-master dwarf with rune-etched tools
    modelPath: '/models/characters/ultimate/dwarf_runesmith.glb',
    fallbackModel: '/models/dwarf.glb',
    pack: 'ultimate_pack',
    weapons: ['runeblade', 'scythe', 'greatsword'],
    defaultWeapon: 'runeblade',
    scale: 0.88,
    heightOffset: -0.06,
    lore: 'His runes reshape reality.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEGION — ORC
  // Source: Ultimate Pack
  // ═══════════════════════════════════════════════════════════════════════════

  orc_warlord: {
    id: 'orc_warlord',
    displayName: 'Warlord',
    title: 'The Crusher',
    race: 'orc',
    faction: Factions.LEGION,
    archetype: Archetypes.WARRIOR,
    // Ultimate Pack — scarred orc warlord in battle-worn plate
    modelPath: '/models/characters/ultimate/orc_warlord.glb',
    fallbackModel: '/models/orc.glb',
    pack: 'ultimate_pack',
    weapons: ['greatsword', 'sabres', 'scythe'],
    defaultWeapon: 'greatsword',
    scale: 1.1,
    heightOffset: 0.05,
    lore: 'His army follows. Everything else burns.',
  },

  orc_bloodshaman: {
    id: 'orc_bloodshaman',
    displayName: 'Blood Shaman',
    title: 'The Hex',
    race: 'orc',
    faction: Factions.LEGION,
    archetype: Archetypes.HYBRID,
    // Ultimate Pack — ritualistic orc shaman with bone fetishes
    modelPath: '/models/characters/ultimate/orc_bloodshaman.glb',
    fallbackModel: '/models/orc.glb',
    pack: 'ultimate_pack',
    weapons: ['scythe', 'greatsword', 'bow'],
    defaultWeapon: 'scythe',
    scale: 1.06,
    heightOffset: 0.03,
    lore: 'Blood is the price. Pain is the profit.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEGION — UNDEAD
  // Source: KayKit Undead Pack (6 humanoid rigs)
  // ═══════════════════════════════════════════════════════════════════════════

  undead_necromancer: {
    id: 'undead_necromancer',
    displayName: 'Necromancer',
    title: 'The Weaver of Souls',
    race: 'undead',
    faction: Factions.LEGION,
    archetype: Archetypes.MAGE,
    // KayKit Undead — robed lich/undead mage with staff
    modelPath: '/models/characters/undead/necromancer.glb',
    fallbackModel: '/models/undead.glb',
    pack: 'kaykit_undead',
    weapons: ['scythe', 'runeblade', 'bow'],
    defaultWeapon: 'scythe',
    scale: 0.95,
    heightOffset: -0.02,
    lore: 'Death is merely the beginning of service.',
  },

  undead_deathknight: {
    id: 'undead_deathknight',
    displayName: 'Death Knight',
    title: 'The Fallen',
    race: 'undead',
    faction: Factions.LEGION,
    archetype: Archetypes.WARRIOR,
    // KayKit Undead — heavily-armored undead warrior
    modelPath: '/models/characters/undead/deathknight.glb',
    fallbackModel: '/models/undead.glb',
    pack: 'kaykit_undead',
    weapons: ['runeblade', 'greatsword', 'scythe'],
    defaultWeapon: 'runeblade',
    scale: 0.98,
    heightOffset: -0.01,
    lore: 'His soul was forfeit. His blade was not.',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PIRATE — human-compatible rigs, Pirates Set asset pack
  // Placed in CRUSADE faction for matchmaking; visually distinct
  // ═══════════════════════════════════════════════════════════════════════════

  pirate_captain: {
    id: 'pirate_captain',
    displayName: 'Pirate Captain',
    title: 'The Blade of the Sea',
    race: 'human',
    faction: Factions.CRUSADE,
    archetype: Archetypes.ROGUE,
    // Pirates Set — swashbuckling captain with tricorn hat and cutlass
    modelPath: '/models/characters/pirate/captain.glb',
    fallbackModel: '/models/human.glb',
    pack: 'pirates_set',
    weapons: ['sabres', 'bow', 'runeblade'],
    defaultWeapon: 'sabres',
    scale: 1.0,
    heightOffset: 0,
    lore: 'No map. No mercy.',
  },

  pirate_gunner: {
    id: 'pirate_gunner',
    displayName: 'Pirate Gunner',
    title: 'The Marksman',
    race: 'human',
    faction: Factions.CRUSADE,
    archetype: Archetypes.RANGER,
    // Pirates Set — weathered female gunner with bandolier
    modelPath: '/models/characters/pirate/gunner.glb',
    fallbackModel: '/models/human.glb',
    pack: 'pirates_set',
    weapons: ['bow', 'sabres', 'scythe'],
    defaultWeapon: 'bow',
    scale: 1.0,
    heightOffset: 0,
    lore: 'Every shot counts. She never wastes one.',
  },
};

// Use real D1 modular race models for all heroes in this mini-game.
const D1ModelByRace = {
  human: '/models/human.glb',
  barbarian: '/models/barbarian.glb',
  elf: '/models/elf.glb',
  dwarf: '/models/dwarf.glb',
  orc: '/models/orc.glb',
  undead: '/models/undead.glb',
};

for (const hero of Object.values(HeroRegistry)) {
  const d1Path = D1ModelByRace[hero.race];
  if (!d1Path) continue;
  hero.modelPath = d1Path;
  hero.fallbackModel = d1Path;
  hero.pack = 'd1_modular';
}

// ── Default hero per race (used when spawning player by race choice) ──────────
export const DefaultHeroForRace = {
  human:     'human_knight',
  barbarian: 'barbarian_berserker',
  elf:       'elf_archer',
  dwarf:     'dwarf_ironclad',
  orc:       'orc_warlord',
  undead:    'undead_deathknight',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Get a hero definition by id. Returns null if unknown. */
export function getHero(heroId) {
  return HeroRegistry[heroId] || null;
}

/** All heroes for a given race. */
export function getHeroesForRace(race) {
  return Object.values(HeroRegistry).filter(h => h.race === race);
}

/** All heroes for a given faction. */
export function getHeroesForFaction(faction) {
  return Object.values(HeroRegistry).filter(h => h.faction === faction);
}

/** All heroes with a given archetype. */
export function getHeroesWithArchetype(archetype) {
  return Object.values(HeroRegistry).filter(h => h.archetype === archetype);
}

/** Pick a random hero, optionally scoped to a faction. */
export function getRandomHero(faction = null) {
  const pool = faction ? getHeroesForFaction(faction) : Object.values(HeroRegistry);
  return pool[Math.floor(Math.random() * pool.length)] || null;
}
