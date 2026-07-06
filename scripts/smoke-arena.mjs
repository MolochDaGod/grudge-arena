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
await page.goto(`${BASE}/danger-room`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(1500);

const guest = page.getByRole("button", { name: /Play as Guest/i });
if (await guest.count()) {
  await guest.first().click();
  // /danger-room auto-starts after guest via pending route resume.
  await page.waitForTimeout(1500);
}

const loadingVisible = await page.locator("#loading-overlay.active").count();
if (!loadingVisible) {
  const danger = page.getByRole("button", { name: /Danger Room Training/i });
  if (await danger.count()) {
    await danger.first().click();
  }
}

// Wait until game reports ready (up to 45s) instead of a blind fixed sleep.
for (let i = 0; i < 45; i++) {
  const loadingText = await page.locator("#loading-text").textContent().catch(() => "");
  if ((loadingText || "").includes("Ready")) break;
  if (logs.some((l) => l.includes("[arena] Game loaded"))) break;
  await page.waitForTimeout(1000);
}

const overlayActive = await page
  .locator("#error-overlay.active")
  .count()
  .catch(() => 0);
const errMsg = await page.locator("#error-message").textContent().catch(() => "");
const loadingText = await page.locator("#loading-text").textContent().catch(() => "");

const gameReady =
  (loadingText || "").includes("Ready") ||
  logs.some((l) => l.includes("[arena] Game loaded"));
const humanTextured = logs.some((l) =>
  /human: applied atlas texture to \d+ material slots/i.test(l),
);
const scaleLog = logs.find((l) =>
  /\[modelLoader\].*target=.*measured=.*bones=/.test(l),
);
const humanScaled = !!scaleLog;
const scaleSane = (() => {
  if (!scaleLog) return false;
  const m = scaleLog.match(
    /target=([\d.]+)m measured=([\d.]+)m.*bones=([\d.]+).*bbox=([\d.]+)/,
  );
  if (!m) return humanScaled;
  const target = Number(m[1]);
  const measured = Number(m[2]);
  const bones = Number(m[3]);
  const bbox = Number(m[4]);
  return (
    target > 0 &&
    measured > 0 &&
    bones > 0 &&
    Math.abs(measured - target) / target <= 0.12 &&
    Math.abs(bones - target) / target <= 0.12 &&
    bbox < Math.max(4, measured * 2.5)
  );
})();
/** Danger room uses CDN GLB + baked Bip001 clips (not legacy Mixamo remap). */
const bakedGrudge6 = logs.some((l) =>
  /baked-grudge6 ready:.*mesh=\/cdn\/assets\/characters\//.test(l),
);
const playerBaked = logs.some((l) =>
  /Human baked-grudge6 ready:.*WK_Characters\.glb/.test(l),
);
const bakedUnits = logs.filter((l) => /baked-grudge6 ready:/.test(l)).length;
const fatal = errors.filter(
  (e) => e.startsWith("PAGE:") || /Failed to load arena|Engine load failed/i.test(e),
);

const checks = {
  gameReady,
  humanTextured,
  humanScaled,
  scaleSane,
  bakedGrudge6,
  playerBaked,
  bakedUnitsAll4: bakedUnits >= 4,
  dangerRoomLoaded: logs.some((l) => l.includes("Danger Room training loaded")),
  noOverlay: overlayActive === 0,
  noFatalErrors: fatal.length === 0,
};

console.log("overlayActive:", overlayActive);
console.log("loadingText:", loadingText?.trim());
console.log("checks:", checks);
console.log("bakedUnits:", bakedUnits);
console.log("arenaLogs:", logs.filter((l) => /baked-grudge6|Danger Room|Game loaded/.test(l)));
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