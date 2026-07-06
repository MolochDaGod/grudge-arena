/**
 * Convert Fantastic Village Pack FBX props → GLB for island hub.
 * Requires devDependency: fbx2gltf
 *
 * Usage: npm run convert:island-village
 */

import { createRequire } from "module";
import { existsSync, mkdirSync, readdirSync, copyFileSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const fbx2gltf = require("../node_modules/fbx2gltf/index.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PROP_DIR = join(ROOT, "public/assets/island/village/props");
const GLB_DIR = join(ROOT, "public/assets/island/village/glb");
const TEX_DIR = join(ROOT, "public/assets/island/village/textures");

const LAYOUT_FILES = [
  "SM_BLD_base_v01_01.fbx",
  "SM_BLD_body_v01_01.fbx",
  "SM_BLD_chimney_v01_03.fbx",
  "SM_BLD_waterwheel_construct.fbx",
  "SM_PROP_well.fbx",
  "SM_PROP_campfire.fbx",
  "SM_PROP_cart_03.fbx",
  "SM_PROP_barrel_01.fbx",
  "SM_PROP_crate_01.fbx",
  "SM_PROP_fence_v01_01.fbx",
  "SM_PROP_fence_v01_02.fbx",
  "SM_PROP_fence_v01_03.fbx",
  "SM_PROP_fence_door_gate.fbx",
];

function ensureTextureAliases() {
  const bc = join(TEX_DIR, "T_stonebrick_02_BC.png");
  const plain = join(TEX_DIR, "T_stonebrick_02.png");
  if (existsSync(bc) && !existsSync(plain)) {
    copyFileSync(bc, plain);
    console.log("  ↳ alias T_stonebrick_02.png ← T_stonebrick_02_BC.png");
  }
}

async function main() {
  console.log("\n🏘  Converting island village FBX → GLB\n");
  mkdirSync(GLB_DIR, { recursive: true });
  ensureTextureAliases();

  let ok = 0;
  let fail = 0;

  for (const file of LAYOUT_FILES) {
    const src = join(PROP_DIR, file);
    const dst = join(GLB_DIR, file.replace(/\.fbx$/i, ".glb"));
    if (!existsSync(src)) {
      console.warn(`  ⚠ missing ${file}`);
      fail++;
      continue;
    }
    try {
      await fbx2gltf([src.replace(/\\/g, "/")], dst.replace(/\\/g, "/"));
      console.log(`  ✓ ${file} → glb/${basename(dst)}`);
      ok++;
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message?.split("\n")[0] || err}`);
      fail++;
    }
  }

  console.log(`\nDone. ✓ ${ok} converted   ✗ ${fail} failed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});