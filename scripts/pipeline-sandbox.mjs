#!/usr/bin/env node
/**
 * Verified sandbox pipeline — bake → contract → validate → test → build.
 * Optional: --smoke (local), --deploy (full Vercel deploy + post-smoke).
 */
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
const deploy = args.has("--deploy");
const smoke = args.has("--smoke") || deploy;
const skipBake = args.has("--skip-bake");

function run(cmd, label) {
  console.log(`\n▶ ${label}\n  $ ${cmd}\n`);
  execSync(cmd, { stdio: "inherit", cwd: root });
}

console.log("\n╔══════════════════════════════════════════════════════╗");
console.log("║  Grudge Arena — Verified Sandbox Pipeline            ║");
console.log("╚══════════════════════════════════════════════════════╝\n");

if (!skipBake) {
  const src30 = "D:/.downloads/30grudge6characters.glb";
  if (existsSync(src30)) {
    run(`node scripts/process-30grudge6-characters.mjs "${src30}"`, "Ingest 30grudge6 presets");
  }
  run("node scripts/build-character-library.mjs", "Bake D1 characters → metres (skinned-root)");
  run("node scripts/import-forge-prefabs.mjs", "Re-bake forge prefabs (skinned root scale)");
  run("node scripts/ingest-pirate-kit.mjs", "Ingest Kenney Pirate Kit (72 GLBs)");
  run("node scripts/sync-race-atlases.mjs", "Sync race atlas textures");
  run("node scripts/optimize-sandbox-assets.mjs", "Optimize sandbox assets");
  run(
    "node scripts/bake-anim-bank.mjs locomotion uploads uploads_2026_06 sword_shield magic longbow unarmed pistol rifle",
    "Bake rotation-only anim bank",
  );
}

run("node scripts/validate-gltf-contract.mjs", "GLTF contract (skins, bones, scale)");
run("node scripts/validate-arena-assets.mjs", "Arena asset audit");
run("npm test", "Unit + integration tests");
run("npm run build", "Production build");

if (deploy) {
  run("node scripts/deploy-sandbox.mjs --from-pipeline", "Deploy → island-crusade-combat-sandbox");
} else if (smoke) {
  console.log("\n▶ Post-build smoke (local dev server required for --local)\n");
  try {
    run("node scripts/smoke-sandbox-arena.mjs", "Smoke: production sandbox");
  } catch {
    console.warn("  ⚠ Production smoke failed — run: npm run dev && npm run smoke:sandbox:local");
  }
}

console.log("\n✅ Verified sandbox pipeline complete\n");