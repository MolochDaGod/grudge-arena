/**
 * Danger Room HUD dock (M key) — Danger / Tune / Loadout tabs (HudShell parity).
 */

import {
  getDangerRoomState,
  subscribeDangerRoom,
  setRoomPreset,
  setMusicEnabled,
  setMusicVolume,
  setAnimOverdrive,
  setAdsShoulder,
  setCrosshairBase,
} from "./dangerRoomStore.js";
import { ROOM_PRESET_LIST } from "./roomPresets.js";
import { ARENA_WEAPONS } from "../d1LoadoutStore.js";

let mounted = false;
let rootEl = null;
let unsub = null;
let activeTab = "danger";
let onWeaponPick = null;

function render() {
  if (!rootEl) return;
  const st = getDangerRoomState();
  rootEl.innerHTML = `
    <div class="dr-dock-panel">
      <div class="dr-dock-header">
        <span>Danger Room</span>
        <button type="button" class="dr-dock-close" id="dr-dock-close">×</button>
      </div>
      <div class="dr-dock-tabs">
        <button type="button" class="dr-dock-tab ${activeTab === "danger" ? "active" : ""}" data-tab="danger">Danger</button>
        <button type="button" class="dr-dock-tab ${activeTab === "tune" ? "active" : ""}" data-tab="tune">Tune</button>
        <button type="button" class="dr-dock-tab ${activeTab === "loadout" ? "active" : ""}" data-tab="loadout">Loadout</button>
      </div>
      <div class="dr-dock-body">
        ${activeTab === "danger" ? dangerPanel(st) : ""}
        ${activeTab === "tune" ? tunePanel(st) : ""}
        ${activeTab === "loadout" ? loadoutPanel() : ""}
      </div>
    </div>
  `;

  rootEl.querySelector("#dr-dock-close")?.addEventListener("click", () => setDockOpen(false));
  rootEl.querySelectorAll(".dr-dock-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      render();
    });
  });
  rootEl.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => setRoomPreset(btn.dataset.preset));
  });
  rootEl.querySelector("#dr-music-toggle")?.addEventListener("change", (e) => {
    setMusicEnabled(e.target.checked);
  });
  rootEl.querySelector("#dr-music-vol")?.addEventListener("input", (e) => {
    setMusicVolume(Number(e.target.value) / 100);
  });
  rootEl.querySelectorAll("[data-weapon-pick]").forEach((btn) => {
    btn.addEventListener("click", () => onWeaponPick?.(btn.dataset.weaponPick));
  });
  rootEl.querySelector("#dr-anim-overdrive")?.addEventListener("input", (e) => {
    const mult = Number(e.target.value) / 100;
    setAnimOverdrive(mult);
    const val = rootEl.querySelector("#dr-anim-overdrive-val");
    if (val) val.textContent = `${mult.toFixed(1)}×`;
  });
  rootEl.querySelector("#dr-ads-shoulder")?.addEventListener("input", (e) => {
    setAdsShoulder(Number(e.target.value) / 100);
  });
  rootEl.querySelector("#dr-cross-spread")?.addEventListener("input", (e) => {
    setCrosshairBase(Number(e.target.value));
  });
}

function dangerPanel(st) {
  return `
    <p class="dr-dock-blurb">Training chamber presets and atmosphere.</p>
    <div class="dr-dock-presets">
      ${ROOM_PRESET_LIST.map((p) => `
        <button type="button" class="dr-dock-preset ${st.presetId === p.id ? "active" : ""}" data-preset="${p.id}">
          <strong>${p.name}</strong>
          <span>${p.blurb}</span>
        </button>
      `).join("")}
    </div>
    <label class="dr-dock-row"><input type="checkbox" id="dr-music-toggle" ${st.musicEnabled ? "checked" : ""}/> DJ music</label>
    <label class="dr-dock-row">Volume <input type="range" id="dr-music-vol" min="0" max="100" value="${Math.round((st.musicVolume ?? 0.65) * 100)}"/></label>
  `;
}

function tunePanel(st) {
  return `
    <p class="dr-dock-blurb">Camera + feel tuning (persisted locally).</p>
    <label class="dr-dock-row">Anim overdrive <input type="range" id="dr-anim-overdrive" min="50" max="300" value="${Math.round((st.animOverdrive ?? 1) * 100)}"/> <span id="dr-anim-overdrive-val">${(st.animOverdrive ?? 1).toFixed(1)}×</span></label>
    <label class="dr-dock-row">ADS shoulder <input type="range" id="dr-ads-shoulder" min="0" max="200" value="${Math.round((st.adsShoulder ?? 0.8) * 100)}"/></label>
    <label class="dr-dock-row">Crosshair spread <input type="range" id="dr-cross-spread" min="4" max="24" value="${st.crosshairBase ?? 10}"/></label>
    <p class="dr-dock-hint">Hold <kbd>F</kbd> for weapon radial · <kbd>G</kbd> for D1 gear</p>
  `;
}

function loadoutPanel() {
  return `
    <p class="dr-dock-blurb">Quick weapon swap (full D1 gear via G panel).</p>
    <div class="dr-dock-weapons">
      ${ARENA_WEAPONS.map((w) => `<button type="button" class="dr-dock-weapon" data-weapon-pick="${w}">${w}</button>`).join("")}
    </div>
  `;
}

let dockOpen = false;
const dockListeners = new Set();

export function subscribeDock(fn) {
  dockListeners.add(fn);
  return () => dockListeners.delete(fn);
}

export function isDockOpen() {
  return dockOpen;
}

export function setDockOpen(open) {
  dockOpen = open;
  if (rootEl) rootEl.classList.toggle("dr-dock-open", dockOpen);
  for (const fn of dockListeners) fn();
}

export function toggleDock() {
  setDockOpen(!dockOpen);
}

export function mountDangerRoomDock(opts = {}) {
  if (mounted) return;
  mounted = true;
  onWeaponPick = opts.onWeaponPick ?? null;
  rootEl = document.createElement("div");
  rootEl.id = "dr-hud-dock";
  rootEl.className = "dr-dock-root";
  document.body.appendChild(rootEl);
  render();
  unsub = subscribeDangerRoom(render);
  window.addEventListener("keydown", onDockKey);
}

export function unmountDangerRoomDock() {
  if (!mounted) return;
  mounted = false;
  window.removeEventListener("keydown", onDockKey);
  unsub?.();
  rootEl?.remove();
  rootEl = null;
}

function onDockKey(e) {
  if (e.code === "KeyM" && !e.repeat) {
    e.preventDefault();
    toggleDock();
    render();
  }
}