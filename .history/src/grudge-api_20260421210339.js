/**
 * Grudge Studio Backend API Client — Arena
 *
 * Lightweight client for auth, match results, and player stats.
 * All calls go through /api/grudge/* Vercel rewrites → grudge-studio.com.
 *
 * Auth tokens shared across all Grudge apps via 'grudge_auth_token' in localStorage.
 * Reference: GDevelopAssistant-full/docs/BACKEND_CONNECTION_GUIDE.md
 */

const GAME = '/api/grudge/game';
const ID   = '/api/grudge/id';

// ── Auth token management (shared SSO) ──
const AUTH_TOKEN_KEY = 'grudge_auth_token';
const SESSION_TOKEN_KEY = 'grudge_session_token';

export function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(SESSION_TOKEN_KEY);
}

export function getGrudgeId() {
  return localStorage.getItem('grudge_id');
}

export function isLoggedIn() {
  return !!getToken();
}

function authHeaders() {
  const token = getToken();
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function apiFetch(url, opts = {}) {
  try {
    const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) } });
    if (res.status === 401) { console.warn('[grudgeApi] 401 — token may be expired'); return null; }
    if (!res.ok) { console.warn(`[grudgeApi] ${res.status} — ${url}`); return null; }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return null;
  } catch (err) {
    console.warn(`[grudgeApi] fetch error (${url}):`, err.message);
    return null;
  }
}

// ── Arena match results ──
export const arenaApi = {
  /** Post a completed match result */
  async postMatchResult(data) {
    // data: { winner: 'A'|'B', playerTeam: 'A', race, weapon, matchDuration, teamAComp, teamBComp }
    return apiFetch(`${GAME}/arena/matches`, {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        grudge_id: getGrudgeId(),
        timestamp: new Date().toISOString(),
      }),
    });
  },

  /** Get player's arena stats (wins, losses, rating) */
  async getPlayerStats() {
    const id = getGrudgeId();
    if (!id) return null;
    return apiFetch(`${GAME}/arena/stats`);
  },

  /** Get arena leaderboard */
  async getLeaderboard(limit = 20) {
    return apiFetch(`${GAME}/arena/leaderboard?limit=${limit}`);
  },

  /** Get recent match history */
  async getMatchHistory(limit = 10) {
    return apiFetch(`${GAME}/arena/matches?limit=${limit}`);
  },
};

// ── Auth endpoints ──
export const authApi = {
  async verify() {
    const token = getToken();
    if (!token) return false;
    const res = await apiFetch(`${ID}/auth/verify`, { method: 'POST', body: JSON.stringify({ token }) });
    return res?.valid === true;
  },

  async me() {
    return apiFetch(`${ID}/auth/user`, { method: 'GET' });
  },
};

// ── Character endpoints (needed for inventory char_id lookup) ──
export const characterApi = {
  /** List all characters for the authenticated player. */
  async list() {
    const res = await apiFetch(`${GAME}/characters`);
    return Array.isArray(res) ? res : [];
  },
  async get(id) { return apiFetch(`${GAME}/characters/${id}`); },
  async create(data) {
    return apiFetch(`${GAME}/characters`, { method: 'POST', body: JSON.stringify(data) });
  },
  async update(id, data) {
    return apiFetch(`${GAME}/characters/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  },
};

// ── Inventory endpoints — mirrors SDK v6.0 GrudgeGameClient ──
export const inventoryApi = {
  /** GET /inventory?char_id=X — returns [] when unauthenticated. */
  async list(charId) {
    if (!getToken()) return [];
    const qs = charId ? `?char_id=${encodeURIComponent(charId)}` : '';
    const res = await apiFetch(`${GAME}/inventory${qs}`);
    return Array.isArray(res) ? res : [];
  },

  /**
   * POST /inventory — add an item instance to the player's inventory.
   * @param {object} data  { itemId, catalogId, char_id, qty?, bound?, rolls? }
   */
  async add(data) {
    if (!getToken()) return null;
    return apiFetch(`${GAME}/inventory`, { method: 'POST', body: JSON.stringify(data) });
  },

  /** PATCH /inventory/:id/equip — attach item to an equipment slot. */
  async equip(itemId, slot) {
    if (!getToken()) return null;
    return apiFetch(`${GAME}/inventory/${encodeURIComponent(itemId)}/equip`, {
      method: 'PATCH',
      body: JSON.stringify({ slot }),
    });
  },

  /** PATCH /inventory/:id/unequip */
  async unequip(itemId) {
    if (!getToken()) return null;
    return apiFetch(`${GAME}/inventory/${encodeURIComponent(itemId)}/unequip`, { method: 'PATCH' });
  },

  /** DELETE /inventory/:id */
  async remove(itemId) {
    if (!getToken()) return null;
    return apiFetch(`${GAME}/inventory/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
  },
};

export default {
  arena: arenaApi,
  auth: authApi,
  character: characterApi,
  inventory: inventoryApi,
  getToken, getGrudgeId, isLoggedIn,
};
