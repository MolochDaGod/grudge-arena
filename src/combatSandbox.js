/**
 * Island Crusade Combat Sandbox — hostname + route detection.
 * Deployed at island-crusade-combat-sandbox.vercel.app
 */

const SANDBOX_HOST_RE = /island-crusade-combat-sandbox/i;
const COMBAT_SANDBOX_PATH = "/combat-sandbox";

/** True when served from the combat sandbox Vercel project. */
export function isCombatSandboxHost() {
  if (typeof location === "undefined") return false;
  return SANDBOX_HOST_RE.test(location.hostname);
}

/** Combat sandbox uses danger-room engine with island preset + full HUD. */
export function isCombatSandboxMode() {
  if (isCombatSandboxHost()) return true;
  if (typeof location === "undefined") return false;
  const path = (location.pathname || "").replace(/\/+$/, "") || "/";
  return path === COMBAT_SANDBOX_PATH;
}

export const COMBAT_SANDBOX_PRESET = "island";
/** Match anim-test gait timing — higher values look sped-up and harsh on island TPS. */
export const COMBAT_SANDBOX_ANIM_OVERDRIVE = 1;

export function combatSandboxDefaultRoute() {
  return isCombatSandboxHost() ? "/" : COMBAT_SANDBOX_PATH;
}