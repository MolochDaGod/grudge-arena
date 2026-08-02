/**
 * D1 modular mesh slot catalog — shared by build-character-library and runtime validation.
 * Mirrors EquipmentManager.inferSlot / extractVariant rules.
 */

const WEAPON_SLOTS = ["sword", "axe", "hammer", "spear", "dagger", "bow", "staff"];
const SHIELD_SLOTS = ["shield"];
const EXTRA_SLOTS = ["quiver", "bag", "wood"];
const ARMOR_SLOTS = ["body", "head", "shoulders", "arms", "legs"];
export const ALL_SLOTS = [...ARMOR_SLOTS, ...WEAPON_SLOTS, ...SHIELD_SLOTS, ...EXTRA_SLOTS];

/** Arena weapon → D1 mesh slots (Warlords era — all races share mapping). */
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

/** Baked anim pack per arena weapon (prod runtime). */
export const WEAPON_ANIM_PACK = {
  greatsword: "sword_shield",
  scythe: "sword_shield",
  sabres: "sword_shield",
  runeblade: "sword_shield",
  mace: "sword_shield",
  staff: "magic",
  wand: "magic",
  bow: "longbow",
  rifle: "rifle",
  unarmed: "unarmed",
};

export const WEAPON_ATTACH_DEFAULTS = {
  greatsword: { hand: "R", scale: 1, position: [0, 0, -0.06], rotation: [0, 0, 0.08] },
  scythe: { hand: "R", scale: 1.02, position: [0, 0.02, -0.08], rotation: [0, 0, 0.12] },
  sabres: { hand: "R", scale: 0.98, position: [0, 0, -0.04], rotation: [0, 0, 0.05] },
  runeblade: { hand: "R", scale: 1, position: [0, 0, -0.05], rotation: [0, 0, 0.06] },
  mace: { hand: "R", scale: 1.05, position: [0, 0.03, -0.05], rotation: [0, 0, 0.1] },
  bow: { hand: "L", scale: 1, position: [0, 0, -0.03], rotation: [0, 0.15, 0] },
  staff: { hand: "L", scale: 1, position: [0, 0.04, -0.06], rotation: [0.1, 0, 0] },
  wand: { hand: "L", scale: 0.95, position: [0, 0.02, -0.04], rotation: [0.08, 0, 0] },
  rifle: { hand: "R", scale: 1, position: [0, 0, -0.05], rotation: [0, 0, 0.05] },
  unarmed: { scale: 1 },
};

export function inferSlot(lowerName) {
  if (/weapon_axe/.test(lowerName)) return "axe";
  if (/weapon_hammer/.test(lowerName)) return "hammer";
  if (/weapon_spear/.test(lowerName)) return "spear";
  if (/weapon_dagger|weapon_pick/.test(lowerName)) return "dagger";
  if (/weapon_bow/.test(lowerName)) return "bow";
  if (/weapon_staff/.test(lowerName)) return "staff";
  if (/weapon_sword/.test(lowerName)) return "sword";
  if (/weapon_mace/.test(lowerName)) return "hammer";
  if (/shield_/.test(lowerName)) return "shield";
  if (/xtra_quiver/.test(lowerName)) return "quiver";
  if (/xtra_bag/.test(lowerName)) return "bag";
  if (/xtra_wood/.test(lowerName)) return "wood";
  if (/shoulderpad/.test(lowerName)) return "shoulders";
  if (/_arms_|units_arms/.test(lowerName)) return "arms";
  if (/_legs_|units_legs/.test(lowerName)) return "legs";
  if (/_head_|units_head/.test(lowerName)) return "head";
  if (/_body_|units_body/.test(lowerName)) return "body";
  return null;
}

export function extractVariant(meshName) {
  const weaponTag = meshName.match(/weapon_([A-Z]+_[A-Z])$/i);
  if (weaponTag) return weaponTag[1].toUpperCase();
  const m = meshName.match(/_([A-Z])$/i);
  return m ? m[1].toUpperCase() : "DEFAULT";
}

/**
 * Build slot catalog from mesh name list.
 * @param {string[]} meshNames
 * @returns {Record<string, { variants: string[], meshes: Record<string, string> }>}
 */
export function buildSlotCatalog(meshNames) {
  const slots = {};
  for (const name of meshNames) {
    const slot = inferSlot(name.toLowerCase());
    if (!slot) continue;
    const variant = extractVariant(name);
    if (!slots[slot]) slots[slot] = { variants: new Set(), meshes: {} };
    slots[slot].variants.add(variant);
    slots[slot].meshes[variant] = name;
  }
  const out = {};
  for (const [slot, data] of Object.entries(slots)) {
    out[slot] = {
      variants: [...data.variants].sort(),
      meshes: data.meshes,
    };
  }
  return out;
}

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

/** Warlords-era hero defaults (source for manifest.heroes). */
export const HERO_PREFABS = {
  human: {
    id: "human",
    race: "human",
    faction: "crusade",
    classId: "warrior",
    archetype: "warrior",
    defaultWeapon: "sabres",
    weapons: ["greatsword", "sabres", "runeblade", "mace"],
    heightOffset: 0,
  },
  barbarian: {
    id: "barbarian",
    race: "barbarian",
    faction: "crusade",
    classId: "worge",
    archetype: "hybrid",
    defaultWeapon: "mace",
    weapons: ["mace", "greatsword", "sabres", "staff", "scythe"],
    heightOffset: 0,
  },
  elf: {
    id: "elf",
    race: "elf",
    faction: "fabled",
    classId: "ranger",
    archetype: "ranger",
    defaultWeapon: "bow",
    weapons: ["bow", "sabres", "greatsword", "scythe"],
    heightOffset: 0,
  },
  dwarf: {
    id: "dwarf",
    race: "dwarf",
    faction: "fabled",
    classId: "warrior",
    archetype: "warrior",
    defaultWeapon: "sabres",
    weapons: ["greatsword", "sabres", "runeblade", "mace"],
    heightOffset: -0.15,
  },
  orc: {
    id: "orc",
    race: "orc",
    faction: "legion",
    classId: "warrior",
    archetype: "warrior",
    defaultWeapon: "greatsword",
    weapons: ["greatsword", "sabres", "mace", "runeblade"],
    heightOffset: 0,
  },
  undead: {
    id: "undead",
    race: "undead",
    faction: "legion",
    classId: "mage",
    archetype: "mage",
    defaultWeapon: "staff",
    weapons: ["staff", "scythe", "runeblade"],
    heightOffset: 0,
  },
};

export function buildCharacterLoadoutPrefabs(races) {
  const prefabs = {};
  for (const [heroId, hero] of Object.entries(HERO_PREFABS)) {
    const race = races[hero.race];
    if (!race) continue;
    const weapon = hero.defaultWeapon;
    const mapping = WEAPON_EQUIP_MAP[weapon] || {};
    prefabs[`${hero.race}_${weapon}_default`] = {
      kind: "characterLoadout",
      heroId,
      race: hero.race,
      weapon,
      pack: "d1_modular",
      d1: {
        armor: { ...getRaceClassArmor(hero.race, hero.classId) },
        weapon: { ...mapping },
        extras: mapping.extras ? [...mapping.extras] : [],
      },
      animPack: WEAPON_ANIM_PACK[weapon] || "sword_shield",
      modelPath: race.modelPath,
    };
  }
  return prefabs;
}

export function extractSkeletonRefs(glbJson) {
  const nodes = glbJson.nodes || [];
  const find = (re) => nodes.find((n) => re.test(n.name || ""))?.name || null;
  return {
    convention: "biped",
    rootBone: "Bip001_Pelvis",
    namedBones: {
      pelvis: find(/Bip001.?Pelvis/i),
      head: find(/Bip001.?Head/i),
      handR: find(/Bip001.?R.?Hand/i),
      handL: find(/Bip001.?L.?Hand/i),
      footL: find(/Bip001.?L.?Foot/i),
      footR: find(/Bip001.?R.?Foot/i),
    },
  };
}