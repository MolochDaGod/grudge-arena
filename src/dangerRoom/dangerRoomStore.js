/** Danger Room mode state — persisted preset + mode flag. */

import { DEFAULT_PRESET_ID, ROOM_PRESETS } from "./roomPresets.js";
import {
  isCombatSandboxMode,
  COMBAT_SANDBOX_ANIM_OVERDRIVE,
  COMBAT_SANDBOX_PRESET,
} from "../combatSandbox.js";

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
    animOverdrive: 1,
    combatSandbox: false,
  };
  if (isCombatSandboxMode()) {
    base.presetId = COMBAT_SANDBOX_PRESET;
    base.animOverdrive = COMBAT_SANDBOX_ANIM_OVERDRIVE;
    base.combatSandbox = true;
  }
  if (typeof localStorage === "undefined") return { ...base };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...base };
    const saved = JSON.parse(raw);
    const merged = {
      mode: saved.mode === "danger" ? "danger" : "arena",
      presetId: ROOM_PRESETS[saved.presetId] ? saved.presetId : DEFAULT_PRESET_ID,
      musicEnabled: saved.musicEnabled !== false,
      musicVolume: typeof saved.musicVolume === "number" ? saved.musicVolume : 0.65,
      adsShoulder: typeof saved.adsShoulder === "number" ? saved.adsShoulder : 0.8,
      crosshairBase: typeof saved.crosshairBase === "number" ? saved.crosshairBase : 10,
      animOverdrive: typeof saved.animOverdrive === "number" ? saved.animOverdrive : 1,
      combatSandbox: !!saved.combatSandbox,
    };
    if (isCombatSandboxMode()) {
      merged.presetId = COMBAT_SANDBOX_PRESET;
      merged.animOverdrive = COMBAT_SANDBOX_ANIM_OVERDRIVE;
      merged.combatSandbox = true;
    }
    return merged;
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

/** Playback speed multiplier for locomotion + combat anims (combat sandbox = 2×). */
export function getAnimOverdrive() {
  const v = state.animOverdrive;
  return typeof v === "number" && v > 0 ? v : 1;
}

export function setAnimOverdrive(mult) {
  state = { ...state, animOverdrive: Math.max(0.5, Math.min(3, mult)) };
  emit();
}

export function setAdsShoulder(v) {
  state = { ...state, adsShoulder: Math.max(0, Math.min(2, v)) };
  emit();
}

export function setCrosshairBase(v) {
  state = { ...state, crosshairBase: Math.max(4, Math.min(24, Math.round(v))) };
  emit();
}

export function setCombatSandboxUi(on) {
  state = { ...state, combatSandbox: !!on };
  emit();
}

export function isCombatSandboxUi() {
  return !!state.combatSandbox || isCombatSandboxMode();
}

/**
 * Island heightfield + Rapier + ground sampling — combat-sandbox route OR island preset.
 * /danger-room defaults to island preset but is not the /combat-sandbox path; both need
 * the same terrain/physics stack or characters float, fall through mesh, and PBR ground
 * never registers colliders.
 */
export function needsIslandTerrain() {
  if (isCombatSandboxMode()) return true;
  return state.presetId === "island";
}