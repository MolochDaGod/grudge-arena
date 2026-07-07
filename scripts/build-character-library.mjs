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
import {
  parseGLB,
  writeGLB,
  normalizeSkinnedGlbRootScale,
  bakeGlbToMetres,
  effectiveWorldHeight,
  RACE_HEIGHT_SCALE,
} from './lib/glb-scale.mjs';
import {
  buildSlotCatalog,
  WEAPON_EQUIP_MAP,
  WEAPON_ANIM_PACK as BAKED_WEAPON_ANIM_PACK,
  WEAPON_ATTACH_DEFAULTS,
  HERO_PREFABS,
  DEFAULT_ARMOR_LOADOUT,
  buildCharacterLoadoutPrefabs,
  extractSkeletonRefs,
} from './lib/d1-slot-catalog.mjs';

function getRaceTargetHeight(race) {
  if (SCALE_OVERRIDE[race] != null) return HUMANOID_HEIGHT_M * SCALE_OVERRIDE[race];
  return HUMANOID_HEIGHT_M * (RACE_HEIGHT_SCALE[race] ?? 1);
}

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

// GLB parse/write → scripts/lib/glb-scale.mjs (vertex bake + root scale reset)

// Modular GLBs embed a 1×1 PNG (~70 B), not the Synty atlas — sync after bake.
const ATLAS_PLACEHOLDER_BYTES = 1024;
const RACE_ATLAS_FILES = {
  human: 'Map__9.png',
  barbarian: 'Map__9.png',
  elf: 'Map__9.png',
  dwarf: 'Map__12.png',
  orc: 'Map__11.webp',
  undead: 'Map__11.webp',
};

function writeAtlasIfReal(outPath, data, label) {
  const existing = existsSync(outPath) ? readFileSync(outPath) : null;
  if (data.length <= ATLAS_PLACEHOLDER_BYTES) {
    if (existing && existing.length > ATLAS_PLACEHOLDER_BYTES) {
      console.warn(
        `  ⚠ ${label}: GLB embed is ${data.length} B placeholder — kept existing ${(existing.length / 1024).toFixed(0)} KB atlas`,
      );
      return existing.length;
    }
    console.warn(
      `  ⚠ ${label}: ${data.length} B placeholder only — run: node scripts/sync-race-atlases.mjs`,
    );
    writeFileSync(outPath, data);
    return data.length;
  }
  writeFileSync(outPath, data);
  console.log(`  ✔ texture: ${label} (${(data.length / 1024).toFixed(1)} KB)`);
  return data.length;
}

// ── Extract textures from a parsed GLB ──────────────────────────────
function extractTextures(glbJson, bin, outDir, race) {
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
    let byteLen = 0;

    if (typeof img.bufferView === 'number' && bin) {
      const bv   = bufferViews[img.bufferView];
      const data = bin.slice(bv.byteOffset, bv.byteOffset + bv.byteLength);
      byteLen = writeAtlasIfReal(outPath, data, safeName);
    } else if (img.uri && img.uri.startsWith('data:')) {
      const [, b64] = img.uri.split(',');
      const data = Buffer.from(b64, 'base64');
      byteLen = writeAtlasIfReal(outPath, data, safeName);
    }

    if (byteLen > 0) {
      extracted.push({
        index: i,
        name,
        file: safeName,
        mimeType,
        placeholder: byteLen <= ATLAS_PLACEHOLDER_BYTES,
      });
    }
  });

  // Prefer synced atlas path in manifest when GLB only had placeholders.
  const canonical = RACE_ATLAS_FILES[race];
  if (canonical) {
    const canonPath = join(outDir, canonical);
    if (existsSync(canonPath) && readFileSync(canonPath).length > ATLAS_PLACEHOLDER_BYTES) {
      const mime = canonical.endsWith('.webp') ? 'image/webp' : 'image/png';
      return [{
        name: canonical.replace(/\.\w+$/, '').replace(/__/g, ' #'),
        file: canonical,
        mimeType: mime,
        placeholder: false,
      }];
    }
  }

  return extracted;
}

/** Skinned characters — root scale only (vertices + bones stay bound). */
function bakeCharacterGlb(json, bin, targetHeightM) {
  const baked = normalizeSkinnedGlbRootScale(json, bin, targetHeightM);
  console.log(
    `  skinned scale: ${baked.before.worldHeight.toFixed(3)}m → ${baked.after.worldHeight.toFixed(3)}m ` +
      `(root×${baked.before.rootScale.toFixed(2)} → ×${baked.scaleFactor.toFixed(4)})`,
  );
  return baked;
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
    schema: 'arenaPrefab/1.0',
    version: '3.0.0',
    generated: new Date().toISOString(),
    era: 'grudge-warlords',
    pack: 'd1_modular',
    api: {
      manifest: '/models/characterManifest.json',
      characters: '/cdn/assets/characters/{race}/{prefix}_Characters.glb',
      atlases: '/cdn/assets/characters/{race}/textures/{atlas}',
      bakedAnims: '/api/assets/anims/baked/{rel}.json',
      r2Prefix: 'arena',
      r2Base: 'https://assets.grudge-studio.com/arena',
      cdnProxy: '/cdn',
    },
    weaponMappings: WEAPON_EQUIP_MAP,
    attachTuning: WEAPON_ATTACH_DEFAULTS,
    bakedAnimPacks: BAKED_WEAPON_ANIM_PACK,
    animationPacks: ANIMATION_PACKS,
    weaponAnimPackMap: BAKED_WEAPON_ANIM_PACK,
    heroes: {},
    prefabs: {},
    races: {},
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
    const texInfo = extractTextures(json, bin, texDir, race);

    // ── 2. Bake vertices to metres (not node.scale — production import) ──
    const raceTarget = getRaceTargetHeight(race);
    const baked = bakeCharacterGlb(json, bin, raceTarget);
    json = baked.json;
    bin = baked.bin;
    const scaleFactor = baked.scaleFactor;

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
        const eqBefore = effectiveWorldHeight(ej, eb);
        const eqTarget = eqBefore.worldHeight * (raceTarget / baked.before.worldHeight);
        const eqBaked = bakeGlbToMetres(ej, eb, eqTarget);
        writeFileSync(equipSrc, writeGLB(eqBaked.json, eqBaked.bin));
        equipManifest[slot] = `/assets/characters/${relPath}`;
        console.log(`  ✔ equip scaled: ${relPath}`);
      } catch (e) {
        console.warn(`  ⚠ equip scale failed (${relPath}): ${e.message}`);
      }
    }

    const meshNames = meshes.map(m => m.name);
    const slots = buildSlotCatalog(meshNames);
    const skeleton = extractSkeletonRefs(json);

    // ── 6. Build race prefab entry ───────────────────────────────
    manifest.races[race] = {
      id: race,
      prefix: cfg.prefix,
      pack: 'd1_modular',
      model: {
        glb: `/assets/characters/${cfg.char}`,
        path: `/assets/characters/${cfg.char}`,
        scaleFactor: parseFloat(scaleFactor.toFixed(6)),
        targetHeightM: raceTarget,
        bakedWorldHeightM: parseFloat(baked.after.worldHeight.toFixed(4)),
        rootScaleAfterBake: parseFloat(baked.after.rootScale.toFixed(4)),
        scaleMode: 'skinned-root-only',
        rootConvention: 'feet-midpoint-y0',
      },
      modelPath: `/assets/characters/${cfg.char}`,
      scaleFactor: parseFloat(scaleFactor.toFixed(6)),
      targetHeight: raceTarget,
      bakedWorldHeight: parseFloat(baked.after.worldHeight.toFixed(4)),
      rootScaleAfterBake: parseFloat(baked.after.rootScale.toFixed(4)),
      scaleMode: 'skinned-root-only',
      textures: texInfo.map(t => ({
        name: t.name,
        file: `/assets/characters/${race}/textures/${t.file}`,
        mimeType: t.mimeType,
        role: 'bodyAtlas',
      })),
      skeleton,
      slots,
      weaponMappings: WEAPON_EQUIP_MAP,
      defaultLoadout: { armor: { ...DEFAULT_ARMOR_LOADOUT } },
      attachTuning: WEAPON_ATTACH_DEFAULTS,
      animPacks: {
        default: RACE_DEFAULT_PACK[race],
        byWeapon: BAKED_WEAPON_ANIM_PACK,
      },
      meshNames,
      meshCount: meshNames.length,
      skins: skins.map(s => ({
        name: s.name,
        bones: s.bones,
      })),
      embeddedAnimations: embeddedAnims,
      equipment: equipManifest,
      defaultAnimPack: RACE_DEFAULT_PACK[race],
    };
    console.log(`  slots: ${Object.keys(slots).join(', ')}`);
  }

  for (const [heroId, hero] of Object.entries(HERO_PREFABS)) {
    const raceEntry = manifest.races[hero.race];
    if (!raceEntry) continue;
    manifest.heroes[heroId] = {
      ...hero,
      modelPath: raceEntry.modelPath,
      pack: 'd1_modular',
      prefix: raceEntry.prefix,
      defaultLoadout: {
        armor: { ...DEFAULT_ARMOR_LOADOUT },
        weapon: { ...(WEAPON_EQUIP_MAP[hero.defaultWeapon] || {}) },
      },
    };
  }
  manifest.prefabs = buildCharacterLoadoutPrefabs(manifest.races);

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
