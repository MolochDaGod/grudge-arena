import { chromium } from "playwright";

const BASE = "https://island-crusade-combat-sandbox.vercel.app";
const logs = [];
const errors = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (msg) => {
  const text = msg.text();
  if (text.includes("[arena]") || text.includes("[modelLoader]")) logs.push(text);
  if (msg.type() === "error" && !/404|favicon/.test(text)) errors.push(text);
});
page.on("pageerror", (e) => errors.push(`PAGE: ${e.message}`));

function texturedFromLogs(logLines) {
  const hit = logLines.find((l) => /(\d+)\/(\d+) materials textured/.test(l));
  if (!hit) return null;
  const [, withMap, total] = hit.match(/(\d+)\/(\d+) materials textured/);
  return { withMap: Number(withMap), total: Number(total) };
}

let exitCode = 1;
try {
  await page.goto(`${BASE}/arena`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const guest = page.getByRole("button", { name: /Play as Guest/i });
  if (await guest.count()) {
    await guest.first().click();
    await page.waitForTimeout(2000);
  }
  for (let i = 0; i < 60; i++) {
    const txt = await page.locator("#loading-text").textContent().catch(() => "");
    if ((txt || "").includes("Ready")) break;
    await page.waitForTimeout(1000);
  }

  await page.waitForFunction(
    () => window.__grudgeArena?.dangerMode && window.__grudgeArena?.playerUnit?.mesh,
    { timeout: 90000 },
  );

  await page.evaluate(async () => {
    const p = window.__grudgeArena?._dangerEnv?.terrainLoadPromise;
    if (p) await p;
  });

  await page.waitForTimeout(1500);

  const audit = await page.evaluate(() => {
    const a = window.__grudgeArena;
    if (!a) return { ok: false };
    const pu = a.playerUnit;
    const root = pu?.mesh;
    let mats = { total: 0, withMap: 0 };
    root?.traverse?.((ch) => {
      if (!ch.isMesh && !ch.isSkinnedMesh) return;
      const ms = Array.isArray(ch.material) ? ch.material : [ch.material];
      for (const m of ms) {
        if (!m) continue;
        mats.total++;
        const img = m.map?.image;
        if (img && img.width > 1 && img.height > 1) mats.withMap++;
      }
    });
    return {
      dangerMode: a.dangerMode,
      usingRapier: a._usingRapier,
      terrainMeshes: a._terrainMeshes?.length ?? 0,
      envTerrain: a._dangerEnv?.terrainMeshes?.length ?? 0,
      clampRadius: a._dangerClampRadius,
      groundSampler: !!a._groundSampler,
      units: a.allUnits?.length ?? 0,
      metrics: pu?.characterMetrics,
      physicsBody: !!pu?.physicsBody,
      cannonProxy: !!pu?.cannonProxyBody,
      mats,
      softZoneHidden: document.getElementById("dr-softlock-zone")?.hidden !== false,
    };
  });

  const logMats = texturedFromLogs(logs);
  const meshTextured =
    audit.mats?.withMap >= 20 && audit.mats.withMap === audit.mats.total;
  const logTextured =
    logMats && logMats.withMap >= 20 && logMats.withMap === logMats.total;

  const checks = {
    loaded: !!audit.dangerMode,
    textured: meshTextured || logTextured,
    scaled:
      audit.metrics &&
      Math.abs(audit.metrics.measuredHeight - audit.metrics.targetHeight) /
        audit.metrics.targetHeight <=
        0.12,
    rapier: audit.usingRapier === true,
    colliders: audit.physicsBody && audit.cannonProxy,
    terrain:
      audit.groundSampler &&
      (audit.terrainMeshes >= 1 || audit.envTerrain >= 1),
    radialHud: audit.softZoneHidden,
    noErrors: errors.length === 0,
  };

  console.log(JSON.stringify({ audit, logMats, checks }, null, 2));
  console.log("logs tail:", logs.slice(-8).join("\n"));
  exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
} finally {
  await browser.close();
}
process.exit(exitCode);