/**
 * Danger Room + arena combat HUD — crosshair, motion MM readout, combo, hit marker.
 */

import {
  getDangerRoomState,
  subscribeDangerRoom,
  cycleRoomPreset,
  isCombatSandboxUi,
} from "./dangerRoomStore.js";
import { ROOM_PRESETS } from "./roomPresets.js";
import {
  getComboStage,
  getHitMarkerId,
  getCrosshairSpread,
  getLastAbilityKey,
  isAbilityFlashing,
} from "../engine/CombatFeedback.js";

let mounted = false;
let rootEl = null;
let unsub = null;
let lastPresetId = null;

function buildShell(presetName) {
  const sandbox = isCombatSandboxUi();
  const badge = sandbox
    ? `⚔ Combat Sandbox · ${presetName}`
    : `⚡ Danger Room · ${presetName}`;
  return `
    <div class="dr-mode-badge">${badge}</div>
    <div class="dr-aim-layer" aria-hidden="true">
      <div class="dr-softlock-zone" id="dr-softlock-zone" hidden></div>
      <div class="dr-target-pip" id="dr-target-pip" hidden></div>
      <div class="dr-crosshair dr-crosshair-cursor" id="dr-crosshair">
        <span class="dr-ch-magnet-ring" id="dr-ch-magnet"></span>
        <span class="dr-ch-range" id="dr-ch-range"></span>
        <span class="dr-ch-hit" id="dr-ch-hit" hidden></span>
        <span class="dr-ch-arm dr-ch-arm-t"></span>
        <span class="dr-ch-arm dr-ch-arm-b"></span>
        <span class="dr-ch-arm dr-ch-arm-l"></span>
        <span class="dr-ch-arm dr-ch-arm-r"></span>
        <span class="dr-ch-dot"></span>
      </div>
    </div>
    <div class="dr-mm-panel">
      <span>MM</span>
      <span class="dr-mm-value" id="dr-motion-label">IDLE</span>
      <span>·</span>
      <span id="dr-weapon-label">Weapon</span>
      ${sandbox ? `<span class="dr-focus-filter" id="dr-focus-filter">FOCUS: ALL</span>` : ""}
      <span class="dr-combo-badge" id="dr-combo-badge" hidden>Hit <span id="dr-combo-n">1</span></span>
    </div>
    <div class="dr-controls-hint">
      <div><kbd>WASD</kbd> Move <kbd>Shift</kbd> Sprint <kbd>RMB</kbd> Look/Aim</div>
      <div><kbd>Tab</kbd> Target <kbd>RMB</kbd> Attack <kbd>LMB</kbd> Fire <kbd>1-4</kbd> Skills</div>
      <div><kbd>G</kbd> Gear · <kbd>M</kbd> Menu · <kbd>Hold F</kbd> Weapons · <kbd>Tab</kbd> Target</div>
      ${sandbox ? `<div><kbd>\`</kbd> Toggle focus · <kbd>Tab</kbd> Cycle · <kbd>RMB</kbd> Hard lock</div>
      <div><kbd>[</kbd><kbd>]</kbd> Preset · <kbd>Hold R</kbd> Harvest · <kbd>LMB</kbd> Swing</div>` : `<div><kbd>[</kbd><kbd>]</kbd> Room preset · <kbd>Hold R</kbd> Harvest tools · <kbd>LMB</kbd> Chop/Mine</div>`}
    </div>
    <button type="button" class="dr-exit-btn" id="dr-exit-btn" ${sandbox ? "hidden" : ""}>Exit Danger Room</button>
  `;
}

function ensureShell(presetName) {
  if (!rootEl) return;
  const presetId = getDangerRoomState().presetId;
  if (lastPresetId === presetId && rootEl.querySelector("#dr-crosshair")) return;
  lastPresetId = presetId;
  rootEl.innerHTML = buildShell(presetName);
  rootEl.querySelector("#dr-exit-btn")?.addEventListener("click", () => {
    window.exitToDressingRoom?.();
  });
}

export function mountDangerRoomHud() {
  if (mounted) return;
  mounted = true;

  const sandbox = isCombatSandboxUi();
  document.body.classList.add("danger-room-active");
  if (sandbox) document.body.classList.add("combat-sandbox-active");
  const gameUI = document.getElementById("gameUI");
  if (gameUI) {
    gameUI.classList.add("danger-room-hud");
    if (sandbox) gameUI.classList.add("combat-sandbox-hud");
  }

  const hideInDanger = ["match-timer", "team-a-frames", "team-b-frames", "countdown-overlay"];
  if (!sandbox) hideInDanger.push("hud-weapons");
  for (const id of hideInDanger) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }
  const targetFrame = document.getElementById("target-frame");
  if (targetFrame) targetFrame.classList.add("dr-target-frame");
  const hints = document.querySelector(".fkey-hints");
  if (hints) hints.style.display = sandbox ? "flex" : "none";
  if (sandbox) {
    const bars = document.querySelector(".hud-bars");
    const toggles = document.querySelector(".panel-toggles");
    const bar = document.getElementById("abilityBar");
    if (bars) bars.style.display = "flex";
    if (toggles) toggles.style.display = "flex";
    if (bar) bar.style.display = "flex";
  }

  rootEl = document.createElement("div");
  rootEl.id = "danger-room-hud";
  rootEl.className = "dr-hud-root";
  document.body.appendChild(rootEl);

  const preset = ROOM_PRESETS[getDangerRoomState().presetId];
  ensureShell(preset?.name || "Training");

  unsub = subscribeDangerRoom(() => {
    const p = ROOM_PRESETS[getDangerRoomState().presetId];
    ensureShell(p?.name || "Training");
  });

  window.addEventListener("keydown", onPresetKey);
}

export function unmountDangerRoomHud() {
  if (!mounted) return;
  mounted = false;
  window.removeEventListener("keydown", onPresetKey);
  unsub?.();
  unsub = null;
  rootEl?.remove();
  rootEl = null;
  lastPresetId = null;
  document.body.classList.remove("danger-room-active", "combat-sandbox-active");
  const gameUI = document.getElementById("gameUI");
  gameUI?.classList.remove("danger-room-hud", "combat-sandbox-hud");
}

function onPresetKey(e) {
  if (e.code === "BracketLeft") {
    e.preventDefault();
    cycleRoomPreset(-1);
  } else if (e.code === "BracketRight") {
    e.preventDefault();
    cycleRoomPreset(1);
  }
}

/** Per-frame HUD refresh (motion, combo, hit marker, crosshair spread + soft-lock). */
export function updateDangerHud(opts = {}) {
  if (!rootEl) return;
  const motion = document.getElementById("dr-motion-label");
  const weapon = document.getElementById("dr-weapon-label");
  const crosshair = document.getElementById("dr-crosshair");
  const magnet = document.getElementById("dr-ch-magnet");
  const hit = document.getElementById("dr-ch-hit");
  const comboBadge = document.getElementById("dr-combo-badge");
  const comboN = document.getElementById("dr-combo-n");
  const rangeRing = document.getElementById("dr-ch-range");
  const softZone = document.getElementById("dr-softlock-zone");
  const targetPip = document.getElementById("dr-target-pip");

  if (opts.motion && motion) motion.textContent = opts.motion;
  if (opts.weapon && weapon) weapon.textContent = opts.weapon;
  if (opts.accent && rootEl) {
    rootEl.style.setProperty("--dr-accent", opts.accent);
  }
  if (opts.focusFilter) {
    const ff = document.getElementById("dr-focus-filter");
    if (ff) ff.textContent = `FOCUS: ${opts.focusFilter}`;
  }
  const kind = opts.focusKind;

  const spread = opts.spread ?? getCrosshairSpread();
  if (crosshair) {
    crosshair.style.setProperty("--ch-gap", `${spread}px`);
    const softLock = opts.softLock;
    const cx = window.innerWidth * 0.5;
    const cy = window.innerHeight * 0.5;
    if (softLock?.active && softLock.x != null && softLock.y != null) {
      const k = softLock.hardLock ? 0.72 : 0.38;
      crosshair.style.left = `${cx + (softLock.x - cx) * k}px`;
      crosshair.style.top = `${cy + (softLock.y - cy) * k}px`;
      crosshair.classList.toggle("dr-crosshair-softlock", true);
      crosshair.classList.toggle("dr-crosshair-hardlock", !!softLock.hardLock);
      crosshair.classList.toggle("dr-crosshair-cursor", false);
      crosshair.classList.toggle("dr-crosshair-aiming", !!softLock.aiming);
      crosshair.classList.toggle("focus-enemy", kind === "enemy");
      crosshair.classList.toggle("focus-neutral", kind === "neutral");
      crosshair.classList.toggle("focus-harvest", kind === "harvestable");
      if (magnet) magnet.style.opacity = String(0.25 + (softLock.magnet || 0) * 0.55);
    } else {
      crosshair.style.left = "50%";
      crosshair.style.top = "50%";
      crosshair.classList.toggle("dr-crosshair-softlock", false);
      crosshair.classList.toggle("dr-crosshair-hardlock", false);
      crosshair.classList.toggle("dr-crosshair-cursor", true);
      crosshair.classList.toggle("dr-crosshair-aiming", !!softLock?.aiming);
      crosshair.classList.remove("focus-enemy", "focus-neutral", "focus-harvest");
      if (magnet) magnet.style.opacity = "0";
    }
    crosshair.style.transform = "translate(-50%, -50%)";
  }

  const combo = opts.combo ?? getComboStage();
  if (comboBadge && comboN) {
    if (combo > 1) {
      comboBadge.hidden = false;
      comboN.textContent = String(combo);
    } else {
      comboBadge.hidden = true;
    }
  }

  const hitId = opts.hitMarker ?? getHitMarkerId();
  if (hit) {
    if (hitId && hit.dataset.token !== String(hitId)) {
      hit.dataset.token = String(hitId);
      hit.hidden = false;
      hit.classList.remove("dr-ch-hit-pop");
      void hit.offsetWidth;
      hit.classList.add("dr-ch-hit-pop");
      setTimeout(() => { hit.hidden = true; }, 320);
    }
  }

  if (rangeRing && opts.rangeState) {
    rangeRing.className = `dr-ch-range dr-ch-range-${opts.rangeState}`;
  }

  const sl = opts.softLock;
  if (softZone && sl?.active && sl.zoneW > 0) {
    softZone.hidden = false;
    softZone.style.left = `${sl.zoneX}px`;
    softZone.style.top = `${sl.zoneY}px`;
    softZone.style.width = `${sl.zoneW}px`;
    softZone.style.height = `${sl.zoneH}px`;
    softZone.classList.toggle("dr-softlock-hard", !!sl.hardLock);
    softZone.classList.toggle("focus-enemy", kind === "enemy");
    softZone.classList.toggle("focus-neutral", kind === "neutral");
    softZone.classList.toggle("focus-harvest", kind === "harvestable");
  } else if (softZone) {
    softZone.hidden = true;
  }

  if (targetPip && sl?.active && sl.targetX != null) {
    targetPip.hidden = false;
    targetPip.style.left = `${sl.targetX}px`;
    targetPip.style.top = `${sl.targetY}px`;
    targetPip.classList.toggle("focus-enemy", kind === "enemy");
    targetPip.classList.toggle("focus-neutral", kind === "neutral");
    targetPip.classList.toggle("focus-harvest", kind === "harvestable");
  } else if (targetPip) {
    targetPip.hidden = true;
  }
}

export function setDangerMotionLabel(label) {
  updateDangerHud({ motion: label });
}

export function setDangerWeaponLabel(label) {
  updateDangerHud({ weapon: label });
}

/** Sync ability bar flash from combat feedback (arena + danger room). */
export function syncAbilityBarFlash() {
  const key = getLastAbilityKey();
  if (!key || !isAbilityFlashing()) return;
  const bar = document.getElementById("abilityBar");
  if (!bar) return;
  bar.querySelectorAll(".ability-slot").forEach((slot) => {
    slot.classList.toggle("ability-used", slot.dataset.key === key);
  });
}