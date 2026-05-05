/**
 * ItemRegistry — runtime map between Grudge UUIDs and catalog entries.
 *
 * Three layers per item:
 *   1. InstanceData — per-player, mutable: { itemId, catalogId, qty, bound, rolls }
 *   2. CatalogData  — from ObjectStore items-database.json (immutable, shared)
 *   3. ResolvedItem — merged view the UI/combat reads from.
 *
 * Instances are keyed by Grudge UUID (`itemId`). They reference a
 * `catalogId` (the slug, e.g. "bone-dagger") which points into the
 * ObjectStore catalog. This split is what lets a single catalog entry
 * be owned by many players while each owned copy stays unique, tradeable,
 * and mint-ready.
 */

import { getItemById, getItems } from './objectstore.js';
import { generateGrudgeUuid, isValidGrudgeUuid } from './grudgeUuid.js';

class ItemRegistry {
  constructor() {
    /** @type {Map<string, object>} itemId (UUID) → instance */
    this._instances = new Map();
    /** Catalog index is lazily populated from ObjectStore on first resolve. */
    this._catalogReady = null;
  }

  /** Ensure the ObjectStore catalog is loaded exactly once. */
  async ready() {
    if (!this._catalogReady) this._catalogReady = getItems();
    return this._catalogReady;
  }

  /**
   * Register a pre-existing instance (e.g. loaded from backend or localStorage).
   * Returns the stored instance record.
   */
  register(instance) {
    if (!instance?.itemId || !isValidGrudgeUuid(instance.itemId)) {
      throw new Error(`ItemRegistry.register: invalid itemId "${instance?.itemId}"`);
    }
    if (!instance.catalogId) {
      throw new Error(`ItemRegistry.register: missing catalogId for ${instance.itemId}`);
    }
    this._instances.set(instance.itemId, { qty: 1, bound: false, rolls: null, ...instance });
    return this._instances.get(instance.itemId);
  }

  /**
   * Mint a brand-new instance from a catalog slug. Generates a fresh Grudge UUID.
   * @param {string} catalogId  e.g. "bone-dagger"
   * @param {object} [opts]     { qty, bound, rolls, ownerId }
   */
  mint(catalogId, opts = {}) {
    const itemId = generateGrudgeUuid('item', catalogId);
    const instance = {
      itemId,
      catalogId,
      qty: opts.qty ?? 1,
      bound: opts.bound ?? false,
      rolls: opts.rolls ?? null,
      ownerId: opts.ownerId ?? null,
      createdAt: new Date().toISOString(),
    };
    this._instances.set(itemId, instance);
    return instance;
  }

  /** Get the raw instance by itemId, or null. */
  getInstance(itemId) {
    return this._instances.get(itemId) || null;
  }

  /**
   * Resolve an itemId to the full view: { instance, catalog, stats }.
   * Returns null if either side is missing.
   */
  async resolve(itemId) {
    const instance = this._instances.get(itemId);
    if (!instance) return null;
    await this.ready();
    const catalog = await getItemById(instance.catalogId);
    if (!catalog) return { instance, catalog: null, stats: {} };
    return {
      instance,
      catalog,
      stats: this._mergeStats(catalog, instance),
    };
  }

  /** Synchronous resolve — only works after ready() has been awaited at least once. */
  resolveSync(itemId) {
    const instance = this._instances.get(itemId);
    if (!instance) return null;
    return { instance, catalog: null, stats: {} };
  }

  /** Merge catalog base stats with instance rolls (affixes, enchants, etc.). */
  _mergeStats(catalog, instance) {
    const base = { ...(catalog.stats || {}) };
    if (!instance.rolls) return base;
    for (const [k, v] of Object.entries(instance.rolls)) {
      base[k] = (base[k] || 0) + v;
    }
    return base;
  }

  /** Remove an instance. Returns true if it existed. */
  remove(itemId) {
    return this._instances.delete(itemId);
  }

  /** Rehydrate from a serialized payload (backend or localStorage). */
  hydrate(instances) {
    if (!Array.isArray(instances)) return;
    for (const inst of instances) {
      try { this.register(inst); } catch (e) { console.warn('[ItemRegistry] skip invalid instance:', e.message); }
    }
  }

  /** Export all known instances for persistence. */
  dump() {
    return Array.from(this._instances.values());
  }

  /** Wipe the registry (used on logout / character switch). */
  clear() {
    this._instances.clear();
  }
}

// Singleton — the arena only ever has one player's registry in memory at a time.
export const itemRegistry = new ItemRegistry();
export default itemRegistry;
