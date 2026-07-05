import { chromium } from "playwright";

const errors = [];
const logs = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(`PAGE: ${e.message}`));
page.on("console", (msg) => {
  const t = msg.type();
  const text = msg.text();
  if (t === "error") errors.push(`CONSOLE: ${text}`);
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

await page.waitForTimeout(18000);

const overlayActive = await page
  .locator("#error-overlay.active")
  .count()
  .catch(() => 0);
const errMsg = await page.locator("#error-message").textContent().catch(() => "");
const loadingText = await page.locator("#loading-text").textContent().catch(() => "");

console.log("overlayActive:", overlayActive);
console.log("errorMessage:", errMsg?.trim());
console.log("loadingText:", loadingText?.trim());
console.log("arenaLogs:", logs.slice(-20));
console.log("errors:", JSON.stringify(errors.slice(0, 15), null, 2));

const bindingProbe = await page.evaluate(async () => {
  const THREE = window.THREE;
  if (!THREE) return { probeError: "THREE not on window" };
  const { GLTFLoader } = await import(
    "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js"
  );
  const loader = new GLTFLoader();
  const load = (url) =>
    new Promise((res, rej) => loader.load(url, res, undefined, rej));
  const [char, anim] = await Promise.all([
    load("https://grudge-arena.grudge-studio.com/cdn/assets/characters/human/WK_Characters.glb"),
    load("https://grudge-arena.grudge-studio.com/cdn/assets/animations/axe/standing%20idle.glb"),
  ]);
  const scene = char.scene;
  const clip = anim.animations[0];
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip, scene);
  action.play();
  mixer.update(0);
  let bound = 0;
  const total = action._propertyBindings?.length || 0;
  for (const b of action._propertyBindings || []) if (b?.binding?.node) bound++;
  return {
    rawTrackSample: clip.tracks.slice(0, 4).map((t) => t.name),
    trackCount: clip.tracks.length,
    bound,
    total,
    hasPelvis: !!scene.getObjectByName("Bip001 Pelvis"),
  };
}).catch((e) => ({ probeError: String(e) }));
console.log("bindingProbe:", bindingProbe);

const gameReady = (loadingText || "").includes("Ready");
const idleBound = logs.some((l) => /idle bound=\d+\/\d+ tracks/.test(l) && !/idle bound=0\//.test(l));
const fatal = errors.filter(
  (e) => e.startsWith("PAGE:") || /Failed to load arena|Engine load failed/i.test(e),
);

await browser.close();
const ok = gameReady && idleBound && overlayActive === 0 && fatal.length === 0;
process.exit(ok ? 0 : 1);