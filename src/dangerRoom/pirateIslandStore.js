/**
 * Pirate island persistence — player boat size, sail color, claim flags.
 */

const STORAGE_KEY = "grudge_pirate_island_v1";

export const PLAYER_BOAT_SIZES = ["ship-small", "ship-medium", "ship-large"];
export const DEFAULT_SAIL_COLOR = "#f5f5f0";

/** @type {{ boatSize: string, sailColor: string, claims: Record<string, { owner: string, color: string }> }} */
let state = load();
const listeners = new Set();

function load() {
  const base = {
    boatSize: "ship-medium",
    sailColor: DEFAULT_SAIL_COLOR,
    claims: {
      dock: { owner: "player", color: "#4a90d9" },
      north: { owner: "neutral", color: "#c9a227" },
      east: { owner: "enemy", color: "#8b2635" },
    },
  };
  if (typeof localStorage === "undefined") return { ...base };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...base };
    const saved = JSON.parse(raw);
    return {
      boatSize: PLAYER_BOAT_SIZES.includes(saved.boatSize) ? saved.boatSize : base.boatSize,
      sailColor: typeof saved.sailColor === "string" ? saved.sailColor : base.sailColor,
      claims: { ...base.claims, ...(saved.claims || {}) },
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
  for (const fn of listeners) fn(state);
}

export function subscribePirateIsland(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPirateIslandState() {
  return state;
}

export function setPlayerBoatSize(size) {
  if (!PLAYER_BOAT_SIZES.includes(size)) return;
  state = { ...state, boatSize: size };
  emit();
}

export function setPlayerSailColor(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  state = { ...state, sailColor: hex };
  emit();
}

export function setClaimOwner(zoneId, owner, color) {
  state = {
    ...state,
    claims: {
      ...state.claims,
      [zoneId]: { owner, color: color || state.claims[zoneId]?.color || "#888888" },
    },
  };
  emit();
}