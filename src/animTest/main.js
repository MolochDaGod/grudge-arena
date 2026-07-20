/**
 * Combat Studio — production TPS controls on the anim-test surface.
 *
 * Replaces OrbitControls showcase camera with:
 *   OrbitCamera (danger-room TPS) + ArenaController + SoftLockSystem
 * Weapon skills from WeaponDefinitions, baked locomotion, block/dodge/climb.
 */

import * as THREE from "three";
import { createBakedGrudge6Unit } from "../modelLoader.js";
import {
  regroundCharacter,
  placeCharacterOnGround,
} from "../characterScale.js";
import { WeaponToBakedPack } from "../bakedAnimLoader.js";
import {
  CHARACTER_RACES,
  auditCharacterMaterials,
  textureHealth,
  formatCharacterLoadError,
} from "../characterResources.js";
import { loadAnimLabelCatalog, getAnimEntry, getOverrides } from "../animLabels.js";
import { WeaponDefinitions } from "../engine/WeaponDefinitions.js";
import { getWeaponFeel, resolveMotionLabel } from "../engine/WeaponFeel.js";
import { OrbitCamera } from "../engine/OrbitCamera.js";
import { ArenaController } from "../engine/ArenaController.js";
import { GroundSampler } from "../engine/GroundSampler.js";
import {
  softLock,
  setRawMouse,
  updateSoftLock,
  lockedTargetWorld,
  cycleTabTarget,
  clearTabTarget,
} from "../engine/SoftLockSystem.js";
import { loadBakedClip } from "../bakedAnimLoader.js";
import { vfxForClip } from "../combatVfx.js";
import {
  getD1LoadoutForRace,
  setD1Weapon,
} from "../d1LoadoutStore.js";

const WEAPONS = Object.keys(WeaponToBakedPack);
const SKILL_KEYS = ["Q", "E", "R", "F", "P"];

const params = new URLSearchParams(location.search);
const initialRace = CHARACTER_RACES.includes(params.get("race"))
  ? params.get("race")
  : "human";
const initialWeapon = WEAPONS.includes(params.get("weapon"))
  ? params.get("weapon")
  : "greatsword";

const logEl = document.getElementById("log");
const statusPill = document.getElementById("status-pill");
const raceSel = document.getElementById("race-sel");
const weaponSel = document.getElementById("weapon-sel");
const pipeSel = document.getElementById("pipe-sel");
const animSel = document.getElementById("anim-sel");
const gaitSlider = document.getElementById("gait-slider");
const gaitLabel = document.getElementById("gait-label");
const coordPill = document.getElementById("coord-pill");
const abilityBar = document.getElementById("ability-bar");
const motionLabel = document.getElementById("motion-label");
const weaponLabelEl = document.getElementById("weapon-label");
const lockLabel = document.getElementById("lock-label");
const softZoneEl = document.getElementById("softlock-zone");
const targetPipEl = document.getElementById("target-pip");
const crosshairEl = document.getElementById("crosshair");
const hpFill = document.getElementById("hp-fill");
const hpText = document.getElementById("hp-text");
const resFill = document.getElementById("res-fill");
const resText = document.getElementById("res-text");
const resName = document.getElementById("res-name");

let labelCatalog = { clips: {} };
loadAnimLabelCatalog().then((c) => {
  labelCatalog = c;
});

function appendLogLine(text, { kind = "text" } = {}) {
  const line = document.createElement("div");
  line.className = `log-line log-${kind}`;
  line.textContent = text;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
  return line;
}
const log = (m, opts) => appendLogLine(m, opts);

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
if (pipeSel) pipeSel.value = "baked";

// ── Scene ──────────────────────────────────────────────────────────────
const wrap = document.getElementById("canvas-wrap");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a0b8);
scene.fog = new THREE.Fog(0x87a0b8, 40, 120);

const camera = new THREE.PerspectiveCamera(55, 1, 0.08, 200);
camera.position.set(0, 2.2, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
wrap.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xfff1d6, 1.25);
sun.position.set(18, 28, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
scene.add(sun);
const fill = new THREE.HemisphereLight(0xb8d4ff, 0x3a4a2a, 0.45);
scene.add(fill);

// Walkable ground + climb ledge + shallow water for swim
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0x3d5c3a, roughness: 0.92, metalness: 0.05 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.name = "Ground";
scene.add(ground);

const climbLedge = new THREE.Mesh(
  new THREE.BoxGeometry(6, 1.4, 3),
  new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.85 }),
);
climbLedge.position.set(8, 0.7, -4);
climbLedge.castShadow = true;
climbLedge.receiveShadow = true;
climbLedge.name = "ClimbLedge";
scene.add(climbLedge);

const water = new THREE.Mesh(
  new THREE.BoxGeometry(14, 0.6, 10),
  new THREE.MeshStandardMaterial({
    color: 0x1a5a7a,
    transparent: true,
    opacity: 0.55,
    roughness: 0.25,
    metalness: 0.2,
  }),
);
water.position.set(-10, 0.15, 6);
water.name = "Water";
scene.add(water);

const groundSampler = new GroundSampler();
groundSampler.setTerrainMeshes([ground, climbLedge]);
groundSampler.setFallbackY(0);

const orbitCamera = new OrbitCamera(camera, renderer.domElement);
orbitCamera.setControlMode("tps");

/** Minimal targeting facade SoftLockSystem expects. */
const targeting = {
  units: [],
  enemies: [],
  currentTarget: null,
  select(u) {
    this.currentTarget = u;
  },
  deselect() {
    this.currentTarget = null;
  },
};

function resize() {
  const w = wrap.clientWidth || 1;
  const h = wrap.clientHeight || 1;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
/** @type {any} */
let unit = null;
/** @type {ArenaController|null} */
let playerController = null;
/** @type {any[]} */
let dummies = [];
let clipNames = [];
let autoAttack = false;
let lastAttack = 0;
let swingIdx = 0;
const playerVitals = {
  hp: 100,
  maxHp: 100,
  resource: 40,
  maxResource: 100,
  resourceName: "rage",
};
const skillCd = { Q: 0, E: 0, R: 0, F: 0, P: 0 };
const skillCdMax = { Q: 0, E: 0, R: 0, F: 0, P: 0 };
let swimming = false;

function setStatus(text, ok = true) {
  statusPill.textContent = text;
  statusPill.style.color = ok ? "#5fcf7a" : "#ff6b6b";
  statusPill.style.borderColor = ok
    ? "rgba(92,207,122,0.5)"
    : "rgba(255,107,107,0.5)";
}

function currentWeaponDef() {
  const w = weaponSel.value;
  return WeaponDefinitions[w] || WeaponDefinitions.greatsword;
}

function rebuildAbilityBar() {
  const def = currentWeaponDef();
  abilityBar.innerHTML = "";
  const slots = [
    { key: "1", ab: "Q" },
    { key: "2", ab: "E" },
    { key: "3", ab: "R" },
    { key: "4", ab: "F" },
    { key: "5", ab: "P" },
  ];
  for (const s of slots) {
    const ab = def.abilities?.[s.ab];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot";
    btn.dataset.ab = s.ab;
    btn.innerHTML = `<span class="key">${s.key}</span><span class="name">${ab?.name || "—"}</span>`;
    btn.title = ab ? `${ab.name}: ${ab.description || ""}` : "";
    btn.addEventListener("click", () => castSkill(s.ab));
    abilityBar.appendChild(btn);
    if (ab) {
      skillCdMax[s.ab] = ab.cooldown || 0;
    }
  }
  weaponLabelEl.textContent = def.name || weaponSel.value;
  resName.textContent = (def.primaryResource || "resource").toUpperCase();
  playerVitals.resourceName = def.primaryResource || "rage";
}

function updateAbilityCdUi() {
  for (const el of abilityBar.querySelectorAll(".slot")) {
    const ab = el.dataset.ab;
    const left = skillCd[ab] || 0;
    el.classList.toggle("cd", left > 0.05);
    if (left > 0.05) {
      el.querySelector(".name").textContent = left.toFixed(1) + "s";
    } else {
      const def = currentWeaponDef().abilities?.[ab];
      el.querySelector(".name").textContent = def?.name || "—";
    }
  }
}

function updateVitalsUi() {
  const hpPct = Math.max(0, Math.min(100, (playerVitals.hp / playerVitals.maxHp) * 100));
  const resPct = Math.max(0, Math.min(100, (playerVitals.resource / playerVitals.maxResource) * 100));
  hpFill.style.width = `${hpPct}%`;
  resFill.style.width = `${resPct}%`;
  hpText.textContent = `${Math.round(playerVitals.hp)} / ${playerVitals.maxHp}`;
  resText.textContent = `${Math.round(playerVitals.resource)} / ${playerVitals.maxResource}`;
}

async function castSkill(slotKey) {
  if (!unit?.controller || !playerController) return;
  if ((skillCd[slotKey] || 0) > 0) return;
  const ab = currentWeaponDef().abilities?.[slotKey];
  if (!ab) return;
  const cost = ab.cost || 0;
  if (cost > 0 && playerVitals.resource < cost) {
    log(`Not enough ${playerVitals.resourceName} for ${ab.name}`, { kind: "meta" });
    return;
  }
  playerVitals.resource = Math.max(0, playerVitals.resource - cost);
  skillCd[slotKey] = ab.cooldown || 1;
  playerController._activeSkill = SKILL_KEYS.indexOf(slotKey) + 1;
  playerController.send?.({ type: "skill" });

  const anim = ab.skillAnim || "attack1";
  try {
    if (typeof unit.controller.castSkill === "function") {
      unit.controller.castSkill({ stateName: anim, timeScale: 1.05, fade: 0.12 });
    } else if (unit.controller.playOnce) {
      unit.controller.playOnce(anim, 1.05);
    } else if (unit.controller.director) {
      const clip = await loadBakedClip(
        anim.includes("/") ? anim : `locomotion/${anim}`,
        unit.scene,
      ).catch(() => null);
      if (clip) unit.controller.director.playOneShot(clip, { fade: 0.12, timeScale: 1.05 });
      else unit.controller.play?.(anim, { loop: false });
    }
  } catch (err) {
    log(`skill anim: ${err.message}`, { kind: "error" });
  }
  vfxForClip(unit.scene, anim);
  log(`⚔ ${ab.name} [${slotKey}]`, { kind: "clip" });
  setStatus(`${unit.race} · ${ab.name}`);
  updateVitalsUi();
}

function performAttack() {
  if (!unit?.controller) return;
  const def = currentWeaponDef();
  const anims = def.attackAnims || ["attack1"];
  const name = anims[swingIdx % anims.length];
  swingIdx++;
  unit.controller.playOnce?.(name, getWeaponFeel(weaponSel.value).attackAnimSpeed ?? 1.1);
  vfxForClip(unit.scene, name);
  playerVitals.resource = Math.min(
    playerVitals.maxResource,
    playerVitals.resource + (def.primaryResource === "rage" ? 8 : 2),
  );
  // Damage locked dummy
  const tgt = targeting.currentTarget;
  if (tgt && !tgt.dead) {
    tgt.hp = Math.max(0, tgt.hp - (def.baseAttackDamage || 30) * 0.35);
    if (tgt.hp <= 0) {
      tgt.dead = true;
      tgt.mesh.position.y -= 0.4;
      tgt.mesh.rotation.x = Math.PI / 2;
      log(`Dummy down`, { kind: "meta" });
      if (targeting.currentTarget === tgt) {
        targeting.deselect();
        clearTabTarget();
      }
    }
  }
  updateVitalsUi();
}

function makeDummy(pos, name = "Training Dummy") {
  const group = new THREE.Group();
  group.position.copy(pos);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.4, 1.6, 12),
    new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8 }),
  );
  body.position.y = 0.9;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xc4a574 }),
  );
  head.position.y = 1.85;
  group.add(head);
  scene.add(group);
  const dummy = {
    mesh: group,
    team: "B",
    hp: 200,
    maxHp: 200,
    dead: false,
    displayName: name,
    entity: { id: `dummy-${Math.random().toString(36).slice(2, 8)}`, hasTag: () => false },
  };
  return dummy;
}

function spawnDummies() {
  for (const d of dummies) {
    scene.remove(d.mesh);
  }
  dummies = [
    makeDummy(new THREE.Vector3(4, 0, -2), "Dummy A"),
    makeDummy(new THREE.Vector3(-3, 0, -5), "Dummy B"),
    makeDummy(new THREE.Vector3(6, 0, 3), "Dummy C"),
  ];
  targeting.units = dummies;
  targeting.enemies = dummies;
  targeting.deselect();
  clearTabTarget();
}

function disposeUnit() {
  if (playerController) {
    playerController.dispose?.();
    playerController = null;
  }
  if (unit?.scene) {
    scene.remove(unit.scene);
    unit.controller?.dispose?.();
    unit.mixer?.stopAllAction?.();
  }
  unit = null;
  clipNames = [];
  if (animSel) animSel.innerHTML = '<option value="">— pick —</option>';
  autoAttack = false;
}

function reportLoadError(err) {
  const detail = formatCharacterLoadError(err);
  log(`FAIL: ${detail}`, { kind: "error" });
  console.error("[combat-studio]", err);
  setStatus(err?.code || "load error", false);
}

function wireController() {
  if (!unit?.scene || !unit?.controller) return;
  playerController = new ArenaController(unit.scene, unit.controller, orbitCamera);
  playerController.controlScheme = "tps";
  playerController.useBakedLoco = !!unit.controller.useBakedLoco;
  playerController.clampRadius = 36;
  playerController.groundSampler = groundSampler;
  if (playerController.setGroundSampler) {
    playerController.setGroundSampler(groundSampler);
  }
  // Climb: treat ledge as climbable via simple probe
  playerController._tryStartClimb = function tryClimb() {
    if (!unit?.scene) return false;
    const mesh = unit.scene;
    const forward = this.getForward();
    const px = mesh.position.x + forward.x * 1.2;
    const pz = mesh.position.z + forward.z * 1.2;
    const ledgeTop = climbLedge.position.y + 0.7;
    const dist = Math.hypot(px - climbLedge.position.x, pz - climbLedge.position.z);
    if (dist < 3.2 && mesh.position.y < ledgeTop - 0.2) {
      this._climbing = true;
      this._climbT = 0;
      this._climbStartY = mesh.position.y;
      this._climbTopY = ledgeTop;
      this._climbDirX = forward.x;
      this._climbDirZ = forward.z;
      unit.controller.playOnce?.("climb", 1) || unit.controller.play?.("jump", { loop: false });
      log("Climbing ledge…", { kind: "meta" });
      return true;
    }
    return false;
  };

  playerController.onAttack = () => {
    autoAttack = !autoAttack;
    log(autoAttack ? "Auto-attack ON" : "Auto-attack OFF", { kind: "meta" });
  };
  playerController.onAbility = (slotKey) => {
    if (["Q", "E", "R", "F"].includes(slotKey)) castSkill(slotKey);
    else if (slotKey === "P" || slotKey === "5") castSkill("P");
  };
  playerController.onTarget = () => {
    const rect = renderer.domElement.getBoundingClientRect();
    cycleTabTarget(camera, rect, targeting, weaponSel.value);
    const st = softLock.hardLock ? "HARD LOCK" : softLock.active ? "SOFT LOCK" : "Free aim";
    lockLabel.textContent = st;
  };
  playerController.onDash = () => {
    log("Dodge", { kind: "meta" });
    unit.controller.playOnce?.("dodge", 1.2);
  };

  // LMB attack for TPS (ArenaController emits _LMBAttack)
  window.addEventListener("mousedown", (e) => {
    if (e.button === 0 && playerController) {
      playerController.tickKey = playerController.tickKey || {};
      playerController.tickKey._LMBAttack = true;
    }
    // Middle mouse hard lock toggle
    if (e.button === 1) {
      e.preventDefault();
      if (softLock.active) {
        softLock.hardLock = !softLock.hardLock;
        lockLabel.textContent = softLock.hardLock ? "HARD LOCK" : "SOFT LOCK";
        log(softLock.hardLock ? "Hard lock engaged" : "Hard lock released", { kind: "meta" });
      } else {
        playerController.onTarget?.();
        softLock.hardLock = true;
        lockLabel.textContent = "HARD LOCK";
      }
    }
  });
  window.addEventListener("mousemove", (e) => setRawMouse(e.clientX, e.clientY), {
    passive: true,
  });
}

async function loadCharacter() {
  disposeUnit();
  logEl.innerHTML = "";
  const race = raceSel.value;
  const weapon = weaponSel.value;
  setStatus("loading…");
  log(`Combat Studio — ${race} / ${weapon}`, { kind: "meta" });
  log(`pipeline: baked (prod)`, { kind: "meta" });

  try {
    setD1Weapon(weapon);
    const result = await createBakedGrudge6Unit(race, weapon, {
      tier: 3,
      requireD1: true,
      meshLoadout: getD1LoadoutForRace(race),
    });
    unit = result;
    unit.race = result.race || race;
    unit.scene = result.scene;
    scene.add(unit.scene);
    placeCharacterOnGround(unit.scene, 0);
    regroundCharacter(unit.scene);
    groundSampler.snapMesh?.(unit.scene);

    const audit = auditCharacterMaterials(unit.scene);
    const health = textureHealth(audit);
    log(
      `materials: ${health.textured}/${health.total} textured`,
      { kind: health.textured === health.total && health.total > 0 ? "meta" : "error" },
    );
    const metrics = unit.characterMetrics || unit.scene.userData?.characterMetrics;
    if (metrics) {
      log(
        `scale: target=${metrics.targetHeight?.toFixed?.(2) ?? "?"}m measured=${metrics.measuredHeight?.toFixed?.(2) ?? metrics.height?.toFixed?.(2) ?? "?"}m`,
        { kind: "meta" },
      );
    }

    // Clip catalog for smoke + skills
    clipNames = [];
    if (unit.controller?.clips) {
      for (const name of unit.controller.clips.keys()) clipNames.push(name);
    } else if (unit.controller?.actions) {
      for (const name of unit.controller.actions.keys()) clipNames.push(name);
    }
    log(`baked clips: ${clipNames.length}`, { kind: "meta" });
    log("— clips —", { kind: "meta" });
    for (const key of clipNames.slice(0, 40)) {
      const entry = getAnimEntry(key, labelCatalog, getOverrides(), unit.controller?.clipSources);
      log(`  ${entry.label} [${key}]`, { kind: "clip" });
    }
    if (animSel) {
      animSel.innerHTML = '<option value="">— pick —</option>';
      for (const name of clipNames) {
        const o = document.createElement("option");
        o.value = name;
        o.textContent = name;
        animSel.appendChild(o);
      }
    }

    unit.controller?.setWeaponType?.(weapon);
    unit.controller?.setGaitFromSpeed?.(0, false);

    orbitCamera.setTarget(unit.scene);
    orbitCamera.snapBehind?.();
    wireController();
    spawnDummies();
    rebuildAbilityBar();
    playerVitals.hp = 100;
    playerVitals.resource = 40;
    updateVitalsUi();

    log("Controls: WASD move · LMB attack · RMB orbit · Tab soft-lock · MMB hard-lock · V block · Ctrl dodge · 1-5 skills", {
      kind: "meta",
    });
    setStatus(`${race} · ${weapon} · ready`);
  } catch (err) {
    reportLoadError(err);
  }
}

// ── Input: keep gait slider for smoke compatibility (hidden) ──
gaitSlider?.addEventListener("input", () => {
  const v = Number(gaitSlider.value) / 100;
  if (unit?.controller?.setGaitFromSpeed) {
    unit.controller.setGaitFromSpeed(v, v > 0.85);
  }
  const label = v < 0.1 ? "idle" : v < 0.4 ? "walk" : v < 0.75 ? "run" : "sprint";
  if (gaitLabel) gaitLabel.textContent = label;
});

raceSel.addEventListener("change", () => {
  const u = new URL(location.href);
  u.searchParams.set("race", raceSel.value);
  u.searchParams.set("weapon", weaponSel.value);
  u.searchParams.set("pipeline", "baked");
  history.replaceState(null, "", u);
  loadCharacter();
});
weaponSel.addEventListener("change", () => {
  const u = new URL(location.href);
  u.searchParams.set("race", raceSel.value);
  u.searchParams.set("weapon", weaponSel.value);
  history.replaceState(null, "", u);
  loadCharacter();
});

// ── Frame loop ─────────────────────────────────────────────────────────
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, clock.getDelta());

  for (const k of SKILL_KEYS) {
    if (skillCd[k] > 0) skillCd[k] = Math.max(0, skillCd[k] - dt);
  }
  updateAbilityCdUi();

  // Resource regen
  playerVitals.resource = Math.min(
    playerVitals.maxResource,
    playerVitals.resource + dt * 4,
  );
  if (playerVitals.hp < playerVitals.maxHp) {
    playerVitals.hp = Math.min(playerVitals.maxHp, playerVitals.hp + dt * 2);
  }
  updateVitalsUi();

  if (unit?.mixer) unit.mixer.update(dt);
  if (unit?.controller?.update) unit.controller.update(dt);
  if (playerController) {
    playerController.update(dt);
    // Swim detection
    const p = unit.scene.position;
    const inWater =
      Math.abs(p.x - water.position.x) < 7 &&
      Math.abs(p.z - water.position.z) < 5 &&
      p.y < 0.5;
    if (inWater && !swimming) {
      swimming = true;
      unit.controller.play?.("swim", { loop: true }) ||
        unit.controller.setGaitFromSpeed?.(0.2, false);
      log("Swimming", { kind: "meta" });
    } else if (!inWater && swimming) {
      swimming = false;
      log("Left water", { kind: "meta" });
    }
    if (!swimming && !playerController._climbing) {
      groundSampler.snapMesh?.(unit.scene);
    }
  }

  // Auto-attack
  if (autoAttack && unit) {
    const now = performance.now() / 1000;
    const spd = currentWeaponDef().attackSpeed || 1;
    if (now - lastAttack >= 1 / Math.max(0.4, spd)) {
      lastAttack = now;
      performAttack();
    }
  }

  // Soft / hard lock (danger-room SoftLockSystem)
  const rect = renderer.domElement.getBoundingClientRect();
  if (unit) {
    updateSoftLock(
      dt,
      camera,
      rect,
      targeting,
      softLock.hardLock,
      weaponSel.value,
    );
    // Crosshair follows magnetized aim point
    const cx = softLock.crosshairX || rect.left + rect.width / 2;
    const cy = softLock.crosshairY || rect.top + rect.height / 2;
    crosshairEl.style.left = `${cx - rect.left}px`;
    crosshairEl.style.top = `${cy - rect.top}px`;
    crosshairEl.classList.toggle("hard", !!softLock.hardLock);

    if (softLock.active && softLock.zoneRadius > 0) {
      softZoneEl.hidden = false;
      softZoneEl.style.left = `${softLock.zoneCx - rect.left}px`;
      softZoneEl.style.top = `${softLock.zoneCy - rect.top}px`;
      softZoneEl.style.width = `${softLock.zoneRadius * 2}px`;
      softZoneEl.style.height = `${softLock.zoneRadius * 2}px`;
    } else {
      softZoneEl.hidden = true;
    }

    if (softLock.targetVisible && softLock.active) {
      targetPipEl.hidden = false;
      targetPipEl.style.left = `${softLock.targetScreenX - rect.left}px`;
      targetPipEl.style.top = `${softLock.targetScreenY - rect.top}px`;
    } else {
      targetPipEl.hidden = true;
    }

    lockLabel.textContent = softLock.hardLock
      ? "HARD LOCK"
      : softLock.active
        ? "SOFT LOCK"
        : "Free aim";

    if (softLock.hardLock && softLock.active) {
      const world = lockedTargetWorld(targeting);
      if (world && orbitCamera.nudgeToward) {
        orbitCamera.nudgeToward(world);
      }
    }
  }

  // Motion label
  if (playerController) {
    const spd = playerController.currentSpeed || 0;
    const moving = spd > 0.15;
    orbitCamera.setPlayerMoving?.(moving);
    const label =
      swimming
        ? "SWIM"
        : playerController._climbing
          ? "CLIMB"
          : playerController.stateName === "block"
            ? "BLOCK"
            : resolveMotionLabel?.(spd, playerController.holdKey?.ShiftLeft) ||
              (spd < 0.2 ? "IDLE" : spd < 2.5 ? "WALK" : spd < 5 ? "RUN" : "SPRINT");
    motionLabel.textContent = String(label).toUpperCase();
  }

  orbitCamera.update?.(dt);
  renderer.render(scene, camera);

  if (unit?.scene) {
    const p = unit.scene.position;
    coordPill.textContent = `x=${p.x.toFixed(1)} y=${p.y.toFixed(2)} z=${p.z.toFixed(1)} · ${swimming ? "swim" : "ground"}`;
  }
}

// SoftLock update may not export getSoftLockHudState in older builds — provide fallback
function ensureSoftLockUpdate() {
  if (typeof updateSoftLock !== "function") return;
}
ensureSoftLockUpdate();

loadCharacter();
tick();

log("Combat Studio ready — production TPS stack (OrbitCamera + ArenaController + SoftLock)", {
  kind: "meta",
});
