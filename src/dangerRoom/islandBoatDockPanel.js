/**
 * Boat dock interaction panel — sail color + boat size (B key at dock).
 */

import {
  getPirateIslandState,
  setPlayerBoatSize,
  setPlayerSailColor,
  PLAYER_BOAT_SIZES,
} from "./pirateIslandStore.js";
import { isNearBoatDock } from "./IslandBoatDock.js";

let rootEl = null;
let open = false;

function render() {
  if (!rootEl) return;
  const st = getPirateIslandState();
  rootEl.innerHTML = `
    <div class="dr-boat-panel">
      <div class="dr-boat-header">
        <strong>Boat Dock</strong>
        <button type="button" class="dr-boat-close" id="dr-boat-close">×</button>
      </div>
      <p class="dr-boat-blurb">Player ships — white sails, your crew colors.</p>
      <div class="dr-boat-sizes">
        ${PLAYER_BOAT_SIZES.map(
          (s) =>
            `<button type="button" class="dr-boat-size ${st.boatSize === s ? "active" : ""}" data-boat-size="${s}">${s.replace("ship-", "")}</button>`,
        ).join("")}
      </div>
      <label class="dr-boat-row">Sail color
        <input type="color" id="dr-sail-color" value="${st.sailColor}"/>
      </label>
      <p class="dr-boat-hint">Enemy fleet uses pirate sails (red/black).</p>
    </div>`;

  rootEl.querySelector("#dr-boat-close")?.addEventListener("click", () => setBoatDockOpen(false));
  rootEl.querySelectorAll("[data-boat-size]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setPlayerBoatSize(btn.dataset.boatSize);
      render();
    });
  });
  rootEl.querySelector("#dr-sail-color")?.addEventListener("input", (e) => {
    setPlayerSailColor(e.target.value);
  });
}

export function setBoatDockOpen(next) {
  open = next;
  if (rootEl) {
    rootEl.classList.toggle("dr-boat-open", open);
    if (open) render();
  }
}

export function toggleBoatDockPanel() {
  setBoatDockOpen(!open);
}

export function mountBoatDockPanel() {
  if (rootEl) return;
  rootEl = document.createElement("div");
  rootEl.id = "dr-boat-dock-panel";
  rootEl.className = "dr-boat-root";
  document.body.appendChild(rootEl);
  window.addEventListener("keydown", onBoatDockKey);
}

export function unmountBoatDockPanel() {
  window.removeEventListener("keydown", onBoatDockKey);
  rootEl?.remove();
  rootEl = null;
  open = false;
}

function onBoatDockKey(e) {
  if (e.code !== "KeyB" || e.repeat) return;
  const arena = window.__grudgeArena;
  const pos = arena?.playerUnit?.mesh?.position;
  if (!isNearBoatDock(pos)) return;
  e.preventDefault();
  toggleBoatDockPanel();
}

/** Proximity hint + auto-close when player leaves dock. */
export function tickBoatDockPanel(arena) {
  const pos = arena?.playerUnit?.mesh?.position;
  const near = isNearBoatDock(pos);
  const hint = document.getElementById("dr-boat-dock-hint");
  if (hint) hint.hidden = !near;
  if (!near && open) setBoatDockOpen(false);
}