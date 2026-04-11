/**
 * GrudgeCharacter — Core character class following annihilate Maria.js pattern
 * 
 * Every character (player + AI) in the arena is a GrudgeCharacter.
 * Registers itself in window.updates[] for the main game loop.
 * 
 * Owns:
 *   mesh     — Three.js scene (GLB model)
 *   body     — CharacterBody (Cannon-ES capsule)
 *   mixer    — Three.js AnimationMixer
 *   oaction  — Map of animation name → AnimationAction
 *   service  — XState FSM interpreter
 *   direction/facing — Vector2 for movement (annihilate pattern)
 *
 * Pattern:
 *   constructor() → pushes to window.updates
 *   load()        → loads GLB + animations, creates mixer, starts FSM
 *   update(dt)    → called by game loop: altitude check, body→mesh sync, mixer update
 *   fadeToAction() → crossfade animation blending
 *   hit()         → receives damage, sends FSM event
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CharacterBody } from './CharacterBody.js';
import { createCharacterFSM } from './CharacterFSM.js';

const loader = new GLTFLoader();

export class GrudgeCharacter {
  constructor(options = {}) {
    this.race = options.race || 'human';
    this.weaponClass = options.weaponClass || 'greatsword';
    this.team = options.team || 'player';
    this.spawnPos = options.position || { x: 0, y: 2, z: 0 };

    // Annihilate character properties
    this.health = options.health || 1000;
    this.maxHealth = this.health;
    this.speed = options.speed || 0.11;
    this.attackSpeed = options.attackSpeed || 1.4;
    this.mass = options.mass || 80;

    // Three.js
    this.mesh = null;
    this.mixer = null;
    this.oaction = {};       // animation name → AnimationAction (annihilate pattern)
    this.action_act = null;  // Currently playing action

    // Physics (created in load())
    this.body = null;

    // Movement (annihilate pattern)
    this.direction = new THREE.Vector2();   // May be zero length
    this.facing = new THREE.Vector2(0, -1); // NEVER zero length
    this.isAir = false;

    // FSM
    this._fsmService = null;
    this._activeSkill = 0;

    // Callbacks (set by game code)
    this.onAttack = null;   // (type) => {}
    this.onSkill = null;    // () => {}
    this.onDash = null;     // () => {}
    this.onHit = null;      // () => {}
    this.onDeath = null;    // () => {}

    // Register in global update list (annihilate pattern)
    if (!window.updates) window.updates = [];
    window.updates.push(this);
  }

  /** Load GLB model + animation library, create body + FSM */
  async load(physicsWorld, scene, animLibraryGltf) {
    // Load race GLB
    const charGltf = await new Promise((r, e) =>
      loader.load(`/models/${this.race}.glb`, r, undefined, e)
    );

    this.mesh = charGltf.scene;
    this.mesh.traverse(c => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        c.frustumCulled = false;
      }
    });
    scene.add(this.mesh);

    // Create physics body
    this.body = new CharacterBody(physicsWorld, {
      mass: this.mass,
      position: this.spawnPos,
      team: this.team,
    });
    this.body.body.belongTo = this;

    // Create animation mixer
    this.mixer = new THREE.AnimationMixer(this.mesh);

    // Register embedded animations (Running, Walking from GLB)
    for (const clip of charGltf.animations) {
      const action = this.mixer.clipAction(clip);
      const name = clip.name.toLowerCase();
      this.oaction[name] = action;
      // Alias: running→run, walking→walk, running→idle (fallback)
      if (name === 'running') { this.oaction['run'] = action; this.oaction['idle'] = action; }
      if (name === 'walking') { this.oaction['walk'] = action; }
    }

    // Register animations from library (weapon-class-specific)
    if (animLibraryGltf) {
      const prefix = this._getAnimPrefix();
      for (const clip of animLibraryGltf.animations) {
        // Match weapon-class-prefixed animations (e.g. greatsword__attack1)
        if (clip.name.startsWith(prefix + '__')) {
          const stateName = clip.name.slice(prefix.length + 2);
          const action = this.mixer.clipAction(clip, this.mesh);
          this.oaction[stateName] = action;

          // Set one-shot animations (annihilate pattern)
          const oneShot = ['attack1','attack2','attack3','attack4','combo1','combo2',
            'swing','spinLow','kick','jumpAttack','hit','hurt','hurtRight','stun',
            'dead','dead2','deadBack','roll','dodge','dodgeBack','dash',
            'jump','block','blockHit','cast','cast2H','aoe','aoe2','taunt','taunt2',
            'draw','sheath','powerUp','punch','slash1','slash2','slash3'];
          if (oneShot.includes(stateName)) {
            action.loop = THREE.LoopOnce;
            action.clampWhenFinished = true;
          }
        }
      }
    }

    // Start idle
    this.action_act = this.oaction['idle'];
    if (this.action_act) this.action_act.play();

    // Wire animation finish → FSM 'finish' event (annihilate pattern)
    this.mixer.addEventListener('finished', () => {
      if (this._fsmService) this._fsmService.send('finish');
    });

    // Create FSM
    this._fsmService = createCharacterFSM(this);

    console.log(`[GrudgeCharacter] ${this.race} (${this.weaponClass}) loaded — ${Object.keys(this.oaction).length} animations`);
  }

  /** Animation prefix for this weapon class */
  _getAnimPrefix() {
    const map = {
      greatsword: 'greatsword', axe: 'greatsword', hammer: 'greatsword',
      sabres: 'swordShield', runeblade: 'swordShield', swordShield: 'swordShield',
      scythe: 'magic', staff: 'magic', wand: 'magic', magic: 'magic',
      bow: 'longbow', longbow: 'longbow', crossbow: 'longbow',
      rifle: 'rifle', gun: 'rifle',
    };
    return map[this.weaponClass] || 'greatsword';
  }

  /** Crossfade animation blending (annihilate fadeToAction pattern) */
  fadeToAction(name, duration = 0.1) {
    const nextAction = this.oaction[name];
    if (!nextAction) {
      // Fallback chain
      const fallbacks = ['idle', 'running', 'walking'];
      for (const fb of fallbacks) {
        if (this.oaction[fb]) return this.fadeToAction(fb, duration);
      }
      return;
    }

    if (duration > 0) {
      nextAction.reset().play();
      if (this.action_act) this.action_act.crossFadeTo(nextAction, duration);
    } else {
      if (this.action_act) this.action_act.stop();
      nextAction.reset().play();
    }
    this.action_act = nextAction;
  }

  /** Called every frame by game loop (annihilate Maria.update pattern) */
  update(dt) {
    if (!this.body || !this.mesh) return;

    // Altitude check → land/air events (annihilate pattern)
    const altitude = this.body.getAltitude();
    if (altitude > 0.37) {
      this.isAir = true;
      this.body.isAir = true;
      if (this._fsmService) this._fsmService.send('air');
    } else {
      if (this.isAir || altitude < 0.037) {
        if (this._fsmService) this._fsmService.send('land');
      }
      this.isAir = false;
      this.body.isAir = false;
    }

    // Sync body → mesh (annihilate: mesh.position = body.position - heightHalf)
    this.body.syncMesh(this.mesh);

    // Update animation mixer
    if (this.mixer) this.mixer.update(Math.min(dt, 1 / 60));
  }

  /** Set facing direction and update mesh rotation (annihilate pattern) */
  setFacing(x, z) {
    this.facing.set(x, z);
    if (this.mesh) {
      this.mesh.rotation.y = -this.facing.angle() + Math.PI / 2;
    }
  }

  /** Receive damage (annihilate hit pattern) */
  hit(damage = 0, collideEvent = null) {
    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) {
      if (this._fsmService) this._fsmService.send('die');
    } else {
      if (this._fsmService) this._fsmService.send('hit', { collideEvent });
    }
  }

  /** Check if in a state with given tag */
  hasTag(tag) {
    return this._fsmService?.getSnapshot().hasTag(tag) ?? false;
  }

  /** Get current FSM state name */
  get stateName() {
    const state = this._fsmService?.getSnapshot();
    if (!state) return 'idle';
    return typeof state.value === 'string' ? state.value : JSON.stringify(state.value);
  }

  /** Remove from scene and physics */
  dispose() {
    if (this.mesh?.parent) this.mesh.parent.remove(this.mesh);
    if (this.body) this.body.dispose();
    if (this._fsmService) this._fsmService.stop();
    const idx = window.updates?.indexOf(this);
    if (idx >= 0) window.updates.splice(idx, 1);
  }
}
