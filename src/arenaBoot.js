/**
 * Canonical arena boot — manifest prefetch, danger-room preset sync, GrudgeArena lifecycle.
 */

import {
  buildArenaBootConfig,
  clearActiveArena,
  getActiveArena,
  prefetchArenaManifest,
  setActiveArena,
  setBootError,
  setSessionPhase,
  setSessionRoute,
} from "./arenaSessionStore.js";
import {
  setAnimOverdrive,
  setCombatSandboxUi,
  setDangerMode,
  setRoomPreset,
} from "./dangerRoom/dangerRoomStore.js";
import {
  COMBAT_SANDBOX_ANIM_OVERDRIVE,
  COMBAT_SANDBOX_PRESET,
  isCombatSandboxMode,
} from "./combatSandbox.js";

/**
 * @param {object} opts
 * @param {HTMLElement} opts.container
 * @param {string} opts.race
 * @param {string} opts.weapon
 * @param {string} opts.classId
 * @param {object} opts.buildConfig
 * @param {string} opts.playerName
 * @param {string} [opts.grudgeId]
 * @param {object|null} [opts.matchData]
 * @param {'arena'|'danger'} [opts.mode]
 * @param {string} [opts.wsUrl]
 * @param {string|null} [opts.token]
 * @param {(pct: number, text?: string) => void} [opts.onProgress]
 */
export async function bootArenaGame(opts) {
  setSessionRoute();
  setSessionPhase("loading");
  setBootError(null);
  clearActiveArena();

  await prefetchArenaManifest();

  const sandbox = isCombatSandboxMode();
  const danger = opts.mode === "danger" || sandbox;
  if (danger) {
    setDangerMode(true);
    if (sandbox) {
      setCombatSandboxUi(true);
      setRoomPreset(COMBAT_SANDBOX_PRESET);
      setAnimOverdrive(COMBAT_SANDBOX_ANIM_OVERDRIVE);
    }
  } else {
    setDangerMode(false);
  }

  const onProgress = opts.onProgress ?? (() => {});
  onProgress(10, "Loading game engine...");

  try {
    const { GrudgeArena } = await import("../game.js");
    onProgress(40, "Initializing arena...");

    const config = buildArenaBootConfig(opts);
    const arena = new GrudgeArena(config);

    config.container?.classList?.add("active");
    void config.container?.offsetWidth;

    onProgress(60, "Building world...");
    await arena.init();

    onProgress(100, "Ready!");
    setActiveArena(arena);
    setSessionPhase("playing");
    return arena;
  } catch (err) {
    const msg = err?.message || String(err);
    setBootError(msg);
    setSessionPhase("lobby");
    throw err;
  }
}

/** Tear down active arena + danger room HUD (gameFlow exit). */
export async function teardownArenaGame() {
  const arena = getActiveArena();
  if (!arena) return;

  if (arena.dangerMode) {
    const { teardownDangerRoom } = await import("./dangerRoom/DangerRoomMode.js");
    teardownDangerRoom(arena);
  }
  arena.dispose?.();
  clearActiveArena();
  setSessionPhase("lobby");
  setDangerMode(false);
}