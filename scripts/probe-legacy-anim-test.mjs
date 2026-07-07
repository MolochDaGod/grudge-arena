import { chromium } from "playwright";

const BASE =
  process.env.ARENA_URL || "https://island-crusade-combat-sandbox.vercel.app";
const url = `${BASE}/anim-test.html?race=orc&weapon=greatsword&pipeline=legacy`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const logs = [];
page.on("console", (m) => {
  const t = m.text();
  if (
    t.includes("[modelLoader]") ||
    t.includes("legacy") ||
    t.includes("sword_shield") ||
    t.includes("axe")
  ) {
    logs.push(t);
  }
});

await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
for (let i = 0; i < 50; i++) {
  const logText = await page.locator("#log").textContent();
  if (
    logText?.includes("legacy clips:") ||
    logText?.includes("clips:") ||
    logText?.includes("FAIL:")
  ) {
    break;
  }
  await page.waitForTimeout(1000);
}

const panel = await page.evaluate(() => ({
  log: document.getElementById("log")?.textContent || "",
  status: document.getElementById("status-pill")?.textContent || "",
  scriptSrc: [...document.querySelectorAll("script[type=module]")].map(
    (s) => s.src,
  ),
}));

const bundle = panel.scriptSrc.find((s) => s.includes("animTest")) || "none";
const swordCount = (panel.log.match(/sword_shield/g) || []).length;
const scale = panel.log.match(/scale:.*y=([-\d.]+)/);
const groundedY = scale ? Number(scale[1]) : null;

const idleBind = panel.log.match(/legacy idle bind: (\d+)\/(\d+)/);
const bound = idleBind ? Number(idleBind[1]) : 0;
const total = idleBind ? Number(idleBind[2]) : 0;

const checks = {
  newBundle: /animTest-[A-Za-z0-9]+\.js/.test(bundle),
  swordShieldPack: /sword_shield/i.test(panel.log + logs.join(" ")),
  idleBindRatio: total > 0 && bound / total >= 0.85,
  noFail: !panel.log.includes("FAIL:"),
  clips40: /Loaded 40\/40 anims for greatsword/.test(logs.join(" ")),
};

console.log("url:", url);
console.log("status:", panel.status);
console.log("bundle:", bundle);
console.log("checks:", checks);
console.log("ground y:", groundedY);
console.log("log tail:\n" + panel.log.split("\n").slice(-12).join("\n"));
console.log("console tail:", logs.slice(-8));

await browser.close();
const ok = Object.values(checks).every(Boolean);
process.exit(ok ? 0 : 1);