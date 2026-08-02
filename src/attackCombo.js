/**
 * Weapon attack combo chains — Mixamo/Bip001 baked library only (no Marvel/Venom packs).
 */

import { ANIM_BY_KEY, bakedPathForKey } from "./animCatalog.js";
import { animPackForWeapon } from "./bakedAnimLoader.js";

/** 4-click light attack — one slash per click; click 4 = attack4 / one hand sword combo. */
export const ONE_HAND_MELEE_COMBO = [
  "sword_attack_a",
  "sword_attack_b",
  "sword_attack_c",
  "sword_combo_finisher",
];

const ATTACK_COMBO_KEYS = {
  sword_shield: ONE_HAND_MELEE_COMBO,
  longbow: ["bow_shot", "throw_overhand", "bow_shot", "sword_attack_b"],
  magic: ["magic_cast", "magic_cast_2h", "run_jump_attack", "unarmed_spin"],
  rifle: ["rifle_fire", "rifle_fire_2", "rifle_reload", "rifle_melee"],
  pistol: ["rifle_fire", "pistol_gunplay", "rifle_reload", "rifle_melee"],
  unarmed: ["unarmed_punch", "unarmed_hook", "unarmed_spin", "run_jump_attack"],
};

const WEAPON_TO_COMBO = {
  greatsword: ["sword_attack_c", "sword_combo_finisher", "sword_dash_attack", "run_jump_attack"],
  scythe: ["sword_attack_c", "sword_combo_finisher", "sword_dash_attack", "run_jump_attack"],
  sabres: ONE_HAND_MELEE_COMBO,
  runeblade: ONE_HAND_MELEE_COMBO,
  mace: ONE_HAND_MELEE_COMBO,
  staff: ["magic_cast", "magic_cast_2h", "run_jump_attack", "unarmed_spin"],
  wand: ["magic_cast", "magic_cast_2h", "unarmed_spin", "run_jump_attack"],
  bow: ["bow_shot", "throw_overhand", "bow_shot", "sword_attack_b"],
  rifle: ["rifle_fire", "rifle_fire_2", "rifle_reload", "rifle_melee"],
};

function keysToBakedPaths(keys) {
  if (!keys?.length) return [];
  const out = [];
  for (const k of keys) {
    const baked = bakedPathForKey(k) || ANIM_BY_KEY[k]?.baked;
    if (baked) out.push(baked);
  }
  return out;
}

/** Baked rel paths for light-attack combo cycle. */
export function attackComboForWeapon(weaponType) {
  const keys = WEAPON_TO_COMBO[weaponType] || ATTACK_COMBO_KEYS[animPackForWeapon(weaponType)];
  return keysToBakedPaths(keys);
}

const KEY_TO_STATE = {
  sword_attack_a: "attack1",
  sword_attack_b: "attack2",
  sword_attack_c: "attack3",
  sword_combo_finisher: "attack4",
  sword_dash_attack: "dashAttack",
  shield_bash: "attack3",
  magic_cast: "cast",
  magic_cast_2h: "cast2H",
  bow_shot: "attack1",
  rifle_fire: "fire",
  unarmed_punch: "attack1",
  unarmed_hook: "attack2",
  unarmed_spin: "combo2",
  run_jump_attack: "jumpAttack",
  throw_overhand: "combo1",
};

/** Registry state names for legacy playOnce fallback. */
export function attackComboStateNames(weaponType) {
  const keys = WEAPON_TO_COMBO[weaponType] || ATTACK_COMBO_KEYS[animPackForWeapon(weaponType)] || [];
  return keys.map((k) => KEY_TO_STATE[k] || "attack1");
}