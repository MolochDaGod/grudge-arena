/**
 * Ability → baked clip cast params (blend / extend / follow) — /world GameCharacter parity.
 */

import { bakedPathForState, skillBlendFor } from "./animCatalog.js";
import { resolveSkillAnim } from "./skillAnimMap.js";

const CASTER_CAST_EXTEND = 1.8;

const CASTER_EFFECTS = new Set([
  "fireball",
  "frost_nova",
  "meteor",
  "beam",
  "aoe_zone",
  "ground_zone",
  "double_cast",
  "aoe_shield",
]);

const EFFECT_TO_STATE = {
  fireball: "cast",
  dot_projectile: "attack2",
  lifesteal_projectile: "attack1",
  multi_projectile: "attack3",
  debuff_target: "attack2",
  frost_nova: "aoe",
  meteor: "cast2H",
  aoe_zone: "attack3",
  shield: "block",
  buff_damage: "powerUp",
  reset_cooldowns: "powerUp",
  dash: "jumpAttack",
  blink: "dodge",
  teleport_behind: "dodge",
  aoe_melee: "slash3",
  execute: "attack4",
  aoe_strike: "swing",
  stealth: "crouch",
  projectile_pull: "combo2",
  melee_lifesteal: "attack2",
  aoe_shield: "powerUp",
  beam: "cast",
  ground_zone: "swing",
  full_heal_invuln: "block",
  bear_form: "powerUp",
  reload: "reload",
  melee: "attack2",
  projectile: "attack1",
};

/**
 * @param {object} ability
 * @param {string} weaponType
 * @param {string} [slot] Q|E|R|F|P
 * @returns {{ stateName: string, rel: string|null, blend: number, extend: number, followRel: string|null }}
 */
export function resolveAbilityCast(ability, weaponType, slot) {
  const stateName =
    (slot && resolveSkillAnim(weaponType, slot, null)) ||
    ability?.skillAnim ||
    EFFECT_TO_STATE[ability?.effect] ||
    "attack1";

  const rel = bakedPathForState(stateName, weaponType);
  const castTime = ability?.castTime ?? 0;
  const extend =
    castTime > 0.5 || CASTER_EFFECTS.has(ability?.effect) || stateName === "cast2H"
      ? CASTER_CAST_EXTEND
      : 1;

  return {
    stateName,
    rel,
    blend: skillBlendFor(stateName),
    extend,
    followRel: null,
  };
}