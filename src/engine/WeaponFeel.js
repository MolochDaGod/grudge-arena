/**
 * Per-weapon combat feel — motion speed, VFX palette, SFX routing, combo pacing.
 * Mirrors dangerroom.puter.site motion readout + distinct weapon identity.
 */

import { WeaponTypes } from "./WeaponDefinitions.js";

/** @typedef {import('./WeaponDefinitions.js').WeaponTypes} WeaponTypeKey */

export const WEAPON_FEEL = {
  [WeaponTypes.GREATSWORD]: {
    title: "IMMORTAL",
    accent: "#ff8844",
    attackAnimSpeed: 0.82,
    skillAnimSpeed: 0.9,
    comboWindowMs: 1400,
    melee: {
      particleColor: 0xffaa44,
      particleCount: 18,
      particleSpread: 0.55,
      particleSize: 0.14,
      trailWidth: 2.2,
    },
    ranged: null,
    motion: { idle: "GUARD", walk: "MARCH", sprint: "CHARGE", attack: "CLEAVE", skill: "SLAM" },
    resourcePulse: "rage",
  },
  [WeaponTypes.BOW]: {
    title: "VIPER",
    accent: "#7fd46a",
    attackAnimSpeed: 1.05,
    skillAnimSpeed: 1.1,
    comboWindowMs: 900,
    drawBeforeShot: true,
    drawAnim: "draw",
    drawLeadMs: 220,
    melee: null,
    ranged: {
      particleColor: 0x8b6914,
      projectileColor: 0xc4a35a,
      projectileSpeed: 32,
      spreadDeg: 1.5,
    },
    motion: { idle: "AIM", walk: "STALK", sprint: "SKIRMISH", attack: "DRAW", skill: "VOLLEY" },
    resourcePulse: "energy",
  },
  [WeaponTypes.SABRES]: {
    title: "ASSASSIN",
    accent: "#c084fc",
    attackAnimSpeed: 1.45,
    skillAnimSpeed: 1.35,
    comboWindowMs: 1100,
    dualSlash: true,
    melee: {
      particleColor: 0xe0b0ff,
      particleCount: 12,
      particleSpread: 0.35,
      particleSize: 0.08,
      trailWidth: 1.2,
    },
    ranged: null,
    motion: { idle: "READY", walk: "PROWL", sprint: "RUSH", attack: "FLURRY", skill: "BURST" },
    resourcePulse: "energy",
  },
  [WeaponTypes.SCYTHE]: {
    title: "WEAVER",
    accent: "#38bdf8",
    attackAnimSpeed: 1.0,
    skillAnimSpeed: 0.95,
    comboWindowMs: 1200,
    melee: {
      particleColor: 0x66ccff,
      particleCount: 16,
      particleSpread: 0.7,
      particleSize: 0.12,
      trailWidth: 1.8,
    },
    ranged: {
      particleColor: 0xff6622,
      projectileColor: 0xff4400,
      projectileSpeed: 18,
      shader: "fireball",
    },
    motion: { idle: "WEAVE", walk: "DRIFT", sprint: "SURGE", attack: "SCYTHE", skill: "CAST" },
    resourcePulse: "mana",
  },
  [WeaponTypes.RUNEBLADE]: {
    title: "TEMPLAR",
    accent: "#fbbf24",
    attackAnimSpeed: 1.05,
    skillAnimSpeed: 1.0,
    comboWindowMs: 1300,
    melee: {
      particleColor: 0xffe08a,
      particleCount: 14,
      particleSpread: 0.45,
      particleSize: 0.11,
      trailWidth: 1.6,
    },
    ranged: null,
    motion: { idle: "WARD", walk: "ADVANCE", sprint: "JUDGE", attack: "SMITE", skill: "HOLY" },
    resourcePulse: "mana",
  },
  [WeaponTypes.STAFF]: {
    title: "ARCANIST",
    accent: "#818cf8",
    attackAnimSpeed: 0.95,
    skillAnimSpeed: 0.88,
    comboWindowMs: 1000,
    melee: null,
    ranged: {
      particleColor: 0x8899ff,
      projectileColor: 0x6688ff,
      projectileSpeed: 22,
      shader: "fireball",
    },
    motion: { idle: "CHANNEL", walk: "FLOAT", sprint: "ARC", attack: "BOLT", skill: "RITUAL" },
    resourcePulse: "mana",
  },
  [WeaponTypes.MACE]: {
    title: "WORGE",
    accent: "#f87171",
    attackAnimSpeed: 0.88,
    skillAnimSpeed: 0.92,
    comboWindowMs: 1500,
    melee: {
      particleColor: 0xff6644,
      particleCount: 20,
      particleSpread: 0.6,
      particleSize: 0.15,
      trailWidth: 2.4,
    },
    ranged: null,
    motion: { idle: "BRACE", walk: "STOMP", sprint: "MAUL", attack: "CRUSH", skill: "ROAR" },
    resourcePulse: "rage",
  },
};

const DEFAULT_FEEL = WEAPON_FEEL[WeaponTypes.GREATSWORD];

export function getWeaponFeel(weaponType) {
  return WEAPON_FEEL[weaponType] || DEFAULT_FEEL;
}

/** Skill slot index → SFX pool index for bow/staff etc. */
export function skillSfxIndex(slotKey) {
  const map = { Q: 0, E: 1, R: 2, F: 3, P: 4 };
  return map[slotKey] ?? 0;
}

/** Motion label for HUD (danger room MM panel + arena). */
export function resolveMotionLabel(feel, ctx) {
  if (!feel) return "IDLE";
  if (ctx.skillName) return String(ctx.skillName).toUpperCase().slice(0, 18);
  if (ctx.reloading) return "RELOAD";
  if (ctx.aiming && !ctx.moving) return feel.motion.attack === "DRAW" ? "ADS" : "AIM";
  if (ctx.casting) return feel.motion.skill;
  if (ctx.dashing) return "ROLL";
  if (ctx.blocking) return "BLOCK";
  if (ctx.attacking) return feel.motion.attack;
  if (ctx.sprinting) return feel.motion.sprint;
  if (ctx.moving) return feel.motion.walk;
  return feel.motion.idle;
}