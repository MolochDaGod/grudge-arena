/**
 * Arena game API client — builds / matches only (FK grudge_id).
 * Auth stays on id.grudge-studio.com; this module never owns login.
 *
 * Routes (when live):
 *   GET  /api/arena/health
 *   GET  /api/arena/builds/active
 *   PUT  /api/arena/builds/active
 *
 * Best-effort: failures never block dressing-room play.
 */

const AUTH_TOKEN_KEY = 'grudge_auth_token';
const SESSION_TOKEN_KEY = 'grudge_session_token';
const ARENA_API = '/api/arena';

function getToken() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(SESSION_TOKEN_KEY);
}

function authHeaders() {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const token = getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

/**
 * @param {string} path
 * @param {RequestInit} [opts]
 * @returns {Promise<{ ok: boolean, status: number, data: any }>}
 */
async function arenaFetch(path, opts = {}) {
  try {
    const res = await fetch(`${ARENA_API}${path}`, {
      ...opts,
      headers: { ...authHeaders(), ...(opts.headers || {}) },
    });
    let data = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err?.message || String(err) };
  }
}

/** Probe whether the arena game API is reachable. */
export async function probeArenaGameApi() {
  const r = await arenaFetch('/health', { method: 'GET' });
  if (r.ok) return true;
  // Some deployments expose root or builds without /health
  if (r.status === 404) {
    const b = await arenaFetch('/builds/active', { method: 'GET' });
    return b.status > 0 && b.status !== 502 && b.status !== 503;
  }
  return false;
}

/**
 * Push local character build to the game API.
 * @param {object} payload
 * @returns {Promise<{ ok: boolean, status?: number, data?: any }>}
 */
export async function syncBuildToGameApi(payload) {
  if (!getToken()) return { ok: false, status: 401 };
  const body = {
    race: payload?.race ?? null,
    classId: payload?.classId ?? null,
    weapon: payload?.weapon ?? null,
    ringTier: payload?.ringTier ?? null,
    ringPerks: Array.isArray(payload?.ringPerks) ? payload.ringPerks : [],
    attributes: payload?.attributes && typeof payload.attributes === 'object' ? payload.attributes : {},
    updatedAt: new Date().toISOString(),
  };
  return arenaFetch('/builds/active', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * Pull remote active build if present.
 * @returns {Promise<object|null>}
 */
export async function fetchRemoteActiveBuild() {
  if (!getToken()) return null;
  const r = await arenaFetch('/builds/active', { method: 'GET' });
  if (!r.ok || !r.data) return null;
  const d = r.data.build || r.data.activeBuild || r.data;
  if (!d || typeof d !== 'object') return null;
  if (!d.race && !d.classId && !d.weapon) return null;
  return d;
}
