/**
 * Arena session store — single source of truth for route, boot phase, manifest, active arena.
 * Replaces ad-hoc window.__grudgeArena checks scattered across gameFlow / HUD / smoke tests.
 */

import { currentRoute } from "./arenaRouter.js";
import { loadArenaPrefabManifest } from "./arenaPrefab.js";
import { getDangerRoomState } from "./dangerRoom/dangerRoomStore.js";
import { getD1LoadoutState } from "./d1LoadoutStore.js";
import { isCombatSandboxMode } from "./combatSandbox.js";

/** @typedef {'lobby'|'loading'|'playing'} ArenaPhase */

/** @type {{ phase: ArenaPhase, route: import('./arenaRouter.js').ArenaRoute | null, manifest: object | null, manifestError: string | null, bootError: string | null, activeArena: object | null }} */
let state = {
  phase: "lobby",
  route: null,
  manifest: null,
  manifestError: null,
  bootError: null,
  activeArena: null,
};

const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(getArenaSession());
}

export function subscribeArenaSession(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getArenaSession() {
  return {
    ...state,
    danger: getDangerRoomState(),
    d1: getD1LoadoutState(),
    combatSandbox: isCombatSandboxMode(),
  };
}

export function getActiveArena() {
  return state.activeArena;
}

export function setSessionPhase(phase) {
  if (state.phase === phase) return;
  state = { ...state, phase };
  emit();
}

export function setSessionRoute(route) {
  state = { ...state, route: route ?? currentRoute() };
  emit();
}

export function setBootError(message) {
  state = { ...state, bootError: message || null };
  emit();
}

export function setActiveArena(arena) {
  state = { ...state, activeArena: arena, bootError: null };
  if (typeof window !== "undefined") {
    window.__grudgeArena = arena ?? null;
  }
  emit();
}

export function clearActiveArena() {
  if (state.activeArena?.dispose) {
    try {
      state.activeArena.dispose();
    } catch {
      /* teardown may have run */
    }
  }
  state = { ...state, activeArena: null };
  if (typeof window !== "undefined") {
    window.__grudgeArena = null;
  }
  emit();
}

/** Prefetch arenaPrefab/1.0 manifest before character boot. */
export async function prefetchArenaManifest(force = false) {
  if (state.manifest && !force) return state.manifest;
  try {
    const manifest = await loadArenaPrefabManifest(force);
    state = { ...state, manifest, manifestError: null };
    emit();
    return manifest;
  } catch (err) {
    const msg = err?.message || String(err);
    state = { ...state, manifestError: msg };
    emit();
    console.warn("[arenaSession] manifest prefetch failed:", msg);
    return null;
  }
}

/**
 * Build GrudgeArena constructor config from lobby build + session route.
 * @param {object} opts
 */
export function buildArenaBootConfig(opts) {
  const route =
    state.route ||
    (typeof location !== "undefined" ? currentRoute() : null);
  const mode =
    opts.mode === "danger" || route.gameMode === "danger" || isCombatSandboxMode()
      ? "danger"
      : "arena";

  return {
    container: opts.container,
    mode,
    race: opts.race,
    weapon: opts.weapon,
    classId: opts.classId,
    buildConfig: opts.buildConfig,
    playerName: opts.playerName,
    grudgeId: opts.grudgeId,
    matchData: opts.matchData ?? null,
    wsUrl: opts.wsUrl,
    token: opts.token,
    combatSandbox: route?.combatSandbox || isCombatSandboxMode(),
  };
}