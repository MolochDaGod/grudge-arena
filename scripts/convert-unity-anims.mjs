/**
 * convert-unity-anims.mjs
 *
 * Converts FBX weapon-skill animations from the Grudge-Studio-Game
 * 3dmotion zombie-shooter project into GLB files for use in grudge-arena.
 *
 * All source FBX files are Mixamo-rigged exports → remapClipBoneNames()
 * in modelLoader.js will retarget them onto the Bip001 Synty characters.
 *
 * Usage: node scripts/convert-unity-anims.mjs
 *
 * Output structure mirrors the existing packs in public/assets/animations/.
 * Adds a new "unity_melee", "unity_shield_sword", "unity_staff", "unity_bow"
 * subfolder alongside the existing axe/sword_shield/magic/longbow packs.
 */

import { createRequire } from 'module';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// fbx2gltf is a CJS module, load via createRequire
const require = createRequire(import.meta.url);
const fbx2gltf = require('../node_modules/fbx2gltf/index.js');

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SRC_BASE  = 'F:/GitHub/Grudge-Studio-Game/Grudge-Studio-Game/3dmotion/artifacts/zombie-shooter/public/models/animations';

// Destination pack dirs inside public/assets/animations/
const DST_BASE  = join(REPO_ROOT, 'public/assets/animations');

// Mapping: { srcSubdir/file.fbx -> dstSubdir/destName.glb }
// We merge useful clips into existing packs (or add supplemental "3dmotion" packs).
const CONVERSIONS = [
  // ── Melee (greatsword / scythe / unarmed) → axe pack ──────────────────
  { src: 'melee/melee idle.fbx',           dst: 'axe_3dm/melee idle.glb' },
  { src: 'melee/melee run.fbx',            dst: 'axe_3dm/melee run.glb' },
  { src: 'melee/melee run backward.fbx',   dst: 'axe_3dm/melee run back.glb' },
  { src: 'melee/melee walk forward.fbx',   dst: 'axe_3dm/melee walk.glb' },
  { src: 'melee/melee walk backward.fbx',  dst: 'axe_3dm/melee walk back.glb' },
  { src: 'melee/melee strafe left.fbx',    dst: 'axe_3dm/melee strafe left.glb' },
  { src: 'melee/melee strafe right.fbx',   dst: 'axe_3dm/melee strafe right.glb' },
  { src: 'melee/melee attack 1.fbx',       dst: 'axe_3dm/melee attack 1.glb' },
  { src: 'melee/melee attack 2.fbx',       dst: 'axe_3dm/melee attack 2.glb' },
  { src: 'melee/melee attack 3.fbx',       dst: 'axe_3dm/melee attack 3.glb' },
  { src: 'melee/melee combo 1.fbx',        dst: 'axe_3dm/melee combo 1.glb' },
  { src: 'melee/melee combo 2.fbx',        dst: 'axe_3dm/melee combo 2.glb' },
  { src: 'melee/melee combo 3.fbx',        dst: 'axe_3dm/melee combo 3.glb' },
  { src: 'melee/melee block.fbx',          dst: 'axe_3dm/melee block.glb' },
  { src: 'melee/melee jump.fbx',           dst: 'axe_3dm/melee jump.glb' },
  { src: 'melee/melee crouch idle.fbx',    dst: 'axe_3dm/melee crouch.glb' },

  // ── Shield-Sword (sabres / runeblade) → sword_shield_3dm pack ─────────
  { src: 'shield-sword/ssIdle.fbx',        dst: 'sword_shield_3dm/ss idle.glb' },
  { src: 'shield-sword/ssRunFwd.fbx',      dst: 'sword_shield_3dm/ss run.glb' },
  { src: 'shield-sword/ssRunBwd.fbx',      dst: 'sword_shield_3dm/ss run back.glb' },
  { src: 'shield-sword/ssStrafeL.fbx',     dst: 'sword_shield_3dm/ss strafe left.glb' },
  { src: 'shield-sword/ssStrafeR.fbx',     dst: 'sword_shield_3dm/ss strafe right.glb' },
  { src: 'shield-sword/ssAttack1.fbx',     dst: 'sword_shield_3dm/ss attack 1.glb' },
  { src: 'shield-sword/ssAttack2.fbx',     dst: 'sword_shield_3dm/ss attack 2.glb' },
  { src: 'shield-sword/ssAttack3.fbx',     dst: 'sword_shield_3dm/ss attack 3.glb' },
  { src: 'shield-sword/ssAttack4.fbx',     dst: 'sword_shield_3dm/ss attack 4.glb' },
  { src: 'shield-sword/ssBlock.fbx',       dst: 'sword_shield_3dm/ss block.glb' },
  { src: 'shield-sword/ssBlockIdle.fbx',   dst: 'sword_shield_3dm/ss block idle.glb' },
  { src: 'shield-sword/ssBlockHit.fbx',    dst: 'sword_shield_3dm/ss block hit.glb' },
  { src: 'shield-sword/ssDrawSword.fbx',   dst: 'sword_shield_3dm/ss draw sword.glb' },

  // ── Staff (staff / wand) → magic_3dm pack ─────────────────────────────
  { src: 'staff/staffIdle.fbx',            dst: 'magic_3dm/staff idle.glb' },
  { src: 'staff/staffIdle2.fbx',           dst: 'magic_3dm/staff idle 2.glb' },
  { src: 'staff/staffRunFwd.fbx',          dst: 'magic_3dm/staff run.glb' },
  { src: 'staff/staffRunBwd.fbx',          dst: 'magic_3dm/staff run back.glb' },
  { src: 'staff/staffWalkFwd.fbx',         dst: 'magic_3dm/staff walk.glb' },
  { src: 'staff/staffWalkBwd.fbx',         dst: 'magic_3dm/staff walk back.glb' },
  { src: 'staff/staffCast1.fbx',           dst: 'magic_3dm/staff cast 1.glb' },
  { src: 'staff/staffCast2.fbx',           dst: 'magic_3dm/staff cast 2.glb' },
  { src: 'staff/staffHitLarge.fbx',        dst: 'magic_3dm/staff hit large.glb' },
  { src: 'staff/staffHitSmall.fbx',        dst: 'magic_3dm/staff hit small.glb' },
  { src: 'staff/staffDeath.fbx',           dst: 'magic_3dm/staff death.glb' },
  { src: 'staff/staffJump.fbx',            dst: 'magic_3dm/staff jump.glb' },

  // ── Bow → longbow_3dm pack ─────────────────────────────────────────────
  { src: 'bow/bowIdle.fbx',               dst: 'longbow_3dm/bow idle.glb' },
  { src: 'bow/bowRunFwd.fbx',             dst: 'longbow_3dm/bow run.glb' },
  { src: 'bow/bowRunBwd.fbx',             dst: 'longbow_3dm/bow run back.glb' },
  { src: 'bow/bowWalkFwd.fbx',            dst: 'longbow_3dm/bow walk.glb' },
  { src: 'bow/bowWalkBwd.fbx',            dst: 'longbow_3dm/bow walk back.glb' },
  { src: 'bow/bowStrafeL.fbx',            dst: 'longbow_3dm/bow strafe left.glb' },
  { src: 'bow/bowStrafeR.fbx',            dst: 'longbow_3dm/bow strafe right.glb' },
  { src: 'bow/bowAim.fbx',               dst: 'longbow_3dm/bow aim.glb' },
  { src: 'bow/bowAimWalkFwd.fbx',         dst: 'longbow_3dm/bow aim walk fwd.glb' },
  { src: 'bow/bowAimWalkBwd.fbx',         dst: 'longbow_3dm/bow aim walk bwd.glb' },
  { src: 'bow/bowAimStrafeL.fbx',         dst: 'longbow_3dm/bow aim strafe left.glb' },
  { src: 'bow/bowAimStrafeR.fbx',         dst: 'longbow_3dm/bow aim strafe right.glb' },
  { src: 'bow/bowDraw.fbx',              dst: 'longbow_3dm/bow draw.glb' },
  { src: 'bow/bowFire.fbx',              dst: 'longbow_3dm/bow fire.glb' },
  { src: 'bow/bowBlock.fbx',             dst: 'longbow_3dm/bow block.glb' },
  { src: 'bow/bowJump.fbx',              dst: 'longbow_3dm/bow jump.glb' },
];

async function main() {
  console.log('\n🔄 Converting Unity weapon animations FBX → GLB\n');

  let ok = 0, fail = 0;

  for (const { src, dst } of CONVERSIONS) {
    const srcPath = join(SRC_BASE, src).replace(/\//g, '\\');
    const dstPath = join(DST_BASE, dst);
    const dstDir  = dirname(dstPath);

    if (!existsSync(srcPath)) {
      console.warn(`  ⚠ MISSING source: ${src}`);
      fail++;
      continue;
    }

    mkdirSync(dstDir, { recursive: true });

    try {
      // fbx2gltf is a Node.js function: fbx2gltf(inputs[], outputPath) -> Promise<string>
      await fbx2gltf([srcPath.replace(/\\/g, '/')], dstPath.replace(/\\/g, '/'));
      console.log(`  ✓ ${src.split('/').pop()} → ${dst}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${src}: ${err.message?.split('\n')[0] || err}`);
      fail++;
    }
  }

  console.log(`\nDone. ✓ ${ok} converted   ✗ ${fail} failed`);
  if (ok > 0) {
    console.log('\nNext: run  node scripts/sync-assets-r2.mjs  to upload to R2');
    console.log('Then add the new packs to ANIM_FILE_MAP in src/modelLoader.js');
  }
}

main().catch(console.error);
