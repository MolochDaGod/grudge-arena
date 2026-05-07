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

const PROD = process.argv.includes("--prod");
const ASSETS = process.argv.includes("--assets");

function run(cmd, label) {
  console.log(`\n▶ ${label}`);
  console.log(`  $ ${cmd}\n`);
  execSync(cmd, {
    stdio: "inherit",
    cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  });
}

async function main() {
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
