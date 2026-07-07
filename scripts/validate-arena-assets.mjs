#!/usr/bin/env node
/**
 * Production asset audit — scale, textures, skeleton, baked anims.
 * Gate deploy: npm run validate:assets
 *
 * Writes public/models/assetAudit.json
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import {
  parseGLB,
  effectiveWorldHeight,
  measureRootScale,
  HUMANOID_MIN_M,
  HUMANOID_MAX_M,
  PROP_MAX_M,
  RACE_HEIGHT_SCALE,
} from "./lib/glb-scale.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const PUBLIC = join(ROOT, "public");
const OUT = join(PUBLIC, "models", "assetAudit.json");

const RACES = {
  human: "WK_Characters.glb",
  barbarian: "BRB_Characters.glb",
  elf: "ELF_Characters.glb",
  dwarf: "DWF_Characters.glb",
  orc: "ORC_Characters.glb",
  undead: "UD_Characters.glb",
};

const ATLAS = {
  human: "Map__9.png",
  barbarian: "Map__9.png",
  elf: "Map__9.png",
  dwarf: "Map__12.png",
  orc: "Map__11.webp",
  undead: "Map__11.webp",
};

const REQUIRED_BONES = ["Bip001 Pelvis", "Bip001 Head", "Bip001 L Foot", "Bip001 R Foot"];
const PLACEHOLDER_BYTES = 1024;
/** sprint is cloned from run at runtime — validate source clips only */
const BAKED_LOCO = {
  idle: "sword_shield/sword and shield idle",
  walk: "locomotion/walking",
  run: "sword_shield/sword and shield run",
};

function auditTexture(relPath) {
  const full = join(PUBLIC, relPath.replace(/^\//, ""));
  if (!existsSync(full)) {
    return { ok: false, error: "missing", bytes: 0, path: relPath };
  }
  const bytes = statSync(full).size;
  if (bytes <= PLACEHOLDER_BYTES) {
    return { ok: false, error: "placeholder", bytes, path: relPath };
  }
  return { ok: true, bytes, path: relPath };
}

function auditCharacterGlb(race, fileName) {
  const rel = `assets/characters/${race}/${fileName}`;
  const full = join(PUBLIC, rel);
  const entry = { race, path: `/${rel}`, ok: true, errors: [], warnings: [] };

  if (!existsSync(full)) {
    entry.ok = false;
    entry.errors.push("GLB missing");
    return entry;
  }

  const { json, bin } = parseGLB(full);
  const world = effectiveWorldHeight(json, bin);
  const { maxS, details } = measureRootScale(json);
  const targetH = 1.75 * (RACE_HEIGHT_SCALE[race] ?? 1);

  const h = world.worldHeight;
  const localH = world.height;

  entry.vertexHeightM = parseFloat(localH.toFixed(4));
  entry.worldHeightM = parseFloat(h.toFixed(4));
  entry.rootScale = maxS;
  entry.rootScaleNodes = details;
  entry.targetHeightM = targetH;
  if (h < HUMANOID_MIN_M || h > HUMANOID_MAX_M) {
    entry.ok = false;
    entry.errors.push(`world height ${h.toFixed(2)}m outside ${HUMANOID_MIN_M}–${HUMANOID_MAX_M}m`);
  } else if (Math.abs(h - targetH) / targetH > 0.12) {
    entry.ok = false;
    entry.errors.push(`world ${h.toFixed(2)}m ≠ target ${targetH.toFixed(2)}m — run bake:characters`);
  }
  if (localH > 0 && localH < 0.25 && maxS < 2) {
    entry.warnings.push(
      `local mesh ${localH.toFixed(2)}m with root×${maxS.toFixed(2)} — prefer skinned-root-only bake`,
    );
  }

  const skins = json.skins || [];
  const bones = new Set();
  for (const sk of skins) {
    for (const jid of sk.joints || []) {
      const n = json.nodes?.[jid]?.name;
      if (n) bones.add(n);
    }
  }
  entry.boneCount = bones.size;
  const missingBones = REQUIRED_BONES.filter((b) => !bones.has(b));
  if (missingBones.length) {
    entry.ok = false;
    entry.errors.push(`missing bones: ${missingBones.join(", ")}`);
  }

  const atlasFile = ATLAS[race];
  const tex = auditTexture(`assets/characters/${race}/textures/${atlasFile}`);
  entry.texture = tex;
  if (!tex.ok) {
    entry.ok = false;
    entry.errors.push(`atlas ${tex.error} (${atlasFile})`);
  }

  entry.meshCount = (json.meshes || []).length;
  return entry;
}

function auditIslandProp(rel) {
  const full = join(PUBLIC, rel);
  const name = rel.split("/").pop();
  const entry = { path: rel, ok: true, errors: [] };
  if (!existsSync(full)) {
    entry.ok = false;
    entry.errors.push("missing");
    return entry;
  }
  const { json, bin } = parseGLB(full);
  const w = effectiveWorldHeight(json, bin);
  entry.sizeM = {
    x: parseFloat(w.width.toFixed(2)),
    y: parseFloat(w.height.toFixed(2)),
    z: parseFloat(w.depth.toFixed(2)),
  };
  entry.rootScale = measureRootScale(json).maxS;
  const maxDim = Math.max(w.width, w.height, w.depth) * entry.rootScale;
  if (maxDim > PROP_MAX_M) {
    entry.warnings = [`large prop ${maxDim.toFixed(1)}m — verify intentional`];
  }
  const images = json.images || [];
  const placeholderEmbed = images.some((img) => {
    if (!img.uri?.startsWith("data:")) return false;
    const b64 = img.uri.split(",")[1] || "";
    return Buffer.from(b64, "base64").length <= PLACEHOLDER_BYTES;
  });
  if (placeholderEmbed) {
    entry.warnings = [...(entry.warnings || []), "embedded 1×1 texture — bind external textures"];
  }
  return entry;
}

function auditBakedAnims() {
  const bakedRoot = join(PUBLIC, "anims", "baked");
  const entry = { ok: true, errors: [], clips: {} };
  if (!existsSync(bakedRoot)) {
    entry.ok = false;
    entry.errors.push("public/anims/baked missing — run npm run bake:anim-bank");
    return entry;
  }

  for (const [key, rel] of Object.entries(BAKED_LOCO)) {
    const full = join(bakedRoot, rel + ".json");
    const ok = existsSync(full);
    entry.clips[key] = { ok, path: `anims/baked/${rel}.json` };
    if (!ok) {
      entry.ok = false;
      entry.errors.push(`missing baked clip: ${key}`);
    }
  }
  entry.clips.sprint = { ok: entry.clips.run?.ok, path: "(cloned from run at runtime)" };
  return entry;
}

function countBakedClips(subdir) {
  const root = join(PUBLIC, "anims", "baked", subdir);
  if (!existsSync(root)) return 0;
  let n = 0;
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith(".json")) n++;
    }
  };
  walk(root);
  return n;
}

function auditBoxAnimations() {
  const count = countBakedClips("boxanimations");
  const ingestManifest = join(PUBLIC, "models", "boxAnimIngest.json");
  const entry = { ok: true, count, errors: [] };
  if (count === 0) {
    entry.warnings = ["no boxanimations baked — run npm run pipeline:boxanims"];
    return entry;
  }
  if (existsSync(ingestManifest)) {
    const m = JSON.parse(readFileSync(ingestManifest, "utf8"));
    entry.ingested = m.clips?.length ?? 0;
    if (count < (m.clips?.length ?? 0) * 0.9) {
      entry.warnings = [`baked ${count} < ingested ${m.clips.length} — re-run bake:boxanims`];
    }
  }
  return entry;
}

function main() {
  console.log("\nArena asset validation\n");

  const characters = {};
  let ok = true;

  for (const [race, file] of Object.entries(RACES)) {
    const r = auditCharacterGlb(race, file);
    characters[race] = r;
    const icon = r.ok ? "✔" : "✖";
    console.log(
      `  ${icon} ${race.padEnd(10)} world=${r.worldHeightM?.toFixed(2) ?? "?"}m ` +
        `(local=${r.vertexHeightM?.toFixed(2) ?? "?"}×${r.rootScale?.toFixed(2) ?? "?"}) ` +
        `tex=${r.texture?.ok ? (r.texture.bytes / 1024).toFixed(0) + "KB" : "FAIL"}`,
    );
    if (!r.ok) {
      ok = false;
      for (const e of r.errors) console.log(`      ✖ ${e}`);
    }
    for (const w of r.warnings || []) console.log(`      ⚠ ${w}`);
  }

  const islandProps = [
    "assets/island/forest_pack.glb",
    "assets/island/village/glb/SM_PROP_well.glb",
    "assets/island/village/glb/SM_BLD_body_v01_01.glb",
  ].map(auditIslandProp);

  for (const p of islandProps) {
    const icon = p.ok ? "✔" : "✖";
    console.log(
      `  ${icon} island ${p.path.split("/").pop()} ${p.sizeM ? `${p.sizeM.y.toFixed(1)}m tall` : "missing"}`,
    );
    if (!p.ok) ok = false;
  }

  const manifestPath = join(PUBLIC, "models", "characterManifest.json");
  let prefabAudit = { ok: true, errors: [] };
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.schema !== "arenaPrefab/1.0") {
      prefabAudit.ok = false;
      prefabAudit.errors.push(`schema ${manifest.schema} — run npm run bake:prefabs`);
    }
    for (const race of Object.keys(RACES)) {
      const r = manifest.races?.[race];
      if (!r?.slots || Object.keys(r.slots).length < 5) {
        prefabAudit.ok = false;
        prefabAudit.errors.push(`${race}: missing slots catalog`);
      }
      if (!r?.weaponMappings?.greatsword) {
        prefabAudit.ok = false;
        prefabAudit.errors.push(`${race}: missing weaponMappings`);
      }
    }
    if (!manifest.heroes || Object.keys(manifest.heroes).length < 6) {
      prefabAudit.ok = false;
      prefabAudit.errors.push("heroes catalog incomplete");
    }
    if (!manifest.prefabs || Object.keys(manifest.prefabs).length < 6) {
      prefabAudit.ok = false;
      prefabAudit.errors.push("loadout prefabs incomplete");
    }
    prefabAudit.heroCount = Object.keys(manifest.heroes || {}).length;
    prefabAudit.prefabCount = Object.keys(manifest.prefabs || {}).length;
  } else {
    prefabAudit.ok = false;
    prefabAudit.errors.push("characterManifest.json missing");
  }
  console.log(
    `  ${prefabAudit.ok ? "✔" : "✖"} arenaPrefab/1.0 (${prefabAudit.prefabCount ?? 0} loadouts, ${prefabAudit.heroCount ?? 0} heroes)`,
  );
  if (!prefabAudit.ok) {
    ok = false;
    for (const e of prefabAudit.errors) console.log(`      ✖ ${e}`);
  }

  const baked = auditBakedAnims();
  console.log(`  ${baked.ok ? "✔" : "✖"} baked locomotion clips (${Object.keys(BAKED_LOCO).join(", ")})`);
  if (!baked.ok) {
    ok = false;
    for (const e of baked.errors) console.log(`      ✖ ${e}`);
  }

  const boxAnims = auditBoxAnimations();
  console.log(
    `  ${boxAnims.count > 0 ? "✔" : "○"} boxanimations bank (${boxAnims.count} baked clips)`,
  );
  for (const w of boxAnims.warnings || []) console.log(`      ⚠ ${w}`);

  const report = {
    version: 1,
    generated: new Date().toISOString(),
    ok,
    conventions: {
      units: "metres",
      characterFacingYaw: "Bip001 faces +X at yaw 0; spawn uses π/2 for −Z",
      textureSource: "public/assets/characters/{race}/textures/ — not GLB embed",
      scaleBake: "skinned-root-only — armature scale, vertices+bones bound",
      rootConvention: "feet-midpoint-y0",
      prefabSchema: "arenaPrefab/1.0",
    },
    characters,
    islandProps,
    bakedAnims: baked,
    boxAnimations: boxAnims,
    prefabManifest: prefabAudit,
  };

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\n${ok ? "✅ PASS" : "❌ FAIL"} — report: ${relative(ROOT, OUT)}\n`);

  if (!ok) process.exit(1);
}

main();