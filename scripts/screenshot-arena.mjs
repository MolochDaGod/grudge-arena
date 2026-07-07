import { chromium } from "playwright";
import { writeFileSync } from "fs";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on("console", (msg) => {
  const text = msg.text();
  if (text.includes("[modelLoader]") || text.includes("[arena]")) logs.push(text);
});

await page.goto("https://grudge-arena.grudge-studio.com/danger-room", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(1500);

const guest = page.getByRole("button", { name: /Play as Guest/i });
if (await guest.count()) await guest.first().click();
await page.waitForTimeout(2000);

for (let i = 0; i < 45; i++) {
  const loadingText = await page.locator("#loading-text").textContent().catch(() => "");
  if ((loadingText || "").includes("Ready")) break;
  await page.waitForTimeout(1000);
}
await page.waitForTimeout(3000);

const humanLogs = logs.filter((l) => /human|Hero Human|Game loaded|normalizeCharacterScale/i.test(l));
const textureLogs = logs.filter((l) => /applied atlas texture|texture atlas loaded/i.test(l));
const animLogs = logs.filter((l) => /idle bound=/i.test(l));

await page.screenshot({ path: "scripts/arena-screenshot.png", fullPage: false });

const canvasStats = await page.evaluate(() => {
  const canvas = document.querySelector("#game-root canvas");
  if (!canvas) return { error: "no canvas" };
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  if (!gl) return { error: "no webgl" };
  const w = canvas.width;
  const h = canvas.height;
  const pixels = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let yellow = 0;
  let samples = 0;
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);
  for (let dy = -40; dy <= 40; dy += 8) {
    for (let dx = -20; dx <= 20; dx += 8) {
      const x = cx + dx;
      const y = cy + dy;
      const i = (y * w + x) * 4;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      samples++;
      if (r > 180 && g > 150 && b < 80) yellow++;
    }
  }
  const centerI = (cy * w + cx) * 4;
  return {
    size: [w, h],
    centerRGBA: [
      pixels[centerI],
      pixels[centerI + 1],
      pixels[centerI + 2],
      pixels[centerI + 3],
    ],
    yellowRatio: yellow / samples,
    loadingText: document.getElementById("loading-text")?.textContent,
    overlayActive: document.getElementById("error-overlay")?.classList.contains("active"),
  };
});

console.log("allLogs:", logs);
console.log("humanLogs:", humanLogs);
console.log("textureLogs count:", textureLogs.length, textureLogs.slice(0, 6));
console.log("animLogs:", animLogs);
console.log("canvasStats:", canvasStats);

await browser.close();