/**
 * Model Loader — GLB race models + FBX weapon animations
 *
 * Handles:
 *  - Loading 6 race GLB models (Mixamo-rigged, bare bone names)
 *  - Loading FBX weapon animation packs and retargeting onto GLB skeletons
 *  - Mixamo bone-name prefix stripping for cross-rig compatibility
 *  - Animation clip caching to avoid re-downloads
 *  - fadeToAction() crossfade blending (annihilate engine pattern)
 *  - AnimationController per-character managing mixer + state switching
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { getRaceConfig, getRaceFactionColors, resolveWeapon, TierConfig } from './engine/RaceConfig.js';

// ── Config from WeaponAnimationConfig.js ────────────────────────────────────

/**
 * Race scale multipliers — applied ON TOP of the GLB's native scale.
 * All 6 race GLBs have root scale 0.01 (centimeter units).
 * These multipliers adjust relative size differences between races.
 */
export const RaceScaleConfig = {
  human:     { scale: 1.0,  heightOffset: 0 },
  barbarian: { scale: 1.12, heightOffset: 0.06 },
  elf:       { scale: 1.05, heightOffset: 0.02 },
  dwarf:     { scale: 0.85, heightOffset: -0.08 },
  orc:       { scale: 1.08, heightOffset: 0.04 },
  undead:    { scale: 0.95, heightOffset: -0.02 },
};

export const WeaponToAnimPack = {
  greatsword: 'axe',
  bow:        'longbow',
  sabres:     'sword_shield',
  scythe:     'axe',
  runeblade:  'sword_shield',
  staff:      'magic',
  wand:       'magic',
  rifle:      'rifle',
  unarmed:    'axe',
};

/**
 * Map weapon type → animation class key used by the pre-built animation library
 * (see scripts/build-anim-library.mjs). Clips inside animation-library.glb are
 * keyed as `${animClass}__${state}` e.g. 'greatsword__attack1', 'swordShield__cast'.
 */
export const WeaponToAnimClass = {
  greatsword: 'greatsword',
  scythe:     'greatsword',
  sabres:     'swordShield',
  runeblade:  'swordShield',
  staff:      'magic',
  wand:       'magic',
  bow:        'longbow',
  rifle:      'rifle',
  unarmed:    'greatsword',
};

/** Animation state loop config — true = loops, false = plays once */
export const CORE_ANIMS = {
  // Locomotion (loop)
  idle: { loop: true }, idle2: { loop: true }, idle3: { loop: true },
  run: { loop: true }, runBack: { loop: true },
  runLeft: { loop: true }, runRight: { loop: true },
  walk: { loop: true }, walkBack: { loop: true },
  walkLeft: { loop: true }, walkRight: { loop: true },
  strafeLeft: { loop: true }, strafeRight: { loop: true },
  sprint: { loop: true },
  crouch: { loop: true }, crouchIdle: { loop: true },
  crouchWalk: { loop: true }, crouchWalkBack: { loop: true },
  aimIdle: { loop: true }, aimWalkFwd: { loop: true },
  fallLoop: { loop: true }, jumpLoop: { loop: true },
  blockIdle: { loop: true }, crouchBlockIdle: { loop: true },
  // One-shot
  attack1: { loop: false }, attack2: { loop: false }, attack3: { loop: false },
  attack4: { loop: false },
  slash1: { loop: false }, slash2: { loop: false }, slash3: { loop: false },
  slash4: { loop: false }, slash5: { loop: false },
  combo1: { loop: false }, combo2: { loop: false }, combo3: { loop: false },
  spin: { loop: false }, spinLow: { loop: false },
  kick: { loop: false }, kick2: { loop: false }, punch: { loop: false },
  jumpAttack: { loop: false },
  cast: { loop: false }, cast2: { loop: false }, cast2H: { loop: false },
  aoe: { loop: false }, aoe2: { loop: false }, powerUp: { loop: false },
  attack2H1: { loop: false }, attack2H2: { loop: false }, attack2H3: { loop: false },
  attack2H4: { loop: false }, attack2H5: { loop: false },
  block: { loop: false }, block2: { loop: false },
  blockHit: { loop: false }, blockEnd: { loop: false },
  crouchBlock: { loop: false },
  dodge: { loop: false }, dodgeBack: { loop: false },
  dodgeLeft: { loop: false }, dodgeRight: { loop: false },
  dive: { loop: false },
  hit: { loop: false }, hit2: { loop: false }, hit3: { loop: false },
  hitBack: { loop: false }, hitLeft: { loop: false }, hitRight: { loop: false },
  hitGut: { loop: false }, hitHead: { loop: false }, hitSmall: { loop: false },
  death: { loop: false }, death2: { loop: false },
  deathBack: { loop: false }, deathLeft: { loop: false }, deathRight: { loop: false },
  jump: { loop: false }, jumpRun: { loop: false },
  jumpLand: { loop: false }, fallLand: { loop: false }, runStop: { loop: false },
  land: { loop: false }, crouchStand: { loop: false },
  draw: { loop: false }, draw2: { loop: false },
  sheath: { loop: false }, disarm: { loop: false }, equip: { loop: false },
  taunt: { loop: false }, taunt2: { loop: false },
  turnLeft: { loop: false }, turnRight: { loop: false },
};

/** Full animation maps — all available GLBs per weapon pack */
const ANIM_FILE_MAP = {
  axe: {
    // Locomotion
    idle:     'standing idle.glb',
    idle2:    'standing idle looking ver. 1.glb',
    idle3:    'standing idle looking ver. 2.glb',
    run:      'standing run forward.glb',
    runBack:  'standing run back.glb',
    walk:     'standing walk forward.glb',
    walkBack: 'standing walk back.glb',
    walkLeft: 'standing walk left.glb',
    walkRight:'standing walk right.glb',
    jump:     'standing jump.glb',
    jumpAttack:'standing melee run jump attack.glb',
    // Attacks
    attack1:  'standing melee attack horizontal.glb',
    attack2:  'standing melee attack downward.glb',
    attack3:  'standing melee attack backhand.glb',
    combo1:   'standing melee combo attack ver. 1.glb',
    combo2:   'standing melee combo attack ver. 2.glb',
    combo3:   'standing melee combo attack ver. 3.glb',
    spin:     'standing melee attack 360 high.glb',
    spinLow:  'standing melee attack 360 low.glb',
    kick:     'standing melee attack kick ver. 1.glb',
    kick2:    'standing melee attack kick ver. 2.glb',
    // Defense
    block:    'standing block idle.glb',
    blockHit: 'standing block react large.glb',
    crouch:   'crouch idle.glb',
    crouchStand: 'crouch to standing idle.glb',
    // Reactions
    hit:      'standing react large from left.glb',
    hitRight: 'standing react large from right.glb',
    hitGut:   'standing react large gut.glb',
    // Utility
    taunt:    'standing taunt battlecry.glb',
    taunt2:   'standing taunt chest thump.glb',
    equip:    'unarmed equip over shoulder.glb',
    disarm:   'standing disarm over shoulder.glb',
    turnLeft: 'standing turn left 90.glb',
    turnRight:'standing turn right 90.glb',
  },
  sword_shield: {
    // Locomotion
    idle:     'sword and shield idle.glb',
    idle2:    'sword and shield idle (2).glb',
    idle3:    'sword and shield idle (3).glb',
    run:      'sword and shield run.glb',
    runBack:  'sword and shield run (2).glb',
    walk:     'sword and shield walk.glb',
    walkBack: 'sword and shield walk (2).glb',
    strafeLeft:'sword and shield strafe.glb',
    strafeRight:'sword and shield strafe (2).glb',
    jump:     'sword and shield jump.glb',
    crouch:   'sword and shield crouch.glb',
    crouchIdle:'sword and shield crouch idle.glb',
    // Attacks
    attack1:  'sword and shield attack.glb',
    attack2:  'sword and shield attack (2).glb',
    attack3:  'sword and shield attack (3).glb',
    attack4:  'sword and shield attack (4).glb',
    slash1:   'sword and shield slash.glb',
    slash2:   'sword and shield slash (2).glb',
    slash3:   'sword and shield slash (3).glb',
    slash4:   'sword and shield slash (4).glb',
    slash5:   'sword and shield slash (5).glb',
    kick:     'sword and shield kick.glb',
    cast:     'sword and shield casting.glb',
    cast2:    'sword and shield casting (2).glb',
    powerUp:  'sword and shield power up.glb',
    // Defense
    block:    'sword and shield block.glb',
    block2:   'sword and shield block (2).glb',
    blockIdle:'sword and shield block idle.glb',
    crouchBlock:'sword and shield crouch block.glb',
    crouchBlockIdle:'sword and shield crouch block idle.glb',
    // Reactions
    hit:      'sword and shield impact.glb',
    hit2:     'sword and shield impact (2).glb',
    hit3:     'sword and shield impact (3).glb',
    death:    'sword and shield death.glb',
    death2:   'sword and shield death (2).glb',
    // Utility
    draw:     'draw sword 1.glb',
    draw2:    'draw sword 2.glb',
    sheath:   'sheath sword 1.glb',
    turnLeft: 'sword and shield turn.glb',
    turnRight:'sword and shield turn (2).glb',
  },
  longbow: {
    // Locomotion
    idle:     'standing idle 01.glb',
    idle2:    'standing idle 02 looking.glb',
    idle3:    'standing idle 03 examine.glb',
    run:      'standing run forward.glb',
    runBack:  'standing run back.glb',
    runLeft:  'standing run left.glb',
    runRight: 'standing run right.glb',
    runStop:  'standing run forward stop.glb',
    walk:     'standing walk forward.glb',
    walkBack: 'standing walk back.glb',
    walkLeft: 'standing walk left.glb',
    walkRight:'standing walk right.glb',
    aimWalkFwd:'standing aim walk forward.glb',
    aimWalkBack:'standing aim walk back.glb',
    aimWalkLeft:'standing aim walk left.glb',
    aimWalkRight:'standing aim walk right.glb',
    fallLoop: 'fall a loop.glb',
    fallLand: 'fall a land to standing idle 01.glb',
    // Attacks
    attack1:  'standing draw arrow.glb',
    attack2:  'standing aim recoil.glb',
    attack3:  'standing aim overdraw.glb',
    kick:     'standing melee kick.glb',
    punch:    'standing melee punch.glb',
    // Defense
    block:    'standing block.glb',
    dodge:    'standing dodge forward.glb',
    dodgeBack:'standing dodge backward.glb',
    dodgeLeft:'standing dodge left.glb',
    dodgeRight:'standing dodge right.glb',
    dive:     'standing dive forward.glb',
    // Reactions
    hit:      'standing react small from front.glb',
    hitHead:  'standing react small from headshot.glb',
    death:    'standing death forward 01.glb',
    deathBack:'standing death backward 01.glb',
    // Utility
    draw:     'standing equip bow.glb',
    disarm:   'standing disarm bow.glb',
    turnLeft: 'standing turn 90 left.glb',
    turnRight:'standing turn 90 right.glb',
  },
  magic: {
    // Locomotion
    idle:     'standing idle.glb',
    idle2:    'standing idle 02.glb',
    idle3:    'Standing Idle 03.glb',
    run:      'Standing Run Forward.glb',
    runBack:  'Standing Run Back.glb',
    runLeft:  'Standing Run Left.glb',
    runRight: 'Standing Run Right.glb',
    walk:     'Standing Walk Forward.glb',
    walkBack: 'Standing Walk Back.glb',
    walkLeft: 'Standing Walk Left.glb',
    walkRight:'Standing Walk Right.glb',
    sprint:   'Standing Sprint Forward.glb',
    jump:     'Standing Jump.glb',
    jumpRun:  'Standing Jump Running.glb',
    land:     'Standing Land To Standing Idle.glb',
    crouch:   'Crouch Idle.glb',
    crouchWalk:'Crouch Walk Forward.glb',
    crouchWalkBack:'Crouch Walk Back.glb',
    // Attacks
    attack1:  'Standing 1H Magic Attack 01.glb',
    attack2:  'Standing 1H Magic Attack 02.glb',
    attack3:  'Standing 1H Magic Attack 03.glb',
    attack2H1:'Standing 2H Magic Attack 01.glb',
    attack2H2:'Standing 2H Magic Attack 02.glb',
    attack2H3:'Standing 2H Magic Attack 03.glb',
    attack2H4:'Standing 2H Magic Attack 04.glb',
    attack2H5:'Standing 2H Magic Attack 05.glb',
    cast:     'standing 1H cast spell 01.glb',
    cast2H:   'Standing 2H Cast Spell 01.glb',
    aoe:      'Standing 2H Magic Area Attack 01.glb',
    aoe2:     'Standing 2H Magic Area Attack 02.glb',
    // Defense
    block:    'Standing Block Start.glb',
    blockIdle:'Standing Block Idle.glb',
    blockEnd: 'Standing Block End.glb',
    blockHit: 'Standing Block React Large.glb',
    // Reactions
    hit:      'Standing React Large From Front.glb',
    hitBack:  'Standing React Large From Back.glb',
    hitLeft:  'Standing React Large From Left.glb',
    hitRight: 'Standing React Large From Right.glb',
    hitSmall: 'Standing React Small From Front.glb',
    death:    'Standing React Death Forward.glb',
    deathBack:'Standing React Death Backward.glb',
    deathLeft:'Standing React Death Left.glb',
    deathRight:'Standing React Death Right.glb',
    // Utility
    turnLeft: 'Standing Turn Left 90.glb',
    turnRight:'Standing Turn Right 90.glb',
  },
  rifle: {
    // Locomotion
    idle:     'idle.glb',
    aimIdle:  'idle aiming.glb',
    run:      'run forward.glb',
    runBack:  'run backward.glb',
    runLeft:  'run left.glb',
    runRight: 'run right.glb',
    walk:     'walk forward.glb',
    walkBack: 'walk backward.glb',
    walkLeft: 'walk left.glb',
    walkRight:'walk right.glb',
    sprint:   'sprint forward.glb',
    sprintLeft:'sprint left.glb',
    sprintRight:'sprint right.glb',
    jump:     'jump up.glb',
    jumpLoop: 'jump loop.glb',
    jumpLand: 'jump down.glb',
    crouch:   'idle crouching.glb',
    crouchAim:'idle crouching aiming.glb',
    crouchWalk:'walk crouching forward.glb',
    crouchWalkBack:'walk crouching backward.glb',
    // Attacks
    attack1:  'idle aiming.glb',
    // Reactions
    hit:      'death from front headshot.glb',
    hitBack:  'death from back headshot.glb',
    death:    'death from the front.glb',
    deathBack:'death from the back.glb',
    deathRight:'death from right.glb',
    deathCrouch:'death crouching headshot front.glb',
    // Utility
    turnLeft: 'turn 90 left.glb',
    turnRight:'turn 90 right.glb',
  },
};

/** Audio SFX paths per weapon type (matched to actual filenames) */
export const WEAPON_SFX = {
  greatsword: {
    attack: ['/audio/sfx/sword/swing_1.mp3', '/audio/sfx/sword/swing_2.mp3', '/audio/sfx/sword/swing_3.mp3'],
    skill:  ['/audio/sfx/sword/charge.mp3', '/audio/sfx/sword/colossus_strike.mp3', '/audio/sfx/sword/windshear.mp3'],
    block:  ['/audio/sfx/sword/deflect.mp3'],
  },
  scythe: {
    attack: ['/audio/sfx/scythe/entropic_bolts.mp3'],
    skill:  ['/audio/sfx/scythe/cryoflame.mp3', '/audio/sfx/scythe/crossentropy.mp3', '/audio/sfx/scythe/frost_nova.mp3', '/audio/sfx/scythe/sunwell.mp3'],
  },
  sabres: {
    attack: ['/audio/sfx/sabres/sabres_swing.mp3'],
    skill:  ['/audio/sfx/sabres/backstab.mp3', '/audio/sfx/sabres/flourish.mp3', '/audio/sfx/sabres/shadow_step.mp3', '/audio/sfx/sabres/skyfall.mp3'],
  },
  runeblade: {
    attack: ['/audio/sfx/runeblade/smite.mp3'],
    skill:  ['/audio/sfx/runeblade/heartrend.mp3', '/audio/sfx/runeblade/wraithblade.mp3', '/audio/sfx/runeblade/void_grasp.mp3'],
  },
  bow: {
    attack: ['/audio/sfx/bow/draw.mp3', '/audio/sfx/bow/release.mp3'],
    skill:  ['/audio/sfx/bow/cobra_shot_release.mp3', '/audio/sfx/bow/viper_sting_release.mp3', '/audio/sfx/bow/barrage_release.mp3', '/audio/sfx/bow/cloudkill_release.mp3'],
  },
  staff: {
    attack: ['/audio/sfx/scythe/entropic_bolts.mp3'],
    skill:  ['/audio/sfx/scythe/mantra.mp3', '/audio/sfx/scythe/cryoflame.mp3'],
  },
  wand: {
    attack: ['/audio/sfx/scythe/entropic_bolts.mp3'],
    skill:  ['/audio/sfx/scythe/mantra.mp3'],
  },
  // UI sounds
  ui: {
    select:  '/audio/sfx/ui/selection.mp3',
    dash:    '/audio/sfx/ui/dash.mp3',
    countdown:'/audio/sfx/ui/interface.mp3',
  },
};

/** Play a random SFX from an array, or a single path */
export function playSFX(pathOrArray, volume = 0.3) {
  try {
    const path = Array.isArray(pathOrArray)
      ? pathOrArray[Math.floor(Math.random() * pathOrArray.length)]
      : pathOrArray;
    if (!path) return;
    const audio = new Audio(path);
    audio.volume = volume;
    audio.play().catch(() => {}); // Ignore autoplay blocks
  } catch {}
}

// ── Mixamo bone-name remapping ──────────────────────────────────────
//
// Animation GLBs (from Mixamo) use "mixamorig:Hips", "mixamorig:Spine1", etc.
// Our character GLBs use bare names with slight differences:
//   mixamorig:Spine1 → Spine01, mixamorig:Spine2 → Spine02,
//   mixamorig:Neck → neck, mixamorig:HeadTop_End → head_end
// We strip the prefix first, then apply the alias map.

const MIXAMO_PREFIXES = [
  'mixamorig10:', 'mixamorig9:', 'mixamorig8:', 'mixamorig7:',
  'mixamorig6:', 'mixamorig5:', 'mixamorig4:', 'mixamorig3:',
  'mixamorig2:', 'mixamorig1:', 'mixamorig:',
];

/** After stripping prefix, remap any names that differ between Mixamo standard and our models */
const BONE_ALIASES = {
  'Spine1':       'Spine01',
  'Spine2':       'Spine02',
  'Neck':         'neck',
  'HeadTop_End':  'head_end',
  'Reye':         'headfront',
  'Leye':         'headfront',
};

/** Bones that exist on our 24-joint character skeleton. Tracks targeting anything else get stripped. */
const VALID_BONES = new Set([
  'Hips', 'Spine', 'Spine01', 'Spine02', 'neck', 'Head', 'head_end', 'headfront',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
  'Armature',
]);

function stripMixamoPrefix(name) {
  for (const prefix of MIXAMO_PREFIXES) {
    if (name.startsWith(prefix)) return name.slice(prefix.length);
  }
  return name;
}

/**
 * Remap all track names in an AnimationClip to match our character skeletons.
 * Track format: "boneName.property" (e.g. "mixamorig:Hips.position")
 * Steps: 1) strip mixamorig prefix  2) apply bone alias map
 */
function remapClipBoneNames(clip) {
  for (const track of clip.tracks) {
    const dotIdx = track.name.indexOf('.');
    if (dotIdx === -1) continue;
    const bone = track.name.substring(0, dotIdx);
    const prop = track.name.substring(dotIdx);
    
    // Step 1: strip mixamorig: prefix
    let remapped = stripMixamoPrefix(bone);
    
    // Step 2: apply alias map for bones that differ
    if (BONE_ALIASES[remapped]) {
      remapped = BONE_ALIASES[remapped];
    }
    
    if (remapped !== bone) {
      track.name = remapped + prop;
    }
  }
  return clip;
}

// ── Caches ────────────────────────────────────────────────────────────────

const gltfCache = new Map();
const clipCache = new Map();
const gltfLoader = new GLTFLoader();

// ── Load race GLB model ─────────────────────────────────────────────────────

/**
 * @param {string} race - e.g. 'human', 'barbarian'
 * @returns {{ scene: THREE.Group, mixer: THREE.AnimationMixer, actions: Map<string, THREE.AnimationAction>, clips: THREE.AnimationClip[] }}
 */
/**
 * Properly clone a GLTF scene including SkinnedMesh skeleton bindings.
 * Three.js clone(true) breaks skinned meshes — we need to manually
 * rebind skeletons after cloning.
 */
function cloneGLTFScene(source) {
  const clone = source.clone(true);
  const sourceSkins = [];
  const cloneSkins = [];

  source.traverse(node => { if (node.isSkinnedMesh) sourceSkins.push(node); });
  clone.traverse(node => { if (node.isSkinnedMesh) cloneSkins.push(node); });

  for (let i = 0; i < cloneSkins.length; i++) {
    const src = sourceSkins[i];
    const dst = cloneSkins[i];
    if (!src || !dst) continue;

    // Find matching bones in the cloned hierarchy by name
    const newBones = src.skeleton.bones.map(srcBone => {
      let found = null;
      clone.traverse(node => {
        if (node.name === srcBone.name && node.isBone) found = node;
      });
      return found || srcBone;
    });

    dst.skeleton = new THREE.Skeleton(newBones, src.skeleton.boneInverses.map(m => m.clone()));
    dst.bind(dst.skeleton, dst.matrixWorld);

    // Clone material so we don't mutate the cached original
    if (dst.material) {
      dst.material = Array.isArray(dst.material)
        ? dst.material.map(m => m.clone())
        : dst.material.clone();
    }
  }

  return clone;
}

export async function loadRaceModel(race) {
  const path = `/models/${race}.glb`;
  let gltf = gltfCache.get(path);

  if (!gltf) {
    gltf = await new Promise((resolve, reject) => {
      gltfLoader.load(path, resolve, undefined, reject);
    });
    gltfCache.set(path, gltf);
  }

  // Properly clone with skeleton rebinding
  const scene = cloneGLTFScene(gltf.scene);

  // Enable shadows, fix materials
  scene.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false; // Prevent skinned mesh culling glitches
      if (child.material?.metalness !== undefined) {
        child.material.metalness = Math.min(child.material.metalness, 0.6);
      }
    }
  });

  // IMPORTANT: Do NOT overwrite the root scale.
  // GLB models have root scale 0.01 (centimeter units) baked in.
  // Apply race multiplier ON TOP of the native scale.
  const cfg = RaceScaleConfig[race] || RaceScaleConfig.human;
  const nativeScale = scene.scale.x; // 0.01 for all race GLBs
  scene.scale.setScalar(nativeScale * cfg.scale);

  const mixer = new THREE.AnimationMixer(scene);
  const actions = new Map();

  // Register embedded animations (remap bone names)
  // Clone clips so cached originals aren't mutated
  // Also create aliases: 'Running' → register as both 'running' AND 'run'
  const EMBEDDED_ALIASES = {
    'running': ['run', 'idle'],   // Running anim doubles as run and idle fallback
    'walking': ['walk'],
    'idle':    [],
  };
  for (const clip of gltf.animations) {
    const clonedClip = clip.clone();
    remapClipBoneNames(clonedClip);
    const key = clonedClip.name.toLowerCase();
    const action = mixer.clipAction(clonedClip, scene);
    actions.set(key, action);
    // Register aliases so 'run' and 'idle' resolve to embedded anims
    const aliases = EMBEDDED_ALIASES[key] || [];
    for (const alias of aliases) {
      if (!actions.has(alias)) actions.set(alias, action);
    }
  }

  console.log(`[modelLoader] Loaded ${race} — scale: ${nativeScale * cfg.scale}, embeddedAnims: [${[...actions.keys()].join(', ')}]`);
  return { scene, mixer, actions, clips: gltf.animations };
}

// ── Load a single FBX animation clip ────────────────────────────────────────

/**
 * Load a standalone animation GLB (extract clip only).
 * All animation files are now GLB (converted from FBX via fbx2gltf).
 * GLTFLoader is used for everything — no FBXLoader needed.
 */
export async function loadAnimClip(filePath) {
  // URL-encode spaces in file paths (Mixamo filenames have spaces)
  const encodedPath = filePath.replace(/ /g, '%20');
  
  const cached = clipCache.get(filePath);
  if (cached) return cached.clone();

  try {
    const gltf = await new Promise((resolve, reject) => {
      gltfLoader.load(encodedPath, resolve, undefined, reject);
    });
    if (!gltf.animations || gltf.animations.length === 0) {
      console.warn(`[modelLoader] No animations in ${filePath}`);
      return null;
    }
    const clip = remapClipBoneNames(gltf.animations[0]);

    // Strip tracks targeting bones that don't exist on our 24-joint skeleton.
    clip.tracks = clip.tracks.filter(track => {
      const dotIdx = track.name.indexOf('.');
      if (dotIdx === -1) return true;
      const boneName = track.name.substring(0, dotIdx);
      return VALID_BONES.has(boneName);
    });

    // DO NOT scale position tracks. The Armature's 0.01 root scale already
    // converts centimeter bone positions to world meters. Double-scaling
    // would sink the character into the ground.

    clipCache.set(filePath, clip);
    return clip.clone();
  } catch (err) {
    console.warn(`[modelLoader] Failed to load ${filePath}:`, err.message);
    return null;
  }
}

// ── Preload an entire weapon animation pack ─────────────────────────────────

/**
 * @param {string} weaponType - e.g. 'greatsword', 'bow'
 * @param {THREE.AnimationMixer} mixer
 * @param {THREE.Object3D} root
 * @returns {Map<string, THREE.AnimationAction>} stateName → action
 */
export async function preloadWeaponAnims(weaponType, mixer, root) {
  const packName = WeaponToAnimPack[weaponType] || 'axe';
  const fileMap = ANIM_FILE_MAP[packName];
  if (!fileMap) {
    console.warn(`[modelLoader] No anim pack for weapon: ${weaponType}`);
    return new Map();
  }

  const basePath = `/assets/animations/${packName}/`;
  const entries = Object.entries(fileMap);
  const results = await Promise.allSettled(
    entries.map(([state, file]) =>
      loadAnimClip(basePath + file).then(clip => ({ state, clip }))
    )
  );

  const actions = new Map();
  let boundTracks = 0;
  let totalTracks = 0;
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.clip) {
      const { state, clip } = result.value;
      clip.name = state;
      totalTracks += clip.tracks.length;
      
      // Verify tracks bind to bones in the character hierarchy
      const action = mixer.clipAction(clip, root);
      // Count how many property bindings resolved
      for (const binding of action._propertyBindings || []) {
        if (binding?.binding?.node) boundTracks++;
      }
      actions.set(state, action);
    }
  }

  console.log(`[modelLoader] Loaded ${actions.size}/${entries.length} anims for ${weaponType} (${packName}), ${boundTracks}/${totalTracks} tracks bound`);
  return actions;
}

// ── fadeToAction — smooth animation crossfade (annihilate pattern) ───────────

export function fadeToAction(currentAction, nextAction, duration = 0.15, loop = true, speed = 1) {
  nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  nextAction.clampWhenFinished = !loop;
  nextAction.timeScale = speed;

  if (currentAction && currentAction !== nextAction) {
    if (duration > 0) {
      nextAction.reset().play();
      currentAction.crossFadeTo(nextAction, duration, true);
    } else {
      currentAction.stop();
      nextAction.reset().play();
    }
  } else {
    nextAction.reset().play();
  }
  return nextAction;
}

// ── AnimationController — per-character animation state manager ──────────────

export class AnimationController {
  constructor(mixer, root) {
    this.mixer = mixer;
    this.root = root;
    this.actions = new Map(); // stateName → AnimationAction
    this.currentAction = null;
    this.currentState = '';
    this._onFinish = null;

    this.mixer.addEventListener('finished', () => {
      if (this._onFinish) this._onFinish();
    });
  }

  /** Register all actions from a preloaded pack */
  registerActions(actionMap) {
    for (const [name, action] of actionMap) {
      this.actions.set(name, action);
    }
  }

  /** Play a named animation state with crossfade */
  play(stateName, opts = {}) {
    let action = this.actions.get(stateName);
    if (!action) {
      // Fallback chain: requested → idle → running → walking → first available
      const fallbacks = ['idle', 'running', 'walking', 'run'];
      if (stateName !== 'idle') {
        for (const fb of fallbacks) {
          action = this.actions.get(fb);
          if (action) { stateName = fb; break; }
        }
      }
      if (!action) {
        // Last resort: play whatever is first in the map
        const first = this.actions.entries().next().value;
        if (first) { action = first[1]; stateName = first[0]; }
      }
      if (!action) return false;
    }

    if (this.currentState === stateName && this.currentAction?.isRunning()) {
      return true;
    }

    const isLoop = opts.loop !== undefined ? opts.loop
      : (CORE_ANIMS[stateName]?.loop ?? true);
    const speed = opts.speed ?? 1;
    const fadeDuration = opts.fadeDuration ?? 0.15;

    this._onFinish = opts.onFinish ?? null;
    this.currentAction = fadeToAction(this.currentAction, action, fadeDuration, isLoop, speed);
    this.currentState = stateName;
    return true;
  }

  /** Play a one-shot then return to idle */
  playOnce(stateName, speed = 1) {
    return this.play(stateName, {
      loop: false,
      speed,
      onFinish: () => this.play('idle'),
    });
  }

  update(dt) {
    this.mixer.update(dt);
  }

  stop() {
    this.mixer.stopAllAction();
    this.currentAction = null;
    this.currentState = '';
  }

  dispose() {
    this.stop();
    this.actions.clear();
  }
}

// ── Weapon mesh creation ──────────────────────────────────────────────

/**
 * Create a procedural weapon mesh for a given weapon type.
 * Positioned and rotated to sit naturally in a character's hand.
 * All geometry is in local space (attached to hand bone).
 */
function createWeaponMesh(weaponType) {
  const group = new THREE.Group();
  group.name = '__weapon';

  // Weapon meshes are in centimeter space (matching the 0.01 root scale).
  // Since they're children of a hand bone inside the scaled armature,
  // we need to build them at ~100x to appear correctly (1 unit = 1cm in bone space).
  const S = 100; // scale factor to compensate for 0.01 root

  switch (weaponType) {
    case 'greatsword':
    case 'scythe': {
      // Blade
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.06 * S, 1.2 * S, 0.015 * S),
        new THREE.MeshStandardMaterial({ color: 0xaabbcc, metalness: 0.9, roughness: 0.2 })
      );
      blade.position.y = 0.8 * S;
      blade.castShadow = true;
      group.add(blade);

      // Edge highlight
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.065 * S, 1.2 * S, 0.003 * S),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xaaddff, emissiveIntensity: 0.3, metalness: 1, roughness: 0.1 })
      );
      edge.position.y = 0.8 * S;
      edge.position.z = 0.008 * S;
      group.add(edge);

      // Guard
      const guard = new THREE.Mesh(
        new THREE.BoxGeometry(0.18 * S, 0.03 * S, 0.04 * S),
        new THREE.MeshStandardMaterial({ color: 0x8b6914, metalness: 0.7, roughness: 0.3 })
      );
      guard.position.y = 0.18 * S;
      guard.castShadow = true;
      group.add(guard);

      // Handle
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015 * S, 0.018 * S, 0.25 * S, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 })
      );
      handle.position.y = 0.05 * S;
      group.add(handle);

      // Pommel
      const pommel = new THREE.Mesh(
        new THREE.SphereGeometry(0.025 * S, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x8b6914, metalness: 0.8, roughness: 0.2 })
      );
      pommel.position.y = -0.08 * S;
      group.add(pommel);
      break;
    }

    case 'sabres':
    case 'runeblade': {
      // Main sword (shorter, one-handed)
      const sblade = new THREE.Mesh(
        new THREE.BoxGeometry(0.04 * S, 0.7 * S, 0.012 * S),
        new THREE.MeshStandardMaterial({ color: 0xccddee, metalness: 0.9, roughness: 0.15 })
      );
      sblade.position.y = 0.5 * S;
      sblade.castShadow = true;
      group.add(sblade);

      // Guard
      const sguard = new THREE.Mesh(
        new THREE.BoxGeometry(0.12 * S, 0.025 * S, 0.035 * S),
        new THREE.MeshStandardMaterial({ color: 0xc9a84c, metalness: 0.8, roughness: 0.2 })
      );
      sguard.position.y = 0.15 * S;
      group.add(sguard);

      // Handle
      const shandle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.013 * S, 0.016 * S, 0.18 * S, 8),
        new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.9 })
      );
      shandle.position.y = 0.05 * S;
      group.add(shandle);

      // Rune glow for runeblade
      if (weaponType === 'runeblade') {
        const glow = new THREE.Mesh(
          new THREE.BoxGeometry(0.02 * S, 0.5 * S, 0.02 * S),
          new THREE.MeshStandardMaterial({ color: 0x4488ff, emissive: 0x4488ff, emissiveIntensity: 0.8, transparent: true, opacity: 0.6 })
        );
        glow.position.y = 0.5 * S;
        group.add(glow);
      }
      break;
    }

    case 'bow': {
      // Bow limb (curved via TorusGeometry)
      const limb = new THREE.Mesh(
        new THREE.TorusGeometry(0.5 * S, 0.015 * S, 8, 16, Math.PI * 0.8),
        new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.8, metalness: 0.1 })
      );
      limb.position.y = 0.3 * S;
      limb.rotation.z = Math.PI / 2;
      limb.castShadow = true;
      group.add(limb);

      // Bowstring
      const stringGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -0.2 * S, 0.02 * S),
        new THREE.Vector3(0, 0.8 * S, 0.02 * S),
      ]);
      const bowstring = new THREE.Line(
        stringGeo,
        new THREE.LineBasicMaterial({ color: 0xccccaa, linewidth: 2 })
      );
      group.add(bowstring);

      // Grip
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018 * S, 0.018 * S, 0.12 * S, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 })
      );
      grip.position.y = 0.3 * S;
      group.add(grip);
      break;
    }

    case 'staff':
    case 'wand': {
      // Shaft
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015 * S, 0.02 * S, 1.4 * S, 8),
        new THREE.MeshStandardMaterial({ color: 0x5c3d2e, roughness: 0.8 })
      );
      shaft.position.y = 0.5 * S;
      shaft.castShadow = true;
      group.add(shaft);

      // Crystal/orb at top
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.06 * S, 1),
        new THREE.MeshStandardMaterial({ color: 0x8844ff, emissive: 0x8844ff, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.2 })
      );
      crystal.position.y = 1.25 * S;
      crystal.castShadow = true;
      group.add(crystal);

      // Crystal glow
      const light = new THREE.PointLight(0x8844ff, 0.5, 3 * S);
      light.position.y = 1.25 * S;
      group.add(light);
      break;
    }

    default: {
      // Generic weapon placeholder
      const generic = new THREE.Mesh(
        new THREE.BoxGeometry(0.04 * S, 0.6 * S, 0.04 * S),
        new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5, roughness: 0.5 })
      );
      generic.position.y = 0.3 * S;
      generic.castShadow = true;
      group.add(generic);
    }
  }

  return group;
}

/**
 * Attach a weapon mesh to a character's hand bone.
 * @param {THREE.Object3D} characterScene - The loaded character scene (Group containing Armature)
 * @param {THREE.Group} weaponMesh - The weapon mesh group from createWeaponMesh()
 * @param {string} boneName - Target bone name (default: 'RightHand')
 */
export function attachWeaponToBone(characterScene, weaponMesh, boneName = 'RightHand') {
  let handBone = null;

  characterScene.traverse(node => {
    if (node.isBone && node.name === boneName) {
      handBone = node;
    }
  });

  if (!handBone) {
    console.warn(`[modelLoader] Bone '${boneName}' not found, weapon not attached`);
    return null;
  }

  // Weapon offset in bone-local space.
  // Adjust rotation so weapon points "forward" from the hand grip.
  weaponMesh.rotation.set(-Math.PI / 2, 0, 0); // Point weapon forward
  weaponMesh.position.set(0, 0, 0);

  handBone.add(weaponMesh);
  console.log(`[modelLoader] Attached weapon to ${boneName}`);
  return handBone;
}

/**
 * Attach a shield mesh to the left hand (for sword_shield weapon type).
 */
function createShieldMesh() {
  const S = 100;
  const group = new THREE.Group();
  group.name = '__shield';

  // Shield body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.3 * S, 0.4 * S, 0.03 * S),
    new THREE.MeshStandardMaterial({ color: 0x5a5a7a, metalness: 0.7, roughness: 0.3 })
  );
  body.position.y = 0.1 * S;
  body.castShadow = true;
  group.add(body);

  // Boss (center bump)
  const boss = new THREE.Mesh(
    new THREE.SphereGeometry(0.06 * S, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xc9a84c, metalness: 0.9, roughness: 0.2 })
  );
  boss.position.set(0, 0.1 * S, 0.02 * S);
  group.add(boss);

  // Rim
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.2 * S, 0.012 * S, 4, 16),
    new THREE.MeshStandardMaterial({ color: 0x8b6914, metalness: 0.8, roughness: 0.2 })
  );
  rim.position.set(0, 0.1 * S, 0.015 * S);
  group.add(rim);

  return group;
}

// ── Animation Library (single pre-built GLB) ────────────────────

let _animLibraryCache = null;

/**
 * Load the pre-built animation library GLB.
 * Contains 21 animations with bone names already matching our character skeletons.
 * Built by scripts/build-anim-library.mjs from individual Mixamo animation GLBs.
 */
async function loadAnimationLibrary() {
  if (_animLibraryCache) return _animLibraryCache;
  
  const gltf = await new Promise((resolve, reject) => {
    gltfLoader.load('/models/animation-library.glb', resolve, undefined, reject);
  });
  
  // Index animations by name
  const clips = new Map();
  for (const clip of gltf.animations) {
    clips.set(clip.name, clip);
  }
  
  console.log(`[modelLoader] Animation library loaded: ${clips.size} clips [${[...clips.keys()].join(', ')}]`);
  _animLibraryCache = clips;
  return clips;
}

// ── High-level: create a fully animated arena unit ─────────────────────

/**
 * Load a race model + animation library + weapon mesh, return ready-to-use unit.
 * @param {string} race - 'human', 'barbarian', etc.
 * @param {string} weaponType - 'greatsword', 'bow', etc.
 * @param {Object} [opts] - { tier: 1-8 }
 * @returns {{ scene, mixer, controller: AnimationController, raceConfig }}
 */
export async function createAnimatedUnit(race, weaponType, opts = {}) {
  const raceConfig = getRaceConfig(race);
  const factionColors = getRaceFactionColors(race);
  const tier = opts.tier || 1;
  const tierCfg = TierConfig[tier] || TierConfig[1];

  // Validate weapon against race restrictions (fall back to default)
  const resolvedWeapon = resolveWeapon(race, weaponType);
  if (resolvedWeapon !== weaponType) {
    console.warn(`[modelLoader] ${raceConfig.name} can't use ${weaponType}, using ${resolvedWeapon}`);
  }

  // Load character model and animation library in parallel
  const [{ scene, mixer, actions: embeddedActions }, animClips] = await Promise.all([
    loadRaceModel(race),
    loadAnimationLibrary(),
  ]);
  
  const controller = new AnimationController(mixer, scene);

  // Register embedded animations from the character GLB (Running, Walking)
  controller.registerActions(embeddedActions);

  // Resolve the weapon's animation class so we can expose its clips under
  // bare names (e.g. 'greatsword__attack1' → also 'attack1'). This is what
  // lets CharacterFSM / arenaAI / game.js call play('attack1'), play('hurt'),
  // play('dodge'), etc. without knowing the weapon class.
  const animClass = WeaponToAnimClass[resolvedWeapon] || 'greatsword';
  const prefix = `${animClass}__`;

  // Register all animations from the pre-built library. For clips matching
  // this unit's weapon class, also register under the bare state name so
  // calls like play('attack1') resolve to greatsword__attack1.
  let bareRegistered = 0;
  for (const [name, clip] of animClips) {
    const clonedClip = clip.clone();
    clonedClip.name = name;
    const action = mixer.clipAction(clonedClip, scene);
    controller.actions.set(name, action);
    if (name.startsWith(prefix)) {
      const bare = name.slice(prefix.length);
      if (!controller.actions.has(bare)) {
        controller.actions.set(bare, action);
        bareRegistered++;
      }
    }
  }

  // Aliases the FSM / AI commonly use that map to slightly differently-named
  // clips inside the library. Only set if the alias isn't already bound.
  const CLIP_ALIASES = {
    death: ['dead', 'deadBack', 'hurt'],     // FSM 'playDead' uses 'death'
    hit:   ['hurt', 'stun'],                  // FSM 'playHit' uses 'hit'
    dodge: ['roll', 'dodgeBack'],             // ArenaController/FSM 'playDash' uses 'dodge'/'roll'
    heavy: ['swing', 'attack3', 'attack2'],   // FSM 'playHeavy'
    fall:  ['fallLoop', 'jump'],              // FSM 'playFall'
    land:  ['jumpLand', 'idle'],
  };
  for (const [alias, candidates] of Object.entries(CLIP_ALIASES)) {
    if (controller.actions.has(alias)) continue;
    for (const c of candidates) {
      const act = controller.actions.get(c);
      if (act) { controller.actions.set(alias, act); break; }
    }
  }

  console.log(`[modelLoader] ${raceConfig.name} (${raceConfig.faction}) unit ready: ${controller.actions.size} anims (${bareRegistered} bare-aliased from '${animClass}'), weapon: ${resolvedWeapon}, tier: ${tierCfg.name}`);

  // Create and attach weapon mesh with race faction tint + tier glow
  const weapon = createWeaponMesh(resolvedWeapon);
  tintWeaponMesh(weapon, raceConfig.gearTint, factionColors.emissive, tierCfg);
  attachWeaponToBone(scene, weapon, 'RightHand');

  // Attach shield to LeftHand for sword+shield weapons
  const shieldWeapons = ['sabres', 'runeblade'];
  if (shieldWeapons.includes(resolvedWeapon)) {
    const shield = createShieldMesh();
    tintWeaponMesh(shield, raceConfig.gearTint, factionColors.emissive, tierCfg);
    shield.rotation.set(-Math.PI / 2, 0, Math.PI);
    attachWeaponToBone(scene, shield, 'LeftHand');
  }

  // Start idle animation
  controller.play('idle');

  return { scene, mixer, controller, raceConfig, resolvedWeapon, tier };
}

/**
 * Apply race faction tint and tier glow to a procedural weapon/shield mesh.
 * Traverses all MeshStandardMaterial children, blending the faction color
 * into metallic/guard pieces and adding tier-based emissive glow.
 */
function tintWeaponMesh(group, raceTint, factionEmissive, tierCfg) {
  const tintColor = new THREE.Color(raceTint);
  const emissiveColor = new THREE.Color(tierCfg.emissive || factionEmissive);

  group.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const mat = child.material;
    if (!mat.isMeshStandardMaterial) return;

    // Metallic parts (guards, bosses, rims) get the faction tint
    if (mat.metalness > 0.5) {
      mat.color.lerp(tintColor, 0.4);
    }

    // Add tier emissive glow to all parts
    if (tierCfg.emissiveIntensity > 0) {
      mat.emissive.copy(emissiveColor);
      mat.emissiveIntensity = Math.max(mat.emissiveIntensity, tierCfg.emissiveIntensity);
    }
  });
}
