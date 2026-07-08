/**
 * Interactive smoke — /arena hard refresh, walk (W), Q ability.
 * Usage: ARENA_URL=https://grudge-arena.grudge-studio.com node scripts/smoke-arena-walk-q.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.ARENA_URL || "https://grudge-arena.grudge-studio.com";
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
    if (/\[arena\]|\[modelLoader\]|ability|gait/i.test(text)) logs.push(text);
  });

  await page.goto(`${BASE}/arena`, { waitUntil: "domcontentloaded", timeout: 90000 });
  const guest = page.getByRole("button", { name: /Play as Guest/i });
  if (await guest.count()) {
    await guest.first().click();
    await page.waitForTimeout(1200);
  }

  for (let i = 0; i < 60; i++) {
    const txt = await page.locator("#loading-text").textContent().catch(() => "");
    if ((txt || "").includes("Ready")) break;
    if (logs.some((l) => /3v3 Arena loaded/.test(l))) break;
    await page.waitForTimeout(1000);
  }

  // Hard refresh — bypass cache (simulates Ctrl+Shift+R).
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  for (let i = 0; i < 45; i++) {
    const ready = await page.evaluate(
      () =>
        document.querySelector("#loading-text")?.textContent?.includes("Ready") ||
        !!window.__grudgeArena?.playerUnit?.controller,
    );
    if (ready) break;
    await page.waitForTimeout(1000);
  }

  const boot = await page.evaluate(() => {
    const a = window.__grudgeArena;
    return {
      hasArena: !!a,
      hasPlayer: !!a?.playerUnit?.mesh,
      hasController: !!a?.playerController,
      hasAnim: !!a?.playerUnit?.controller?.director,
      useBakedLoco: !!a?.playerController?.useBakedLoco,
      weapon: a?.playerUnit?.resolvedWeapon,
      matchPhase: a?.match?.phase,
    };
  });

  // Wait out countdown so combat is active (optional for walk).
  for (let i = 0; i < 8; i++) {
    const phase = await page.evaluate(() => window.__grudgeArena?.match?.phase);
    if (phase === "combat") break;
    await page.waitForTimeout(1000);
  }

  const posBefore = await page.evaluate(() => {
    const m = window.__grudgeArena?.playerUnit?.mesh?.position;
    return m ? { x: m.x, y: m.y, z: m.z } : null;
  });

  // Simulate W held + controller ticks (TPS walk).
  for (let frame = 0; frame < 30; frame++) {
    await page.evaluate((f) => {
      const a = window.__grudgeArena;
      const pc = a?.playerController;
      const ctrl = a?.playerUnit?.controller;
      if (!pc) return;
      pc.holdKey.KeyW = true;
      if (f === 0) pc.tickKey.KeyW = true;
      pc.update(0.05);
      ctrl?.update?.(0.05);
      a?.orbitCamera?.update?.(0.05);
    }, frame);
    await page.waitForTimeout(30);
  }

  const walkResult = await page.evaluate(() => {
    const a = window.__grudgeArena;
    const pc = a?.playerController;
    const mesh = a?.playerUnit?.mesh;
    const dir = a?.playerUnit?.controller?.director;
    const gait = dir?.gait ?? 0;
    const gaitTarget = dir?.gaitTarget ?? 0;
    const speed = pc?.currentSpeed ?? 0;
    const pos = mesh?.position;
    return {
      speed,
      gait,
      gaitTarget,
      pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null,
      fsm: pc?.stateName,
      scheme: pc?.controlScheme,
    };
  });

  await page.evaluate(() => {
    const pc = window.__grudgeArena?.playerController;
    if (pc) pc.holdKey.KeyW = false;
  });

  // Q ability — ensure target, fire skill.
  await page.evaluate(() => {
    const a = window.__grudgeArena;
    if (a?.targeting && !a.targeting.currentTarget) {
      const enemy = a.allUnits?.find((u) => u.team === "B");
      if (enemy) a.targeting.select(enemy);
    }
  });

  const cdBefore = await page.evaluate(() => {
    const ent = window.__grudgeArena?.playerEntity;
    return ent?.getComponent?.("AbilityState")?.cooldowns?.Q ?? 0;
  });

  await page.evaluate(() => {
    const pc = window.__grudgeArena?.playerController;
    if (!pc) return;
    pc.tickKey.KeyQ = true;
    pc.update(0.05);
    pc.tickKey = {};
  });
  await page.waitForTimeout(200);
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => {
      window.__grudgeArena?.playerUnit?.controller?.update?.(0.05);
    });
    await page.waitForTimeout(50);
  }

  const abilityResult = await page.evaluate(() => {
    const a = window.__grudgeArena;
    const ent = a?.playerEntity;
    const as = ent?.getComponent?.("AbilityState");
    const dir = a?.playerUnit?.controller?.director;
    return {
      cdQ: as?.cooldowns?.Q ?? 0,
      gcd: a?._gcdTimer ?? 0,
      directorBusy: !!dir?.busy,
      overlayInf: dir?.overlayInf ?? 0,
      fsm: a?.playerController?.stateName,
      hasTarget: !!a?.targeting?.currentTarget,
      activeSkillLabel: a?._activeSkillLabel ?? null,
    };
  });

  const moved =
    posBefore &&
    walkResult.pos &&
    Math.hypot(
      walkResult.pos.x - posBefore.x,
      walkResult.pos.z - posBefore.z,
    ) > 0.15;

  const walkOk =
    moved &&
    (walkResult.speed > 0.2 ||
      walkResult.gait > 0.05 ||
      walkResult.gaitTarget > 0.05);

  const abilityOk =
    abilityResult.cdQ > cdBefore ||
    abilityResult.directorBusy ||
    abilityResult.overlayInf > 0.05 ||
    !!abilityResult.activeSkillLabel;

  const checks = {
    booted: boot.hasArena && boot.hasPlayer && boot.hasController,
    bakedLoco: boot.useBakedLoco,
    walkMoved: moved,
    walkAnim: walkOk,
    abilityFired: abilityOk,
    hasTarget: abilityResult.hasTarget,
    noFatalErrors: errors.filter((e) => e.startsWith("PAGE:")).length === 0,
  };

  console.log("boot:", boot);
  console.log("posBefore:", posBefore);
  console.log("walkResult:", walkResult);
  console.log("abilityResult:", abilityResult);
  console.log("checks:", checks);
  if (errors.length) console.log("errors:", errors.slice(0, 5));

  const ok = Object.values(checks).every(Boolean);
  if (!ok) {
    console.error(
      "SMOKE FAILED:",
      Object.entries(checks).filter(([, v]) => !v).map(([k]) => k),
    );
  } else {
    console.log("SMOKE OK — walk + Q ability verified on /arena after hard refresh");
  }
  exitCode = ok ? 0 : 1;
} finally {
  await browser.close().catch(() => {});
}
process.exit(exitCode);