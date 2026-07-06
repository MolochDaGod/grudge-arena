/**
 * EquipmentManager — D1 Modular Character Equipment System
 *
 * The 6 D1 race GLBs (human, barbarian, elf, dwarf, orc, undead) ship with
 * ALL equipment meshes baked in as child nodes of the skeleton hierarchy.
 * Only one variant per slot should be visible at a time.
 *
 * Race prefixes:
 *   WK_   = human       BRB_ = barbarian    ELF_ = elf
 *   DWF_  = dwarf       ORC_ = orc          UD_  = undead
 *
 * Slot categories (inferred from lowercase mesh name):
 *   body       — body armor  (BRB_body_A … or WK_Units_Body_A …)
 *   head       — helmet      (_head_A …)
 *   shoulders  — shoulder    (shoulderpads_A …)
 *   arms       — arm armor   (_arms_A … or Units_Arms_A …)
 *   legs       — leg armor   (_legs_A … or Units_Legs_A …)
 *   sword      — swords in R_hand_container
 *   axe        — axes in R_hand_container
 *   hammer     — hammers
 *   spear      — spear
 *   dagger     — dagger / pick
 *   bow        — bow in L_hand_container
 *   staff      — staves in L_hand_container
 *   shield     — shields in L_shield_container
 *   quiver     — arrow quiver
 *   bag        — backpack extra
 *   wood       — carried wood extra
 */

/** Arena weapon type → which D1 mesh slot(s) to show */
const WEAPON_EQUIP_MAP = {
  greatsword: { rSlot: "axe", rVariant: "A" },
  scythe: { rSlot: "axe", rVariant: "B" },
  sabres: { rSlot: "sword", rVariant: "A", lSlot: "shield", lVariant: "A" },
  runeblade: { rSlot: "sword", rVariant: "B" },
  bow: { lSlot: "bow", lVariant: null, extras: ["quiver"] },
  staff: { lSlot: "staff", lVariant: "A" },
  wand: { lSlot: "staff", lVariant: "A" },
  mace: { rSlot: "hammer", rVariant: "A" },
  rifle: { rSlot: "axe", rVariant: "A" }, // fallback
  unarmed: {},
};

const WEAPON_SLOTS = [
  "sword",
  "axe",
  "hammer",
  "spear",
  "dagger",
  "bow",
  "staff",
];
const SHIELD_SLOTS = ["shield"];
const EXTRA_SLOTS = ["quiver", "bag", "wood"];
const ARMOR_SLOTS = ["body", "head", "shoulders", "arms", "legs"];

/**
 * Infer which equipment slot a mesh belongs to from its lowercase name.
 * Returns null if the mesh is not a toggleable equipment piece.
 */
function inferSlot(lowerName) {
  // Weapons
  if (/weapon_axe/.test(lowerName)) return "axe";
  if (/weapon_hammer/.test(lowerName)) return "hammer";
  if (/weapon_spear/.test(lowerName)) return "spear";
  if (/weapon_dagger|weapon_pick/.test(lowerName)) return "dagger";
  if (/weapon_bow/.test(lowerName)) return "bow";
  if (/weapon_staff/.test(lowerName)) return "staff";
  if (/weapon_sword/.test(lowerName)) return "sword";
  // Shields & extras
  if (/shield_/.test(lowerName)) return "shield";
  if (/xtra_quiver/.test(lowerName)) return "quiver";
  if (/xtra_bag/.test(lowerName)) return "bag";
  if (/xtra_wood/.test(lowerName)) return "wood";
  // Armor (handle both BRB_ bare style and WK_/ELF_ Units_ style)
  if (/shoulderpad/.test(lowerName)) return "shoulders";
  if (/_arms_|units_arms/.test(lowerName)) return "arms";
  if (/_legs_|units_legs/.test(lowerName)) return "legs";
  if (/_head_|units_head/.test(lowerName)) return "head";
  if (/_body_|units_body/.test(lowerName)) return "body";
  return null;
}

/**
 * Extract a sort-key variant from a mesh name.
 * For meshes with a trailing _X suffix (e.g. sword_A, Body_C) → 'A', 'B', …
 * For meshes without a letter suffix (e.g. BRB_weapon_Bow) → 'DEFAULT'
 */
function extractVariant(meshName) {
  const m = meshName.match(/_([A-Z])$/i);
  return m ? m[1].toUpperCase() : "DEFAULT";
}

export class EquipmentManager {
  /**
   * @param {THREE.Object3D} scene - The root scene from a loaded D1 GLB
   */
  constructor(scene) {
    // Map<slotName, Map<variant, THREE.Object3D>>
    this.slots = new Map();
    this._hasMeshes = false;
    this._catalog(scene);
  }

  /** Whether this manager found any equipment meshes */
  get hasEquipment() {
    return this._hasMeshes;
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _catalog(scene) {
    scene.traverse((node) => {
      if (!node.isMesh && !node.isSkinnedMesh) return;
      const lower = node.name.toLowerCase();
      const slot = inferSlot(lower);
      if (!slot) return;

      const variant = extractVariant(node.name);
      if (!this.slots.has(slot)) this.slots.set(slot, new Map());
      this.slots.get(slot).set(variant, node);

      // Hide everything on catalog
      node.visible = false;
    });

    const count = [...this.slots.values()].reduce((n, m) => n + m.size, 0);
    this._hasMeshes = count > 0;

    if (this._hasMeshes) {
      const summary = [...this.slots.entries()]
        .map(([s, m]) => `${s}(${[...m.keys()].join(",")})`)
        .join(" ");
      console.log(`[EquipmentManager] ${count} meshes catalogued: ${summary}`);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Hide every catalogued equipment mesh */
  hideAll() {
    for (const map of this.slots.values()) {
      for (const node of map.values()) node.visible = false;
    }
  }

  /**
   * Show exactly one variant in a slot, hide all others.
   * Pass variant = null to show the first available variant.
   * Returns true if the mesh was found and made visible.
   */
  equip(slot, variant = "A") {
    const map = this.slots.get(slot);
    if (!map || map.size === 0) return false;

    const v = variant === null ? null : variant.toUpperCase();
    // If requested variant not found, fall back to first available
    const key = v !== null && map.has(v) ? v : map.keys().next().value;

    for (const [k, node] of map) {
      node.visible = k === key;
    }
    return true;
  }

  /** Hide all meshes in a slot */
  unequip(slot) {
    const map = this.slots.get(slot);
    if (!map) return;
    for (const node of map.values()) node.visible = false;
  }

  /** Get all variant keys available for a slot */
  getVariants(slot) {
    return [...(this.slots.get(slot)?.keys() ?? [])];
  }

  /**
   * Apply default body armor — first available variant of each armor slot.
   * Typically shows body_A, head_A, arms_A, legs_A, shoulders_A.
   */
  applyDefaultArmor() {
    for (const slot of ARMOR_SLOTS) {
      this.equip(slot, null); // null = first available
    }
  }

  /**
   * Show weapon mesh(es) matching the given arena weapon type.
   * Clears all weapon/shield/extra slots first, then shows the right ones.
   *
   * @param {string} weaponType - e.g. 'greatsword', 'bow', 'sabres'
   */
  applyWeapon(weaponType) {
    // Clear all weapon-related slots
    for (const s of [...WEAPON_SLOTS, ...SHIELD_SLOTS, ...EXTRA_SLOTS]) {
      this.unequip(s);
    }

    const mapping = WEAPON_EQUIP_MAP[weaponType] ?? WEAPON_EQUIP_MAP.greatsword;

    if (mapping.rSlot) this.equip(mapping.rSlot, mapping.rVariant ?? null);
    if (mapping.lSlot) this.equip(mapping.lSlot, mapping.lVariant ?? null);
    for (const extra of mapping.extras ?? []) this.equip(extra, null);
  }

  /**
   * Full loadout: default armor + weapon for a given arena weapon type.
   */
  applyLoadout(weaponType) {
    this.applyDefaultArmor();
    this.applyWeapon(weaponType);
  }

  /** All catalogued slots → variant keys (for danger room gear editor). */
  getCatalog() {
    const out = {};
    for (const [slot, map] of this.slots) {
      out[slot] = [...map.keys()].sort();
    }
    return out;
  }

  /**
   * Apply saved D1 mesh overrides on top of a weapon-type loadout.
   * @param {string} weaponType
   * @param {{ armor?: Record<string,string>, weapon?: { rSlot?: string, rVariant?: string, lSlot?: string, lVariant?: string }, extras?: string[] }} d1Loadout
   */
  applyD1Loadout(weaponType, d1Loadout = {}) {
    this.applyLoadout(weaponType);

    const armor = d1Loadout.armor || {};
    for (const [slot, variant] of Object.entries(armor)) {
      if (variant) this.equip(slot, variant);
    }

    const w = d1Loadout.weapon || {};
    for (const s of [...WEAPON_SLOTS, ...SHIELD_SLOTS]) this.unequip(s);
    for (const extra of EXTRA_SLOTS) this.unequip(extra);

    if (w.rSlot) this.equip(w.rSlot, w.rVariant ?? null);
    if (w.lSlot) this.equip(w.lSlot, w.lVariant ?? null);

    const mapping = WEAPON_EQUIP_MAP[weaponType] ?? WEAPON_EQUIP_MAP.greatsword;
    if (!w.rSlot && mapping.rSlot) this.equip(mapping.rSlot, mapping.rVariant ?? null);
    if (!w.lSlot && mapping.lSlot) this.equip(mapping.lSlot, mapping.lVariant ?? null);

    const extras = d1Loadout.extras?.length
      ? d1Loadout.extras
      : mapping.extras ?? [];
    for (const extra of extras) this.equip(extra, null);

    return this.getCatalog();
  }
}

/**
 * Detect whether a loaded GLTF scene is a Synty Polygon / D1 modular character.
 * Synty race GLBs contain an 'Armature' root and skinned meshes whose names
 * start with a known race prefix (WK_, BRB_, ELF_, DWF_, ORC_, UD_).
 *
 * @param {THREE.Object3D} scene
 * @returns {boolean}
 */
export function isD1ModularScene(scene) {
  const SYNTY_PREFIXES = /^(BRB_|ELF_|DWF_|WK_|ORC_|UD_)/i;
  let found = false;
  scene.traverse((node) => {
    if ((node.isMesh || node.isSkinnedMesh) && SYNTY_PREFIXES.test(node.name)) {
      found = true;
    }
  });
  return found;
}
