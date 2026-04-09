/**
 * ============================================================================
 * GRUDGE ARENA - COMPLETE GAME ENGINE
 * ============================================================================
 * 
 * This file implements a full 3D arena combat game using Three.js.
 * Each section is documented to help you learn how the code creates visuals.
 * 
 * ARCHITECTURE OVERVIEW:
 * ----------------------
 * Input → ECS World → Systems → Render
 * 
 * - INPUT: Keyboard/Mouse/Gamepad captured and stored in state
 * - ECS WORLD: Entities with Components (data) processed by Systems (logic)
 * - SYSTEMS: MovementSystem, CombatSystem, ProjectileSystem, etc.
 * - RENDER: Three.js renders the scene at 60fps
 * 
 * TECHNIQUES IMPLEMENTED:
 * -----------------------
 * 1. Chase Camera - Third-person camera following player
 * 2. Collision Detection - Raycasting for combat and environment
 * 3. Shader Materials - Custom shaders for spells (fireball, frost, etc.)
 * 4. Particle Systems - Impact effects, trails, environmental visuals
 * 5. Skybox - Surrounding environment texture
 * 6. Texture Animation - Animated materials for water, goo, spell effects
 * 7. Mouse Sprite - Custom game cursor
 * 8. Mouse Hover Effects - Highlighting interactables
 * 9. Sprites - UI elements, spell icons, indicators
 * 10. CSS3D - Health bars and tooltips in 3D space
 * 
 * ============================================================================
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================================
// SECTION 1: ENTITY-COMPONENT-SYSTEM (ECS) ARCHITECTURE
// ============================================================================
/**
 * ECS separates data (Components) from logic (Systems).
 * Entities are just IDs that hold components.
 * This makes the code modular and easy to extend.
 */

class Entity {
  static nextId = 0;
  
  constructor() {
    this.id = Entity.nextId++;
    this.components = new Map();
    this.tags = new Set();
  }
  
  addComponent(name, data) {
    this.components.set(name, data);
    return this;
  }
  
  getComponent(name) {
    return this.components.get(name);
  }
  
  hasComponent(name) {
    return this.components.has(name);
  }
  
  addTag(tag) {
    this.tags.add(tag);
    return this;
  }
  
  hasTag(tag) {
    return this.tags.has(tag);
  }
}

class World {
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
  
  removeEntity(id) {
    this.entities.delete(id);
  }
  
  getEntitiesWith(...componentNames) {
    return Array.from(this.entities.values()).filter(entity =>
      componentNames.every(name => entity.hasComponent(name))
    );
  }
  
  addSystem(system) {
    this.systems.push(system);
    system.world = this;
  }
  
  update(delta) {
    for (const system of this.systems) {
      system.update(delta);
    }
    this.eventQueue = [];
  }
  
  emit(event) {
    this.eventQueue.push(event);
  }
}

// ============================================================================
// SECTION 2: COMPONENT DEFINITIONS
// ============================================================================
/**
 * Components are pure data containers.
 * Each component represents one aspect of an entity.
 */

const Components = {
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
    current: max,
    max: max,
    regenRate: 0,
    invulnerable: false,
    lastDamageTime: 0
  }),
  
  Shield: (max = 0) => ({
    current: max,
    max: max,
    regenRate: 5,
    regenDelay: 3
  }),
  
  Resources: () => ({
    mana: { current: 100, max: 100, regenRate: 5 },
    energy: { current: 100, max: 100, regenRate: 10 },
    rage: { current: 0, max: 100, decayRate: 2 }
  }),
  
  Collider: (radius = 0.5, height = 1.8) => ({
    type: 'capsule',
    radius: radius,
    height: height,
    layer: 'default',
    isStatic: false
  }),
  
  Movement: (speed = 5) => ({
    baseSpeed: speed,
    sprintMultiplier: 1.5,
    isSprinting: false,
    isGrounded: true,
    jumpForce: 8,
    friction: 0.9
  }),
  
  WeaponState: (primary, secondary) => ({
    primary: primary,
    secondary: secondary,
    activeSlot: 'primary',
    swapCooldown: 0,
    lastAttackTime: 0
  }),
  
  AbilityState: () => ({
    cooldowns: { Q: 0, E: 0, R: 0, F: 0, P: 0 },
    casting: null,
    castProgress: 0
  }),
  
  Projectile: (owner, damage, speed, lifetime) => ({
    ownerId: owner,
    damage: damage,
    speed: speed,
    lifetime: lifetime,
    maxLifetime: lifetime,
    piercing: false,
    homing: false,
    onHit: null
  }),
  
  AI: (behavior = 'idle') => ({
    behavior: behavior,
    target: null,
    aggroRange: 15,
    attackRange: 2,
    patrolPoints: [],
    currentPatrolIndex: 0
  }),
  
  RenderMesh: (mesh) => ({
    mesh: mesh,
    visible: true,
    castShadow: true,
    receiveShadow: true
  }),
  
  Animator: () => ({
    mixer: null,
    clips: {},
    currentAction: null,
    blendTime: 0.2
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
      weaponSwap: false
    }
  })
};

// ============================================================================
// SECTION 3: WEAPON DEFINITIONS
// ============================================================================
/**
 * Each weapon class has unique abilities with different mechanics.
 * This is where game design meets code!
 */

const WeaponTypes = {
  GREATSWORD: 'greatsword',
  BOW: 'bow',
  SABRES: 'sabres',
  SCYTHE: 'scythe',
  RUNEBLADE: 'runeblade'
};

const WeaponDefinitions = {
  [WeaponTypes.GREATSWORD]: {
    name: 'Greatsword',
    title: 'IMMORTAL',
    description: 'Defensive tank with rage-powered devastation',
    primaryResource: 'rage',
    baseAttackDamage: 45,
    attackSpeed: 0.8,
    range: 2.5,
    abilities: {
      Q: {
        name: 'Fullguard',
        description: 'Block all damage for 3 seconds. Generates rage on block.',
        cooldown: 7,
        cost: 0,
        costType: null,
        duration: 3,
        effect: 'shield'
      },
      E: {
        name: 'Charge',
        description: 'Dash forward dealing damage to enemies in path.',
        cooldown: 8,
        cost: 0,
        costType: null,
        damage: 60,
        distance: 10,
        effect: 'dash'
      },
      R: {
        name: 'Colossus Smash',
        description: 'Lightning strike from above dealing massive damage.',
        cooldown: 5,
        cost: 25,
        costType: 'rage',
        damage: 120,
        aoeRadius: 4,
        effect: 'aoe_strike'
      },
      F: {
        name: 'Divine Wind',
        description: 'Throw your sword, dealing damage and pulling enemies.',
        cooldown: 1.5,
        cost: 10,
        costType: 'rage',
        damage: 40,
        range: 15,
        effect: 'projectile_pull'
      },
      P: {
        name: 'Berserker Rage',
        description: 'Ultimate: Enter rage mode, doubling damage for 8 seconds.',
        cooldown: 60,
        cost: 100,
        costType: 'rage',
        duration: 8,
        effect: 'buff_damage'
      }
    }
  },
  
  [WeaponTypes.BOW]: {
    name: 'Bow',
    title: 'VIPER',
    description: 'Ranged sniper with deadly precision',
    primaryResource: 'energy',
    baseAttackDamage: 30,
    attackSpeed: 1.2,
    range: 25,
    abilities: {
      Q: {
        name: 'Frost Bite',
        description: 'Fire 5 frost arrows that slow enemies.',
        cooldown: 5,
        cost: 50,
        costType: 'energy',
        damage: 15,
        projectileCount: 5,
        slowDuration: 3,
        effect: 'multi_projectile'
      },
      E: {
        name: 'Cobra Shot',
        description: 'Venomous arrow dealing damage over time.',
        cooldown: 2,
        cost: 60,
        costType: 'energy',
        damage: 20,
        dotDamage: 40,
        dotDuration: 4,
        effect: 'dot_projectile'
      },
      R: {
        name: 'Viper Sting',
        description: 'Piercing arrow that heals you for damage dealt.',
        cooldown: 2,
        cost: 60,
        costType: 'energy',
        damage: 50,
        healPercent: 0.5,
        effect: 'lifesteal_projectile'
      },
      F: {
        name: 'Cloudkill',
        description: 'Rain of arrows creating a poison zone.',
        cooldown: 4,
        cost: 40,
        costType: 'energy',
        damage: 10,
        tickRate: 0.5,
        duration: 5,
        radius: 5,
        effect: 'aoe_zone'
      },
      P: {
        name: 'Death Mark',
        description: 'Ultimate: Mark target for death, next hit deals triple damage.',
        cooldown: 45,
        cost: 0,
        costType: null,
        duration: 10,
        damageMultiplier: 3,
        effect: 'debuff_target'
      }
    }
  },
  
  [WeaponTypes.SABRES]: {
    name: 'Sabres',
    title: 'ASSASSIN',
    description: 'Stealth burst with deadly combos',
    primaryResource: 'energy',
    baseAttackDamage: 25,
    attackSpeed: 2.0,
    range: 1.5,
    abilities: {
      Q: {
        name: 'Shadow Step',
        description: 'Teleport behind target enemy.',
        cooldown: 6,
        cost: 40,
        costType: 'energy',
        range: 15,
        effect: 'teleport_behind'
      },
      E: {
        name: 'Blade Dance',
        description: 'Spin attack hitting all nearby enemies.',
        cooldown: 3,
        cost: 30,
        costType: 'energy',
        damage: 40,
        radius: 3,
        effect: 'aoe_melee'
      },
      R: {
        name: 'Eviscerate',
        description: 'Critical strike dealing bonus damage to low HP targets.',
        cooldown: 1,
        cost: 50,
        costType: 'energy',
        damage: 80,
        executeThreshold: 0.3,
        executeMultiplier: 2,
        effect: 'execute'
      },
      F: {
        name: 'Vanish',
        description: 'Become invisible for 3 seconds. Next attack crits.',
        cooldown: 12,
        cost: 60,
        costType: 'energy',
        duration: 3,
        effect: 'stealth'
      },
      P: {
        name: 'Shadow Dance',
        description: 'Ultimate: Reset all cooldowns and gain 50% attack speed.',
        cooldown: 90,
        cost: 0,
        costType: null,
        duration: 10,
        effect: 'reset_cooldowns'
      }
    }
  },
  
  [WeaponTypes.SCYTHE]: {
    name: 'Scythe',
    title: 'WEAVER',
    description: 'Fire and Ice caster with devastating spells',
    primaryResource: 'mana',
    baseAttackDamage: 35,
    attackSpeed: 1.0,
    range: 3,
    abilities: {
      Q: {
        name: 'Fireball',
        description: 'Launch a fireball that explodes on impact.',
        cooldown: 3,
        cost: 30,
        costType: 'mana',
        damage: 70,
        splashRadius: 3,
        effect: 'fireball'
      },
      E: {
        name: 'Frost Nova',
        description: 'Freeze all nearby enemies for 2 seconds.',
        cooldown: 8,
        cost: 50,
        costType: 'mana',
        damage: 30,
        freezeDuration: 2,
        radius: 5,
        effect: 'frost_nova'
      },
      R: {
        name: 'Meteor Strike',
        description: 'Call down a meteor at target location.',
        cooldown: 12,
        cost: 80,
        costType: 'mana',
        damage: 150,
        castTime: 1.5,
        radius: 6,
        effect: 'meteor'
      },
      F: {
        name: 'Blink',
        description: 'Instantly teleport a short distance.',
        cooldown: 4,
        cost: 20,
        costType: 'mana',
        distance: 8,
        effect: 'blink'
      },
      P: {
        name: 'Elemental Fury',
        description: 'Ultimate: Spells cast twice for 10 seconds.',
        cooldown: 60,
        cost: 100,
        costType: 'mana',
        duration: 10,
        effect: 'double_cast'
      }
    }
  },
  
  [WeaponTypes.RUNEBLADE]: {
    name: 'Runeblade',
    title: 'TEMPLAR',
    description: 'Life-steal knight with holy magic',
    primaryResource: 'mana',
    baseAttackDamage: 40,
    attackSpeed: 1.1,
    range: 2,
    abilities: {
      Q: {
        name: 'Holy Strike',
        description: 'Smite enemy, healing for damage dealt.',
        cooldown: 4,
        cost: 25,
        costType: 'mana',
        damage: 50,
        healPercent: 0.3,
        effect: 'melee_lifesteal'
      },
      E: {
        name: 'Divine Shield',
        description: 'Shield yourself and nearby allies.',
        cooldown: 10,
        cost: 60,
        costType: 'mana',
        shieldAmount: 100,
        duration: 5,
        radius: 5,
        effect: 'aoe_shield'
      },
      R: {
        name: 'Judgment',
        description: 'Holy beam dealing damage and healing allies it passes.',
        cooldown: 6,
        cost: 50,
        costType: 'mana',
        damage: 80,
        healAmount: 50,
        width: 2,
        range: 15,
        effect: 'beam'
      },
      F: {
        name: 'Consecration',
        description: 'Create holy ground that damages enemies and heals allies.',
        cooldown: 8,
        cost: 40,
        costType: 'mana',
        damagePerTick: 20,
        healPerTick: 15,
        duration: 6,
        radius: 4,
        effect: 'ground_zone'
      },
      P: {
        name: 'Divine Intervention',
        description: 'Ultimate: Become invulnerable and fully heal over 3 seconds.',
        cooldown: 120,
        cost: 0,
        costType: null,
        duration: 3,
        effect: 'full_heal_invuln'
      }
    }
  }
};

// ============================================================================
// SECTION 4: SHADER MATERIALS LIBRARY
// ============================================================================
/**
 * SHADERS EXPLAINED:
 * ------------------
 * Shaders are programs that run on the GPU to determine how pixels look.
 * - Vertex Shader: Positions each vertex in 3D space
 * - Fragment Shader: Colors each pixel
 * 
 * We use GLSL (OpenGL Shading Language) to write shaders.
 * Uniforms are values passed from JavaScript to the shader.
 */

const ShaderLibrary = {
  /**
   * FIREBALL SHADER
   * Creates a pulsing, glowing fireball effect.
   * The noise function creates organic, flame-like patterns.
   */
  fireball: {
    uniforms: {
      time: { value: 0 },
      color1: { value: new THREE.Color(0xff4400) },
      color2: { value: new THREE.Color(0xffcc00) },
      noiseScale: { value: 2.0 },
      pulseSpeed: { value: 3.0 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 color1;
      uniform vec3 color2;
      uniform float noiseScale;
      uniform float pulseSpeed;
      
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      
      // Simple noise function for organic look
      float noise(vec3 p) {
        return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453);
      }
      
      void main() {
        // Create animated noise pattern
        float n = noise(vPosition * noiseScale + time);
        
        // Pulsing effect
        float pulse = 0.5 + 0.5 * sin(time * pulseSpeed);
        
        // Mix colors based on noise and position
        float mixFactor = n * 0.5 + 0.5 * (1.0 - length(vUv - 0.5) * 2.0);
        vec3 color = mix(color1, color2, mixFactor * pulse);
        
        // Add glow at edges (fresnel effect)
        float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
        color += fresnel * 0.5;
        
        gl_FragColor = vec4(color, 1.0);
      }
    `
  },
  
  /**
   * FROST SHADER
   * Creates an icy, crystalline effect with a cool blue glow.
   */
  frost: {
    uniforms: {
      time: { value: 0 },
      color1: { value: new THREE.Color(0x88ccff) },
      color2: { value: new THREE.Color(0xffffff) },
      shimmerSpeed: { value: 2.0 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 color1;
      uniform vec3 color2;
      uniform float shimmerSpeed;
      
      varying vec2 vUv;
      varying vec3 vNormal;
      
      void main() {
        // Crystalline shimmer
        float shimmer = sin(vUv.x * 20.0 + time * shimmerSpeed) * 
                        sin(vUv.y * 20.0 + time * shimmerSpeed * 0.7);
        shimmer = shimmer * 0.5 + 0.5;
        
        // Ice color gradient
        vec3 color = mix(color1, color2, shimmer);
        
        // Fresnel for icy glow
        float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
        color += fresnel * vec3(0.5, 0.8, 1.0);
        
        // Transparency for ice effect
        float alpha = 0.7 + shimmer * 0.3;
        
        gl_FragColor = vec4(color, alpha);
      }
    `
  },
  
  /**
   * SHADOW BOLT SHADER
   * Dark energy with purple/black swirling effect.
   */
  shadowBolt: {
    uniforms: {
      time: { value: 0 },
      color1: { value: new THREE.Color(0x220033) },
      color2: { value: new THREE.Color(0x8800ff) }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPosition;
      
      void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 color1;
      uniform vec3 color2;
      
      varying vec2 vUv;
      varying vec3 vPosition;
      
      void main() {
        // Swirling dark energy
        float angle = atan(vPosition.y, vPosition.x) + time;
        float swirl = sin(angle * 5.0 + length(vPosition.xy) * 10.0 - time * 3.0);
        swirl = swirl * 0.5 + 0.5;
        
        vec3 color = mix(color1, color2, swirl);
        
        // Dark core with bright edges
        float dist = length(vUv - 0.5) * 2.0;
        color = mix(color, color2, pow(dist, 2.0));
        
        gl_FragColor = vec4(color, 1.0);
      }
    `
  },
  
  /**
   * HEAL SHADER
   * Golden/green holy light with upward particles.
   */
  heal: {
    uniforms: {
      time: { value: 0 },
      color1: { value: new THREE.Color(0x44ff44) },
      color2: { value: new THREE.Color(0xffffaa) }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 color1;
      uniform vec3 color2;
      
      varying vec2 vUv;
      varying vec3 vNormal;
      
      void main() {
        // Rising light particles
        float particles = sin(vUv.y * 30.0 + time * 5.0) * 
                         sin(vUv.x * 20.0);
        particles = smoothstep(0.7, 1.0, particles);
        
        // Base glow
        vec3 color = mix(color1, color2, vUv.y);
        color += particles * vec3(1.0, 1.0, 0.5);
        
        // Soft glow
        float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
        color += fresnel * color2;
        
        float alpha = 0.6 + particles * 0.4;
        
        gl_FragColor = vec4(color, alpha);
      }
    `
  },
  
  /**
   * ANIMATED WATER/GOO SHADER
   * For environmental effects like water, lava, poison pools.
   */
  animatedSurface: {
    uniforms: {
      time: { value: 0 },
      color1: { value: new THREE.Color(0x0044aa) },
      color2: { value: new THREE.Color(0x0088ff) },
      waveSpeed: { value: 1.0 },
      waveScale: { value: 5.0 }
    },
    vertexShader: `
      uniform float time;
      uniform float waveSpeed;
      uniform float waveScale;
      
      varying vec2 vUv;
      varying float vWave;
      
      void main() {
        vUv = uv;
        
        // Create wave displacement
        float wave = sin(position.x * waveScale + time * waveSpeed) * 
                     cos(position.z * waveScale + time * waveSpeed * 0.7) * 0.2;
        vWave = wave;
        
        vec3 pos = position;
        pos.y += wave;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 color1;
      uniform vec3 color2;
      
      varying vec2 vUv;
      varying float vWave;
      
      void main() {
        // Animated ripples
        float ripple = sin(vUv.x * 20.0 + time) * sin(vUv.y * 20.0 + time * 0.8);
        ripple = ripple * 0.5 + 0.5;
        
        // Mix colors based on wave height and ripples
        vec3 color = mix(color1, color2, vWave * 2.0 + 0.5 + ripple * 0.3);
        
        // Add specular highlight
        float spec = pow(ripple, 4.0) * 0.5;
        color += vec3(spec);
        
        gl_FragColor = vec4(color, 0.8);
      }
    `
  },
  
  /**
   * GROUND SHADER
   * Creates a subtle grid pattern for the arena floor.
   */
  arenaGround: {
    uniforms: {
      time: { value: 0 },
      colorA: { value: new THREE.Color(0x1a1a2e) },
      colorB: { value: new THREE.Color(0x16213e) },
      gridColor: { value: new THREE.Color(0x3366ff) },
      gridOpacity: { value: 0.15 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPosition;
      
      void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec3 colorA;
      uniform vec3 colorB;
      uniform vec3 gridColor;
      uniform float gridOpacity;
      
      varying vec2 vUv;
      varying vec3 vPosition;
      
      void main() {
        // Radial gradient from center
        float dist = length(vPosition.xz) / 30.0;
        vec3 color = mix(colorA, colorB, dist);
        
        // Grid pattern
        float gridX = step(0.95, mod(vPosition.x, 2.0) / 2.0) + 
                      step(mod(vPosition.x, 2.0) / 2.0, 0.05);
        float gridZ = step(0.95, mod(vPosition.z, 2.0) / 2.0) + 
                      step(mod(vPosition.z, 2.0) / 2.0, 0.05);
        float grid = max(gridX, gridZ);
        
        // Pulsing grid
        float pulse = 0.5 + 0.5 * sin(time * 0.5);
        color = mix(color, gridColor, grid * gridOpacity * pulse);
        
        gl_FragColor = vec4(color, 1.0);
      }
    `
  }
};

// Helper function to create shader material
function createShaderMaterial(shaderName) {
  const shader = ShaderLibrary[shaderName];
  if (!shader) {
    console.error(`Shader not found: ${shaderName}`);
    return new THREE.MeshBasicMaterial({ color: 0xff00ff });
  }
  
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(shader.uniforms),
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    transparent: true,
    side: THREE.DoubleSide
  });
}

// ============================================================================
// SECTION 5: PARTICLE SYSTEM
// ============================================================================
/**
 * PARTICLES EXPLAINED:
 * --------------------
 * Particles create effects like sparks, smoke, magic trails, explosions.
 * Each particle is a small sprite/point that moves independently.
 * We use instanced rendering for performance.
 */

class ParticleSystem {
  constructor(scene, config = {}) {
    this.scene = scene;
    this.particles = [];
    this.maxParticles = config.maxParticles || 1000;
    
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);
    this.alphas = new Float32Array(this.maxParticles);
    
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    
    this.material = new THREE.PointsMaterial({
      size: 0.2,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    
    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);
    this.activeCount = 0;
  }
  
  emit(config) {
    const count = config.count || 10;
    const position = config.position || new THREE.Vector3();
    const color = config.color || new THREE.Color(0xffffff);
    const velocity = config.velocity || new THREE.Vector3(0, 1, 0);
    const spread = config.spread || 1;
    const lifetime = config.lifetime || 1;
    const size = config.size || 0.2;
    
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      
      const particle = {
        position: position.clone(),
        velocity: new THREE.Vector3(
          velocity.x + (Math.random() - 0.5) * spread,
          velocity.y + (Math.random() - 0.5) * spread,
          velocity.z + (Math.random() - 0.5) * spread
        ),
        color: color.clone(),
        size: size * (0.5 + Math.random() * 0.5),
        lifetime: lifetime * (0.5 + Math.random() * 0.5),
        maxLifetime: lifetime,
        gravity: config.gravity || 0,
        drag: config.drag || 0
      };
      
      this.particles.push(particle);
    }
  }
  
  update(delta) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      
      p.lifetime -= delta;
      if (p.lifetime <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      
      p.velocity.y -= p.gravity * delta;
      p.velocity.multiplyScalar(1 - p.drag * delta);
      p.position.add(p.velocity.clone().multiplyScalar(delta));
    }
    
    for (let i = 0; i < this.maxParticles; i++) {
      if (i < this.particles.length) {
        const p = this.particles[i];
        this.positions[i * 3] = p.position.x;
        this.positions[i * 3 + 1] = p.position.y;
        this.positions[i * 3 + 2] = p.position.z;
        
        const lifeRatio = p.lifetime / p.maxLifetime;
        this.colors[i * 3] = p.color.r * lifeRatio;
        this.colors[i * 3 + 1] = p.color.g * lifeRatio;
        this.colors[i * 3 + 2] = p.color.b * lifeRatio;
        
        this.sizes[i] = p.size * lifeRatio;
      } else {
        this.positions[i * 3] = 0;
        this.positions[i * 3 + 1] = -1000;
        this.positions[i * 3 + 2] = 0;
        this.sizes[i] = 0;
      }
    }
    
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
  }
  
  emitExplosion(position, color, count = 50) {
    this.emit({
      position,
      color,
      count,
      velocity: new THREE.Vector3(0, 2, 0),
      spread: 5,
      lifetime: 1,
      size: 0.3,
      gravity: 5,
      drag: 2
    });
  }
  
  emitTrail(position, color) {
    this.emit({
      position,
      color,
      count: 3,
      velocity: new THREE.Vector3(0, 0.5, 0),
      spread: 0.5,
      lifetime: 0.5,
      size: 0.15,
      drag: 5
    });
  }
  
  emitHeal(position) {
    this.emit({
      position: position.clone(),
      color: new THREE.Color(0x44ff44),
      count: 20,
      velocity: new THREE.Vector3(0, 3, 0),
      spread: 1,
      lifetime: 1.5,
      size: 0.25,
      gravity: -2
    });
  }
}

// ============================================================================
// SECTION 6: COLLISION SYSTEM
// ============================================================================
/**
 * COLLISION DETECTION EXPLAINED:
 * ------------------------------
 * We use raycasting to detect when objects intersect.
 * A ray is cast from the object's center in the direction of movement.
 * If it hits something, we know there's a collision.
 */

class CollisionSystem {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.colliders = [];
    this.layers = {
      player: 1,
      enemy: 2,
      projectile: 4,
      environment: 8,
      interactable: 16
    };
  }
  
  addCollider(mesh, layer = 'environment', data = {}) {
    this.colliders.push({
      mesh,
      layer: this.layers[layer] || this.layers.environment,
      data
    });
  }
  
  removeCollider(mesh) {
    const index = this.colliders.findIndex(c => c.mesh === mesh);
    if (index !== -1) {
      this.colliders.splice(index, 1);
    }
  }
  
  checkCollision(origin, direction, maxDistance = 100, layerMask = 0xFFFF) {
    this.raycaster.set(origin, direction.normalize());
    this.raycaster.far = maxDistance;
    
    const meshes = this.colliders
      .filter(c => (c.layer & layerMask) !== 0)
      .map(c => c.mesh);
    
    const intersects = this.raycaster.intersectObjects(meshes, true);
    
    if (intersects.length > 0) {
      const hit = intersects[0];
      const collider = this.colliders.find(c => 
        c.mesh === hit.object || c.mesh.children?.includes(hit.object)
      );
      
      return {
        hit: true,
        point: hit.point,
        distance: hit.distance,
        normal: hit.face?.normal || new THREE.Vector3(0, 1, 0),
        object: hit.object,
        data: collider?.data || {}
      };
    }
    
    return { hit: false };
  }
  
  checkSphereCollision(position, radius, layerMask = 0xFFFF) {
    const directions = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0)
    ];
    
    const results = [];
    
    for (const dir of directions) {
      const result = this.checkCollision(position, dir, radius, layerMask);
      if (result.hit) {
        results.push(result);
      }
    }
    
    return results;
  }
  
  resolveCollision(entity, collisions) {
    const transform = entity.getComponent('Transform');
    if (!transform) return;
    
    for (const collision of collisions) {
      const pushDirection = transform.position.clone().sub(collision.point).normalize();
      const pushDistance = collision.distance;
      transform.position.add(pushDirection.multiplyScalar(pushDistance * 0.5));
    }
  }
}

// ============================================================================
// SECTION 7: CHASE CAMERA
// ============================================================================
/**
 * CHASE CAMERA EXPLAINED:
 * -----------------------
 * The camera follows behind the player at a fixed distance.
 * We use lerp (linear interpolation) for smooth movement.
 * The camera can be offset to show more of what's ahead.
 */

class ChaseCamera {
  constructor(camera, target = null) {
    this.camera = camera;
    this.target = target;
    
    // Over-shoulder third person — tuned for ~1.8-unit tall characters
    this.distance = 6;
    this.height = 4;
    this.lookAtHeight = 1.2;
    
    this.smoothSpeed = 5;
    
    this.currentPosition = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
    
    this.offsetAngle = 0;
    this._initialized = false;
  }
  
  setTarget(target) {
    this.target = target;
    this._initialized = false;
  }
  
  update(delta) {
    if (!this.target) return;
    
    const targetPos = this.target.position.clone();
    
    // Camera behind and above the player
    const angle = this.target.rotation?.y || 0;
    const desiredPosition = new THREE.Vector3(
      targetPos.x - Math.sin(angle) * this.distance,
      targetPos.y + this.height,
      targetPos.z - Math.cos(angle) * this.distance
    );
    
    const desiredLookAt = new THREE.Vector3(
      targetPos.x,
      targetPos.y + this.lookAtHeight,
      targetPos.z
    );
    
    // Snap on first frame, lerp after
    if (!this._initialized) {
      this.currentPosition.copy(desiredPosition);
      this.currentLookAt.copy(desiredLookAt);
      this._initialized = true;
    } else {
      this.currentPosition.lerp(desiredPosition, this.smoothSpeed * delta);
      this.currentLookAt.lerp(desiredLookAt, this.smoothSpeed * delta);
    }
    
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }
}

// ============================================================================
// SECTION 8: MOUSE SYSTEMS
// ============================================================================
/**
 * MOUSE SYSTEMS EXPLAINED:
 * ------------------------
 * - Mouse Sprite: Custom cursor that follows mouse
 * - Mouse Over: Detect what the mouse is hovering
 * - Tooltips: Show info when hovering objects
 */

class MouseSystem {
  constructor(camera, scene, renderer) {
    this.camera = camera;
    this.scene = scene;
    this.renderer = renderer;
    
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    
    this.hoverTarget = null;
    this.hoverCallbacks = new Map();
    
    this.cursorSprite = null;
    this.tooltip = null;
    
    this.setupEventListeners();
    this.createCursor();
    this.createTooltip();
  }
  
  setupEventListeners() {
    const canvas = this.renderer.domElement;
    
    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      if (this.cursorSprite) {
        this.cursorSprite.style.left = event.clientX + 'px';
        this.cursorSprite.style.top = event.clientY + 'px';
      }
    });
  }
  
  createCursor() {
    this.cursorSprite = document.createElement('div');
    this.cursorSprite.id = 'customCursor';
    this.cursorSprite.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="12" fill="none" stroke="#4488ff" stroke-width="2"/>
        <circle cx="16" cy="16" r="4" fill="#4488ff"/>
        <line x1="16" y1="0" x2="16" y2="8" stroke="#4488ff" stroke-width="2"/>
        <line x1="16" y1="24" x2="16" y2="32" stroke="#4488ff" stroke-width="2"/>
        <line x1="0" y1="16" x2="8" y2="16" stroke="#4488ff" stroke-width="2"/>
        <line x1="24" y1="16" x2="32" y2="16" stroke="#4488ff" stroke-width="2"/>
      </svg>
    `;
    this.cursorSprite.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 10000;
      transform: translate(-50%, -50%);
      transition: transform 0.1s ease;
    `;
    document.body.appendChild(this.cursorSprite);
    document.body.style.cursor = 'none';
  }
  
  createTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'tooltip';
    this.tooltip.style.cssText = `
      position: fixed;
      background: rgba(20, 20, 40, 0.95);
      border: 1px solid #4488ff;
      border-radius: 8px;
      padding: 10px 15px;
      color: white;
      font-size: 14px;
      pointer-events: none;
      z-index: 9999;
      display: none;
      max-width: 300px;
    `;
    document.body.appendChild(this.tooltip);
  }
  
  registerHoverable(mesh, data) {
    this.hoverCallbacks.set(mesh, data);
  }
  
  showTooltip(x, y, content) {
    this.tooltip.innerHTML = content;
    this.tooltip.style.left = (x + 20) + 'px';
    this.tooltip.style.top = (y + 20) + 'px';
    this.tooltip.style.display = 'block';
  }
  
  hideTooltip() {
    this.tooltip.style.display = 'none';
  }
  
  setCursorStyle(style) {
    if (!this.cursorSprite) return;
    
    switch (style) {
      case 'attack':
        this.cursorSprite.querySelector('circle').setAttribute('stroke', '#ff4444');
        this.cursorSprite.querySelector('circle:nth-child(2)').setAttribute('fill', '#ff4444');
        break;
      case 'interact':
        this.cursorSprite.querySelector('circle').setAttribute('stroke', '#44ff44');
        this.cursorSprite.querySelector('circle:nth-child(2)').setAttribute('fill', '#44ff44');
        break;
      default:
        this.cursorSprite.querySelector('circle').setAttribute('stroke', '#4488ff');
        this.cursorSprite.querySelector('circle:nth-child(2)').setAttribute('fill', '#4488ff');
    }
  }
  
  update() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const hoverables = Array.from(this.hoverCallbacks.keys());
    const intersects = this.raycaster.intersectObjects(hoverables, true);
    
    if (intersects.length > 0) {
      const hitObject = intersects[0].object;
      let target = hitObject;
      
      while (target && !this.hoverCallbacks.has(target)) {
        target = target.parent;
      }
      
      if (target && this.hoverCallbacks.has(target)) {
        if (this.hoverTarget !== target) {
          if (this.hoverTarget) {
            this.onHoverEnd(this.hoverTarget);
          }
          this.hoverTarget = target;
          this.onHoverStart(target);
        }
      }
    } else {
      if (this.hoverTarget) {
        this.onHoverEnd(this.hoverTarget);
        this.hoverTarget = null;
      }
    }
  }
  
  onHoverStart(target) {
    const data = this.hoverCallbacks.get(target);
    if (!data) return;
    
    if (data.highlight) {
      target.traverse((child) => {
        if (child.isMesh && child.material) {
          child.userData.originalEmissive = child.material.emissive?.clone();
          if (child.material.emissive) {
            child.material.emissive.set(0x4488ff);
            child.material.emissiveIntensity = 0.3;
          }
        }
      });
    }
    
    if (data.cursorStyle) {
      this.setCursorStyle(data.cursorStyle);
    }
  }
  
  onHoverEnd(target) {
    target.traverse((child) => {
      if (child.isMesh && child.material && child.userData.originalEmissive) {
        child.material.emissive.copy(child.userData.originalEmissive);
        child.material.emissiveIntensity = 0;
      }
    });
    
    this.setCursorStyle('default');
    this.hideTooltip();
  }
  
  getWorldPosition() {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.raycaster.ray.intersectPlane(plane, target);
    return target;
  }
}

// ============================================================================
// SECTION 9: SPRITE SYSTEM
// ============================================================================
/**
 * SPRITES EXPLAINED:
 * ------------------
 * Sprites are 2D images that always face the camera.
 * Great for UI elements, indicators, icons in 3D space.
 */

class SpriteSystem {
  constructor(scene) {
    this.scene = scene;
    this.sprites = [];
  }
  
  createSprite(config) {
    const {
      texture = null,
      color = 0xffffff,
      position = new THREE.Vector3(),
      scale = 1,
      opacity = 1
    } = config;
    
    let material;
    if (texture) {
      material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity
      });
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.beginPath();
      ctx.arc(32, 32, 28, 0, Math.PI * 2);
      ctx.fill();
      
      const canvasTexture = new THREE.CanvasTexture(canvas);
      material = new THREE.SpriteMaterial({
        map: canvasTexture,
        transparent: true,
        opacity
      });
    }
    
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(scale, scale, 1);
    
    this.scene.add(sprite);
    this.sprites.push(sprite);
    
    return sprite;
  }
  
  createTextSprite(text, config = {}) {
    const {
      fontSize = 24,
      color = '#ffffff',
      backgroundColor = 'rgba(0,0,0,0.7)',
      position = new THREE.Vector3(),
      scale = 1
    } = config;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    ctx.font = `${fontSize}px Arial`;
    const metrics = ctx.measureText(text);
    
    canvas.width = Math.ceil(metrics.width) + 20;
    canvas.height = fontSize + 20;
    
    ctx.fillStyle = backgroundColor;
    ctx.roundRect(0, 0, canvas.width, canvas.height, 8);
    ctx.fill();
    
    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    
    const aspectRatio = canvas.width / canvas.height;
    sprite.scale.set(scale * aspectRatio, scale, 1);
    
    this.scene.add(sprite);
    this.sprites.push(sprite);
    
    return sprite;
  }
  
  createDamageNumber(damage, position, isCrit = false) {
    const color = isCrit ? '#ffcc00' : '#ffffff';
    const size = isCrit ? 1.5 : 1;
    
    const sprite = this.createTextSprite(Math.round(damage).toString(), {
      color,
      backgroundColor: 'transparent',
      position: position.clone().add(new THREE.Vector3(0, 1, 0)),
      scale: size
    });
    
    sprite.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      3,
      (Math.random() - 0.5) * 2
    );
    sprite.userData.lifetime = 1;
    sprite.userData.isTemporary = true;
    
    return sprite;
  }
  
  update(delta) {
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const sprite = this.sprites[i];
      
      if (sprite.userData.isTemporary) {
        sprite.userData.lifetime -= delta;
        
        if (sprite.userData.lifetime <= 0) {
          this.scene.remove(sprite);
          this.sprites.splice(i, 1);
          continue;
        }
        
        if (sprite.userData.velocity) {
          sprite.position.add(sprite.userData.velocity.clone().multiplyScalar(delta));
          sprite.userData.velocity.y -= 5 * delta;
        }
        
        sprite.material.opacity = sprite.userData.lifetime;
      }
    }
  }
}

// ============================================================================
// SECTION 10: SKYBOX
// ============================================================================
/**
 * SKYBOX EXPLAINED:
 * -----------------
 * A skybox is a large cube with textures on the inside.
 * It surrounds the entire scene to create the illusion of a sky/environment.
 * We use CubeTexture for 6 separate images (top, bottom, left, right, front, back).
 */

function createSkybox(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  const gradient = ctx.createRadialGradient(256, 512, 0, 256, 256, 512);
  gradient.addColorStop(0, '#1a0033');
  gradient.addColorStop(0.5, '#0a0020');
  gradient.addColorStop(1, '#000010');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);
  
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = Math.random() * 2;
    const opacity = Math.random() * 0.8 + 0.2;
    
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
    ctx.fill();
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  
  const geometry = new THREE.SphereGeometry(200, 32, 32);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide
  });
  
  const skybox = new THREE.Mesh(geometry, material);
  scene.add(skybox);
  
  return skybox;
}

// ============================================================================
// SECTION 11: MAIN GAME CLASS
// ============================================================================

/** Static spawn helpers (duplicated from arenaMatch.js for fallback use) */
const ArenaMatchStatic = {
  getSpawnPosition(teamId, slot, teamSize) {
    const xSign = teamId === 'A' ? -1 : 1;
    const baseX = 15 * xSign;
    const spacing = 4;
    const zOffset = (slot - (teamSize - 1) / 2) * spacing;
    return new THREE.Vector3(baseX, 0, zOffset);
  },
  getSpawnFacing(teamId) {
    return teamId === 'A' ? Math.PI / 2 : -Math.PI / 2;
  },
};

class GrudgeArena {
  constructor(config = {}) {
    this.config = config;
    this.container = config.container || document.getElementById('game-root') || document.getElementById('root') || document.body;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();
    
    this.world = new World();
    this.collisionSystem = new CollisionSystem();
    this.particleSystem = null;
    this.spriteSystem = null;
    this.chaseCamera = null;
    
    // Arena systems (imported dynamically to keep game.js working even if modules fail)
    this.match = null;
    this.targeting = null;
    this.arenaAI = null;
    
    this.playerEntity = null;
    this.playerUnit = null; // { entity, mesh, controller, team, isPlayer, weaponDef }
    this.allUnits = [];     // all arena units (both teams)
    this.inputState = this.createInputState();
    
    this.projectiles = [];
  }
  
  createInputState() {
    return {
      keys: { w: false, a: false, s: false, d: false, shift: false, space: false, ctrl: false, alt: false },
      mouse: { x: 0, y: 0, leftButton: false, rightButton: false },
      abilities: { 1: false, 2: false, 3: false, 4: false, 5: false },
      weaponSlot: 1
    };
  }
  
  async init(config) {
    if (config) {
      Object.assign(this.config, config);
      if (config.container) this.container = config.container;
    }
    this.setupRenderer();
    this.setupScene();
    this.setupLighting();
    this.setupInput();
    
    this.particleSystem = new ParticleSystem(this.scene);
    this.spriteSystem = new SpriteSystem(this.scene);
    
    this.createFallbackArena();
    createSkybox(this.scene);
    
    // Load arena systems
    try {
      const [matchMod, targetMod, aiMod, modelMod] = await Promise.all([
        import('./src/arenaMatch.js'),
        import('./src/targetSystem.js'),
        import('./src/arenaAI.js'),
        import('./src/modelLoader.js'),
      ]);
      
      this.match = new matchMod.ArenaMatch();
      this.arenaAI = new aiMod.ArenaAI();
      
      // Default 3v3 composition
      const race = this.config.race || 'human';
      const TEAM_A_COMP = [
        { race, weapon: 'greatsword', isPlayer: true },
        { race: 'elf', weapon: 'bow', isPlayer: false },
        { race: 'undead', weapon: 'scythe', isPlayer: false },
      ];
      const TEAM_B_COMP = [
        { race: 'orc', weapon: 'greatsword', isPlayer: false },
        { race: 'barbarian', weapon: 'sabres', isPlayer: false },
        { race: 'dwarf', weapon: 'runeblade', isPlayer: false },
      ];
      
      // Load all units in parallel
      const teamAUnits = await Promise.all(
        TEAM_A_COMP.map((comp, i) => this._createArenaUnit(comp, 'A', i, TEAM_A_COMP.length, modelMod))
      );
      const teamBUnits = await Promise.all(
        TEAM_B_COMP.map((comp, i) => this._createArenaUnit(comp, 'B', i, TEAM_B_COMP.length, modelMod))
      );
      
      this.allUnits = [...teamAUnits, ...teamBUnits];
      this.playerUnit = this.allUnits.find(u => u.isPlayer);
      this.playerEntity = this.playerUnit?.entity;
      
      // Setup targeting (after renderer is ready)
      this.targeting = new targetMod.TargetSystem(this.camera, this.scene, this.renderer);
      for (const u of this.allUnits) this.targeting.register(u);
      
      // Register AI units (all non-player units)
      for (const u of this.allUnits) {
        if (!u.isPlayer) this.arenaAI.register(u);
      }
      
      // Setup match teams
      this.match.registerTeams(teamAUnits, teamBUnits);
      
      // Chase camera on player
      if (this.playerUnit) {
        this.chaseCamera = new ChaseCamera(this.camera, this.playerUnit.mesh);
      }
      
      // Show UI and start match
      const gameUI = document.getElementById('gameUI');
      if (gameUI) gameUI.style.display = 'block';
      
      this.match.start();
      console.log('[arena] 3v3 Arena loaded — race:', race);
    } catch (err) {
      console.error('[arena] Failed to load arena systems, falling back:', err);
      this._createFallbackPlayer();
    }
    
    this.animate();
    console.log('[arena] Controls: WASD move, Shift sprint, Tab target, Q/E/R/F abilities, Click attack');
  }
  
  setupRenderer() {
    // Use an existing <canvas> if present, otherwise create one
    const existingCanvas = this.container.querySelector('canvas');
    const opts = { antialias: true, alpha: false, powerPreference: 'high-performance' };
    if (existingCanvas) opts.canvas = existingCanvas;

    this.renderer = new THREE.WebGLRenderer(opts);
    this.renderer.setSize(this.container.clientWidth || window.innerWidth, this.container.clientHeight || window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    if (!existingCanvas) {
      this.renderer.domElement.style.display = 'block';
      this.container.appendChild(this.renderer.domElement);
    }
    
    window.addEventListener('resize', () => {
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }
  
  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);
    this.scene.fog = new THREE.Fog(0x0a0a0f, 50, 150);
    
    // Camera: 50 FOV, positioned for ~1.8-unit tall characters at ±15 unit spawns
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 500);
    this.camera.position.set(0, 8, 12);
    this.camera.lookAt(0, 1, 0);
  }
  
  setupLighting() {
    // Brighter ambient for character visibility
    const ambient = new THREE.AmbientLight(0xb0c4de, 0.6);
    this.scene.add(ambient);
    
    // Hemisphere light for natural sky/ground fill
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x362d1e, 0.4);
    this.scene.add(hemi);
    
    // Main directional (sun) with shadows
    const directional = new THREE.DirectionalLight(0xfff5e1, 1.2);
    directional.position.set(10, 20, 10);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 2048;
    directional.shadow.mapSize.height = 2048;
    directional.shadow.camera.near = 0.5;
    directional.shadow.camera.far = 80;
    directional.shadow.camera.left = -40;
    directional.shadow.camera.right = 40;
    directional.shadow.camera.top = 40;
    directional.shadow.camera.bottom = -40;
    directional.shadow.bias = -0.001;
    this.scene.add(directional);
    
    // Rim/back light for character edge definition
    const rimLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    rimLight.position.set(-10, 15, -15);
    this.scene.add(rimLight);
    
    const warmFill = new THREE.PointLight(0xff8844, 0.3, 40);
    warmFill.position.set(15, 8, 15);
    this.scene.add(warmFill);
  }
  
  /**
   * Keybindings:
   *   WASD     = move
   *   Shift    = sprint
   *   Ctrl     = roll (dodge forward)
   *   Alt      = dodge backward
   *   1-5      = skills (weapon abilities)
   *   E,R,F    = skills 3,4,5 (alternates)
   *   LMB      = select target (handled by TargetSystem click)
   *   RMB      = normal attack
   *   Wheel    = zoom camera in/out
   *   Tab      = cycle enemy targets
   *   Shift+Tab= cycle ally targets
   *   F1/F2/F3 = self/ally1/ally2
   *   Esc      = deselect
   */
  setupInput() {
    // Skill key → ability slot mapping
    const SKILL_MAP = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, 'e': 2, 'r': 3, 'f': 4 };
    const ABILITY_KEYS = ['Q', 'E', 'R', 'F', 'P']; // internal ability keys on weapon defs

    // Keys that are skill alternates — don't process as movement
    const SKILL_KEYS_SET = new Set(['e', 'r', 'f', '1', '2', '3', '4', '5']);
    
    document.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      
      // Movement keys (WASD only — exclude skill alternate keys)
      if (['w','a','s','d'].includes(key)) this.inputState.keys[key] = true;
      if (e.key === 'Shift') this.inputState.keys.shift = true;
      if (e.key === 'Control') this.inputState.keys.ctrl = true;
      if (e.key === 'Alt') { this.inputState.keys.alt = true; e.preventDefault(); }
      if (key === ' ') this.inputState.keys.space = true;
      
      // Skill keys: 1-5 and E/R/F alternates
      if (key in SKILL_MAP) {
        e.preventDefault();
        const slot = SKILL_MAP[key];
        const abilityKey = ABILITY_KEYS[slot];
        if (abilityKey) this.useAbility(abilityKey);
      }
      
      // Ctrl = roll forward
      if (e.key === 'Control' && !e.repeat) this.performRoll(1);
      // Alt = dodge backward
      if (e.key === 'Alt' && !e.repeat) this.performRoll(-1);
    });
    
    document.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (['w','a','s','d'].includes(key)) this.inputState.keys[key] = false;
      if (e.key === 'Shift') this.inputState.keys.shift = false;
      if (e.key === 'Control') this.inputState.keys.ctrl = false;
      if (e.key === 'Alt') this.inputState.keys.alt = false;
      if (key === ' ') this.inputState.keys.space = false;
    });
    
    // RMB = normal attack, LMB = select (target system handles LMB click)
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.inputState.mouse.leftButton = true;
      if (e.button === 2) {
        this.inputState.mouse.rightButton = true;
        this.performAttack();
      }
    });
    
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.inputState.mouse.leftButton = false;
      if (e.button === 2) this.inputState.mouse.rightButton = false;
    });
    
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Mouse wheel = zoom camera
    document.addEventListener('wheel', (e) => {
      if (this.chaseCamera) {
        this.chaseCamera.distance += e.deltaY * 0.005;
        this.chaseCamera.distance = Math.max(3, Math.min(15, this.chaseCamera.distance));
      }
    }, { passive: true });
  }
  
  /** Roll/dodge: direction = 1 (forward) or -1 (backward) */
  performRoll(direction) {
    if (!this.playerUnit || this.playerEntity?.hasTag('dead')) return;
    const mesh = this.playerUnit.mesh;
    const controller = this.playerUnit.controller;
    if (!mesh) return;
    
    // Play dodge/roll animation
    const animName = controller?.actions.has('dodge') ? 'dodge' : 'jump';
    if (controller) controller.playOnce(animName, 1.5);
    
    // Dash in facing direction * direction
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(mesh.quaternion);
    const dashDist = 5 * direction;
    mesh.position.addScaledVector(forward, dashDist);
    
    // Clamp to arena
    const limit = 35;
    mesh.position.x = Math.max(-limit, Math.min(limit, mesh.position.x));
    mesh.position.z = Math.max(-limit, Math.min(limit, mesh.position.z));
  }
  
  createFallbackArena() {
    const groundMaterial = createShaderMaterial('arenaGround');
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80, 32, 32),
      groundMaterial
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.collisionSystem.addCollider(ground, 'environment');
    
    // Arena boundary ring
    const ringGeo = new THREE.RingGeometry(38, 40, 64);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xc9a84c, emissive: 0x8b6914, emissiveIntensity: 0.3, metalness: 0.8, roughness: 0.3 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.scene.add(ring);
    
    // Team spawn markers
    for (const teamId of ['A', 'B']) {
      for (let i = 0; i < 3; i++) {
        const pos = ArenaMatchStatic.getSpawnPosition(teamId, i, 3);
        const markerGeo = new THREE.RingGeometry(0.8, 1.0, 32);
        const markerMat = new THREE.MeshBasicMaterial({
          color: teamId === 'A' ? 0x3366ff : 0xff3333,
          transparent: true, opacity: 0.4, side: THREE.DoubleSide
        });
        const marker = new THREE.Mesh(markerGeo, markerMat);
        marker.rotation.x = -Math.PI / 2;
        marker.position.copy(pos);
        marker.position.y = 0.02;
        this.scene.add(marker);
      }
    }
    
    // Pillars at arena edges
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const pillar = this.createPillar();
      pillar.position.set(Math.cos(angle) * 35, 0, Math.sin(angle) * 35);
      this.scene.add(pillar);
    }
  }
  
  createPillar() {
    const group = new THREE.Group();
    
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1, 4, 8),
      new THREE.MeshStandardMaterial({
        color: 0x2a2a4e,
        metalness: 0.6,
        roughness: 0.4,
        emissive: 0x3366ff,
        emissiveIntensity: 0.1
      })
    );
    column.position.y = 2;
    column.castShadow = true;
    group.add(column);
    
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.4, 16, 16),
      createShaderMaterial('frost')
    );
    orb.position.y = 4.2;
    group.add(orb);
    
    const light = new THREE.PointLight(0x4488ff, 1, 8, 2);
    light.position.y = 4.5;
    group.add(light);
    
    return group;
  }
  
  /** Create a GLB-based arena unit (player or AI) */
  async _createArenaUnit(comp, teamId, slot, teamSize, modelMod) {
    const spawnPos = ArenaMatchStatic.getSpawnPosition(teamId, slot, teamSize);
    const facing = ArenaMatchStatic.getSpawnFacing(teamId);
    const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `unit_${teamId}_${slot}_${Date.now()}`;
    
    const weaponDef = WeaponDefinitions[comp.weapon] || WeaponDefinitions[WeaponTypes.GREATSWORD];
    
    // Load GLB model + weapon animations
    const { scene: mesh, mixer, controller } = await modelMod.createAnimatedUnit(comp.race, comp.weapon);
    mesh.position.copy(spawnPos);
    mesh.rotation.y = facing;
    this.scene.add(mesh);
    
    // Create ECS entity
    const entity = this.world.createEntity()
      .addComponent('Transform', Components.Transform(spawnPos.x, 0, spawnPos.z))
      .addComponent('Velocity', Components.Velocity())
      .addComponent('Health', Components.Health(1000))
      .addComponent('Shield', Components.Shield(200))
      .addComponent('Resources', Components.Resources())
      .addComponent('Collider', Components.Collider(0.5, 1.8))
      .addComponent('Movement', Components.Movement(5))
      .addComponent('WeaponState', Components.WeaponState(comp.weapon, comp.weapon))
      .addComponent('AbilityState', Components.AbilityState())
      .addComponent('RenderMesh', Components.RenderMesh(mesh))
      .addComponent('TargetInfo', {
        displayName: `${comp.race.charAt(0).toUpperCase() + comp.race.slice(1)} ${weaponDef.title || ''}`.trim(),
        race: comp.race,
        weaponType: comp.weapon,
        team: teamId,
      });
    
    if (comp.isPlayer) entity.addTag('player');
    if (teamId === 'A') entity.addTag('teamA');
    else entity.addTag('teamB');
    
    // Register mesh for collision detection
    this.collisionSystem.addCollider(mesh, teamId === 'A' ? 'ally' : 'enemy', { entity, uuid });
    
    return {
      entity,
      mesh,
      mixer,
      controller,
      team: teamId,
      isPlayer: !!comp.isPlayer,
      weaponDef,
      race: comp.race,
      uuid,
    };
  }
  
  /** Fallback: create a capsule player if GLB loading fails */
  _createFallbackPlayer() {
    const player = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 1, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0x3366ff, metalness: 0.3, roughness: 0.7, emissive: 0x3366ff, emissiveIntensity: 0.1 })
    );
    body.position.y = 1;
    body.castShadow = true;
    player.add(body);
    this.scene.add(player);
    
    this.playerEntity = this.world.createEntity()
      .addComponent('Transform', Components.Transform(0, 0, 0))
      .addComponent('Velocity', Components.Velocity())
      .addComponent('Health', Components.Health(1000))
      .addComponent('Resources', Components.Resources())
      .addComponent('Movement', Components.Movement(5))
      .addComponent('WeaponState', Components.WeaponState(WeaponTypes.GREATSWORD, WeaponTypes.BOW))
      .addComponent('AbilityState', Components.AbilityState())
      .addComponent('RenderMesh', Components.RenderMesh(player))
      .addTag('player');
    
    this.playerUnit = { entity: this.playerEntity, mesh: player, controller: null, team: 'A', isPlayer: true, weaponDef: WeaponDefinitions[WeaponTypes.GREATSWORD] };
    this.allUnits = [this.playerUnit];
    this.chaseCamera = new ChaseCamera(this.camera, player);
    
    const gameUI = document.getElementById('gameUI');
    if (gameUI) gameUI.style.display = 'block';
  }
  
  switchWeapon(slot) {
    const weaponState = this.playerEntity.getComponent('WeaponState');
    weaponState.activeSlot = slot === 1 ? 'primary' : 'secondary';
    this.updateWeaponUI();
  }
  
  getCurrentWeapon() {
    const weaponState = this.playerEntity.getComponent('WeaponState');
    const weaponType = weaponState.activeSlot === 'primary' ? weaponState.primary : weaponState.secondary;
    return WeaponDefinitions[weaponType];
  }
  
  useAbility(key) {
    if (!this.playerUnit || !this.playerEntity) return;
    const weapon = this.getCurrentWeapon();
    if (!weapon) return;
    const ability = weapon.abilities[key];
    if (!ability) return;
    
    const abilityState = this.playerEntity.getComponent('AbilityState');
    if (!abilityState) return;
    if (abilityState.cooldowns[key] > 0) return; // On cooldown
    
    const resources = this.playerEntity.getComponent('Resources');
    if (ability.cost && ability.costType && resources) {
      const resource = resources[ability.costType];
      if (resource && resource.current < ability.cost) return; // Not enough resource
      if (resource) resource.current -= ability.cost;
    }
    
    abilityState.cooldowns[key] = ability.cooldown;
    
    // Play skill animation based on ability effect
    const controller = this.playerUnit.controller;
    if (controller) {
      const skillAnim = this._getSkillAnim(ability.effect);
      controller.playOnce(skillAnim, 1.0);
    }
    
    this.executeAbility(ability, key);
    this.updateUI();
  }
  
  /** Map ability effect type → animation state */
  _getSkillAnim(effect) {
    switch (effect) {
      case 'fireball': case 'dot_projectile': case 'lifesteal_projectile':
      case 'multi_projectile': case 'debuff_target':
        return 'cast';       // ranged spell cast
      case 'frost_nova': case 'meteor': case 'aoe_zone':
        return 'aoe';        // area cast
      case 'shield': case 'buff_damage': case 'reset_cooldowns':
        return 'block';      // defensive/buff
      case 'dash': case 'blink': case 'teleport_behind':
        return 'dodge';      // movement skill
      case 'aoe_melee': case 'execute':
        return 'spin';       // melee AoE
      case 'aoe_strike':
        return 'kick';       // big melee hit
      case 'stealth':
        return 'crouch';     // stealth
      default:
        return 'attack1';    // generic skill
    }
  }
  
  executeAbility(ability, key) {
    if (!this.playerUnit) return;
    const mesh = this.playerUnit.mesh;
    if (!mesh) return;
    const position = mesh.position.clone();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(mesh.quaternion);
    const target = this.targeting?.currentTarget;
    
    switch (ability.effect) {
      case 'fireball':
        this.createProjectile({
          position: position.clone().add(forward).add(new THREE.Vector3(0, 1, 0)),
          direction: forward,
          speed: 20,
          damage: ability.damage,
          color: 0xff4400,
          shader: 'fireball',
          lifetime: 3,
          onHit: (target, point) => {
            this.particleSystem.emitExplosion(point, new THREE.Color(0xff4400), 50);
          }
        });
        break;
        
      case 'frost_nova':
        const frostGeom = new THREE.RingGeometry(0.5, 5, 32);
        const frostMat = createShaderMaterial('frost');
        const frostRing = new THREE.Mesh(frostGeom, frostMat);
        frostRing.rotation.x = -Math.PI / 2;
        frostRing.position.copy(position);
        frostRing.position.y = 0.1;
        this.scene.add(frostRing);
        
        this.particleSystem.emit({
          position: position,
          color: new THREE.Color(0x88ccff),
          count: 100,
          velocity: new THREE.Vector3(0, 2, 0),
          spread: 5,
          lifetime: 1,
          size: 0.3
        });
        
        setTimeout(() => this.scene.remove(frostRing), 2000);
        break;
        
      case 'shield':
        const shield = new THREE.Mesh(
          new THREE.SphereGeometry(1.5, 32, 32),
          new THREE.MeshBasicMaterial({
            color: 0x4488ff,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
          })
        );
        mesh.add(shield);
        setTimeout(() => mesh.remove(shield), ability.duration * 1000);
        break;
        
      case 'dash':
        // Dash forward using mesh position (not velocity component)
        mesh.position.addScaledVector(forward, ability.distance || 10);
        // Clamp to arena
        mesh.position.x = Math.max(-35, Math.min(35, mesh.position.x));
        mesh.position.z = Math.max(-35, Math.min(35, mesh.position.z));
        
        const dashResources = this.playerEntity?.getComponent('Resources');
        if (dashResources) dashResources.rage.current = Math.min(dashResources.rage.max, dashResources.rage.current + 25);
        
        this.particleSystem?.emit({
          position: position,
          color: new THREE.Color(0x3366ff),
          count: 30,
          velocity: forward.clone().multiplyScalar(-5),
          spread: 1,
          lifetime: 0.5,
          size: 0.2
        });
        break;
        
      case 'blink':
        const blinkDist = ability.distance || 8;
        const newPos = position.clone().add(forward.clone().multiplyScalar(blinkDist));
        newPos.x = Math.max(-35, Math.min(35, newPos.x));
        newPos.z = Math.max(-35, Math.min(35, newPos.z));
        mesh.position.copy(newPos);
        
        this.particleSystem.emit({
          position: position,
          color: new THREE.Color(0x8844ff),
          count: 30,
          velocity: new THREE.Vector3(0, 2, 0),
          spread: 2,
          lifetime: 0.5,
          size: 0.3
        });
        this.particleSystem.emit({
          position: newPos,
          color: new THREE.Color(0x8844ff),
          count: 30,
          velocity: new THREE.Vector3(0, 2, 0),
          spread: 2,
          lifetime: 0.5,
          size: 0.3
        });
        break;
        
      default:
        this.particleSystem.emit({
          position: position.clone().add(new THREE.Vector3(0, 1, 0)),
          color: new THREE.Color(0xffffff),
          count: 20,
          velocity: forward.clone().add(new THREE.Vector3(0, 1, 0)),
          spread: 1,
          lifetime: 0.5,
          size: 0.2
        });
    }
  }
  
  performAttack() {
    if (!this.playerUnit || this.playerEntity?.hasTag('dead')) return;
    const weapon = this.getCurrentWeapon();
    const mesh = this.playerUnit.mesh;
    const controller = this.playerUnit.controller;
    if (!mesh) return;
    
    const position = mesh.position.clone();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(mesh.quaternion);
    
    // Play random attack animation
    const attacks = ['attack1', 'attack2', 'attack3'];
    const anim = attacks[Math.floor(Math.random() * attacks.length)];
    if (controller) controller.playOnce(anim, 1.2);
    
    // Get current target from target system
    const target = this.targeting?.currentTarget;
    
    if (weapon.range > 5) {
      // Ranged: fire projectile
      const dir = target ? 
        new THREE.Vector3().subVectors(target.mesh.position, position).normalize() :
        forward;
      this.createProjectile({
        position: position.clone().add(dir.clone().multiplyScalar(0.5)).add(new THREE.Vector3(0, 1, 0)),
        direction: dir,
        speed: 30,
        damage: weapon.baseAttackDamage,
        color: weapon.name === 'Bow' ? 0x8B4513 : 0x3366ff,
        lifetime: 2
      });
    } else {
      // Melee: direct damage to target if in range
      if (target && target.team !== 'A') {
        const dist = mesh.position.distanceTo(target.mesh.position);
        if (dist <= weapon.range + 1) {
          const hp = target.entity.getComponent('Health');
          if (hp && !hp.invulnerable) {
            const variance = 0.8 + Math.random() * 0.4;
            const dmg = weapon.baseAttackDamage * variance;
            hp.current = Math.max(0, hp.current - dmg);
            hp.lastDamageTime = performance.now();
            
            // Hit reaction on target
            if (target.controller) target.controller.playOnce('hit', 1.5);
            
            // Check death
            if (hp.current <= 0) {
              target.entity.addTag('dead');
              if (target.controller) target.controller.play('death', { loop: false });
            }
          }
        }
      }
      
      // Melee particle effect
      this.particleSystem?.emit({
        position: position.clone().add(forward.multiplyScalar(weapon.range / 2)).add(new THREE.Vector3(0, 1, 0)),
        color: new THREE.Color(0xffffff),
        count: 10,
        velocity: forward.clone(),
        spread: 0.5,
        lifetime: 0.2,
        size: 0.1
      });
      
      // Generate rage on melee hit
      const resources = this.playerEntity?.getComponent('Resources');
      if (resources) resources.rage.current = Math.min(resources.rage.max, resources.rage.current + 10);
    }
  }
  
  createProjectile(config) {
    const {
      position,
      direction,
      speed = 20,
      damage = 50,
      color = 0xff4400,
      shader = null,
      lifetime = 3,
      onHit = null
    } = config;
    
    const projectile = new THREE.Group();
    
    if (shader && ShaderLibrary[shader]) {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 16, 16),
        createShaderMaterial(shader)
      );
      projectile.add(core);
    } else {
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 8, 8),
        new THREE.MeshBasicMaterial({ color })
      );
      projectile.add(core);
    }
    
    const light = new THREE.PointLight(color, 1, 5);
    projectile.add(light);
    
    projectile.position.copy(position);
    this.scene.add(projectile);
    
    this.projectiles.push({
      mesh: projectile,
      direction: direction.clone().normalize(),
      speed,
      damage,
      lifetime,
      startPos: position.clone(),
      onHit,
      shader
    });
  }
  
  updateMovement(delta) {
    if (!this.playerUnit) return;
    const mesh = this.playerUnit.mesh;
    const controller = this.playerUnit.controller;
    const movement = this.playerEntity?.getComponent('Movement');
    if (!mesh || !movement) return;
    
    const speed = this.inputState.keys.shift ? 
      movement.baseSpeed * movement.sprintMultiplier : 
      movement.baseSpeed;
    
    let moveX = 0, moveZ = 0;
    if (this.inputState.keys.w) moveZ -= 1;
    if (this.inputState.keys.s) moveZ += 1;
    if (this.inputState.keys.a) moveX -= 1;
    if (this.inputState.keys.d) moveX += 1;
    
    if (moveX !== 0 || moveZ !== 0) {
      const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
      moveX /= length;
      moveZ /= length;
      
      mesh.position.x += moveX * speed * delta;
      mesh.position.z += moveZ * speed * delta;
      
      // Face movement direction
      mesh.rotation.y = Math.atan2(moveX, moveZ);
      
      // Pick animation: sprint > run, with directional variants
      if (controller) {
        const isSprinting = this.inputState.keys.shift;
        if (isSprinting && controller.actions.has('sprint')) {
          controller.play('sprint');
        } else {
          controller.play('run');
        }
      }
    } else {
      // Play idle when stopped (only if in a movement state)
      if (controller) {
        const movementStates = ['run', 'runBack', 'sprint', 'walk', 'strafeLeft', 'strafeRight'];
        if (movementStates.includes(controller.currentState)) {
          controller.play('idle');
        }
      }
    }
    
    // Arena boundary
    const limit = 35;
    mesh.position.x = Math.max(-limit, Math.min(limit, mesh.position.x));
    mesh.position.z = Math.max(-limit, Math.min(limit, mesh.position.z));
  }
  
  updateCooldowns(delta) {
    if (!this.playerEntity) return;
    const abilityState = this.playerEntity.getComponent('AbilityState');
    if (!abilityState) return;
    for (const key of Object.keys(abilityState.cooldowns)) {
      if (abilityState.cooldowns[key] > 0) {
        abilityState.cooldowns[key] -= delta;
      }
    }
  }
  
  updateResources(delta) {
    const resources = this.playerEntity.getComponent('Resources');
    
    resources.mana.current = Math.min(resources.mana.max, resources.mana.current + resources.mana.regenRate * delta);
    resources.energy.current = Math.min(resources.energy.max, resources.energy.current + resources.energy.regenRate * delta);
    
    if (!this.inputState.keys.shift && resources.rage.current > 0) {
      resources.rage.current = Math.max(0, resources.rage.current - resources.rage.decayRate * delta);
    }
  }
  
  updateProjectiles(delta) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      
      proj.mesh.position.add(proj.direction.clone().multiplyScalar(proj.speed * delta));
      proj.lifetime -= delta;
      
      if (proj.shader) {
        const mat = proj.mesh.children[0]?.material;
        if (mat?.uniforms?.time) {
          mat.uniforms.time.value += delta;
        }
      }
      
      this.particleSystem.emitTrail(proj.mesh.position.clone(), new THREE.Color(0xff4400));
      
      if (proj.lifetime <= 0 || proj.mesh.position.distanceTo(proj.startPos) > 50) {
        if (proj.onHit) {
          proj.onHit(null, proj.mesh.position.clone());
        }
        this.scene.remove(proj.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
  
  updateEnemies(delta) {
    // Handled by ArenaAI system now
    if (this.arenaAI) {
      this.arenaAI.update(delta, this.allUnits, this.match?.isCombatActive() ?? true);
    }
  }
  
  updateShaders(delta) {
    this.scene.traverse((child) => {
      if (child.isMesh && child.material?.uniforms?.time) {
        child.material.uniforms.time.value += delta;
      }
    });
  }
  
  updateUI() {
    if (!this.playerEntity) return;
    const health = this.playerEntity.getComponent('Health');
    const resources = this.playerEntity.getComponent('Resources');
    if (!health || !resources) return;
    
    const safeSet = (id, pct, extra) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.width = `${pct}%`;
      if (extra) el.dataset.health = extra;
    };
    
    const healthPercent = (health.current / health.max) * 100;
    safeSet('healthBar', healthPercent, `${Math.round(health.current)}/${health.max}`);
    safeSet('manaBar', (resources.mana.current / resources.mana.max) * 100);
    safeSet('energyBar', (resources.energy.current / resources.energy.max) * 100);
    safeSet('rageBar', (resources.rage.current / resources.rage.max) * 100);
  }
  
  updateWeaponUI() {
    if (!this.playerEntity) return;
    const weaponState = this.playerEntity.getComponent('WeaponState');
    if (!weaponState) return;
    const w1 = document.getElementById('weapon1');
    const w2 = document.getElementById('weapon2');
    if (w1) w1.classList.toggle('active', weaponState.activeSlot === 'primary');
    if (w2) w2.classList.toggle('active', weaponState.activeSlot === 'secondary');
    
    const weapon = this.getCurrentWeapon();
    if (!weapon) return;
    const abilityBar = document.getElementById('abilityBar');
    if (!abilityBar) return;
    abilityBar.innerHTML = '';
    
    // Map weapon abilities to 1-5 keys
    const entries = Object.entries(weapon.abilities);
    entries.forEach(([key, ability], index) => {
      const slotKey = index + 1; // 1, 2, 3, 4, 5
      const slot = document.createElement('div');
      slot.className = 'ability-slot';
      slot.innerHTML = `<span class="ability-key">${slotKey}</span><span class="ability-name">${ability.name}</span>`;
      slot.title = `[${slotKey}] ${ability.name}: ${ability.description}`;
      slot.addEventListener('click', () => this.useAbility(key));
      abilityBar.appendChild(slot);
    });
  }
  
  animate() {
    requestAnimationFrame(() => this.animate());
    
    const delta = Math.min(this.clock.getDelta(), 0.1);
    
    // Update match state (countdown, victory checks)
    if (this.match) this.match.update(delta);
    
    const combatActive = this.match?.isCombatActive() ?? true;
    
    // Only allow player movement/actions during combat
    if (combatActive) {
      this.updateMovement(delta);
      this.updateCooldowns(delta);
      this.updateResources(delta);
      this.updateProjectiles(delta);
    }
    
    // AI always updates (handles idle during countdown)
    this.updateEnemies(delta);
    this.updateShaders(delta);
    
    // Update all animation controllers
    for (const unit of this.allUnits) {
      if (unit.controller) unit.controller.update(delta);
    }
    
    this.particleSystem?.update(delta);
    this.spriteSystem?.update(delta);
    this.chaseCamera?.update(delta);
    
    // Update HUD
    this.updateUI();
    if (this.targeting) {
      this.targeting.updateTargetFrameHP();
      this.targeting.updateTeamFrames();
      this.targeting.cleanup();
    }
    
    this.renderer.render(this.scene, this.camera);
  }
}

// ============================================================================
// SECTION 12: INITIALIZATION
// ============================================================================

export { GrudgeArena, WeaponDefinitions, ShaderLibrary, Components };
