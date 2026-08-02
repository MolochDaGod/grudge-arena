#!/usr/bin/env node
/**
 * Deploy grudge-arena build to island-crusade-combat-sandbox (separate Vercel project).
 * Use --from-pipeline when bake/validate/test/build already ran via pipeline-sandbox.mjs.
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const vercelDir = resolve(root, ".vercel");
const projectFile = resolve(vercelDir, "project.json");
const backupFile = resolve(vercelDir, "project.grudge-arena.json");
const SANDBOX = "island-crusade-combat-sandbox";
const ARENA = "grudge-arena";
const args = new Set(process.argv.slice(2));
const fromPipeline = args.has("--from-pipeline");
const skipSmoke = args.has("--skip-smoke");

function run(cmd, label) {
  console.log(`\n▶ ${label}\n  $ ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", cwd: root });
}

if (existsSync(projectFile)) {
  writeFileSync(backupFile, readFileSync(projectFile));
}

try {
  if (!fromPipeline) {
    const src30 = "D:/.downloads/30grudge6characters.glb";
    if (existsSync(src30)) {
      run(`node scripts/process-30grudge6-characters.mjs "${src30}"`, "Ingest 30grudge6 presets + modular GLBs");
    }
    run("node scripts/build-character-library.mjs", "Bake character GLBs (skinned root scale → metres)");
    run("node scripts/import-forge-prefabs.mjs", "Re-bake forge prefabs (skinned root scale)");
    run("node scripts/ingest-pirate-kit.mjs", "Ingest Kenney Pirate Kit");
    run("node scripts/sync-race-atlases.mjs", "Sync real race atlas PNG/WebP");
    run("node scripts/optimize-sandbox-assets.mjs", "Strip embedded atlases + meshopt island props");
    run("node scripts/validate-gltf-contract.mjs", "GLTF contract (skins, bones, scale)");
    run("node scripts/validate-arena-assets.mjs", "Validate scale / textures / anims");
    run(
      "node scripts/bake-anim-bank.mjs locomotion uploads uploads_2026_06 sword_shield magic longbow unarmed pistol rifle",
      "Bake anim-bank → public/anims/baked",
    );
    run("npm run build", "Build");
  } else {
    console.log("\n▶ Skipping bake/validate/build (--from-pipeline)\n");
  }

  run(`vercel link --yes --project ${SANDBOX}`, `Link → ${SANDBOX}`);
  run("vercel --prod --yes", "Deploy → Production");
  console.log("\n✓ Sandbox live: https://island-crusade-combat-sandbox.vercel.app");

  if (!skipSmoke) {
    run("node scripts/smoke-sandbox-arena.mjs", "Post-deploy smoke (arena + physics + quality gate)");
  }
} finally {
  if (existsSync(backupFile)) {
    writeFileSync(projectFile, readFileSync(backupFile));
    run(`vercel link --yes --project ${ARENA}`, `Restore link → ${ARENA}`);
  }
}