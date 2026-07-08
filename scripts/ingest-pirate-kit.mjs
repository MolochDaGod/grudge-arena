#!/usr/bin/env node
/**
 * Copy Kenney Pirate Kit (CC0) GLBs + colormap into public/assets/island/pirate-kit/
 *
 * Usage:
 *   node scripts/ingest-pirate-kit.mjs
 *   node scripts/ingest-pirate-kit.mjs --src path/to/kenney_pirate-kit
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  writeFileSync,
} from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, "..");
const DEFAULT_SRC = join(ROOT, "artifacts", "kenney_pirate-kit");
const ZIP_CANDIDATES = [
  "D:/.downloads/kenney_pirate-kit.zip",
  join(ROOT, "artifacts", "kenney_pirate-kit.zip"),
];
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const srcArg = args[0] || (process.argv.includes("--src") ? args[1] : null);
let SRC = resolve(srcArg || DEFAULT_SRC);

function glbSrcDir() {
  return join(SRC, "Models", "GLB format");
}

function ensureKitExtracted() {
  if (existsSync(glbSrcDir())) return;
  for (const zip of ZIP_CANDIDATES) {
    if (!existsSync(zip)) continue;
    console.log(`Extracting ${zip} → artifacts/kenney_pirate-kit`);
    mkdirSync(DEFAULT_SRC, { recursive: true });
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zip.replace(/'/g, "''")}' -DestinationPath '${DEFAULT_SRC.replace(/'/g, "''")}' -Force"`,
      { stdio: "inherit" },
    );
    SRC = DEFAULT_SRC;
    return;
  }
}
ensureKitExtracted();
const GLB_SRC = glbSrcDir();
const TEX_SRC = join(GLB_SRC, "Textures", "colormap.png");
const OUT_GLB = join(ROOT, "public", "assets", "island", "pirate-kit", "glb");
const OUT_TEX = join(OUT_GLB, "Textures");
const MANIFEST = join(ROOT, "public", "assets", "island", "pirate-kit", "manifest.json");

if (!existsSync(GLB_SRC)) {
  console.error(`Missing Kenney Pirate Kit at ${GLB_SRC}`);
  console.error("Place zip at D:/.downloads/kenney_pirate-kit.zip or artifacts/kenney_pirate-kit/");
  console.error("Download: https://kenney.nl/assets/pirate-kit");
  process.exit(1);
}

mkdirSync(OUT_GLB, { recursive: true });
mkdirSync(OUT_TEX, { recursive: true });

const glbs = readdirSync(GLB_SRC).filter((f) => f.endsWith(".glb")).sort();
for (const f of glbs) {
  copyFileSync(join(GLB_SRC, f), join(OUT_GLB, f));
}
if (existsSync(TEX_SRC)) {
  copyFileSync(TEX_SRC, join(OUT_TEX, "colormap.png"));
} else {
  const alt = join(SRC, "Models", "Textures", "colormap.png");
  if (existsSync(alt)) copyFileSync(alt, join(OUT_TEX, "colormap.png"));
}

const manifest = {
  schema: "kenney-pirate-kit/1.0",
  license: "CC0-1.0",
  source: "https://kenney.nl/assets/pirate-kit",
  generated: new Date().toISOString(),
  scale: 0.01,
  colormap: "/assets/island/pirate-kit/glb/Textures/colormap.png",
  models: glbs.map((f) => f.replace(/\.glb$/i, "")),
};
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

console.log(`✔ ${glbs.length} GLBs → public/assets/island/pirate-kit/glb/`);
console.log(`✔ colormap → public/assets/island/pirate-kit/glb/Textures/colormap.png`);
console.log(`✔ manifest → public/assets/island/pirate-kit/manifest.json`);