/**
 * GRUDGE ARENA — Game Orchestrator
 *
 * Thin entry point that wires together the modular engine systems.
 * All heavy logic lives in src/engine/*.js modules.
 *
 * Architecture: Input → ECS World → Systems → Render
 */

import * as THREE from 'three';

// Engine modules
import { World, Components } from './src/engine/ECS.js';
import { WeaponTypes, WeaponDefinitions } from './src/engine/WeaponDefinitions.js';
import { ShaderLibrary, createShaderMaterial } from './src/engine/ShaderLibrary.js';
import { ParticleSystem } from './src/engine/ParticleSystem.js';
import { CollisionSystem } from './src/engine/CollisionSystem.js';
import { ChaseCamera } from './src/engine/ChaseCamera.js';
import { SpriteSystem, createSkybox } from './src/engine/SpriteSystem.js';
import { GameTimerSystem } from './src/engine/GameTimer.js';

// ── Static spawn helpers ──
const ArenaMatchStatic = {
  getSpawnPosition(teamId, slot, teamSize) {
    const xSign = teamId === 'A' ? -1 : 1;
    return new THREE.Vector3(15 * xSign, 0, (slot - (teamSize - 1) / 2) * 4);
  },
  getSpawnFacing(teamId) { return teamId === 'A' ? Math.PI / 2 : -Math.PI / 2; },
};

// ── Main Game Class ──

class GrudgeArena {
  constructor(config = {}) {
    this.config = config;
    this.container = config.container || document.getElementById('game-root') || document.body;
    this.scene = null; this.camera = null; this.renderer = null;
    this.clock = new THREE.Clock();

    this.world = new World();
    this.collisionSystem = new CollisionSystem();
    this.particleSystem = null;
    this.spriteSystem = null;
    this.chaseCamera = null;
    this.gameTimers = new GameTimerSystem();

    this.match = null; this.targeting = null; this.arenaAI = null;
    this.playerEntity = null; this.playerUnit = null;
    this.allUnits = [];
    this.inputState = { keys: {}, mouse: { x: 0, y: 0, leftButton: false, rightButton: false }, abilities: {} };
    this.projectiles = [];
  }

  async init(config) {
    if (config) { Object.assign(this.config, config); if (config.container) this.container = config.container; }
    this._setupRenderer();
    this._setupScene();
    this._setupLighting();
    this._setupInput();

    this.particleSystem = new ParticleSystem(this.scene);
    this.spriteSystem = new SpriteSystem(this.scene);
    this._createArena();
    createSkybox(this.scene);

    // Loading progress helper
    const setProgress = (pct, text) => {
      const bar = document.getElementById('loading-bar');
      const label = document.getElementById('loading-text');
      if (bar) bar.style.width = `${pct}%`;
      if (label) label.textContent = text || 'Loading...';
    };

    try {
      setProgress(10, 'Loading engine modules...');
      const [matchMod, targetMod, aiMod, modelMod] = await Promise.all([
        import('./src/arenaMatch.js'), import('./src/targetSystem.js'),
        import('./src/arenaAI.js'), import('./src/modelLoader.js'),
      ]);

      this.match = new matchMod.ArenaMatch();
      this.arenaAI = new aiMod.ArenaAI();

      const race = this.config.race || 'human';
      const TEAM_A = [
        { race, weapon: 'greatsword', isPlayer: true },
        { race: 'elf', weapon: 'bow', isPlayer: false },
        { race: 'undead', weapon: 'scythe', isPlayer: false },
      ];
      const TEAM_B = [
        { race: 'orc', weapon: 'greatsword', isPlayer: false },
        { race: 'barbarian', weapon: 'sabres', isPlayer: false },
        { race: 'dwarf', weapon: 'runeblade', isPlayer: false },
      ];

      setProgress(30, 'Loading Team A models...');
      const teamAUnits = await Promise.all(TEAM_A.map((c, i) => this._loadUnit(c, 'A', i, TEAM_A.length, modelMod)));
      setProgress(60, 'Loading Team B models...');
      const teamBUnits = await Promise.all(TEAM_B.map((c, i) => this._loadUnit(c, 'B', i, TEAM_B.length, modelMod)));
      setProgress(90, 'Initializing systems...');

      this.allUnits = [...teamAUnits, ...teamBUnits];
      this.playerUnit = this.allUnits.find(u => u.isPlayer);
      this.playerEntity = this.playerUnit?.entity;

      this.targeting = new targetMod.TargetSystem(this.camera, this.scene, this.renderer);
      for (const u of this.allUnits) this.targeting.register(u);
      for (const u of this.allUnits) { if (!u.isPlayer) this.arenaAI.register(u); }
      this.match.registerTeams(teamAUnits, teamBUnits);

      if (this.playerUnit) this.chaseCamera = new ChaseCamera(this.camera, this.playerUnit.mesh);

      const gameUI = document.getElementById('gameUI');
      if (gameUI) gameUI.style.display = 'block';
      setProgress(100, 'Ready!');
      this.match.start();
      console.log('[arena] 3v3 Arena loaded — race:', race);
    } catch (err) {
      console.error('[arena] Failed to load arena systems:', err);
      this._showError(err);
      this._createFallbackPlayer();
    }

    this._animate();
  }

  // ── Renderer / Scene / Lighting ──

  _setupRenderer() {
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
    if (!existingCanvas) { this.renderer.domElement.style.display = 'block'; this.container.appendChild(this.renderer.domElement); }
    window.addEventListener('resize', () => {
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
    });
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);
    this.scene.fog = new THREE.Fog(0x0a0a0f, 50, 150);
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 500);
    this.camera.position.set(0, 8, 12);
    this.camera.lookAt(0, 1, 0);
  }

  _setupLighting() {
    this.scene.add(new THREE.AmbientLight(0xb0c4de, 0.6));
    this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x362d1e, 0.4));
    const dir = new THREE.DirectionalLight(0xfff5e1, 1.2);
    dir.position.set(10, 20, 10); dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048); dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 80;
    dir.shadow.camera.left = -40; dir.shadow.camera.right = 40; dir.shadow.camera.top = 40; dir.shadow.camera.bottom = -40;
    dir.shadow.bias = -0.001;
    this.scene.add(dir);
    const rim = new THREE.DirectionalLight(0x8888ff, 0.3); rim.position.set(-10, 15, -15); this.scene.add(rim);
    const warm = new THREE.PointLight(0xff8844, 0.3, 40); warm.position.set(15, 8, 15); this.scene.add(warm);
  }

  // ── Arena construction ──

  _createArena() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80, 32, 32), createShaderMaterial('arenaGround'));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    this.scene.add(ground);
    this.collisionSystem.addCollider(ground, 'environment');

    const ringGeo = new THREE.RingGeometry(38, 40, 64);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0xc9a84c, emissive: 0x8b6914, emissiveIntensity: 0.3, metalness: 0.8, roughness: 0.3 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; this.scene.add(ring);

    for (const teamId of ['A', 'B']) {
      for (let i = 0; i < 3; i++) {
        const pos = ArenaMatchStatic.getSpawnPosition(teamId, i, 3);
        const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 32), new THREE.MeshBasicMaterial({ color: teamId === 'A' ? 0x3366ff : 0xff3333, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
        m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y = 0.02; this.scene.add(m);
      }
    }

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const group = new THREE.Group();
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 4, 8), new THREE.MeshStandardMaterial({ color: 0x2a2a4e, metalness: 0.6, roughness: 0.4, emissive: 0x3366ff, emissiveIntensity: 0.1 }));
      col.position.y = 2; col.castShadow = true; group.add(col);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), createShaderMaterial('frost'));
      orb.position.y = 4.2; group.add(orb);
      group.add(Object.assign(new THREE.PointLight(0x4488ff, 1, 8, 2), { position: new THREE.Vector3(0, 4.5, 0) }));
      group.position.set(Math.cos(angle) * 35, 0, Math.sin(angle) * 35);
      this.scene.add(group);
    }
  }

  // ── Unit loading ──

  async _loadUnit(comp, teamId, slot, teamSize, modelMod) {
    const spawnPos = ArenaMatchStatic.getSpawnPosition(teamId, slot, teamSize);
    const facing = ArenaMatchStatic.getSpawnFacing(teamId);
    const uuid = crypto?.randomUUID?.() || `unit_${teamId}_${slot}_${Date.now()}`;
    const weaponDef = WeaponDefinitions[comp.weapon] || WeaponDefinitions[WeaponTypes.GREATSWORD];

    const { scene: mesh, mixer, controller } = await modelMod.createAnimatedUnit(comp.race, comp.weapon);
    mesh.position.copy(spawnPos); mesh.rotation.y = facing;
    this.scene.add(mesh);

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
        race: comp.race, weaponType: comp.weapon, team: teamId,
      });

    if (comp.isPlayer) entity.addTag('player');
    entity.addTag(teamId === 'A' ? 'teamA' : 'teamB');
    this.collisionSystem.addCollider(mesh, teamId === 'A' ? 'ally' : 'enemy', { entity, uuid });

    return { entity, mesh, mixer, controller, team: teamId, isPlayer: !!comp.isPlayer, weaponDef, race: comp.race, uuid };
  }

  _createFallbackPlayer() {
    const player = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1, 8, 16), new THREE.MeshStandardMaterial({ color: 0x3366ff, metalness: 0.3, roughness: 0.7, emissive: 0x3366ff, emissiveIntensity: 0.1 }));
    body.position.y = 1; body.castShadow = true; player.add(body);
    this.scene.add(player);

    this.playerEntity = this.world.createEntity()
      .addComponent('Transform', Components.Transform()).addComponent('Velocity', Components.Velocity())
      .addComponent('Health', Components.Health(1000)).addComponent('Resources', Components.Resources())
      .addComponent('Movement', Components.Movement(5))
      .addComponent('WeaponState', Components.WeaponState(WeaponTypes.GREATSWORD, WeaponTypes.BOW))
      .addComponent('AbilityState', Components.AbilityState())
      .addComponent('RenderMesh', Components.RenderMesh(player)).addTag('player');

    this.playerUnit = { entity: this.playerEntity, mesh: player, controller: null, team: 'A', isPlayer: true, weaponDef: WeaponDefinitions[WeaponTypes.GREATSWORD] };
    this.allUnits = [this.playerUnit];
    this.chaseCamera = new ChaseCamera(this.camera, player);
    const gameUI = document.getElementById('gameUI');
    if (gameUI) gameUI.style.display = 'block';
  }

  /** Show error overlay with message */
  _showError(err) {
    const overlay = document.getElementById('error-overlay');
    const msg = document.getElementById('error-message');
    if (overlay) overlay.classList.add('active');
    if (msg) msg.textContent = err?.message || 'An unknown error occurred while loading the arena engine.';
    // Auto-dismiss after 5s if fallback loaded
    setTimeout(() => { if (overlay) overlay.classList.remove('active'); }, 5000);
  }

  // ── Input ──

  _setupInput() {
    const SKILL_MAP = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, 'e': 2, 'r': 3, 'f': 4 };
    const ABILITY_KEYS = ['Q', 'E', 'R', 'F', 'P'];

    document.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (['w','a','s','d'].includes(key)) this.inputState.keys[key] = true;
      if (e.key === 'Shift') this.inputState.keys.shift = true;
      if (e.key === 'Control') { this.inputState.keys.ctrl = true; if (!e.repeat) this._performRoll(1); }
      if (e.key === 'Alt') { this.inputState.keys.alt = true; e.preventDefault(); if (!e.repeat) this._performRoll(-1); }
      if (key === ' ') this.inputState.keys.space = true;
      if (key in SKILL_MAP) { e.preventDefault(); const abilityKey = ABILITY_KEYS[SKILL_MAP[key]]; if (abilityKey) this.useAbility(abilityKey); }
      if (e.key === 'Escape') this.match?.setPhase?.('paused');
    });
    document.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (['w','a','s','d'].includes(key)) this.inputState.keys[key] = false;
      if (e.key === 'Shift') this.inputState.keys.shift = false;
      if (e.key === 'Control') this.inputState.keys.ctrl = false;
      if (e.key === 'Alt') this.inputState.keys.alt = false;
      if (key === ' ') this.inputState.keys.space = false;
    });
    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.inputState.mouse.leftButton = true;
      if (e.button === 2) { this.inputState.mouse.rightButton = true; this._performAttack(); }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.inputState.mouse.leftButton = false;
      if (e.button === 2) this.inputState.mouse.rightButton = false;
    });
    document.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('wheel', (e) => {
      if (this.chaseCamera) this.chaseCamera.distance = Math.max(3, Math.min(15, this.chaseCamera.distance + e.deltaY * 0.005));
    }, { passive: true });
  }

  // ── Combat ──

  getCurrentWeapon() {
    const ws = this.playerEntity?.getComponent('WeaponState');
    if (!ws) return null;
    return WeaponDefinitions[ws.activeSlot === 'primary' ? ws.primary : ws.secondary];
  }

  useAbility(key) {
    if (!this.playerUnit || !this.playerEntity) return;
    const weapon = this.getCurrentWeapon();
    const ability = weapon?.abilities[key];
    if (!ability) return;
    const as = this.playerEntity.getComponent('AbilityState');
    if (!as || as.cooldowns[key] > 0) return;
    const res = this.playerEntity.getComponent('Resources');
    if (ability.cost && ability.costType && res) {
      const pool = res[ability.costType];
      if (pool && pool.current < ability.cost) return;
      if (pool) pool.current -= ability.cost;
    }
    as.cooldowns[key] = ability.cooldown;
    const ctrl = this.playerUnit.controller;
    if (ctrl) ctrl.playOnce(this._getSkillAnim(ability.effect), 1.0);
    this._executeAbility(ability);
    this._updateUI();
  }

  _getSkillAnim(effect) {
    const map = { fireball: 'cast', dot_projectile: 'cast', lifesteal_projectile: 'cast', multi_projectile: 'cast', debuff_target: 'cast', frost_nova: 'aoe', meteor: 'aoe', aoe_zone: 'aoe', shield: 'block', buff_damage: 'block', reset_cooldowns: 'block', dash: 'dodge', blink: 'dodge', teleport_behind: 'dodge', aoe_melee: 'spin', execute: 'spin', aoe_strike: 'kick', stealth: 'crouch' };
    return map[effect] || 'attack1';
  }

  _executeAbility(ability) {
    if (!this.playerUnit) return;
    const mesh = this.playerUnit.mesh;
    const pos = mesh.position.clone();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(mesh.quaternion);
    const LIMIT = 35;

    switch (ability.effect) {
      case 'fireball':
        this._createProjectile({ position: pos.clone().add(fwd).add(new THREE.Vector3(0, 1, 0)), direction: fwd, speed: 20, damage: ability.damage, color: 0xff4400, shader: 'fireball', lifetime: 3, onHit: (_t, pt) => this.particleSystem.emitExplosion(pt, new THREE.Color(0xff4400), 50) });
        break;
      case 'frost_nova': {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 5, 32), createShaderMaterial('frost'));
        ring.rotation.x = -Math.PI / 2; ring.position.copy(pos); ring.position.y = 0.1;
        this.scene.add(ring);
        this.gameTimers.add(2, () => this.scene.remove(ring));
        this.particleSystem.emit({ position: pos, color: new THREE.Color(0x88ccff), count: 100, velocity: new THREE.Vector3(0, 2, 0), spread: 5, lifetime: 1, size: 0.3 });
        break;
      }
      case 'shield': {
        const s = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 32), new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
        mesh.add(s);
        this.gameTimers.add(ability.duration || 3, () => mesh.remove(s));
        break;
      }
      case 'dash':
        mesh.position.addScaledVector(fwd, ability.distance || 10);
        mesh.position.x = Math.max(-LIMIT, Math.min(LIMIT, mesh.position.x));
        mesh.position.z = Math.max(-LIMIT, Math.min(LIMIT, mesh.position.z));
        this.particleSystem?.emit({ position: pos, color: new THREE.Color(0x3366ff), count: 30, velocity: fwd.clone().multiplyScalar(-5), spread: 1, lifetime: 0.5, size: 0.2 });
        break;
      case 'blink': {
        const np = pos.clone().add(fwd.clone().multiplyScalar(ability.distance || 8));
        np.x = Math.max(-LIMIT, Math.min(LIMIT, np.x));
        np.z = Math.max(-LIMIT, Math.min(LIMIT, np.z));
        mesh.position.copy(np);
        for (const p of [pos, np]) this.particleSystem.emit({ position: p, color: new THREE.Color(0x8844ff), count: 30, velocity: new THREE.Vector3(0, 2, 0), spread: 2, lifetime: 0.5, size: 0.3 });
        break;
      }
      default:
        this.particleSystem.emit({ position: pos.clone().add(new THREE.Vector3(0, 1, 0)), color: new THREE.Color(0xffffff), count: 20, velocity: fwd.clone().add(new THREE.Vector3(0, 1, 0)), spread: 1, lifetime: 0.5, size: 0.2 });
    }
  }

  _performAttack() {
    if (!this.playerUnit || this.playerEntity?.hasTag('dead')) return;
    const weapon = this.getCurrentWeapon();
    const mesh = this.playerUnit.mesh;
    const ctrl = this.playerUnit.controller;
    if (!mesh || !weapon) return;

    const pos = mesh.position.clone();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(mesh.quaternion);
    const attacks = ['attack1', 'attack2', 'attack3'];
    if (ctrl) ctrl.playOnce(attacks[Math.floor(Math.random() * attacks.length)], 1.2);

    const target = this.targeting?.currentTarget;

    if (weapon.range > 5) {
      const dir = target ? new THREE.Vector3().subVectors(target.mesh.position, pos).normalize() : fwd;
      this._createProjectile({ position: pos.clone().add(dir.clone().multiplyScalar(0.5)).add(new THREE.Vector3(0, 1, 0)), direction: dir, speed: 30, damage: weapon.baseAttackDamage, color: weapon.name === 'Bow' ? 0x8B4513 : 0x3366ff, lifetime: 2 });
    } else {
      if (target && target.team !== 'A') {
        const dist = mesh.position.distanceTo(target.mesh.position);
        if (dist <= weapon.range + 1) {
          const hp = target.entity.getComponent('Health');
          if (hp && !hp.invulnerable) {
            const dmg = weapon.baseAttackDamage * (0.8 + Math.random() * 0.4);
            hp.current = Math.max(0, hp.current - dmg); hp.lastDamageTime = performance.now();
            if (target.controller) target.controller.playOnce('hit', 1.5);
            if (hp.current <= 0) { target.entity.addTag('dead'); target.controller?.play('death', { loop: false }); }
          }
        }
      }
      this.particleSystem?.emit({ position: pos.clone().add(fwd.multiplyScalar(weapon.range / 2)).add(new THREE.Vector3(0, 1, 0)), color: new THREE.Color(0xffffff), count: 10, velocity: fwd.clone(), spread: 0.5, lifetime: 0.2, size: 0.1 });
      const res = this.playerEntity?.getComponent('Resources');
      if (res) res.rage.current = Math.min(res.rage.max, res.rage.current + 10);
    }
  }

  _performRoll(direction) {
    if (!this.playerUnit || this.playerEntity?.hasTag('dead')) return;
    const mesh = this.playerUnit.mesh; const ctrl = this.playerUnit.controller;
    if (!mesh) return;
    if (ctrl) ctrl.playOnce(ctrl.actions?.has('dodge') ? 'dodge' : 'jump', 1.5);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(mesh.quaternion);
    mesh.position.addScaledVector(fwd, 5 * direction);
    mesh.position.x = Math.max(-35, Math.min(35, mesh.position.x));
    mesh.position.z = Math.max(-35, Math.min(35, mesh.position.z));
  }

  _createProjectile(config) {
    const { position, direction, speed = 20, damage = 50, color = 0xff4400, shader = null, lifetime = 3, onHit = null } = config;
    const group = new THREE.Group();
    if (shader && ShaderLibrary[shader]) group.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), createShaderMaterial(shader)));
    else group.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color })));
    group.add(new THREE.PointLight(color, 1, 5));
    group.position.copy(position);
    this.scene.add(group);
    this.projectiles.push({ mesh: group, direction: direction.clone().normalize(), speed, damage, lifetime, startPos: position.clone(), onHit, shader });
  }

  // ── Per-frame updates ──

  _updateMovement(delta) {
    if (!this.playerUnit) return;
    const mesh = this.playerUnit.mesh; const ctrl = this.playerUnit.controller;
    const mov = this.playerEntity?.getComponent('Movement');
    if (!mesh || !mov) return;

    const speed = this.inputState.keys.shift ? mov.baseSpeed * mov.sprintMultiplier : mov.baseSpeed;
    let mx = 0, mz = 0;
    if (this.inputState.keys.w) mz -= 1; if (this.inputState.keys.s) mz += 1;
    if (this.inputState.keys.a) mx -= 1; if (this.inputState.keys.d) mx += 1;

    if (mx || mz) {
      const len = Math.hypot(mx, mz); mx /= len; mz /= len;
      mesh.position.x += mx * speed * delta; mesh.position.z += mz * speed * delta;
      mesh.rotation.y = Math.atan2(mx, mz);
      if (ctrl) { if (this.inputState.keys.shift && ctrl.actions?.has('sprint')) ctrl.play('sprint'); else ctrl.play('run'); }
    } else if (ctrl) {
      const movStates = ['run', 'runBack', 'sprint', 'walk', 'strafeLeft', 'strafeRight'];
      if (movStates.includes(ctrl.currentState)) ctrl.play('idle');
    }

    mesh.position.x = Math.max(-35, Math.min(35, mesh.position.x));
    mesh.position.z = Math.max(-35, Math.min(35, mesh.position.z));
  }

  _updateCooldowns(delta) {
    const as = this.playerEntity?.getComponent('AbilityState');
    if (!as) return;
    for (const key of Object.keys(as.cooldowns)) { if (as.cooldowns[key] > 0) as.cooldowns[key] -= delta; }
  }

  _updateResources(delta) {
    const res = this.playerEntity?.getComponent('Resources');
    if (!res) return;
    res.mana.current = Math.min(res.mana.max, res.mana.current + res.mana.regenRate * delta);
    res.energy.current = Math.min(res.energy.max, res.energy.current + res.energy.regenRate * delta);
    if (!this.inputState.keys.shift && res.rage.current > 0) res.rage.current = Math.max(0, res.rage.current - res.rage.decayRate * delta);
  }

  _updateProjectiles(delta) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.mesh.position.add(p.direction.clone().multiplyScalar(p.speed * delta));
      p.lifetime -= delta;
      if (p.shader) { const mat = p.mesh.children[0]?.material; if (mat?.uniforms?.time) mat.uniforms.time.value += delta; }
      this.particleSystem.emitTrail(p.mesh.position.clone(), new THREE.Color(0xff4400));
      if (p.lifetime <= 0 || p.mesh.position.distanceTo(p.startPos) > 50) {
        if (p.onHit) p.onHit(null, p.mesh.position.clone());
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  _updateShaders(delta) {
    this.scene.traverse(child => { if (child.isMesh && child.material?.uniforms?.time) child.material.uniforms.time.value += delta; });
  }

  _updateUI() {
    if (!this.playerEntity) return;
    const hp = this.playerEntity.getComponent('Health');
    const res = this.playerEntity.getComponent('Resources');
    if (!hp || !res) return;
    const set = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = `${pct}%`; };
    set('healthBar', (hp.current / hp.max) * 100);
    set('manaBar', (res.mana.current / res.mana.max) * 100);
    set('energyBar', (res.energy.current / res.energy.max) * 100);
    set('rageBar', (res.rage.current / res.rage.max) * 100);
  }

  updateWeaponUI() {
    if (!this.playerEntity) return;
    const ws = this.playerEntity.getComponent('WeaponState');
    if (!ws) return;
    document.getElementById('weapon1')?.classList.toggle('active', ws.activeSlot === 'primary');
    document.getElementById('weapon2')?.classList.toggle('active', ws.activeSlot === 'secondary');
    const weapon = this.getCurrentWeapon();
    const bar = document.getElementById('abilityBar');
    if (!weapon || !bar) return;
    bar.innerHTML = '';
    Object.entries(weapon.abilities).forEach(([key, ability], idx) => {
      const slot = document.createElement('div');
      slot.className = 'ability-slot';
      slot.innerHTML = `<span class="ability-key">${idx + 1}</span><span class="ability-name">${ability.name}</span>`;
      slot.title = `[${idx + 1}] ${ability.name}: ${ability.description}`;
      slot.addEventListener('click', () => this.useAbility(key));
      bar.appendChild(slot);
    });
  }

  // ── Game loop ──

  _animate() {
    requestAnimationFrame(() => this._animate());
    const delta = Math.min(this.clock.getDelta(), 0.1);
    if (this.match) this.match.update(delta);
    const active = this.match?.isCombatActive() ?? true;
    if (active) { this._updateMovement(delta); this._updateCooldowns(delta); this._updateResources(delta); this._updateProjectiles(delta); }
    this.gameTimers.update(delta, active);
    if (this.arenaAI) this.arenaAI.update(delta, this.allUnits, active);
    this._updateShaders(delta);
    for (const u of this.allUnits) { if (u.controller) u.controller.update(delta); }
    this.particleSystem?.update(delta);
    this.spriteSystem?.update(delta);
    this.chaseCamera?.update(delta);
    this._updateUI();
    if (this.targeting) { this.targeting.updateTargetFrameHP(); this.targeting.updateTeamFrames(); this.targeting.cleanup(); }
    this.renderer.render(this.scene, this.camera);
  }

  /** Clean dispose — release all GPU resources and DOM elements */
  dispose() {
    // Stop game loop (next rAF will find no instance)
    this.clock.stop();

    // Dispose subsystems
    this.particleSystem?.dispose();
    this.spriteSystem?.dispose();
    this.gameTimers.clear();

    // Traverse scene and dispose all geometries/materials/textures
    this.scene?.traverse(child => {
      if (child.isMesh) {
        child.geometry?.dispose();
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (!mat) continue;
          for (const key of Object.keys(mat)) {
            const val = mat[key];
            if (val && typeof val.dispose === 'function') val.dispose();
          }
          mat.dispose();
        }
      }
    });

    // Dispose renderer
    this.renderer?.dispose();

    // Remove canvas from DOM
    if (this.renderer?.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    console.log('[arena] Disposed all resources');
  }
}

export { GrudgeArena, WeaponDefinitions, ShaderLibrary, Components };
