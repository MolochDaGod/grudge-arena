/**
 * InventorySystem — binds an ECS player entity to the ItemRegistry and backend.
 *
 * Three-tier cascade (identical to how the production launcher treats offline):
 *   1. Memory     — ECS components (Inventory, Equipment, SkillBar)
 *   2. localStorage — grudge_inventory_<grudgeId> (write-through cache)
 *   3. Backend    — api.grudge-studio.com via inventoryApi (best-effort sync)
 *
 * Every mutation is applied to (1) and (2) synchronously, then queued
 * for (3). Read paths never await the network.
 */

import { itemRegistry } from './itemRegistry.js';
import { inventoryApi, characterApi, getGrudgeId, isLoggedIn } from './grudge-api.js';
import { inferEquipmentSlot } from './engine/ECS.js';
import { isValidGrudgeUuid } from './grudgeUuid.js';

const LS_KEY_PREFIX = 'grudge_inventory_';
const GUEST_KEY = 'guest';

function lsKey(grudgeId) { return `${LS_KEY_PREFIX}${grudgeId || GUEST_KEY}`; }

export class InventorySystem {
  constructor() {
    this.playerEntity = null;
    this.grudgeId = null;
    this.characterId = null;
    this._syncQueue = [];
    this._syncing = false;
  }

  /**
   * Bind a player entity and hydrate its inventory.
   * @param {Entity} entity  Must already have Inventory + Equipment + SkillBar components.
   */
  async loadForPlayer(entity) {
    if (!entity?.hasComponent('Inventory')) {
      throw new Error('[InventorySystem] player entity missing Inventory component');
    }
    this.playerEntity = entity;
    this.grudgeId = getGrudgeId();

    // 1) Try backend (authoritative) when logged in.
    let instances = null;
    if (isLoggedIn()) {
      this.characterId = await this._resolveCharacterId();
      const remote = await inventoryApi.list(this.characterId);
      if (remote?.length) instances = remote;
    }

    // 2) Fallback to localStorage cache.
    if (!instances) {
      try {
        const raw = localStorage.getItem(lsKey(this.grudgeId));
        if (raw) instances = JSON.parse(raw);
      } catch { /* corrupt cache, ignore */ }
    }

    // 3) Hydrate registry + components.
    if (Array.isArray(instances)) {
      itemRegistry.hydrate(instances);
      this._applyToComponents(instances);
    }
    await itemRegistry.ready();
    return instances || [];
  }

  async _resolveCharacterId() {
    const chars = await characterApi.list();
    // Use the first character as the arena avatar for now; future: let the player pick.
    return chars?.[0]?.id || null;
  }

  _applyToComponents(instances) {
    const inv = this.playerEntity.getComponent('Inventory');
    const eq  = this.playerEntity.getComponent('Equipment');
    let slotCursor = 0;
    for (const inst of instances) {
      if (!isValidGrudgeUuid(inst.itemId)) continue;
      if (inst.equippedSlot && eq.slots[inst.equippedSlot] !== undefined) {
        eq.slots[inst.equippedSlot] = inst.itemId;
      } else if (slotCursor < inv.capacity) {
        inv.slots[slotCursor++] = inst.itemId;
      }
    }
    inv.version++; eq.version++;
  }

  /** Persist current memory state to localStorage (write-through cache). */
  _persistLocal() {
    try {
      localStorage.setItem(lsKey(this.grudgeId), JSON.stringify(itemRegistry.dump()));
    } catch (e) { console.warn('[InventorySystem] localStorage write failed:', e.message); }
  }

  _queueSync(op) {
    this._syncQueue.push(op);
    this._drainSync();
  }

  async _drainSync() {
    if (this._syncing || !isLoggedIn()) return;
    this._syncing = true;
    while (this._syncQueue.length) {
      const op = this._syncQueue.shift();
      try { await op(); }
      catch (e) {
        console.warn('[InventorySystem] sync op failed, retry later:', e.message);
        this._syncQueue.unshift(op);
        break;
      }
    }
    this._syncing = false;
  }

  /**
   * Add a newly-minted item (from loot, vendor, crafting) into the first empty slot.
   * @param {string} catalogId  e.g. "bone-dagger"
   * @returns {object|null}  the instance, or null if inventory is full.
   */
  addFromCatalog(catalogId, opts = {}) {
    const inv = this.playerEntity.getComponent('Inventory');
    const emptyIdx = inv.slots.indexOf(null);
    if (emptyIdx < 0) return null;
    const instance = itemRegistry.mint(catalogId, { ...opts, ownerId: this.grudgeId });
    inv.slots[emptyIdx] = instance.itemId;
    inv.version++; inv.dirty = true;
    this._persistLocal();
    this._queueSync(() => inventoryApi.add({ ...instance, char_id: this.characterId }));
    return instance;
  }

  /** Equip an item from inventory into its inferred slot (or a forced slot). */
  async equip(itemId, forcedSlot = null) {
    const inv = this.playerEntity.getComponent('Inventory');
    const eq  = this.playerEntity.getComponent('Equipment');
    const idx = inv.slots.indexOf(itemId);
    if (idx < 0) return false;
    const view = await itemRegistry.resolve(itemId);
    const slot = forcedSlot || inferEquipmentSlot(view?.catalog);
    if (!slot || !(slot in eq.slots)) return false;
    const previous = eq.slots[slot];
    eq.slots[slot] = itemId;
    inv.slots[idx] = previous; // swap into inventory slot
    inv.version++; eq.version++; inv.dirty = true; eq.dirty = true;
    this._persistLocal();
    this._queueSync(() => inventoryApi.equip(itemId, slot));
    return true;
  }

  /** Unequip a slot back into the first empty inventory cell. */
  unequip(slot) {
    const inv = this.playerEntity.getComponent('Inventory');
    const eq  = this.playerEntity.getComponent('Equipment');
    const itemId = eq.slots[slot];
    if (!itemId) return false;
    const emptyIdx = inv.slots.indexOf(null);
    if (emptyIdx < 0) return false;
    eq.slots[slot] = null;
    inv.slots[emptyIdx] = itemId;
    inv.version++; eq.version++; inv.dirty = true; eq.dirty = true;
    this._persistLocal();
    this._queueSync(() => inventoryApi.unequip(itemId));
    return true;
  }

  /** Move an item between inventory indices. */
  move(fromIdx, toIdx) {
    const inv = this.playerEntity.getComponent('Inventory');
    if (fromIdx === toIdx) return false;
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= inv.capacity || toIdx >= inv.capacity) return false;
    const tmp = inv.slots[toIdx];
    inv.slots[toIdx] = inv.slots[fromIdx];
    inv.slots[fromIdx] = tmp;
    inv.version++; inv.dirty = true;
    this._persistLocal();
    return true;
  }

  /** Destroy an item permanently. */
  destroy(itemId) {
    const inv = this.playerEntity.getComponent('Inventory');
    const eq  = this.playerEntity.getComponent('Equipment');
    const idx = inv.slots.indexOf(itemId);
    if (idx >= 0) inv.slots[idx] = null;
    for (const s of Object.keys(eq.slots)) if (eq.slots[s] === itemId) eq.slots[s] = null;
    itemRegistry.remove(itemId);
    inv.version++; eq.version++; inv.dirty = true; eq.dirty = true;
    this._persistLocal();
    this._queueSync(() => inventoryApi.remove(itemId));
  }

  /** Bind a skill to a hotbar slot. */
  setSkillSlot(slotIndex, skillId) {
    const bar = this.playerEntity.getComponent('SkillBar');
    if (!bar || slotIndex < 0 || slotIndex >= bar.size) return false;
    bar.slots[slotIndex] = skillId;
    bar.version++; bar.dirty = true;
    return true;
  }
}

export const inventorySystem = new InventorySystem();
export default inventorySystem;
