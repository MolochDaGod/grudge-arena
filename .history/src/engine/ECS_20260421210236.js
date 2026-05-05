/**
 * Entity-Component-System (ECS) Architecture
 *
 * ECS separates data (Components) from logic (Systems).
 * Entities are just IDs that hold components.
 */

import * as THREE from 'three';

export class Entity {
  static nextId = 0;

  constructor() {
    this.id = Entity.nextId++;
    this.components = new Map();
    this.tags = new Set();
  }

  addComponent(name, data) { this.components.set(name, data); return this; }
  getComponent(name) { return this.components.get(name); }
  hasComponent(name) { return this.components.has(name); }
  addTag(tag) { this.tags.add(tag); return this; }
  hasTag(tag) { return this.tags.has(tag); }
}

export class World {
  constructor() {
    this.entities = new Map();
    this.systems = [];
    this.eventQueue = [];
  }

  createEntity() {
    const entity = new Entity();
    this.entities.set(entity.id, entity);
    return entity;
  }

  removeEntity(id) { this.entities.delete(id); }

  getEntitiesWith(...componentNames) {
    return Array.from(this.entities.values()).filter(entity =>
      componentNames.every(name => entity.hasComponent(name))
    );
  }

  addSystem(system) { this.systems.push(system); system.world = this; }

  update(delta) {
    for (const system of this.systems) system.update(delta);
    this.eventQueue = [];
  }

  emit(event) { this.eventQueue.push(event); }
}

/**
 * Component factories — pure data containers.
 * Each returns a plain object representing one aspect of an entity.
 */
export const Components = {
  Transform: (x = 0, y = 0, z = 0) => ({
    position: new THREE.Vector3(x, y, z),
    rotation: new THREE.Euler(0, 0, 0),
    scale: new THREE.Vector3(1, 1, 1),
  }),

  Velocity: (x = 0, y = 0, z = 0) => ({
    linear: new THREE.Vector3(x, y, z),
    angular: new THREE.Vector3(0, 0, 0),
  }),

  Health: (max = 100) => ({
    current: max,
    max,
    regenRate: 0,
    invulnerable: false,
    lastDamageTime: 0,
  }),

  Shield: (max = 0) => ({
    current: max,
    max,
    regenRate: 5,
    regenDelay: 3,
  }),

  Resources: () => ({
    mana: { current: 100, max: 100, regenRate: 5 },
    energy: { current: 100, max: 100, regenRate: 10 },
    rage: { current: 0, max: 100, decayRate: 2 },
  }),

  Collider: (radius = 0.5, height = 1.8) => ({
    type: "capsule",
    radius,
    height,
    layer: "default",
    isStatic: false,
  }),

  Movement: (speed = 5) => ({
    baseSpeed: speed,
    sprintMultiplier: 1.5,
    isSprinting: false,
    isGrounded: true,
    jumpForce: 8,
    friction: 0.9,
  }),

  WeaponState: (primary, secondary) => ({
    primary,
    secondary,
    activeSlot: "primary",
    swapCooldown: 0,
    lastAttackTime: 0,
  }),

  AbilityState: () => ({
    cooldowns: { Q: 0, E: 0, R: 0, F: 0, P: 0 },
    casting: null,
    castProgress: 0,
  }),

  Projectile: (owner, damage, speed, lifetime) => ({
    ownerId: owner,
    damage,
    speed,
    lifetime,
    maxLifetime: lifetime,
    piercing: false,
    homing: false,
    onHit: null,
  }),

  AI: (behavior = "idle") => ({
    behavior,
    target: null,
    aggroRange: 15,
    attackRange: 2,
    patrolPoints: [],
    currentPatrolIndex: 0,
  }),

  RenderMesh: (mesh) => ({
    mesh,
    visible: true,
    castShadow: true,
    receiveShadow: true,
  }),

  Animator: () => ({
    mixer: null,
    clips: {},
    currentAction: null,
    blendTime: 0.2,
  }),

  PlayerInput: () => ({
    moveDirection: new THREE.Vector2(0, 0),
    lookDirection: new THREE.Vector3(0, 0, -1),
    mousePosition: new THREE.Vector2(0, 0),
    actions: {
      jump: false,
      sprint: false,
      attack: false,
      abilityQ: false,
      abilityE: false,
      abilityR: false,
      abilityF: false,
      abilityP: false,
      weaponSwap: false,
    },
  }),

  /**
   * Inventory — UUID-only grid of item instances.
   * Stats/icons live in the catalog; this component is pure ownership state.
   * @param {number} capacity  Default 5 rows × 8 cols = 40 slots.
   */
  Inventory: (capacity = 40) => ({
    capacity,
    // Sparse array of itemIds (Grudge UUIDs). null = empty slot.
    slots: new Array(capacity).fill(null),
    // Instance quantity overrides (for stackables). Map<itemId, number>.
    stacks: new Map(),
    // Monotonically incremented on any mutation; used by the sync layer.
    version: 0,
    dirty: false,
  }),

  /**
   * Equipment — named slots matching the RPG UI overlay.
   * Each slot holds a single itemId (Grudge UUID) or null.
   */
  Equipment: () => ({
    slots: {
      head: null,
      neck: null,
      shoulders: null,
      back: null,
      chest: null,
      wrists: null,
      hands: null,
      waist: null,
      legs: null,
      feet: null,
      ring1: null,
      ring2: null,
      trinket1: null,
      trinket2: null,
      mainHand: null,
      offHand: null,
      ranged: null,
    },
    version: 0,
    dirty: false,
  }),

  /**
   * SkillBar — 9 action-bar slots, each a skillId (or null).
   * Keys 1-9 in the HUD map directly to indices 0-8.
   */
  SkillBar: (size = 9) => ({
    size,
    slots: new Array(size).fill(null),
    version: 0,
    dirty: false,
  }),
};

// ── Equipment slot helpers ─────────────────────────────────────────

/** Canonical equipment slot keys (order = UI render order). */
export const EQUIPMENT_SLOTS = Object.freeze([
  "head",
  "neck",
  "shoulders",
  "back",
  "chest",
  "wrists",
  "hands",
  "waist",
  "legs",
  "feet",
  "ring1",
  "ring2",
  "trinket1",
  "trinket2",
  "mainHand",
  "offHand",
  "ranged",
]);

/** Map an item catalog `category` + tooltip hint to its equipment slot. */
export function inferEquipmentSlot(catalogItem) {
  if (!catalogItem) return null;
  const cat = catalogItem.category;
  const tip = (catalogItem.tooltip || "").toLowerCase();
  if (cat === "weapon") {
    if (tip.includes("twohand")) return "mainHand";
    if (tip.includes("offhand")) return "offHand";
    return "mainHand";
  }
  if (cat === "offhand" || cat === "relic") return "offHand";
  if (cat === "ring") return "ring1";
  if (cat !== "armor") return null;
  // Armor: dispatch by name hint
  const name = (catalogItem.name || "").toLowerCase();
  if (name.includes("helm") || name.includes("hood") || name.includes("crown"))
    return "head";
  if (name.includes("shoulder") || name.includes("pauldron"))
    return "shoulders";
  if (name.includes("cloak") || name.includes("cape") || name.includes("back"))
    return "back";
  if (
    name.includes("chest") ||
    name.includes("robe") ||
    name.includes("tunic") ||
    name.includes("armor")
  )
    return "chest";
  if (name.includes("bracer") || name.includes("wrist")) return "wrists";
  if (
    name.includes("glove") ||
    name.includes("gauntlet") ||
    name.includes("hand")
  )
    return "hands";
  if (name.includes("belt") || name.includes("sash") || name.includes("waist"))
    return "waist";
  if (
    name.includes("legs") ||
    name.includes("pants") ||
    name.includes("greaves")
  )
    return "legs";
  if (
    name.includes("boot") ||
    name.includes("feet") ||
    name.includes("sabaton")
  )
    return "feet";
  return "chest";
}
