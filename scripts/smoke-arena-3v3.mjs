/**
 * Smoke test — classic 3v3 /arena (6 D1 races, textured + baked anims).
 * Usage: ARENA_URL=https://grudge-arena.grudge-studio.com node scripts/smoke-arena-3v3.mjs
 */
import { chromium } from "playwright";

const errors = [];
const logs = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let exitCode = 1;

try {
  page.on("pageerror", (e) => errors.push(`PAGE: ${e.message}`));
  page.on("console", (msg) => {
    const t = msg.type();
    const text = msg.text();
    if (t === "error" && !/Failed to load resource.*404|auth\/puter/.test(text)) {
      errors.push(`CONSOLE: ${text}`);
    }
    if (text.includes("[arena]") || text.includes("[modelLoader]")) logs.push(text);
  });

  const BASE = process.env.ARENA_URL || "https://grudge-arena.grudge-studio.com";
  await page.goto(`${BASE}/arena`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForTimeout(1500);

  const guest = page.getByRole("button", { name: /Play as Guest/i });
  if (await guest.count()) {
    await guest.first().click();
    await page.waitForTimeout(1500);
  }

  for (let i = 0; i < 60; i++) {
    const loadingText = await page.locator("#loading-text").textContent().catch(() => "");
    if ((loadingText || "").includes("Ready")) break;
    if (logs.some((l) => l.includes("3v3 Arena loaded"))) break;
    await page.waitForTimeout(1000);
  }

  const overlayActive = await page
    .locator("#error-overlay.active")
    .count()
    .catch(() => 0);
  const loadingText = await page.locator("#loading-text").textContent().catch(() => "");

  const gameReady =
    (loadingText || "").includes("Ready") ||
    logs.some((l) => l.includes("3v3 Arena loaded"));
  const arenaLoaded = logs.some((l) => l.includes("3v3 Arena loaded"));
  const qualityOk = logs.some((l) => /quality gate OK — 6 units verified/.test(l));

  const races = ["human", "orc", "elf", "dwarf", "barbarian", "undead"];
  const texturedRaces = races.filter((race) =>
    logs.some(
      (l) =>
        new RegExp(`${race}: applied atlas texture to \\d+ material slots`, "i").test(l) ||
        new RegExp(`${race}.*baked-grudge6 ready:.*\\d+/\\d+ materials textured`, "i").test(l),
    ),
  );

  const bakedUnits = logs.filter((l) => /baked-grudge6 ready:/.test(l)).length;
  const d1Meshes = logs.filter((l) =>
    /mesh=\/(cdn\/)?assets\/characters\/.*_Characters\.glb/.test(l),
  ).length;

  const fatal = errors.filter(
    (e) => e.startsWith("PAGE:") || /Failed to load arena|Engine load failed|quality gate failed/i.test(e),
  );

  const checks = {
    gameReady,
    arenaLoaded,
    qualityOk,
    allRacesTextured: texturedRaces.length >= 6,
    bakedUnitsAll6: bakedUnits >= 6,
    d1MeshesAll6: d1Meshes >= 6,
    noOverlay: overlayActive === 0,
    noFatalErrors: fatal.length === 0,
  };

  console.log("loadingText:", loadingText?.trim());
  console.log("texturedRaces:", texturedRaces);
  console.log("bakedUnits:", bakedUnits, "d1Meshes:", d1Meshes);
  console.log("checks:", checks);
  console.log(
    "arenaLogs:",
    logs.filter((l) => /baked-grudge6|3v3 Arena|quality gate|applied atlas/.test(l)),
  );
  console.log("errors:", JSON.stringify(errors.slice(0, 10), null, 2));

  const ok = Object.values(checks).every(Boolean);
  if (!ok) {
    console.error("SMOKE FAILED:", Object.entries(checks).filter(([, v]) => !v).map(([k]) => k));
  }
  exitCode = ok ? 0 : 1;
} finally {
  await browser.close().catch(() => {});
}
process.exit(exitCode);