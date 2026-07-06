/**
 * Danger Room + arena combat HUD — crosshair, motion MM readout, combo, hit marker.
 */

import {
  getDangerRoomState,
  subscribeDangerRoom,
  cycleRoomPreset,
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
  return `
    <div class="dr-mode-badge">⚡ Danger Room · ${presetName}</div>
    <div class="dr-aim-layer" aria-hidden="true">
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
      <span class="dr-combo-badge" id="dr-combo-badge" hidden>Hit <span id="dr-combo-n">1</span></span>
    </div>
    <div class="dr-controls-hint">
      <div><kbd>W/S</kbd> Move <kbd>A/D</kbd> Turn <kbd>Q/E</kbd> Strafe</div>
      <div><kbd>RMB</kbd> Attack <kbd>1-4</kbd> Skills <kbd>Ctrl</kbd> Roll <kbd>V</kbd> Block</div>
      <div><kbd>G</kbd> Gear · <kbd>[</kbd><kbd>]</kbd> Room · <kbd>Tab</kbd> Target</div>
    </div>
    <button type="button" class="dr-exit-btn" id="dr-exit-btn">Exit Danger Room</button>
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

  document.body.classList.add("danger-room-active");
  const gameUI = document.getElementById("gameUI");
  if (gameUI) gameUI.classList.add("danger-room-hud");

  for (const id of ["match-timer", "team-a-frames", "team-b-frames", "countdown-overlay"]) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }
  const hints = document.querySelector(".fkey-hints");
  if (hints) hints.style.display = "none";

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
  document.body.classList.remove("danger-room-active");
  document.getElementById("gameUI")?.classList.remove("danger-room-hud");
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

  if (opts.motion && motion) motion.textContent = opts.motion;
  if (opts.weapon && weapon) weapon.textContent = opts.weapon;
  if (opts.accent && rootEl) {
    rootEl.style.setProperty("--dr-accent", opts.accent);
  }

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
      if (magnet) magnet.style.opacity = String(0.25 + (softLock.magnet || 0) * 0.55);
    } else {
      crosshair.style.left = "50%";
      crosshair.style.top = "50%";
      crosshair.classList.toggle("dr-crosshair-softlock", false);
      crosshair.classList.toggle("dr-crosshair-hardlock", false);
      crosshair.classList.toggle("dr-crosshair-cursor", true);
      crosshair.classList.toggle("dr-crosshair-aiming", !!softLock?.aiming);
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