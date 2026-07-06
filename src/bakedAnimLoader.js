/**
 * Baked Bip001 animation loader — mirrors lib/character-kit/src/anims.ts.
 * Rotation-only JSON clips under /api/assets/anims/baked/{rel}.json
 */

import * as THREE from 'three';
import { grudge6AssetUrl } from './assetConfig.js';

/** @typedef {'magic'|'sword_shield'|'longbow'|'rifle'|'pistol'|'unarmed'} AnimPack */

/** Paths relative to /anims/baked/ (no .json extension). */
export const ANIM_PACK_CLIPS = {
  unarmed: {
    idle: 'unarmed/fight_idle',
    walk: 'locomotion/walking',
    run: 'locomotion/running',
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

/** Pack-agnostic sprint locomotion (rotation-only, all races). */
export const SPRINT_CLIP = 'uploads_2026_06/locomotion/running';

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

/** Directional locomotion rel paths per baked pack (4-way cardinal). */
export const BAKED_DIR_RELS = {
  unarmed: {
    walkBack: 'locomotion/walking',
    runBack: 'locomotion/running',
    strafeLeft: 'locomotion/walking',
    strafeRight: 'locomotion/walking',
  },
  magic: {
    walkBack: 'magic/standing walk back',
    runBack: 'magic/standing run back',
    strafeLeft: 'magic/standing walk left',
    strafeRight: 'magic/standing walk right',
  },
  sword_shield: {
    walkBack: 'sword_shield/sword and shield walk',
    runBack: 'sword_shield/sword and shield run',
    strafeLeft: 'sword_shield/sword and shield strafe',
    strafeRight: 'sword_shield/sword and shield strafe (2)',
  },
  longbow: {
    walkBack: 'longbow/standing walk back',
    runBack: 'longbow/standing run back',
    strafeLeft: 'longbow/standing walk left',
    strafeRight: 'longbow/standing walk right',
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
    strafeRight: 'pistol/pistol strafe 2',
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
    aimIdle: 'sword_shield/sword and shield block idle',
  },
  longbow: {
    fire: 'longbow/standing aim recoil',
    reload: 'longbow/standing aim idle',
    aimIdle: 'longbow/standing aim idle',
    draw: 'longbow/standing aim idle 02',
  },
  rifle: {
    fire: 'rifle/firing',
    fire2: 'rifle/firing 2',
    reload: 'rifle/reloading',
    aimIdle: 'rifle/idle',
  },
  pistol: {
    fire: 'pistol/gunplay',
    reload: 'pistol/pistol reload',
    aimIdle: 'pistol/pistol idle',
  },
};

/** Extra combat clips keyed by FSM / arena state name. */
export const BAKED_COMBAT_EXTRAS = {
  attack2: 'sword_shield/sword and shield slash',
  attack3: 'sword_shield/sword and shield attack (2)',
  combo1: 'sword_shield/sword and shield attack',
  combo2: 'sword_shield/sword and shield slash',
  combo3: 'sword_shield/sword and shield attack (2)',
  cast: 'magic/standing 1h cast spell 01',
  cast2H: 'magic/standing 2h cast spell 01',
  dodge: 'uploads/locomotion/Jump_From_Wall',
  jump: 'locomotion/jump',
  blockIdle: 'sword_shield/sword and shield block idle',
  aimIdle: 'longbow/standing aim idle',
  taunt: 'unarmed/taunt',
};

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
  return grudge6AssetUrl(`anims/baked/${rel}.json`);
}

export function toRotationOnlyClip(clip) {
  const tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion'));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

export async function loadBakedClip(rel) {
  const cached = clipCache.get(rel);
  if (cached) return cached.clone();

  const url = bakedClipUrl(rel);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[bakedAnim] ${url} HTTP ${res.status}`);
  const json = await res.json();
  const clip = toRotationOnlyClip(THREE.AnimationClip.parse(json));
  clipCache.set(rel, clip);
  return clip.clone();
}

/** Load locomotion + combat clips for a weapon type. */
export async function loadBakedPackClips(weaponType) {
  const packName = WeaponToBakedPack[weaponType] || 'sword_shield';
  const pack = ANIM_PACK_CLIPS[packName];
  const rels = new Map([
    ['idle', pack.idle],
    ['walk', pack.walk],
    ['run', pack.run],
    ['sprint', SPRINT_CLIP],
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

  const entries = await Promise.all(
    [...rels.entries()].map(async ([name, rel]) => {
      try {
        const clip = await loadBakedClip(rel);
        clip.name = name;
        return [name, clip];
      } catch (err) {
        console.warn(`[bakedAnim] skip ${name} (${rel}):`, err.message);
        return null;
      }
    }),
  );

  const clips = new Map();
  const skipped = [];
  for (const entry of entries) {
    if (entry) clips.set(entry[0], entry[1]);
  }
  for (const [name] of rels) {
    if (!clips.has(name) && REQUIRED_BAKED_LOCO.includes(name)) {
      skipped.push(name);
    }
  }
  if (skipped.length) {
    console.warn(
      `[bakedAnim] ${packName}: missing core clips [${skipped.join(", ")}] — check /api/assets/anims/baked/`,
    );
  }
  return { packName, clips, skipped };
}