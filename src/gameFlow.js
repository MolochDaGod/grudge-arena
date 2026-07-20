/**
 * Game flow orchestrator — view transitions between dressing room and play modes.
 * Works with arenaRouter slugs; index.html registers a host with build/auth hooks.
 */

import { ROUTES, navigate, parseRoute } from "./arenaRouter.js";
import { teardownArenaGame } from "./arenaBoot.js";
import { getActiveArena, setSessionRoute } from "./arenaSessionStore.js";
import {
  isCombatSandboxMode,
  COMBAT_SANDBOX_PRESET,
  COMBAT_SANDBOX_ANIM_OVERDRIVE,
} from "./combatSandbox.js";
import {
  isSandboxAutoStartRoute,
  prepareSandboxLobbyChrome,
  showSandboxBootLoading,
} from "./sandboxGameFlow.js";

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
  await teardownArenaGame();
}

export async function exitToDressingRoom() {
  await stopActiveGame();
  showDressingRoom();
  navigate(ROUTES.DRESSING_ROOM, { replace: true });
}

async function applyDangerPresetFromUrl(route) {
  const { setRoomPreset, setAnimOverdrive, setCombatSandboxUi } = await import("./dangerRoom/dangerRoomStore.js");
  if (route?.combatSandbox || isCombatSandboxMode()) {
    setCombatSandboxUi(true);
    setRoomPreset(COMBAT_SANDBOX_PRESET);
    setAnimOverdrive(COMBAT_SANDBOX_ANIM_OVERDRIVE);
    return;
  }
  const preset = new URLSearchParams(location.search).get("preset");
  if (!preset) return;
  setRoomPreset(preset);
}

/**
 * @param {import('./arenaRouter.js').ArenaRoute} route
 */
export async function handleRoute(route) {
  setSessionRoute(route);

  if (isSandboxAutoStartRoute(route)) {
    prepareSandboxLobbyChrome();
  }

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

  const activeArena = getActiveArena();
  const activeMode = activeArena?.dangerMode ? "danger" : "arena";
  if (activeArena && route.gameMode === activeMode) return;

  // Danger room / combat sandbox: always playable (guest OK, no 160-point lock)
  const sandbox =
    route.combatSandbox ||
    isCombatSandboxMode() ||
    route.gameMode === "danger";

  if (!host?.isAuthed?.() && !sandbox) {
    if (route.autoStart && route.gameMode) {
      stashPendingRoute(route.path);
    }
    host?.setAuthStatus?.("Sign in or play as Guest to enter");
    navigate(ROUTES.DRESSING_ROOM, { replace: true });
    return;
  }

  if (!host?.isBuildReady?.() && route.gameMode !== "danger" && !sandbox) {
    host?.setAuthStatus?.("Spend all 160 attribute points before entering");
    navigate(ROUTES.DRESSING_ROOM, { replace: true });
    return;
  }

  // Prefer a ready champion build; fall back to human warrior for open play
  let build = host.getBuildConfig?.() || {
    race: "human",
    weapon: "greatsword",
    classId: "warrior",
    attributes: {},
  };
  if (!build.race) build = { ...build, race: "human" };
  if (!build.weapon) build = { ...build, weapon: "greatsword" };
  // Danger-room showcase defaults to Grudge6 human when no selection
  if (route.gameMode === "danger" && (!build.race || build.race === "default")) {
    build = { ...build, race: "human", weapon: build.weapon || "greatsword", classId: build.classId || "warrior" };
  }

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

  if (route.gameMode === "danger" || route.combatSandbox || isCombatSandboxMode() || sandbox) {
    await applyDangerPresetFromUrl(route);
    // Always full island showcase for danger-room
    try {
      const { setRoomPreset, setCombatSandboxUi } = await import("./dangerRoom/dangerRoomStore.js");
      setRoomPreset("island");
      setCombatSandboxUi(true);
    } catch {
      /* store optional at boot */
    }
  }

  await stopActiveGame();
  if (isSandboxAutoStartRoute(route)) {
    showSandboxBootLoading();
  } else {
    showGameLoading();
  }
  await host.loadArenaGame(build.race, null, build, route.gameMode || "arena");
}