/**
 * Verify anim-test baked pipeline for every race (textures + clips).
 */
import { chromium } from "playwright";

const RACES = ["human", "barbarian", "elf", "dwarf", "orc", "undead"];
const BASE =
  process.env.ARENA_URL || "https://grudge-arena.grudge-studio.com";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const results = [];

for (const race of RACES) {
  await page.goto(
    `${BASE}/anim-test.html?race=${race}&weapon=greatsword&pipeline=baked`,
    { waitUntil: "networkidle", timeout: 90000 },
  );

  for (let i = 0; i < 30; i++) {
    const logText = await page.locator("#log").textContent();
    if (logText?.includes("materials:") || logText?.includes("FAIL:")) break;
    await page.waitForTimeout(1000);
  }

  const log = (await page.locator("#log").textContent()) || "";
  const matMatch = log.match(/materials: (\d+)\/(\d+) textured/);
  const textured = matMatch ? Number(matMatch[1]) : 0;
  const total = matMatch ? Number(matMatch[2]) : 0;
  const clipsMatch = log.match(/baked clips: (\d+)/);
  const clips = clipsMatch ? Number(clipsMatch[1]) : 0;
  const fail = log.includes("FAIL:");

  results.push({
    race,
    ok: !fail && textured > 20 && textured === total && clips >= 10,
    textured: `${textured}/${total}`,
    clips,
    fail: fail ? log.split("FAIL:")[1]?.trim().split("\n")[0] : null,
  });
}

await browser.close();

for (const r of results) {
  console.log(
    `${r.ok ? "✓" : "✗"} ${r.race.padEnd(10)} materials=${r.textured} clips=${r.clips}${r.fail ? ` FAIL: ${r.fail}` : ""}`,
  );
}

const ok = results.every((r) => r.ok);
if (!ok) console.error("ALL-RACES SMOKE FAILED");
process.exit(ok ? 0 : 1);