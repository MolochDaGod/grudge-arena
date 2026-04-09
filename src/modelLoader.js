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

/** Core animation states every weapon pack must provide */
export const CORE_ANIMS = {
  idle:    { loop: true },
  run:     { loop: true },
  attack1: { loop: false },
  attack2: { loop: false },
  attack3: { loop: false },
  block:   { loop: false },
  death:   { loop: false },
  hit:     { loop: false },
};

/** Map from our state names → GLB filenames per weapon pack (converted from FBX via fbx2gltf) */
const ANIM_FILE_MAP = {
  axe: {
    idle:    'standing idle.glb',
    run:     'standing run forward.glb',
    walk:    'standing walk forward.glb',
    attack1: 'standing melee attack horizontal.glb',
    attack2: 'standing melee attack downward.glb',
    attack3: 'standing melee combo attack ver. 1.glb',
    combo1:  'standing melee combo attack ver. 2.glb',
    combo2:  'standing melee combo attack ver. 3.glb',
    spin:    'standing melee attack 360 high.glb',
    kick:    'standing melee attack kick ver. 1.glb',
    block:   'standing block idle.glb',
    hit:     'standing react large from left.glb',
    jump:    'standing jump.glb',
    taunt:   'standing taunt battlecry.glb',
  },
  sword_shield: {
    idle:    'sword and shield idle.glb',
    run:     'sword and shield run.glb',
    walk:    'sword and shield walk.glb',
    attack1: 'sword and shield attack.glb',
    attack2: 'sword and shield attack (2).glb',
    attack3: 'sword and shield slash.glb',
    slash2:  'sword and shield slash (2).glb',
    kick:    'sword and shield kick.glb',
    block:   'sword and shield block.glb',
    blockIdle: 'sword and shield block idle.glb',
    hit:     'sword and shield impact.glb',
    death:   'sword and shield death.glb',
    cast:    'sword and shield casting.glb',
    jump:    'sword and shield jump.glb',
    draw:    'draw sword 1.glb',
  },
  longbow: {
    idle:    'standing idle 01.glb',
    run:     'standing run forward.glb',
    walk:    'standing walk forward.glb',
    attack1: 'standing draw arrow.glb',
    attack2: 'standing aim recoil.glb',
    attack3: 'standing aim overdraw.glb',
    block:   'standing block.glb',
    kick:    'standing melee kick.glb',
    hit:     'standing react small from front.glb',
    death:   'standing death forward 01.glb',
    dodge:   'standing dodge forward.glb',
    dive:    'standing dive forward.glb',
    draw:    'standing equip bow.glb',
  },
  magic: {
    idle:    'standing idle.glb',
    run:     'Standing Run Forward.glb',
    walk:    'Standing Walk Forward.glb',
    attack1: 'Standing 1H Magic Attack 01.glb',
    attack2: 'Standing 2H Magic Attack 01.glb',
    attack3: 'Standing 2H Magic Attack 02.glb',
    cast:    'standing 1H cast spell 01.glb',
    cast2H:  'Standing 2H Cast Spell 01.glb',
    aoe:     'Standing 2H Magic Area Attack 01.glb',
    block:   'Standing Block Start.glb',
    blockIdle: 'Standing Block Idle.glb',
    hit:     'Standing React Large From Front.glb',
    death:   'Standing React Death Forward.glb',
    crouch:  'Crouch Idle.glb',
  },
  rifle: {
    idle:    'idle.glb',
    run:     'run forward.glb',
    walk:    'walk forward.glb',
    attack1: 'idle aiming.glb',
    block:   'idle crouching.glb',
    death:   'death from the front.glb',
    hit:     'death from front headshot.glb',
    jump:    'jump up.glb',
    sprint:  'sprint forward.glb',
  },
};

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
  for (const clip of gltf.animations) {
    const clonedClip = clip.clone();
    remapClipBoneNames(clonedClip);
    const action = mixer.clipAction(clonedClip, scene);
    actions.set(clonedClip.name.toLowerCase(), action);
  }

  console.log(`[modelLoader] Loaded ${race} — scale: ${nativeScale * cfg.scale}, bones: ${scene.children.length > 0 ? 'OK' : 'NONE'}, anims: ${gltf.animations.length} embedded`);
  return { scene, mixer, actions, clips: gltf.animations };
}

// ── Load a single FBX animation clip ────────────────────────────────────────

/**
 * Load a standalone animation GLB (extract clip only).
 * All animation files are now GLB (converted from FBX via fbx2gltf).
 * GLTFLoader is used for everything — no FBXLoader needed.
 */
export async function loadAnimClip(filePath) {
  const cached = clipCache.get(filePath);
  if (cached) return cached.clone();

  try {
    const gltf = await new Promise((resolve, reject) => {
      gltfLoader.load(filePath, resolve, undefined, reject);
    });
    if (!gltf.animations || gltf.animations.length === 0) {
      console.warn(`[modelLoader] No animations in ${filePath}`);
      return null;
    }
    const clip = remapClipBoneNames(gltf.animations[0]);

    // Strip tracks targeting bones that don't exist on our 24-joint skeleton.
    // Without this, unmatched finger/eye tracks get a default bind pose that
    // can distort the mesh or cause invisible bones to hold wrong positions.
    clip.tracks = clip.tracks.filter(track => {
      const dotIdx = track.name.indexOf('.');
      if (dotIdx === -1) return true;
      const boneName = track.name.substring(0, dotIdx);
      return VALID_BONES.has(boneName);
    });

    // GLBs converted from Mixamo FBX have position tracks in centimeter space.
    // Scale them by 0.01 to match our character models' 0.01 root scale.
    for (const track of clip.tracks) {
      if (track.name.endsWith('.position')) {
        for (let i = 0; i < track.values.length; i++) {
          track.values[i] *= 0.01;
        }
      }
    }

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
    const action = this.actions.get(stateName);
    if (!action) {
      // Fallback: try 'idle' if requested state doesn't exist
      if (stateName !== 'idle') return this.play('idle', opts);
      return false;
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

// ── High-level: create a fully animated arena unit ──────────────────────

/**
 * Load a race model + weapon animations + weapon mesh, return ready-to-use unit.
 * @param {string} race - 'human', 'barbarian', etc.
 * @param {string} weaponType - 'greatsword', 'bow', etc.
 * @returns {{ scene, mixer, controller: AnimationController }}
 */
export async function createAnimatedUnit(race, weaponType) {
  const { scene, mixer, actions: embeddedActions } = await loadRaceModel(race);
  const controller = new AnimationController(mixer, scene);

  // Register embedded animations from the GLB
  controller.registerActions(embeddedActions);

  // Load and register weapon animation pack (FBX)
  const weaponActions = await preloadWeaponAnims(weaponType, mixer, scene);
  controller.registerActions(weaponActions);

  // Attach weapon mesh to RightHand bone
  const weapon = createWeaponMesh(weaponType);
  attachWeaponToBone(scene, weapon, 'RightHand');

  // Attach shield to LeftHand for sword+shield weapons
  const shieldWeapons = ['sabres', 'runeblade'];
  if (shieldWeapons.includes(weaponType)) {
    const shield = createShieldMesh();
    shield.rotation.set(-Math.PI / 2, 0, Math.PI); // Face outward
    attachWeaponToBone(scene, shield, 'LeftHand');
  }

  // Start idle
  controller.play('idle');

  return { scene, mixer, controller };
}
