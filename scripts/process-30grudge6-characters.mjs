#!/usr/bin/env node
/**
 * process-30grudge6-characters.mjs
 *
 * Ingest D:\.downloads\30grudge6characters.glb (30 base D1 loadouts) and:
 *   1. Extract 6 race atlases → PNG + lossless WebP for grudge6 CDN
 *   2. Split 30 preset GLBs → public/assets/factions + characters/presets
 *   3. Split 6 modular GLBs → public/assets/characters/{race}/*_Characters.glb
 *   4. Write public/models/grudge6-30-catalog.json (race+preset → meshes + atlas hash)
 *
 * Usage:
 *   node scripts/process-30grudge6-characters.mjs [path/to/30grudge6characters.glb]
 *   node scripts/process-30grudge6-characters.mjs --upload   # push WebP + GLBs to R2
 *   node scripts/process-30grudge6-characters.mjs --dry-run
 *
 * Env (upload): R2_BUCKET=grudge-assets (default). Requires wrangler auth for --upload.
 */

import { createHash } from "crypto";
import { execSync } from "child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
} from "fs";
import { resolve, join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import {
  parseGLB,
  extractPresetGlb,
  extractModularGlb,
  meshNamesUnderRoot,
} from "./lib/glb-subgraph.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ARENA_ROOT = resolve(__dir, "..");
const MONO_ROOT = resolve(ARENA_ROOT, "..", "grudge-builder", "vendor", "grudge-character-animator");
const VIEWER_ASSETS = join(MONO_ROOT, "artifacts", "character-viewer", "public", "assets");

const DEFAULT_SRC = "D:/.downloads/30grudge6characters.glb";
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const UPLOAD = process.argv.includes("--upload");
const UPLOAD_ONLY = process.argv.includes("--upload-only");
const DRY = process.argv.includes("--dry-run");
const SRC = resolve(args[0] ?? DEFAULT_SRC);

const R2_BUCKET = process.env.R2_BUCKET || "grudge-assets";

/** Mirrors lib/character-kit gearPresets.ts visibleMeshes (lockstep). */
const RACE_CFG = {
  WK: {
    prefix: "WK",
    arenaRace: "human",
    kitFolder: "western-kingdoms",
    faction: "crusade",
    factionSlug: "western-kingdoms",
    atlasWebp: "WK_Standard_Units.webp",
    atlasCdnKey: "assets/western-kingdoms/textures/WK_Standard_Units.webp",
    arenaAtlas: "Map__9.png",
    glbFile: "WK_Characters.glb",
    presets: {
      unarmed: ["WK_Units_head_A", "WK_Units_Body_B", "WK_Units_Arms_A", "WK_Units_Legs_A"],
      mage: ["WK_Units_head_A", "WK_Units_Body_A", "WK_Units_Arms_A", "WK_Units_Legs_A", "WK_weapon_staff_C"],
      knight: ["WK_Units_head_F", "WK_Units_Body_E", "WK_Units_Arms_D", "WK_Units_Legs_C", "WK_Units_shoulderpads_B", "WK_weapon_sword_B", "WK_Shield_B"],
      ranger: ["WK_Units_head_C", "WK_Units_Body_B", "WK_Units_Arms_B", "WK_Units_Legs_B", "WK_weapon_Bow", "WK_Xtra_quiver"],
      warrior: ["WK_Units_head_D", "WK_Units_Body_C", "WK_Units_Arms_B", "WK_Units_Legs_B", "WK_Units_shoulderpads_A", "WK_weapon_axe_B"],
    },
  },
  BRB: {
    prefix: "BRB",
    arenaRace: "barbarian",
    kitFolder: "barbarians",
    faction: "crusade",
    factionSlug: "barbarians",
    atlasWebp: "BRB_StandardUnits_texture.webp",
    atlasCdnKey: "assets/barbarians/textures/BRB_StandardUnits_texture.webp",
    arenaAtlas: "Map__9.png",
    glbFile: "BRB_Characters.glb",
    presets: {
      unarmed: ["BRB_head_A", "BRB_body_B", "BRB_arms_A", "BRB_legs_A"],
      mage: ["BRB_head_A", "BRB_body_A", "BRB_arms_A", "BRB_legs_A", "BRB_weapon_staff_C"],
      knight: ["BRB_head_F", "BRB_body_F", "BRB_arms_C", "BRB_legs_C", "BRB_shoulderpads_C", "BRB_weapon_sword_B", "BRB_Shield_B"],
      ranger: ["BRB_head_C", "BRB_body_B", "BRB_arms_B", "BRB_legs_B", "BRB_shoulderpads_A", "BRB_weapon_Bow", "BRB_Xtra_quiver"],
      warrior: ["BRB_head_B", "BRB_body_C", "BRB_arms_B", "BRB_legs_B", "BRB_shoulderpads_B", "BRB_weapon_axe_C"],
    },
  },
  DWF: {
    prefix: "DWF",
    arenaRace: "dwarf",
    kitFolder: "dwarves",
    faction: "fabled",
    factionSlug: "dwarves",
    atlasWebp: "DWF_Standard_Units.webp",
    atlasCdnKey: "assets/dwarves/textures/DWF_Standard_Units.webp",
    arenaAtlas: "Map__12.png",
    glbFile: "DWF_Characters.glb",
    presets: {
      unarmed: ["DWF_Units_Head_A", "DWF_Units_Body_B", "DWF_Units_Arms_A", "DWF_Units_Legs_A"],
      mage: ["DWF_Units_Head_A", "DWF_Units_Body_A", "DWF_Units_Arms_A", "DWF_Units_Legs_A", "DWF_Weapon_staff_B"],
      knight: ["DWF_Units_Head_F", "DWF_Units_Body_D", "DWF_Units_Arms_C", "DWF_Units_Legs_C", "DWF_Units_Shoulderpads_C", "DWF_Weapon_sword_B", "DWF_Shield_B"],
      ranger: ["DWF_Units_Head_C", "DWF_Units_Body_B", "DWF_Units_Arms_B", "DWF_Units_Legs_B", "DWF_Units_Shoulderpads_A", "DWF_Weapon_bow", "DWF_Xtra_quiver"],
      warrior: ["DWF_Units_Head_G", "DWF_Units_Body_C", "DWF_Units_Arms_B", "DWF_Units_Legs_B", "DWF_Units_Shoulderpads_B", "DWF_Weapon_axe_C"],
    },
  },
  ELF: {
    prefix: "ELF",
    arenaRace: "elf",
    kitFolder: "elves",
    faction: "fabled",
    factionSlug: "high-elves",
    atlasWebp: "ELF_HighElves_Texture.webp",
    atlasCdnKey: "assets/elves/textures/ELF_HighElves_Texture.webp",
    arenaAtlas: "Map__9.png",
    glbFile: "ELF_Characters.glb",
    presets: {
      unarmed: ["ELF_Units_Head_A", "ELF_Units_Body_B", "ELF_Units_Arms_A", "ELF_Units_Legs_A"],
      mage: ["ELF_Units_Head_B", "ELF_Units_Body_A", "ELF_Units_Arms_A", "ELF_Units_Legs_A", "ELF_weapon_staff_C"],
      knight: ["ELF_Units_Head_G", "ELF_Units_Body_E", "ELF_Units_Arms_C", "ELF_Units_Legs_C", "ELF_Units_Shoulderpads_C", "ELF_weapon_sword_B", "ELF_shield_B"],
      ranger: ["ELF_Units_Head_C", "ELF_Units_Body_B", "ELF_Units_Arms_B", "ELF_Units_Legs_B", "ELF_Units_Shoulderpads_A", "ELF_weapon_bow", "ELF_Xtra_quiver"],
      warrior: ["ELF_Units_Head_D", "ELF_Units_Body_C", "ELF_Units_Arms_B", "ELF_Units_Legs_B", "ELF_Units_Shoulderpads_B", "ELF_weapon_spear"],
    },
  },
  ORC: {
    prefix: "ORC",
    arenaRace: "orc",
    kitFolder: "orcs",
    faction: "legion",
    factionSlug: "orcs",
    atlasWebp: "ORC_StandardUnits.webp",
    atlasCdnKey: "assets/orcs/textures/ORC_StandardUnits.webp",
    arenaAtlas: "Map__11.png",
    glbFile: "ORC_Characters.glb",
    presets: {
      unarmed: ["ORC_Units_Head_A", "ORC_Units_Body_A", "ORC_Units_Arms_A", "ORC_Units_Legs_A"],
      mage: ["ORC_Units_Head_A", "ORC_Units_Body_A", "ORC_Units_Arms_A", "ORC_Units_Legs_A", "ORC_weapon_staff_C"],
      knight: ["ORC_Units_Head_G", "ORC_Units_Body_F", "ORC_Units_Arms_C", "ORC_Units_Legs_C", "ORC_Units_Shoulderpads_F", "ORC_weapon_Axe_C", "ORC_Shield_C"],
      ranger: ["ORC_Units_Head_B", "ORC_Units_Body_B", "ORC_Units_Arms_B", "ORC_Units_Legs_B", "ORC_Units_Shoulderpads_A", "ORC_weapon_Bow", "ORC_Xtra_quiver"],
      warrior: ["ORC_Units_Head_E", "ORC_Units_Body_C", "ORC_Units_Arms_B", "ORC_Units_Legs_B", "ORC_Units_Shoulderpads_C", "ORC_weapon_Axe_B"],
    },
  },
  UD: {
    prefix: "UD",
    arenaRace: "undead",
    kitFolder: "undead",
    faction: "legion",
    factionSlug: "undead",
    atlasWebp: "UD_Standard_Units.webp",
    atlasCdnKey: "assets/undead/textures/UD_Standard_Units.webp",
    arenaAtlas: "Map__11.png",
    glbFile: "UD_Characters.glb",
    presets: {
      unarmed: ["UD_Units_head_A", "UD_Units_body_B", "UD_Units_arms_A", "UD_Units_legs_A"],
      mage: ["UD_Units_head_A", "UD_Units_body_G", "UD_Units_arms_B", "UD_Units_legs_B", "UD_weapon_staff_D"],
      knight: ["UD_Units_head_F", "UD_Units_body_F", "UD_Units_arms_D", "UD_Units_legs_D", "UD_Units_shoulderpads_C", "UD_weapon_Sword_B", "UD_Shield_C"],
      ranger: ["UD_Units_head_C", "UD_Units_body_B", "UD_Units_arms_B", "UD_Units_legs_B", "UD_Units_shoulderpads_A", "UD_weapon_Bow", "UD_Xtra_Quiver"],
      warrior: ["UD_Units_head_G", "UD_Units_body_D", "UD_Units_arms_C", "UD_Units_legs_C", "UD_Units_shoulderpads_B", "UD_weapon_Axe_B"],
    },
  },
};

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function matchPreset(prefix, meshNames) {
  const cfg = RACE_CFG[prefix];
  if (!cfg) return null;
  const sorted = [...meshNames].sort();
  for (const [id, list] of Object.entries(cfg.presets)) {
    const want = [...list].sort();
    if (want.length === sorted.length && want.every((m, i) => m === sorted[i])) return id;
  }
  return null;
}

function extractRaceAtlasPng(json, bin, imageIdx) {
  const img = json.images[imageIdx];
  const bv = json.bufferViews[img.bufferView];
  return bin.slice(bv.byteOffset, bv.byteOffset + bv.byteLength);
}

function firstImageForRoot(json, rootIdx) {
  const nodes = json.nodes;
  let imgIdx = null;
  (function walk(i) {
    const n = nodes[i];
    if (!n) return;
    if (n.mesh != null) {
      const mesh = json.meshes[n.mesh];
      const matIdx = mesh?.primitives?.[0]?.material;
      const mat = json.materials?.[matIdx];
      const tIdx = mat?.pbrMetallicRoughness?.baseColorTexture?.index;
      if (tIdx != null) imgIdx = json.textures[tIdx]?.source ?? imgIdx;
    }
    for (const c of n.children ?? []) walk(c);
  })(rootIdx);
  return imgIdx;
}

async function pngToWebp(pngPath, webpPath) {
  const sharp = (await import("sharp")).default;
  await sharp(pngPath).webp({ lossless: true, effort: 4 }).toFile(webpPath);
}

function wranglerPut(localPath, r2Key, contentType) {
  const cmd = `wrangler r2 object put "${R2_BUCKET}/${r2Key}" --file="${localPath}" --content-type="${contentType}" --remote`;
  if (DRY) {
    console.log(`[dry] ${cmd}`);
    return true;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execSync(cmd, { stdio: "pipe", timeout: 600_000 });
      console.log(`↑ R2 ${r2Key}`);
      return true;
    } catch (err) {
      console.warn(`  ⚠ upload attempt ${attempt}/3 failed: ${r2Key}`);
      if (attempt === 3) {
        console.error(`  ✗ giving up on ${r2Key}`);
        return false;
      }
    }
  }
  return false;
}

async function uploadOutputs(catalog) {
  console.log("\n── R2 upload ──");
  let ok = 0;
  let fail = 0;
  for (const cfg of Object.values(RACE_CFG)) {
    const webpLocal = join(ARENA_ROOT, "public", "textures", "grudge6-atlases", cfg.atlasWebp);
    if (wranglerPut(webpLocal, cfg.atlasCdnKey, "image/webp")) ok++;
    else fail++;
  }
  for (const cfg of Object.values(RACE_CFG)) {
    const glbLocal = join(ARENA_ROOT, "public", "assets", "characters", cfg.arenaRace, cfg.glbFile);
    if (wranglerPut(glbLocal, `arena/assets/characters/${cfg.arenaRace}/${cfg.glbFile}`, "model/gltf-binary")) ok++;
    else fail++;
    if (wranglerPut(glbLocal, `assets/characters/${cfg.arenaRace}/${cfg.glbFile}`, "model/gltf-binary")) ok++;
    else fail++;
  }
  for (const p of catalog.presets) {
    const local = join(ARENA_ROOT, "public", p.glb.replace(/^\//, ""));
    if (wranglerPut(local, `arena${p.glb}`, "model/gltf-binary")) ok++;
    else fail++;
  }
  console.log(`Upload finished: ${ok} ok, ${fail} failed.`);
  return fail === 0;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  process-30grudge6-characters — Forge 30-base ingest    ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const catalogPath = join(ARENA_ROOT, "public", "models", "grudge6-30-catalog.json");
  if (UPLOAD_ONLY) {
    if (!existsSync(catalogPath)) {
      console.error(`Missing catalog — run without --upload-only first: ${catalogPath}`);
      process.exit(1);
    }
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    const ok = await uploadOutputs(catalog);
    process.exit(ok ? 0 : 1);
  }

  if (!existsSync(SRC)) {
    console.error(`Source GLB not found: ${SRC}`);
    process.exit(1);
  }

  console.log(`Source: ${SRC}\n`);

  const buf = readFileSync(SRC);
  const { json, bin } = parseGLB(buf);
  const nodes = json.nodes ?? [];
  const forgeIdx = nodes.findIndex((n) => n.name === "ForgeScene");
  if (forgeIdx < 0) throw new Error("ForgeScene root not found");
  const forge = nodes[forgeIdx];
  const childRoots = forge.children ?? [];
  if (childRoots.length !== 30) {
    console.warn(`Expected 30 character roots, found ${childRoots.length}`);
  }

  const outChars = join(ARENA_ROOT, "public", "assets", "characters");
  const outFactions = join(ARENA_ROOT, "public", "assets", "factions");
  const outPresets = join(outChars, "presets");
  const outAtlases = join(ARENA_ROOT, "public", "textures", "grudge6-atlases");
  const outModels = join(ARENA_ROOT, "public", "models");
  mkdirSync(outPresets, { recursive: true });
  mkdirSync(outAtlases, { recursive: true });
  mkdirSync(outModels, { recursive: true });

  const catalog = {
    schema: "grudge6-30/1.0",
    generated: new Date().toISOString(),
    source: SRC,
    sourceSha256: sha256(buf),
    races: {},
    presets: [],
    atlases: {},
    outputs: { modularGlbs: [], presetGlbs: [], webpAtlases: [] },
  };

  const byPrefix = {};
  for (const rootIdx of childRoots) {
    const names = meshNamesUnderRoot(json, rootIdx);
    const prefix = names[0]?.split("_")[0];
    if (!prefix) continue;
    if (!byPrefix[prefix]) byPrefix[prefix] = [];
    const presetId = matchPreset(prefix, names);
    byPrefix[prefix].push({ rootIdx, names, presetId });
  }

  // ── 1 + 3: per-race atlas + modular GLB ─────────────────────────────
  for (const [prefix, cfg] of Object.entries(RACE_CFG)) {
    const entries = byPrefix[prefix] ?? [];
    if (!entries.length) {
      console.warn(`⚠ No characters for ${prefix}`);
      continue;
    }

    const imgIdx = firstImageForRoot(json, entries[0].rootIdx);
    const png = extractRaceAtlasPng(json, bin, imgIdx);
    const pngPath = join(outAtlases, `${prefix}_body_atlas.png`);
    writeFileSync(pngPath, png);
    const webpPath = join(outAtlases, cfg.atlasWebp);
    await pngToWebp(pngPath, webpPath);
    const webpBuf = readFileSync(webpPath);

    const arenaTexDir = join(outChars, cfg.arenaRace, "textures");
    mkdirSync(arenaTexDir, { recursive: true });
    writeFileSync(join(arenaTexDir, cfg.arenaAtlas.endsWith(".webp") ? cfg.arenaAtlas : cfg.arenaAtlas.replace(/\.png$/, ".png")), png);
    if (cfg.arenaAtlas.endsWith(".webp")) {
      writeFileSync(join(arenaTexDir, cfg.arenaAtlas), webpBuf);
    } else {
      writeFileSync(join(arenaTexDir, cfg.arenaAtlas), png);
    }

    const kitTexDir = join(VIEWER_ASSETS, cfg.kitFolder, "textures");
    mkdirSync(kitTexDir, { recursive: true });
    copyFileSync(webpPath, join(kitTexDir, cfg.atlasWebp));

    catalog.atlases[cfg.arenaRace] = {
      prefix,
      pngSha256: sha256(png),
      webpSha256: sha256(webpBuf),
      pngBytes: png.length,
      webpBytes: webpBuf.length,
      cdnKey: cfg.atlasCdnKey,
      kitPath: `/assets/${cfg.kitFolder}/textures/${cfg.atlasWebp}`,
    };
    catalog.outputs.webpAtlases.push(cfg.atlasCdnKey);

    console.log(`\n── ${prefix} (${cfg.arenaRace}) atlas ──`);
    console.log(`  PNG  ${(png.length / 1048576).toFixed(2)} MB → ${relative(ARENA_ROOT, pngPath)}`);
    console.log(`  WebP ${(webpBuf.length / 1048576).toFixed(2)} MB → ${relative(ARENA_ROOT, webpPath)}`);
    console.log(`  Kit  → ${relative(MONO_ROOT, join(kitTexDir, cfg.atlasWebp))}`);

    const roots = entries.map((e) => e.rootIdx);
    const modularBuf = extractModularGlb(buf, roots, `${cfg.prefix}_Characters`);
    const modularPath = join(outChars, cfg.arenaRace, cfg.glbFile);
    mkdirSync(dirname(modularPath), { recursive: true });
    writeFileSync(modularPath, modularBuf);
    const meshUnion = [...new Set(entries.flatMap((e) => e.names))].sort();
    catalog.races[cfg.arenaRace] = {
      prefix,
      kitFolder: cfg.kitFolder,
      modularGlb: `/assets/characters/${cfg.arenaRace}/${cfg.glbFile}`,
      meshCount: meshUnion.length,
      meshes: meshUnion,
      atlas: catalog.atlases[cfg.arenaRace],
    };
    catalog.outputs.modularGlbs.push(catalog.races[cfg.arenaRace].modularGlb);
    console.log(`  Modular GLB (${meshUnion.length} meshes) → ${relative(ARENA_ROOT, modularPath)}`);
  }

  // ── 2: 30 preset GLBs ─────────────────────────────────────────────
  console.log("\n── Preset GLBs (30) ──");
  for (const rootIdx of childRoots) {
    const names = meshNamesUnderRoot(json, rootIdx);
    const prefix = names[0]?.split("_")[0];
    const cfg = RACE_CFG[prefix];
    if (!cfg) continue;
    const presetId = matchPreset(prefix, names);
    if (!presetId) {
      console.warn(`  ⚠ unmatched preset ${prefix}: ${names.join(", ")}`);
      continue;
    }

    const presetBuf = extractPresetGlb(buf, rootIdx, `${cfg.factionSlug}_${presetId}`);
    let outPath;
    if (presetId === "unarmed") {
      outPath = join(outPresets, `${cfg.factionSlug}_${presetId}.glb`);
    } else {
      const factionDir = join(outFactions, cfg.faction);
      mkdirSync(factionDir, { recursive: true });
      outPath = join(factionDir, `${cfg.factionSlug}_${presetId}.glb`);
    }
    writeFileSync(outPath, presetBuf);

    const imgIdx = firstImageForRoot(json, rootIdx);
    const atlasPng = extractRaceAtlasPng(json, bin, imgIdx);

    catalog.presets.push({
      id: `${cfg.arenaRace}_${presetId}`,
      arenaRace: cfg.arenaRace,
      kitFolder: cfg.kitFolder,
      faction: cfg.faction,
      preset: presetId,
      glb: outPath.replace(join(ARENA_ROOT, "public"), "").replace(/\\/g, "/"),
      visibleMeshes: names,
      atlasSha256: sha256(atlasPng),
      glbSha256: sha256(presetBuf),
      glbBytes: presetBuf.length,
    });
    catalog.outputs.presetGlbs.push(catalog.presets.at(-1).glb);
    console.log(`  ✔ ${cfg.factionSlug}_${presetId} (${names.length} meshes)`);
  }

  writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  console.log(`\nCatalog → ${relative(ARENA_ROOT, catalogPath)}`);
  console.log(`  presets: ${catalog.presets.length}  races: ${Object.keys(catalog.races).length}`);

  if (UPLOAD) {
    await uploadOutputs(catalog);
  } else {
    console.log("\nSkip upload (pass --upload or --upload-only to push to R2 via wrangler).");
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});