/**
 * GameLoop — Central game loop following annihilate index.js pattern
 * 
 * Architecture (from annihilate):
 *   window.updates = [] — global entity registry
 *   animate() → updates.forEach(e => e.update(dt)) → world.step → render
 * 
 * Supports multiple game modes:
 *   arena  — 3v3 PvP combat (WoW arenas)
 *   mmo    — open world zones with NPCs
 *   rts    — top-down unit control
 *   rpg    — story/quest progression
 */

import * as THREE from 'three';
import { PhysicsWorld } from './PhysicsWorld.js';

export class GameLoop {
  constructor(container, options = {}) {
    this.container = container || document.body;
    this.mode = options.mode || 'arena'; // arena | mmo | rts | rpg

    // Three.js core
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();

    // Physics
    this.physics = null;

    // Entity registry (annihilate window.updates pattern)
    window.updates = [];
    this.updates = window.updates;

    // Frame tracking
    this.frameCount = 0;
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;

    // Running state
    this._running = false;
    this._onUpdate = null; // Custom per-frame callback
  }

  /** Initialize Three.js scene, camera, renderer (annihilate init_three) */
  initThree() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e);
    this.scene.fog = new THREE.Fog(0x1a1a2e, 40, 100);
    window.scene = this.scene;

    // Camera — defaults for arena, overridden by CameraController
    this.camera = new THREE.PerspectiveCamera(
      50, window.innerWidth / window.innerHeight, 0.05, 500
    );
    this.camera.position.set(0, 8, 12);
    this.camera.lookAt(0, 1, 0);
    window.camera = this.camera;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.container.appendChild(this.renderer.domElement);
    window.renderer = this.renderer;

    // Lighting
    this._setupLighting();

    // Resize handler
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    return this;
  }

  /** Initialize Cannon-ES physics world (annihilate init_cannon) */
  initPhysics() {
    this.physics = new PhysicsWorld();
    window.world = this.physics.world;
    window.physics = this.physics;
    return this;
  }

  _setupLighting() {
    // Ambient fill
    this.scene.add(new THREE.AmbientLight(0xb0c4de, 0.6));

    // Hemisphere sky/ground
    this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x362d1e, 0.4));

    // Directional sun with shadows (annihilate: shadowLight tracks player)
    this.shadowLight = new THREE.DirectionalLight(0xfff5e1, 1.2);
    this.shadowLight.position.set(10, 20, 10);
    this.shadowLight.castShadow = true;
    this.shadowLight.shadow.mapSize.set(2048, 2048);
    this.shadowLight.shadow.camera.near = 0.5;
    this.shadowLight.shadow.camera.far = 80;
    this.shadowLight.shadow.camera.left = -40;
    this.shadowLight.shadow.camera.right = 40;
    this.shadowLight.shadow.camera.top = 40;
    this.shadowLight.shadow.camera.bottom = -40;
    this.shadowLight.shadow.bias = -0.001;
    this.scene.add(this.shadowLight);
    this.scene.add(this.shadowLight.target);

    // Rim light
    const rim = new THREE.DirectionalLight(0x8888ff, 0.3);
    rim.position.set(-10, 15, -15);
    this.scene.add(rim);
  }

  /** Set custom per-frame callback */
  onUpdate(cb) { this._onUpdate = cb; return this; }

  /** Create standard arena ground + pillars */
  createArenaGround() {
    // Ground circle
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
      new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.9 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Gold ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(29, 30, 64),
      new THREE.MeshStandardMaterial({ color: 0xc9a84c, emissive: 0x8b6914, emissiveIntensity: 0.3, metalness: 0.8, roughness: 0.3 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.scene.add(ring);

    // LoS pillars
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const x = Math.cos(angle) * 12;
      const z = Math.sin(angle) * 12;

      // Three.js visual
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.5, 6, 8),
        new THREE.MeshStandardMaterial({ color: 0x333355, roughness: 0.6, metalness: 0.4 })
      );
      pillar.position.set(x, 3, z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.scene.add(pillar);

      // Cannon-ES collision
      if (this.physics) {
        this.physics.addPillar(x, z, 1.5, 6);
      }
    }

    return this;
  }

  /** Start the game loop (annihilate: requestAnimationFrame(animate)) */
  start() {
    this._running = true;
    this.clock.start();
    this._animate();
    return this;
  }

  stop() {
    this._running = false;
  }

  /** Main animation loop (annihilate animate function) */
  _animate() {
    if (!this._running) return;
    requestAnimationFrame(() => this._animate());

    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.frameCount++;

    // FPS counter
    this._fpsAccum += dt;
    this._fpsFrames++;
    if (this._fpsAccum >= 1) {
      this.fps = this._fpsFrames;
      this._fpsFrames = 0;
      this._fpsAccum = 0;
    }

    // Update all entities (annihilate: updates.forEach(e => e.update(dt)))
    for (const entity of this.updates) {
      if (entity.update) entity.update(dt);
    }

    // Shadow light tracks player (annihilate pattern)
    const player = window.role || this.updates.find(u => u.team === 'player');
    if (player?.body?.body) {
      this.shadowLight.position.x = this.shadowLight.target.position.x = player.body.body.position.x;
      this.shadowLight.position.z = this.shadowLight.target.position.z = player.body.body.position.z;
    }

    // Custom update callback
    if (this._onUpdate) this._onUpdate(dt);

    // Physics step (annihilate: world.step after entity updates)
    if (this.physics) this.physics.update(dt);

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  /** Register an entity into the update loop */
  addEntity(entity) {
    if (!this.updates.includes(entity)) {
      this.updates.push(entity);
    }
    return this;
  }

  /** Remove an entity from the update loop */
  removeEntity(entity) {
    const idx = this.updates.indexOf(entity);
    if (idx >= 0) this.updates.splice(idx, 1);
    return this;
  }
}
