#!/usr/bin/env node
/**
 * Import faction hero GLB zips (crusade / fabled / Legion) into public/assets/factions/.
 * These are pre-composed class heroes (knight/mage/ranger/warrior), not D1 modular rigs.
 * Danger Room baked pipeline still uses public/assets/characters/{race}/*_Characters.glb.
 *
 * Usage: node scripts/import-faction-character-zips.mjs [zipDir]
 * Default zipDir: C:/Users/david/OneDrive/Desktop/MouseWithoutBorders
 */

import { mkdirSync, existsSync, readdirSync, statSync, copyFileSync, rmSync } from "fs";
import { resolve, join, basename, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const OUT = join(ROOT, "public", "assets", "factions");
const DEFAULT_ZIP_DIR = "C:/Users/david/OneDrive/Desktop/MouseWithoutBorders";
const ZIP_DIR = process.argv[2] || DEFAULT_ZIP_DIR;

const ZIP_MAP = {
  "crusade.zip": "crusade",
  "fabled.zip": "fabled",
  "Legion.zip": "legion",
};

const SEVEN_ZIP = process.env.SEVEN_ZIP || "C:/Program Files (x86)/Lua/5.1/7z.exe";

function findGlbFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) findGlbFiles(p, acc);
    else if (/\.glb$/i.test(name)) acc.push(p);
  }
  return acc;
}

function extractZip(zipPath, faction) {
  const dest = join(OUT, faction);
  const staging = join(ROOT, "_extract", "faction-import", faction);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  mkdirSync(dest, { recursive: true });

  try {
    execSync(`"${SEVEN_ZIP}" x "${zipPath}" -o"${staging}" -y`, { stdio: "pipe" });
  } catch (err) {
    const msg = err.stderr?.toString() || err.message;
    console.error(`  ✖ 7z failed: ${msg.trim()}`);
    return { ok: 0, fail: 1 };
  }

  const glbs = findGlbFiles(staging);
  if (!glbs.length) {
    console.error("  ✖ no GLB files found after extract");
    return { ok: 0, fail: 1 };
  }

  for (const src of glbs) {
    const outPath = join(dest, basename(src));
    copyFileSync(src, outPath);
    console.log(`  ✔ ${faction}/${basename(src)} (${(statSync(outPath).size / 1e6).toFixed(2)} MB)`);
  }
  return { ok: glbs.length, fail: 0 };
}

console.log("Import faction hero zips → public/assets/factions/\n");

let totalOk = 0;
let totalFail = 0;

for (const [zipName, faction] of Object.entries(ZIP_MAP)) {
  const zipPath = join(ZIP_DIR, zipName);
  console.log(`── ${zipName} → ${faction}/`);
  if (!existsSync(zipPath)) {
    console.error(`  ✖ missing: ${zipPath}`);
    totalFail++;
    continue;
  }
  const { ok, fail } = extractZip(zipPath, faction);
  totalOk += ok;
  totalFail += fail;
  if (ok === 0 && fail > 0) {
    console.error(`  ✖ archive corrupt or truncated — re-copy ${zipName} from source machine`);
  }
}

console.log(`\nDone: ${totalOk} files imported, ${totalFail} failed`);
if (totalOk > 0) {
  console.log("Modular bake (Danger Room): node scripts/build-character-library.mjs");
}