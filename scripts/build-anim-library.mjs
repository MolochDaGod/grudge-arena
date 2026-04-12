/**
 * Build Animation Library
 * 
 * Reads individual animation GLB files, remaps bone names to match
 * our character skeletons, and writes a single merged GLB containing
 * all animations as named clips.
 * 
 * Output: public/models/animation-library.glb
 * 
 * Usage: node scripts/build-anim-library.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// ── Animation source mapping ────────────────────────────────────────

// Shared locomotion/reaction anims (used by all weapon classes that lack their own)
const SHARED = {
  // Melee locomotion (from axe pack)
  idle:     'assets/animations/axe/standing idle.glb',
  run:      'assets/animations/axe/standing run forward.glb',
  runBack:  'assets/animations/axe/standing run back.glb',
  walk:     'assets/animations/axe/standing walk forward.glb',
  walkBack: 'assets/animations/axe/standing walk back.glb',
  walkLeft: 'assets/animations/axe/standing walk left.glb',
  walkRight:'assets/animations/axe/standing walk right.glb',
  jump:     'assets/animations/axe/standing jump.glb',
  crouch:   'assets/animations/axe/crouch idle.glb',
  // Reactions
  hurt:     'assets/animations/axe/standing react large from left.glb',
  hurtRight:'assets/animations/axe/standing react large from right.glb',
  stun:     'assets/animations/axe/standing react large gut.glb',
  // Movement skills
  roll:     'assets/animations/longbow/standing dodge forward.glb',
  dodge:    'assets/animations/longbow/standing dodge forward.glb',
  dodgeBack:'assets/animations/longbow/standing dodge backward.glb',
  dash:     'assets/animations/longbow/standing dive forward.glb',
  // Utility
  taunt:    'assets/animations/axe/standing taunt battlecry.glb',
  taunt2:   'assets/animations/axe/standing taunt chest thump.glb',
};

// Weapon-class-specific animations
const WEAPON_ANIMS = {
  // ── Greatsword / 2H Sword / Axe / Hammer ──
  greatsword: {
    ...SHARED,
    attack1:  'assets/animations/axe/standing melee attack horizontal.glb',
    attack2:  'assets/animations/axe/standing melee attack downward.glb',
    attack3:  'assets/animations/axe/standing melee combo attack ver. 1.glb',
    attack4:  'assets/animations/axe/standing melee attack backhand.glb',
    combo1:   'assets/animations/axe/standing melee combo attack ver. 2.glb',
    combo2:   'assets/animations/axe/standing melee combo attack ver. 3.glb',
    swing:    'assets/animations/axe/standing melee attack 360 high.glb',
    spinLow:  'assets/animations/axe/standing melee attack 360 low.glb',
    kick:     'assets/animations/axe/standing melee attack kick ver. 1.glb',
    jumpAttack:'assets/animations/axe/standing melee run jump attack.glb',
    block:    'assets/animations/axe/standing block idle.glb',
    blockHit: 'assets/animations/axe/standing block react large.glb',
    dead:     'assets/animations/sword_shield/sword and shield death.glb',
  },
  // ── Sword & Shield / Paladin / Runeblade ──
  swordShield: {
    ...SHARED,
    idle:     'assets/animations/sword_shield/sword and shield idle.glb',
    run:      'assets/animations/sword_shield/sword and shield run.glb',
    runBack:  'assets/animations/sword_shield/sword and shield run (2).glb',
    walk:     'assets/animations/sword_shield/sword and shield walk.glb',
    walkBack: 'assets/animations/sword_shield/sword and shield walk (2).glb',
    strafeLeft: 'assets/animations/sword_shield/sword and shield strafe.glb',
    strafeRight:'assets/animations/sword_shield/sword and shield strafe (2).glb',
    strafeLeft2:'assets/animations/sword_shield/sword and shield strafe (3).glb',
    strafeRight2:'assets/animations/sword_shield/sword and shield strafe (4).glb',
    turnLeft: 'assets/animations/sword_shield/sword and shield 180 turn.glb',
    turnRight:'assets/animations/sword_shield/sword and shield 180 turn (2).glb',
    crouchBlock:'assets/animations/sword_shield/sword and shield crouch block.glb',
    crouchBlockIdle:'assets/animations/sword_shield/sword and shield crouch block idle.glb',
    jump:     'assets/animations/sword_shield/sword and shield jump.glb',
    crouch:   'assets/animations/sword_shield/sword and shield crouch idle.glb',
    attack1:  'assets/animations/sword_shield/sword and shield attack.glb',
    attack2:  'assets/animations/sword_shield/sword and shield attack (2).glb',
    attack3:  'assets/animations/sword_shield/sword and shield attack (3).glb',
    attack4:  'assets/animations/sword_shield/sword and shield attack (4).glb',
    slash1:   'assets/animations/sword_shield/sword and shield slash.glb',
    slash2:   'assets/animations/sword_shield/sword and shield slash (2).glb',
    slash3:   'assets/animations/sword_shield/sword and shield slash (3).glb',
    kick:     'assets/animations/sword_shield/sword and shield kick.glb',
    block:    'assets/animations/sword_shield/sword and shield block.glb',
    blockIdle:'assets/animations/sword_shield/sword and shield block idle.glb',
    cast:     'assets/animations/sword_shield/sword and shield casting.glb',
    powerUp:  'assets/animations/sword_shield/sword and shield power up.glb',
    swing:    'assets/animations/sword_shield/sword and shield slash (5).glb',
    hurt:     'assets/animations/sword_shield/sword and shield impact.glb',
    dead:     'assets/animations/sword_shield/sword and shield death.glb',
    dead2:    'assets/animations/sword_shield/sword and shield death (2).glb',
    draw:     'assets/animations/sword_shield/draw sword 1.glb',
    sheath:   'assets/animations/sword_shield/sheath sword 1.glb',
  },
  // ── Magic / Staff / Wand (Caster) ──
  magic: {
    idle:     'assets/animations/magic/standing idle.glb',
    run:      'assets/animations/magic/Standing Run Forward.glb',
    runBack:  'assets/animations/magic/Standing Run Back.glb',
    runLeft:  'assets/animations/magic/Standing Run Left.glb',
    runRight: 'assets/animations/magic/Standing Run Right.glb',
    walk:     'assets/animations/magic/Standing Walk Forward.glb',
    walkBack: 'assets/animations/magic/Standing Walk Back.glb',
    sprint:   'assets/animations/magic/Standing Sprint Forward.glb',
    jump:     'assets/animations/magic/Standing Jump.glb',
    crouch:   'assets/animations/magic/Crouch Idle.glb',
    crouchWalk:'assets/animations/magic/Crouch Walk Forward.glb',
    crouchWalkBack:'assets/animations/magic/Crouch Walk Back.glb',
    crouchWalkLeft:'assets/animations/magic/Crouch Walk Left.glb',
    crouchWalkRight:'assets/animations/magic/Crouch Walk Right.glb',
    crouchTurnLeft:'assets/animations/magic/Crouch Turn Left 90.glb',
    crouchTurnRight:'assets/animations/magic/Crouch Turn Right 90.glb',
    land:     'assets/animations/magic/Standing Land To Standing Idle.glb',
    jumpRunLand:'assets/animations/magic/Standing Jump Running Landing.glb',
    attack1:  'assets/animations/magic/Standing 1H Magic Attack 01.glb',
    attack2:  'assets/animations/magic/Standing 1H Magic Attack 02.glb',
    attack3:  'assets/animations/magic/Standing 1H Magic Attack 03.glb',
    attack4:  'assets/animations/magic/Standing 2H Magic Attack 01.glb',
    cast:     'assets/animations/magic/standing 1H cast spell 01.glb',
    cast2H:   'assets/animations/magic/Standing 2H Cast Spell 01.glb',
    aoe:      'assets/animations/magic/Standing 2H Magic Area Attack 01.glb',
    aoe2:     'assets/animations/magic/Standing 2H Magic Area Attack 02.glb',
    block:    'assets/animations/magic/Standing Block Start.glb',
    blockIdle:'assets/animations/magic/Standing Block Idle.glb',
    blockHit: 'assets/animations/magic/Standing Block React Large.glb',
    hurt:     'assets/animations/magic/Standing React Large From Front.glb',
    hurtBack: 'assets/animations/magic/Standing React Large From Back.glb',
    dead:     'assets/animations/magic/Standing React Death Forward.glb',
    deadBack: 'assets/animations/magic/Standing React Death Backward.glb',
    ...SHARED, // fallback for roll/dodge/dash/taunt
    // Re-override shared with magic-specific
    idle:     'assets/animations/magic/standing idle.glb',
    run:      'assets/animations/magic/Standing Run Forward.glb',
  },
  // ── Longbow / Archer / Crossbow ──
  longbow: {
    idle:     'assets/animations/longbow/standing idle 01.glb',
    run:      'assets/animations/longbow/standing run forward.glb',
    runBack:  'assets/animations/longbow/standing run back.glb',
    runLeft:  'assets/animations/longbow/standing run left.glb',
    runRight: 'assets/animations/longbow/standing run right.glb',
    walk:     'assets/animations/longbow/standing walk forward.glb',
    walkBack: 'assets/animations/longbow/standing walk back.glb',
    walkLeft: 'assets/animations/longbow/standing walk left.glb',
    walkRight:'assets/animations/longbow/standing walk right.glb',
    jump:     'assets/animations/axe/standing jump.glb',
    aimWalkFwd: 'assets/animations/longbow/standing aim walk forward.glb',
    aimWalkBack:'assets/animations/longbow/standing aim walk back.glb',
    aimWalkLeft:'assets/animations/longbow/standing aim walk left.glb',
    aimWalkRight:'assets/animations/longbow/standing aim walk right.glb',
    fallLoop: 'assets/animations/longbow/fall a loop.glb',
    fallLandIdle:'assets/animations/longbow/fall a land to standing idle 01.glb',
    fallLandRun:'assets/animations/longbow/fall a land to run forward.glb',
    runStop:  'assets/animations/longbow/standing run forward stop.glb',
    attack1:  'assets/animations/longbow/standing draw arrow.glb',
    attack2:  'assets/animations/longbow/standing aim recoil.glb',
    attack3:  'assets/animations/longbow/standing aim overdraw.glb',
    kick:     'assets/animations/longbow/standing melee kick.glb',
    punch:    'assets/animations/longbow/standing melee punch.glb',
    block:    'assets/animations/longbow/standing block.glb',
    roll:     'assets/animations/longbow/standing dodge forward.glb',
    dodge:    'assets/animations/longbow/standing dodge forward.glb',
    dodgeBack:'assets/animations/longbow/standing dodge backward.glb',
    dodgeLeft:'assets/animations/longbow/standing dodge left.glb',
    dodgeRight:'assets/animations/longbow/standing dodge right.glb',
    dash:     'assets/animations/longbow/standing dive forward.glb',
    hurt:     'assets/animations/longbow/standing react small from front.glb',
    dead:     'assets/animations/longbow/standing death forward 01.glb',
    deadBack: 'assets/animations/longbow/standing death backward 01.glb',
    draw:     'assets/animations/longbow/standing equip bow.glb',
    taunt:    'assets/animations/axe/standing taunt battlecry.glb',
    stun:     'assets/animations/axe/standing react large gut.glb',
  },
  // ── Rifle / Gun / Crossbow (8-way) ──
  rifle: {
    idle:     'assets/animations/rifle/idle.glb',
    aimIdle:  'assets/animations/rifle/idle aiming.glb',
    run:      'assets/animations/rifle/run forward.glb',
    runBack:  'assets/animations/rifle/run backward.glb',
    runLeft:  'assets/animations/rifle/run left.glb',
    runRight: 'assets/animations/rifle/run right.glb',
    runFL:    'assets/animations/rifle/run forward left.glb',
    runFR:    'assets/animations/rifle/run forward right.glb',
    runBL:    'assets/animations/rifle/run backward left.glb',
    runBR:    'assets/animations/rifle/run backward right.glb',
    walk:     'assets/animations/rifle/walk forward.glb',
    walkBack: 'assets/animations/rifle/walk backward.glb',
    walkLeft: 'assets/animations/rifle/walk left.glb',
    walkRight:'assets/animations/rifle/walk right.glb',
    sprint:   'assets/animations/rifle/sprint forward.glb',
    sprintLeft:'assets/animations/rifle/sprint left.glb',
    sprintRight:'assets/animations/rifle/sprint right.glb',
    jump:     'assets/animations/rifle/jump up.glb',
    jumpLoop: 'assets/animations/rifle/jump loop.glb',
    jumpLand: 'assets/animations/rifle/jump down.glb',
    crouch:   'assets/animations/rifle/idle crouching.glb',
    crouchAim:'assets/animations/rifle/idle crouching aiming.glb',
    crouchWalk:'assets/animations/rifle/walk crouching forward.glb',
    attack1:  'assets/animations/rifle/idle aiming.glb',
    hurt:     'assets/animations/rifle/death from front headshot.glb',
    dead:     'assets/animations/rifle/death from the front.glb',
    deadBack: 'assets/animations/rifle/death from the back.glb',
    block:    'assets/animations/rifle/idle crouching.glb',
    roll:     'assets/animations/longbow/standing dodge forward.glb',
    dodge:    'assets/animations/longbow/standing dodge forward.glb',
    dash:     'assets/animations/longbow/standing dive forward.glb',
    taunt:    'assets/animations/axe/standing taunt battlecry.glb',
    stun:     'assets/animations/axe/standing react large gut.glb',
  },
};

// Build ALL weapon classes into one merged library
const ANIM_SOURCES = {};
for (const [weapon, anims] of Object.entries(WEAPON_ANIMS)) {
  for (const [state, path] of Object.entries(anims)) {
    const key = `${weapon}__${state}`; // e.g. greatsword__attack1
    ANIM_SOURCES[key] = path;
  }
}

const PUBLIC = resolve('public');

// ── Bone name remapping ─────────────────────────────────────────────

const BONE_ALIASES = {
  'Spine1': 'Spine01', 'Spine2': 'Spine02',
  'Neck': 'neck', 'HeadTop_End': 'head_end',
  'Reye': 'headfront', 'Leye': 'headfront',
};

const VALID_BONES = new Set([
  'Hips', 'Spine', 'Spine01', 'Spine02', 'neck', 'Head', 'head_end', 'headfront',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
]);

function remapNodeName(name) {
  // Strip mixamorig: prefix
  if (name.includes(':')) name = name.split(':').pop();
  // Apply aliases
  if (BONE_ALIASES[name]) name = BONE_ALIASES[name];
  return name;
}

// ── GLB parsing ─────────────────────────────────────────────────────

function parseGLB(buffer) {
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546C67) throw new Error('Not a GLB file');
  const jsonLen = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.slice(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8; // skip json chunk + bin chunk header
  const bin = buffer.slice(binStart);
  return { json, bin };
}

function extractAnimation(filePath, animName) {
  const buf = readFileSync(resolve(PUBLIC, filePath));
  const { json, bin } = parseGLB(buf);
  
  if (!json.animations || json.animations.length === 0) {
    console.warn(`  No animations in ${filePath}`);
    return null;
  }
  
  const anim = json.animations[0];
  const nodes = json.nodes || [];
  
  // Remap node names and build channel info
  const channels = [];
  const remappedNodes = new Map(); // oldIdx → newName
  
  for (const ch of anim.channels) {
    const nodeIdx = ch.target.node;
    const nodeName = nodes[nodeIdx]?.name || `node_${nodeIdx}`;
    const remapped = remapNodeName(nodeName);
    
    // Skip bones not in our skeleton
    if (!VALID_BONES.has(remapped) && remapped !== 'Armature') continue;
    
    remappedNodes.set(nodeIdx, remapped);
    channels.push({
      nodeName: remapped,
      path: ch.target.path, // translation, rotation, scale
      samplerIdx: ch.sampler,
    });
  }
  
  // Extract sampler data
  const samplers = [];
  for (const ch of channels) {
    const sampler = anim.samplers[ch.samplerIdx];
    const inputAccessor = json.accessors[sampler.input];
    const outputAccessor = json.accessors[sampler.output];
    
    const inputData = extractAccessorData(json, bin, inputAccessor);
    const outputData = extractAccessorData(json, bin, outputAccessor);
    
    samplers.push({
      nodeName: ch.nodeName,
      path: ch.path,
      interpolation: sampler.interpolation || 'LINEAR',
      times: inputData,
      values: outputData,
    });
  }
  
  console.log(`  ${animName}: ${samplers.length} channels from ${filePath.split('/').pop()}`);
  return { name: animName, samplers, duration: anim.samplers?.[0] ? getMaxTime(json, bin, anim) : 0 };
}

function extractAccessorData(json, bin, accessor) {
  const bufferView = json.bufferViews[accessor.bufferView];
  const offset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
  const count = accessor.count;
  const type = accessor.componentType;
  
  const components = { 'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16 }[accessor.type] || 1;
  const totalFloats = count * components;
  
  if (type === 5126) { // FLOAT
    return Array.from(new Float32Array(bin.buffer, bin.byteOffset + offset, totalFloats));
  }
  return Array.from(new Float32Array(bin.buffer, bin.byteOffset + offset, totalFloats));
}

function getMaxTime(json, bin, anim) {
  let max = 0;
  for (const sampler of anim.samplers) {
    const acc = json.accessors[sampler.input];
    if (acc.max) max = Math.max(max, acc.max[0]);
  }
  return max;
}

// ── Build combined GLTF JSON ────────────────────────────────────────

function buildLibrary(animations) {
  // Create a minimal GLTF with just a skeleton (nodes) and animations
  // The skeleton nodes match our character bone names exactly
  
  const boneNames = [...VALID_BONES];
  const nodeMap = new Map(); // boneName → nodeIndex
  
  // Build nodes (flat list, no hierarchy needed for animation-only)
  const nodes = boneNames.map((name, i) => {
    nodeMap.set(name, i);
    return { name };
  });
  
  // Build binary buffer with all animation data
  const bufferParts = [];
  let byteOffset = 0;
  
  const accessors = [];
  const bufferViews = [];
  const gltfAnimations = [];
  
  for (const anim of animations) {
    if (!anim) continue;
    
    const channels = [];
    const samplers = [];
    
    for (const s of anim.samplers) {
      const nodeIdx = nodeMap.get(s.nodeName);
      if (nodeIdx === undefined) continue;
      
      // Input accessor (times)
      const timesFloat = new Float32Array(s.times);
      const timesBuf = Buffer.from(timesFloat.buffer);
      bufferViews.push({ buffer: 0, byteOffset, byteLength: timesBuf.length });
      accessors.push({
        bufferView: bufferViews.length - 1,
        componentType: 5126,
        count: timesFloat.length,
        type: 'SCALAR',
        min: [Math.min(...s.times)],
        max: [Math.max(...s.times)],
      });
      bufferParts.push(timesBuf);
      byteOffset += timesBuf.length;
      // Pad to 4-byte boundary
      const pad1 = (4 - (byteOffset % 4)) % 4;
      if (pad1) { bufferParts.push(Buffer.alloc(pad1)); byteOffset += pad1; }
      const inputIdx = accessors.length - 1;
      
      // Output accessor (values)
      const valsFloat = new Float32Array(s.values);
      const valsBuf = Buffer.from(valsFloat.buffer);
      bufferViews.push({ buffer: 0, byteOffset, byteLength: valsBuf.length });
      const components = s.path === 'rotation' ? 4 : 3;
      accessors.push({
        bufferView: bufferViews.length - 1,
        componentType: 5126,
        count: valsFloat.length / components,
        type: components === 4 ? 'VEC4' : 'VEC3',
      });
      bufferParts.push(valsBuf);
      byteOffset += valsBuf.length;
      const pad2 = (4 - (byteOffset % 4)) % 4;
      if (pad2) { bufferParts.push(Buffer.alloc(pad2)); byteOffset += pad2; }
      const outputIdx = accessors.length - 1;
      
      // glTF path name mapping
      const pathMap = { 'translation': 'translation', 'rotation': 'rotation', 'scale': 'scale' };
      
      samplers.push({ input: inputIdx, output: outputIdx, interpolation: s.interpolation });
      channels.push({ sampler: samplers.length - 1, target: { node: nodeIdx, path: pathMap[s.path] || s.path } });
    }
    
    gltfAnimations.push({ name: anim.name, channels, samplers });
  }
  
  const binBuffer = Buffer.concat(bufferParts);
  
  const gltf = {
    asset: { version: '2.0', generator: 'grudge-arena-anim-builder' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    animations: gltfAnimations,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binBuffer.length }],
  };
  
  return { gltf, bin: binBuffer };
}

function writeGLB(gltf, bin, outPath) {
  const jsonStr = JSON.stringify(gltf);
  const jsonBuf = Buffer.from(jsonStr);
  // Pad JSON to 4-byte boundary
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const paddedJson = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]); // space padding
  
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); // magic: glTF
  header.writeUInt32LE(2, 4); // version
  header.writeUInt32LE(12 + 8 + paddedJson.length + 8 + bin.length, 8); // total length
  
  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(paddedJson.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4); // JSON
  
  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(bin.length, 0);
  binChunkHeader.writeUInt32LE(0x004E4942, 4); // BIN
  
  const glb = Buffer.concat([header, jsonChunkHeader, paddedJson, binChunkHeader, bin]);
  writeFileSync(outPath, glb);
  console.log(`\nWrote ${(glb.length / 1024).toFixed(0)}KB to ${outPath}`);
}

// ── Main ────────────────────────────────────────────────────────────

console.log('Building animation library...\n');

const animations = [];
for (const [name, path] of Object.entries(ANIM_SOURCES)) {
  try {
    const anim = extractAnimation(path, name);
    if (anim) animations.push(anim);
  } catch (e) {
    console.warn(`  FAILED ${name}: ${e.message}`);
  }
}

console.log(`\nExtracted ${animations.length} animations`);

const { gltf, bin } = buildLibrary(animations);
const outPath = resolve(PUBLIC, 'models/animation-library.glb');
writeGLB(gltf, bin, outPath);

console.log(`Animations: ${gltf.animations.map(a => a.name).join(', ')}`);
console.log('Done!');
