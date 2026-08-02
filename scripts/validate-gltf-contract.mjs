#!/usr/bin/env node
/**
 * GLTF contract gate — every D1 character GLB must pass before deploy.
 * Writes public/models/gltfContract.json
 */
import { writeFileSync, existsSync } from "fs";
import { join, dirname, relative } from "path";
import { fileURLToPath } from "url";
import {
  validateCharacterGlbContract,
  GLTF_CONTRACT_VERSION,
} from "./lib/gltf-contract.mjs";
import { RACE_HEIGHT_SCALE } from "./lib/glb-scale.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const PUBLIC = join(ROOT, "public");
const OUT = join(PUBLIC, "models", "gltfContract.json");

const RACES = {
  human: "WK_Characters.glb",
  barbarian: "BRB_Characters.glb",
  elf: "ELF_Characters.glb",
  dwarf: "DWF_Characters.glb",
  orc: "ORC_Characters.glb",
  undead: "UD_Characters.glb",
};

function main() {
  console.log(`\nGLTF contract validation (${GLTF_CONTRACT_VERSION})\n`);

  const characters = {};
  let ok = true;

  for (const [race, file] of Object.entries(RACES)) {
    const rel = `assets/characters/${race}/${file}`;
    const full = join(PUBLIC, rel);
    if (!existsSync(full)) {
      characters[race] = { ok: false, path: rel, errors: ["GLB missing"] };
      ok = false;
      console.log(`  ✖ ${race.padEnd(10)} MISSING ${rel}`);
      continue;
    }

    const targetH = 1.75 * (RACE_HEIGHT_SCALE[race] ?? 1);
    const r = validateCharacterGlbContract(full, { race, targetHeightM: targetH });
    characters[race] = r;
    const icon = r.ok ? "✔" : "✖";
    console.log(
      `  ${icon} ${race.padEnd(10)} ${r.worldHeightM.toFixed(2)}m ` +
        `joints=${r.skin.totalJoints - r.skin.nullJoints}/${r.skin.totalJoints} ` +
        `bones=${r.boneCount} sha=${r.sha256?.slice(0, 8) ?? "?"}`,
    );
    for (const e of r.errors) console.log(`      ✖ ${e}`);
    for (const w of r.warnings || []) console.log(`      ⚠ ${w}`);
    if (!r.ok) ok = false;
  }

  const report = {
    version: 1,
    contract: GLTF_CONTRACT_VERSION,
    generated: new Date().toISOString(),
    ok,
    characters,
  };

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\n${ok ? "✅ PASS" : "❌ FAIL"} — ${relative(ROOT, OUT)}\n`);
  if (!ok) process.exit(1);
}

main();