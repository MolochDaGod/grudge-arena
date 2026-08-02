/**
 * Baked Bip001 animation loader — mirrors lib/character-kit/src/anims.ts.
 * Rotation-only JSON clips under /api/assets/anims/baked/{rel}.json
 */

import * as THREE from 'three';
import { bakedAnimUrl, bakedAnimUrlCandidates } from './assetConfig.js';
import { applyBoxAnimOverrides } from './boxAnimRegistry.js';
import {
  normalizeBakedBip001Clip,
  getTrackBindingStats,
} from './mixamoRetarget.js';
import {
  validateClipBinding,
  MIN_CLIP_BIND_RATIO,
} from './skeletonContract.js';
import { getAnimationRoot } from './characterScale.js';
import {
  sanitizeClipInPlace,
  ensureLocoClips,
  createCharacterMixer,
} from './engine/AnimClipSanitize.js';

export { sanitizeClipInPlace, ensureLocoClips, createCharacterMixer };

/** @typedef {'magic'|'sword_shield'|'longbow'|'rifle'|'pistol'|'unarmed'} AnimPack */

/** Paths relative to /anims/baked/ (no .json extension). */
export const ANIM_PACK_CLIPS = {
  unarmed: {
    idle: 'unarmed/fight_idle',
    walk: 'locomotion/walking',
    run: 'uploads_2026_06/locomotion/torch run forward',
    attack: 'unarmed/punching',
  },
  magic: {
    idle: 'magic/standing idle',
    walk: 'locomotion/walking',
    run: 'magic/Standing Run Forward',
    attack: 'magic/standing 1h cast spell 01',
  },
  sword_shield: {
    idle: 'sword_shield/sword and shield idle',
    walk: 'locomotion/walking',
    run: 'sword_shield/sword and shield run',
    attack: 'sword_shield/sword and shield attack',
  },
  longbow: {
    idle: 'longbow/standing idle 01',
    walk: 'locomotion/walking',
    run: 'longbow/standing run forward',
    attack: 'longbow/standing aim recoil',
  },
  rifle: {
    idle: 'rifle/idle',
    walk: 'rifle/walk forward',
    run: 'rifle/run forward',
    attack: 'rifle/firing',
  },
  pistol: {
    idle: 'pistol/pistol idle',
    walk: 'pistol/pistol walk',
    run: 'pistol/pistol run',
    attack: 'pistol/gunplay',
  },
};

/**
 * Legacy sprint upload — baked ~180° opposite forward run clips (moonwalk at full sprint).
 * Runtime clones the pack `run` clip for sprint instead; kept for CDN/catalog parity.
 */
export const SPRINT_CLIP = 'uploads_2026_06/locomotion/running';

/** Sprint band playback vs run (matches /world GameCharacter SPRINT_MULT). */
export const SPRINT_LOCO_MULT = 1.75;

/** Arena weapon type → baked anim pack. */
export const WeaponToBakedPack = {
  greatsword: 'sword_shield',
  scythe: 'sword_shield',
  sabres: 'sword_shield',
  runeblade: 'sword_shield',
  mace: 'sword_shield',
  staff: 'magic',
  wand: 'magic',
  bow: 'longbow',
  rifle: 'rifle',
  unarmed: 'unarmed',
};

/**
 * Directional locomotion rel paths per baked pack (4-way cardinal).
 * Every path must exist on CDN — see character-viewer/public/anims/baked and
 * lib/game-content/src/animDefaults.ts (forward-only packs use locomotion fallbacks).
 */
export const BAKED_DIR_RELS = {
  unarmed: {
    walkBack: 'longbow/standing aim walk back',
    runBack: 'longbow/standing aim walk back',
    strafeLeft: 'locomotion/left strafe walking',
    strafeRight: 'locomotion/right strafe walking',
  },
  magic: {
    walkBack: 'longbow/standing aim walk back',
    runBack: 'longbow/standing aim walk back',
    strafeLeft: 'locomotion/left strafe walking',
    strafeRight: 'locomotion/right strafe walking',
  },
  sword_shield: {
    walkBack: 'longbow/standing aim walk back',
    runBack: 'longbow/standing aim walk back',
    strafeLeft: 'locomotion/left strafe walking',
    strafeRight: 'locomotion/right strafe walking',
  },
  longbow: {
    walkBack: 'longbow/standing aim walk back',
    runBack: 'longbow/standing aim walk back',
    strafeLeft: 'longbow/standing aim walk left',
    strafeRight: 'longbow/standing aim walk right',
  },
  rifle: {
    walkBack: 'rifle/walk backward',
    runBack: 'rifle/run backward',
    strafeLeft: 'rifle/walk forward',
    strafeRight: 'rifle/walk forward',
  },
  pistol: {
    walkBack: 'pistol/pistol walk backward',
    runBack: 'pistol/pistol run backward',
    strafeLeft: 'pistol/pistol strafe',
    strafeRight: 'pistol/pistol strafe',
  },
};

/** Pack-specific combat overlays (fire / reload / aim). */
export const PACK_COMBAT_EXTRAS = {
  unarmed: {
    fire: 'unarmed/punching',
    reload: 'unarmed/fight_idle',
    aimIdle: 'unarmed/fight_idle',
  },
  magic: {
    fire: 'magic/standing 1h cast spell 01',
    reload: 'magic/standing idle',
    aimIdle: 'magic/standing idle',
  },
  sword_shield: {
    fire: 'sword_shield/sword and shield attack',
    reload: 'sword_shield/sword and shield idle',
    aimIdle: 'sword_shield/sword and shield idle',
  },
  longbow: {
    fire: 'longbow/standing aim recoil',
    reload: 'longbow/standing idle 01',
    aimIdle: 'longbow/standing idle 01',
    draw: 'longbow/standing idle 01',
  },
  rifle: {
    fire: 'rifle/firing',
    fire2: 'rifle/firing 2',
    reload: 'rifle/reloading',
    aimIdle: 'rifle/idle',
  },
  pistol: {
    fire: 'pistol/gunplay',
    reload: 'pistol/pistol idle',
    aimIdle: 'pistol/pistol idle',
  },
};

/** Extra combat clips keyed by FSM / arena state name. */
export const BAKED_COMBAT_EXTRAS = {
  attack2: 'sword_shield/sword and shield slash',
  attack3: 'sword_shield/sword and shield attack (2)',
  attack4: 'boxanimations/sword_shield/One Hand Sword Combo',
  combo1: 'sword_shield/sword and shield attack',
  combo2: 'sword_shield/sword and shield slash',
  combo3: 'sword_shield/sword and shield attack (2)',
  slash3: 'sword_shield/sword and shield attack (2)',
  swing: 'sword_shield/sword and shield attack',
  block: 'sword_shield/sword and shield block',
  aoe: 'magic/standing 1h cast spell 01',
  aoe2: 'magic/standing 2h cast spell 01',
  powerUp: 'magic/standing 2h cast spell 01',
  crouch: 'uploads/action/Crouch_Idle',
  hit: 'uploads/action/Aerial_Evade',
  cast: 'magic/standing 1h cast spell 01',
  cast2H: 'magic/standing 2h cast spell 01',
  dodge: 'locomotion/dodging',
  jump: 'locomotion/jump',
  jumpLand: 'uploads/locomotion/hard_landing',
  landHard: 'uploads/locomotion/hard_landing',
  descendSlope: 'uploads_2026_06/locomotion/descending stairs',
  runSlide: 'uploads/locomotion/trip_Running_Slide',
  slide: 'uploads/locomotion/trip_Running_Slide',
  roll: 'uploads/locomotion/Quick_Roll_To_Run',
  turnLeft: 'locomotion/left turn 90',
  turnRight: 'locomotion/right turn 90',
  blockIdle: 'sword_shield/sword and shield block',
  aimIdle: 'longbow/standing idle 01',
  taunt: 'unarmed/fight_idle',
};

/** Neutral NPC overlay loop (island sandbox foragers). */
export const BAKED_IDLE_EXAMINE_REL = 'longbow/standing idle 03 examine';

const clipCache = new Map();

/** Core locomotion clips required for baked pipeline. */
export const REQUIRED_BAKED_LOCO = ["idle", "walk", "run", "sprint"];

export class BakedAnimLoadError extends Error {
  constructor(message, { weaponType, packName, missing = [] } = {}) {
    super(message);
    this.name = "BakedAnimLoadError";
    this.code = "BAKED_ANIM_INCOMPLETE";
    this.weaponType = weaponType;
    this.packName = packName;
    this.missing = missing;
  }
}

const LOCO_CARDINAL = {
  forward: { idle: "idle", walk: "walk", run: "run", sprint: "sprint" },
  backward: { idle: "idle", walk: "walkBack", run: "runBack", sprint: "runBack" },
  left: { idle: "idle", walk: "strafeLeft", run: "strafeLeft", sprint: "strafeLeft" },
  right: { idle: "idle", walk: "strafeRight", run: "strafeRight", sprint: "strafeRight" },
};

/** Map gait band + direction + weapon to a loaded clip registry key. */
export function resolveBakedLocoClipKey(band, dir, weaponType) {
  const pack = WeaponToBakedPack[weaponType] || "sword_shield";
  const cardinal =
    dir === "back" ? "backward" : dir === "forward" || dir === "backward" || dir === "left" || dir === "right"
      ? dir
      : dir?.startsWith("backward") ? "backward"
      : dir?.startsWith("forward") ? "forward"
      : dir === "left" || dir === "right" ? dir
      : "forward";
  const map = LOCO_CARDINAL[cardinal] || LOCO_CARDINAL.forward;
  if (band === "sprint") return map.sprint || map.run;
  return map[band] || map.idle || "idle";
}

export function animPackForWeapon(weaponType) {
  return WeaponToBakedPack[weaponType] || "sword_shield";
}

export function validateBakedLocoClips(clips, weaponType, packName) {
  const missing = REQUIRED_BAKED_LOCO.filter((name) => !clips.get(name));
  if (missing.length === 0) return;
  throw new BakedAnimLoadError(
    `Baked locomotion incomplete for ${weaponType} (${packName}): missing ${missing.join(", ")}`,
    { weaponType, packName, missing },
  );
}

export function bakedClipUrl(rel) {
  return bakedAnimUrl(rel);
}

export function toRotationOnlyClip(clip) {
  return sanitizeClipInPlace(clip);
}

function sceneCacheTag(scene) {
  if (!scene) return "";
  const root = getAnimationRoot(scene);
  return root?.uuid ? `::${root.uuid}` : "::scene";
}

export async function loadBakedClip(rel, scene = null) {
  const cacheKey = `${rel}${sceneCacheTag(scene)}`;
  const cached = clipCache.get(cacheKey);
  if (cached) return cached.clone();

  const candidates = bakedAnimUrlCandidates(rel);
  let lastErr = null;
  let json = null;
  let usedUrl = candidates[0];
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        lastErr = new Error(`[bakedAnim] ${url} HTTP ${res.status}`);
        continue;
      }
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("text/html")) {
        lastErr = new Error(`[bakedAnim] ${url} returned HTML (SPA miss)`);
        continue;
      }
      json = await res.json();
      usedUrl = url;
      break;
    } catch (err) {
      lastErr = err;
    }
  }
  if (!json) {
    throw lastErr || new Error(`[bakedAnim] ${rel} failed all mirrors`);
  }
  if (usedUrl !== candidates[0]) {
    console.warn(`[bakedAnim] ${rel} via mirror ${usedUrl}`);
  }
  let clip = THREE.AnimationClip.parse(json);
  // Scene-aware remap + rotation-only (strip XZ root motion & Y float on bones)
  clip = normalizeBakedBip001Clip(clip, scene);
  sanitizeClipInPlace(clip);
  if (!clip.tracks.length) {
    throw new Error(
      `[bakedAnim] ${rel}: 0 tracks after Bip001 normalize — skeleton mismatch (scene bones?)`,
    );
  }
  clipCache.set(cacheKey, clip);
  return clip.clone();
}

/** Load locomotion + combat clips for a weapon type. */
export async function loadBakedPackClips(weaponType, scene = null) {
  const packName = WeaponToBakedPack[weaponType] || 'sword_shield';
  const pack = ANIM_PACK_CLIPS[packName];
  const rels = new Map([
    ['idle', pack.idle],
    ['walk', pack.walk],
    ['run', pack.run],
    ['attack1', pack.attack],
    ['attack', pack.attack],
  ]);

  for (const [state, rel] of Object.entries(BAKED_COMBAT_EXTRAS)) {
    if (!rels.has(state)) rels.set(state, rel);
  }

  const packExtras = PACK_COMBAT_EXTRAS[packName] || {};
  for (const [state, rel] of Object.entries(packExtras)) {
    if (!rels.has(state)) rels.set(state, rel);
  }

  const dirRels = BAKED_DIR_RELS[packName] || BAKED_DIR_RELS.unarmed;
  for (const [state, rel] of Object.entries(dirRels)) {
    if (!rels.has(state)) rels.set(state, rel);
  }

  applyBoxAnimOverrides(rels, packName);

  const entries = await Promise.all(
    [...rels.entries()].map(async ([name, rel]) => {
      try {
        const clip = await loadBakedClip(rel, scene);
        clip.name = name;
        return [name, clip];
      } catch (err) {
        console.warn(`[bakedAnim] skip ${name} (${rel}):`, err.message);
        return null;
      }
    }),
  );

  const clips = new Map();
  const clipSources = new Map();
  const skipped = [];
  for (const [name, rel] of rels) {
    clipSources.set(name, rel);
  }
  for (const entry of entries) {
    if (entry) clips.set(entry[0], entry[1]);
  }

  if (scene) {
    const idle = clips.get("idle");
    if (idle) {
      const bind = validateClipBinding(idle, scene);
      if (!bind.ok) {
        throw new BakedAnimLoadError(
          `[bakedAnim] ${packName}: idle bind ${bind.bound}/${bind.total} (${Math.round(bind.ratio * 100)}%, need ≥${Math.round(MIN_CLIP_BIND_RATIO * 100)}%) — check Bip001 bone names`,
          { weaponType, packName, missing: ["idle-bind"] },
        );
      }
    }
  }

  // Universal locomotion fallbacks if pack-specific files 404
  const LOCO_FALLBACKS = {
    idle: ["locomotion/idle", "locomotion/walking", "unarmed/fight_idle"],
    walk: ["locomotion/walking", "locomotion/idle"],
    run: ["locomotion/running", "locomotion/walking", "locomotion/idle"],
  };
  for (const [name, fallbackRels] of Object.entries(LOCO_FALLBACKS)) {
    if (clips.has(name)) continue;
    for (const rel of fallbackRels) {
      try {
        const clip = await loadBakedClip(rel, scene);
        clip.name = name;
        clips.set(name, clip);
        clipSources.set(name, rel);
        console.warn(`[bakedAnim] ${packName}: ${name} ← fallback ${rel}`);
        break;
      } catch {
        /* try next */
      }
    }
  }
  // Clone chain if still missing (idle → walk → run)
  if (!clips.has("walk") && clips.has("idle")) {
    const c = clips.get("idle").clone();
    c.name = "walk";
    clips.set("walk", c);
  }
  if (!clips.has("run") && clips.has("walk")) {
    const c = clips.get("walk").clone();
    c.name = "run";
    clips.set("run", c);
  }
  if (!clips.has("idle") && clips.has("walk")) {
    const c = clips.get("walk").clone();
    c.name = "idle";
    clips.set("idle", c);
  }

  // Sprint = run clone sped up (SPRINT_CLIP faces backward — see /world GameCharacter).
  const runClip = clips.get("run");
  if (runClip && !clips.has("sprint")) {
    const sprintClip = runClip.clone();
    sprintClip.name = "sprint";
    clips.set("sprint", sprintClip);
  }

  for (const name of REQUIRED_BAKED_LOCO) {
    if (!clips.has(name)) skipped.push(name);
  }
  if (skipped.length) {
    console.warn(
      `[bakedAnim] ${packName}: missing core clips [${skipped.join(", ")}] — check /anims/baked/`,
    );
  }
  return { packName, clips, clipSources, skipped };
}