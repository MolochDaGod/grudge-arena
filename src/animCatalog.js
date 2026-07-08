/**
 * Stable anim keys → baked Bip001 paths (subset of game-content ANIM_BY_KEY).
 * Used for weapon skills, attack combos, and on-demand clip loads.
 */

import { BAKED_COMBAT_EXTRAS, PACK_COMBAT_EXTRAS, animPackForWeapon } from "./bakedAnimLoader.js";
import { BOX_ANIM_GLOBAL, BOX_ANIM_BY_PACK } from "./boxAnimRegistry.js";

/** @type {Record<string, { baked: string, category?: string }>} */
export const ANIM_BY_KEY = {
  idle: { baked: "locomotion/idle", category: "locomotion" },
  walk: { baked: "locomotion/walking", category: "locomotion" },
  run: { baked: "locomotion/running", category: "locomotion" },
  magic_idle: { baked: "magic/standing idle", category: "locomotion" },
  magic_run: { baked: "magic/Standing Run Forward", category: "locomotion" },
  magic_cast: { baked: "magic/standing 1h cast spell 01", category: "combat" },
  magic_cast_2h: { baked: "magic/standing 2h cast spell 01", category: "combat" },
  bow_idle: { baked: "longbow/standing idle 01", category: "locomotion" },
  bow_run: { baked: "longbow/standing run forward", category: "locomotion" },
  bow_shot: { baked: "longbow/standing aim recoil", category: "combat" },
  rifle_idle_loco: { baked: "rifle/idle", category: "locomotion" },
  rifle_fire: { baked: "rifle/firing", category: "combat" },
  rifle_fire_2: { baked: "rifle/firing 2", category: "combat" },
  rifle_reload: { baked: "rifle/reloading", category: "combat" },
  rifle_melee: { baked: "rifle/punch", category: "combat" },
  pistol_gunplay: { baked: "pistol/gunplay", category: "combat" },
  sword_attack_a: { baked: "sword_shield/sword and shield slash", category: "combat_sword" },
  sword_attack_b: { baked: "sword_shield/sword and shield attack", category: "combat_sword" },
  sword_attack_c: { baked: "sword_shield/sword and shield attack (2)", category: "combat_sword" },
  sword_combo_finisher: { baked: "sword/one hand sword combo", category: "combat_sword" },
  sword_block: { baked: "sword_shield/sword and shield block", category: "combat_sword" },
  sword_dash_attack: { baked: "sword/great sword slide attack", category: "combat_sword" },
  shield_bash: { baked: "sword_shield/sword and shield attack (3)", category: "combat_shield" },
  dodge: { baked: "locomotion/dodging", category: "combat" },
  run_jump_attack: { baked: "uploads_2026_06/combat/melee run jump attack", category: "combat" },
  unarmed_punch: { baked: "unarmed/punching", category: "combat_unarmed" },
  unarmed_hook: { baked: "unarmed/hook_punch", category: "combat_unarmed" },
  throw_overhand: { baked: "action/throw object", category: "combat_throw" },
  unarmed_spin: { baked: "action/northern soul spin combo", category: "combat_unarmed" },
  crouch_idle: { baked: "uploads/action/Crouch_Idle", category: "locomotion" },
};

/** Arena FSM state name → stable anim key (world skillAnim / controller state). */
export const STATE_TO_ANIM_KEY = {
  attack1: "sword_attack_a",
  attack2: "sword_attack_b",
  attack3: "sword_attack_c",
  attack4: "sword_combo_finisher",
  attack: "sword_attack_a",
  combo1: "sword_attack_b",
  combo2: "sword_attack_c",
  combo3: "sword_combo_finisher",
  slash3: "sword_attack_c",
  swing: "sword_combo_finisher",
  cast: "magic_cast",
  cast2H: "magic_cast_2h",
  aoe: "magic_cast",
  aoe2: "magic_cast_2h",
  block: "sword_block",
  blockIdle: "sword_block",
  dodge: "dodge",
  jumpAttack: "run_jump_attack",
  powerUp: "magic_cast_2h",
  taunt: "magic_idle",
  crouch: "crouch_idle",
  fire: "rifle_fire",
  reload: "rifle_reload",
  hit: "dodge",
};

const SKILL_BLEND_BY_CATEGORY = {
  combat: 0.85,
  combat_sword: 0.82,
  combat_shield: 0.78,
  combat_unarmed: 0.88,
  locomotion: 0.7,
  traversal: 0.75,
};

export function bakedPathForKey(key) {
  return ANIM_BY_KEY[key]?.baked ?? null;
}

/** Resolve controller state name to a baked JSON rel path. */
export function bakedPathForState(stateName, weaponType = "greatsword") {
  if (!stateName) return null;
  const key = STATE_TO_ANIM_KEY[stateName] || stateName;
  const fromKey = bakedPathForKey(key);
  if (fromKey) return fromKey;

  if (BAKED_COMBAT_EXTRAS[stateName]) return BAKED_COMBAT_EXTRAS[stateName];
  const pack = animPackForWeapon(weaponType);
  if (PACK_COMBAT_EXTRAS[pack]?.[stateName]) return PACK_COMBAT_EXTRAS[pack][stateName];
  if (BOX_ANIM_GLOBAL[stateName]) return BOX_ANIM_GLOBAL[stateName];
  if (BOX_ANIM_BY_PACK[pack]?.[stateName]) return BOX_ANIM_BY_PACK[pack][stateName];
  return null;
}

export function skillBlendFor(stateName, animKey) {
  const key = animKey || STATE_TO_ANIM_KEY[stateName] || stateName;
  const cat = ANIM_BY_KEY[key]?.category;
  if (cat && SKILL_BLEND_BY_CATEGORY[cat] != null) return SKILL_BLEND_BY_CATEGORY[cat];
  if (/cast|aoe|magic/i.test(stateName || "")) return 0.62;
  if (/block/i.test(stateName || "")) return 0.55;
  return 0.85;
}