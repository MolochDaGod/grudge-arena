import { chromium } from "playwright";

const errors = [];
const logs = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(`PAGE: ${e.message}`));
page.on("console", (msg) => {
  const t = msg.type();
  const text = msg.text();
  if (t === "error" && !/Failed to load resource.*404/.test(text)) {
    errors.push(`CONSOLE: ${text}`);
  }
  if (text.includes("[arena]") || text.includes("[modelLoader]")) logs.push(text);
});

await page.goto("https://grudge-arena.grudge-studio.com/", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(1500);

const guest = page.getByRole("button", { name: /Play as Guest/i });
if (await guest.count()) {
  await guest.first().click();
  await page.waitForTimeout(2500);
}

const tankPreset = page.getByRole("button", { name: /Tank Preset/i });
if (await tankPreset.count()) {
  await tankPreset.first().click();
  await page.waitForTimeout(500);
}

const danger = page.getByRole("button", { name: /Danger Room Training/i });
if (await danger.count()) {
  await danger.first().click();
} else {
  const enter = page.locator("#enter-btn");
  if (await enter.count()) await enter.click();
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
  /human: applied atlas texture to \d+ material slots/.test(l),
);
const humanScaled = logs.some((l) => /normalizeCharacterScale: height=/.test(l));
const idleBound = logs.some(
  (l) => /Hero human: idle bound=\d+\/\d+ tracks/.test(l) && !/idle bound=0\//.test(l),
);
const fatal = errors.filter(
  (e) => e.startsWith("PAGE:") || /Failed to load arena|Engine load failed/i.test(e),
);

const checks = {
  gameReady,
  humanTextured,
  humanScaled: humanScaled || logs.some((l) => /normalizeCharacterScale/.test(l)),
  idleBound,
  noOverlay: overlayActive === 0,
  noFatalErrors: fatal.length === 0,
};

console.log("overlayActive:", overlayActive);
console.log("loadingText:", loadingText?.trim());
console.log("checks:", checks);
console.log("arenaLogs:", logs.slice(-15));
console.log("errors:", JSON.stringify(errors.slice(0, 10), null, 2));

await browser.close();

const ok = Object.values(checks).every(Boolean);
if (!ok) {
  console.error("SMOKE FAILED:", Object.entries(checks).filter(([, v]) => !v).map(([k]) => k));
}
process.exit(ok ? 0 : 1);