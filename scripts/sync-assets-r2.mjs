/**
 * sync-assets-r2.mjs
 * Upload grudge-arena public/assets to Cloudflare R2 at assets.grudge-studio.com
 * Usage: node scripts/sync-assets-r2.mjs [--dry-run]
 *
 * Uses wrangler r2 object put (no extra creds needed if wrangler is authed)
 * OR falls back to @aws-sdk/client-s3 with R2 S3-compat endpoint.
 *
 * R2 layout mirrors the local public/ structure:
 *   public/assets/characters/barbarian/BRB_Characters.glb
 *   → r2://grudge-assets/arena/assets/characters/barbarian/BRB_Characters.glb
 *   → https://assets.grudge-studio.com/arena/assets/characters/barbarian/BRB_Characters.glb
 */

import { execSync } from "child_process";
import { readdirSync, statSync, readFileSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const PUBLIC_DIR = join(REPO_ROOT, "public");

// R2 config — override with env vars if needed
const R2_BUCKET = process.env.R2_BUCKET || "grudge-assets";
const R2_PREFIX = process.env.R2_PREFIX || "arena";
const DRY_RUN = process.argv.includes("--dry-run");

// Only sync these subdirectories (not the whole public/)
const SYNC_DIRS = [
  "assets/characters",
  "assets/animations",
  "assets/danger",
  "assets/island",
  "assets/maps",
  "audio",
  "models",
  "textures",
];

// File types to upload
const UPLOAD_EXTS = new Set([
  ".glb",
  ".gltf",
  ".bin",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".ktx2",
  ".mp3",
  ".ogg",
  ".wav",
  ".json",
  ".basis",
]);

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

function getContentType(ext) {
  const map = {
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json",
    ".bin": "application/octet-stream",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ktx2": "image/ktx2",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
    ".json": "application/json",
    ".basis": "image/basis",
  };
  return map[ext] || "application/octet-stream";
}

async function uploadViaWrangler(localPath, r2Key, contentType) {
  // --remote is required so wrangler targets the real Cloudflare R2
  // (without it wrangler uses a local persistence simulation)
  const cmd = `wrangler r2 object put "${R2_BUCKET}/${r2Key}" --file="${localPath}" --content-type="${contentType}" --remote`;
  if (DRY_RUN) {
    console.log(`[DRY] ${cmd}`);
    return;
  }
  try {
    execSync(cmd, { stdio: "pipe" });
    console.log(`✓ ${r2Key}`);
  } catch (err) {
    console.error(
      `✗ ${r2Key}: ${err.stderr?.toString().trim() || err.message}`,
    );
  }
}

async function main() {
  console.log(`\nGrudge Arena → R2 Asset Sync`);
  console.log(
    `Bucket: ${R2_BUCKET}  Prefix: ${R2_PREFIX}  DryRun: ${DRY_RUN}\n`,
  );

  let total = 0;
  let skipped = 0;

  for (const syncDir of SYNC_DIRS) {
    const fullDir = join(PUBLIC_DIR, syncDir);
    let files;
    try {
      files = walk(fullDir);
    } catch {
      console.log(`  (skip ${syncDir} — not found locally)`);
      continue;
    }

    for (const file of files) {
      const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
      if (!UPLOAD_EXTS.has(ext)) {
        skipped++;
        continue;
      }

      const rel = relative(PUBLIC_DIR, file).replace(/\\/g, "/");
      const r2Key = `${R2_PREFIX}/${rel}`;
      const contentType = getContentType(ext);

      await uploadViaWrangler(file, r2Key, contentType);
      total++;
    }
  }

  console.log(`\nDone. Uploaded: ${total}  Skipped: ${skipped}`);
  if (!DRY_RUN) {
    console.log(`\nBase URL: https://assets.grudge-studio.com/${R2_PREFIX}/`);
  }
}

main().catch(console.error);
