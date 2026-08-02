#!/usr/bin/env node
/**
 * optimize-sandbox-assets.mjs
 *
 * Sandbox deploy compression:
 *   1. Strip embedded atlas PNGs from character/faction/preset GLBs (runtime binds external WebP)
 *   2. Meshopt-compress island + danger-room props via @gltf-transform/cli
 *
 * Usage:
 *   node scripts/optimize-sandbox-assets.mjs
 *   node scripts/optimize-sandbox-assets.mjs --strip-only
 *   node scripts/optimize-sandbox-assets.mjs --meshopt-only
 */

import { execSync } from "child_process";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from "fs";
import { resolve, join, relative, dirname } from "path";
import { fileURLToPath } from "url";
import { parseGLB, writeGLB } from "./lib/glb-scale.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const STRIP_DIRS = [
  "public/assets/characters",
  "public/assets/factions",
];
const MESHOPT_DIRS = [
  "public/assets/island",
  "public/assets/danger",
];

const args = process.argv.slice(2);
const stripOnly = args.includes("--strip-only");
const meshoptOnly = args.includes("--meshopt-only");
const dry = args.includes("--dry-run");

function walkGlbs(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walkGlbs(p, out);
    else if (ent.name.endsWith(".glb") && !p.includes("pirate-kit")) out.push(p);
  }
  return out;
}

/** Drop embedded image bufferViews — materials get external atlas at runtime. */
function stripEmbeddedAtlases(filePath) {
  const before = statSync(filePath).size;
  const { json, bin } = parseGLB(readFileSync(filePath));
  const images = json.images ?? [];
  if (!images.length) return { skipped: true, before, after: before };

  const dropBv = new Set();
  for (const img of images) {
    if (img.bufferView != null) dropBv.add(img.bufferView);
    if (img.uri?.startsWith("data:")) {
      // Inline data URIs — drop image entry; tiny payload stays in JSON chunk.
    }
  }

  for (const mat of json.materials ?? []) {
    const pbr = mat.pbrMetallicRoughness ?? {};
    if (pbr.baseColorTexture) delete pbr.baseColorTexture;
    if (mat.normalTexture) delete mat.normalTexture;
    if (mat.emissiveTexture) delete mat.emissiveTexture;
    if (!pbr.baseColorFactor) pbr.baseColorFactor = [1, 1, 1, 1];
    mat.pbrMetallicRoughness = pbr;
  }

  json.images = [];
  json.textures = [];
  json.samplers = [];

  const bvs = json.bufferViews ?? [];
  const remap = new Map();
  const kept = [];
  let off = 0;
  const chunks = [];

  for (let i = 0; i < bvs.length; i++) {
    if (dropBv.has(i)) continue;
    const bv = bvs[i];
    const slice = bin.slice(bv.byteOffset, bv.byteOffset + bv.byteLength);
    remap.set(i, kept.length);
    kept.push({ ...bv, byteOffset: off });
    chunks.push(slice);
    off += slice.length;
    const pad = (4 - (off % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      off += pad;
    }
  }

  json.bufferViews = kept;
  const newBin = Buffer.concat(chunks);

  for (const acc of json.accessors ?? []) {
    if (acc.bufferView != null) {
      const next = remap.get(acc.bufferView);
      if (next == null) throw new Error(`orphan accessor bufferView ${acc.bufferView} in ${filePath}`);
      acc.bufferView = next;
    }
    if (acc.sparse) {
      if (acc.sparse.indices?.bufferView != null) {
        acc.sparse.indices.bufferView = remap.get(acc.sparse.indices.bufferView);
      }
      if (acc.sparse.values?.bufferView != null) {
        acc.sparse.values.bufferView = remap.get(acc.sparse.values.bufferView);
      }
    }
  }

  if (!dry) writeFileSync(filePath, writeGLB(json, newBin));
  const after = dry ? before - [...dropBv].reduce((s, i) => s + (bvs[i]?.byteLength ?? 0), 0) : statSync(filePath).size;
  return { skipped: false, before, after };
}

function runMeshopt(filePath) {
  const before = statSync(filePath).size;
  const tmp = `${filePath}.opt.glb`;
  const rel = relative(ROOT, filePath);
  if (dry) {
    console.log(`  [dry] meshopt ${rel}`);
    return { before, after: before };
  }
  try {
    execSync(
      `npx --yes @gltf-transform/cli optimize "${filePath}" "${tmp}" --compress meshopt`,
      { stdio: "pipe", cwd: ROOT, timeout: 120_000 },
    );
    writeFileSync(filePath, readFileSync(tmp));
    try {
      execSync(`del /f "${tmp}"`, { stdio: "pipe", shell: true });
    } catch {
      /* tmp cleanup best-effort on Windows */
    }
  } catch (err) {
    console.warn(`  ⚠ meshopt failed: ${rel} — ${err.message?.slice(0, 80)}`);
    return { before, after: before };
  }
  const after = statSync(filePath).size;
  return { before, after };
}

function fmtKb(n) {
  return `${(n / 1024).toFixed(0)}KB`;
}

console.log("╔═══════════════════════════════════════════════════════╗");
console.log("║  optimize-sandbox-assets — strip atlases + meshopt   ║");
console.log("╚═══════════════════════════════════════════════════════╝\n");

let totalBefore = 0;
let totalAfter = 0;

if (!meshoptOnly) {
  console.log("── Strip embedded atlases (characters / factions) ──");
  for (const rel of STRIP_DIRS) {
    const dir = join(ROOT, rel);
    for (const file of walkGlbs(dir)) {
      const r = stripEmbeddedAtlases(file);
      if (r.skipped) continue;
      totalBefore += r.before;
      totalAfter += r.after;
      const pct = ((1 - r.after / r.before) * 100).toFixed(0);
      console.log(`  ✔ ${relative(ROOT, file)}: ${fmtKb(r.before)} → ${fmtKb(r.after)} (-${pct}%)`);
    }
  }
}

if (!stripOnly) {
  console.log("\n── Meshopt island + danger props ──");
  for (const rel of MESHOPT_DIRS) {
    const dir = join(ROOT, rel);
    for (const file of walkGlbs(dir)) {
      const r = runMeshopt(file);
      totalBefore += r.before;
      totalAfter += r.after;
      if (r.before !== r.after) {
        const pct = ((1 - r.after / r.before) * 100).toFixed(0);
        console.log(`  ✔ ${relative(ROOT, file)}: ${fmtKb(r.before)} → ${fmtKb(r.after)} (-${pct}%)`);
      }
    }
  }
}

const saved = totalBefore - totalAfter;
console.log(
  `\nDone. ${fmtKb(totalBefore)} → ${fmtKb(totalAfter)}` +
    (saved > 0 ? ` (saved ${fmtKb(saved)})` : ""),
);