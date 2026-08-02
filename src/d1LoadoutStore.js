/**
 * D1 mesh loadout persistence — per-race armor + weapon variant edits.
 * Synced with grudge_arena_character_build_v1 and danger room session.
 */

import { CHARACTER_RACES, isValidRace } from "./characterResources.js";
import { getRaceClassArmor } from "./d1SlotCatalog.js";

export const D1_LOADOUT_STORAGE_KEY = "grudge_arena_d1_loadout_v1";
export const BUILD_STORAGE_KEY = "grudge_arena_character_build_v1";

/** All arena weapon types with D1 mesh mappings. */
export const ARENA_WEAPONS = [
  "greatsword",
  "sabres",
  "runeblade",
  "scythe",
  "mace",
  "bow",
  "staff",
  "wand",
  "rifle",
  "unarmed",
];

const ARMOR_SLOTS = ["body", "head", "shoulders", "arms", "legs"];
const WEAPON_SLOTS = ["sword", "axe", "hammer", "spear", "dagger", "bow", "staff"];
const EXTRA_SLOTS = ["shield", "quiver", "bag", "wood"];

/** @typedef {{ armor?: Record<string,string>, weapon?: { rSlot?: string, rVariant?: string, lSlot?: string, lVariant?: string }, extras?: string[] }} D1MeshLoadout */

let state = load();
const listeners = new Set();

function defaultD1Loadout() {
  return { armor: {}, weapon: {}, extras: [] };
}

function load() {
  const base = {
    race: "human",
    weapon: "greatsword",
    d1: defaultD1Loadout(),
    perRace: {},
  };
  if (typeof localStorage === "undefined") return { ...base };
  try {
    const raw = localStorage.getItem(D1_LOADOUT_STORAGE_KEY);
    if (!raw) return hydrateFromBuild(base);
    const saved = JSON.parse(raw);
    return normalize(saved, base);
  } catch {
    return hydrateFromBuild(base);
  }
}

function hydrateFromBuild(base) {
  try {
    const raw = localStorage.getItem(BUILD_STORAGE_KEY);
    if (!raw) return { ...base };
    const build = JSON.parse(raw);
    if (build?.race && isValidRace(build.race)) base.race = build.race;
    if (build?.weapon && ARENA_WEAPONS.includes(build.weapon)) base.weapon = build.weapon;
    if (build?.d1Loadout) base.d1 = normalizeD1(build.d1Loadout);
    if (build?.perRaceD1) base.perRace = build.perRaceD1;
  } catch {
    /* ignore */
  }
  return { ...base };
}

function normalizeD1(raw) {
  const d1 = defaultD1Loadout();
  if (raw?.armor && typeof raw.armor === "object") {
    for (const [k, v] of Object.entries(raw.armor)) {
      if (v) d1.armor[k] = String(v).toUpperCase();
    }
  }
  if (raw?.weapon && typeof raw.weapon === "object") {
    d1.weapon = { ...raw.weapon };
    if (d1.weapon.rVariant) d1.weapon.rVariant = String(d1.weapon.rVariant).toUpperCase();
    if (d1.weapon.lVariant) d1.weapon.lVariant = String(d1.weapon.lVariant).toUpperCase();
  }
  if (Array.isArray(raw?.extras)) d1.extras = raw.extras.map(String);
  return d1;
}

function normalize(saved, base) {
  const out = { ...base };
  if (saved?.race && isValidRace(saved.race)) out.race = saved.race;
  if (saved?.weapon && ARENA_WEAPONS.includes(saved.weapon)) out.weapon = saved.weapon;
  if (saved?.d1) out.d1 = normalizeD1(saved.d1);
  if (saved?.perRace && typeof saved.perRace === "object") out.perRace = saved.perRace;
  return out;
}

function persist() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      D1_LOADOUT_STORAGE_KEY,
      JSON.stringify({
        race: state.race,
        weapon: state.weapon,
        d1: state.d1,
        perRace: state.perRace,
      }),
    );
    syncBuildStorage();
  } catch {
    /* quota */
  }
}

/** Mirror into lobby build blob so dressing room + danger room stay aligned. */
function syncBuildStorage() {
  try {
    const raw = localStorage.getItem(BUILD_STORAGE_KEY);
    const build = raw ? JSON.parse(raw) : {};
    build.race = state.race;
    build.weapon = state.weapon;
    build.d1Loadout = state.d1;
    build.perRaceD1 = state.perRace;
    localStorage.setItem(BUILD_STORAGE_KEY, JSON.stringify(build));
  } catch {
    /* ignore */
  }
}

function emit() {
  persist();
  for (const fn of listeners) fn(state);
}

export function subscribeD1Loadout(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getD1LoadoutState() {
  return state;
}

export function getD1LoadoutForRace(race, classId = "warrior") {
  const raw = state.perRace?.[race] ? normalizeD1(state.perRace[race]) : state.d1;
  const defaults = getRaceClassArmor(race, classId);
  const armor = { ...defaults };
  for (const [slot, variant] of Object.entries(raw.armor || {})) {
    if (variant) armor[slot] = String(variant).toUpperCase();
  }
  return { ...raw, armor };
}

export function setD1Race(race) {
  if (!isValidRace(race)) return;
  if (state.race === race) return;
  if (state.race && state.d1) {
    state.perRace = { ...state.perRace, [state.race]: { ...state.d1 } };
  }
  state = { ...state, race };
  if (state.perRace[race]) state.d1 = normalizeD1(state.perRace[race]);
  emit();
}

export function setD1Weapon(weapon) {
  if (!ARENA_WEAPONS.includes(weapon)) return;
  state = { ...state, weapon };
  emit();
}

export function setD1ArmorSlot(slot, variant) {
  if (!ARMOR_SLOTS.includes(slot)) return;
  const armor = { ...state.d1.armor };
  if (!variant) delete armor[slot];
  else armor[slot] = String(variant).toUpperCase();
  state = { ...state, d1: { ...state.d1, armor } };
  state.perRace = { ...state.perRace, [state.race]: { ...state.d1 } };
  emit();
}

export function setD1WeaponSlot(side, slot, variant) {
  const weapon = { ...state.d1.weapon };
  if (side === "r") {
    if (!slot) {
      delete weapon.rSlot;
      delete weapon.rVariant;
    } else {
      weapon.rSlot = slot;
      weapon.rVariant = variant ? String(variant).toUpperCase() : null;
    }
  } else if (side === "l") {
    if (!slot) {
      delete weapon.lSlot;
      delete weapon.lVariant;
    } else {
      weapon.lSlot = slot;
      weapon.lVariant = variant ? String(variant).toUpperCase() : null;
    }
  }
  state = { ...state, d1: { ...state.d1, weapon } };
  state.perRace = { ...state.perRace, [state.race]: { ...state.d1 } };
  emit();
}

export function setD1Extras(extras) {
  state = {
    ...state,
    d1: { ...state.d1, extras: Array.isArray(extras) ? extras.map(String) : [] },
  };
  state.perRace = { ...state.perRace, [state.race]: { ...state.d1 } };
  emit();
}

export function resetD1LoadoutForRace(race) {
  if (!isValidRace(race)) return;
  const perRace = { ...state.perRace };
  delete perRace[race];
  state = { ...state, perRace, d1: defaultD1Loadout() };
  emit();
}

export const D1_SLOT_GROUPS = {
  armor: ARMOR_SLOTS,
  weapons: WEAPON_SLOTS,
  extras: EXTRA_SLOTS,
  races: CHARACTER_RACES,
};