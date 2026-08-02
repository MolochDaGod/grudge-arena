/**
 * Combat sandbox host — fast entry, lobby chrome, and route helpers.
 * Deployed at island-crusade-combat-sandbox.vercel.app
 */

import { isCombatSandboxMode } from "./combatSandbox.js";
import { ROUTES } from "./arenaRouter.js";

const SANDBOX_HOST_CLASS = "combat-sandbox-host";

/** Apply document-level sandbox chrome as early as possible. */
export function applySandboxHostDocument() {
  if (typeof document === "undefined" || !isCombatSandboxMode()) return;
  document.documentElement.classList.add(SANDBOX_HOST_CLASS);
  document.body?.classList.add(SANDBOX_HOST_CLASS);
}

/** Hide PvP / dressing-room lobby chrome; keep builder state for loadout hooks. */
export function prepareSandboxLobbyChrome() {
  if (typeof document === "undefined" || !isCombatSandboxMode()) return;

  applySandboxHostDocument();

  const lobby = document.getElementById("lobby-overlay");
  const raceSelect = document.getElementById("race-select");
  const authGate = document.getElementById("auth-gate");

  authGate?.style && (authGate.style.display = "none");
  raceSelect?.classList.add("show", "sandbox-skip-ui");
  lobby?.classList.add("sandbox-booting");

  const brandTitle = document.querySelector(".lobby-title");
  const brandSub = document.querySelector(".lobby-sub");
  if (brandTitle) brandTitle.textContent = "ISLAND CRUSADE";
  if (brandSub) {
    brandSub.textContent = "Combat Sandbox · Island Danger Room · Spell Book · Rapier Physics";
  }
}

/** Transition from lobby straight into the loading overlay. */
export function showSandboxBootLoading(label = "Loading island combat sandbox...") {
  if (typeof document === "undefined") return;
  document.getElementById("lobby-overlay")?.classList.add("hidden");
  document.getElementById("loading-overlay")?.classList.add("active");
  const text = document.getElementById("loading-text");
  if (text) text.textContent = label;
}

/**
 * Sandbox routes auto-start without auth or 160-point gate.
 * @param {import('./arenaRouter.js').ArenaRoute} route
 */
export function isSandboxAutoStartRoute(route) {
  if (!isCombatSandboxMode()) return false;
  return !!(route?.autoStart && (route.combatSandbox || route.gameMode === "danger"));
}

/** Default entry path for smoke / bookmarks. */
export function sandboxEntryPath() {
  return isCombatSandboxMode() && /island-crusade-combat-sandbox/i.test(location?.hostname ?? "")
    ? ROUTES.ARENA
    : ROUTES.COMBAT_SANDBOX;
}