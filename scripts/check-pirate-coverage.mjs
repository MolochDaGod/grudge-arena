import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const m = JSON.parse(readFileSync(resolve(root, "public/assets/island/pirate-kit/manifest.json")));
const src = readFileSync(resolve(root, "src/dangerRoom/IslandPirateKit.js"), "utf8");
const placed = new Set([...src.matchAll(/file: "([^"]+)"/g)].map((x) => x[1]));
const missing = m.models.filter((x) => !placed.has(x));
console.log(`manifest: ${m.models.length}, layout: ${placed.size}, missing: ${missing.length}`);
if (missing.length) console.log(missing.join(", "));