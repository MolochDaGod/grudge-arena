#!/usr/bin/env node
/** Scan public/anims/baked → public/models/animBankCatalog.json */

import { readdirSync, statSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BAKED = join(ROOT, "public", "anims", "baked");
const OUT = join(ROOT, "public", "models", "animBankCatalog.json");

function walk(dir, base = "") {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, base ? `${base}/${e}` : e));
    else if (e.endsWith(".json")) out.push((base ? `${base}/` : "") + e.replace(/\.json$/, ""));
  }
  return out;
}

const clips = walk(BAKED).sort();
writeFileSync(
  OUT,
  JSON.stringify(
    { version: 1, generated: new Date().toISOString(), count: clips.length, clips },
    null,
    2,
  ),
);
console.log(`✔ animBankCatalog.json — ${clips.length} clips`);