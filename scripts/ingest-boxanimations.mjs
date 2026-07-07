#!/usr/bin/env node
/**
 * Ingest boxanimations Mixamo FBX → staged GLB (per category).
 *
 * Source: artifacts/boxanimations/boxanimations/*.fbx
 *   (unzip from OneDrive boxanimations.zip first)
 * Output: public/anims/staging/boxanimations/<category>/<name>.glb
 *
 * Usage:
 *   node scripts/ingest-boxanimations.mjs [--dry-run] [--limit N]
 */

import { createRequire } from "module";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { categorizeBoxAnim, shouldSkipBoxAnim } from "./lib/boxanim-categorize.mjs";

const require = createRequire(import.meta.url);
const fbx2gltf = require("../node_modules/fbx2gltf/index.js");

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const SRC = join(ROOT, "artifacts", "boxanimations", "boxanimations");
const STAGING = join(ROOT, "public", "anims", "staging", "boxanimations");
const MANIFEST_OUT = join(ROOT, "public", "models", "boxAnimIngest.json");

const DRY = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : 0;

async function convertFbx(src, dst) {
  mkdirSync(dirname(dst), { recursive: true });
  await fbx2gltf([src.replace(/\\/g, "/")], dst.replace(/\\/g, "/"));
}

async function main() {
  if (!existsSync(SRC)) {
    console.error(`Missing source folder: ${SRC}`);
    console.error("Unzip boxanimations.zip → artifacts/boxanimations/boxanimations/");
    process.exit(1);
  }

  const files = readdirSync(SRC).filter((f) => f.toLowerCase().endsWith(".fbx"));
  console.log(`Found ${files.length} FBX in boxanimations`);

  const manifest = {
    version: 1,
    generated: new Date().toISOString(),
    source: SRC,
    staging: "anims/staging/boxanimations",
    skipped: [],
    clips: [],
  };

  let converted = 0;
  let skipped = 0;

  for (const file of files) {
    if (LIMIT && converted >= LIMIT) break;
    if (shouldSkipBoxAnim(file)) {
      manifest.skipped.push({ file, reason: "non-gameplay" });
      skipped++;
      continue;
    }
    const cat = categorizeBoxAnim(file);
    if (!cat) {
      manifest.skipped.push({ file, reason: "filtered" });
      skipped++;
      continue;
    }

    const rel = `${cat.category}/${cat.name}`;
    const srcPath = join(SRC, file);
    const dstPath = join(STAGING, `${rel}.glb`);

    if (DRY) {
      console.log(`  [dry] ${rel}`);
      manifest.clips.push({ file, category: cat.category, name: cat.name, rel });
      converted++;
      continue;
    }

    try {
      if (!existsSync(dstPath)) {
        await convertFbx(srcPath, dstPath);
      }
      console.log(`  ✔ ${rel}`);
      manifest.clips.push({ file, category: cat.category, name: cat.name, rel });
      converted++;
    } catch (err) {
      console.warn(`  ✖ ${file}: ${err.message}`);
      manifest.skipped.push({ file, reason: err.message });
      skipped++;
    }
  }

  if (!DRY) {
    writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2));
    console.log(`\nManifest: ${MANIFEST_OUT}`);
  }
  console.log(`Done: ${converted} staged, ${skipped} skipped`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});