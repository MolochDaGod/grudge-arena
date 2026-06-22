/**
 * Grudge6AnimLoader — FBX weapon animation packs for grudge6 race skeletons.
 * Loads clips without Mixamo→Bip001 remapping (native grudge6 / Toon RTS rig).
 */

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const fbxLoader = new FBXLoader();
const clipCache = new Map();

/** Arena weapon type → grudge6 animation pack folder on R2 */
export const GRUDGE6_ANIM_PACK = {
  greatsword: 'pro_melee_axe',
  scythe: 'pro_melee_axe',
  mace: '2h_melee',
  unarmed: '2h_melee',
  sabres: 'pro_sword_shield',
  runeblade: 'pro_sword_shield',
  bow: 'pro_longbow',
  staff: 'pro_magic',
  wand: 'pro_magic',
  rifle: 'advanced_gun',
};

/** State name → FBX filename within pack */
const GRUDGE6_ANIM_FILES = {
  pro_melee_axe: {
    idle: 'standing idle.fbx',
    run: 'standing run forward.fbx',
    walk: 'standing walk forward.fbx',
    attack1: 'standing melee attack horizontal.fbx',
    attack2: 'standing melee attack downward.fbx',
    attack3: 'standing melee attack backhand.fbx',
    combo1: 'standing melee combo attack ver. 1.fbx',
    combo2: 'standing melee combo attack ver. 2.fbx',
    spin: 'standing melee attack 360 high.fbx',
    block: 'standing block idle.fbx',
    blockHit: 'standing block react large.fbx',
    jump: 'standing jump.fbx',
    jumpAttack: 'standing melee run jump attack.fbx',
    hit: 'standing react large from left.fbx',
    taunt: 'standing taunt battlecry.fbx',
    dodge: 'standing melee attack kick ver. 1.fbx',
  },
  '2h_melee': {
    idle: 'standing idle.fbx',
    run: 'standing run forward.fbx',
    walk: 'standing walk forward.fbx',
    attack1: 'standing melee attack horizontal.fbx',
    attack2: 'standing melee attack backhand.fbx',
    attack3: 'standing melee attack downward.fbx',
    combo1: 'standing melee combo attack ver. 1.fbx',
    jumpAttack: 'standing melee run jump attack.fbx',
    block: 'standing block idle.fbx',
    taunt: 'standing taunt battlecry.fbx',
  },
  pro_sword_shield: {
    idle: 'sword and shield idle.fbx',
    run: 'sword and shield run.fbx',
    walk: 'sword and shield walk.fbx',
    attack1: 'sword and shield attack.fbx',
    attack2: 'sword and shield attack (2).fbx',
    attack3: 'sword and shield attack (3).fbx',
    attack4: 'sword and shield attack (4).fbx',
    slash1: 'sword and shield slash.fbx',
    slash2: 'sword and shield slash (2).fbx',
    slash3: 'sword and shield slash (3).fbx',
    block: 'sword and shield block idle.fbx',
    block2: 'sword and shield block.fbx',
    cast: 'sword and shield casting.fbx',
    powerUp: 'sword and shield power up.fbx',
    dodge: 'sword and shield strafe.fbx',
    kick: 'sword and shield kick.fbx',
    death: 'sword and shield death.fbx',
    crouch: 'sword and shield crouch idle.fbx',
  },
  pro_longbow: {
    idle: 'standing idle 01.fbx',
    run: 'standing run forward.fbx',
    walk: 'standing walk forward.fbx',
    attack1: 'standing draw arrow.fbx',
    attack2: 'standing aim recoil.fbx',
    attack3: 'standing aim overdraw.fbx',
    block: 'standing block.fbx',
    dodge: 'standing dodge backward.fbx',
    dodgeBack: 'standing dodge backward.fbx',
    death: 'standing death forward 01.fbx',
    aimIdle: 'standing aim overdraw.fbx',
  },
  pro_magic: {
    idle: 'standing idle.fbx',
    run: 'Standing Run Forward.fbx',
    walk: 'Standing Walk Forward.fbx',
    attack1: 'Standing 1H Magic Attack 01.fbx',
    attack2: 'Standing 1H Magic Attack 02.fbx',
    attack3: 'Standing 1H Magic Attack 03.fbx',
    cast: 'standing 1H cast spell 01.fbx',
    cast2H: 'Standing 2H Cast Spell 01.fbx',
    aoe: 'Standing 2H Magic Area Attack 02.fbx',
    aoe2: 'Standing 2H Magic Area Attack 01.fbx',
    block: 'Standing Block Idle.fbx',
    hit: 'Standing React Large From Front.fbx',
    death: 'Standing React Death Backward.fbx',
    jump: 'Standing Jump.fbx',
  },
  advanced_gun: {
    idle: 'idle.fbx',
    run: 'run forward.fbx',
    walk: 'walk forward.fbx',
    attack1: 'idle aiming.fbx',
    death: 'death from the front.fbx',
  },
};

async function loadFbxClip(url) {
  const cached = clipCache.get(url);
  if (cached) return cached.clone();

  const encoded = url.replace(/ /g, '%20');
  const fbx = await new Promise((resolve, reject) => {
    fbxLoader.load(encoded, resolve, undefined, reject);
  });
  if (!fbx.animations?.length) return null;

  const clip = fbx.animations[0].clone();
  clipCache.set(url, clip);
  return clip.clone();
}

/**
 * Preload grudge6 FBX animations for a weapon type.
 * @param {string} weaponType
 * @param {THREE.AnimationMixer} mixer
 * @param {THREE.Object3D} root
 * @param {(path: string) => string} animBaseUrl - builds full URL for pack/file
 */
export async function preloadGrudge6Anims(weaponType, mixer, root, animBaseUrl) {
  const pack = GRUDGE6_ANIM_PACK[weaponType] || 'pro_melee_axe';
  const fileMap = GRUDGE6_ANIM_FILES[pack];
  if (!fileMap) return new Map();

  const entries = Object.entries(fileMap);
  const results = await Promise.allSettled(
    entries.map(async ([state, file]) => {
      const url = animBaseUrl(`${pack}/${file}`);
      const clip = await loadFbxClip(url);
      return { state, clip };
    }),
  );

  const actions = new Map();
  let loaded = 0;
  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value.clip) continue;
    const { state, clip } = result.value;
    clip.name = state;
    actions.set(state, mixer.clipAction(clip, root));
    loaded++;
  }

  console.log(`[Grudge6AnimLoader] ${weaponType} (${pack}): ${loaded}/${entries.length} FBX clips`);
  return actions;
}