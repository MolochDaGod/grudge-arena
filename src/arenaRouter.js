import { isCombatSandboxHost, isCombatSandboxMode } from "./combatSandbox.js";

/**
 * Arena URL router — slug-based game flow (SPA, Vercel catch-all → index.html).
 *
 * Routes:
 *   /                 → redirect /danger-room (primary experience)
 *   /dressing-room    → auth + champion builder (lobby)
 *   /arena            → solo 3v3 skirmish
 *   /danger-room      → training chamber
 *   /combat-sandbox   → island combat sandbox (full HUD + panels)
 *   /queue            → PvP matchmaking
 *   /anim-test        → animation diagnostic (static page)
 *
 * Aliases: /lobby → dressing-room, /training → danger-room
 */

export const ROUTES = {
  HOME: "/",
  DRESSING_ROOM: "/dressing-room",
  ARENA: "/arena",
  DANGER_ROOM: "/danger-room",
  COMBAT_SANDBOX: "/combat-sandbox",
  QUEUE: "/queue",
  ANIM_TEST: "/anim-test",
};

const ALIASES = {
  "/lobby": ROUTES.DRESSING_ROOM,
  "/training": ROUTES.DANGER_ROOM,
  "/dangerroom": ROUTES.DANGER_ROOM,
  "/sandbox": ROUTES.COMBAT_SANDBOX,
  "/combat": ROUTES.COMBAT_SANDBOX,
  "/dressingroom": ROUTES.DRESSING_ROOM,
};

/** @typedef {{ id: string, path: string, gameMode: 'arena'|'danger'|null, autoStart: boolean|'queue', redirect?: string }} ArenaRoute */

/**
 * @param {string} pathname
 * @returns {ArenaRoute}
 */
export function parseRoute(pathname = location.pathname) {
  let path = (pathname || "/").replace(/\/+$/, "") || "/";
  if (ALIASES[path]) path = ALIASES[path];

  switch (path) {
    case ROUTES.DRESSING_ROOM:
      return { id: "dressing-room", path, gameMode: null, autoStart: false };
    case ROUTES.ARENA:
      if (isCombatSandboxHost()) {
        return {
          id: "arena",
          path,
          gameMode: "danger",
          autoStart: true,
          combatSandbox: true,
        };
      }
      return { id: "arena", path, gameMode: "arena", autoStart: true };
    case ROUTES.DANGER_ROOM:
      return { id: "danger-room", path, gameMode: "danger", autoStart: true };
    case ROUTES.COMBAT_SANDBOX:
      return { id: "combat-sandbox", path, gameMode: "danger", autoStart: true, combatSandbox: true };
    case ROUTES.QUEUE:
      return { id: "queue", path, gameMode: "arena", autoStart: "queue" };
    case ROUTES.ANIM_TEST:
      return { id: "anim-test", path, gameMode: null, autoStart: false, redirect: "/anim-test.html" };
    case ROUTES.HOME:
      if (isCombatSandboxMode()) {
        return { id: "combat-sandbox", path, gameMode: "danger", autoStart: true, combatSandbox: true };
      }
      return { id: "home", path, gameMode: null, autoStart: false, redirect: ROUTES.DANGER_ROOM };
    default:
      return { id: "not-found", path, gameMode: null, autoStart: false, redirect: ROUTES.DRESSING_ROOM };
  }
}

let _handler = null;

/**
 * @param {(route: ArenaRoute) => void | Promise<void>} handler
 */
export function bootRouter(handler) {
  _handler = handler;
  window.addEventListener("popstate", () => {
    _handler?.(parseRoute(location.pathname));
  });
}

/** Run the handler for the current pathname (call after auth + builder init). */
export function resolveInitialRoute() {
  _handler?.(parseRoute(location.pathname));
}

/**
 * @param {string} path
 * @param {{ replace?: boolean, keepSearch?: boolean }} [opts]
 */
export function navigate(path, opts = {}) {
  const route = parseRoute(path);
  const target = route.redirect && route.id !== "anim-test" ? route.redirect : path;
  const search = opts.keepSearch ? location.search : "";
  const url = target + search;

  if (opts.replace) history.replaceState({ route: route.id }, "", url);
  else history.pushState({ route: route.id }, "", url);

  const resolved = parseRoute(target);
  _handler?.(resolved);
}

export function currentRoute() {
  return parseRoute(location.pathname);
}