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
    scale: new THREE.Vector3(1, 1, 1)
  }),

  Velocity: (x = 0, y = 0, z = 0) => ({
    linear: new THREE.Vector3(x, y, z),
    angular: new THREE.Vector3(0, 0, 0)
  }),

  Health: (max = 100) => ({
    current: max, max, regenRate: 0,
    invulnerable: false, lastDamageTime: 0
  }),

  Shield: (max = 0) => ({
    current: max, max, regenRate: 5, regenDelay: 3
  }),

  Resources: () => ({
    mana:   { current: 100, max: 100, regenRate: 5 },
    energy: { current: 100, max: 100, regenRate: 10 },
    rage:   { current: 0,   max: 100, decayRate: 2 }
  }),

  Collider: (radius = 0.5, height = 1.8) => ({
    type: 'capsule', radius, height,
    layer: 'default', isStatic: false
  }),

  Movement: (speed = 5) => ({
    baseSpeed: speed, sprintMultiplier: 1.5,
    isSprinting: false, isGrounded: true,
    jumpForce: 8, friction: 0.9
  }),

  WeaponState: (primary, secondary) => ({
    primary, secondary, activeSlot: 'primary',
    swapCooldown: 0, lastAttackTime: 0
  }),

  AbilityState: () => ({
    cooldowns: { Q: 0, E: 0, R: 0, F: 0, P: 0 },
    casting: null, castProgress: 0
  }),

  Projectile: (owner, damage, speed, lifetime) => ({
    ownerId: owner, damage, speed, lifetime,
    maxLifetime: lifetime, piercing: false,
    homing: false, onHit: null
  }),

  AI: (behavior = 'idle') => ({
    behavior, target: null, aggroRange: 15,
    attackRange: 2, patrolPoints: [],
    currentPatrolIndex: 0
  }),

  RenderMesh: (mesh) => ({
    mesh, visible: true, castShadow: true, receiveShadow: true
  }),

  Animator: () => ({
    mixer: null, clips: {}, currentAction: null, blendTime: 0.2
  }),

  PlayerInput: () => ({
    moveDirection: new THREE.Vector2(0, 0),
    lookDirection: new THREE.Vector3(0, 0, -1),
    mousePosition: new THREE.Vector2(0, 0),
    actions: {
      jump: false, sprint: false, attack: false,
      abilityQ: false, abilityE: false, abilityR: false,
      abilityF: false, abilityP: false, weaponSwap: false
    }
  })
};
