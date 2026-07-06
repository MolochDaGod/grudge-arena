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
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { getRaceConfig, getRaceFactionColors, resolveWeapon, TierConfig } from './engine/RaceConfig.js';
import { EquipmentManager, isD1ModularScene } from "./EquipmentManager.js";
import { assetUrl, charUrl, animUrl, audioUrl, modelUrl, grudge6AssetUrl, grudge6AnimUrl } from "./assetConfig.js";
import {
  CharacterLoadError,
  raceModelFallbackPaths,
  raceTextureFallbackPaths,
  isValidRace,
  auditCharacterMaterials,
  textureHealth,
  formatCharacterLoadError,
} from "./characterResources.js";
import { getD1LoadoutForRace } from "./d1LoadoutStore.js";
import { preloadGrudge6Anims } from './Grudge6AnimLoader.js';
import {
  loadBakedPackClips,
  validateBakedLocoClips,
  BakedAnimLoadError,
} from "./bakedAnimLoader.js";
import { createBakedController } from './BakedAnimationController.js';

// ── Config from WeaponAnimationConfig.js ────────────────────────────────────

/**
 * Race scale multipliers — applied ON TOP of the GLB's native scale.
 * All 6 race GLBs have root scale 0.01 (centimeter units).
 * These multipliers adjust relative size differences between races.
 */
// All 6 race GLBs have been pre-scaled to 1.75 m by build-character-library.mjs.
// Do NOT apply additional multipliers — just use 1.0 for every race.
export const RaceScaleConfig = {
  human: { scale: 1.0, heightOffset: 0 },
  barbarian: { scale: 1.0, heightOffset: 0 },
  elf: { scale: 1.0, heightOffset: 0 },
  dwarf: { scale: 1.0, heightOffset: 0 },
  orc: { scale: 1.0, heightOffset: 0 },
  undead: { scale: 1.0, heightOffset: 0 },
};

export const WeaponToAnimPack = {
  greatsword: "axe",
  bow: "longbow",
  sabres: "sword_shield",
  scythe: "axe",
  runeblade: "sword_shield",
  staff: "magic",
  wand: "magic",
  mace: "axe",
  rifle: "rifle",
  unarmed: "axe",
};

/**
 * Secondary animation packs from the Unity / 3dmotion Grudge-Studio game.
 * All FBX files were Mixamo-exported — same retargeting pipeline as the primary packs.
 * These are loaded as supplemental clips after the primary pack succeeds.
 * Keys map to subdirectory names under public/assets/animations/
 */
export const WeaponToAnimPack3dm = {
  greatsword: "axe_3dm",
  scythe:     "axe_3dm",
  unarmed:    "axe_3dm",
  sabres:     "sword_shield_3dm",
  runeblade:  "sword_shield_3dm",
  staff:      "magic_3dm",
  wand:       "magic_3dm",
  bow:        "longbow_3dm",
};

/**
 * Map weapon type → animation class key used by the pre-built animation library
 * (see scripts/build-anim-library.mjs). Clips inside animation-library.glb are
 * keyed as `${animClass}__${state}` e.g. 'greatsword__attack1', 'swordShield__cast'.
 */
export const WeaponToAnimClass = {
  greatsword: "greatsword",
  scythe: "greatsword",
  sabres: "swordShield",
  runeblade: "swordShield",
  staff: "magic",
  wand: "magic",
  mace: "greatsword",
  bow: "longbow",
  rifle: "rifle",
  unarmed: "greatsword",
};

/** Animation state loop config — true = loops, false = plays once */
export const CORE_ANIMS = {
  // Locomotion (loop)
  idle: { loop: true },
  idle2: { loop: true },
  idle3: { loop: true },
  run: { loop: true },
  runBack: { loop: true },
  runLeft: { loop: true },
  runRight: { loop: true },
  walk: { loop: true },
  walkBack: { loop: true },
  walkLeft: { loop: true },
  walkRight: { loop: true },
  strafeLeft: { loop: true },
  strafeRight: { loop: true },
  sprint: { loop: true },
  crouch: { loop: true },
  crouchIdle: { loop: true },
  crouchWalk: { loop: true },
  crouchWalkBack: { loop: true },
  aimIdle: { loop: true },
  aimWalkFwd: { loop: true },
  fallLoop: { loop: true },
  jumpLoop: { loop: true },
  blockIdle: { loop: true },
  crouchBlockIdle: { loop: true },
  // One-shot
  attack1: { loop: false },
  attack2: { loop: false },
  attack3: { loop: false },
  attack4: { loop: false },
  slash1: { loop: false },
  slash2: { loop: false },
  slash3: { loop: false },
  slash4: { loop: false },
  slash5: { loop: false },
  combo1: { loop: false },
  combo2: { loop: false },
  combo3: { loop: false },
  spin: { loop: false },
  spinLow: { loop: false },
  kick: { loop: false },
  kick2: { loop: false },
  punch: { loop: false },
  jumpAttack: { loop: false },
  cast: { loop: false },
  cast2: { loop: false },
  cast2H: { loop: false },
  aoe: { loop: false },
  aoe2: { loop: false },
  powerUp: { loop: false },
  attack2H1: { loop: false },
  attack2H2: { loop: false },
  attack2H3: { loop: false },
  attack2H4: { loop: false },
  attack2H5: { loop: false },
  block: { loop: false },
  block2: { loop: false },
  blockHit: { loop: false },
  blockEnd: { loop: false },
  crouchBlock: { loop: false },
  dodge: { loop: false },
  dodgeBack: { loop: false },
  dodgeLeft: { loop: false },
  dodgeRight: { loop: false },
  dive: { loop: false },
  hit: { loop: false },
  hit2: { loop: false },
  hit3: { loop: false },
  hitBack: { loop: false },
  hitLeft: { loop: false },
  hitRight: { loop: false },
  hitGut: { loop: false },
  hitHead: { loop: false },
  hitSmall: { loop: false },
  death: { loop: false },
  death2: { loop: false },
  deathBack: { loop: false },
  deathLeft: { loop: false },
  deathRight: { loop: false },
  jump: { loop: false },
  jumpRun: { loop: false },
  jumpLand: { loop: false },
  fallLand: { loop: false },
  runStop: { loop: false },
  land: { loop: false },
  crouchStand: { loop: false },
  draw: { loop: false },
  draw2: { loop: false },
  sheath: { loop: false },
  disarm: { loop: false },
  equip: { loop: false },
  taunt: { loop: false },
  taunt2: { loop: false },
  turnLeft: { loop: false },
  turnRight: { loop: false },
};

/** Full animation maps — all available GLBs per weapon pack */
const ANIM_FILE_MAP = {
  axe: {
    // Locomotion
    idle: "standing idle.glb",
    idle2: "standing idle looking ver. 1.glb",
    idle3: "standing idle looking ver. 2.glb",
    run: "standing run forward.glb",
    runBack: "standing run back.glb",
    walk: "standing walk forward.glb",
    walkBack: "standing walk back.glb",
    walkLeft: "standing walk left.glb",
    walkRight: "standing walk right.glb",
    jump: "standing jump.glb",
    jumpAttack: "standing melee run jump attack.glb",
    // Attacks
    attack1: "standing melee attack horizontal.glb",
    attack2: "standing melee attack downward.glb",
    attack3: "standing melee attack backhand.glb",
    combo1: "standing melee combo attack ver. 1.glb",
    combo2: "standing melee combo attack ver. 2.glb",
    combo3: "standing melee combo attack ver. 3.glb",
    spin: "standing melee attack 360 high.glb",
    spinLow: "standing melee attack 360 low.glb",
    kick: "standing melee attack kick ver. 1.glb",
    kick2: "standing melee attack kick ver. 2.glb",
    // Defense
    block: "standing block idle.glb",
    blockHit: "standing block react large.glb",
    crouch: "crouch idle.glb",
    crouchStand: "crouch to standing idle.glb",
    // Reactions
    hit: "standing react large from left.glb",
    hitRight: "standing react large from right.glb",
    hitGut: "standing react large gut.glb",
    // Utility
    taunt: "standing taunt battlecry.glb",
    taunt2: "standing taunt chest thump.glb",
    equip: "unarmed equip over shoulder.glb",
    disarm: "standing disarm over shoulder.glb",
    turnLeft: "standing turn left 90.glb",
    turnRight: "standing turn right 90.glb",
  },
  sword_shield: {
    // Locomotion
    idle: "sword and shield idle.glb",
    idle2: "sword and shield idle (2).glb",
    idle3: "sword and shield idle (3).glb",
    run: "sword and shield run.glb",
    runBack: "sword and shield run (2).glb",
    walk: "sword and shield walk.glb",
    walkBack: "sword and shield walk (2).glb",
    strafeLeft: "sword and shield strafe.glb",
    strafeRight: "sword and shield strafe (2).glb",
    jump: "sword and shield jump.glb",
    crouch: "sword and shield crouch.glb",
    crouchIdle: "sword and shield crouch idle.glb",
    // Attacks
    attack1: "sword and shield attack.glb",
    attack2: "sword and shield attack (2).glb",
    attack3: "sword and shield attack (3).glb",
    attack4: "sword and shield attack (4).glb",
    slash1: "sword and shield slash.glb",
    slash2: "sword and shield slash (2).glb",
    slash3: "sword and shield slash (3).glb",
    slash4: "sword and shield slash (4).glb",
    slash5: "sword and shield slash (5).glb",
    kick: "sword and shield kick.glb",
    cast: "sword and shield casting.glb",
    cast2: "sword and shield casting (2).glb",
    powerUp: "sword and shield power up.glb",
    // Defense
    block: "sword and shield block.glb",
    block2: "sword and shield block (2).glb",
    blockIdle: "sword and shield block idle.glb",
    crouchBlock: "sword and shield crouch block.glb",
    crouchBlockIdle: "sword and shield crouch block idle.glb",
    // Reactions
    hit: "sword and shield impact.glb",
    hit2: "sword and shield impact (2).glb",
    hit3: "sword and shield impact (3).glb",
    death: "sword and shield death.glb",
    death2: "sword and shield death (2).glb",
    // Utility
    draw: "draw sword 1.glb",
    draw2: "draw sword 2.glb",
    sheath: "sheath sword 1.glb",
    turnLeft: "sword and shield turn.glb",
    turnRight: "sword and shield turn (2).glb",
  },
  longbow: {
    // Locomotion
    idle: "standing idle 01.glb",
    idle2: "standing idle 02 looking.glb",
    idle3: "standing idle 03 examine.glb",
    run: "standing run forward.glb",
    runBack: "standing run back.glb",
    runLeft: "standing run left.glb",
    runRight: "standing run right.glb",
    runStop: "standing run forward stop.glb",
    walk: "standing walk forward.glb",
    walkBack: "standing walk back.glb",
    walkLeft: "standing walk left.glb",
    walkRight: "standing walk right.glb",
    aimWalkFwd: "standing aim walk forward.glb",
    aimWalkBack: "standing aim walk back.glb",
    aimWalkLeft: "standing aim walk left.glb",
    aimWalkRight: "standing aim walk right.glb",
    fallLoop: "fall a loop.glb",
    fallLand: "fall a land to standing idle 01.glb",
    // Attacks
    attack1: "standing draw arrow.glb",
    attack2: "standing aim recoil.glb",
    attack3: "standing aim overdraw.glb",
    kick: "standing melee kick.glb",
    punch: "standing melee punch.glb",
    // Defense
    block: "standing block.glb",
    dodge: "standing dodge forward.glb",
    dodgeBack: "standing dodge backward.glb",
    dodgeLeft: "standing dodge left.glb",
    dodgeRight: "standing dodge right.glb",
    dive: "standing dive forward.glb",
    // Reactions
    hit: "standing react small from front.glb",
    hitHead: "standing react small from headshot.glb",
    death: "standing death forward 01.glb",
    deathBack: "standing death backward 01.glb",
    // Utility
    draw: "standing equip bow.glb",
    disarm: "standing disarm bow.glb",
    turnLeft: "standing turn 90 left.glb",
    turnRight: "standing turn 90 right.glb",
  },
  magic: {
    // Locomotion
    idle: "standing idle.glb",
    idle2: "standing idle 02.glb",
    idle3: "Standing Idle 03.glb",
    run: "Standing Run Forward.glb",
    runBack: "Standing Run Back.glb",
    runLeft: "Standing Run Left.glb",
    runRight: "Standing Run Right.glb",
    walk: "Standing Walk Forward.glb",
    walkBack: "Standing Walk Back.glb",
    walkLeft: "Standing Walk Left.glb",
    walkRight: "Standing Walk Right.glb",
    sprint: "Standing Sprint Forward.glb",
    jump: "Standing Jump.glb",
    jumpRun: "Standing Jump Running.glb",
    land: "Standing Land To Standing Idle.glb",
    crouch: "Crouch Idle.glb",
    crouchWalk: "Crouch Walk Forward.glb",
    crouchWalkBack: "Crouch Walk Back.glb",
    // Attacks
    attack1: "Standing 1H Magic Attack 01.glb",
    attack2: "Standing 1H Magic Attack 02.glb",
    attack3: "Standing 1H Magic Attack 03.glb",
    attack2H1: "Standing 2H Magic Attack 01.glb",
    attack2H2: "Standing 2H Magic Attack 02.glb",
    attack2H3: "Standing 2H Magic Attack 03.glb",
    attack2H4: "Standing 2H Magic Attack 04.glb",
    attack2H5: "Standing 2H Magic Attack 05.glb",
    cast: "standing 1H cast spell 01.glb",
    cast2H: "Standing 2H Cast Spell 01.glb",
    aoe: "Standing 2H Magic Area Attack 01.glb",
    aoe2: "Standing 2H Magic Area Attack 02.glb",
    // Defense
    block: "Standing Block Start.glb",
    blockIdle: "Standing Block Idle.glb",
    blockEnd: "Standing Block End.glb",
    blockHit: "Standing Block React Large.glb",
    // Reactions
    hit: "Standing React Large From Front.glb",
    hitBack: "Standing React Large From Back.glb",
    hitLeft: "Standing React Large From Left.glb",
    hitRight: "Standing React Large From Right.glb",
    hitSmall: "Standing React Small From Front.glb",
    death: "Standing React Death Forward.glb",
    deathBack: "Standing React Death Backward.glb",
    deathLeft: "Standing React Death Left.glb",
    deathRight: "Standing React Death Right.glb",
    // Utility
    turnLeft: "Standing Turn Left 90.glb",
    turnRight: "Standing Turn Right 90.glb",
  },
  // ── Unity 3dmotion supplemental packs ────────────────────────────────────
  // Converted from Mixamo FBX via fbx2gltf. Same Bip001 retargeting applies.
  // Used as secondary animation layer (unique combo attacks not in primary packs).
  axe_3dm: {
    idle:         "melee idle.glb",
    run:          "melee run.glb",
    runBack:      "melee run back.glb",
    walk:         "melee walk.glb",
    walkBack:     "melee walk back.glb",
    strafeLeft:   "melee strafe left.glb",
    strafeRight:  "melee strafe right.glb",
    attack1:      "melee attack 1.glb",
    attack2:      "melee attack 2.glb",
    attack3:      "melee attack 3.glb",
    combo1:       "melee combo 1.glb",
    combo2:       "melee combo 2.glb",
    combo3:       "melee combo 3.glb",
    block:        "melee block.glb",
    jump:         "melee jump.glb",
    crouch:       "melee crouch.glb",
  },
  sword_shield_3dm: {
    idle:         "ss idle.glb",
    run:          "ss run.glb",
    runBack:      "ss run back.glb",
    strafeLeft:   "ss strafe left.glb",
    strafeRight:  "ss strafe right.glb",
    attack1:      "ss attack 1.glb",
    attack2:      "ss attack 2.glb",
    attack3:      "ss attack 3.glb",
    attack4:      "ss attack 4.glb",
    block:        "ss block.glb",
    blockIdle:    "ss block idle.glb",
    blockHit:     "ss block hit.glb",
    draw:         "ss draw sword.glb",
  },
  magic_3dm: {
    idle:         "staff idle.glb",
    idle2:        "staff idle 2.glb",
    run:          "staff run.glb",
    runBack:      "staff run back.glb",
    walk:         "staff walk.glb",
    walkBack:     "staff walk back.glb",
    cast:         "staff cast 1.glb",
    cast2H:       "staff cast 2.glb",
    hit:          "staff hit large.glb",
    hitSmall:     "staff hit small.glb",
    death:        "staff death.glb",
    jump:         "staff jump.glb",
  },
  longbow_3dm: {
    idle:         "bow idle.glb",
    run:          "bow run.glb",
    runBack:      "bow run back.glb",
    walk:         "bow walk.glb",
    walkBack:     "bow walk back.glb",
    strafeLeft:   "bow strafe left.glb",
    strafeRight:  "bow strafe right.glb",
    aimIdle:      "bow aim.glb",
    aimWalkFwd:   "bow aim walk fwd.glb",
    aimWalkBack:  "bow aim walk bwd.glb",
    draw:         "bow draw.glb",
    attack1:      "bow fire.glb",
    block:        "bow block.glb",
    jump:         "bow jump.glb",
  },

  rifle: {
    // Locomotion
    idle: "idle.glb",
    aimIdle: "idle aiming.glb",
    run: "run forward.glb",
    runBack: "run backward.glb",
    runLeft: "run left.glb",
    runRight: "run right.glb",
    walk: "walk forward.glb",
    walkBack: "walk backward.glb",
    walkLeft: "walk left.glb",
    walkRight: "walk right.glb",
    sprint: "sprint forward.glb",
    sprintLeft: "sprint left.glb",
    sprintRight: "sprint right.glb",
    jump: "jump up.glb",
    jumpLoop: "jump loop.glb",
    jumpLand: "jump down.glb",
    crouch: "idle crouching.glb",
    crouchAim: "idle crouching aiming.glb",
    crouchWalk: "walk crouching forward.glb",
    crouchWalkBack: "walk crouching backward.glb",
    // Attacks
    attack1: "idle aiming.glb",
    // Reactions
    hit: "death from front headshot.glb",
    hitBack: "death from back headshot.glb",
    death: "death from the front.glb",
    deathBack: "death from the back.glb",
    deathRight: "death from right.glb",
    deathCrouch: "death crouching headshot front.glb",
    // Utility
    turnLeft: "turn 90 left.glb",
    turnRight: "turn 90 right.glb",
  },
};

/** Audio SFX paths per weapon type — routed through assetConfig for R2 in prod */
export const WEAPON_SFX = {
  greatsword: {
    attack: [
      audioUrl("sfx/sword/swing_1.mp3"),
      audioUrl("sfx/sword/swing_2.mp3"),
      audioUrl("sfx/sword/swing_3.mp3"),
    ],
    skill: [
      audioUrl("sfx/sword/charge.mp3"),
      audioUrl("sfx/sword/colossus_strike.mp3"),
      audioUrl("sfx/sword/windshear.mp3"),
    ],
    block: [audioUrl("sfx/sword/deflect.mp3")],
  },
  scythe: {
    attack: [audioUrl("sfx/scythe/entropic_bolts.mp3")],
    skill: [
      audioUrl("sfx/scythe/cryoflame.mp3"),
      audioUrl("sfx/scythe/crossentropy.mp3"),
      audioUrl("sfx/scythe/frost_nova.mp3"),
      audioUrl("sfx/scythe/sunwell.mp3"),
    ],
  },
  sabres: {
    attack: [audioUrl("sfx/sabres/sabres_swing.mp3")],
    skill: [
      audioUrl("sfx/sabres/backstab.mp3"),
      audioUrl("sfx/sabres/flourish.mp3"),
      audioUrl("sfx/sabres/shadow_step.mp3"),
      audioUrl("sfx/sabres/skyfall.mp3"),
    ],
  },
  runeblade: {
    attack: [audioUrl("sfx/runeblade/smite.mp3")],
    skill: [
      audioUrl("sfx/runeblade/heartrend.mp3"),
      audioUrl("sfx/runeblade/wraithblade.mp3"),
      audioUrl("sfx/runeblade/void_grasp.mp3"),
    ],
  },
  bow: {
    attack: [audioUrl("sfx/bow/draw.mp3"), audioUrl("sfx/bow/release.mp3")],
    skill: [
      audioUrl("sfx/bow/cobra_shot_release.mp3"),
      audioUrl("sfx/bow/viper_sting_release.mp3"),
      audioUrl("sfx/bow/barrage_release.mp3"),
      audioUrl("sfx/bow/cloudkill_release.mp3"),
    ],
  },
  staff: {
    attack: [audioUrl("sfx/scythe/entropic_bolts.mp3")],
    skill: [audioUrl("sfx/scythe/mantra.mp3"), audioUrl("sfx/scythe/cryoflame.mp3")],
  },
  wand: {
    attack: [audioUrl("sfx/scythe/entropic_bolts.mp3")],
    skill: [audioUrl("sfx/scythe/mantra.mp3")],
  },
  mace: {
    attack: [
      audioUrl("sfx/sword/swing_1.mp3"),
      audioUrl("sfx/sword/swing_2.mp3"),
    ],
    skill: [
      audioUrl("sfx/sword/colossus_strike.mp3"),
      audioUrl("sfx/sword/charge.mp3"),
      audioUrl("sfx/sword/windshear.mp3"),
    ],
  },
  // UI sounds
  ui: {
    select: audioUrl("sfx/ui/selection.mp3"),
    dash: audioUrl("sfx/ui/dash.mp3"),
    countdown: audioUrl("sfx/ui/interface.mp3"),
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
  "mixamorig10:",
  "mixamorig9:",
  "mixamorig8:",
  "mixamorig7:",
  "mixamorig6:",
  "mixamorig5:",
  "mixamorig4:",
  "mixamorig3:",
  "mixamorig2:",
  "mixamorig1:",
  "mixamorig:",
];

/**
 * Remap Mixamo bare bone names → Synty Bip001 bone names.
 * After stripping the "mixamorig:" prefix we get e.g. "Hips", "Spine", "LeftArm".
 * These need to map to the Bip001 convention used by all 6 race GLBs.
 */
/** CDN D1 GLBs use Bip001_* underscores (GLTFLoader sanitizes bone node names). */
const BONE_ALIASES = {
  Hips: "Bip001_Pelvis",
  Spine: "Bip001_Spine",
  Spine1: "Bip001_Spine",
  Spine2: "Bip001_Spine1",
  Neck: "Bip001_Neck",
  Head: "Bip001_Head",
  HeadTop_End: "Bip001_Head",
  LeftShoulder: "Bip001_L_Clavicle",
  LeftArm: "Bip001_L_UpperArm",
  LeftForeArm: "Bip001_L_Forearm",
  LeftHand: "Bip001_L_Hand",
  RightShoulder: "Bip001_R_Clavicle",
  RightArm: "Bip001_R_UpperArm",
  RightForeArm: "Bip001_R_Forearm",
  RightHand: "Bip001_R_Hand",
  LeftUpLeg: "Bip001_L_Thigh",
  LeftLeg: "Bip001_L_Calf",
  LeftFoot: "Bip001_L_Foot",
  LeftToeBase: "Bip001_L_Toe0",
  RightUpLeg: "Bip001_R_Thigh",
  RightLeg: "Bip001_R_Calf",
  RightFoot: "Bip001_R_Foot",
  RightToeBase: "Bip001_R_Toe0",
  Reye: null,
  Leye: null,
};

/**
 * Bones that exist on the Synty/Bip001 character skeleton.
 * Tracks targeting anything else get stripped.
 */
const VALID_BONES = new Set([
  "Bip001",
  "Bip001_Pelvis",
  "Bip001_Spine",
  "Bip001_Spine1",
  "Bip001_Neck",
  "Bip001_Head",
  "Bip001_L_Clavicle",
  "Bip001_L_UpperArm",
  "Bip001_L_Forearm",
  "Bip001_L_Hand",
  "Bip001_R_Clavicle",
  "Bip001_R_UpperArm",
  "Bip001_R_Forearm",
  "Bip001_R_Hand",
  "Bip001_L_Thigh",
  "Bip001_L_Calf",
  "Bip001_L_Foot",
  "Bip001_L_Toe0",
  "Bip001_R_Thigh",
  "Bip001_R_Calf",
  "Bip001_R_Foot",
  "Bip001_R_Toe0",
  "Armature",
]);

function stripMixamoPrefix(name) {
  for (const prefix of MIXAMO_PREFIXES) {
    if (name.startsWith(prefix)) return name.slice(prefix.length);
  }
  // GLTFLoader sanitizes "mixamorig:Hips" → track node name "mixamorigHips"
  if (name.startsWith("mixamorig")) return name.slice("mixamorig".length);
  return name;
}

/**
 * Remap all track names in an AnimationClip to match our character skeletons.
 * Track format: "boneName.property" (e.g. "mixamorig:Hips.position")
 * Steps: 1) strip mixamorig prefix  2) apply bone alias map
 */
function remapClipBoneNames(clip) {
  for (const track of clip.tracks) {
    const dotIdx = track.name.indexOf(".");
    if (dotIdx === -1) continue;
    const bone = track.name.substring(0, dotIdx);
    const prop = track.name.substring(dotIdx);

    // Step 1: strip mixamorig: prefix
    let remapped = stripMixamoPrefix(bone);

    // Step 2: apply alias map (Mixamo bare name → Bip001 name)
    if (remapped in BONE_ALIASES) {
      const mapped = BONE_ALIASES[remapped];
      if (mapped === null) {
        // Mark track for removal (no matching bone on target skeleton)
        track.name = "__REMOVE__" + prop;
        continue;
      }
      remapped = mapped;
    }

    if (remapped !== bone) {
      track.name = remapped + prop;
    }
  }
  // Remove tracks that were flagged for deletion (null-mapped bones)
  clip.tracks = clip.tracks.filter((t) => !t.name.startsWith("__REMOVE__"));
  return toRotationOnlyClip(clip);
}

/**
 * Strip position/scale tracks — rotation-only clips retarget across races
 * without double-scaling root motion (see grudge-asset-pipeline / character-kit).
 */
function toRotationOnlyClip(clip) {
  clip.tracks = clip.tracks.filter((track) => {
    const dot = track.name.indexOf(".");
    if (dot === -1) return true;
    const prop = track.name.substring(dot + 1);
    return prop === "quaternion" || prop === "rotation";
  });
  return clip;
}

// ── Caches ────────────────────────────────────────────────────────────────

const gltfCache = new Map();
const fbxCache = new Map();
const clipCache = new Map();
const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin("anonymous");

/** Canvas-decode atlas PNG/WebP → DataTexture (matches character-viewer textureLoader.ts). */
function dataTextureFromImage(img, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const tex = new THREE.DataTexture(
    new Uint8Array(data.buffer.slice(0)),
    width,
    height,
    THREE.RGBAFormat,
  );
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function loadAtlasTexture(url) {
  return new Promise((resolve) => {
    if (/\.tga$/i.test(url)) {
      textureLoader.load(url, resolve, undefined, () => resolve(null));
      return;
    }
    const imgLoader = new THREE.ImageLoader();
    imgLoader.setCrossOrigin("anonymous");
    imgLoader.load(
      url,
      (img) => {
        try {
          resolve(
            dataTextureFromImage(img, img.naturalWidth, img.naturalHeight),
          );
        } catch {
          resolve(null);
        }
      },
      undefined,
      () => resolve(null),
    );
  });
}

let _characterManifestPromise = null;
let _humanBasemeshAnimPromise = null;
const _raceTextureCache = new Map();

const HUMAN_BASEMESH_ANIM_SOURCE = charUrl(
  "human_basemesh/HumanBaseMesh_WithEquips.glb",
);

async function loadCharacterManifest() {
  if (_characterManifestPromise) return _characterManifestPromise;
  _characterManifestPromise = fetch(modelUrl("characterManifest.json"))
    .then((r) => {
      if (!r.ok) throw new Error(`manifest http ${r.status}`);
      return r.json();
    })
    .catch((err) => {
      console.warn("[modelLoader] characterManifest unavailable:", err.message);
      return null;
    });
  return _characterManifestPromise;
}

/** Synty D1 GLBs ship MeshBasicMaterial (KHR_materials_unlit) — must patch these too. */
function forEachTintableMaterial(scene, fn) {
  scene.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat?.color) continue;
      fn(mat, child);
    }
  });
}

async function loadRaceTextureMap(race) {
  if (_raceTextureCache.has(race)) return _raceTextureCache.get(race);

  // Try manifest path first, then direct fallback path
  const manifest = await loadCharacterManifest();
  const rawManifestPath = manifest?.races?.[race]?.textures?.[0]?.file;
  // Manifest stores /assets/... — route through assetUrl so prod uses /cdn proxy.
  const manifestPath = rawManifestPath
    ? assetUrl(rawManifestPath.replace(/^\//, ""))
    : null;
  const directPaths = raceTextureFallbackPaths(race);
  const paths = [...directPaths, manifestPath].filter(Boolean);

  const texFailures = [];
  for (const texPath of paths) {
    const tex = await loadAtlasTexture(texPath);
    if (tex) {
      _raceTextureCache.set(race, tex);
      console.log(`[modelLoader] ${race}: texture atlas loaded from ${texPath}`);
      return tex;
    }
    texFailures.push(texPath);
  }

  console.warn(
    `[modelLoader] ${race}: no texture atlas found (tried ${texFailures.length} paths)`,
    texFailures,
  );
  _raceTextureCache.set(race, null);
  return null;
}

function patchMaterialAtlas(mat, atlas) {
  mat.map = atlas;
  mat.color.set(0xffffff);
  if (mat.emissive?.set) mat.emissive.set(0x000000);
  if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 0;
  // Unlit Synty mats must bypass ACES tone-mapping or the atlas reads black/washed.
  if (mat.isMeshBasicMaterial) {
    mat.toneMapped = false;
  }
  if (mat.metalness !== undefined) mat.metalness = Math.min(mat.metalness, 0.3);
  if (mat.roughness !== undefined) mat.roughness = Math.max(mat.roughness, 0.5);
  mat.needsUpdate = true;
}

async function applyRaceTextureFix(scene, race) {
  const atlas = await loadRaceTextureMap(race);
  if (!atlas) return 0;

  let patched = 0;
  forEachTintableMaterial(scene, (mat, child) => {
    if (!child.geometry?.attributes?.uv) return;

    // Force-apply the race atlas to ALL meshes with UVs (incl. MeshBasicMaterial).
    // Synty GLBs embed broken texture refs that render as flat yellow-green.
    patchMaterialAtlas(mat, atlas);
    patched++;
  });

  if (patched > 0) {
    console.log(
      `[modelLoader] ${race}: applied atlas texture to ${patched} material slots`,
    );
  }
  return patched;
}

// ── Faction color override ─────────────────────────────────────────

/**
 * Apply faction-specific body colors directly to character materials.
 * Called AFTER applyRaceTextureFix — if a texture atlas was applied this
 * is a no-op (mat.map is already set). If texture loading failed (404,
 * manifest missing, etc.) this guarantees each race has a distinct,
 * intentional color instead of the raw yellow-green GLB default.
 *
 * Color scheme:
 *   Crusade (Human, Barbarian)  → warm gold / bronze tones
 *   Fabled  (Elf, Dwarf)        → cool blue / silver tones
 *   Legion  (Orc, Undead)       → dark red / purple tones
 */
function applyFactionBodyColor(scene, race) {
  const raceConf     = getRaceConfig(race);
  const factionColors = getRaceFactionColors(race);

  // Body color = faction primary, slightly lightened for visibility
  const bodyColor = new THREE.Color(factionColors.primary).multiplyScalar(1.35);
  // Accent color for secondary parts (collar, belt, etc.)
  const accentColor = new THREE.Color(raceConf.gearTint);

  let patched = 0;
  forEachTintableMaterial(scene, (mat, child) => {
    if (hasValidTextureMap(mat)) return;
    if (mat.map) mat.map = null;

    const lower = (child.name || "").toLowerCase();
    const isMetal =
      (mat.metalness !== undefined && mat.metalness > 0.5) ||
      /weapon|shield|metal|buckl|sword|axe|hammer|bow|staff/.test(lower);

    mat.color.copy(isMetal ? accentColor : bodyColor);
    if (mat.roughness !== undefined) mat.roughness = Math.min(mat.roughness + 0.1, 0.95);
    mat.needsUpdate = true;
    patched++;
  });

  if (patched > 0) {
    console.log(
      `[modelLoader] ${race}: faction color applied to ${patched} material slots (${raceConf.faction})`,
    );
  }
  return patched;
}

async function loadHumanBasemeshAnimations() {
  if (_humanBasemeshAnimPromise) return _humanBasemeshAnimPromise;
  _humanBasemeshAnimPromise = new Promise((resolve) => {
    gltfLoader.load(
      HUMAN_BASEMESH_ANIM_SOURCE,
      (gltf) => resolve(gltf.animations || []),
      undefined,
      () => resolve([]),
    );
  });
  return _humanBasemeshAnimPromise;
}

function getTrackBindingStats(action) {
  const bindings = action?._propertyBindings || [];
  const total = bindings.length;
  let bound = 0;
  for (const binding of bindings) {
    if (binding?.binding?.node) bound++;
  }
  return { total, bound, ratio: total > 0 ? bound / total : 0 };
}

function mapBasemeshClipToState(clipName) {
  const n = (clipName || "").toLowerCase();
  if (n.includes("idle")) return "idle";
  if (n.includes("run")) return "run";
  if (n.includes("walk")) return "walk";
  if (n.includes("jump") && n.includes("land")) return "jumpLand";
  if (n.includes("jump")) return "jump";
  if (n.includes("block")) return "block";
  if (n.includes("death")) return "death";
  if (n.includes("hit") || n.includes("react")) return "hit";
  if (n.includes("attack")) return "attack1";
  return null;
}

async function registerCompatibleBasemeshAnimations(controller, mixer, root) {
  const clips = await loadHumanBasemeshAnimations();
  if (!clips.length) return { imported: 0, skipped: 0 };

  let imported = 0;
  let skipped = 0;

  for (const srcClip of clips) {
    const state = mapBasemeshClipToState(srcClip.name);
    if (!state || controller.actions.has(state)) continue;

    const clip = srcClip.clone();
    remapClipBoneNames(clip);
    clip.tracks = clip.tracks.filter((track) => {
      const dot = track.name.indexOf(".");
      if (dot === -1) return true;
      return VALID_BONES.has(track.name.substring(0, dot));
    });

    const action = mixer.clipAction(clip, root);
    const stats = getTrackBindingStats(action);
    if (stats.total < 8 || stats.ratio < 0.45) {
      skipped++;
      continue;
    }

    controller.actions.set(state, action);
    imported++;
  }

  if (imported > 0 || skipped > 0) {
    console.log(
      `[modelLoader] human_basemesh fallback clips: +${imported} compatible, ${skipped} skipped`,
    );
  }

  return { imported, skipped };
}

async function loadFBX(path) {
  let cached = fbxCache.get(path);
  if (!cached) {
    cached = await new Promise((resolve, reject) => {
      fbxLoader.load(path.replace(/ /g, '%20'), resolve, undefined, reject);
    });
    fbxCache.set(path, cached);
  }
  return { scene: cached, animations: cached.animations || [], path, format: 'fbx' };
}

async function loadModelWithFallback(paths, { race } = {}) {
  const failures = [];
  for (const path of paths) {
    try {
      if (/\.fbx$/i.test(path)) {
        return await loadFBX(path);
      }
      let gltf = gltfCache.get(path);
      if (!gltf) {
        gltf = await new Promise((resolve, reject) => {
          gltfLoader.load(path, resolve, undefined, reject);
        });
        gltfCache.set(path, gltf);
      }
      return { ...gltf, path, format: "glb" };
    } catch (err) {
      const message = err?.message || String(err);
      failures.push({ path, message });
      console.warn(`[modelLoader] skip mesh ${path}: ${message}`);
    }
  }
  throw new CharacterLoadError(
    `No mesh loaded for ${race || "unknown"} (${failures.length} paths tried)`,
    { code: "MODEL_NOT_FOUND", race, paths: failures },
  );
}

/** @deprecated use loadModelWithFallback */
async function loadGLTFWithFallback(paths) {
  const result = await loadModelWithFallback(paths);
  if (result.format === 'fbx') {
    return { gltf: { scene: result.scene, animations: result.animations }, path: result.path };
  }
  return { gltf: result, path: result.path };
}

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

  source.traverse((node) => {
    if (node.isSkinnedMesh) sourceSkins.push(node);
  });
  clone.traverse((node) => {
    if (node.isSkinnedMesh) cloneSkins.push(node);
  });

  for (let i = 0; i < cloneSkins.length; i++) {
    const src = sourceSkins[i];
    const dst = cloneSkins[i];
    if (!src || !dst) continue;

    // Find matching bones in the cloned hierarchy by name
    const newBones = src.skeleton.bones.map((srcBone) => {
      let found = null;
      clone.traverse((node) => {
        if (node.name === srcBone.name && node.isBone) found = node;
      });
      return found || srcBone;
    });

    dst.skeleton = new THREE.Skeleton(
      newBones,
      src.skeleton.boneInverses.map((m) => m.clone()),
    );
    dst.bind(dst.skeleton, dst.matrixWorld);

    // Clone material so we don't mutate the cached original
    if (dst.material) {
      dst.material = Array.isArray(dst.material)
        ? dst.material.map((m) => m.clone())
        : dst.material.clone();
    }
  }

  return clone;
}

/** Body/armor skinned meshes only — D1 GLBs bake every weapon variant in at once. */
function isBodyMeasureMesh(node) {
  if (!node?.isSkinnedMesh) return false;
  const n = (node.name || "").toLowerCase();
  return !/weapon_|_shield_|xtra_|quiver|pick_|wood_/.test(n);
}

function measureBoneHeight(scene) {
  scene.updateMatrixWorld(true);
  let pelvis = null;
  let head = null;
  scene.traverse((node) => {
    if (!node.isBone) return;
    if (node.name === "Bip001_Pelvis" || node.name === "Bip001 Pelvis") pelvis = node;
    if (node.name === "Bip001_Head" || node.name === "Bip001 Head") head = node;
  });
  if (!pelvis || !head) return 0;
  const p = new THREE.Vector3();
  const h = new THREE.Vector3();
  pelvis.getWorldPosition(p);
  head.getWorldPosition(h);
  return Math.abs(h.y - p.y) + 0.25;
}

function measureBodyBoundingBox(scene) {
  const bodyBox = new THREE.Box3();
  let bodyMeshes = 0;
  scene.traverse((node) => {
    if (!isBodyMeasureMesh(node)) return;
    bodyBox.expandByObject(node);
    bodyMeshes++;
  });
  return { bodyBox, bodyMeshes };
}

function measureCharacterHeight(scene) {
  scene.traverse((node) => {
    if (node.isSkinnedMesh) node.normalizeSkinWeights();
  });
  const { bodyBox, bodyMeshes } = measureBodyBoundingBox(scene);
  if (bodyMeshes > 0) {
    const bboxH = bodyBox.getSize(new THREE.Vector3()).y;
    if (bboxH >= 1.0) return bboxH;
    const boneH = measureBoneHeight(scene);
    // Pelvis→head over-estimates on A-pose rigs; only trust a narrow band.
    if (boneH >= 1.2 && boneH <= 2.0) return boneH;
  }
  // CDN race GLBs are authored for ~1.75 m — use when partial bbox (orc/undead).
  return 1.75;
}

/**
 * Normalise a character scene to TARGET_H metres tall using its T-pose
 * bounding box (Y axis only, ignoring arm-span width).
 * Also grounds the scene so its bottom sits at Y=0.
 */
function normalizeCharacterScale(scene, targetH = 1.75) {
  const height = measureCharacterHeight(scene);
  if (height < 0.001) {
    console.warn("[modelLoader] normalizeCharacterScale: could not compute bounding box");
    return;
  }
  const scale = targetH / height;
  scene.scale.setScalar(scale);
  console.log(
    `[modelLoader] normalizeCharacterScale: height=${height.toFixed(3)}m → scale=${scale.toFixed(4)}`,
  );
  scene.updateMatrixWorld(true);
  const { bodyBox, bodyMeshes } = measureBodyBoundingBox(scene);
  const grounded = bodyMeshes > 0 ? bodyBox : new THREE.Box3().setFromObject(scene);
  scene.position.y = -grounded.min.y;
}

/** Reset all skinned meshes to bind pose before applying Mixamo clips. */
function resetSkeletonBindPose(scene) {
  scene.traverse((node) => {
    if (node.isSkinnedMesh && node.skeleton) node.skeleton.pose();
  });
  scene.updateMatrixWorld(true);
}

function hasValidTextureMap(mat) {
  const img = mat?.map?.image;
  if (!img) return false;
  if (img.width > 0 && img.height > 0) return true;
  return !!(img.data && img.data.length > 0);
}

export async function loadRaceModel(race) {
  if (!isValidRace(race)) {
    throw new CharacterLoadError(`Unknown race "${race}"`, {
      code: "INVALID_RACE",
      race,
    });
  }
  const loaded = await loadModelWithFallback(raceModelFallbackPaths(race), { race });
  const isGrudge6Fbx = loaded.format === "fbx";
  const sourceScene = loaded.scene;
  const sourceAnims = loaded.animations || [];

  const scene = cloneGLTFScene(sourceScene);

  // Enable shadows, fix materials
  scene.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false; // Prevent skinned mesh culling glitches
      if (child.material?.metalness !== undefined) {
        child.material.metalness = Math.min(child.material.metalness, 0.6);
      }
    }
  });

  await applyRaceTextureFix(scene, race);
  // Guaranteed color fallback — runs even when texture atlas is unavailable
  applyFactionBodyColor(scene, race);

  // Normalise to 1.75 m using bounding box Y, regardless of GLB export scale.
  // WK/BRB/ELF/DWF/ORC/UD GLBs ship with root scale ~4.26, yielding 7.45 m
  // world-height — this corrects that to the expected humanoid size.
  normalizeCharacterScale(scene, 1.75);

  const mixer = new THREE.AnimationMixer(scene);
  const actions = new Map();

  // Register embedded animations (remap bone names)
  // Clone clips so cached originals aren't mutated
  // Also create aliases: 'Running' → register as both 'running' AND 'run'
  // DO NOT alias 'running' as 'idle' — this causes characters to run while standing.
  // The idle anim is loaded from the weapon animation pack (see ANIM_FILE_MAP).
  // Only alias for locomotion fallback if the clip doesn't exist in the pack.
  const EMBEDDED_ALIASES = {
    running: ["run"], // Running → run only (NOT idle)
    walking: ["walk"],
    idle: [], // Idle comes from weapon anim pack
  };
  for (const clip of sourceAnims) {
    const clonedClip = clip.clone();
    if (!isGrudge6Fbx) remapClipBoneNames(clonedClip);
    const key = clonedClip.name.toLowerCase();
    const action = mixer.clipAction(clonedClip, scene);
    actions.set(key, action);
    const aliases = EMBEDDED_ALIASES[key] || [];
    for (const alias of aliases) {
      if (!actions.has(alias)) actions.set(alias, action);
    }
  }

  console.log(
    `[modelLoader] Loaded ${race} (${isGrudge6Fbx ? 'grudge6-fbx' : 'glb'}) from ${loaded.path} — scale: ${scene.scale.x.toFixed(4)}, embeddedAnims: [${[...actions.keys()].join(", ")}]`,
  );
  return { scene, mixer, actions, clips: sourceAnims, isGrudge6Fbx, modelPath: loaded.path };
}

// ── Load a single FBX animation clip ────────────────────────────────────────

/**
 * Load a standalone animation GLB (extract clip only).
 * All animation files are now GLB (converted from FBX via fbx2gltf).
 * GLTFLoader is used for everything — no FBXLoader needed.
 */
export async function loadAnimClip(filePath) {
  // URL-encode spaces in file paths (Mixamo filenames have spaces)
  const encodedPath = filePath.replace(/ /g, "%20");

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
    clip.tracks = clip.tracks.filter((track) => {
      const dotIdx = track.name.indexOf(".");
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
  const packName = WeaponToAnimPack[weaponType] || "axe";
  const fileMap = ANIM_FILE_MAP[packName];
  if (!fileMap) {
    console.warn(`[modelLoader] No anim pack for weapon: ${weaponType}`);
    return new Map();
  }

  const basePath = animUrl(`${packName}/`);
  const entries = Object.entries(fileMap);
  const results = await Promise.allSettled(
    entries.map(([state, file]) =>
      loadAnimClip(basePath + file).then((clip) => ({ state, clip })),
    ),
  );

  const actions = new Map();
  let boundTracks = 0;
  let totalTracks = 0;
  for (const result of results) {
    if (result.status === "fulfilled" && result.value.clip) {
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

  console.log(
    `[modelLoader] Loaded ${actions.size}/${entries.length} anims for ${weaponType} (${packName}), ${boundTracks}/${totalTracks} tracks bound`,
  );
  return actions;
}

// ── fadeToAction — smooth animation crossfade (annihilate pattern) ───────────

export function fadeToAction(
  currentAction,
  nextAction,
  duration = 0.15,
  loop = true,
  speed = 1,
) {
  nextAction.setLoop(
    loop ? THREE.LoopRepeat : THREE.LoopOnce,
    loop ? Infinity : 1,
  );
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
    this.currentState = "";
    this._onFinish = null;

    this.mixer.addEventListener("finished", () => {
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
      const requestFallbacks = {
        // FSM state names → closest available animation in any weapon pack
        heavy:      ["combo1", "spin", "attack2H1", "attack3", "attack2"],
        dodge:      ["dodgeBack", "dive", "jump"],
        fall:       ["fallLoop", "jumpLoop", "jump", "idle"],
        swing:      ["attack3", "attack2", "attack1"],
        combo3:     ["combo2", "combo1", "attack3"],
        combo2:     ["combo1", "attack3", "attack2"],
        combo1:     ["attack3", "attack2", "attack1"],
        jumpAttack: ["attack1", "combo1", "jump"],
        cast2H:     ["cast", "attack2H1", "attack3", "attack2"],
        aoe2:       ["aoe", "cast", "attack3"],
        powerUp:    ["taunt", "cast", "attack2"],
        dashAttack: ["combo1", "attack3", "attack1"],
        airAttack:  ["jumpAttack", "attack1", "combo1"],
        running:    ["run"],
        walking:    ["walk"],
      };
      for (const fb of requestFallbacks[stateName] || []) {
        action = this.actions.get(fb);
        if (action) {
          stateName = fb;
          break;
        }
      }

      // Fallback chain: requested → idle → running → walking → first available
      const fallbacks = ["idle", "running", "walking", "run"];
      if (!action && stateName !== "idle") {
        for (const fb of fallbacks) {
          action = this.actions.get(fb);
          if (action) {
            stateName = fb;
            break;
          }
        }
      }
      if (!action) {
        // Last resort: play whatever is first in the map
        const first = this.actions.entries().next().value;
        if (first) {
          action = first[1];
          stateName = first[0];
        }
      }
      if (!action) return false;
    }

    if (
      this.currentState === stateName &&
      this.currentAction?.isRunning() &&
      this.actions.get(stateName) === this.currentAction
    ) {
      return true;
    }

    const isLoop =
      opts.loop !== undefined
        ? opts.loop
        : (CORE_ANIMS[stateName]?.loop ?? true);
    const speed = opts.speed ?? 1;
    const fadeDuration = opts.fadeDuration ?? 0.15;

    this._onFinish = opts.onFinish ?? null;
    this.currentAction = fadeToAction(
      this.currentAction,
      action,
      fadeDuration,
      isLoop,
      speed,
    );
    this.currentState = stateName;
    return true;
  }

  /** Play a one-shot then return to idle */
  playOnce(stateName, speed = 1) {
    return this.play(stateName, {
      loop: false,
      speed,
      onFinish: () => this.play("idle"),
    });
  }

  update(dt) {
    this.mixer.update(dt);
  }

  stop() {
    this.mixer.stopAllAction();
    this.currentAction = null;
    this.currentState = "";
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
  group.name = "__weapon";

  // Weapon meshes are in centimeter space (matching the 0.01 root scale).
  // Since they're children of a hand bone inside the scaled armature,
  // we need to build them at ~100x to appear correctly (1 unit = 1cm in bone space).
  const S = 100; // scale factor to compensate for 0.01 root

  switch (weaponType) {
    case "greatsword":
    case "scythe": {
      // Blade
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.06 * S, 1.2 * S, 0.015 * S),
        new THREE.MeshStandardMaterial({
          color: 0xaabbcc,
          metalness: 0.9,
          roughness: 0.2,
        }),
      );
      blade.position.y = 0.8 * S;
      blade.castShadow = true;
      group.add(blade);

      // Edge highlight
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.065 * S, 1.2 * S, 0.003 * S),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xaaddff,
          emissiveIntensity: 0.3,
          metalness: 1,
          roughness: 0.1,
        }),
      );
      edge.position.y = 0.8 * S;
      edge.position.z = 0.008 * S;
      group.add(edge);

      // Guard
      const guard = new THREE.Mesh(
        new THREE.BoxGeometry(0.18 * S, 0.03 * S, 0.04 * S),
        new THREE.MeshStandardMaterial({
          color: 0x8b6914,
          metalness: 0.7,
          roughness: 0.3,
        }),
      );
      guard.position.y = 0.18 * S;
      guard.castShadow = true;
      group.add(guard);

      // Handle
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015 * S, 0.018 * S, 0.25 * S, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 }),
      );
      handle.position.y = 0.05 * S;
      group.add(handle);

      // Pommel
      const pommel = new THREE.Mesh(
        new THREE.SphereGeometry(0.025 * S, 8, 8),
        new THREE.MeshStandardMaterial({
          color: 0x8b6914,
          metalness: 0.8,
          roughness: 0.2,
        }),
      );
      pommel.position.y = -0.08 * S;
      group.add(pommel);
      break;
    }

    case "sabres":
    case "runeblade": {
      // Main sword (shorter, one-handed)
      const sblade = new THREE.Mesh(
        new THREE.BoxGeometry(0.04 * S, 0.7 * S, 0.012 * S),
        new THREE.MeshStandardMaterial({
          color: 0xccddee,
          metalness: 0.9,
          roughness: 0.15,
        }),
      );
      sblade.position.y = 0.5 * S;
      sblade.castShadow = true;
      group.add(sblade);

      // Guard
      const sguard = new THREE.Mesh(
        new THREE.BoxGeometry(0.12 * S, 0.025 * S, 0.035 * S),
        new THREE.MeshStandardMaterial({
          color: 0xc9a84c,
          metalness: 0.8,
          roughness: 0.2,
        }),
      );
      sguard.position.y = 0.15 * S;
      group.add(sguard);

      // Handle
      const shandle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.013 * S, 0.016 * S, 0.18 * S, 8),
        new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.9 }),
      );
      shandle.position.y = 0.05 * S;
      group.add(shandle);

      // Rune glow for runeblade
      if (weaponType === "runeblade") {
        const glow = new THREE.Mesh(
          new THREE.BoxGeometry(0.02 * S, 0.5 * S, 0.02 * S),
          new THREE.MeshStandardMaterial({
            color: 0x4488ff,
            emissive: 0x4488ff,
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 0.6,
          }),
        );
        glow.position.y = 0.5 * S;
        group.add(glow);
      }
      break;
    }

    case "bow": {
      // Bow limb (curved via TorusGeometry)
      const limb = new THREE.Mesh(
        new THREE.TorusGeometry(0.5 * S, 0.015 * S, 8, 16, Math.PI * 0.8),
        new THREE.MeshStandardMaterial({
          color: 0x6b4226,
          roughness: 0.8,
          metalness: 0.1,
        }),
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
        new THREE.LineBasicMaterial({ color: 0xccccaa, linewidth: 2 }),
      );
      group.add(bowstring);

      // Grip
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018 * S, 0.018 * S, 0.12 * S, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.9 }),
      );
      grip.position.y = 0.3 * S;
      group.add(grip);
      break;
    }

    case "staff":
    case "wand": {
      // Shaft
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015 * S, 0.02 * S, 1.4 * S, 8),
        new THREE.MeshStandardMaterial({ color: 0x5c3d2e, roughness: 0.8 }),
      );
      shaft.position.y = 0.5 * S;
      shaft.castShadow = true;
      group.add(shaft);

      // Crystal/orb at top
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.06 * S, 1),
        new THREE.MeshStandardMaterial({
          color: 0x8844ff,
          emissive: 0x8844ff,
          emissiveIntensity: 0.6,
          metalness: 0.3,
          roughness: 0.2,
        }),
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
        new THREE.MeshStandardMaterial({
          color: 0x888888,
          metalness: 0.5,
          roughness: 0.5,
        }),
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
const BONE_NAME_ALIASES = {
  RightHand: "Bip001_R_Hand",
  LeftHand: "Bip001_L_Hand",
  "Bip001 R Hand": "Bip001_R_Hand",
  "Bip001 L Hand": "Bip001_L_Hand",
};

export function attachWeaponToBone(
  characterScene,
  weaponMesh,
  boneName = "Bip001_R_Hand",
) {
  const resolved = BONE_NAME_ALIASES[boneName] || boneName;
  let handBone = null;

  characterScene.traverse((node) => {
    if (node.isBone && (node.name === resolved || node.name === boneName)) {
      handBone = node;
    }
  });

  if (!handBone) {
    console.warn(
      `[modelLoader] Bone '${boneName}' not found, weapon not attached`,
    );
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
  group.name = "__shield";

  // Shield body
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.3 * S, 0.4 * S, 0.03 * S),
    new THREE.MeshStandardMaterial({
      color: 0x5a5a7a,
      metalness: 0.7,
      roughness: 0.3,
    }),
  );
  body.position.y = 0.1 * S;
  body.castShadow = true;
  group.add(body);

  // Boss (center bump)
  const boss = new THREE.Mesh(
    new THREE.SphereGeometry(0.06 * S, 8, 8),
    new THREE.MeshStandardMaterial({
      color: 0xc9a84c,
      metalness: 0.9,
      roughness: 0.2,
    }),
  );
  boss.position.set(0, 0.1 * S, 0.02 * S);
  group.add(boss);

  // Rim
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.2 * S, 0.012 * S, 4, 16),
    new THREE.MeshStandardMaterial({
      color: 0x8b6914,
      metalness: 0.8,
      roughness: 0.2,
    }),
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

  const libPaths = [
    modelUrl("animation-library.glb"),
    "/models/animation-library.glb",
  ];

  try {
    let gltf = null;
    let lastErr = null;
    for (const libPath of libPaths) {
      try {
        gltf = await new Promise((resolve, reject) => {
          gltfLoader.load(libPath, resolve, undefined, reject);
        });
        if (gltf) break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!gltf) throw lastErr || new Error("animation-library.glb not found");

    // Index animations by name — remap Mixamo → Bip001_* for D1 race GLBs
    const clips = new Map();
    for (const clip of gltf.animations) {
      const cloned = clip.clone();
      remapClipBoneNames(cloned);
      cloned.tracks = cloned.tracks.filter((track) => {
        const dotIdx = track.name.indexOf(".");
        if (dotIdx === -1) return true;
        return VALID_BONES.has(track.name.substring(0, dotIdx));
      });
      if (cloned.tracks.length > 0) clips.set(cloned.name, cloned);
    }

    console.log(
      `[modelLoader] Animation library loaded: ${clips.size} clips [${[...clips.keys()].join(", ")}]`,
    );
    _animLibraryCache = clips;
    return clips;
  } catch (err) {
    // animation-library.glb not found (common in dev / first deploy). Fall through
    // to per-weapon-pack loader in createAnimatedUnit / createHeroUnit.
    console.warn('[modelLoader] animation-library.glb unavailable:', err.message);
    const empty = new Map();
    _animLibraryCache = empty;
    return empty;
  }
}

function applyCommonClipAliases(actions) {
  const CLIP_ALIASES = {
    death: ["dead", "deadBack", "hurt"],
    hit: ["hurt", "stun"],
    dodge: ["roll", "dodgeBack"],
    heavy: ["swing", "attack3", "attack2"],
    swing: ["attack3", "attack2", "attack1"],
    jumpAttack: ["dash", "attack3", "jump"],
    cast2H: ["cast", "attack3"],
    aoe2: ["aoe", "cast"],
    powerUp: ["taunt", "cast", "attack2"],
    fall: ["fallLoop", "jump"],
    land: ["jumpLand", "idle"],
  };

  for (const [alias, candidates] of Object.entries(CLIP_ALIASES)) {
    if (actions.has(alias)) continue;
    for (const c of candidates) {
      const act = actions.get(c);
      if (act) {
        actions.set(alias, act);
        break;
      }
    }
  }
}

// ── Grudge6 + baked Bip001 pipeline (danger room / world parity) ─────────

/**
 * Load a Grudge6 race FBX with rotation-only baked Bip001 clips.
 * Uses AnimationDirector gait blending (idle→walk→run→sprint).
 */
export async function createBakedGrudge6Unit(race, weaponType, opts = {}) {
  if (!isValidRace(race)) {
    throw new CharacterLoadError(`Unknown race "${race}"`, {
      code: "INVALID_RACE",
      race,
    });
  }
  const raceConfig = getRaceConfig(race);
  const factionColors = getRaceFactionColors(race);
  const tier = opts.tier || 1;
  const tierCfg = TierConfig[tier] || TierConfig[1];
  const resolvedWeapon = resolveWeapon(race, weaponType);
  const requireD1 = opts.requireD1 ?? false;
  const meshLoadout = opts.meshLoadout ?? getD1LoadoutForRace(race);

  const loaded = await loadModelWithFallback(raceModelFallbackPaths(race), { race });
  const sourceScene = loaded.scene;
  const scene = cloneGLTFScene(sourceScene);

  scene.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
      if (child.material?.metalness !== undefined) {
        child.material.metalness = Math.min(child.material.metalness, 0.6);
      }
    }
  });

  await applyRaceTextureFix(scene, race);
  applyFactionBodyColor(scene, race);
  normalizeCharacterScale(scene, 1.75);

  const { packName, clips } = await loadBakedPackClips(resolvedWeapon);
  try {
    validateBakedLocoClips(clips, resolvedWeapon, packName);
  } catch (err) {
    if (err instanceof BakedAnimLoadError) {
      throw new CharacterLoadError(err.message, {
        code: err.code,
        race,
        missing: err.missing,
        cause: err,
      });
    }
    throw err;
  }
  const idle = clips.get("idle");
  const walk = clips.get("walk");
  const run = clips.get("run");
  const sprint = clips.get("sprint");

  const mixer = new THREE.AnimationMixer(scene);
  const controller = createBakedController(
    mixer,
    scene,
    { idle, walk, run, sprint },
    clips,
  );

  resetSkeletonBindPose(scene);
  controller.director.primeLocomotion();

  const isD1 = isD1ModularScene(scene);
  if (requireD1 && !isD1) {
    throw new CharacterLoadError(
      `${raceConfig.name}: mesh is not a D1 modular Grudge6 GLB (no WK_/BRB_/ELF_/DWF_/ORC_/UD_ slots)`,
      { code: "D1_REQUIRED", race, paths: [{ path: loaded.path, message: "missing D1 prefixes" }] },
    );
  }

  let equipment = null;
  if (isD1) {
    equipment = new EquipmentManager(scene);
    equipment.applyD1Loadout(resolvedWeapon, meshLoadout);
    await applyRaceTextureFix(scene, race);
  } else if (!requireD1) {
    const weapon = createWeaponMesh(resolvedWeapon);
    tintWeaponMesh(weapon, raceConfig.gearTint, factionColors.emissive, tierCfg);
    attachWeaponToBone(scene, weapon, 'Bip001_R_Hand');
    const shieldWeapons = ['sabres', 'runeblade'];
    if (shieldWeapons.includes(resolvedWeapon)) {
      const shield = createShieldMesh();
      tintWeaponMesh(shield, raceConfig.gearTint, factionColors.emissive, tierCfg);
      shield.rotation.set(-Math.PI / 2, 0, Math.PI);
      attachWeaponToBone(scene, shield, 'Bip001_L_Hand');
    }
  }

  const matAudit = auditCharacterMaterials(scene);
  const tex = textureHealth(matAudit);
  if (!tex.ok) {
    console.warn(
      `[modelLoader] ${raceConfig.name} texture audit: ${tex.label} — ${tex.detail}`,
    );
  }

  console.log(
    `[modelLoader] ${raceConfig.name} baked-grudge6 ready: pack=${packName}, clips=${clips.size}, d1=${isD1}, mesh=${loaded.path}, ${tex.detail}`,
  );

  return {
    scene,
    mixer,
    controller,
    raceConfig,
    resolvedWeapon,
    tier,
    race,
    equipment,
    isGrudge6Fbx: loaded.format === "fbx",
    isD1Modular: isD1,
    bakedAnims: true,
    modelPath: loaded.path,
    pipeline: "baked",
    textureAudit: matAudit,
    meshLoadout,
  };
}

export { formatCharacterLoadError };

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
    console.warn(
      `[modelLoader] ${raceConfig.name} can't use ${weaponType}, using ${resolvedWeapon}`,
    );
  }

  // Load model + weapon pack GLBs + animation library all in parallel.
  // Weapon packs are loaded FIRST priority — they use Mixamo FBX->GLB with
  // remapClipBoneNames() which is proven to map correctly to Bip001 bones.
  // Animation library is supplementary (adds variety states).
  const { scene, mixer, actions: embeddedActions, isGrudge6Fbx } = await loadRaceModel(race);

  const controller = new AnimationController(mixer, scene);
  controller.registerActions(embeddedActions);

  const animClass = WeaponToAnimClass[resolvedWeapon] || "greatsword";
  const prefix = `${animClass}__`;

  // ─ Step 1: Weapon animations — grudge6 FBX packs or GLB Mixamo packs ─
  let weaponPackActions;
  if (isGrudge6Fbx) {
    weaponPackActions = await preloadGrudge6Anims(
      resolvedWeapon,
      mixer,
      scene,
      (packFile) => grudge6AnimUrl(packFile),
    );
  } else {
    weaponPackActions = await preloadWeaponAnims(resolvedWeapon, mixer, scene);
  }
  controller.registerActions(weaponPackActions);
  const wpIdleStats = getTrackBindingStats(controller.actions.get('idle'));
  console.log(`[modelLoader] ${race} weapon-pack (${isGrudge6Fbx ? 'grudge6-fbx' : 'glb'}): ${weaponPackActions.size} clips, idle bound=${wpIdleStats.bound}/${wpIdleStats.total}`);

  // ─ Step 2: Supplement with animation library (adds extra named states) ─
  const animClips = await loadAnimationLibrary();
  let bareRegistered = 0;
  for (const [name, clip] of animClips) {
    const clonedClip = clip.clone();
    clonedClip.name = name;
    const action = mixer.clipAction(clonedClip, scene);
    // Only add if not already covered by weapon pack
    if (!controller.actions.has(name)) controller.actions.set(name, action);
    if (name.startsWith(prefix)) {
      const bare = name.slice(prefix.length);
      if (!controller.actions.has(bare)) {
        controller.actions.set(bare, action);
        bareRegistered++;
      }
    }
  }

  applyCommonClipAliases(controller.actions);
  await registerCompatibleBasemeshAnimations(controller, mixer, scene);

  console.log(
    `[modelLoader] ${raceConfig.name} (${raceConfig.faction}) unit ready: ${controller.actions.size} anims (${bareRegistered} library-supplemented), weapon: ${resolvedWeapon}`,
  );

  let equipment = null;
  if (isD1ModularScene(scene)) {
    equipment = new EquipmentManager(scene);
    equipment.applyLoadout(resolvedWeapon);
    await applyRaceTextureFix(scene, race);
  } else {
    // Legacy fallback path for non-D1 meshes
    const weapon = createWeaponMesh(resolvedWeapon);
    tintWeaponMesh(
      weapon,
      raceConfig.gearTint,
      factionColors.emissive,
      tierCfg,
    );
    attachWeaponToBone(scene, weapon, "Bip001_R_Hand");

    const shieldWeapons = ["sabres", "runeblade"];
    if (shieldWeapons.includes(resolvedWeapon)) {
      const shield = createShieldMesh();
      tintWeaponMesh(
        shield,
        raceConfig.gearTint,
        factionColors.emissive,
        tierCfg,
      );
      shield.rotation.set(-Math.PI / 2, 0, Math.PI);
      attachWeaponToBone(scene, shield, "Bip001_L_Hand");
    }
  }

  // Weapon pack is now the primary loader so idle should be bound.
  // Still verify and log binding stats.
  resetSkeletonBindPose(scene);
  controller.stop();
  controller.play("idle");
  mixer.update(0);
  const idleStats = getTrackBindingStats(controller.currentAction);
  if (!controller.currentAction || idleStats.bound === 0) {
    console.warn(`[modelLoader] ${race}: idle unbound — retrying weapon pack…`);
    const retry = await preloadWeaponAnims(resolvedWeapon, mixer, scene);
    controller.registerActions(retry);
    applyCommonClipAliases(controller.actions);
    controller.stop();
    controller.play("idle");
    mixer.update(0);
  }

  return {
    scene,
    mixer,
    controller,
    raceConfig,
    resolvedWeapon,
    tier,
    race,
    equipment,
    isGrudge6Fbx,
  };
}

/**
 * Apply race faction tint and tier glow to a procedural weapon/shield mesh.
 * Traverses all MeshStandardMaterial children, blending the faction color
 * into metallic/guard pieces and adding tier-based emissive glow.
 */
function tintWeaponMesh(group, raceTint, factionEmissive, tierCfg) {
  const tintColor = new THREE.Color(raceTint);
  const emissiveColor = new THREE.Color(tierCfg.emissive || factionEmissive);

  group.traverse((child) => {
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
      mat.emissiveIntensity = Math.max(
        mat.emissiveIntensity,
        tierCfg.emissiveIntensity,
      );
    }
  });
}

// ── Hero unit factory (uses HeroRegistry prefab definitions) ─────────────────

/**
 * Create a fully animated unit from a HeroRegistry entry.
 * Tries to load the hero's pack-specific GLB; falls back to the generic
 * race GLB if the file has not been placed yet.
 *
 * @param {Object} hero  - A HeroRegistry entry (from HeroRegistry.js)
 * @param {string|null} weaponOverride - Force a weapon from hero.weapons list
 * @param {Object} [opts] - { tier: 1-8 }
 * @returns {{ scene, mixer, controller, raceConfig, resolvedWeapon, tier, hero, race }}
 */
export async function createHeroUnit(hero, weaponOverride = null, opts = {}) {
  const weaponType =
    weaponOverride && hero.weapons.includes(weaponOverride)
      ? weaponOverride
      : hero.defaultWeapon;

  const raceConfig = getRaceConfig(hero.race);
  const factionColors = getRaceFactionColors(hero.race);
  const tier = opts.tier || 1;
  const tierCfg = TierConfig[tier] || TierConfig[1];
  const animClass = WeaponToAnimClass[weaponType] || "greatsword";
  const prefix = `${animClass}__`;

  // Try hero-specific Cloudflare/local GLB, then generic race fallback.
  let scene, mixer, embeddedActions;
  try {
    const candidates = [hero.modelPath, hero.fallbackModel].filter(Boolean);
    const { gltf, path } = await loadGLTFWithFallback(candidates);
    scene = cloneGLTFScene(gltf.scene);
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
        if (child.material?.metalness !== undefined)
          child.material.metalness = Math.min(child.material.metalness, 0.6);
      }
    });
    await applyRaceTextureFix(scene, hero.race);
    applyFactionBodyColor(scene, hero.race);
    // Normalise to 1.75 m (same approach as loadRaceModel)
    normalizeCharacterScale(scene, 1.75);
    mixer = new THREE.AnimationMixer(scene);
    embeddedActions = new Map();
    const EMBEDDED_ALIASES = { running: ["run"], walking: ["walk"], idle: [] };
    for (const clip of gltf.animations) {
      const cloned = clip.clone();
      remapClipBoneNames(cloned);
      const key = cloned.name.toLowerCase();
      const action = mixer.clipAction(cloned, scene);
      embeddedActions.set(key, action);
      for (const alias of EMBEDDED_ALIASES[key] || []) {
        if (!embeddedActions.has(alias)) embeddedActions.set(alias, action);
      }
    }
    console.log(`[modelLoader] Hero model loaded: ${path}`);
  } catch {
    console.warn(
      `[modelLoader] ${hero.id}: pack model not found (${hero.modelPath}), using race fallback`,
    );
    const result = await loadRaceModel(hero.race);
    scene = result.scene;
    mixer = result.mixer;
    embeddedActions = result.actions;
  }

  const controller = new AnimationController(mixer, scene);
  controller.registerActions(embeddedActions);

  // Weapon pack first (proven Bip001_* binding), library supplements extras only.
  const packActions = await preloadWeaponAnims(weaponType, mixer, scene);
  controller.registerActions(packActions);

  const animClips = await loadAnimationLibrary();
  let bareRegistered = 0;
  for (const [name, clip] of animClips) {
    const clonedClip = clip.clone();
    clonedClip.name = name;
    const action = mixer.clipAction(clonedClip, scene);
    if (!controller.actions.has(name)) controller.actions.set(name, action);
    if (name.startsWith(prefix)) {
      const bare = name.slice(prefix.length);
      if (!controller.actions.has(bare)) {
        controller.actions.set(bare, action);
        bareRegistered++;
      }
    }
  }

  applyCommonClipAliases(controller.actions);
  await registerCompatibleBasemeshAnimations(controller, mixer, scene);

  let equipment = null;
  if (isD1ModularScene(scene)) {
    equipment = new EquipmentManager(scene);
    equipment.applyLoadout(weaponType);
    await applyRaceTextureFix(scene, hero.race);
  } else {
    const weapon = createWeaponMesh(weaponType);
    tintWeaponMesh(
      weapon,
      raceConfig.gearTint,
      factionColors.emissive,
      tierCfg,
    );
    attachWeaponToBone(scene, weapon, "Bip001_R_Hand");

    const shieldWeapons = ["sabres", "runeblade"];
    if (shieldWeapons.includes(weaponType)) {
      const shield = createShieldMesh();
      tintWeaponMesh(
        shield,
        raceConfig.gearTint,
        factionColors.emissive,
        tierCfg,
      );
      shield.rotation.set(-Math.PI / 2, 0, Math.PI);
      attachWeaponToBone(scene, shield, "Bip001_L_Hand");
    }
  }

  resetSkeletonBindPose(scene);
  controller.stop();
  controller.play("idle");
  mixer.update(0);
  const heroIdleStats = getTrackBindingStats(controller.currentAction);
  if (!controller.currentAction || heroIdleStats.bound === 0) {
    console.warn(
      `[modelLoader] Hero ${hero.id}: idle unbound after weapon pack — retrying…`,
    );
    const retry = await preloadWeaponAnims(weaponType, mixer, scene);
    controller.registerActions(retry);
    applyCommonClipAliases(controller.actions);
    controller.stop();
    controller.play("idle");
    mixer.update(0);
  }
  const packStats = getTrackBindingStats(controller.currentAction);
  console.log(
    `[modelLoader] Hero ${hero.id}: idle bound=${packStats.bound}/${packStats.total} tracks`,
  );

  console.log(
    `[modelLoader] Hero ${hero.displayName} (${hero.id}) ready: ${controller.actions.size} anims (${bareRegistered} bare-aliased from '${animClass}'), weapon: ${weaponType}, tier: ${tierCfg.name}`,
  );
  return {
    scene,
    mixer,
    controller,
    raceConfig,
    resolvedWeapon: weaponType,
    tier,
    hero,
    race: hero.race,
    equipment,
  };
}

// ── Live weapon swap ──────────────────────────────────────────────────────────

/**
 * Hot-swap a unit's equipped weapon at runtime.
 * Removes the existing weapon/shield meshes from hand bones, attaches the
 * new weapon, and re-aliases animation clips for the new weapon class.
 *
 * The unit object must contain: { scene, controller, raceConfig, tier, race }
 * (returned by createAnimatedUnit or createHeroUnit).
 *
 * @param {Object} unit - Unit object returned by createAnimatedUnit / createHeroUnit
 * @param {string} newWeaponType - One of the WeaponTypes keys
 */
export function swapWeapon(unit, newWeaponType) {
  const { scene, controller, raceConfig, tier, race } = unit;
  const tierCfg = TierConfig[tier] || TierConfig[1];
  const factionColors = getRaceFactionColors(race);

  // Remove existing weapon / shield meshes from all hand bones
  scene.traverse((node) => {
    if (!node.isBone) return;
    const toRemove = node.children.filter(
      (c) => c.name === "__weapon" || c.name === "__shield",
    );
    toRemove.forEach((c) => node.remove(c));
  });

  // Attach new weapon
  const newWeapon = createWeaponMesh(newWeaponType);
  tintWeaponMesh(
    newWeapon,
    raceConfig.gearTint,
    factionColors.emissive,
    tierCfg,
  );
  attachWeaponToBone(scene, newWeapon, "RightHand");

  const shieldWeapons = ["sabres", "runeblade"];
  if (shieldWeapons.includes(newWeaponType)) {
    const shield = createShieldMesh();
    tintWeaponMesh(
      shield,
      raceConfig.gearTint,
      factionColors.emissive,
      tierCfg,
    );
    shield.rotation.set(-Math.PI / 2, 0, Math.PI);
    attachWeaponToBone(scene, shield, "LeftHand");
  }

  // Re-alias animation clips for the new weapon's anim class.
  // Overwrites existing bare-name aliases so play('attack1') etc. resolve
  // to the correct weapon pack.
  const newAnimClass = WeaponToAnimClass[newWeaponType] || "greatsword";
  const newPrefix = `${newAnimClass}__`;
  for (const [name, action] of controller.actions) {
    if (!name.startsWith(newPrefix)) continue;
    const bare = name.slice(newPrefix.length);
    controller.actions.set(bare, action);
  }

  unit.resolvedWeapon = newWeaponType;
  controller.play("idle");

  console.log(
    `[modelLoader] Weapon swapped → ${newWeaponType} (${newAnimClass})`,
  );
}
