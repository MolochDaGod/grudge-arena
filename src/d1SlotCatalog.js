/**
 * D1 Warlords slot catalog — runtime mirror of scripts/lib/d1-slot-catalog.mjs.
 * Prefer manifest.weaponMappings when arenaPrefab manifest is loaded.
 */

export const WEAPON_EQUIP_MAP = {
  greatsword: { rSlot: "axe", rVariant: "B" },
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

/** Warrior-class armor per race (from process-30grudge6 presets). */
export const RACE_CLASS_ARMOR = {
  human: {
    warrior: { head: "D", body: "C", arms: "B", legs: "B", shoulders: "A" },
    mage: { head: "A", body: "A", arms: "A", legs: "A", shoulders: "A" },
    ranger: { head: "C", body: "B", arms: "B", legs: "B", shoulders: "A" },
    worge: { head: "D", body: "C", arms: "B", legs: "B", shoulders: "A" },
  },
  barbarian: {
    warrior: { head: "B", body: "C", arms: "B", legs: "B", shoulders: "B" },
    mage: { head: "A", body: "A", arms: "A", legs: "A", shoulders: "A" },
    ranger: { head: "C", body: "B", arms: "B", legs: "B", shoulders: "A" },
    worge: { head: "B", body: "C", arms: "B", legs: "B", shoulders: "B" },
  },
  dwarf: {
    warrior: { head: "G", body: "C", arms: "B", legs: "B", shoulders: "B" },
    mage: { head: "A", body: "A", arms: "A", legs: "A", shoulders: "A" },
    ranger: { head: "C", body: "B", arms: "B", legs: "B", shoulders: "A" },
    worge: { head: "G", body: "C", arms: "B", legs: "B", shoulders: "B" },
  },
  elf: {
    warrior: { head: "D", body: "C", arms: "B", legs: "B", shoulders: "B" },
    mage: { head: "B", body: "A", arms: "A", legs: "A", shoulders: "A" },
    ranger: { head: "C", body: "B", arms: "B", legs: "B", shoulders: "A" },
    worge: { head: "D", body: "C", arms: "B", legs: "B", shoulders: "B" },
  },
  orc: {
    warrior: { head: "E", body: "C", arms: "B", legs: "B", shoulders: "C" },
    mage: { head: "A", body: "A", arms: "A", legs: "A", shoulders: "A" },
    ranger: { head: "B", body: "B", arms: "B", legs: "B", shoulders: "A" },
    worge: { head: "E", body: "C", arms: "B", legs: "B", shoulders: "C" },
  },
  undead: {
    warrior: { head: "G", body: "D", arms: "C", legs: "C", shoulders: "B" },
    mage: { head: "A", body: "G", arms: "B", legs: "B", shoulders: "A" },
    ranger: { head: "C", body: "B", arms: "B", legs: "B", shoulders: "A" },
    worge: { head: "G", body: "D", arms: "C", legs: "C", shoulders: "B" },
  },
};

export function getRaceClassArmor(race, classId = "warrior") {
  const presets = RACE_CLASS_ARMOR[race];
  if (!presets) return { body: "A", head: "A", arms: "A", legs: "A", shoulders: "A" };
  return { ...(presets[classId] || presets.warrior) };
}

export const DEFAULT_ARMOR_LOADOUT = getRaceClassArmor("human", "warrior");

/**
 * Match a requested variant ("A", "B", "AXE_A") to catalog keys (AXE_A, SWORD_B, …).
 * @param {Iterable<string>} variantKeys
 * @param {string|null} variant
 */
export function resolveVariantKey(variantKeys, variant) {
  const keys = [...variantKeys];
  if (keys.length === 0) return null;
  if (variant === null || variant === undefined) return keys[0];

  const v = String(variant).toUpperCase();
  if (keys.includes(v)) return v;

  const suffix = `_${v}`;
  const suffixHit = keys.find((k) => k === v || k.endsWith(suffix));
  if (suffixHit) return suffixHit;

  const containsHit = keys.find((k) => k.includes(`_${v}`));
  if (containsHit) return containsHit;

  return keys[0];
}

export function resolveWeaponMapping(manifest, weaponType) {
  if (manifest?.races) {
    for (const race of Object.values(manifest.races)) {
      if (race.weaponMappings?.[weaponType]) return race.weaponMappings[weaponType];
    }
  }
  return WEAPON_EQUIP_MAP[weaponType] ?? WEAPON_EQUIP_MAP.greatsword;
}