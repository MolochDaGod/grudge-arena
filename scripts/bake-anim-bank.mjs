#!/usr/bin/env node
/**
 * Bake rotation-only Bip001 JSON clips from anim-bank.glb → public/anims/baked/.
 * anim-bank already uses Bip001_* bones — no Mixamo retarget needed.
 *
 * Usage:
 *   node scripts/bake-anim-bank.mjs [filter substring ...]
 *   node scripts/bake-anim-bank.mjs locomotion uploads sword_shield magic longbow
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { normalizeBakedBip001Clip } from "../src/mixamoRetarget.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

THREE.TextureLoader.prototype.load = function (_url, onLoad) {
  onLoad?.(new THREE.Texture());
  return new THREE.Texture();
};
THREE.ImageLoader.prototype.load = function (_url, onLoad) {
  onLoad?.({});
};

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const OUT = join(ROOT, "public", "anims", "baked");
const DEFAULT_SRC =
  process.env.ANIM_BANK ||
  "C:/Users/david/OneDrive/Desktop/MouseWithoutBorders/anim-bank.glb";
const FILTERS = process.argv.slice(2).map((s) => s.toLowerCase());

function toRotationOnlyClip(clip) {
  const tracks = clip.tracks.filter((t) => t.name.endsWith(".quaternion"));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function loadGlb(path) {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new GLTFLoader();
  return new Promise((resolveP, reject) => {
    loader.parse(ab, "", (gltf) => resolveP(gltf), reject);
  });
}

function shouldBake(name) {
  if (!FILTERS.length) return true;
  const n = name.toLowerCase();
  return FILTERS.some((f) => n.includes(f));
}

async function main() {
  if (!existsSync(DEFAULT_SRC)) {
    console.error(`Missing anim-bank: ${DEFAULT_SRC}`);
    process.exit(1);
  }

  console.log(`Loading ${DEFAULT_SRC} …`);
  const gltf = await loadGlb(DEFAULT_SRC);
  const clips = gltf.animations || [];
  console.log(`Found ${clips.length} clips`);

  let baked = 0;
  let skipped = 0;

  for (const src of clips) {
    if (!shouldBake(src.name)) {
      skipped++;
      continue;
    }
    const rot = normalizeBakedBip001Clip(toRotationOnlyClip(src));
    if (!rot.tracks.length) {
      console.warn(`  skip (no quats): ${src.name}`);
      skipped++;
      continue;
    }
    if (rot.duration < 0.05 || rot.duration > 30) {
      console.warn(`  skip (duration ${rot.duration.toFixed(2)}s): ${src.name}`);
      skipped++;
      continue;
    }

    const rel = src.name.replace(/\\/g, "/");
    const outPath = join(OUT, `${rel}.json`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(rot.toJSON()));
    console.log(`  ✔ ${rel} (${rot.duration.toFixed(2)}s, ${rot.tracks.length} tracks)`);
    baked++;
  }

  console.log(`\nDone: ${baked} baked, ${skipped} skipped → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});