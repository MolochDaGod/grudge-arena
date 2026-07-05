/**
 * Danger Room HUD overlay — crosshair, preset badge, control hints.
 * Mirrors dangerroom.puter.site / grudge-builder DangerRoomHud chrome.
 */

import {
  getDangerRoomState,
  subscribeDangerRoom,
  cycleRoomPreset,
} from "./dangerRoomStore.js";
import { ROOM_PRESETS } from "./roomPresets.js";

let mounted = false;
let rootEl = null;
let unsub = null;

function render(state) {
  if (!rootEl) return;
  const preset = ROOM_PRESETS[state.presetId];
  rootEl.innerHTML = `
    <div class="dr-mode-badge">⚡ Danger Room · ${preset?.name || "Training"}</div>
    <div class="dr-crosshair" aria-hidden="true">
      <span class="dr-ch-dot"></span>
      <span class="dr-ch-line dr-ch-top"></span>
      <span class="dr-ch-line dr-ch-bottom"></span>
      <span class="dr-ch-line dr-ch-left"></span>
      <span class="dr-ch-line dr-ch-right"></span>
    </div>
    <div class="dr-mm-panel">
      <span>MM</span>
      <span class="dr-mm-value" id="dr-motion-label">IDLE</span>
      <span>·</span>
      <span id="dr-weapon-label">Weapon</span>
    </div>
    <div class="dr-controls-hint">
      <div><kbd>W/S</kbd> Move <kbd>A/D</kbd> Turn <kbd>Q/E</kbd> Strafe</div>
      <div><kbd>RMB</kbd> Attack <kbd>LMB</kbd> Camera <kbd>Scroll</kbd> Zoom</div>
      <div><kbd>1-4</kbd> Skills <kbd>Ctrl</kbd> Roll <kbd>V</kbd> Block <kbd>Tab</kbd> Target</div>
      <div><kbd>[</kbd><kbd>]</kbd> Room preset · <kbd>Esc</kbd> Exit training</div>
    </div>
    <button type="button" class="dr-exit-btn" id="dr-exit-btn">Exit Danger Room</button>
  `;

  const exitBtn = rootEl.querySelector("#dr-exit-btn");
  exitBtn?.addEventListener("click", () => {
    window.location.reload();
  });
}

export function mountDangerRoomHud() {
  if (mounted) return;
  mounted = true;

  document.body.classList.add("danger-room-active");
  const gameUI = document.getElementById("gameUI");
  if (gameUI) gameUI.classList.add("danger-room-hud");

  // Hide PvP-only chrome
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

  render(getDangerRoomState());
  unsub = subscribeDangerRoom(() => render(getDangerRoomState()));

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

/** Update motion readout (called from game loop). */
export function setDangerMotionLabel(label) {
  const el = document.getElementById("dr-motion-label");
  if (el) el.textContent = label;
}

export function setDangerWeaponLabel(label) {
  const el = document.getElementById("dr-weapon-label");
  if (el) el.textContent = label;
}