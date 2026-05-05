/**
 * ObjectStore Client — Arena
 *
 * Fetches weapon skills, enemy data, and game data from the
 * Grudge Studio ObjectStore production API.
 *
 * Primary: objectstore.grudge-studio.com (Cloudflare Worker + R2 cache)
 * Fallback: molochdagod.github.io/ObjectStore (GitHub Pages static JSON)
 */

const WORKER_URL = 'https://objectstore.grudge-studio.com';
const PAGES_URL = 'https://molochdagod.github.io/ObjectStore/api/v1';

const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 min

async function fetchWithFallback(workerPath, pagesFile) {
  const cacheKey = workerPath;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data;

  // Try Worker first (faster, has filtering)
  try {
    const res = await fetch(`${WORKER_URL}${workerPath}`);
    if (res.ok) {
      const data = await res.json();
      cache.set(cacheKey, { data, at: Date.now() });
      return data;
    }
  } catch { /* fall through */ }

  // Fallback to GitHub Pages
  try {
    const res = await fetch(`${PAGES_URL}/${pagesFile}`);
    if (res.ok) {
      const data = await res.json();
      cache.set(cacheKey, { data, at: Date.now() });
      return data;
    }
  } catch { /* fall through */ }

  return cached?.data || null;
}

// ── Weapon Skills ────────────────────────────────────────────────

/** Fetch all weapon skills (17 types, 207 skills) */
export async function getWeaponSkills() {
  return fetchWithFallback('/v1/weapon-skills', 'weaponSkills.json');
}

/** Fetch weapon skills for a specific weapon type (e.g. 'SWORD', 'GREATSWORD') */
export async function getWeaponSkillTree(weaponType) {
  return fetchWithFallback(`/v1/weapon-skills/${weaponType}`, 'weaponSkills.json')
    .then(data => {
      // If we got the full dataset (Pages fallback), filter locally
      if (data?.weaponTypes) {
        return data.weaponTypes.find(w =>
          w.id === weaponType.toUpperCase() || w.name.toLowerCase() === weaponType.toLowerCase()
        ) || null;
      }
      return data;
    });
}

/** Get all weapon types available for a class */
export async function getClassWeapons(className) {
  const data = await getWeaponSkills();
  if (!data?.classRestrictions) return [];
  const allowed = data.classRestrictions[className] || [];
  if (!data.weaponTypes) return allowed;
  return data.weaponTypes.filter(wt => allowed.includes(wt.id));
}

/** Lookup a single skill by ID across all weapon types */
export async function getSkillById(skillId) {
  const data = await getWeaponSkills();
  if (!data?.weaponTypes) return null;
  for (const wt of data.weaponTypes) {
    for (const slot of wt.slots) {
      const skill = slot.skills.find(s => s.id === skillId);
      if (skill) return { ...skill, weaponType: wt.id, weaponName: wt.name, slotType: slot.type };
    }
  }
  return null;
}

// ── Game Data ────────────────────────────────────────────────────

/** Fetch enemies data */
export async function getEnemies() {
  return fetchWithFallback('/v1/game-data/enemies', 'enemies.json');
}

/** Fetch classes data */
export async function getClasses() {
  return fetchWithFallback('/v1/game-data/classes', 'classes.json');
}

/** Fetch races data */
export async function getRaces() {
  return fetchWithFallback('/v1/game-data/races', 'races.json');
}

/** Fetch weapons data */
export async function getWeapons() {
  return fetchWithFallback('/v1/game-data/weapons', 'weapons.json');
}

/** Fetch any game data collection by name */
export async function getGameData(name) {
  return fetchWithFallback(`/v1/game-data/${name}`, `${name}.json`);
}

// ── Items catalog (3,425 unified items) ─────────────────────────

let _itemsIndex = null; // { all: [...], byId: Map, byCategory: Map }

function _buildItemsIndex(raw) {
  const all = Array.isArray(raw?.items) ? raw.items : [];
  const byId = new Map();
  const byCategory = new Map();
  for (const item of all) {
    if (!item?.id) continue;
    byId.set(item.id, item);
    const cat = item.category || 'misc';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(item);
  }
  return { all, byId, byCategory, categories: raw?.categories || [...byCategory.keys()] };
}

/** Fetch and index the full items catalog. Cached + idempotent. */
export async function getItems() {
  if (_itemsIndex) return _itemsIndex;
  const raw = await fetchWithFallback('/v1/game-data/items-database', 'items-database.json');
  _itemsIndex = _buildItemsIndex(raw || { items: [] });
  return _itemsIndex;
}

/** Lookup a single catalog item by its slug id (e.g. "bone-dagger"). */
export async function getItemById(itemSlug) {
  const idx = await getItems();
  return idx.byId.get(itemSlug) || null;
}

/** Get all items in a category (weapon, armor, consumable, offhand, relic, ring, skill, material). */
export async function getItemsByCategory(category) {
  const idx = await getItems();
  return idx.byCategory.get(category) || [];
}

/** Case-insensitive name/id search. Returns up to `limit` entries. */
export async function searchItems(query, { category, limit = 50 } = {}) {
  const idx = await getItems();
  const q = (query || '').toLowerCase();
  let pool = category ? (idx.byCategory.get(category) || []) : idx.all;
  if (q) {
    pool = pool.filter(it =>
      it.name?.toLowerCase().includes(q) ||
      it.id?.toLowerCase().includes(q)
    );
  }
  return pool.slice(0, limit);
}

// ── Prefetch ─────────────────────────────────────────────────────

/** Warm the cache with core arena data */
export async function prefetchArenaData() {
  await Promise.allSettled([
    getWeaponSkills(),
    getClasses(),
    getRaces(),
    getEnemies(),
    getItems(),
  ]);
  console.log('[ObjectStore] Arena data prefetched');
}

export default {
  getWeaponSkills, getWeaponSkillTree, getClassWeapons, getSkillById,
  getEnemies, getClasses, getRaces, getWeapons, getGameData,
  getItems, getItemById, getItemsByCategory, searchItems,
  prefetchArenaData,
};
