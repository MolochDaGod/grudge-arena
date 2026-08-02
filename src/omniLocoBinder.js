/**
 * Async omni band binding — mirrors GameCharacter.bindOmniBands.
 */

import { loadBakedClip } from "./bakedAnimLoader.js";
import { LOCO_STATES, resolveOmniLocoBaked } from "./omniLoco.js";

/**
 * @param {import('./AnimationDirector.js').AnimationDirector} director
 * @param {string} weaponType
 * @param {import('./omniLoco.js').OmniLocoDir} dir
 * @param {Record<string, string>} omniKeys — mutable key cache per band
 * @param {Map<string, import('three').AnimationClip>} clipCache
 * @param {import('three').Object3D} [scene]
 */
export function bindOmniBands(director, weaponType, dir, omniKeys, clipCache, scene = null) {
  for (const st of LOCO_STATES) {
    const rel = resolveOmniLocoBaked(weaponType, st, dir);
    if (rel === omniKeys[st]) continue;
    omniKeys[st] = rel;
    const cached = clipCache.get(rel);
    if (cached) {
      director.setOmniBandClip(st, rel, cached);
      continue;
    }
    loadBakedClip(rel, scene)
      .then((clip) => {
        clipCache.set(rel, clip);
        if (omniKeys[st] === rel) {
          director.setOmniBandClip(st, rel, clip);
        }
      })
      .catch((err) => console.warn("[omniLoco] clip load failed:", rel, err.message));
  }
}