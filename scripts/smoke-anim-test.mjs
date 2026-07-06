import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on("console", (msg) => {
  const t = msg.text();
  if (t.includes("[modelLoader]") || t.includes("FAIL")) logs.push(t);
});

await page.goto(
  "https://grudge-arena.grudge-studio.com/anim-test.html?race=human&weapon=greatsword&pipeline=baked",
  { waitUntil: "networkidle", timeout: 90000 },
);

for (let i = 0; i < 30; i++) {
  const logText = await page.locator("#log").textContent();
  if (logText?.includes("textured OK") || logText?.includes("materials:")) break;
  if (logText?.includes("FAIL:")) break;
  await page.waitForTimeout(1000);
}

const panel = await page.evaluate(() => ({
  log: document.getElementById("log")?.textContent || "",
  status: document.getElementById("status-pill")?.textContent || "",
  hasBakedOption: !!document.querySelector('#pipe-sel option[value="baked"]'),
  scriptSrc: [...document.querySelectorAll("script[type=module]")].map((s) => s.src),
}));

const checks = {
  viteBundle: panel.scriptSrc.some((s) => s.includes("animTest")),
  bakedPipeline: panel.log.includes("baked"),
  textured: /materials: \d+\/\d+ textured/.test(panel.log) && !panel.log.includes("0/"),
  noFail: !panel.log.includes("FAIL:"),
  statusOk: /textured OK|partial textures/.test(panel.status + panel.log),
};

console.log("status:", panel.status);
console.log("checks:", checks);
console.log("log tail:", panel.log.split("\n").slice(-8).join("\n"));
console.log("scripts:", panel.scriptSrc);

await browser.close();
const ok = Object.values(checks).every(Boolean);
if (!ok) console.error("ANIM-TEST SMOKE FAILED");
process.exit(ok ? 0 : 1);