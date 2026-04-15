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

export default { arena: arenaApi, auth: authApi, getToken, getGrudgeId, isLoggedIn };
