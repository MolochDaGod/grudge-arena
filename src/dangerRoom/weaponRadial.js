/**
 * Hold-F weapon radial — ported from arpg-game weaponRadial.ts.
 */

import { ARENA_WEAPONS } from "../d1LoadoutStore.js";
import { WeaponDefinitions } from "../engine/WeaponDefinitions.js";

let open = false;
let holdTimer = null;
let onSelect = null;

const FIREARMS = new Set(["bow", "rifle"]);
const RADIAL_WEAPONS = ARENA_WEAPONS.filter((w) => FIREARMS.has(w) || WeaponDefinitions[w]);

let rootEl = null;

function ensureDom() {
  if (rootEl) return rootEl;
  rootEl = document.createElement("div");
  rootEl.id = "dr-weapon-radial";
  rootEl.className = "dr-radial-root";
  rootEl.hidden = true;
  document.body.appendChild(rootEl);
  return rootEl;
}

function buildRadial() {
  const el = ensureDom();
  const items = RADIAL_WEAPONS.map((id) => {
    const def = WeaponDefinitions[id];
    return { id, label: def?.name || id };
  });
  const spread = items.length <= 4 ? 220 : 280;
  const start = -90;
  const step = spread / Math.max(1, items.length - 1);
  el.innerHTML = `
    <div class="dr-radial-backdrop"></div>
    <div class="dr-radial-center">
      <span class="dr-radial-title">Weapons</span>
      <span class="dr-radial-sub">Release F to equip</span>
    </div>
    ${items.map((item, i) => {
      const ang = ((start + step * i) * Math.PI) / 180;
      const x = Math.cos(ang) * 118;
      const y = Math.sin(ang) * 118;
      return `<button type="button" class="dr-radial-item" data-weapon="${item.id}" style="transform: translate(${x}px, ${y}px)">${item.label}</button>`;
    }).join("")}
  `;
  el.querySelectorAll(".dr-radial-item").forEach((btn) => {
    btn.addEventListener("mouseenter", () => el.dataset.hover = btn.dataset.weapon);
    btn.addEventListener("click", () => selectWeapon(btn.dataset.weapon));
  });
  return el;
}

function selectWeapon(id) {
  if (id && onSelect) onSelect(id);
  closeWeaponRadial();
}

export function openWeaponRadial(selectCb) {
  onSelect = selectCb;
  open = true;
  const el = buildRadial();
  el.hidden = false;
  el.classList.add("dr-radial-open");
}

export function closeWeaponRadial() {
  open = false;
  if (rootEl) {
    rootEl.hidden = true;
    rootEl.classList.remove("dr-radial-open");
  }
  onSelect = null;
}

export function isWeaponRadialOpen() {
  return open;
}

export function setupWeaponRadialInput(selectCb) {
  window.addEventListener("keydown", (e) => {
    if (e.code !== "KeyF" || e.repeat) return;
    holdTimer = setTimeout(() => openWeaponRadial(selectCb), 180);
  });
  window.addEventListener("keyup", (e) => {
    if (e.code !== "KeyF") return;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (open) {
      const hover = rootEl?.dataset?.hover;
      if (hover) selectWeapon(hover);
      else closeWeaponRadial();
    }
  });
}

export function teardownWeaponRadialInput() {
  closeWeaponRadial();
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = null;
}