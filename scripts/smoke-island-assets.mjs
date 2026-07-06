/**
 * HEAD-check island sandbox static assets on a deployed host.
 * Usage: node scripts/smoke-island-assets.mjs [baseUrl]
 */

const BASE =
  process.argv[2]?.replace(/\/$/, "") ||
  "https://island-crusade-combat-sandbox.vercel.app";

const PATHS = [
  "/assets/island/forest_pack.glb",
  "/assets/island/village/glb/SM_PROP_well.glb",
  "/assets/island/village/textures/T_wood_05_BC.png",
  "/cdn/assets/characters/human/WK_Characters.glb",
  "/cdn/assets/characters/human/textures/Map__9.png",
];

let failed = 0;
for (const path of PATHS) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method: "HEAD" });
  const ok = res.status === 200;
  console.log(`${ok ? "✓" : "✗"} ${res.status} ${path}`);
  if (!ok) failed++;
}

if (failed) {
  console.error(`\n${failed} island asset check(s) failed`);
  process.exit(1);
}
console.log("\nAll island asset URLs reachable.");