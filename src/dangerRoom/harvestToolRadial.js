/**
 * Hold-R harvest tool radial — axe / pickaxe / hammer.
 */

import { HARVEST_TOOLS } from "./HarvestDefinitions.js";

let open = false;
let holdTimer = null;
let onSelect = null;
let rootEl = null;

function ensureDom() {
  if (rootEl) return rootEl;
  rootEl = document.createElement("div");
  rootEl.id = "dr-harvest-radial";
  rootEl.className = "dr-radial-root dr-harvest-radial";
  rootEl.hidden = true;
  document.body.appendChild(rootEl);
  return rootEl;
}

function buildRadial() {
  const el = ensureDom();
  const items = HARVEST_TOOLS;
  const spread = 200;
  const start = -90;
  const step = spread / Math.max(1, items.length - 1);
  el.innerHTML = `
    <div class="dr-radial-backdrop"></div>
    <div class="dr-radial-center">
      <span class="dr-radial-title">Harvest Tools</span>
      <span class="dr-radial-sub">Release R to equip</span>
    </div>
    ${items.map((item, i) => {
      const ang = ((start + step * i) * Math.PI) / 180;
      const x = Math.cos(ang) * 118;
      const y = Math.sin(ang) * 118;
      return `<button type="button" class="dr-radial-item dr-harvest-tool" data-tool="${item.id}" style="transform: translate(${x}px, ${y}px)">${item.label}</button>`;
    }).join("")}
  `;
  el.querySelectorAll(".dr-harvest-tool").forEach((btn) => {
    btn.addEventListener("mouseenter", () => { el.dataset.hover = btn.dataset.tool; });
    btn.addEventListener("click", () => selectTool(btn.dataset.tool));
  });
  return el;
}

function selectTool(id) {
  if (id && onSelect) onSelect(id);
  closeHarvestRadial();
}

export function openHarvestRadial(selectCb) {
  onSelect = selectCb;
  open = true;
  const el = buildRadial();
  el.hidden = false;
  el.classList.add("dr-radial-open");
}

export function closeHarvestRadial() {
  open = false;
  if (rootEl) {
    rootEl.hidden = true;
    rootEl.classList.remove("dr-radial-open");
  }
  onSelect = null;
}

export function isHarvestRadialOpen() {
  return open;
}

let _onKeyDown = null;
let _onKeyUp = null;

export function setupHarvestRadialInput(selectCb) {
  teardownHarvestRadialInput();
  _onKeyDown = (e) => {
    if (e.code !== "KeyR" || e.repeat) return;
    if (e.target?.matches?.("input, textarea, select")) return;
    holdTimer = setTimeout(() => openHarvestRadial(selectCb), 160);
  };
  _onKeyUp = (e) => {
    if (e.code !== "KeyR") return;
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (open) {
      const hover = rootEl?.dataset?.hover;
      if (hover) selectTool(hover);
      else closeHarvestRadial();
    }
  };
  window.addEventListener("keydown", _onKeyDown);
  window.addEventListener("keyup", _onKeyUp);
}

export function teardownHarvestRadialInput() {
  closeHarvestRadial();
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = null;
  if (_onKeyDown) window.removeEventListener("keydown", _onKeyDown);
  if (_onKeyUp) window.removeEventListener("keyup", _onKeyUp);
  _onKeyDown = null;
  _onKeyUp = null;
}