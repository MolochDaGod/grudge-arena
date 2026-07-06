/**
 * Game flow orchestrator — view transitions between dressing room and play modes.
 * Works with arenaRouter slugs; index.html registers a host with build/auth hooks.
 */

import { ROUTES, navigate, parseRoute } from "./arenaRouter.js";

const PENDING_ROUTE_KEY = "grudge_pending_route";

export function stashPendingRoute(path) {
  if (path && path !== ROUTES.DRESSING_ROOM) {
    sessionStorage.setItem(PENDING_ROUTE_KEY, path);
  }
}

export function consumePendingRoute() {
  const path = sessionStorage.getItem(PENDING_ROUTE_KEY);
  if (path) sessionStorage.removeItem(PENDING_ROUTE_KEY);
  return path;
}

/** Resume /danger-room (etc.) after guest login — call from showLoggedIn. */
export async function resumePendingRoute() {
  const path = consumePendingRoute();
  if (!path) return false;
  await handleRoute(parseRoute(path));
  return true;
}

/** @type {import('./gameFlow.js').GameFlowHost | null} */
let host = null;

/**
 * @typedef {Object} GameFlowHost
 * @property {() => boolean} isAuthed
 * @property {() => boolean} isBuildReady
 * @property {(msg: string) => void} [setAuthStatus]
 * @property {() => object} getBuildConfig
 * @property {(race: string, matchData: object|null, build: object, mode: string) => Promise<void>} loadArenaGame
 * @property {() => Promise<void>} [joinQueue]
 * @property {(race: string, weapon: string) => void} [openAnimTest]
 */

/** @param {GameFlowHost} h */
export function registerGameFlowHost(h) {
  host = h;
}

function highlightRoomSlug(path) {
  document.querySelectorAll(".room-slug").forEach((el) => {
    el.classList.toggle("room-slug--active", el.getAttribute("href") === path);
  });
}

export function showDressingRoom() {
  document.getElementById("loading-overlay")?.classList.remove("active");
  document.getElementById("game-root")?.classList.remove("active");
  const gameUI = document.getElementById("gameUI");
  if (gameUI) gameUI.style.display = "none";
  document.getElementById("lobby-overlay")?.classList.remove("hidden");
  document.body.classList.remove("danger-room-active");
}

function showGameLoading() {
  document.getElementById("lobby-overlay")?.classList.add("hidden");
  document.getElementById("loading-overlay")?.classList.add("active");
}

export async function stopActiveGame() {
  const arena = window.__grudgeArena;
  if (!arena) return;
  if (arena.dangerMode) {
    const { teardownDangerRoom } = await import("./dangerRoom/DangerRoomMode.js");
    teardownDangerRoom(arena);
  }
  arena.dispose?.();
  window.__grudgeArena = null;
}

export async function exitToDressingRoom() {
  await stopActiveGame();
  showDressingRoom();
  navigate(ROUTES.DRESSING_ROOM, { replace: true });
}

async function applyDangerPresetFromUrl() {
  const preset = new URLSearchParams(location.search).get("preset");
  if (!preset) return;
  const { setRoomPreset } = await import("./dangerRoom/dangerRoomStore.js");
  setRoomPreset(preset);
}

/**
 * @param {import('./arenaRouter.js').ArenaRoute} route
 */
export async function handleRoute(route) {
  if (route.redirect) {
    const q = location.search || "";
    if (route.id === "anim-test" && host?.openAnimTest) {
      const build = host.getBuildConfig();
      host.openAnimTest(build.race, build.weapon);
      navigate(ROUTES.DRESSING_ROOM, { replace: true });
      return;
    }
    location.replace(route.redirect + q);
    return;
  }

  if (route.id === "dressing-room") {
    await stopActiveGame();
    showDressingRoom();
    highlightRoomSlug(route.path);
    return;
  }

  if (!route.autoStart) return;

  const activeMode = window.__grudgeArena?.dangerMode ? "danger" : "arena";
  if (window.__grudgeArena && route.gameMode === activeMode) return;

  if (!host?.isAuthed?.()) {
    if (route.autoStart && route.gameMode) {
      stashPendingRoute(route.path);
    }
    host?.setAuthStatus?.("Sign in or play as Guest to enter");
    navigate(ROUTES.DRESSING_ROOM, { replace: true });
    return;
  }

  if (!host?.isBuildReady?.() && route.gameMode !== "danger") {
    host?.setAuthStatus?.("Spend all 160 attribute points before entering");
    navigate(ROUTES.DRESSING_ROOM, { replace: true });
    return;
  }

  const build = host.getBuildConfig();

  if (route.autoStart === "queue") {
    showDressingRoom();
    try {
      await host.joinQueue?.();
    } catch (err) {
      console.error("[arena] Queue failed:", err);
      navigate(ROUTES.DRESSING_ROOM, { replace: true });
    }
    return;
  }

  if (route.gameMode === "danger") {
    await applyDangerPresetFromUrl();
  }

  await stopActiveGame();
  showGameLoading();
  await host.loadArenaGame(build.race, null, build, route.gameMode || "arena");
}