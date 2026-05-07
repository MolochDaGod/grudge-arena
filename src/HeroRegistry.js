/**
 * HERO REGISTRY — 6 D1 modular race heroes.
 *
 * Primary model source is Cloudflare assets via Vercel rewrite:
 *   /api/assets/* -> https://assets.grudge-studio.com/*
 *
 * Each hero keeps a local fallback modelPath for offline/dev resilience.
 */
/**
 * Models are served from /public/assets/characters/{race}/{PREFIX}_Characters.glb
 * which are pre-scaled to realistic humanoid height (~1.75 m) by
 * scripts/build-character-library.mjs.
 *
 * Scale factors shown below are the actual correction factors applied by the
 * build script (Synty Polygon RTS exports in cm-scale, needing ×4–5).
 * At runtime Three.js sees meshes already in metres — no additional scale needed
 * (scale = 1.0 for all races after the GLB rewrite).
 *
 * Character manifest: /public/models/characterManifest.json
 */

import { Factions } from './engine/RaceConfig.js';
import { charUrl } from "./assetConfig.js";

// ── Archetypes ──────────────────────────────────────────────────────────────
// Drives AI decision-making, preferred engagement range, and ability usage.
export const Archetypes = {
  WARRIOR: "warrior", // heavy melee, sustain fighter
  RANGER: "ranger", // ranged primary, mobile
  MAGE: "mage", // caster, glass cannon
  ROGUE: "rogue", // melee burst, gap-closing
  HYBRID: "hybrid", // melee + casting mix
};

// ── Hero Definitions ─────────────────────────────────────────────────────────

// Legacy fallback base (kept for reference)
const CLOUDFLARE_MODEL_BASE = "/api/assets/models/characters";

export const HeroRegistry = {
  // ── CRUSADE ────────────────────────────────────────────────────────────────

  human: {
    id: "human",
    displayName: "Human",
    title: "The Ironwall",
    race: "human",
    faction: Factions.CRUSADE,
    archetype: Archetypes.WARRIOR,
    modelPath: charUrl("human/WK_Characters.glb"),
    fallbackModel: `${CLOUDFLARE_MODEL_BASE}/human.glb`,
    equipmentBase: charUrl("human/equipment/"),
    pack: "d1_modular",
    equipPrefix: "WK_",
    weapons: ["greatsword", "sabres", "runeblade", "bow", "scythe"],
    defaultWeapon: "greatsword",
    scale: 1.0, // GLB already normalised to 1.75 m by build script
    heightOffset: 0,
    lore: "A veteran of a hundred crusades. His shield has never broken.",
  },

  barbarian: {
    id: "barbarian",
    displayName: "Barbarian",
    title: "The Immortal",
    race: "barbarian",
    faction: Factions.CRUSADE,
    archetype: Archetypes.WARRIOR,
    modelPath: charUrl("barbarian/BRB_Characters.glb"),
    fallbackModel: `${CLOUDFLARE_MODEL_BASE}/barbarian.glb`,
    equipmentBase: charUrl("barbarian/equipment/"),
    pack: "d1_modular",
    equipPrefix: "BRB_",
    weapons: ["greatsword", "scythe", "sabres", "bow"],
    defaultWeapon: "greatsword",
    scale: 1.0,
    heightOffset: 0,
    lore: "Rage is his armor. Death is his offering.",
  },

  elf: {
    id: "elf",
    displayName: "Elf",
    title: "The Assassin",
    race: "elf",
    faction: Factions.FABLED,
    archetype: Archetypes.RANGER,
    modelPath: charUrl("elf/ELF_Characters.glb"),
    fallbackModel: `${CLOUDFLARE_MODEL_BASE}/elf.glb`,
    equipmentBase: charUrl("elf/equipment/"),
    pack: "d1_modular",
    equipPrefix: "ELF_",
    weapons: ["bow", "sabres", "runeblade", "scythe"],
    defaultWeapon: "bow",
    scale: 1.0,
    heightOffset: 0,
    lore: "Shadows are her home. Silence is her weapon.",
  },

  // ── FABLED ─────────────────────────────────────────────────────────────────

  dwarf: {
    id: "dwarf",
    displayName: "Dwarf",
    title: "The Wall",
    race: "dwarf",
    faction: Factions.FABLED,
    archetype: Archetypes.WARRIOR,
    modelPath: charUrl("dwarf/DWF_Characters.glb"),
    fallbackModel: `${CLOUDFLARE_MODEL_BASE}/dwarf.glb`,
    equipmentBase: charUrl("dwarf/equipment/"),
    pack: "d1_modular",
    equipPrefix: "DWF_",
    weapons: ["greatsword", "runeblade", "sabres", "scythe"],
    defaultWeapon: "greatsword",
    scale: 1.0, // Dwarves scaled to 1.75 m — use heightOffset to shorten visually
    heightOffset: -0.15, // Render slightly lower than human eye-line
    lore: "Built like stone. Hits like a mountain.",
  },

  // ── LEGION ─────────────────────────────────────────────────────────────────

  orc: {
    id: "orc",
    displayName: "Orc",
    title: "The Crusher",
    race: "orc",
    faction: Factions.LEGION,
    archetype: Archetypes.WARRIOR,
    modelPath: charUrl("orc/ORC_Characters.glb"),
    fallbackModel: `${CLOUDFLARE_MODEL_BASE}/orc.glb`,
    equipmentBase: charUrl("orc/equipment/"),
    pack: "d1_modular",
    equipPrefix: "ORC_",
    weapons: ["greatsword", "scythe", "sabres", "bow"],
    defaultWeapon: "greatsword",
    scale: 1.0,
    heightOffset: 0,
    lore: "His army follows. Everything else burns.",
  },

  undead: {
    id: "undead",
    displayName: "Undead",
    title: "The Weaver of Souls",
    race: "undead",
    faction: Factions.LEGION,
    archetype: Archetypes.MAGE,
    modelPath: charUrl("undead/UD_Characters.glb"),
    fallbackModel: `${CLOUDFLARE_MODEL_BASE}/undead.glb`,
    equipmentBase: charUrl("undead/equipment/"),
    pack: "d1_modular",
    equipPrefix: "UD_",
    weapons: ["scythe", "runeblade", "bow", "greatsword"],
    defaultWeapon: "scythe",
    scale: 1.0,
    heightOffset: 0,
    lore: "Death is merely the beginning of service.",
  },
};

// ── Default hero per race (used when spawning player by race choice) ──────────
export const DefaultHeroForRace = {
  human:     'human',
  barbarian: 'barbarian',
  elf:       'elf',
  dwarf:     'dwarf',
  orc:       'orc',
  undead:    'undead',
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

