#!/usr/bin/env node
/**
 * Sync real race atlas textures into public/assets/characters/{race}/textures/.
 *
 * Modular *_Characters.glb only embed a 1×1 PNG data-URI (70 bytes) — NOT the Synty atlas.
 * Sources (in order):
 *   1. Faction hero GLB body_atlas bufferView (crusade/fabled zips)
 *   2. grudge6 CDN WebP (assets.grudge-studio.com/assets/{faction}/textures/*.webp)
 *
 * Edit atlases here after running:
 *   public/assets/characters/{race}/textures/Map__*.png|.webp
 *
 * Usage: node scripts/sync-race-atlases.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const CHARS = join(ROOT, "public", "assets", "characters");
const FACTIONS = join(ROOT, "public", "assets", "factions");
const GRUDGE6 = "https://assets.grudge-studio.com";

/** @type {Record<string, { outFile: string, heroGlb?: string, webpUrl?: string }>} */
const RACE_ATLAS = {
  human: {
    outFile: "Map__9.png",
    heroGlb: join(FACTIONS, "crusade", "western-kingdoms_warrior.glb"),
    webpUrl: `${GRUDGE6}/assets/western-kingdoms/textures/WK_Standard_Units.webp`,
  },
  barbarian: {
    outFile: "Map__9.png",
    heroGlb: join(FACTIONS, "crusade", "barbarians_warrior.glb"),
    webpUrl: `${GRUDGE6}/assets/barbarians/textures/BRB_StandardUnits_texture.webp`,
  },
  elf: {
    outFile: "Map__9.png",
    heroGlb: join(FACTIONS, "fabled", "high-elves_ranger.glb"),
    webpUrl: `${GRUDGE6}/assets/elves/textures/ELF_HighElves_Texture.webp`,
  },
  dwarf: {
    outFile: "Map__12.png",
    heroGlb: join(FACTIONS, "fabled", "dwarves_warrior.glb"),
    webpUrl: `${GRUDGE6}/assets/dwarves/textures/DWF_Standard_Units.webp`,
  },
  orc: {
    outFile: "Map__11.webp",
    webpUrl: `${GRUDGE6}/assets/orcs/textures/ORC_StandardUnits.webp`,
  },
  undead: {
    outFile: "Map__11.webp",
    webpUrl: `${GRUDGE6}/assets/undead/textures/UD_Standard_Units.webp`,
  },
};

function parseGLB(buf) {
  const jl = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + jl).toString("utf8"));
  let bin = null;
  let off = 12;
  while (off < buf.length) {
    const cl = buf.readUInt32LE(off);
    const ct = buf.readUInt32LE(off + 4);
    const cd = buf.slice(off + 8, off + 8 + cl);
    off += 8 + cl;
    if (ct === 0x004e4942) bin = cd;
  }
  return { json, bin };
}

function extractHeroAtlas(glbPath) {
  const buf = readFileSync(glbPath);
  const { json, bin } = parseGLB(buf);
  const img = json.images?.[0];
  if (!img) return null;
  if (img.uri?.startsWith("data:")) {
    return Buffer.from(img.uri.split(",")[1], "base64");
  }
  if (img.bufferView != null && bin) {
    const bv = json.bufferViews[img.bufferView];
    return bin.slice(bv.byteOffset, bv.byteOffset + bv.byteLength);
  }
  return null;
}

async function fetchWebp(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  console.log("Sync race atlases → public/assets/characters/{race}/textures/\n");
  const manifestPath = join(ROOT, "public", "models", "characterManifest.json");
  const manifest = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : { version: "2.0.0", races: {} };

  for (const [race, cfg] of Object.entries(RACE_ATLAS)) {
    const outDir = join(CHARS, race, "textures");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, cfg.outFile);
    let data = null;
    let source = "";

    if (cfg.heroGlb && existsSync(cfg.heroGlb)) {
      data = extractHeroAtlas(cfg.heroGlb);
      if (data?.length > 1024) source = `hero:${cfg.heroGlb}`;
    }

    if ((!data || data.length <= 1024) && cfg.webpUrl) {
      try {
        data = await fetchWebp(cfg.webpUrl);
        source = `cdn:${cfg.webpUrl}`;
      } catch (err) {
        console.error(`  ✖ ${race}: CDN fetch failed — ${err.message}`);
      }
    }

    if (!data || data.length <= 1024) {
      console.error(`  ✖ ${race}: no valid atlas (got ${data?.length ?? 0} bytes)`);
      continue;
    }

    writeFileSync(outPath, data);
    const rel = `/assets/characters/${race}/textures/${cfg.outFile}`;
    console.log(`  ✔ ${race}: ${cfg.outFile} (${(data.length / 1024).toFixed(0)} KB) ← ${source}`);

    const texEntry = {
      name: cfg.outFile.replace(/\.\w+$/, "").replace(/__/g, " #"),
      file: rel,
      mimeType: cfg.outFile.endsWith(".webp") ? "image/webp" : "image/png",
      role: "bodyAtlas",
      source,
      bytes: data.length,
    };
    if (!manifest.races[race]) {
      console.warn(`  ⚠ ${race}: no race entry in manifest — run npm run bake:characters first`);
      manifest.races[race] = { textures: [texEntry] };
    } else {
      const prev = manifest.races[race];
      manifest.races[race] = {
        ...prev,
        textures: [texEntry],
      };
    }
  }

  manifest.generated = new Date().toISOString();
  if (!manifest.schema) manifest.schema = "arenaPrefab/1.0";
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n✅ Manifest updated: ${manifestPath}`);
  console.log("Edit atlas files directly, then redeploy. Re-run: node scripts/sync-race-atlases.mjs");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});