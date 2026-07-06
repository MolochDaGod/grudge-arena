/**
 * Character showcase — same pipeline as Danger Room (baked Bip001 + CDN textures).
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  createBakedGrudge6Unit,
  createAnimatedUnit,
} from "../modelLoader.js";
import { WeaponToBakedPack } from "../bakedAnimLoader.js";

const RACES = ["human", "barbarian", "elf", "dwarf", "orc", "undead"];
const WEAPONS = Object.keys(WeaponToBakedPack);

const params = new URLSearchParams(location.search);
const initialRace = RACES.includes(params.get("race")) ? params.get("race") : "human";
const initialWeapon = WEAPONS.includes(params.get("weapon")) ? params.get("weapon") : "greatsword";
const initialPipe = params.get("pipeline") === "legacy" ? "legacy" : "baked";

const logEl = document.getElementById("log");
const statusPill = document.getElementById("status-pill");
const raceSel = document.getElementById("race-sel");
const weaponSel = document.getElementById("weapon-sel");
const pipeSel = document.getElementById("pipe-sel");
const animSel = document.getElementById("anim-sel");
const gaitSlider = document.getElementById("gait-slider");
const gaitLabel = document.getElementById("gait-label");

const log = (m) => {
  logEl.textContent += m + "\n";
  logEl.scrollTop = logEl.scrollHeight;
};

for (const r of RACES) {
  const opt = document.createElement("option");
  opt.value = r;
  opt.textContent = r[0].toUpperCase() + r.slice(1);
  if (r === initialRace) opt.selected = true;
  raceSel.appendChild(opt);
}
for (const w of WEAPONS) {
  const opt = document.createElement("option");
  opt.value = w;
  opt.textContent = w;
  if (w === initialWeapon) opt.selected = true;
  weaponSel.appendChild(opt);
}
pipeSel.value = initialPipe;

const wrap = document.getElementById("canvas-wrap");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);

const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
camera.position.set(0, 1.45, 3.4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
wrap.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.05, 0);
controls.update();

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const key = new THREE.DirectionalLight(0xfff4e6, 1.15);
key.position.set(3, 6, 4);
key.castShadow = true;
scene.add(key);
const rim = new THREE.DirectionalLight(0x88aaff, 0.45);
rim.position.set(-4, 2, -3);
scene.add(rim);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(4, 48),
  new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.9 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

function resize() {
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
let unit = null;
let clipNames = [];
let cycleTimer = null;
let cycleIdx = 0;
let autoCycle = false;

function setStatus(text, ok = true) {
  statusPill.textContent = text;
  statusPill.style.color = ok ? "#5fcf7a" : "#ff6b6b";
  statusPill.style.borderColor = ok ? "rgba(92,207,122,0.5)" : "rgba(255,107,107,0.5)";
}

function auditMaterials(mesh) {
  let total = 0;
  let withMap = 0;
  let visible = 0;
  mesh.traverse((ch) => {
    if (!ch.isMesh && !ch.isSkinnedMesh) return;
    if (ch.visible) visible++;
    const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
    for (const m of mats) {
      if (!m) continue;
      total++;
      if (m.map?.image) withMap++;
    }
  });
  return { total, withMap, visible };
}

function bindStats(action) {
  let bound = 0;
  const bindings = action?._propertyBindings || [];
  for (const b of bindings) if (b?.binding?.node) bound++;
  return { bound, total: bindings.length };
}

function populateClipList(controller, baked) {
  animSel.innerHTML = '<option value="">— pick —</option>';
  clipNames = [];

  if (baked && controller.clips) {
    for (const name of controller.clips.keys()) {
      clipNames.push(name);
      const o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      animSel.appendChild(o);
    }
    return;
  }

  if (controller.actions) {
    for (const name of controller.actions.keys()) {
      clipNames.push(name);
      const o = document.createElement("option");
      o.value = name;
      o.textContent = name;
      animSel.appendChild(o);
    }
  }
}

const LOCO_GAIT = { idle: 0, walk: 34, run: 70, sprint: 100 };

function playClip(name) {
  if (!unit?.controller || !name) return;
  if (pipeSel.value === "baked" && name in LOCO_GAIT) {
    const v = LOCO_GAIT[name];
    gaitSlider.value = String(v);
    gaitSlider.dispatchEvent(new Event("input"));
  } else {
    unit.controller.play(name, { loop: true });
  }
  log(`▶ ${name}`);
  setStatus(`${unit.race} · ${name}`);
}

function stopCycle() {
  if (cycleTimer) {
    clearInterval(cycleTimer);
    cycleTimer = null;
  }
}

function startCycle() {
  stopCycle();
  if (!clipNames.length) return;
  cycleTimer = setInterval(() => {
    cycleIdx = (cycleIdx + 1) % clipNames.length;
    const name = clipNames[cycleIdx];
    playClip(name);
    animSel.value = name;
  }, 3000);
}

function disposeUnit() {
  stopCycle();
  if (unit?.scene) {
    scene.remove(unit.scene);
    unit.controller?.dispose?.();
    unit.mixer?.stopAllAction?.();
  }
  unit = null;
  clipNames = [];
  animSel.innerHTML = '<option value="">— pick —</option>';
  gaitSlider.value = "0";
  gaitLabel.textContent = "idle";
}

async function loadCharacter() {
  disposeUnit();
  const race = raceSel.value;
  const weapon = weaponSel.value;
  const baked = pipeSel.value === "baked";

  log(`\n=== ${race.toUpperCase()} / ${weapon} / ${baked ? "baked" : "legacy"} ===`);

  try {
    unit = baked
      ? await createBakedGrudge6Unit(race, weapon)
      : await createAnimatedUnit(race, weapon);

    const mesh = unit.scene;
    mesh.position.set(0, mesh.position.y, 0);
    scene.add(mesh);

    const mats = auditMaterials(mesh);
    log(`mesh: ${unit.scene?.userData?.path || "(loaded)"}`);
    log(`scale: ${mesh.scale.x.toFixed(4)} · y=${mesh.position.y.toFixed(3)}`);
    log(`materials: ${mats.withMap}/${mats.total} textured · ${mats.visible} visible meshes`);

    if (mats.withMap === 0) {
      log("WARN: no textured materials — check /cdn atlas paths");
      setStatus("textures missing", false);
    } else if (mats.withMap < mats.total * 0.5) {
      setStatus("partial textures", false);
    } else {
      setStatus(`${race} · textured OK`);
    }

    populateClipList(unit.controller, baked);

    if (baked) {
      unit.controller.director?.primeLocomotion?.();
      log(`baked clips: ${clipNames.length} [${clipNames.slice(0, 8).join(", ")}${clipNames.length > 8 ? "…" : ""}]`);
    } else {
      const idle = unit.controller.actions?.get("idle");
      const stats = bindStats(idle);
      log(`legacy idle bind: ${stats.bound}/${stats.total} tracks`);
      if (idle) unit.controller.play("idle");
    }

    if (clipNames.length) {
      cycleIdx = 0;
      playClip(clipNames[0]);
      animSel.value = clipNames[0];
      if (autoCycle) startCycle();
    }

    history.replaceState(null, "", `?race=${race}&weapon=${weapon}&pipeline=${baked ? "baked" : "legacy"}`);
  } catch (err) {
    log(`FAIL: ${err.message}`);
    console.error(err);
    setStatus("load error", false);
  }
}

gaitSlider.addEventListener("input", () => {
  if (!unit?.controller?.director) return;
  const v = Number(gaitSlider.value) / 100;
  unit.controller.director.gaitTarget = v;
  unit.controller.director.gait = v;
  const label = v < 0.2 ? "idle" : v < 0.55 ? "walk" : v < 0.85 ? "run" : "sprint";
  gaitLabel.textContent = label;
});

raceSel.addEventListener("change", loadCharacter);
weaponSel.addEventListener("change", loadCharacter);
pipeSel.addEventListener("change", loadCharacter);

animSel.addEventListener("change", () => {
  stopCycle();
  playClip(animSel.value);
});

document.getElementById("prev-btn").addEventListener("click", () => {
  if (!clipNames.length) return;
  stopCycle();
  cycleIdx = (cycleIdx - 1 + clipNames.length) % clipNames.length;
  playClip(clipNames[cycleIdx]);
  animSel.value = clipNames[cycleIdx];
});

document.getElementById("next-btn").addEventListener("click", () => {
  if (!clipNames.length) return;
  stopCycle();
  cycleIdx = (cycleIdx + 1) % clipNames.length;
  playClip(clipNames[cycleIdx]);
  animSel.value = clipNames[cycleIdx];
});

document.getElementById("cycle-btn").addEventListener("click", (e) => {
  autoCycle = !autoCycle;
  if (autoCycle) startCycle();
  else stopCycle();
  e.target.style.borderColor = autoCycle ? "#5fcf7a" : "";
});

(function tick() {
  requestAnimationFrame(tick);
  const dt = clock.getDelta();
  if (unit?.controller) {
    if (unit.controller.director && pipeSel.value === "baked") {
      unit.controller.director.update(dt);
    } else {
      unit.controller.update(dt);
    }
  }
  controls.update();
  renderer.render(scene, camera);
})();

loadCharacter();