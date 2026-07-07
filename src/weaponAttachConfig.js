/**
 * Per-weapon carry tuning — nudge visible weapon meshes away from torso clipping.
 * Values are local offsets on active weapon/shield skinned meshes (D1 modular GLBs).
 */

import { getAttachTuningFromManifest, loadArenaPrefabManifest } from "./arenaPrefab.js";

const LS_KEY = "grudge-arena-weapon-attach-v1";
let _manifestAttach = null;

/** @type {Record<string, { scale?: number, position?: [number,number,number], rotation?: [number,number,number], hand?: 'R'|'L' }>} */
export const WEAPON_ATTACH_DEFAULTS = {
  greatsword: { scale: 1, position: [0, 0, -0.06], rotation: [0, 0, 0.08], hand: "R" },
  scythe: { scale: 1.02, position: [0, 0.02, -0.08], rotation: [0, 0, 0.12], hand: "R" },
  sabres: { scale: 0.98, position: [0, 0, -0.04], rotation: [0, 0, 0.05], hand: "R" },
  runeblade: { scale: 1, position: [0, 0, -0.05], rotation: [0, 0, 0.06], hand: "R" },
  mace: { scale: 1.05, position: [0, 0.03, -0.05], rotation: [0, 0, 0.1], hand: "R" },
  bow: { scale: 1, position: [0, 0, -0.03], rotation: [0, 0.15, 0], hand: "L" },
  staff: { scale: 1, position: [0, 0.04, -0.06], rotation: [0.1, 0, 0], hand: "L" },
  wand: { scale: 0.95, position: [0, 0.02, -0.04], rotation: [0.08, 0, 0], hand: "L" },
  rifle: { scale: 1, position: [0, 0, -0.05], rotation: [0, 0, 0.05], hand: "R" },
  unarmed: { scale: 1 },
};

const WEAPON_SLOT_PATTERNS = {
  R: /weapon_(sword|axe|hammer|spear|dagger|mace)/i,
  L: /weapon_(bow|staff)/i,
};

const SHIELD_PATTERN = /shield_/i;

function loadOverrides() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function ensureManifestAttach() {
  if (_manifestAttach) return _manifestAttach;
  const m = await loadArenaPrefabManifest();
  _manifestAttach = m;
  return m;
}

export function getWeaponAttachConfig(weaponType) {
  const manifestTuning = _manifestAttach
    ? getAttachTuningFromManifest(_manifestAttach, weaponType)
    : null;
  const base =
    manifestTuning ||
    WEAPON_ATTACH_DEFAULTS[weaponType] ||
    WEAPON_ATTACH_DEFAULTS.greatsword;
  const over = loadOverrides()[weaponType] || {};
  return {
    scale: over.scale ?? base.scale ?? 1,
    position: over.position ?? base.position ?? [0, 0, 0],
    rotation: over.rotation ?? base.rotation ?? [0, 0, 0],
    hand: over.hand ?? base.hand ?? "R",
  };
}

/** Preload manifest attach tuning (call once at boot). */
export async function preloadWeaponAttachManifest() {
  await ensureManifestAttach();
}

export function setWeaponAttachOverride(weaponType, patch) {
  const all = loadOverrides();
  all[weaponType] = { ...(all[weaponType] || {}), ...patch };
  localStorage.setItem(LS_KEY, JSON.stringify(all));
}

export function exportWeaponAttachJson() {
  const merged = {};
  for (const [k, v] of Object.entries(WEAPON_ATTACH_DEFAULTS)) {
    merged[k] = { ...v, ...(loadOverrides()[k] || {}) };
  }
  return { version: 1, weapons: merged };
}

function matchesActiveWeapon(node, hand) {
  const n = node.name || "";
  if (!node.visible) return false;
  if (hand === "L") return WEAPON_SLOT_PATTERNS.L.test(n);
  return WEAPON_SLOT_PATTERNS.R.test(n);
}

function matchesShield(node) {
  return node.visible && SHIELD_PATTERN.test(node.name || "");
}

/**
 * Apply carry offsets to visible D1 weapon/shield meshes after equipment loadout.
 * @param {THREE.Object3D} scene
 * @param {string} weaponType
 */
export function applyWeaponCarryTuning(scene, weaponType) {
  const cfg = getWeaponAttachConfig(weaponType);
  const pos = cfg.position || [0, 0, 0];
  const rot = cfg.rotation || [0, 0, 0];
  const scale = cfg.scale ?? 1;

  scene.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;
    const isWeapon = matchesActiveWeapon(node, cfg.hand);
    const isShield = weaponType === "sabres" && matchesShield(node);
    if (!isWeapon && !isShield) return;

    node.position.set(pos[0], pos[1], pos[2]);
    node.rotation.set(rot[0], rot[1], rot[2]);
    node.scale.setScalar(scale);
  });
}