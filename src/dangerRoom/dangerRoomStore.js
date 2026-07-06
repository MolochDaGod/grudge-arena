/** Danger Room mode state — persisted preset + mode flag. */

import { DEFAULT_PRESET_ID, ROOM_PRESETS } from "./roomPresets.js";

const STORAGE_KEY = "grudge_arena_danger_room_v1";

let state = load();
const listeners = new Set();

function load() {
  const base = {
    mode: "arena",
    presetId: DEFAULT_PRESET_ID,
    musicEnabled: true,
    musicVolume: 0.65,
    adsShoulder: 0.8,
    crosshairBase: 10,
  };
  if (typeof localStorage === "undefined") return { ...base };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...base };
    const saved = JSON.parse(raw);
    return {
      mode: saved.mode === "danger" ? "danger" : "arena",
      presetId: ROOM_PRESETS[saved.presetId] ? saved.presetId : DEFAULT_PRESET_ID,
      musicEnabled: saved.musicEnabled !== false,
      musicVolume: typeof saved.musicVolume === "number" ? saved.musicVolume : 0.65,
      adsShoulder: typeof saved.adsShoulder === "number" ? saved.adsShoulder : 0.8,
      crosshairBase: typeof saved.crosshairBase === "number" ? saved.crosshairBase : 10,
    };
  } catch {
    return { ...base };
  }
}

function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

function emit() {
  persist();
  for (const fn of listeners) fn();
}

export function subscribeDangerRoom(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getDangerRoomState() {
  return state;
}

export function isDangerMode() {
  return state.mode === "danger";
}

export function setDangerMode(on) {
  state = { ...state, mode: on ? "danger" : "arena" };
  emit();
}

export function setRoomPreset(id) {
  if (!ROOM_PRESETS[id]) return;
  state = { ...state, presetId: id };
  emit();
}

export function cycleRoomPreset(dir = 1) {
  const ids = Object.keys(ROOM_PRESETS);
  const idx = ids.indexOf(state.presetId);
  const next = ids[(idx + dir + ids.length) % ids.length];
  setRoomPreset(next);
}

export function setMusicEnabled(on) {
  state = { ...state, musicEnabled: !!on };
  emit();
}

export function setMusicVolume(v) {
  state = { ...state, musicVolume: Math.max(0, Math.min(1, v)) };
  emit();
}