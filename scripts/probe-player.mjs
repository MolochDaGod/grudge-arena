import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto("https://grudge-arena.grudge-studio.com/", {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Play as Guest/i }).first().click();
await page.waitForTimeout(2000);
await page.getByRole("button", { name: /Tank Preset/i }).first().click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /Danger Room Training/i }).first().click();
await page.waitForTimeout(22000);

const probe = await page.evaluate(async () => {
  const arena = window.__grudgeArena;
  if (!arena?.playerUnit?.mesh) {
    return { error: "no arena/player on window" };
  }
  const mesh = arena.playerUnit.mesh;
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  let matInfo = { total: 0, withMap: 0, types: {}, sampleColors: [] };
  mesh.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      matInfo.total++;
      matInfo.types[mat.type] = (matInfo.types[mat.type] || 0) + 1;
      if (mat.map) matInfo.withMap++;
      if (matInfo.sampleColors.length < 3 && mat.color) {
        matInfo.sampleColors.push({
          hex: mat.color.getHexString(),
          hasMap: !!mat.map,
          mapSrc: mat.map?.image?.src?.slice(-40),
        });
      }
    }
  });
  const action = arena.playerUnit.controller?.currentAction;
  let bound = 0;
  let total = 0;
  for (const b of action?._propertyBindings || []) {
    total++;
    if (b?.binding?.node) bound++;
  }
  return {
    position: mesh.position.toArray(),
    scale: mesh.scale.toArray(),
    worldHeight: size.y,
    matInfo,
    anim: { state: arena.playerUnit.controller?.currentState, bound, total, time: action?.time },
    unitCount: arena.allUnits?.length,
  };
}).catch((e) => ({ evalError: String(e) }));

console.log(JSON.stringify(probe, null, 2));
await browser.close();