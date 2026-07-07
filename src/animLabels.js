/**
 * Human-readable names for baked animation clip keys + source paths.
 * Right-click rename in anim-test saves to localStorage; export merges into animLabels.json.
 */

import { modelUrl } from "./assetConfig.js";

const STORAGE_KEY = "grudge_anim_labels_v1";

let _catalog = null;
let _overrides = null;

function loadOverrides() {
  if (_overrides) return _overrides;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    _overrides = raw ? JSON.parse(raw) : {};
  } catch {
    _overrides = {};
  }
  return _overrides;
}

function saveOverrides(data) {
  _overrides = data;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function loadAnimLabelCatalog() {
  if (_catalog) return _catalog;
  try {
    const res = await fetch(modelUrl("animLabels.json"));
    _catalog = res.ok ? await res.json() : { version: 1, clips: {} };
  } catch {
    _catalog = { version: 1, clips: {} };
  }
  return _catalog;
}

/** Display label for a clip registry key. */
export function getAnimLabel(key, catalog, overrides) {
  const o = overrides?.[key];
  if (o?.label) return o.label;
  const c = catalog?.clips?.[key];
  if (c?.label) return c.label;
  return key;
}

/** Full entry for UI (label + baked source rel). */
export function getAnimEntry(key, catalog, overrides, clipSources) {
  const o = overrides?.[key] || {};
  const c = catalog?.clips?.[key] || {};
  return {
    key,
    label: o.label || c.label || key,
    source: clipSources?.get?.(key) || o.source || c.source || "",
    notes: o.notes || c.notes || "",
  };
}

export function setAnimLabel(key, { label, source, notes, race, weapon } = {}) {
  const data = { ...loadOverrides() };
  data[key] = {
    ...(data[key] || {}),
    ...(label !== undefined ? { label: String(label).trim() } : {}),
    ...(source !== undefined ? { source: String(source).trim() } : {}),
    ...(notes !== undefined ? { notes: String(notes).trim() } : {}),
    ...(race !== undefined ? { race: String(race).trim() } : {}),
    ...(weapon !== undefined ? { weapon: String(weapon).trim() } : {}),
    updated: new Date().toISOString(),
  };
  saveOverrides(data);
  return data[key];
}

export function getOverrides() {
  return loadOverrides();
}

/** Merge catalog + overrides for download / commit to animLabels.json */
export async function exportMergedLabels(clipSources) {
  const catalog = await loadAnimLabelCatalog();
  const overrides = loadOverrides();
  const clips = { ...(catalog.clips || {}) };

  for (const [key, o] of Object.entries(overrides)) {
    clips[key] = {
      ...(clips[key] || {}),
      ...o,
      source:
        o.source ||
        clips[key]?.source ||
        clipSources?.get?.(key) ||
        "",
    };
  }

  if (clipSources) {
    for (const [key, rel] of clipSources) {
      if (!clips[key]) clips[key] = { label: key, source: rel };
      else if (!clips[key].source) clips[key].source = rel;
    }
  }

  return {
    version: 1,
    description:
      "Human labels for baked clip keys. Edit label/notes; source is anim-bank path.",
    clips,
  };
}

export function downloadLabelsJson(merged) {
  const blob = new Blob([JSON.stringify(merged, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "animLabels.json";
  a.click();
  URL.revokeObjectURL(a.href);
}