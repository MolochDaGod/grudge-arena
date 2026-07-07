#!/usr/bin/env node
/**
 * deploy.mjs — Build and deploy grudge-arena to Vercel (no GitHub needed)
 *
 * Usage:
 *   node scripts/deploy.mjs           # build + deploy to preview
 *   node scripts/deploy.mjs --prod    # build + deploy to production
 *   node scripts/deploy.mjs --assets  # sync assets to R2 first, then deploy
 *
 * Prerequisites:
 *   npm i -g vercel    (already done if `vercel` is in PATH)
 *   vercel login       (one-time — links to grudge-studio Vercel account)
 *   wrangler login     (for R2 asset sync)
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROD = process.argv.includes("--prod");
const ASSETS = process.argv.includes("--assets");
const EXPECTED_VERCEL_PROJECT = "grudge-arena";

function run(cmd, label) {
  console.log(`\n▶ ${label}`);
  console.log(`  $ ${cmd}\n`);
  execSync(cmd, {
    stdio: "inherit",
    cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  });
}

function assertVercelProject() {
  const projectFile = resolve(__dirname, "..", ".vercel", "project.json");
  if (!existsSync(projectFile)) {
    console.warn("⚠ No .vercel/project.json — run: vercel link --project grudge-arena");
    return;
  }
  const { projectName } = JSON.parse(readFileSync(projectFile, "utf8"));
  if (projectName !== EXPECTED_VERCEL_PROJECT) {
    throw new Error(
      `Wrong Vercel project "${projectName}". Run: vercel link --yes --project ${EXPECTED_VERCEL_PROJECT}`,
    );
  }
}

async function main() {
  assertVercelProject();

  if (ASSETS) {
    run("node scripts/sync-assets-r2.mjs", "Sync assets → Cloudflare R2");
  }

  run("npm run build", "Build (Vite → dist/)");

  const vercelFlags = PROD ? "--prod" : "";
  run(
    `vercel ${vercelFlags} --yes`,
    PROD ? "Deploy → Production" : "Deploy → Preview",
  );

  console.log("\n✓ Done.");
  if (PROD) {
    console.log(
      "  Live at: https://grudge-arena.grudge-studio.com  (or your custom domain)",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
