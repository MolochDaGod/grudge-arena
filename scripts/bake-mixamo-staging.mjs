#!/usr/bin/env node
/**
 * Bake staged Mixamo GLBs → rotation-only D1 Bip001 JSON clips.
 * Applies mixamoRetarget (spaced bone names) at bake time for consistency.
 *
 * Input:  public/anims/staging/boxanimations/ (recursive .glb)
 * Output: public/anims/baked/boxanimations/<category>/<name>.json
 *
 * Usage:
 *   node scripts/bake-mixamo-staging.mjs [filter substring ...]
 */

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import { remapMixamoClip } from "../src/mixamoRetarget.js";

THREE.TextureLoader.prototype.load = function (_url, onLoad) {
  onLoad?.(new THREE.Texture());
  return new THREE.Texture();
};
THREE.ImageLoader.prototype.load = function (_url, onLoad) {
  onLoad?.({});
};

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const STAGING = join(ROOT, "public", "anims", "staging", "boxanimations");
const OUT = join(ROOT, "public", "anims", "baked", "boxanimations");
const FILTERS = process.argv.slice(2).map((s) => s.toLowerCase());

function walkGlb(dir, base = "") {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walkGlb(p, base ? `${base}/${e}` : e));
    else if (e.endsWith(".glb")) out.push(base ? `${base}/${e.replace(/\.glb$/, "")}` : e.replace(/\.glb$/, ""));
  }
  return out;
}

function loadGlb(path) {
  const buf = readFileSync(path);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(ab, "", resolve, reject);
  });
}

function shouldBake(rel) {
  if (!FILTERS.length) return true;
  const n = rel.toLowerCase();
  return FILTERS.some((f) => n.includes(f));
}

async function main() {
  if (!existsSync(STAGING)) {
    console.error(`Missing staging: ${STAGING}`);
    console.error("Run: node scripts/ingest-boxanimations.mjs");
    process.exit(1);
  }

  const rels = walkGlb(STAGING).sort();
  console.log(`Staging: ${rels.length} GLBs`);

  let baked = 0;
  let skipped = 0;

  for (const rel of rels) {
    if (!shouldBake(rel)) {
      skipped++;
      continue;
    }
    const glbPath = join(STAGING, `${rel}.glb`);
    const gltf = await loadGlb(glbPath);
    if (!gltf.animations?.length) {
      console.warn(`  skip (no anims): ${rel}`);
      skipped++;
      continue;
    }

    const src = gltf.animations[0];
    const clip = remapMixamoClip(src.clone());
    if (!clip.tracks.length) {
      console.warn(`  skip (no quats): ${rel}`);
      skipped++;
      continue;
    }
    if (clip.duration < 0.05 || clip.duration > 30) {
      console.warn(`  skip (duration ${clip.duration.toFixed(2)}s): ${rel}`);
      skipped++;
      continue;
    }

    clip.name = rel;
    const outPath = join(OUT, `${rel}.json`);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(clip.toJSON()));
    console.log(`  ✔ boxanimations/${rel} (${clip.duration.toFixed(2)}s, ${clip.tracks.length} tracks)`);
    baked++;
  }

  console.log(`\nDone: ${baked} baked, ${skipped} skipped → ${relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});