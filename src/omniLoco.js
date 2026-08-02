/**
 * 8-way omnidirectional locomotion — CDN-safe subset of game-content omniLoco.ts.
 */

import {
  ANIM_PACK_CLIPS,
  BAKED_DIR_RELS,
  animPackForWeapon,
} from "./bakedAnimLoader.js";

/**
 * @typedef {'forward'|'forward-left'|'forward-right'|'backward'|'backward-left'|'backward-right'|'left'|'right'} OmniLocoDir
 * @typedef {'idle'|'walk'|'run'|'sprint'} LocoBand
 */

/** Classify character-local move vector into 8 sectors (+Z forward, +X right). */
export function classifyOmniDir(lx, lz) {
  if (Math.hypot(lx, lz) < 0.08) return "forward";
  const deg = (Math.atan2(lx, lz) * 180) / Math.PI;
  if (deg >= -22.5 && deg < 22.5) return "forward";
  if (deg >= 22.5 && deg < 67.5) return "forward-right";
  if (deg >= 67.5 && deg < 112.5) return "right";
  if (deg >= 112.5 && deg < 157.5) return "backward-right";
  if (deg >= 157.5 || deg < -157.5) return "backward";
  if (deg >= -157.5 && deg < -112.5) return "backward-left";
  if (deg >= -112.5 && deg < -67.5) return "left";
  return "forward-left";
}

function packBandRel(pack, band) {
  const clips = ANIM_PACK_CLIPS[pack] || ANIM_PACK_CLIPS.sword_shield;
  if (band === "sprint") return clips.run;
  if (band === "idle") return clips.idle;
  if (band === "walk") return clips.walk;
  return clips.run;
}

function dirRels(pack) {
  return BAKED_DIR_RELS[pack] || BAKED_DIR_RELS.unarmed;
}

/**
 * Resolve baked rel for pack + gait band + 8-way direction.
 * @param {string} weaponType
 * @param {LocoBand} band
 * @param {OmniLocoDir} dir
 */
export function resolveOmniLocoBaked(weaponType, band, dir) {
  const pack = animPackForWeapon(weaponType);
  const dirs = dirRels(pack);
  const fwd = packBandRel(pack, band);

  switch (dir) {
    case "backward":
      return band === "idle" ? packBandRel(pack, "idle") : dirs.runBack || dirs.walkBack || fwd;
    case "backward-left":
    case "backward-right":
      return band === "idle" ? packBandRel(pack, "idle") : dirs.runBack || dirs.walkBack || fwd;
    case "left":
      return band === "idle" ? packBandRel(pack, "idle") : dirs.strafeLeft || fwd;
    case "right":
      return band === "idle" ? packBandRel(pack, "idle") : dirs.strafeRight || fwd;
    case "forward-left":
      return band === "idle" ? packBandRel(pack, "idle") : dirs.strafeLeft || fwd;
    case "forward-right":
      return band === "idle" ? packBandRel(pack, "idle") : dirs.strafeRight || fwd;
    default:
      return fwd;
  }
}

export const LOCO_STATES = ["idle", "walk", "run", "sprint"];