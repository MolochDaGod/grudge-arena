import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let exitCode = 1;

try {
  const logs = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (t.includes("[modelLoader]") || t.includes("FAIL")) logs.push(t);
  });

  const BASE = process.env.ARENA_URL || "https://grudge-arena.grudge-studio.com";
  await page.goto(
    `${BASE}/anim-test.html?race=human&weapon=greatsword&pipeline=baked`,
    { waitUntil: "domcontentloaded", timeout: 90000 },
  );

  for (let i = 0; i < 45; i++) {
    const logText = await page.locator("#log").textContent();
    if (logText?.includes("materials:") || logText?.includes("FAIL:")) break;
    await page.waitForTimeout(1000);
  }

  const panel = await page.evaluate(() => ({
    log: document.getElementById("log")?.textContent || "",
    status: document.getElementById("status-pill")?.textContent || "",
    scriptSrc: [...document.querySelectorAll("script[type=module]")].map((s) => s.src),
  }));

  const matMatch = panel.log.match(/materials: (\d+)\/(\d+) textured/);
  const texturedCount = matMatch ? Number(matMatch[1]) : 0;
  const totalMats = matMatch ? Number(matMatch[2]) : 0;

  const checks = {
    viteBundle: panel.scriptSrc.some((s) => s.includes("animTest")),
    bakedPipeline: panel.log.includes("baked"),
    textured: texturedCount > 0 && texturedCount === totalMats && totalMats >= 20,
    noFail: !panel.log.includes("FAIL:"),
    clipsLoaded: /baked clips: \d+/.test(panel.log),
  };

  console.log("status:", panel.status);
  console.log("checks:", checks);
  console.log("log tail:", panel.log.split("\n").slice(-8).join("\n"));
  console.log("scripts:", panel.scriptSrc);

  const ok = Object.values(checks).every(Boolean);
  if (!ok) console.error("ANIM-TEST SMOKE FAILED");
  exitCode = ok ? 0 : 1;
} finally {
  await browser.close().catch(() => {});
}

process.exit(exitCode);