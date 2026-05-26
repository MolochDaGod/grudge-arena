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

// ── Items catalog (master-items.json — canonical, GRUDGE-UUID keyed) ──
//
// Source of truth: ObjectStore worker `/v1/game-data/master-items` (proxies
// the same R2/Pages JSON used by GrudgeBuilder, grudge-game-data-hub, etc).
// Legacy `items-database.json` is kept as a fallback for environments that
// haven't refreshed their catalog yet.
//
// Each item exposes: uuid, baseUuid, name, category, type, subCategory,
// slotType, material, setName, tier, tierLabel, tierColor, iconUrl, stats,
// abilities, signature, passive, passives, proc, setBonus, primaryStat,
// secondaryStat, lore, source.

let _itemsIndex = null; // { all, byId, byUuid, byBaseUuid, byCategory, byType, bySetName, byTier }

/** Convert any item name/id into a stable slug ("Bloodfeud Blade" -> "bloodfeud-blade"). */
function _itemSlug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function _buildItemsIndex(raw) {
  const all = Array.isArray(raw?.items) ? raw.items : Array.isArray(raw) ? raw : [];
  const byId = new Map();           // legacy slug → item
  const byUuid = new Map();         // GRUDGE UUID → item
  const byBaseUuid = new Map();     // baseUuid → item[] (tier variants share a baseUuid)
  const byCategory = new Map();
  const byType = new Map();
  const bySetName = new Map();
  const byTier = new Map();
  for (const item of all) {
    if (!item || (!item.id && !item.uuid && !item.name)) continue;
    // Normalize an `id` slug for back-compat regardless of source.
    const id = item.id || _itemSlug(item.baseName || item.name);
    if (!item.id) item.id = id;
    byId.set(id, item);
    if (item.uuid) byUuid.set(item.uuid, item);
    if (item.baseUuid) {
      if (!byBaseUuid.has(item.baseUuid)) byBaseUuid.set(item.baseUuid, []);
      byBaseUuid.get(item.baseUuid).push(item);
    }
    const cat = item.category || 'misc';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(item);
    const t = item.type || 'misc';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(item);
    if (item.setName) {
      if (!bySetName.has(item.setName)) bySetName.set(item.setName, []);
      bySetName.get(item.setName).push(item);
    }
    const tier = item.tier ?? 0;
    if (!byTier.has(tier)) byTier.set(tier, []);
    byTier.get(tier).push(item);
  }
  return {
    all,
    byId, byUuid, byBaseUuid,
    byCategory, byType, bySetName, byTier,
    categories: raw?.categories || [...byCategory.keys()],
  };
}

/** Fetch and index the canonical items catalog. Cached + idempotent. */
export async function getItems() {
  if (_itemsIndex) return _itemsIndex;
  // Prefer master-items.json (GRUDGE UUIDs, iconUrl, tierColor, slotType).
  let raw = await fetchWithFallback('/v1/game-data/master-items', 'master-items.json');
  // Fall back to legacy items-database.json if master is unreachable or empty.
  if (!raw || !(Array.isArray(raw?.items) ? raw.items.length : Array.isArray(raw) ? raw.length : 0)) {
    raw = await fetchWithFallback('/v1/game-data/items-database', 'items-database.json');
  }
  _itemsIndex = _buildItemsIndex(raw || { items: [] });
  return _itemsIndex;
}

/** Lookup by uuid (preferred) or legacy slug id. */
export async function getItemById(idOrUuid) {
  const idx = await getItems();
  return idx.byUuid.get(idOrUuid) || idx.byId.get(idOrUuid) || null;
}

/** Get all items in a category (weapon/armor/consumable/sword/spear/...). */
export async function getItemsByCategory(category) {
  const idx = await getItems();
  return idx.byCategory.get(category) || [];
}

/** Get all items of a `type` (weapon, armor, food, material, artifact, offhand-tome). */
export async function getItemsByType(type) {
  const idx = await getItems();
  return idx.byType.get(type) || [];
}

/** Get every tier variant for a base item ("Bloodfeud Blade" T1..T8). */
export async function getItemTiers(baseUuid) {
  const idx = await getItems();
  return idx.byBaseUuid.get(baseUuid) || [];
}

/** Case-insensitive search across name/id/uuid. Returns up to `limit` entries. */
export async function searchItems(query, { category, type, limit = 50 } = {}) {
  const idx = await getItems();
  const q = (query || '').toLowerCase();
  let pool = idx.all;
  if (category) pool = idx.byCategory.get(category) || [];
  else if (type) pool = idx.byType.get(type) || [];
  if (q) {
    pool = pool.filter(it =>
      it.name?.toLowerCase().includes(q) ||
      it.id?.toLowerCase().includes(q) ||
      it.uuid?.toLowerCase().includes(q)
    );
  }
  return pool.slice(0, limit);
}

// ── Master-* convenience fetchers (same worker route family) ─────
// Kept separate for callers that want only weapons / only armor and
// don't want to inflate the unified items index.

/** Fetch the canonical weapons catalog (843 items with iconUrl, abilities, signatures). */
export async function getMasterWeapons() {
  return fetchWithFallback('/v1/game-data/master-weapons', 'master-weapons.json');
}

/** Fetch the canonical armor catalog (1,218 items with slotType, setName, material). */
export async function getMasterArmor() {
  return fetchWithFallback('/v1/game-data/master-armor', 'master-armor.json');
}

/** Fetch the canonical consumables catalog (137 items with buff JSON, emoji, iconUrl). */
export async function getMasterConsumables() {
  return fetchWithFallback('/v1/game-data/master-consumables', 'master-consumables.json');
}

/** Fetch the weapon-models manifest (R2 keys for each weapon-type GLB). */
export async function getWeaponModels() {
  return fetchWithFallback('/v1/game-data/weapon-models', 'weapon-models.json');
}

/** Fetch the equipment definitions (slots, tier multipliers, weapon types). */
export async function getEquipmentDefs() {
  return fetchWithFallback('/v1/game-data/equipment', 'equipment.json');
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
  getItems, getItemById, getItemsByCategory, getItemsByType, getItemTiers, searchItems,
  getMasterWeapons, getMasterArmor, getMasterConsumables,
  getWeaponModels, getEquipmentDefs,
  prefetchArenaData,
};
