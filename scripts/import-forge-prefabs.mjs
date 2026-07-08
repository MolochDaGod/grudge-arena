#!/usr/bin/env node
/**
 * Import 30grudge6characters.glb → per-prefab GLBs for combat sandbox defaults.
 *
 * Usage:
 *   node scripts/import-forge-prefabs.mjs [path/to/30grudge6characters.glb]
 *   FORGE_GLB=D:\.downloads\30grudge6characters.glb node scripts/import-forge-prefabs.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  parseGLB,
  writeGLB,
  normalizeSkinnedGlbRootScale,
  RACE_HEIGHT_SCALE,
} from "./lib/glb-scale.mjs";
import { extractGlbSubgraph } from "./lib/extract-glb-subgraph.mjs";
import {
  FORGE_SANDBOX_LOADOUTS,
  listForgeAuxScenes,
  pickBestScene,
  RACE_PREFIX,
} from "./lib/forge-prefab-catalog.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const OUT_DIR = join(ROOT, "public", "assets", "forge", "prefabs");
const MANIFEST_PATH = join(ROOT, "public", "assets", "forge", "forge-prefab-manifest.json");
const MASTER_COPY = join(ROOT, "public", "assets", "forge", "30grudge6characters.glb");
const HUMANOID_HEIGHT_M = 1.75;

const DEFAULT_SOURCE =
  process.env.FORGE_GLB ||
  process.argv[2] ||
  "D:/.downloads/30grudge6characters.glb";

function raceTargetHeight(race) {
  return HUMANOID_HEIGHT_M * (RACE_HEIGHT_SCALE[race] ?? 1);
}

function patchCharacterManifest(forgeManifest) {
  const manifestPath = join(ROOT, "public", "models", "characterManifest.json");
  if (!existsSync(manifestPath)) {
    console.warn("  ⚠ characterManifest.json missing — run build-character-library first");
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.forge = {
    source: "30grudge6characters.glb",
    masterGlb: "/assets/forge/30grudge6characters.glb",
    manifest: "/assets/forge/forge-prefab-manifest.json",
    combatSandboxDefault: true,
  };

  for (const entry of forgeManifest.prefabs) {
    if (!manifest.prefabs) manifest.prefabs = {};
    const existing = manifest.prefabs[entry.prefabId] || {};
    manifest.prefabs[entry.prefabId] = {
      ...existing,
      kind: "characterLoadout",
      forge: true,
      forgeModelPath: entry.glbPath,
      forgeSceneIndex: entry.sceneIndex,
      race: entry.race,
      weapon: entry.weapon,
      heroId: entry.heroId,
      modelPath: entry.glbPath,
    };
    if (manifest.heroes?.[entry.heroId] && entry.primary) {
      manifest.heroes[entry.heroId].forgeModelPath = entry.glbPath;
      manifest.heroes[entry.heroId].modelPath = entry.glbPath;
    }
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  ✔ patched ${manifestPath.replace(ROOT, "")}`);
}

async function main() {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║  import-forge-prefabs.mjs — Grudge6 forge catalog    ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  if (!existsSync(DEFAULT_SOURCE)) {
    console.error(`✖ Source GLB not found: ${DEFAULT_SOURCE}`);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(dirname(MASTER_COPY), { recursive: true });

  if (!existsSync(MASTER_COPY) && DEFAULT_SOURCE !== MASTER_COPY) {
    console.log(`Copying master → ${MASTER_COPY.replace(ROOT, "")} ...`);
    copyFileSync(DEFAULT_SOURCE, MASTER_COPY);
  }

  const readPath = existsSync(DEFAULT_SOURCE)
    ? DEFAULT_SOURCE
    : existsSync(MASTER_COPY)
      ? MASTER_COPY
      : null;
  if (!readPath) {
    console.error("✖ No forge GLB found (set FORGE_GLB or place master in public/assets/forge/)");
    process.exit(1);
  }

  const buf = readFileSync(readPath);
  let { json, bin } = parseGLB(buf);
  const auxScenes = listForgeAuxScenes(json);
  console.log(`Forge scenes: ${auxScenes.length}`);

  const forgeManifest = {
    version: "1.0.0",
    generated: new Date().toISOString(),
    source: DEFAULT_SOURCE,
    masterGlb: "/assets/forge/30grudge6characters.glb",
    sceneCount: auxScenes.length,
    prefabs: [],
  };

  const usedSceneIndices = new Set();

  for (const loadout of FORGE_SANDBOX_LOADOUTS) {
    const match = pickBestScene(auxScenes, loadout.race, loadout.weapon);
    if (!match) {
      console.warn(`  ⚠ no forge scene for ${loadout.prefabId}`);
      continue;
    }
    if (usedSceneIndices.has(match.index)) {
      console.log(`  ↪ reuse scene ${match.index} for ${loadout.prefabId}`);
    } else {
      usedSceneIndices.add(match.index);
    }

    const subBufRaw = extractGlbSubgraph(json, bin, match.skeletonRoots);
    const sub = parseGLB(subBufRaw);
    const targetH = raceTargetHeight(loadout.race);
    // Skinned subgraph — root scale only (never bake vertices; breaks IBM bind).
    const baked = normalizeSkinnedGlbRootScale(sub.json, sub.bin, targetH);
    const subBuf = writeGLB(baked.json, baked.bin);

    const outName = `${loadout.prefabId}.glb`;
    const outPath = join(OUT_DIR, outName);
    writeFileSync(outPath, subBuf);

    const entry = {
      prefabId: loadout.prefabId,
      heroId: loadout.heroId,
      race: loadout.race,
      weapon: loadout.weapon,
      primary: !!loadout.primary,
      sceneIndex: match.index,
      glbPath: `/assets/forge/prefabs/${outName}`,
      meshCount: match.meshes.length,
      sampleMeshes: match.meshes.slice(0, 6),
    };
    forgeManifest.prefabs.push(entry);
    console.log(
      `  ✔ ${loadout.prefabId} ← scene ${match.index} ` +
        `(${(subBuf.length / 1e6).toFixed(2)} MB, ${match.meshes.length} meshes, ` +
        `root×${baked.scaleFactor.toFixed(3)} → ${baked.after.worldHeight.toFixed(2)}m)`,
    );
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(forgeManifest, null, 2));
  console.log(`\n✅  Forge manifest: ${MANIFEST_PATH.replace(ROOT, "")}`);
  patchCharacterManifest(forgeManifest);
  console.log(`    Prefabs exported: ${forgeManifest.prefabs.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});