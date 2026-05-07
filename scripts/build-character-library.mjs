/**
 * build-character-library.mjs
 *
 * Parses every race character GLB, extracts embedded textures to
 * public/assets/characters/{race}/textures/, applies realistic
 * humanoid scale, and writes public/models/characterManifest.json.
 *
 * Usage:  node scripts/build-character-library.mjs
 *
 * No external dependencies — pure Node.js Buffer/fs GLB parsing.
 * GLB spec: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#binary-gltf-layout
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __dir = fileURLToPath(new URL('.', import.meta.url));
const ROOT  = resolve(__dir, '..');
const CHARS = join(ROOT, 'public', 'assets', 'characters');
const OUT   = join(ROOT, 'public', 'models');

// ── Race → GLB filename map ─────────────────────────────────────────
const RACE_MODELS = {
  barbarian: { char: 'barbarian/BRB_Characters.glb',  prefix: 'BRB' },
  dwarf:     { char: 'dwarf/DWF_Characters.glb',      prefix: 'DWF' },
  elf:       { char: 'elf/ELF_Characters.glb',         prefix: 'ELF' },
  human:     { char: 'human/WK_Characters.glb',        prefix: 'WK'  },
  orc:       { char: 'orc/ORC_Characters.glb',         prefix: 'ORC' },
  undead:    { char: 'undead/UD_Characters.glb',        prefix: 'UD'  },
};

// Equipment files per race (arena weapon → GLB path)
const RACE_EQUIPMENT = {
  barbarian: {
    greatsword: 'barbarian/equipment/BRB_weapon_sword.glb',
    scythe:     'barbarian/equipment/BRB_weapon_spear.glb',
    hammer:     'barbarian/equipment/BRB_weapon_hammer.glb',
    staff:      'barbarian/equipment/BRB_weapon_staff.glb',
  },
  dwarf: {},
  elf: {
    spear: 'elf/equipment/ELF_weapon_spear.glb',
    staff: 'elf/equipment/ELF_weapon_staff.glb',
  },
  human: {
    greatsword: 'human/equipment/WK_weapon_sword.glb',
    staff:      'human/equipment/WK_weapon_staff.glb',
  },
  orc: {
    greatsword: 'orc/equipment/ORC_weapon_axe.glb',
    staff:      'orc/equipment/ORC_weapon_staff.glb',
    shield:     'orc/equipment/ORC_Shield.glb',
  },
  undead: {
    spear:  'undead/equipment/UD_weapon_spear.glb',
    staff:  'undead/equipment/UD_weapon_staff.glb',
    sword:  'undead/equipment/UD_weapon_sword.glb',
    shield: 'undead/equipment/UD_Shield.glb',
  },
};

// ── Animation library (weapon pack → named clips) ───────────────────
// These GLBs are animation-only (no mesh) and apply to ANY humanoid rig
// via THREE.AnimationMixer retargeting.
const ANIMATION_PACKS = {
  axe: {
    // locomotion
    idle:         'animations/axe/standing idle.glb',
    idleLook1:    'animations/axe/standing idle looking ver. 1.glb',
    idleLook2:    'animations/axe/standing idle looking ver. 2.glb',
    run:          'animations/axe/standing run forward.glb',
    runBack:      'animations/axe/standing run back.glb',
    walk:         'animations/axe/standing walk forward.glb',
    walkBack:     'animations/axe/standing walk back.glb',
    walkLeft:     'animations/axe/standing walk left.glb',
    walkRight:    'animations/axe/standing walk right.glb',
    jump:         'animations/axe/standing jump.glb',
    crouchIdle:   'animations/axe/crouch idle.glb',
    crouchRise:   'animations/axe/crouch to standing idle.glb',
    turnLeft:     'animations/axe/standing turn left 90.glb',
    turnRight:    'animations/axe/standing turn right 90.glb',
    // combat
    attack1:      'animations/axe/standing melee attack horizontal.glb',
    attack2:      'animations/axe/standing melee attack downward.glb',
    attack3:      'animations/axe/standing melee attack backhand.glb',
    attack4:      'animations/axe/standing melee attack 360 high.glb',
    attack5:      'animations/axe/standing melee attack 360 low.glb',
    combo1:       'animations/axe/standing melee combo attack ver. 1.glb',
    combo2:       'animations/axe/standing melee combo attack ver. 2.glb',
    combo3:       'animations/axe/standing melee combo attack ver. 3.glb',
    jumpAtk:      'animations/axe/standing melee run jump attack.glb',
    kick1:        'animations/axe/standing melee attack kick ver. 1.glb',
    kick2:        'animations/axe/standing melee attack kick ver. 2.glb',
    block:        'animations/axe/standing block idle.glb',
    blockHit:     'animations/axe/standing block react large.glb',
    // reactions
    hurtL:        'animations/axe/standing react large from left.glb',
    hurtR:        'animations/axe/standing react large from right.glb',
    hurtGut:      'animations/axe/standing react large gut.glb',
    // utility
    taunt:        'animations/axe/standing taunt battlecry.glb',
    taunt2:       'animations/axe/standing taunt chest thump.glb',
    equipOver:    'animations/axe/unarmed equip over shoulder.glb',
    equipUnder:   'animations/axe/unarmed equip underarm.glb',
    disarmOver:   'animations/axe/standing disarm over shoulder.glb',
    disarmUnder:  'animations/axe/standing disarm underarm.glb',
    unarmedIdle:  'animations/axe/unarmed idle.glb',
    unarmedRun:   'animations/axe/unarmed run forward.glb',
    unarmedRunB:  'animations/axe/unarmed run back.glb',
    unarmedWalk:  'animations/axe/unarmed walk forward.glb',
    unarmedWalkB: 'animations/axe/unarmed walk back.glb',
  },
  longbow: {
    idle:         'animations/longbow/standing idle 01.glb',
    idleLook:     'animations/longbow/standing idle 02 looking.glb',
    idleExamine:  'animations/longbow/standing idle 03 examine.glb',
    run:          'animations/longbow/standing run forward.glb',
    runBack:      'animations/longbow/standing run back.glb',
    runL:         'animations/longbow/standing run left.glb',
    runR:         'animations/longbow/standing run right.glb',
    walk:         'animations/longbow/standing walk forward.glb',
    walkBack:     'animations/longbow/standing walk back.glb',
    walkLeft:     'animations/longbow/standing walk left.glb',
    walkRight:    'animations/longbow/standing walk right.glb',
    turnLeft:     'animations/longbow/standing turn 90 left.glb',
    turnRight:    'animations/longbow/standing turn 90 right.glb',
    aimOverdraw:  'animations/longbow/standing aim overdraw.glb',
    aimRecoil:    'animations/longbow/standing aim recoil.glb',
    aimWalkFwd:   'animations/longbow/standing aim walk forward.glb',
    aimWalkBack:  'animations/longbow/standing aim walk back.glb',
    aimWalkL:     'animations/longbow/standing aim walk left.glb',
    aimWalkR:     'animations/longbow/standing aim walk right.glb',
    drawArrow:    'animations/longbow/standing draw arrow.glb',
    equipBow:     'animations/longbow/standing equip bow.glb',
    disarmBow:    'animations/longbow/standing disarm bow.glb',
    block:        'animations/longbow/standing block.glb',
    dodgeFwd:     'animations/longbow/standing dodge forward.glb',
    dodgeBack:    'animations/longbow/standing dodge backward.glb',
    dodgeL:       'animations/longbow/standing dodge left.glb',
    dodgeR:       'animations/longbow/standing dodge right.glb',
    dive:         'animations/longbow/standing dive forward.glb',
    kick:         'animations/longbow/standing melee kick.glb',
    punch:        'animations/longbow/standing melee punch.glb',
    hurtFront:    'animations/longbow/standing react small from front.glb',
    hurtHead:     'animations/longbow/standing react small from headshot.glb',
    deathBack:    'animations/longbow/standing death backward 01.glb',
    deathFwd:     'animations/longbow/standing death forward 01.glb',
    fallLoop:     'animations/longbow/fall a loop.glb',
    landRun:      'animations/longbow/fall a land to run forward.glb',
    landIdle:     'animations/longbow/fall a land to standing idle 01.glb',
    unarmedIdle:  'animations/longbow/unarmed idle 01.glb',
  },
  magic: {
    crouchIdle:   'animations/magic/Crouch Idle.glb',
    crouchRise:   'animations/magic/Crouch To Standing Idle.glb',
    crouchTurnL:  'animations/magic/Crouch Turn Left 90.glb',
    crouchTurnR:  'animations/magic/Crouch Turn Right 90.glb',
    crouchWalkB:  'animations/magic/Crouch Walk Back.glb',
    crouchWalkF:  'animations/magic/Crouch Walk Forward.glb',
    crouchWalkL:  'animations/magic/Crouch Walk Left.glb',
    crouchWalkR:  'animations/magic/Crouch Walk Right.glb',
    cast1h1:      'animations/magic/standing 1H cast spell 01.glb',
    attack1h1:    'animations/magic/Standing 1H Magic Attack 01.glb',
    attack1h2:    'animations/magic/Standing 1H Magic Attack 02.glb',
    attack1h3:    'animations/magic/Standing 1H Magic Attack 03.glb',
    cast2h:       'animations/magic/Standing 2H Cast Spell 01.glb',
    aoeAtk1:      'animations/magic/Standing 2H Magic Area Attack 01.glb',
    aoeAtk2:      'animations/magic/Standing 2H Magic Area Attack 02.glb',
    attack2h1:    'animations/magic/Standing 2H Magic Attack 01.glb',
    attack2h2:    'animations/magic/Standing 2H Magic Attack 02.glb',
    attack2h3:    'animations/magic/Standing 2H Magic Attack 03.glb',
    attack2h4:    'animations/magic/Standing 2H Magic Attack 04.glb',
    attack2h5:    'animations/magic/Standing 2H Magic Attack 05.glb',
  },
  // sword_shield pack assumed to exist in same format
};

// ── Weapon type → animation pack mapping ────────────────────────────
// Which animation pack to use for each arena weapon type
const WEAPON_ANIM_PACK = {
  greatsword: 'axe',
  runeblade:  'axe',
  sabres:     'axe',
  scythe:     'axe',
  bow:        'longbow',
  staff:      'magic',
  spear:      'axe',
  hammer:     'axe',
  sword:      'axe',
  shield:     'axe',
};

// ── Race → best default animation pack ──────────────────────────────
const RACE_DEFAULT_PACK = {
  barbarian: 'axe',
  dwarf:     'axe',
  elf:       'longbow',
  human:     'axe',
  orc:       'axe',
  undead:    'magic',
};

// ── Realistic scale constants ────────────────────────────────────────
// Unity FBX → glTF: 1 Unity unit = 1 metre. However many Mixamo/Synty-style
// RTS packs export at 100× (1 unit = 1 cm), giving a character ~0.018 m tall.
// We measure the Y-extent of the root mesh and normalise to HUMANOID_HEIGHT_M.
const HUMANOID_HEIGHT_M  = 1.75; // target humanoid height (metres)
const SCALE_OVERRIDE = {
  // If auto-detection is unreliable, force explicit scale multipliers here.
  // Synty Polygon packs export at ~0.01 scale → multiply by 100.
  // Leave null to use auto-detected normalisation.
  barbarian: null,
  dwarf:     null,
  elf:       null,
  human:     null,
  orc:       null,
  undead:    null,
};

// ────────────────────────────────────────────────────────────────────
//  GLB binary parser
// ────────────────────────────────────────────────────────────────────

function parseGLB(buf) {
  const magic   = buf.readUInt32LE(0);
  const version = buf.readUInt32LE(4);
  if (magic !== 0x46546C67) throw new Error('Not a valid GLB file (bad magic)');
  if (version !== 2)        throw new Error(`Unsupported GLB version: ${version}`);

  let offset = 12;
  let json   = null;
  let binBuf = null;

  while (offset < buf.length) {
    const chunkLen  = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const chunkData = buf.slice(offset + 8, offset + 8 + chunkLen);
    offset += 8 + chunkLen;

    if (chunkType === 0x4E4F534A) { // JSON
      json = JSON.parse(chunkData.toString('utf8'));
    } else if (chunkType === 0x004E4942) { // BIN
      binBuf = chunkData;
    }
  }
  if (!json) throw new Error('GLB missing JSON chunk');
  return { json, bin: binBuf };
}

function writeGLB(json, bin) {
  const jsonStr    = JSON.stringify(json);
  // JSON chunk must be padded to 4-byte boundary with spaces (0x20)
  const jsonPad    = (4 - (jsonStr.length % 4)) % 4;
  const jsonBytes  = Buffer.from(jsonStr + ' '.repeat(jsonPad));
  const jsonChunkLen = jsonBytes.length;

  // BIN chunk padded with 0x00
  const binPad    = bin ? (4 - (bin.length % 4)) % 4 : 0;
  const binBytes  = bin ? Buffer.concat([bin, Buffer.alloc(binPad, 0)]) : Buffer.alloc(0);
  const binChunkLen = binBytes.length;

  const totalLen  = 12
    + 8 + jsonChunkLen
    + (binChunkLen > 0 ? 8 + binChunkLen : 0);

  const out = Buffer.alloc(totalLen);
  let off = 0;

  // Header
  out.writeUInt32LE(0x46546C67, off); off += 4; // magic
  out.writeUInt32LE(2,          off); off += 4; // version
  out.writeUInt32LE(totalLen,   off); off += 4; // length

  // JSON chunk
  out.writeUInt32LE(jsonChunkLen, off); off += 4;
  out.writeUInt32LE(0x4E4F534A,  off); off += 4; // "JSON"
  jsonBytes.copy(out, off); off += jsonChunkLen;

  // BIN chunk (only if present)
  if (binChunkLen > 0) {
    out.writeUInt32LE(binChunkLen, off); off += 4;
    out.writeUInt32LE(0x004E4942, off); off += 4; // "BIN\0"
    binBytes.copy(out, off);
  }

  return out;
}

// ── Extract textures from a parsed GLB ──────────────────────────────
function extractTextures(glbJson, bin, outDir) {
  const images = glbJson.images ?? [];
  const bufferViews = glbJson.bufferViews ?? [];
  const extracted = [];

  mkdirSync(outDir, { recursive: true });

  images.forEach((img, i) => {
    const name     = img.name ?? `texture_${i}`;
    const mimeType = img.mimeType ?? 'image/png';
    const ext      = mimeType === 'image/jpeg' ? '.jpg' : '.png';
    const safeName = name.replace(/[^a-zA-Z0-9_\-]/g, '_') + ext;
    const outPath  = join(outDir, safeName);

    if (typeof img.bufferView === 'number' && bin) {
      const bv   = bufferViews[img.bufferView];
      const data = bin.slice(bv.byteOffset, bv.byteOffset + bv.byteLength);
      writeFileSync(outPath, data);
      extracted.push({ index: i, name, file: safeName, mimeType });
      console.log(`  ✔ texture: ${safeName} (${(bv.byteLength / 1024).toFixed(1)} KB)`);
    } else if (img.uri && img.uri.startsWith('data:')) {
      // base64 embedded URI
      const [header, b64] = img.uri.split(',');
      const data = Buffer.from(b64, 'base64');
      writeFileSync(outPath, data);
      extracted.push({ index: i, name, file: safeName, mimeType });
      console.log(`  ✔ texture (uri): ${safeName}`);
    }
  });

  return extracted;
}

// ── Detect current character height from accessor bounds ────────────
function detectModelHeight(glbJson) {
  const accessors = glbJson.accessors ?? [];
  let maxY = 0;
  let minY = 0;
  for (const acc of accessors) {
    if (acc.type === 'VEC3' && acc.max && acc.min) {
      if (acc.max[1] > maxY) maxY = acc.max[1];
      if (acc.min[1] < minY) minY = acc.min[1];
    }
  }
  return maxY - minY; // total Y extent
}

// ── Apply scale to all root scene nodes ────────────────────────────
// Modifies the glTF JSON in-place to normalise character height.
function applyScale(glbJson, scaleFactor) {
  if (Math.abs(scaleFactor - 1.0) < 0.001) return; // already correct

  const scenes = glbJson.scenes ?? [];
  const nodes  = glbJson.nodes  ?? [];

  // Collect root node indices
  const rootNodeIds = new Set();
  for (const scene of scenes) {
    for (const nid of (scene.nodes ?? [])) {
      rootNodeIds.add(nid);
    }
  }

  rootNodeIds.forEach(nid => {
    const node = nodes[nid];
    if (!node) return;
    if (node.scale) {
      node.scale[0] *= scaleFactor;
      node.scale[1] *= scaleFactor;
      node.scale[2] *= scaleFactor;
    } else {
      node.scale = [scaleFactor, scaleFactor, scaleFactor];
    }
  });

  // Scale accessor bounds so Three.js bounding boxes remain accurate
  const accessors = glbJson.accessors ?? [];
  for (const acc of accessors) {
    if (acc.type === 'VEC3' && acc.max && acc.min) {
      for (let i = 0; i < 3; i++) {
        acc.max[i] *= scaleFactor;
        acc.min[i] *= scaleFactor;
      }
    }
  }
}

// ── Extract mesh names & material info ──────────────────────────────
function extractMeshInfo(glbJson) {
  const meshes    = glbJson.meshes    ?? [];
  const materials = glbJson.materials ?? [];
  const textures  = glbJson.textures  ?? [];
  const images    = glbJson.images    ?? [];

  return meshes.map(mesh => ({
    name:       mesh.name ?? 'unnamed',
    primitives: (mesh.primitives ?? []).map(prim => {
      const mat = prim.material != null ? materials[prim.material] : null;
      let albedoTex = null;
      if (mat?.pbrMetallicRoughness?.baseColorTexture) {
        const tIdx = mat.pbrMetallicRoughness.baseColorTexture.index;
        const img  = images[textures[tIdx]?.source];
        albedoTex  = img?.name ?? null;
      }
      return {
        material: mat?.name ?? null,
        albedoTexture: albedoTex,
      };
    }),
  }));
}

// ── Extract bone / skeleton names ───────────────────────────────────
function extractBoneNames(glbJson) {
  const skins = glbJson.skins ?? [];
  const nodes = glbJson.nodes ?? [];
  return skins.map(skin => ({
    name:  skin.name ?? 'Armature',
    bones: (skin.joints ?? []).map(jid => nodes[jid]?.name ?? `joint_${jid}`),
  }));
}

// ── Extract embedded animation names ────────────────────────────────
function extractAnimationNames(glbJson) {
  return (glbJson.animations ?? []).map(a => a.name ?? 'unnamed');
}

// ────────────────────────────────────────────────────────────────────
//  Main build
// ────────────────────────────────────────────────────────────────────

async function buildCharacterLibrary() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  build-character-library.mjs — Grudge Arena          ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  mkdirSync(OUT, { recursive: true });

  const manifest = {
    version: '2.0.0',
    generated: new Date().toISOString(),
    races: {},
    animationPacks: ANIMATION_PACKS,
    weaponAnimPackMap: WEAPON_ANIM_PACK,
  };

  for (const [race, cfg] of Object.entries(RACE_MODELS)) {
    console.log(`\n── ${race.toUpperCase()} (${cfg.prefix}) ─────────────────────────`);

    const glbPath = join(CHARS, cfg.char);
    if (!existsSync(glbPath)) {
      console.warn(`  ⚠ MISSING: ${cfg.char} — skipping`);
      continue;
    }

    const buf = readFileSync(glbPath);
    let { json, bin } = parseGLB(buf);

    // ── 1. Extract textures ──────────────────────────────────────
    const texDir  = join(CHARS, race, 'textures');
    const texInfo = extractTextures(json, bin, texDir);

    // ── 2. Detect & apply realistic scale ───────────────────────
    const rawHeight = detectModelHeight(json);
    console.log(`  measured Y-extent: ${rawHeight.toFixed(4)} m`);

    let scaleFactor = SCALE_OVERRIDE[race];
    if (scaleFactor === null) {
      if (rawHeight > 0.1) {
        // Already in metres (typical Unity glTF pipeline). Normalise to 1.75m.
        scaleFactor = HUMANOID_HEIGHT_M / rawHeight;
      } else {
        // Very small → likely exported at centimetre scale (×0.01 from Unity).
        // Correct to metres first, then normalise.
        scaleFactor = HUMANOID_HEIGHT_M / (rawHeight * 100);
      }
    }
    console.log(`  scale factor:      ×${scaleFactor.toFixed(4)}`);
    applyScale(json, scaleFactor);

    // ── 3. Write scaled GLB back ─────────────────────────────────
    const outGlbPath = join(CHARS, race, `${cfg.prefix}_Characters.glb`);
    const outBuf = writeGLB(json, bin);
    writeFileSync(outGlbPath, outBuf);
    console.log(`  ✔ scaled GLB: ${outGlbPath.replace(ROOT, '')}`);

    // ── 4. Extract structural metadata ──────────────────────────
    const meshes = extractMeshInfo(json);
    const skins  = extractBoneNames(json);
    const embeddedAnims = extractAnimationNames(json);

    console.log(`  meshes:    ${meshes.map(m => m.name).join(', ')}`);
    console.log(`  skins:     ${skins.map(s => s.name).join(', ')}`);
    if (skins[0]) {
      // Look for key bones (container nodes for weapon attachment)
      const bones = skins[0].bones;
      const keyBones = bones.filter(b =>
        /R_hand|L_hand|R_shield|Hips|Spine|Head|Neck|L_foot|R_foot/i.test(b)
      );
      console.log(`  key bones: ${keyBones.slice(0, 10).join(', ')}`);
    }
    if (embeddedAnims.length) {
      console.log(`  embedded anims: ${embeddedAnims.join(', ')}`);
    }

    // ── 5. Scale equipment GLBs ──────────────────────────────────
    const equipManifest = {};
    for (const [slot, relPath] of Object.entries(RACE_EQUIPMENT[race] ?? {})) {
      const equipSrc = join(CHARS, relPath);
      if (!existsSync(equipSrc)) continue;
      try {
        const ebuf = readFileSync(equipSrc);
        let { json: ej, bin: eb } = parseGLB(ebuf);
        applyScale(ej, scaleFactor); // same scale as character
        writeFileSync(equipSrc, writeGLB(ej, eb));
        equipManifest[slot] = `/assets/characters/${relPath}`;
        console.log(`  ✔ equip scaled: ${relPath}`);
      } catch (e) {
        console.warn(`  ⚠ equip scale failed (${relPath}): ${e.message}`);
      }
    }

    // ── 6. Build race entry in manifest ─────────────────────────
    manifest.races[race] = {
      prefix:       cfg.prefix,
      modelPath:    `/assets/characters/${cfg.char}`,
      scaleFactor:  parseFloat(scaleFactor.toFixed(6)),
      targetHeight: HUMANOID_HEIGHT_M,
      textures:     texInfo.map(t => ({
        name: t.name,
        file: `/assets/characters/${race}/textures/${t.file}`,
        mimeType: t.mimeType,
      })),
      meshNames:    meshes.map(m => m.name),
      skins:        skins.map(s => ({
        name:  s.name,
        bones: s.bones,
      })),
      embeddedAnimations: embeddedAnims,
      equipment:    equipManifest,
      defaultAnimPack: RACE_DEFAULT_PACK[race],
    };
  }

  // ── Write manifest JSON ──────────────────────────────────────────
  const manifestPath = join(OUT, 'characterManifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n✅  Manifest written: ${manifestPath.replace(ROOT, '')}`);
  console.log(`    Races processed: ${Object.keys(manifest.races).join(', ')}`);
}

buildCharacterLibrary().catch(err => {
  console.error('\n❌ Build failed:', err);
  process.exit(1);
});
