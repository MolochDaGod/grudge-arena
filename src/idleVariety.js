/**
 * Alternate idle loops at rest — ported from game-content idleVariety.ts.
 * Uses CDN-verified baked paths (see tests/baked-anim-paths.test.js).
 */

import { animPackForWeapon } from "./bakedAnimLoader.js";

/** @type {Record<string, string[]>} */
const IDLE_ALT_BY_PACK = {
  unarmed: ["locomotion/idle", "magic/standing idle", "longbow/standing idle 03 examine"],
  magic: ["longbow/standing idle 03 examine", "locomotion/idle"],
  sword_shield: ["sword_shield/sword and shield idle", "longbow/standing idle 03 examine"],
  longbow: ["longbow/standing idle 03 examine", "locomotion/idle"],
  rifle: ["locomotion/idle", "rifle/idle"],
  pistol: ["locomotion/idle", "pistol/pistol idle"],
};

/**
 * @param {string} weaponType — arena weapon key
 * @param {string} [primaryIdleRel] — pack primary idle baked rel
 * @returns {string[]}
 */
export function idleVarietyBakedForWeapon(weaponType, primaryIdleRel) {
  const pack = animPackForWeapon(weaponType);
  const out = new Set();
  for (const rel of IDLE_ALT_BY_PACK[pack] ?? IDLE_ALT_BY_PACK.unarmed) {
    if (!primaryIdleRel || rel !== primaryIdleRel) out.add(rel);
  }
  return [...out];
}