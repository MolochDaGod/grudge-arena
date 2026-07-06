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
  taunt: 'unarmed/taunt',
};

const clipCache = new Map();

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
  for (const entry of entries) {
    if (entry) clips.set(entry[0], entry[1]);
  }
  return { packName, clips };
}