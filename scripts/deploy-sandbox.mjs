#!/usr/bin/env node
/**
 * Deploy grudge-arena build to island-crusade-combat-sandbox (separate Vercel project).
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

function run(cmd, label) {
  console.log(`\n▶ ${label}\n  $ ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", cwd: root });
}

if (existsSync(projectFile)) {
  writeFileSync(backupFile, readFileSync(projectFile));
}

try {
  run("node scripts/build-character-library.mjs", "Bake character GLBs (vertex scale → metres)");
  run("node scripts/sync-race-atlases.mjs", "Sync real race atlas PNG/WebP");
  run("node scripts/validate-arena-assets.mjs", "Validate scale / textures / anims");
  run(
    "node scripts/bake-anim-bank.mjs locomotion uploads uploads_2026_06 sword_shield magic longbow unarmed pistol rifle",
    "Bake anim-bank → public/anims/baked",
  );
  run("npm run build", "Build");
  run(`vercel link --yes --project ${SANDBOX}`, `Link → ${SANDBOX}`);
  run("vercel --prod --yes", "Deploy → Production");
  console.log("\n✓ Sandbox live: https://island-crusade-combat-sandbox.vercel.app");
} finally {
  if (existsSync(backupFile)) {
    writeFileSync(projectFile, readFileSync(backupFile));
    run(`vercel link --yes --project ${ARENA}`, `Restore link → ${ARENA}`);
  }
}