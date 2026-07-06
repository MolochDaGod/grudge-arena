/**
 * Unified focus targets for combat sandbox — enemies (red), neutrals (yellow),
 * harvestables (green). Drives soft lock, hard lock, and Tab cycling.
 */

import * as THREE from "three";

/** @typedef {'enemy'|'neutral'|'harvestable'} FocusKind */

export const FOCUS_COLORS = {
  enemy: 0xff4444,
  neutral: 0xffcc33,
  harvestable: 0x44dd66,
};

export const FOCUS_CSS = {
  enemy: "#ff4444",
  neutral: "#ffcc33",
  harvestable: "#44dd66",
};

/** @typedef {'all'|'enemy'|'neutral'|'harvestable'} FocusFilterMode */

export const focusFilter = {
  mode: "all",
};

const FILTER_CYCLE = ["all", "enemy", "neutral", "harvestable"];

/** @type {Map<string, { id: string, kind: FocusKind, label: string, getWorld: () => THREE.Vector3, alive: () => boolean, mesh?: THREE.Object3D, unit?: object }>} */
const targets = new Map();

export let lockedFocusId = null;
export let lockedFocusKind = null;

const _pos = new THREE.Vector3();

export function toggleFocusFilter() {
  const idx = FILTER_CYCLE.indexOf(focusFilter.mode);
  focusFilter.mode = FILTER_CYCLE[(idx + 1) % FILTER_CYCLE.length];
  return focusFilter.mode;
}

export function getFocusFilterLabel() {
  const labels = {
    all: "ALL",
    enemy: "ENEMY",
    neutral: "NEUTRAL",
    harvestable: "HARVEST",
  };
  return labels[focusFilter.mode] ?? "ALL";
}

export function registerFocusTarget(spec) {
  targets.set(spec.id, spec);
}

export function unregisterFocusTarget(id) {
  targets.delete(id);
  if (lockedFocusId === id) {
    lockedFocusId = null;
    lockedFocusKind = null;
  }
}

export function clearFocusTargets() {
  targets.clear();
  lockedFocusId = null;
  lockedFocusKind = null;
}

function passesFilter(kind) {
  if (focusFilter.mode === "all") return true;
  return kind === focusFilter.mode;
}

export function listFocusCandidates() {
  const out = [];
  for (const t of targets.values()) {
    if (!t.alive()) continue;
    if (!passesFilter(t.kind)) continue;
    out.push(t);
  }
  return out;
}

export function getLockedFocusTarget() {
  if (!lockedFocusId) return null;
  const t = targets.get(lockedFocusId);
  if (!t || !t.alive()) {
    lockedFocusId = null;
    lockedFocusKind = null;
    return null;
  }
  return t;
}

export function lockFocusTarget(id) {
  const t = targets.get(id);
  if (!t || !t.alive()) return false;
  lockedFocusId = id;
  lockedFocusKind = t.kind;
  return true;
}

export function clearFocusLock() {
  lockedFocusId = null;
  lockedFocusKind = null;
}

export function aimWorldForTarget(t) {
  const p = t.getWorld(_pos);
  const lift = t.kind === "harvestable" ? 1.4 : 1.25;
  return _pos.set(p.x, p.y + lift, p.z);
}

/** Register combat units into focus registry. */
export function syncUnitsToFocusRegistry(units = []) {
  for (const u of units) {
    if (u.isPlayer) continue;
    const id = u.entity?.id ?? u.mesh?.uuid;
    if (!id) continue;
    const kind = u.team === "B" ? "enemy" : u.team === "N" ? "neutral" : null;
    if (!kind) continue;
    const info = u.entity?.getComponent?.("TargetInfo");
    registerFocusTarget({
      id,
      kind,
      label: info?.displayName || (kind === "enemy" ? "Enemy" : "Neutral"),
      mesh: u.mesh,
      unit: u,
      getWorld: (out) => out.copy(u.mesh.position),
      alive: () => !u.entity?.hasTag?.("dead"),
    });
  }
}