/**
 * Combat sandbox player bootstrap — starter inventory + skill bar sync.
 * Runs once after inventory hydrate when the player has no saved gear.
 */

import { isCombatSandboxMode } from "./combatSandbox.js";
import { itemRegistry } from "./itemRegistry.js";
import { WeaponDefinitions } from "./engine/WeaponDefinitions.js";

const ABILITY_SLOT_KEYS = ["Q", "E", "R", "F"];
const ULTIMATE_SLOT_KEY = "P";
const ULTIMATE_SLOT_INDEX = 8;
const CONSUMABLE_SLOT_START = 5;

/** Default attribute spread when no lobby build is present. */
export const DEFAULT_SANDBOX_ATTRIBUTES = {
  Strength: 20,
  Intellect: 10,
  Vitality: 20,
  Dexterity: 18,
  Endurance: 20,
  Wisdom: 10,
  Agility: 18,
  Tactics: 14,
};

const STARTER_ITEMS = [
  { catalogId: "resource-wood", qty: 12 },
  { catalogId: "resource-stone", qty: 8 },
  { catalogId: "resource-ore", qty: 6 },
];

/**
 * Copy weapon Q/E/R/F abilities into SkillBar slots 1–4; slot 5 stays empty.
 * @param {import('./engine/ECS.js').Entity} entity
 * @param {object|null} weaponDef
 */
export function syncSkillBarFromWeapon(entity, weaponDef) {
  const bar = entity?.getComponent?.("SkillBar");
  if (!bar || !weaponDef?.abilities) return false;
  let changed = false;
  ABILITY_SLOT_KEYS.forEach((key, idx) => {
    const ability = weaponDef.abilities[key];
    const next = ability ? `${key}:${ability.name}` : null;
    if (bar.slots[idx] !== next) {
      bar.slots[idx] = next;
      changed = true;
    }
  });
  if (bar.slots[4] !== null) {
    bar.slots[4] = null;
    changed = true;
  }
  const ult = weaponDef.abilities[ULTIMATE_SLOT_KEY];
  const ultSlot = ult ? `${ULTIMATE_SLOT_KEY}:${ult.name}` : null;
  if (bar.slots[ULTIMATE_SLOT_INDEX] !== ultSlot) {
    bar.slots[ULTIMATE_SLOT_INDEX] = ultSlot;
    changed = true;
  }
  if (changed) {
    bar.version++;
    bar.dirty = true;
  }
  return changed;
}

/**
 * Seed harvest materials when sandbox inventory is empty.
 * @param {import('./inventorySystem.js').InventorySystem} inventorySystem
 */
export async function seedSandboxInventory(inventorySystem) {
  if (!inventorySystem?.playerEntity) return false;
  const inv = inventorySystem.playerEntity.getComponent("Inventory");
  if (!inv) return false;
  const used = inv.slots.filter(Boolean).length;
  if (used > 0) return false;

  await itemRegistry.ready();
  for (const item of STARTER_ITEMS) {
    inventorySystem.addFromCatalog(item.catalogId, { qty: item.qty });
  }
  return true;
}

/**
 * Full sandbox bootstrap: starter items (if empty) + skill bar from active weapon.
 * @param {object} arena GrudgeArena instance
 */
export async function bootstrapSandboxPlayer(arena) {
  if (!isCombatSandboxMode() || !arena?.playerEntity) return;

  const ws = arena.playerEntity.getComponent("WeaponState");
  const weaponKey = ws?.primary || arena._getWeaponTypeKey?.() || "greatsword";
  const weaponDef =
    arena.getCurrentWeapon?.() ||
    WeaponDefinitions[weaponKey] ||
    WeaponDefinitions.greatsword;

  await seedSandboxInventory(arena.inventorySystem);
  syncSkillBarFromWeapon(arena.playerEntity, weaponDef);

  const profile = arena.playerEntity.getComponent("BuildProfile");
  if (profile && !profile.attributes) {
    profile.attributes = { ...DEFAULT_SANDBOX_ATTRIBUTES };
    profile.version = (profile.version || 0) + 1;
  }
  arena.inventoryUI?.update?.();
}

export { ABILITY_SLOT_KEYS, CONSUMABLE_SLOT_START, ULTIMATE_SLOT_KEY, ULTIMATE_SLOT_INDEX };