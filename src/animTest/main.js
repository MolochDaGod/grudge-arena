/**
 * Character showcase — baked Bip001 + atlas textures + teachable anim labels.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  createBakedGrudge6Unit,
  createAnimatedUnit,
} from "../modelLoader.js";
import {
  regroundCharacter,
  placeCharacterOnGround,
  measureFootContactY,
} from "../characterScale.js";
import { WeaponToBakedPack } from "../bakedAnimLoader.js";
import {
  CHARACTER_RACES,
  auditCharacterMaterials,
  textureHealth,
  formatCharacterLoadError,
  raceTextureFallbackPaths,
} from "../characterResources.js";
import { charUrl } from "../assetConfig.js";
import {
  loadAnimLabelCatalog,
  getAnimEntry,
  setAnimLabel,
  getOverrides,
  exportMergedLabels,
  downloadLabelsJson,
} from "../animLabels.js";
import { loadBakedClip } from "../bakedAnimLoader.js";
import { applyWeaponCarryTuning } from "../weaponAttachConfig.js";
import { vfxForClip } from "../combatVfx.js";
import { mountAnimStudio } from "./studio.js";
import {
  getClipTrim,
  tickTrimmedAction,
} from "../skillAnimTrim.js";
import {
  getD1LoadoutForRace,
  setD1ArmorSlot,
  setD1WeaponSlot,
  setD1Weapon,
} from "../d1LoadoutStore.js";

const WEAPONS = Object.keys(WeaponToBakedPack);

const params = new URLSearchParams(location.search);
const initialRace = CHARACTER_RACES.includes(params.get("race"))
  ? params.get("race")
  : "human";
const initialWeapon = WEAPONS.includes(params.get("weapon"))
  ? params.get("weapon")
  : "greatsword";
const initialPipe = params.get("pipeline") === "legacy" ? "legacy" : "baked";

const logEl = document.getElementById("log");
const statusPill = document.getElementById("status-pill");
const raceSel = document.getElementById("race-sel");
const weaponSel = document.getElementById("weapon-sel");
const pipeSel = document.getElementById("pipe-sel");
const animSel = document.getElementById("anim-sel");
const gaitSlider = document.getElementById("gait-slider");
const gaitLabel = document.getElementById("gait-label");
const coordPill = document.getElementById("coord-pill");
const studioPanel = document.getElementById("studio-panel");

let studio = null;
/** @type {{ action: import('three').AnimationAction, trim: object } | null} */
let activeTrim = null;

let labelCatalog = { clips: {} };
loadAnimLabelCatalog().then((c) => {
  labelCatalog = c;
});

function appendLogLine(text, { kind = "text", clipKey = null } = {}) {
  const line = document.createElement("div");
  line.className = `log-line log-${kind}`;
  if (kind === "clip" && clipKey) {
    line.classList.add("log-clip");
    line.dataset.clipKey = clipKey;
    line.title = "Right-click to rename / annotate (saved in browser; Export labels → animLabels.json)";
  }
  line.textContent = text;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  return line;
}

const log = (m, opts) => appendLogLine(m, opts);

function showClipContextMenu(e, clipKey) {
  e.preventDefault();
  const entry = getAnimEntry(
    clipKey,
    labelCatalog,
    getOverrides(),
    unit?.controller?.clipSources,
  );
  const label = prompt(
    `Display name for "${clipKey}"\n(baked: ${entry.source || "?"})`,
    entry.label,
  );
  if (label === null) return;
  const notes = prompt("Notes (optional)", entry.notes || "");
  if (notes === null) return;
  setAnimLabel(clipKey, {
    label,
    notes,
    source: entry.source,
    race: raceSel.value,
    weapon: weaponSel.value,
  });
  refreshClipListUI();
  refreshClipLogLines(unit?.controller);
  log(`✎ saved label: ${clipKey} → "${label}" (localStorage — Export labels → public/models/animLabels.json)`, {
    kind: "meta",
  });
}

logEl.addEventListener("contextmenu", (e) => {
  const row = e.target.closest?.("[data-clip-key]");
  if (!row) return;
  showClipContextMenu(e, row.dataset.clipKey);
});

for (const r of CHARACTER_RACES) {
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
  new THREE.CircleGeometry(6, 64),
  new THREE.MeshStandardMaterial({ color: 0x2a2a3a, roughness: 0.9 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = 0;
ground.receiveShadow = true;
scene.add(ground);
scene.add(new THREE.GridHelper(8, 16, 0x3a3a5a, 0x222233));

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
  statusPill.style.borderColor = ok
    ? "rgba(92,207,122,0.5)"
    : "rgba(255,107,107,0.5)";
}

function bindStats(action) {
  let bound = 0;
  const bindings = action?._propertyBindings || [];
  for (const b of bindings) if (b?.binding?.node) bound++;
  return { bound, total: bindings.length };
}

function formatClipOption(key) {
  const entry = getAnimEntry(
    key,
    labelCatalog,
    getOverrides(),
    unit?.controller?.clipSources,
  );
  const src = entry.source ? ` · ${entry.source}` : "";
  return entry.label !== key ? `${entry.label} (${key})${src}` : `${key}${src}`;
}

function refreshClipListUI() {
  if (!clipNames.length) return;
  const prev = animSel.value;
  animSel.innerHTML = '<option value="">— pick —</option>';
  for (const name of clipNames) {
    const o = document.createElement("option");
    o.value = name;
    o.textContent = formatClipOption(name);
    animSel.appendChild(o);
  }
  if (clipNames.includes(prev)) animSel.value = prev;
}

function formatClipLogLine(key, controller) {
  const entry = getAnimEntry(
    key,
    labelCatalog,
    getOverrides(),
    controller?.clipSources,
  );
  const src = entry.source ? ` ← ${entry.source}` : "";
  const note = entry.notes ? ` // ${entry.notes}` : "";
  return { text: `  ${entry.label} [${key}]${src}${note}`, key };
}

function refreshClipLogLines(controller) {
  if (!controller || pipeSel.value !== "baked") return;
  for (const row of logEl.querySelectorAll("[data-clip-key]")) {
    const key = row.dataset.clipKey;
    if (!key) continue;
    const { text } = formatClipLogLine(key, controller);
    row.textContent = text;
  }
}

function populateClipList(controller, baked) {
  animSel.innerHTML = '<option value="">— pick —</option>';
  clipNames = [];

  if (baked && controller.clips) {
    for (const name of controller.clips.keys()) {
      clipNames.push(name);
      const o = document.createElement("option");
      o.value = name;
      o.textContent = formatClipOption(name);
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

function logClipCatalog(controller) {
  log("— clips (right-click name to rename) —", { kind: "meta" });
  for (const key of clipNames) {
    const { text } = formatClipLogLine(key, controller);
    log(text, { kind: "clip", clipKey: key });
  }
}

const LOCO_GAIT = { idle: 0, walk: 34, run: 70, sprint: 100 };

function playClip(name, { loop = true } = {}) {
  if (!unit?.controller || !name) return;
  activeTrim = null;
  const trim = getClipTrim(name);
  if (pipeSel.value === "baked" && name in LOCO_GAIT) {
    const v = LOCO_GAIT[name];
    gaitSlider.value = String(v);
    gaitSlider.dispatchEvent(new Event("input"));
  } else {
    const speed = trim.timeScale ?? 1;
    unit.controller.play(name, { loop, speed });
    const action = unit.controller.currentAction;
    if (action && (trim.start > 0 || trim.end != null)) {
      action.time = trim.start ?? 0;
      activeTrim = { action, trim };
    }
  }
  vfxForClip(unit.scene, name);
  const entry = getAnimEntry(
    name,
    labelCatalog,
    getOverrides(),
    unit.controller.clipSources,
  );
  log(`▶ ${entry.label} [${name}]`, { kind: "clip", clipKey: name });
  setStatus(`${unit.race} · ${entry.label}`);
}

async function playBankClip(rel) {
  if (!unit?.controller?.director || !rel) return;
  try {
    const clip = await loadBakedClip(rel, unit.scene);
    unit.controller.director.playOneShot(clip, { fade: 0.15, timeScale: 1 });
    const key = rel.split("/").pop();
    vfxForClip(unit.scene, key);
    log(`▶ bank: ${rel}`, { kind: "clip", clipKey: key });
    setStatus(`${unit.race} · ${key}`);
  } catch (err) {
    log(`FAIL bank clip: ${err.message}`, { kind: "error" });
  }
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

function reportLoadError(err) {
  const detail = formatCharacterLoadError(err);
  log(`FAIL: ${detail}`, { kind: "error" });
  console.error("[anim-test]", err);
  setStatus(err?.code || "load error", false);
}

async function logTextureSources(race) {
  const paths = raceTextureFallbackPaths(race);
  log("— texture source files (edit on disk) —", { kind: "meta" });
  for (const p of paths) {
    log(`  atlas try: ${p}`, { kind: "meta" });
    try {
      const res = await fetch(p, { method: "HEAD" });
      const len = res.headers.get("content-length");
      log(
        `    ${res.ok ? "OK" : "FAIL"} ${res.status} ${len ? `${len} bytes` : ""}`,
        { kind: res.ok && len && Number(len) < 1024 ? "error" : "meta" },
      );
      if (res.ok && len && Number(len) < 1024) {
        log("    WARN: file is a 1×1 placeholder — run: node scripts/sync-race-atlases.mjs", {
          kind: "error",
        });
      }
    } catch (err) {
      log(`    fetch error: ${err.message}`, { kind: "error" });
    }
  }
  log(`  edit folder: public/assets/characters/${race}/textures/`, { kind: "meta" });
  log(`  mesh GLB:    public/assets/characters/${race}/`, { kind: "meta" });
}

async function loadCharacter() {
  disposeUnit();
  logEl.innerHTML = "";
  const race = raceSel.value;
  const weapon = weaponSel.value;
  const baked = pipeSel.value === "baked";

  log(`=== ${race.toUpperCase()} / ${weapon} / ${baked ? "baked" : "legacy"} ===`, {
    kind: "meta",
  });

  try {
    unit = baked
      ? await createBakedGrudge6Unit(race, weapon)
      : await createAnimatedUnit(race, weapon);

    const mesh = unit.scene;
    placeCharacterOnGround(mesh, 0, 0, race);
    scene.add(mesh);
    if (unit.equipment || baked) {
      applyWeaponCarryTuning(mesh, weapon);
    }

    const targetH =
      unit.characterMetrics?.targetHeight ||
      mesh.userData?.characterMetrics?.targetHeight ||
      1.75;
    controls.target.set(0, targetH * 0.55, 0);
    camera.position.set(0, targetH * 0.85, Math.max(2.8, targetH * 1.85));
    controls.update();

    await logTextureSources(race);

    const mats = auditCharacterMaterials(mesh);
    const health = textureHealth(mats);
    log(`mesh: ${unit.modelPath || loadedPath(race)}`);
    log(`pipeline: ${unit.pipeline || (baked ? "baked" : "legacy")}`);
    const m = unit.characterMetrics || mesh.userData?.characterMetrics;
    if (m) {
      log(
        `scale: target=${m.targetHeight.toFixed(2)}m measured=${m.measuredHeight.toFixed(2)}m ` +
          `bones=${(m.boneHeight ?? 0).toFixed(2)} bbox=${(m.bboxHeight ?? 0).toFixed(2)} ` +
          `world=${m.worldScale.toFixed(4)} (${m.source}/${m.measureMethod ?? "?"}) · rootY=${mesh.position.y.toFixed(3)} · soleY=${measureFootContactY(mesh).toFixed(3)} (feet@0)`,
      );
    } else {
      log(`scale: ${mesh.scale.x.toFixed(4)} · y=${mesh.position.y.toFixed(3)}`);
    }
    log(`materials: ${mats.withMap}/${mats.total} textured · ${mats.visible} visible meshes`);

    if (!health.ok) {
      log(`WARN: ${health.detail}`, { kind: "error" });
      log("FIX: node scripts/sync-race-atlases.mjs  then hard-refresh", { kind: "error" });
      setStatus(health.label, false);
    } else {
      setStatus(`${race} · ${health.label}`);
    }

    populateClipList(unit.controller, baked);
    if (baked) {
      unit.controller.director?.primeLocomotion?.();
      unit.controller.mixer?.update?.(0);
      regroundCharacter(mesh, race);
      logClipCatalog(unit.controller);
    } else {
      const idle = unit.controller.actions?.get("idle");
      const stats = bindStats(idle);
      log(`legacy idle bind: ${stats.bound}/${stats.total} tracks`);
      if (stats.bound < stats.total * 0.5) {
        log("WARN: low idle bind ratio — try pipeline=baked", { kind: "error" });
      }
      if (idle) {
        unit.controller.play("idle");
        unit.controller.mixer?.update?.(0);
        regroundCharacter(mesh, race);
      }
    }

    if (clipNames.length) {
      cycleIdx = 0;
      playClip(clipNames[0]);
      animSel.value = clipNames[0];
      unit.controller.mixer?.update?.(0);
      regroundCharacter(mesh, race);
      if (autoCycle) startCycle();
    }

    if (!studio) {
      studio = mountAnimStudio(studioPanel, {
        getWeapon: () => weaponSel.value,
        getClipNames: () => clipNames,
        getCurrentClip: () => animSel.value,
        getEquipmentCatalog: () => unit?.equipment?.getCatalog?.() || {},
        getD1Loadout: () => getD1LoadoutForRace(raceSel.value),
        onPlayClip: (key) => playClip(key, { loop: false }),
        onPlayBankClip: playBankClip,
        onWeaponTuningChange: () => {
          if (unit?.scene) applyWeaponCarryTuning(unit.scene, weaponSel.value);
        },
        onSkillAnimChange: (slot, clip) => {
          log(`skill ${slot} → ${clip}`, { kind: "meta" });
        },
        onTrimChange: (key) => log(`trim ${key}: ${JSON.stringify(getClipTrim(key))}`, { kind: "meta" }),
        onTrimSaved: (id, key) => log(`saved clip "${id}" ← ${key}`, { kind: "meta" }),
        onArenaWeaponChange: (w) => {
          weaponSel.value = w;
          setD1Weapon(w);
          loadCharacter();
        },
        onD1ArmorChange: (slot, variant) => setD1ArmorSlot(slot, variant),
        onD1WeaponSlotChange: (key, value) => {
          const w = getD1LoadoutForRace(raceSel.value).weapon || {};
          if (key === "rSlot") setD1WeaponSlot("r", value, w.rVariant);
          else if (key === "rVariant") setD1WeaponSlot("r", w.rSlot, value);
          else if (key === "lSlot") setD1WeaponSlot("l", value, w.lVariant);
          else if (key === "lVariant") setD1WeaponSlot("l", w.lSlot, value);
        },
        onD1LoadoutChange: async () => {
          if (!unit?.equipment) return;
          const d1 = getD1LoadoutForRace(raceSel.value);
          unit.equipment.applyD1Loadout(weaponSel.value, d1);
          regroundCharacter(unit.scene, raceSel.value);
        },
      });
    }
    await studio.refresh();

    history.replaceState(
      null,
      "",
      `?race=${race}&weapon=${weapon}&pipeline=${baked ? "baked" : "legacy"}`,
    );
  } catch (err) {
    reportLoadError(err);
  }
}

function loadedPath(race) {
  return charUrl(`${race}/${race === "human" ? "WK" : race === "barbarian" ? "BRB" : race === "elf" ? "ELF" : race === "dwarf" ? "DWF" : race === "orc" ? "ORC" : "UD"}_Characters.glb`);
}

gaitSlider.addEventListener("input", () => {
  if (!unit?.controller?.director) return;
  const v = Number(gaitSlider.value) / 100;
  unit.controller.director.gaitTarget = v;
  unit.controller.director.gait = v;
  const label =
    v < 0.2 ? "idle" : v < 0.55 ? "walk" : v < 0.85 ? "run" : "sprint";
  gaitLabel.textContent = label;
});

raceSel.addEventListener("change", loadCharacter);
weaponSel.addEventListener("change", loadCharacter);
pipeSel.addEventListener("change", loadCharacter);

animSel.addEventListener("change", () => {
  stopCycle();
  playClip(animSel.value);
  studio?.refreshTrim?.();
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

document.getElementById("export-labels-btn")?.addEventListener("click", async () => {
  const merged = await exportMergedLabels(unit?.controller?.clipSources);
  downloadLabelsJson(merged);
  log("exported animLabels.json — save to public/models/animLabels.json", { kind: "meta" });
});

window.addEventListener("unhandledrejection", (ev) => {
  reportLoadError(ev.reason);
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
    if (activeTrim?.action) {
      const playing = tickTrimmedAction(activeTrim.action, activeTrim.trim);
      if (!playing) activeTrim = null;
    }
  }
  if (unit?.scene && coordPill) {
    const m = unit.scene;
    coordPill.textContent =
      `root (${m.position.x.toFixed(1)}, ${m.position.y.toFixed(2)}, ${m.position.z.toFixed(1)}) · ground Y=0`;
  }
  controls.update();
  renderer.render(scene, camera);
})();

loadCharacter();