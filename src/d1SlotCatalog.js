/**
 * D1 Warlords slot catalog — runtime mirror of scripts/lib/d1-slot-catalog.mjs.
 * Prefer manifest.weaponMappings when arenaPrefab manifest is loaded.
 */

export const WEAPON_EQUIP_MAP = {
  greatsword: { rSlot: "axe", rVariant: "A" },
  scythe: { rSlot: "axe", rVariant: "B" },
  sabres: { rSlot: "sword", rVariant: "A", lSlot: "shield", lVariant: "A", extras: ["quiver"] },
  runeblade: { rSlot: "sword", rVariant: "B" },
  bow: { lSlot: "bow", lVariant: null, extras: ["quiver"] },
  staff: { lSlot: "staff", lVariant: "A" },
  wand: { lSlot: "staff", lVariant: "A" },
  mace: { rSlot: "hammer", rVariant: "A" },
  rifle: { rSlot: "axe", rVariant: "A" },
  unarmed: {},
};

export const DEFAULT_ARMOR_LOADOUT = {
  body: "A",
  head: "A",
  arms: "A",
  legs: "A",
  shoulders: "A",
};

export function resolveWeaponMapping(manifest, weaponType) {
  if (manifest?.races) {
    for (const race of Object.values(manifest.races)) {
      if (race.weaponMappings?.[weaponType]) return race.weaponMappings[weaponType];
    }
  }
  return WEAPON_EQUIP_MAP[weaponType] ?? WEAPON_EQUIP_MAP.greatsword;
}