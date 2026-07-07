/**
 * Animation studio sidebar — skills, weapon scale, skill→anim mapping, full bank browse.
 */

import { WeaponDefinitions } from "../engine/WeaponDefinitions.js";
import {
  getSkillAnimMap,
  setSkillAnimOverride,
  downloadSkillAnimMap,
} from "../skillAnimMap.js";
import {
  getWeaponAttachConfig,
  setWeaponAttachOverride,
  exportWeaponAttachJson,
} from "../weaponAttachConfig.js";
import { modelUrl } from "../assetConfig.js";

const SKILL_SLOTS = ["Q", "E", "R", "F", "P"];

let bankCatalog = [];
let bankLoaded = false;

export async function loadAnimBankCatalog() {
  if (bankLoaded) return bankCatalog;
  try {
    const res = await fetch(modelUrl("animBankCatalog.json"));
    if (res.ok) {
      const data = await res.json();
      bankCatalog = data.clips || [];
    }
  } catch {
    bankCatalog = [];
  }
  bankLoaded = true;
  return bankCatalog;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   getWeapon: () => string,
 *   getClipNames: () => string[],
 *   onPlayClip: (key: string) => void,
 *   onWeaponTuningChange: () => void,
 *   onSkillAnimChange: (slot: string, clip: string) => void,
 * }} hooks
 */
export function mountAnimStudio(container, hooks) {
  container.innerHTML = "";

  const title = el("h3", "studio-title", "Combat Studio");
  container.appendChild(title);

  // ── Clip source mode ──
  const modeRow = el("div", "studio-row");
  modeRow.appendChild(el("span", "studio-label", "Clips"));
  const modeSel = el("select");
  modeSel.innerHTML = `
    <option value="pack">Weapon pack</option>
    <option value="bank">All baked bank</option>
  `;
  modeRow.appendChild(modeSel);
  container.appendChild(modeRow);

  const bankSel = el("select");
  bankSel.style.display = "none";
  bankSel.style.width = "100%";
  bankSel.style.marginTop = "6px";
  container.appendChild(bankSel);

  modeSel.addEventListener("change", async () => {
    const bank = modeSel.value === "bank";
    bankSel.style.display = bank ? "block" : "none";
    if (bank && !bankCatalog.length) {
      await loadAnimBankCatalog();
      bankSel.innerHTML = '<option value="">— pick baked clip —</option>';
      for (const rel of bankCatalog) {
        const o = el("option");
        o.value = rel;
        o.textContent = rel;
        bankSel.appendChild(o);
      }
    }
  });

  bankSel.addEventListener("change", () => {
    if (!bankSel.value) return;
    hooks.onPlayBankClip?.(bankSel.value);
  });

  // ── Weapon scale / carry ──
  const tuneTitle = el("h4", "studio-sub", "Weapon carry");
  container.appendChild(tuneTitle);

  const scaleRow = el("div", "studio-row");
  scaleRow.appendChild(el("span", "studio-label", "Scale"));
  const scaleInput = el("input");
  scaleInput.type = "range";
  scaleInput.min = "0.7";
  scaleInput.max = "1.4";
  scaleInput.step = "0.01";
  scaleInput.style.flex = "1";
  const scaleVal = el("span", "studio-val", "1.00");
  scaleRow.append(scaleInput, scaleVal);
  container.appendChild(scaleRow);

  for (const [label, key, min, max] of [
    ["Fwd", "z", -0.15, 0.05],
    ["Up", "y", -0.05, 0.1],
    ["Roll", "rz", -0.3, 0.3],
  ]) {
    const row = el("div", "studio-row");
    row.appendChild(el("span", "studio-label", label));
    const inp = el("input");
    inp.type = "range";
    inp.min = String(min);
    inp.max = String(max);
    inp.step = "0.01";
    inp.dataset.axis = key;
    inp.style.flex = "1";
    const val = el("span", "studio-val", "0");
    row.append(inp, val);
    container.appendChild(row);
  }

  function refreshTuningUI() {
    const w = hooks.getWeapon();
    const cfg = getWeaponAttachConfig(w);
    scaleInput.value = String(cfg.scale ?? 1);
    scaleVal.textContent = (cfg.scale ?? 1).toFixed(2);
    const pos = cfg.position || [0, 0, 0];
    const rot = cfg.rotation || [0, 0, 0];
    for (const inp of container.querySelectorAll("input[data-axis]")) {
      const ax = inp.dataset.axis;
      let v = 0;
      if (ax === "z") v = pos[2];
      else if (ax === "y") v = pos[1];
      else if (ax === "rz") v = rot[2];
      inp.value = String(v);
      inp.nextElementSibling.textContent = v.toFixed(2);
    }
  }

  function pushTuning() {
    const w = hooks.getWeapon();
    const z = Number(container.querySelector('input[data-axis="z"]').value);
    const y = Number(container.querySelector('input[data-axis="y"]').value);
    const rz = Number(container.querySelector('input[data-axis="rz"]').value);
    setWeaponAttachOverride(w, {
      scale: Number(scaleInput.value),
      position: [0, y, z],
      rotation: [0, 0, rz],
    });
    hooks.onWeaponTuningChange();
  }

  scaleInput.addEventListener("input", () => {
    scaleVal.textContent = Number(scaleInput.value).toFixed(2);
    pushTuning();
  });
  for (const inp of container.querySelectorAll("input[data-axis]")) {
    inp.addEventListener("input", () => {
      inp.nextElementSibling.textContent = Number(inp.value).toFixed(2);
      pushTuning();
    });
  }

  const exportWeaponBtn = el("button", null, "Export weapon tuning");
  exportWeaponBtn.type = "button";
  exportWeaponBtn.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(exportWeaponAttachJson(), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "weaponAttach.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  container.appendChild(exportWeaponBtn);

  // ── Skills panel ──
  const skillTitle = el("h4", "studio-sub", "Skills → animation");
  container.appendChild(skillTitle);
  const skillList = el("div", "skill-list");
  container.appendChild(skillList);

  async function refreshSkills() {
    const weapon = hooks.getWeapon();
    const def = WeaponDefinitions[weapon];
    const map = await getSkillAnimMap(weapon);
    const clips = hooks.getClipNames();
    skillList.innerHTML = "";

    if (!def) {
      skillList.appendChild(el("p", "studio-meta", "No WeaponDefinitions entry"));
      return;
    }

    for (const slot of SKILL_SLOTS) {
      const ab = def.abilities?.[slot];
      if (!ab) continue;
      const row = el("div", "skill-row");
      row.appendChild(el("span", "skill-slot", slot));
      const name = el("span", "skill-name", ab.name);
      row.appendChild(name);

      const sel = el("select");
      sel.innerHTML = '<option value="">—</option>';
      const current = map[slot] || ab.skillAnim || "";
      for (const c of clips) {
        const o = el("option");
        o.value = c;
        o.textContent = c;
        if (c === current) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener("change", () => {
        setSkillAnimOverride(weapon, slot, sel.value);
        hooks.onSkillAnimChange(slot, sel.value);
      });
      row.appendChild(sel);

      const playBtn = el("button", "skill-play", "▶");
      playBtn.type = "button";
      playBtn.title = `Preview ${ab.name}`;
      playBtn.addEventListener("click", () => {
        const key = sel.value || ab.skillAnim;
        if (key) hooks.onPlayClip(key);
      });
      row.appendChild(playBtn);
      skillList.appendChild(row);
    }

    if (def.attackAnims?.length) {
      const row = el("div", "skill-row");
      row.appendChild(el("span", "skill-slot", "AA"));
      row.appendChild(el("span", "skill-name", "Auto-attack cycle"));
      row.appendChild(el("span", "studio-meta", def.attackAnims.join(" → ")));
      skillList.appendChild(row);
    }
  }

  const exportSkillBtn = el("button", null, "Export skillAnimMap.json");
  exportSkillBtn.type = "button";
  exportSkillBtn.addEventListener("click", () => downloadSkillAnimMap());
  container.appendChild(exportSkillBtn);

  return {
    refresh() {
      refreshTuningUI();
      return refreshSkills();
    },
    getClipMode: () => modeSel.value,
  };
}