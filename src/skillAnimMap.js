/**
 * Skill → animation mapping overrides (studio edits → runtime).
 * Merges WeaponDefinitions defaults with localStorage + optional JSON manifest.
 */

import { modelUrl } from "./assetConfig.js";
import { WeaponDefinitions } from "./engine/WeaponDefinitions.js";

const LS_KEY = "grudge-arena-skill-anim-map-v1";
let _manifestPromise = null;

function loadLocalOverrides() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function loadSkillAnimManifest() {
  if (_manifestPromise) return _manifestPromise;
  _manifestPromise = fetch(modelUrl("skillAnimMap.json"))
    .then((r) => (r.ok ? r.json() : { weapons: {} }))
    .catch(() => ({ weapons: {} }));
  return _manifestPromise;
}

/** Default skillAnim from WeaponDefinitions for one weapon. */
export function defaultSkillAnims(weaponType) {
  const def = WeaponDefinitions[weaponType];
  if (!def?.abilities) return {};
  const out = {};
  for (const [slot, ab] of Object.entries(def.abilities)) {
    if (ab.skillAnim) out[slot] = ab.skillAnim;
  }
  if (def.attackAnims?.length) out._attackCycle = def.attackAnims.join(",");
  return out;
}

/** Merged map: code defaults ← manifest ← localStorage. */
export async function getSkillAnimMap(weaponType) {
  const manifest = await loadSkillAnimManifest();
  const base = defaultSkillAnims(weaponType);
  const file = manifest.weapons?.[weaponType] || {};
  const local = loadLocalOverrides()[weaponType] || {};
  return { ...base, ...file, ...local };
}

export function resolveSkillAnim(weaponType, slot, fallback = "attack1") {
  const local = loadLocalOverrides()[weaponType] || {};
  if (local[slot]) return local[slot];
  const def = WeaponDefinitions[weaponType];
  const fromDef = def?.abilities?.[slot]?.skillAnim;
  if (fromDef) return fromDef;
  return fallback;
}

export async function resolveSkillAnimAsync(weaponType, slot, fallback = "attack1") {
  const map = await getSkillAnimMap(weaponType);
  return map[slot] || fallback;
}

export function setSkillAnimOverride(weaponType, slot, clipKey) {
  const all = loadLocalOverrides();
  if (!all[weaponType]) all[weaponType] = {};
  all[weaponType][slot] = clipKey;
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

export function exportSkillAnimMapJson() {
  const weapons = {};
  for (const weaponType of Object.keys(WeaponDefinitions)) {
    weapons[weaponType] = {
      ...defaultSkillAnims(weaponType),
      ...(loadLocalOverrides()[weaponType] || {}),
    };
  }
  return { version: 1, generated: new Date().toISOString(), weapons };
}

export function downloadSkillAnimMap() {
  const blob = new Blob([JSON.stringify(exportSkillAnimMapJson(), null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "skillAnimMap.json";
  a.click();
  URL.revokeObjectURL(a.href);
}