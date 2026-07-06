/**
 * GRUDGE ARENA — Game Orchestrator
 *
 * Thin entry point that wires together the modular engine systems.
 * All heavy logic lives in src/engine/*.js modules.
 *
 * Architecture: Input → ECS World → Systems → Render
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Engine modules
import { World, Components } from './src/engine/ECS.js';
import { WeaponTypes, WeaponDefinitions } from './src/engine/WeaponDefinitions.js';
import { getRaceConfig, resolveWeapon } from './src/engine/RaceConfig.js';
import { ShaderLibrary, createShaderMaterial } from './src/engine/ShaderLibrary.js';
import { ParticleSystem } from './src/engine/ParticleSystem.js';
import { CollisionSystem } from './src/engine/CollisionSystem.js';
import { mapUrl } from './src/assetConfig.js';
import { OrbitCamera } from './src/engine/OrbitCamera.js';
import { ArenaController } from './src/engine/ArenaController.js';
import { SpriteSystem, createSkybox } from './src/engine/SpriteSystem.js';
import { GameTimerSystem } from './src/engine/GameTimer.js';
import { inventorySystem } from "./src/inventorySystem.js";
import { InventoryUI } from "./src/inventoryUI.js";
import { generateGrudgeUuid } from "./src/grudgeUuid.js";
import { getHero, DefaultHeroForRace } from "./src/HeroRegistry.js";

// Physics & combat systems (annihilatetrainer patterns)
import { PhysicsWorld, GROUP_PLAYER, GROUP_ENEMY, GROUP_SCENE, GROUP_TRIGGER } from './src/engine/PhysicsWorld.js';
import { HitboxManager } from './src/engine/HitboxSystem.js';
import { AIDetector } from './src/engine/AIDetector.js';
import { createAIBehaviorFSM } from './src/engine/AIBehaviorFSM.js';
import { activeProjectiles as physicsProjectiles } from './src/engine/ProjectilePhysics.js';
import { updateSplashes, HitSplash } from './src/engine/HitSplash.js';
import { AoEIndicator } from './src/engine/AoEIndicator.js';
import { SplineTrajectory, TrajectoryMover } from './src/engine/SplineTrajectory.js';
import { spawnGroundSlamVFX, updateGroundSlamVFX, disposeAllGroundSlamVFX } from './src/engine/GroundSlamVFX.js';
import {
  buildArena,
  getArenaSpawnPosition,
  getArenaSpawnFacing,
  ARENA_CLAMP_RADIUS,
} from './src/engine/ProceduralArena.js';
import {
  bootstrapDangerRoom,
  teardownDangerRoom,
  getDangerTrainingTeams,
  getDangerSpawnPosition,
  getDangerSpawnFacing,
  tickDangerRoomHud,
  dangerRoomCycleTarget,
} from './src/dangerRoom/DangerRoomMode.js';
import { setRawMouse } from './src/engine/SoftLockSystem.js';
import { getWeaponFeel, skillSfxIndex } from './src/engine/WeaponFeel.js';
import {
  registerHit,
  flashAbilityUsed,
  tickCombatFeedback,
  pulseCrosshairSpread,
} from './src/engine/CombatFeedback.js';
import { CombatPostFX } from './src/engine/CombatPostFX.js';
import { installDangerRoomLighting } from './src/engine/DangerRoomLighting.js';
import { syncAbilityBarFlash } from './src/dangerRoom/dangerRoomHud.js';

const VALID_RACES = ["human", "barbarian", "elf", "dwarf", "orc", "undead"];
const VALID_CLASSES = ["warrior", "mage", "ranger", "worge"];

function sanitizeArenaConfig(cfg = {}) {
  const race = VALID_RACES.includes(cfg.race) ? cfg.race : "human";
  const classId = VALID_CLASSES.includes(cfg.classId) ? cfg.classId : "warrior";
  const heroId = DefaultHeroForRace[race] || "human";
  const hero = getHero(heroId);
  const weapon = hero?.weapons?.includes(cfg.weapon)
    ? cfg.weapon
    : hero?.defaultWeapon || "greatsword";

  return {
    ...cfg,
    race,
    classId: VALID_CLASSES.includes(classId) ? classId : "warrior",
    weapon,
  };
}

// ── Spawn helpers — delegate to ProceduralArena ──
const ArenaMatchStatic = {
  getSpawnPosition: getArenaSpawnPosition,
  getSpawnFacing:   getArenaSpawnFacing,
};

// ── Main Game Class ──

class GrudgeArena {
  constructor(config = {}) {
    this.config = config;
    this.container =
      config.container || document.getElementById("game-root") || document.body;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = new THREE.Clock();
    this._disposed = false;

    this.world = new World();
    this.collisionSystem = new CollisionSystem();
    this.physicsWorld = null;       // cannon-es PhysicsWorld
    this.hitboxManager = null;      // HitboxManager (weapon hitboxes)
    this.particleSystem = null;
    this.spriteSystem = null;
    this.orbitCamera = null;
    this.playerController = null;
    this.gameTimers = new GameTimerSystem();

    this.match = null;
    this.targeting = null;
    this.arenaAI = null;
    this.playerEntity = null;
    this.playerUnit = null;
    this.allUnits = [];
    this.projectiles = [];

    // ── WoW-style combat state ──────────────────────────────────
    // Global cooldown (shared across abilities), per-weapon auto-attack
    // swing timer, and an auto-attack toggle controlled by RMB.
    this._gcdTimer = 0;
    this._gcdDuration = 1.5;
    this._autoAttackTimer = 0;
    this._autoAttackOn = false;
    this._attackSwingIdx = 0;
    this._bowDrawing = false;
    this._bowDrawTimer = 0;
    this._sabreSlashIndex = 0;
    this._casting = false;
    this._playSFX = null;
    this._weaponSfx = null;

    // ── AoE / spline systems ────────────────────────────────────
    this.aoeIndicator   = null;   // AoEIndicator instance (pre-cast targeting circle)
    this._activeMovers  = [];     // TrajectoryMover[] updated each frame
    this._terrainMeshes = [];     // ground meshes registered for indicator terrain snap

    /** Danger Room training mode (from dangerroom.puter.site controller outline). */
    this.dangerMode = config.mode === 'danger';
    this._dangerEnv = null;
    this._dangerUnsub = null;
    this._dangerClampRadius = ARENA_CLAMP_RADIUS;
    this._dangerLighting = null;
    this.postFX = null;
  }

  async init(config) {
    if (config) {
      Object.assign(this.config, config);
      if (config.container) this.container = config.container;
    }
    this.config = sanitizeArenaConfig(this.config);
    this._setupRenderer();
    this._setupScene();
    this._setupLighting();

    this.particleSystem = new ParticleSystem(this.scene);
    this.spriteSystem = new SpriteSystem(this.scene);

    // Initialize physics world (cannon-es) and hitbox manager
    this.physicsWorld = new PhysicsWorld();
    this.hitboxManager = new HitboxManager(this.physicsWorld.world);

    await this._createArena();
    createSkybox(this.scene);

    // Loading progress helper
    const setProgress = (pct, text) => {
      const bar = document.getElementById("loading-bar");
      const label = document.getElementById("loading-text");
      if (bar) bar.style.width = `${pct}%`;
      if (label) label.textContent = text || "Loading...";
    };

    try {
      setProgress(10, "Loading engine modules...");
      const [matchMod, targetMod, aiMod, modelMod] = await Promise.all([
        import("./src/arenaMatch.js"),
        import("./src/targetSystem.js"),
        import("./src/arenaAI.js"),
        import("./src/modelLoader.js"),
      ]);

      this.match = new matchMod.ArenaMatch();
      this.arenaAI = new aiMod.ArenaAI();
      this._playSFX = modelMod.playSFX;
      this._weaponSfx = modelMod.WEAPON_SFX;

      const race = this.config.race || "human";
      const buildConfig = this.config.buildConfig || {};
      const playerWeapon = resolveWeapon(
        race,
        this.config.weapon || "greatsword",
      );
      const playerProfile = this._derivePlayerProfile(buildConfig);

      let TEAM_A;
      let TEAM_B;
      if (this.dangerMode) {
        ({ TEAM_A, TEAM_B } = getDangerTrainingTeams(
          race,
          playerWeapon,
          { ...buildConfig, displayName: this._getPlayerDisplayName(buildConfig) },
        ));
      } else {
        TEAM_A = [
          {
            heroId: DefaultHeroForRace[race] || "human",
            race,
            weapon: playerWeapon,
            isPlayer: true,
            tier: 3,
            displayName: this._getPlayerDisplayName(buildConfig),
            profile: playerProfile,
          },
          { heroId: "elf", weapon: "bow", isPlayer: false, tier: 2 },
          { heroId: "dwarf", weapon: "sabres", isPlayer: false, tier: 2 },
        ];
        TEAM_B = [
          { heroId: "orc", weapon: "greatsword", isPlayer: false, tier: 2 },
          { heroId: "barbarian", weapon: "mace", isPlayer: false, tier: 2 },
          { heroId: "undead", weapon: "staff", isPlayer: false, tier: 3 },
        ];
      }

      setProgress(30, "Loading Team A models...");
      const teamAUnits = await Promise.all(
        TEAM_A.map((c, i) =>
          this._loadUnit(c, "A", i, TEAM_A.length, modelMod),
        ),
      );
      setProgress(60, "Loading Team B models...");
      const teamBUnits = await Promise.all(
        TEAM_B.map((c, i) =>
          this._loadUnit(c, "B", i, TEAM_B.length, modelMod),
        ),
      );
      setProgress(90, "Initializing systems...");

      this.allUnits = [...teamAUnits, ...teamBUnits];
      this.playerUnit = this.allUnits.find((u) => u.isPlayer);
      this.playerEntity = this.playerUnit?.entity;

      // Hydrate the player's persistent inventory (backend → localStorage → memory).
      // Fire-and-forget: the match can start before the network resolves; the UI
      // will re-render once the inventory component version bumps.
      if (this.playerEntity) {
        inventorySystem
          .loadForPlayer(this.playerEntity)
          .catch((e) =>
            console.warn("[GrudgeArena] inventory load failed:", e.message),
          );
        this.inventoryUI = new InventoryUI(this.playerEntity, inventorySystem);
        this._bindInventoryHotkeys();
      }

      this.targeting = new targetMod.TargetSystem(
        this.camera,
        this.scene,
        this.renderer,
      );
      for (const u of this.allUnits) this.targeting.register(u);

      // Create physics bodies + hitboxes for all units, detectors for AI
      this._initPhysicsBodies();

      if (!this.dangerMode) {
        for (const u of this.allUnits) {
          if (!u.isPlayer) {
            const physicsCtx = {
              physicsBody: u.physicsBody || null,
              detector: u.aiDetector || null,
              behaviorFSM: u.aiBehaviorFSM || null,
            };
            this.arenaAI.register(u, physicsCtx);
          }
        }
      }
      this.match.registerTeams(teamAUnits, teamBUnits);

      // Wire up OrbitCamera + ArenaController for the player unit
      if (this.playerUnit) {
        this.orbitCamera = new OrbitCamera(
          this.camera,
          this.renderer.domElement,
        );
        this.orbitCamera.setTarget(this.playerUnit.mesh);
        // Register arena obstacles for souls-like camera wall collision
        if (this._obstacleMeshes?.length) {
          this.orbitCamera.setCollisionMeshes(this._obstacleMeshes);
        }
        // Snap camera to sit behind the player immediately on spawn.
        this.orbitCamera.snapBehind();

        this.playerController = new ArenaController(
          this.playerUnit.mesh,
          this.playerUnit.controller,
          this.orbitCamera,
        );
        if (this.dangerMode && this._dangerClampRadius) {
          this.playerController.clampRadius = this._dangerClampRadius;
        }
        // Wire combat callbacks. RMB toggles auto-attack (WoW-style) —
        // _performAttack is driven by _updateAutoAttack each frame.
        this.playerController.onAttack = (_type) => this._toggleAutoAttack();

        // onAbility receives:
        //   'Q' | 'E' | 'R' | 'F'  → skill slots 1-4 (mapped to weapon ability keys)
        //   '6' | '7' | '8'         → consumable slots 6-8 (hotbar positions)
        this.playerController.onAbility = (slotKey) => {
          if (['Q','E','R','F'].includes(slotKey)) {
            // Skill slots 1-4 — slotKey is the ability map key used by WeaponDefinitions
            this.useAbility(slotKey);
          } else if (['6','7','8'].includes(slotKey)) {
            // Consumable slots — route to inventory system's use-item handler
            const idx = parseInt(slotKey, 10);  // 6, 7, or 8
            this.inventoryUI?.useConsumableSlot?.(idx - 5);  // slot index 1-3
          }
        };

        // Tab → cycle to next enemy target (WoW-style)
        // TargetSystem.cycleEnemies() already handles Tab natively via its own
        // _setupInput() listener; this callback lets ArenaController's onTarget
        // also trigger it programmatically (e.g. from gamepad or custom binds).
        this.playerController.onTarget = () => {
          if (this.dangerMode) {
            dangerRoomCycleTarget(this);
          } else {
            this.targeting?.cycleEnemies();
          }
        };

        this.playerController.onDash = () => {
          const fwd = this.playerController.getForward();
          const dashFeel = getWeaponFeel(this._getWeaponTypeKey?.() ?? "greatsword");
          const dashColor = dashFeel?.accent ? new THREE.Color(dashFeel.accent) : new THREE.Color(0x3366ff);
          this.particleSystem?.emit({
            position: this.playerUnit.mesh.position
              .clone()
              .add(new THREE.Vector3(0, 0.5, 0)),
            color: dashColor,
            count: dashFeel?.title === "ASSASSIN" ? 28 : 20,
            velocity: fwd.clone().multiplyScalar(-4),
            spread: 1.5,
            lifetime: 0.4,
            size: 0.2,
          });
          this._playSFX?.(this._weaponSfx?.ui?.dash, 0.35);
        };

        // Wire animation finished → FSM 'finish' event for combo chains
        if (this.playerUnit.mixer) {
          this.playerUnit.mixer.addEventListener("finished", () => {
            this.playerController?.send({ type: "finish" });
          });
        }
      }

      if (this.dangerMode) {
        this._setupSoftLockInput();
        bootstrapDangerRoom(this);
        if (this.playerController && this._dangerClampRadius) {
          this.playerController.clampRadius = this._dangerClampRadius;
        }
        for (const mesh of this._dangerEnv?.terrainMeshes || []) {
          this.collisionSystem.addCollider(mesh, "environment");
        }
        this._dangerLighting = installDangerRoomLighting(this.scene, this);
        this.postFX = new CombatPostFX(this.renderer, this.scene, this.camera);
      }

      const gameUI = document.getElementById("gameUI");
      if (gameUI) gameUI.style.display = "block";
      setProgress(100, "Ready!");
      if (this.dangerMode) {
        console.log("[arena] Danger Room training loaded — race:", race);
      } else {
        this.match.start();
        console.log("[arena] 3v3 Arena loaded — race:", race);
      }
      this.updateWeaponUI();
    } catch (err) {
      console.error("[arena] Failed to load arena systems:", err);
      this._showError(err);
      try {
        this._createFallbackPlayer();
      } catch (fallbackErr) {
        console.error("[arena] Fallback player failed:", fallbackErr);
      }
    }

    this._animate();
  }

  // ── Renderer / Scene / Lighting ──

  _setupRenderer() {
    const existingCanvas = this.container.querySelector("canvas");
    const opts = {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    };
    if (existingCanvas) opts.canvas = existingCanvas;
    this.renderer = new THREE.WebGLRenderer(opts);
    this.renderer.setSize(
      this.container.clientWidth || window.innerWidth,
      this.container.clientHeight || window.innerHeight,
    );
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (!existingCanvas) {
      this.renderer.domElement.style.display = "block";
      this.container.appendChild(this.renderer.domElement);
    }
    window.addEventListener("resize", () => {
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.postFX?.setSize(w, h);
    });
  }

  _setupSoftLockInput() {
    if (this._softLockMove) return;
    this._softLockMove = (e) => setRawMouse(e.clientX, e.clientY);
    window.addEventListener("mousemove", this._softLockMove, { passive: true });
    const rect = this.renderer?.domElement?.getBoundingClientRect?.();
    if (rect) {
      setRawMouse(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5);
    }
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);
    // Tighter fog for the small arena — not visible beyond the wall (~35m)
    this.scene.fog = new THREE.Fog(0x0a0a0f, 28, 55);
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.05,
      500,
    );
    this.camera.position.set(0, 8, 12);
    this.camera.lookAt(0, 1, 0);
  }

  _setupLighting() {
    this.scene.add(new THREE.AmbientLight(0xb0c4de, 1.0)); // bumped 0.6→1.0 for better model visibility
    this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x362d1e, 0.5));
    const dir = new THREE.DirectionalLight(0xfff5e1, 1.2);
    dir.position.set(10, 20, 10);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 80;
    dir.shadow.camera.left = -25;
    dir.shadow.camera.right = 25;
    dir.shadow.camera.top = 25;
    dir.shadow.camera.bottom = -25;
    dir.shadow.bias = -0.001;
    this.scene.add(dir);
    const rim = new THREE.DirectionalLight(0x8888ff, 0.3);
    rim.position.set(-10, 15, -15);
    this.scene.add(rim);
    const warm = new THREE.PointLight(0xff8844, 0.3, 40);
    warm.position.set(15, 8, 15);
    this.scene.add(warm);
  }

  // ── Arena construction ──

  async _createArena() {
    if (this.dangerMode) {
      // Danger Room environment is built after units load (bootstrapDangerRoom).
      this._terrainMeshes = [];
      this._obstacleMeshes = [];
      this.aoeIndicator = new AoEIndicator(this.scene, this._terrainMeshes);
      console.log('[arena] Danger Room mode — chamber builds after character load');
      return;
    }

    // Build the procedural PvP arena (no external assets required).
    const { terrainMeshes, obstacleMeshes } = buildArena(this.scene);
    for (const mesh of terrainMeshes) {
      this.collisionSystem.addCollider(mesh, 'environment');
      this._terrainMeshes.push(mesh);
    }
    this._obstacleMeshes = obstacleMeshes || [];
    console.log(`[arena] Procedural PvP arena built — ${obstacleMeshes.length} camera collision meshes`);

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const group = new THREE.Group();
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 4, 8), new THREE.MeshStandardMaterial({ color: 0x2a2a4e, metalness: 0.6, roughness: 0.4, emissive: 0x3366ff, emissiveIntensity: 0.1 }));
      col.position.y = 2; col.castShadow = true; group.add(col);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), createShaderMaterial('frost'));
      orb.position.y = 4.2; group.add(orb);
      const pillarLight = new THREE.PointLight(0x4488ff, 1, 8, 2);
      pillarLight.position.set(0, 4.5, 0);
      group.add(pillarLight);
      group.position.set(Math.cos(angle) * 35, 0, Math.sin(angle) * 35);
      this.scene.add(group);
    }
    this.aoeIndicator = new AoEIndicator(this.scene, this._terrainMeshes);
  }

  // ── Unit loading ──

  _getPlayerDisplayName(buildConfig) {
    const classId = buildConfig?.classId || this.config.classId || "warrior";
    const archetype = classId.charAt(0).toUpperCase() + classId.slice(1);
    const name = this.config.playerName || "Warlord";
    return `${name} · ${archetype}`;
  }

  _derivePlayerProfile(buildConfig) {
    const attrs = buildConfig?.attributes || {};
    const ringTier = buildConfig?.ringTier || "iron";
    const ringPerks = new Set(buildConfig?.ringPerks || []);

    const tierMult =
      {
        iron: 1,
        bronze: 1.03,
        mythic: 1.08,
        ascendant: 1.14,
      }[ringTier] || 1;

    const hpBase =
      1000 +
      (attrs.Vitality || 0) * 8 +
      (attrs.Endurance || 0) * 5 +
      (attrs.Strength || 0) * 2;
    const shieldBase = 180 + (attrs.Wisdom || 0) * 3 + (attrs.Tactics || 0) * 2;
    const moveBase = 5 + (attrs.Agility || 0) * 0.012;

    return {
      health: Math.floor(hpBase * tierMult),
      shield: Math.floor(shieldBase * (ringPerks.has("aegis") ? 1.12 : 1)),
      moveSpeed: moveBase * (ringPerks.has("celerity") ? 1.06 : 1),
      manaMax: 100 + (attrs.Intellect || 0) * 1.2 + (attrs.Wisdom || 0) * 0.6,
      energyMax:
        100 + (attrs.Dexterity || 0) * 0.8 + (attrs.Agility || 0) * 0.8,
      rageMax: 100 + (attrs.Strength || 0) * 0.6 + (attrs.Endurance || 0) * 0.4,
      cdrMult: ringPerks.has("focus") ? 0.9 : 1,
      damageMult: ringPerks.has("valor") ? 1.08 : 1,
      combatPower: buildConfig?.combatPower || 0,
      classId: buildConfig?.classId || this.config.classId || "warrior",
      ringTier,
    };
  }

  async _loadUnit(comp, teamId, slot, teamSize, modelMod) {
    const spawnPos = this.dangerMode
      ? getDangerSpawnPosition(teamId, slot, teamSize)
      : ArenaMatchStatic.getSpawnPosition(teamId, slot, teamSize);
    const facing = this.dangerMode
      ? getDangerSpawnFacing(teamId)
      : ArenaMatchStatic.getSpawnFacing(teamId);
    // Grudge UUID so unit identity is cross-app compatible (mob logs, match replay, etc.)
    const uuid = generateGrudgeUuid(
      comp.isPlayer ? "character" : "mob",
      `${teamId}-${slot}`,
    );
    const weaponDef =
      WeaponDefinitions[comp.weapon] ||
      WeaponDefinitions[WeaponTypes.GREATSWORD];

    // Use hero prefab if heroId is specified, otherwise fall back to race/weapon.
    // If hero asset loading fails (e.g. 404 in production), fall through to the
    // generic race model instead of letting the whole team load reject.
    let unitResult;
    if (comp.heroId && !this.dangerMode) {
      const hero = getHero(comp.heroId);
      if (hero) {
        try {
          unitResult = await modelMod.createHeroUnit(
            hero,
            comp.weapon || null,
            {
              tier: comp.tier || 1,
            },
          );
        } catch (err) {
          console.warn(
            `[arena] hero "${comp.heroId}" model load failed; falling back to race model:`,
            err.message,
          );
        }
      }
    }
    if (!unitResult) {
      const raceId =
        comp.race ||
        (comp.heroId ? getHero(comp.heroId)?.race : null) ||
        comp.heroId ||
        "human";
      if (this.dangerMode && modelMod.createBakedGrudge6Unit) {
        try {
          unitResult = await modelMod.createBakedGrudge6Unit(raceId, comp.weapon, {
            tier: comp.tier || 1,
          });
        } catch (err) {
          const detail =
            err?.paths?.length > 0
              ? `${err.message} [${err.paths.map((p) => p.path).join(", ")}]`
              : err.message;
          console.warn(
            `[arena] baked grudge6 load failed for ${raceId}; falling back to legacy:`,
            detail,
          );
        }
      }
      if (!unitResult) {
        unitResult = await modelMod.createAnimatedUnit(raceId, comp.weapon, {
          tier: comp.tier || 1,
        });
      }
    }

    const {
      scene: mesh,
      mixer,
      controller,
      raceConfig,
      resolvedWeapon,
    } = unitResult;
    const groundedY = mesh.position.y;
    mesh.position.copy(spawnPos);
    mesh.position.y = groundedY;
    mesh.rotation.y = facing;
    this.scene.add(mesh);

    const actualWeaponDef = WeaponDefinitions[resolvedWeapon] || weaponDef;
    const profile = comp.profile || null;

    const healthMax = profile?.health || 1000;
    const shieldMax = profile?.shield || 200;
    const moveSpeed = profile?.moveSpeed || 5;
    const resources = Components.Resources();
    if (profile) {
      resources.mana.max = Math.floor(profile.manaMax || resources.mana.max);
      resources.mana.current = resources.mana.max;
      resources.energy.max = Math.floor(
        profile.energyMax || resources.energy.max,
      );
      resources.energy.current = resources.energy.max;
      resources.rage.max = Math.floor(profile.rageMax || resources.rage.max);
    }

    // Base stats are equal for all races — actual stats come from
    // equipped gear (Cloth/Leather/Metal × 6 sets) and attribute allocation
    const entity = this.world
      .createEntity()
      .addComponent(
        "Transform",
        Components.Transform(spawnPos.x, 0, spawnPos.z),
      )
      .addComponent("Velocity", Components.Velocity())
      .addComponent("Health", Components.Health(healthMax))
      .addComponent("Shield", Components.Shield(shieldMax))
      .addComponent("Resources", resources)
      .addComponent("Collider", Components.Collider(0.5, 1.8))
      .addComponent("Movement", Components.Movement(moveSpeed))
      .addComponent(
        "WeaponState",
        Components.WeaponState(resolvedWeapon, resolvedWeapon),
      )
      .addComponent("AbilityState", Components.AbilityState())
      .addComponent("RenderMesh", Components.RenderMesh(mesh))
      .addComponent("BuildProfile", profile || {})
      .addComponent("TargetInfo", {
        displayName:
          comp.displayName ||
          unitResult.hero?.displayName ||
          `${raceConfig.name} ${actualWeaponDef.title || ""}`.trim(),
        race: unitResult.race || comp.race,
        weaponType: resolvedWeapon,
        team: teamId,
        faction: raceConfig.faction,
        role: raceConfig.role,
      });

    if (comp.isPlayer) {
      entity.addTag("player");
      // Persistent gear/inventory lives on the player entity only; AI units are ephemeral.
      entity
        .addComponent("Inventory", Components.Inventory(40))
        .addComponent("Equipment", Components.Equipment())
        .addComponent("SkillBar", Components.SkillBar(9));
    }
    entity.addTag(teamId === "A" ? "teamA" : "teamB");
    this.collisionSystem.addCollider(mesh, teamId === "A" ? "ally" : "enemy", {
      entity,
      uuid,
    });

    return {
      entity,
      mesh,
      mixer,
      controller,
      team: teamId,
      isPlayer: !!comp.isPlayer,
      weaponDef: actualWeaponDef,
      race: comp.race,
      raceConfig,
      uuid,
    };
  }

  /**
   * Create cannon-es physics bodies, hitboxes, AI detectors, and behavior FSMs
   * for all loaded units. Called once after all units are loaded.
   */
  _initPhysicsBodies() {
    if (!this.physicsWorld) return;
    const pw = this.physicsWorld;

    for (const unit of this.allUnits) {
      const isTeamA = unit.team === 'A';
      const group = isTeamA ? GROUP_PLAYER : GROUP_ENEMY;
      const mask  = GROUP_SCENE
        | (isTeamA ? GROUP_ENEMY : GROUP_PLAYER)
        | (isTeamA ? GROUP_ENEMY : GROUP_PLAYER)  // same — for clarity
        | GROUP_TRIGGER;

      // Character physics body
      const spawnPos = unit.mesh.position;
      const body = pw.createCharacterBody(
        { x: spawnPos.x, y: 0.9, z: spawnPos.z },
        0.5, 1.8, group, mask,
      );
      body.belongTo = {
        unit,
        isPlayer: isTeamA,
        isEnemy: !isTeamA,
        // Callbacks for HitboxSystem collision resolution
        onHit: (evt, attackerOwner) => {
          const hp = unit.entity.getComponent('Health');
          if (!hp || hp.invulnerable) return;
          const dmg = (attackerOwner?.unit?.weaponDef?.baseAttackDamage || 30)
            * (0.8 + Math.random() * 0.4);
          hp.current = Math.max(0, hp.current - dmg);
          hp.lastDamageTime = performance.now();
          unit.controller?.playOnce('hit', 1.5);

          // Spawn hit splash at contact point
          if (evt?.body?.position) {
            new HitSplash(this.scene, new THREE.Vector3(
              evt.body.position.x, evt.body.position.y, evt.body.position.z,
            ));
          }

          if (hp.current <= 0) {
            unit.entity.addTag('dead');
            unit.controller?.play('death', { loop: false });
          }
        },
        onBlocked: () => {
          unit.controller?.playOnce('block', 1.0);
        },
      };
      unit.physicsBody = body;

      // Hitbox (weapon collider)
      this.hitboxManager.register(unit);

      // AI-only: detector + behavior FSM
      if (!unit.isPlayer) {
        const detectorRadius = (unit.weaponDef?.range ?? 0) > 5 ? 20 : 12;
        const targetGroup = isTeamA ? GROUP_ENEMY : GROUP_PLAYER;
        const detector = new AIDetector(pw.world, body, {
          radius: detectorRadius,
          targetGroup,
        });
        unit.aiDetector = detector;

        // Infer class from weapon for behavior FSM
        const classId = this._inferClassFromWeapon(unit.weaponDef);
        // AI units don't have ArenaController, so we create a lightweight
        // character FSM actor for them if not already present.
        const charFSM = unit.controller?._fsmService || unit._fsmService;
        if (charFSM) {
          const behaviorFSM = createAIBehaviorFSM(classId, charFSM);
          unit.aiBehaviorFSM = behaviorFSM;
        }
      }
    }

    console.log('[arena] Physics bodies created for', this.allUnits.length, 'units');
  }

  /** Map weapon definition to one of the 4 classes: warrior, ranger, mage, worge. */
  _inferClassFromWeapon(weaponDef) {
    if (!weaponDef) return 'warrior';
    const name = weaponDef.name?.toLowerCase() || '';
    if (name === 'mace') return 'worge';
    if (weaponDef.primaryResource === 'mana') return 'mage';
    if ((weaponDef.range ?? 0) > 5) return 'ranger';
    return 'warrior';
  }

  _createFallbackPlayer() {
    const player = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.4, 1, 8, 16),
      new THREE.MeshStandardMaterial({
        color: 0x3366ff,
        metalness: 0.3,
        roughness: 0.7,
        emissive: 0x3366ff,
        emissiveIntensity: 0.1,
      }),
    );
    body.position.y = 1;
    body.castShadow = true;
    player.add(body);
    this.scene.add(player);

    this.playerEntity = this.world
      .createEntity()
      .addComponent("Transform", Components.Transform())
      .addComponent("Velocity", Components.Velocity())
      .addComponent("Health", Components.Health(1000))
      .addComponent("Resources", Components.Resources())
      .addComponent("Movement", Components.Movement(5))
      .addComponent(
        "WeaponState",
        Components.WeaponState(WeaponTypes.GREATSWORD, WeaponTypes.BOW),
      )
      .addComponent("AbilityState", Components.AbilityState())
      .addComponent("RenderMesh", Components.RenderMesh(player))
      .addTag("player");

    this.playerUnit = {
      entity: this.playerEntity,
      mesh: player,
      controller: null,
      team: "A",
      isPlayer: true,
      weaponDef: WeaponDefinitions[WeaponTypes.GREATSWORD],
    };
    this.allUnits = [this.playerUnit];
    this.orbitCamera = new OrbitCamera(this.camera, this.renderer.domElement);
    this.orbitCamera.setTarget(player);
    const gameUI = document.getElementById("gameUI");
    if (gameUI) gameUI.style.display = "block";
  }

  /** Show error overlay with message */
  _showError(err) {
    const overlay = document.getElementById("error-overlay");
    const msg = document.getElementById("error-message");
    if (overlay) overlay.classList.add("active");
    const detail = err?.message || String(err) || "unknown error";
    if (msg) msg.textContent = `Engine load failed: ${detail}`;
    console.error("[arena] Error detail:", err?.stack || err);
    // Auto-dismiss after 5s if fallback loaded
    setTimeout(() => {
      if (overlay) overlay.classList.remove("active");
    }, 5000);
  }

  // ── Combat ──

  getCurrentWeapon() {
    const ws = this.playerEntity?.getComponent("WeaponState");
    if (!ws) return null;
    return WeaponDefinitions[
      ws.activeSlot === "primary" ? ws.primary : ws.secondary
    ];
  }

  _getWeaponTypeKey() {
    const ws = this.playerEntity?.getComponent("WeaponState");
    if (!ws) return "greatsword";
    return ws.activeSlot === "primary" ? ws.primary : ws.secondary;
  }

  _playAttackSfx(weaponType) {
    const pool = this._weaponSfx?.[weaponType]?.attack;
    if (pool && this._playSFX) this._playSFX(pool, weaponType === "bow" ? 0.32 : 0.4);
  }

  _playSkillSfx(weaponType, slotKey) {
    const skills = this._weaponSfx?.[weaponType]?.skill;
    if (!skills?.length || !this._playSFX) return;
    const idx = skillSfxIndex(slotKey);
    this._playSFX(skills[idx] ?? skills[0], 0.42);
  }

  _emitWeaponSlash(pos, fwd, feel) {
    const melee = feel?.melee;
    const color = melee?.particleColor ?? 0xffffff;
    this.particleSystem?.emit({
      position: pos,
      color: new THREE.Color(color),
      count: melee?.particleCount ?? 10,
      velocity: fwd.clone(),
      spread: melee?.particleSpread ?? 0.5,
      lifetime: feel?.title === "WORGE" ? 0.32 : 0.22,
      size: melee?.particleSize ?? 0.1,
    });
  }

  /**
   * Snap the player mesh to face a target (WoW-arena auto-face behaviour).
   * Also syncs ArenaController's targetYaw so its rotation-smoothing doesn't
   * immediately rotate the player back toward the camera direction.
   */
  _faceTarget(target) {
    if (!target?.mesh || !this.playerUnit?.mesh) return;
    const src = this.playerUnit.mesh.position;
    const dst = target.mesh.position;
    const yaw = Math.atan2(dst.x - src.x, dst.z - src.z);
    this.playerUnit.mesh.rotation.y = yaw;
    if (this.playerController) this.playerController.targetYaw = yaw;
  }

  useAbility(key) {
    if (!this.playerUnit || !this.playerEntity) return;
    if (this.playerEntity.hasTag("dead")) return;
    const weapon = this.getCurrentWeapon();
    const ability = weapon?.abilities[key];
    if (!ability) return;

    // GCD (WoW-style 1.5s shared cooldown)
    if (this._gcdTimer > 0 && ability.offGCD !== true) return;

    const as = this.playerEntity.getComponent("AbilityState");
    if (!as || as.cooldowns[key] > 0) return;

    // Range check vs. current target (WoW: "Out of range" fail)
    const target = this.targeting?.currentTarget;
    const needsTarget =
      ability.range !== undefined || ability.requiresTarget === true;
    if (needsTarget) {
      if (
        !target ||
        target.team === this.playerUnit.team ||
        target.entity?.hasTag("dead")
      )
        return;
      const range = ability.range ?? weapon.range ?? 5;
      const dist = this.playerUnit.mesh.position.distanceTo(
        target.mesh.position,
      );
      if (dist > range + 1) return;
    }

    const res = this.playerEntity.getComponent("Resources");
    if (ability.cost && ability.costType && res) {
      const pool = res[ability.costType];
      if (pool && pool.current < ability.cost) return;
      if (pool) pool.current -= ability.cost;
    }

    // Face target before animating
    if (target && target.team !== this.playerUnit.team)
      this._faceTarget(target);

    as.cooldowns[key] = ability.cooldown;
    if (ability.offGCD !== true) this._gcdTimer = this._gcdDuration;

    const weaponType = this._getWeaponTypeKey();
    const feel = getWeaponFeel(weaponType);
    const animSpeed = feel.skillAnimSpeed ?? 1.0;
    const ctrl = this.playerUnit.controller;

    flashAbilityUsed(key);
    this._playSkillSfx(weaponType, key);

    const castTime = ability.castTime ?? 0;
    const selfCastEffects = new Set(["meteor"]);
    if (castTime > 0 && !selfCastEffects.has(ability.effect)) {
      this._casting = true;
      if (ctrl) ctrl.playOnce(this._getSkillAnim(ability), animSpeed * 0.82);
      this.gameTimers.add(castTime, () => {
        this._casting = false;
        this._executeAbility(ability);
      });
    } else {
      if (ctrl) ctrl.playOnce(this._getSkillAnim(ability), animSpeed);
      this._executeAbility(ability);
    }
    this._updateUI();
  }

  /**
   * Resolve the animation clip name for an ability. Prefers the explicit
   * `ability.skillAnim` declared on the weapon definition; falls back to a
   * generic per-effect map; finally defaults to `attack1` (which the
   * AnimationController will itself fall back to idle if missing).
   */
  _getSkillAnim(ability) {
    if (typeof ability === "string") ability = { effect: ability };
    if (ability?.skillAnim) return ability.skillAnim;
    const map = {
      fireball: "cast",
      dot_projectile: "attack2",
      lifesteal_projectile: "attack1",
      multi_projectile: "attack3",
      debuff_target: "attack2",
      frost_nova: "aoe",
      meteor: "cast2H",
      aoe_zone: "attack3",
      shield: "block",
      buff_damage: "taunt",
      reset_cooldowns: "powerUp",
      dash: "jumpAttack",
      blink: "dodge",
      teleport_behind: "dodge",
      aoe_melee: "slash3",
      execute: "attack4",
      aoe_strike: "swing",
      stealth: "crouch",
      projectile_pull: "combo2",
      melee_lifesteal: "attack2",
      aoe_shield: "powerUp",
      beam: "cast",
      ground_zone: "swing",
      full_heal_invuln: "block",
      bear_form: "powerUp",
    };
    return map[ability?.effect] || "attack1";
  }

  _executeAbility(ability) {
    if (!this.playerUnit) return;
    const mesh = this.playerUnit.mesh;
    const pos  = mesh.position.clone();
    const fwd  = new THREE.Vector3(0, 0, -1).applyQuaternion(mesh.quaternion);
    const LIMIT = 35;

    // Resolve target position: use current target's position if alive + in range,
    // otherwise aim directly in front of the player.
    const _targetPos = () => {
      const t = this.targeting?.currentTarget;
      if (t && t.team !== this.playerUnit.team && !t.entity?.hasTag('dead'))
        return t.mesh.position.clone().setY(0);
      return pos.clone().add(fwd.clone().multiplyScalar(10)).setY(0);
    };

    switch (ability.effect) {

      // ── Fireball (unchanged) ────────────────────────────────────────
      case 'fireball':
        this._createProjectile({
          position:  pos.clone().add(fwd).add(new THREE.Vector3(0, 1, 0)),
          direction: fwd,
          speed: 20,  damage: ability.damage,  color: 0xff4400,
          shader: 'fireball',  lifetime: 3,
          onHit: (_t, pt) => this.particleSystem.emitExplosion(pt, new THREE.Color(0xff4400), 50),
        });
        break;

      // ── Frost Nova — upgraded with GroundSlamVFX + AoE damage ────────────
      case 'frost_nova': {
        const r = ability.radius ?? ability.freezeDuration ?? 5;
        // Existing frost ring shader
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.5, r, 32),
          createShaderMaterial('frost'),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(pos).setComponent(1, 0.1);
        this.scene.add(ring);
        this.gameTimers.add(2.5, () => { this.scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); });
        // New: ice-colored GroundSlamVFX
        spawnGroundSlamVFX(this.scene, pos, { radius: r, color: 0x44aaff, debrisCount: 40 });
        this._applyAoEDamage(pos, r, ability.damage ?? 30);
        this.particleSystem.emit({ position: pos, color: new THREE.Color(0x88ccff),
          count: 50, velocity: new THREE.Vector3(0, 0.8, 0), spread: r * 0.6, lifetime: 1.5, size: 0.2 });
        break;
      }

      // ── Colossus Smash / aoe_strike — fire+lightning ground slam ───────
      case 'aoe_strike': {
        const r = ability.aoeRadius ?? 4;
        spawnGroundSlamVFX(this.scene, pos, { radius: r, color: 0xff8800, debrisCount: 50 });
        this._applyAoEDamage(pos, r, ability.damage ?? 120);
        this.aoeIndicator?.show(pos, r, 0xff8800);
        this.gameTimers.add(0.35, () => this.aoeIndicator?.hide());
        break;
      }

      // ── Blade Dance / aoe_melee — spinning close-range AoE ──────────
      case 'aoe_melee': {
        const r = ability.radius ?? 3;
        spawnGroundSlamVFX(this.scene, pos, { radius: r, color: 0xffffff, debrisCount: 25 });
        this._applyAoEDamage(pos, r, ability.damage ?? 40);
        this.particleSystem.emit({ position: pos.clone().add(new THREE.Vector3(0, 1, 0)),
          color: new THREE.Color(0xffffff), count: 30, velocity: new THREE.Vector3(0, 0.5, 0),
          spread: r * 0.5, lifetime: 0.6, size: 0.12 });
        break;
      }

      // ── Meteor Strike — castTime indicator + SplineTrajectory arc + GroundSlamVFX
      case 'meteor': {
        const r        = ability.radius   ?? 6;
        const castTime = ability.castTime ?? 1.5;
        const targetP  = _targetPos();

        // Show AoE indicator during cast
        this.aoeIndicator?.show(targetP, r, 0xff4400);

        // After cast completes, hide indicator and launch the meteor
        this.gameTimers.add(castTime, () => {
          this.aoeIndicator?.hide();

          // Spawn point: high above the target
          const skyPos = targetP.clone();
          skyPos.y = 18;

          const traj = SplineTrajectory.arcPath(skyPos, targetP, {
            apexHeight: 1.5,  // barely arcs — mostly straight drop
            apexBias:   0.08, // apex near the start (sky side)
          });

          // Meteor mesh — fireball shader sphere
          const mGeo  = new THREE.SphereGeometry(0.55, 12, 12);
          const mMat  = createShaderMaterial('fireball');
          const mMesh = new THREE.Mesh(mGeo, mMat);
          mMesh.add(new THREE.PointLight(0xff4400, 4, 10));
          this.scene.add(mMesh);

          // Fading trail attached to scene
          const trail = traj.buildFadingTrail({ color: 0xff4400, radius: 0.14 });
          this.scene.add(trail);

          const mover = new TrajectoryMover(mMesh, traj, {
            duration:    0.75,
            easing:      'easeIn',
            faceForward: true,
            onComplete: () => {
              this.scene.remove(mMesh);
              mGeo.dispose(); mMat.dispose();
              this.scene.remove(trail);
              trail.geometry?.dispose(); trail.material?.dispose();
              // Impact!
              spawnGroundSlamVFX(this.scene, targetP, {
                radius: r, color: 0xff4400, meteor: true, debrisCount: 90,
              });
              this._applyAoEDamage(targetP, r, ability.damage ?? 150);
              this.particleSystem.emitExplosion(targetP, new THREE.Color(0xff4400), 45);
            },
          });
          mover.start();
          this._activeMovers.push(mover);
        });
        break;
      }

      // ── Cloudkill / aoe_zone — indicator + persistent poison zone ─────
      case 'aoe_zone': {
        const r        = ability.radius   ?? 5;
        const duration = ability.duration ?? 5;
        const tickRate = ability.tickRate ?? 0.5;
        const targetP  = _targetPos();
        // Brief indicator flash, then detonate
        this.aoeIndicator?.show(targetP, r, 0x44cc44);
        this.gameTimers.add(0.3, () => {
          this.aoeIndicator?.hide();
          spawnGroundSlamVFX(this.scene, targetP, { radius: r, color: 0x44cc44, debrisCount: 20 });
          let ticks    = 0;
          const maxT   = Math.floor(duration / tickRate);
          const tick   = () => {
            if (ticks++ >= maxT) return;
            this._applyAoEDamage(targetP, r, ability.damage ?? 10);
            this.particleSystem.emit({ position: targetP.clone().add(new THREE.Vector3(0, 0.3, 0)),
              color: new THREE.Color(0x44cc44), count: 10, velocity: new THREE.Vector3(0, 0.4, 0),
              spread: r * 0.5, lifetime: 1.2, size: 0.15 });
            this.gameTimers.add(tickRate, tick);
          };
          tick();
        });
        break;
      }

      // ── Consecration / ground_zone — holy ground at caster ─────────
      case 'ground_zone': {
        const r        = ability.radius   ?? 4;
        const duration = ability.duration ?? 6;
        const dmgTick  = ability.damagePerTick ?? 20;
        spawnGroundSlamVFX(this.scene, pos, { radius: r, color: 0xffdd88, debrisCount: 20 });
        this.aoeIndicator?.show(pos, r, 0xffdd88);
        this.gameTimers.add(duration, () => this.aoeIndicator?.hide());
        // Initial + 3 additional ticks over duration
        this._applyAoEDamage(pos, r, dmgTick);
        for (let i = 1; i <= 3; i++) {
          this.gameTimers.add(duration * (i / 4), () => this._applyAoEDamage(pos, r, dmgTick));
        }
        break;
      }

      // ── Shield (unchanged) ────────────────────────────────────────
      case 'shield': {
        const s = new THREE.Mesh(
          new THREE.SphereGeometry(1.5, 32, 32),
          new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
        );
        mesh.add(s);
        this.gameTimers.add(ability.duration || 3, () => mesh.remove(s));
        break;
      }

      // ── Dash (unchanged) ───────────────────────────────────────
      case 'dash':
        mesh.position.addScaledVector(fwd, ability.distance || 10);
        mesh.position.x = Math.max(-LIMIT, Math.min(LIMIT, mesh.position.x));
        mesh.position.z = Math.max(-LIMIT, Math.min(LIMIT, mesh.position.z));
        this.particleSystem?.emit({
          position: pos, color: new THREE.Color(0x3366ff),
          count: 18, velocity: fwd.clone().multiplyScalar(-2.5), spread: 0.6, lifetime: 0.5, size: 0.15,
        });
        break;

      // ── Blink (unchanged) ───────────────────────────────────────
      case 'blink': {
        const np = pos.clone().add(fwd.clone().multiplyScalar(ability.distance || 8));
        np.x = Math.max(-LIMIT, Math.min(LIMIT, np.x));
        np.z = Math.max(-LIMIT, Math.min(LIMIT, np.z));
        mesh.position.copy(np);
        for (const p of [pos, np])
          this.particleSystem.emit({ position: p, color: new THREE.Color(0x8844ff),
            count: 18, velocity: new THREE.Vector3(0, 1, 0), spread: 1, lifetime: 0.6, size: 0.2 });
        break;
      }

      // ── Werebear Form — scale up, tint brown, buff stats ────────────
      case 'bear_form': {
        const dur = ability.duration ?? 12;
        const origScale = mesh.scale.clone();
        // Scale up 1.5× for bear form
        mesh.scale.multiplyScalar(1.5);
        // Brown fur tint
        const bearColor = new THREE.Color(0x5a3a1a);
        const origColors = [];
        mesh.traverse((child) => {
          if (!child.isMesh || !child.material) return;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const mat of mats) {
            if (!mat?.isMeshStandardMaterial) continue;
            origColors.push({ mat, color: mat.color.clone(), map: mat.map });
            mat.color.copy(bearColor);
            mat.map = null;
            mat.needsUpdate = true;
          }
        });
        // Buff HP +50%
        const hp = this.playerEntity?.getComponent('Health');
        const hpBefore = hp?.max || 1000;
        if (hp) { hp.max = Math.floor(hpBefore * 1.5); hp.current = hp.max; }
        // Green rage particles
        spawnGroundSlamVFX(this.scene, pos, { radius: 3, color: 0x44aa22, debrisCount: 30 });
        this.particleSystem.emit({ position: pos.clone().add(new THREE.Vector3(0, 1, 0)),
          color: new THREE.Color(0x44aa22), count: 40, velocity: new THREE.Vector3(0, 2, 0),
          spread: 2, lifetime: 1.5, size: 0.25 });
        // Revert after duration
        this.gameTimers.add(dur, () => {
          mesh.scale.copy(origScale);
          for (const { mat, color, map } of origColors) {
            mat.color.copy(color);
            mat.map = map;
            mat.needsUpdate = true;
          }
          if (hp) { hp.max = hpBefore; hp.current = Math.min(hp.current, hp.max); }
        });
        break;
      }

      // ── Default particle burst ───────────────────────────────────
      default:
        this.particleSystem.emit({
          position: pos.clone().add(new THREE.Vector3(0, 1, 0)),
          color: new THREE.Color(0xffffff), count: 20,
          velocity: fwd.clone().add(new THREE.Vector3(0, 1, 0)), spread: 1, lifetime: 0.5, size: 0.2,
        });
    }
  }

  /**
   * Apply AoE damage to all enemy units inside a sphere.
   * Uses CollisionSystem.checkAoE (THREE.Sphere + THREE.Box3 two-phase check)
   * and displays floating damage numbers via SpriteSystem.
   *
   * @param {THREE.Vector3} center
   * @param {number}        radius
   * @param {number}        damage    — base damage before crit/variance
   */
  _applyAoEDamage(center, radius, damage) {
    if (!this.playerUnit || this.allUnits.length === 0) return;
    const enemies = this.allUnits.filter(
      u => u.team !== this.playerUnit.team && !u.entity?.hasTag('dead')
    );
    const hits = this.collisionSystem.checkAoE(center, radius, enemies, /*flatY=*/true);
    for (const u of hits) {
      const hp = u.entity.getComponent('Health');
      if (!hp || hp.invulnerable) continue;
      const isCrit   = Math.random() < 0.18;
      const variance = 0.8 + Math.random() * 0.4;
      const finalDmg = Math.round(damage * variance * (isCrit ? 1.6 : 1));
      hp.current = Math.max(0, hp.current - finalDmg);
      hp.lastDamageTime = performance.now();
      registerHit();
      u.controller?.playOnce('hit', 1.2);
      // Floating damage number above the hit unit
      const numPos = u.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0));
      this.spriteSystem?.createDamageNumber(finalDmg, numPos, isCrit);
      if (hp.current <= 0) {
        u.entity.addTag('dead');
        u.controller?.play('death', { loop: false });
      }
    }
  }

  /**
   * RMB — toggle auto-attack (WoW-style). While on, the player will
   * auto-swing at the current target whenever it is in range.
   */
  _toggleAutoAttack() {
    if (!this.playerUnit || this.playerEntity?.hasTag("dead")) return;
    this._autoAttackOn = !this._autoAttackOn;
    if (this._autoAttackOn) this._autoAttackTimer = 0;
  }

  /**
   * Execute a single swing / shot. Faces the target first, then animates
   * and applies damage (melee) or spawns a projectile (ranged).
   */
  _performAttack() {
    if (!this.playerUnit || this.playerEntity?.hasTag("dead")) return;
    const weapon = this.getCurrentWeapon();
    const mesh = this.playerUnit.mesh;
    const ctrl = this.playerUnit.controller;
    if (!mesh || !weapon) return;

    const weaponType = this._getWeaponTypeKey();
    const feel = getWeaponFeel(weaponType);
    const animSpeed = feel.attackAnimSpeed ?? 1.2;

    const target = this.targeting?.currentTarget;
    const validTarget =
      target &&
      target.team !== this.playerUnit.team &&
      !target.entity?.hasTag("dead");

    if (validTarget) this._faceTarget(target);

    const pos = mesh.position.clone();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(mesh.quaternion);

    if (weapon.range > 5 && feel.drawBeforeShot) {
      if (!this._bowDrawing) {
        this._bowDrawing = true;
        this._bowDrawTimer = (feel.drawLeadMs ?? 220) / 1000;
        if (ctrl) {
          ctrl.playOnce(feel.drawAnim ?? "attack1", animSpeed * 0.55);
        }
        const bowSfx = this._weaponSfx?.bow?.attack;
        if (bowSfx?.[0]) this._playSFX?.(bowSfx[0], 0.28);
        return;
      }
      return;
    }

    const attacks = weapon.attackAnims?.length
      ? weapon.attackAnims
      : ["attack1", "attack2", "attack3"];
    this._attackSwingIdx = (this._attackSwingIdx + 1) % attacks.length;
    if (ctrl) ctrl.playOnce(attacks[this._attackSwingIdx], animSpeed);
    this._playAttackSfx(weaponType);

    if (weapon.range > 5) {
      const dir = validTarget
        ? new THREE.Vector3().subVectors(target.mesh.position, pos).normalize()
        : fwd;
      const ranged = feel.ranged ?? {};
      this._createProjectile({
        position: pos
          .clone()
          .add(dir.clone().multiplyScalar(0.5))
          .add(new THREE.Vector3(0, 1, 0)),
        direction: dir,
        speed: ranged.projectileSpeed ?? 30,
        damage: weapon.baseAttackDamage,
        color: ranged.projectileColor ?? (weaponType === "bow" ? 0x8b4513 : 0x3366ff),
        shader: ranged.shader ?? null,
        lifetime: 2,
      });
      pulseCrosshairSpread(weaponType === "bow" ? 8 : 5);
    } else {
      let slashFwd = fwd;
      if (feel.dualSlash) {
        this._sabreSlashIndex = (this._sabreSlashIndex + 1) % 2;
        const yaw = this._sabreSlashIndex === 0 ? 0.35 : -0.35;
        slashFwd = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      }

      if (validTarget) {
        const dist = mesh.position.distanceTo(target.mesh.position);
        if (dist <= weapon.range + 1) {
          const hp = target.entity.getComponent("Health");
          if (hp && !hp.invulnerable) {
            const dmg = weapon.baseAttackDamage * (0.8 + Math.random() * 0.4);
            hp.current = Math.max(0, hp.current - dmg);
            hp.lastDamageTime = performance.now();
            registerHit();
            if (target.controller) target.controller.playOnce("hit", 1.5);
            if (hp.current <= 0) {
              target.entity.addTag("dead");
              target.controller?.play("death", { loop: false });
            }
          }
        }
      }
      const slashPos = pos
        .clone()
        .add(slashFwd.clone().multiplyScalar(weapon.range / 2))
        .add(new THREE.Vector3(0, 1, 0));
      this._emitWeaponSlash(slashPos, slashFwd, feel);
      const res = this.playerEntity?.getComponent("Resources");
      if (res) res.rage.current = Math.min(res.rage.max, res.rage.current + 10);
    }
  }

  /**
   * Drive auto-attack each frame. Swings at the current target on the
   * weapon's attackSpeed cadence, provided target is alive and in range.
   */
  _updateAutoAttack(delta) {
    this._autoAttackTimer = Math.max(0, this._autoAttackTimer - delta);
    if (this._bowDrawing) return;
    if (!this._autoAttackOn) return;
    if (!this.playerUnit || this.playerEntity?.hasTag("dead")) return;
    const target = this.targeting?.currentTarget;
    if (
      !target ||
      target.team === this.playerUnit.team ||
      target.entity?.hasTag("dead")
    ) {
      return;
    }
    const weapon = this.getCurrentWeapon();
    if (!weapon) return;
    const dist = this.playerUnit.mesh.position.distanceTo(target.mesh.position);
    const range = weapon.range ?? 5;
    if (dist > range + (range > 5 ? 2 : 1)) return;
    if (this._autoAttackTimer > 0) return;
    this._performAttack();
    this._autoAttackTimer = 1 / (weapon.attackSpeed || 1);
  }

  _createProjectile(config) {
    const {
      position,
      direction,
      speed = 20,
      damage = 50,
      color = 0xff4400,
      shader = null,
      lifetime = 3,
      onHit = null,
    } = config;
    const group = new THREE.Group();
    if (shader && ShaderLibrary[shader])
      group.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 16, 16),
          createShaderMaterial(shader),
        ),
      );
    else
      group.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(0.2, 8, 8),
          new THREE.MeshBasicMaterial({ color }),
        ),
      );
    group.add(new THREE.PointLight(color, 1, 5));
    group.position.copy(position);
    this.scene.add(group);
    this.projectiles.push({
      mesh: group,
      direction: direction.clone().normalize(),
      speed,
      damage,
      lifetime,
      startPos: position.clone(),
      onHit,
      shader,
    });
  }

  // ── Per-frame updates ──

  _updateCooldowns(delta) {
    // Shared GCD (WoW-style 1.5s)
    if (this._gcdTimer > 0)
      this._gcdTimer = Math.max(0, this._gcdTimer - delta);
    const as = this.playerEntity?.getComponent("AbilityState");
    if (!as) return;
    for (const key of Object.keys(as.cooldowns)) {
      if (as.cooldowns[key] > 0) as.cooldowns[key] -= delta;
    }
  }

  _updateResources(delta) {
    const res = this.playerEntity?.getComponent("Resources");
    if (!res) return;
    res.mana.current = Math.min(
      res.mana.max,
      res.mana.current + res.mana.regenRate * delta,
    );
    res.energy.current = Math.min(
      res.energy.max,
      res.energy.current + res.energy.regenRate * delta,
    );
    const isSprinting =
      this.playerController?.holdKey?.ShiftLeft ||
      this.playerController?.holdKey?.ShiftRight;
    if (!isSprinting && res.rage.current > 0)
      res.rage.current = Math.max(
        0,
        res.rage.current - res.rage.decayRate * delta,
      );
  }

  _updateProjectiles(delta) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.mesh.position.add(p.direction.clone().multiplyScalar(p.speed * delta));
      p.lifetime -= delta;
      if (p.shader) {
        const mat = p.mesh.children[0]?.material;
        if (mat?.uniforms?.time) mat.uniforms.time.value += delta;
      }
      this.particleSystem.emitTrail(
        p.mesh.position.clone(),
        new THREE.Color(0xff4400),
      );

      let hit = false;
      for (const u of this.allUnits) {
        if (!this.playerUnit || u.team === this.playerUnit.team) continue;
        if (u.entity?.hasTag("dead")) continue;
        const dist = p.mesh.position.distanceTo(u.mesh.position);
        if (dist > 1.4) continue;
        const hp = u.entity.getComponent("Health");
        if (!hp || hp.invulnerable) continue;
        const dmg = p.damage * (0.85 + Math.random() * 0.3);
        hp.current = Math.max(0, hp.current - dmg);
        hp.lastDamageTime = performance.now();
        registerHit();
        pulseCrosshairSpread(4);
        u.controller?.playOnce("hit", 1.3);
        const numPos = u.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0));
        this.spriteSystem?.createDamageNumber(Math.round(dmg), numPos, false);
        if (hp.current <= 0) {
          u.entity.addTag("dead");
          u.controller?.play("death", { loop: false });
        }
        hit = true;
        break;
      }

      if (hit || p.lifetime <= 0 || p.mesh.position.distanceTo(p.startPos) > 50) {
        if (p.onHit) p.onHit(null, p.mesh.position.clone());
        this.scene.remove(p.mesh);
        // Dispose GPU resources
        p.mesh.traverse((child) => {
          if (child.isMesh) {
            child.geometry?.dispose();
            child.material?.dispose();
          }
          if (child.isLight) child.dispose?.();
        });
        this.projectiles.splice(i, 1);
      }
    }
  }

  _updateShaders(delta) {
    this.scene.traverse((child) => {
      if (child.isMesh && child.material?.uniforms?.time)
        child.material.uniforms.time.value += delta;
    });
  }

  _updateUI() {
    if (!this.playerEntity) return;
    const hp = this.playerEntity.getComponent("Health");
    const res = this.playerEntity.getComponent("Resources");
    if (!hp || !res) return;
    const set = (id, pct) => {
      const el = document.getElementById(id);
      if (el) el.style.width = `${pct}%`;
    };
    set("healthBar", (hp.current / hp.max) * 100);
    set("manaBar", (res.mana.current / res.mana.max) * 100);
    set("energyBar", (res.energy.current / res.energy.max) * 100);
    set("rageBar", (res.rage.current / res.rage.max) * 100);
  }

  updateWeaponUI() {
    if (!this.playerEntity) return;
    const ws = this.playerEntity.getComponent("WeaponState");
    if (!ws) return;
    document
      .getElementById("weapon1")
      ?.classList.toggle("active", ws.activeSlot === "primary");
    document
      .getElementById("weapon2")
      ?.classList.toggle("active", ws.activeSlot === "secondary");
    const weapon = this.getCurrentWeapon();
    const bar = document.getElementById("abilityBar");
    if (!weapon || !bar) return;

    const weaponType = this._getWeaponTypeKey();
    const feel = getWeaponFeel(weaponType);
    if (feel.accent) {
      bar.style.setProperty("--weapon-accent", feel.accent);
      document.documentElement.style.setProperty("--arena-weapon-accent", feel.accent);
    }

    // Real ability icons from ObjectStore abilities pack, served via R2 CDN.
    // Keys = WeaponDefinitions ability.effect strings.
    const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const ICON_BASE = IS_DEV ? '/assets/icons/abilities/' : '/cdn/assets/icons/abilities/';
    const i = (name) => `${ICON_BASE}${name}.png`;

    const EFFECT_ICONS = {
      fireball:            i('ability_fireball'),
      dot_projectile:      i('ability_venom_edge'),
      lifesteal_projectile:i('ability_life_drain'),
      multi_projectile:    i('ability_multishot'),
      debuff_target:       i('ability_enfeeble'),
      frost_nova:          i('ability_holy_nova'),
      meteor:              i('ability_meteor_strike'),
      aoe_zone:            i('ability_molotov'),
      shield:              i('ability_divine_shield'),
      buff_damage:         i('ability_damage_surge'),
      reset_cooldowns:     i('ability_mana_flow'),
      dash:                i('ability_wind_walk'),
      blink:               i('ability_evasion'),
      teleport_behind:     i('ability_evasive'),
      aoe_melee:           i('ability_whirlwind'),
      execute:             i('ability_execute'),
      aoe_strike:          i('ability_thunderclap'),
      stealth:             i('ability_sleep_dart'),
      projectile_pull:     i('ability_entangle'),
      melee_lifesteal:     i('ability_lacerate'),
      aoe_shield:          i('ability_mana_shield'),
      beam:                i('ability_lightning'),
      ground_zone:         i('ability_rejuvenate'),
      full_heal_invuln:    i('ability_invincible'),
    };
    const FALLBACK_ICON = i('ability_arcane_bolt');

    bar.innerHTML = "";
    const entries = Object.entries(weapon.abilities);

    entries.forEach(([key, ability], idx) => {
      const slot = document.createElement("div");
      slot.className = "ability-slot";
      slot.dataset.key = key;

      const iconSrc = EFFECT_ICONS[ability.effect] || FALLBACK_ICON;
      const hotkey = idx + 1;

      let costStr = '';
      if (ability.cost && ability.costType) {
        const resource = ability.costType.charAt(0).toUpperCase() + ability.costType.slice(1);
        costStr = `<span class="ab-cost">${ability.cost} ${resource}</span>`;
      }
      const cdStr = ability.cooldown ? `<span class="ab-cd">${ability.cooldown}s</span>` : '';

      slot.innerHTML = `
        <span class="ability-key">${hotkey}</span>
        <img class="ability-icon" src="${iconSrc}" alt="${ability.name}"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
        <span class="ability-icon ability-icon-fallback" style="display:none">✨</span>
        <div class="ability-tooltip">
          <div class="ab-title">${ability.name}</div>
          <div class="ab-desc">${ability.description || ''}</div>
          <div class="ab-meta">${costStr}${cdStr}</div>
        </div>`;

      slot.setAttribute('title', `[${hotkey}] ${ability.name}`);
      slot.addEventListener("click", () => this.useAbility(key));
      bar.appendChild(slot);
    });
  }

  // ── Game loop ──

  _animate() {
    if (this._disposed) return;
    requestAnimationFrame(() => this._animate());
    const delta = Math.min(this.clock.getDelta(), 0.1);
    if (this.match && !this.dangerMode) this.match.update(delta);
    const active = this.dangerMode ? true : (this.match?.isCombatActive() ?? true);
    if (active) {
      if (this.playerController) this.playerController.update(delta);
      this._updateCooldowns(delta);
      this._updateResources(delta);
      this._updateAutoAttack(delta);
      this._updateProjectiles(delta);
    }

    // ── Physics step & sync (annihilatetrainer pattern) ──
    if (this.physicsWorld) {
      // Sync player mesh → physics body (player drives mesh directly)
      if (this.playerUnit?.physicsBody) {
        this.physicsWorld.syncBodyToMesh(this.playerUnit.physicsBody, this.playerUnit.mesh);
      }

      this.physicsWorld.step(delta);

      // Sync AI physics bodies → meshes
      for (const u of this.allUnits) {
        if (!u.isPlayer && u.physicsBody) {
          this.physicsWorld.syncMeshToBody(u.mesh, u.physicsBody);
        }
        // Update AI detectors
        if (u.aiDetector) u.aiDetector.update();
      }

      // Hitbox sync + resolve
      this.hitboxManager?.update();

      // Physics projectiles
      for (let i = physicsProjectiles.length - 1; i >= 0; i--) {
        physicsProjectiles[i].update(delta);
      }

      // Hit splashes
      updateSplashes(delta);
    }

    this.gameTimers.update(delta, active);
    if (this.arenaAI && !this.dangerMode) this.arenaAI.update(delta, this.allUnits, active);
    tickCombatFeedback(delta);
    syncAbilityBarFlash();
    if (this.dangerMode) {
      tickDangerRoomHud(this, delta);
      this._dangerLighting?.update(this.playerUnit?.mesh);
    }

    if (this._bowDrawing) {
      this._bowDrawTimer -= delta;
      if (this._bowDrawTimer <= 0) {
        this._bowDrawing = false;
        const weapon = this.getCurrentWeapon();
        const weaponType = this._getWeaponTypeKey();
        const feel = getWeaponFeel(weaponType);
        const mesh = this.playerUnit?.mesh;
        if (mesh && weapon) {
          const target = this.targeting?.currentTarget;
          const validTarget =
            target &&
            target.team !== this.playerUnit.team &&
            !target.entity?.hasTag("dead");
          const pos = mesh.position.clone();
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(mesh.quaternion);
          const dir = validTarget
            ? new THREE.Vector3().subVectors(target.mesh.position, pos).normalize()
            : fwd;
          const ranged = feel.ranged ?? {};
          this.playerUnit.controller?.playOnce("attack2", feel.attackAnimSpeed ?? 1.05);
          const bowSfx = this._weaponSfx?.bow?.attack;
          if (bowSfx?.[1]) this._playSFX?.(bowSfx[1], 0.38);
          else this._playAttackSfx(weaponType);
          this._createProjectile({
            position: pos
              .clone()
              .add(dir.clone().multiplyScalar(0.5))
              .add(new THREE.Vector3(0, 1, 0)),
            direction: dir,
            speed: ranged.projectileSpeed ?? 32,
            damage: weapon.baseAttackDamage,
            color: ranged.projectileColor ?? 0xc4a35a,
            lifetime: 2,
          });
          pulseCrosshairSpread(10);
          this._autoAttackTimer = 1 / (weapon.attackSpeed || 1);
        }
      }
    }
    this._updateShaders(delta);
    for (const u of this.allUnits) {
      if (u.controller) u.controller.update(delta);
    }
    this.particleSystem?.update(delta);
    this.spriteSystem?.update(delta);
    this.orbitCamera?.update(delta);

    // ── AoE / spline systems ──────────────────────────────────
    // updateGroundSlamVFX drives all active slam/meteor impact VFX instances.
    // aoeIndicator.update animates the pre-cast targeting ring shader.
    // _activeMovers advances any in-flight TrajectoryMover (Meteor Strike arc, etc.)
    updateGroundSlamVFX(delta);
    this.aoeIndicator?.update(delta);
    if (this._activeMovers.length > 0) {
      for (let i = this._activeMovers.length - 1; i >= 0; i--) {
        if (this._activeMovers[i].update(delta)) {
          this._activeMovers.splice(i, 1); // remove completed movers
        }
      }
    }

    this._updateUI();
    this._updateAbilityCooldownSweep();
    this.inventoryUI?.update();
    if (this.targeting) {
      this.targeting.updateTargetFrameHP();
      this.targeting.updateTeamFrames();
      this.targeting.cleanup();
    }
    if (this.postFX) this.postFX.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** Bind I/C/K to toggle inventory/character/skills panels. */
  _bindInventoryHotkeys() {
    if (this._invHotkeysBound) return;
    this._invHotkeysBound = true;
    this._invKeyHandler = (e) => {
      if (e.target?.matches?.("input,textarea,[contenteditable=true]")) return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "i") {
        e.preventDefault();
        this.inventoryUI?.toggle("panel-inv");
      } else if (key === "c") {
        e.preventDefault();
        this.inventoryUI?.toggle("panel-char");
      } else if (key === "k") {
        e.preventDefault();
        this.inventoryUI?.toggle("panel-skills");
      } else if (key === "escape") {
        this.inventoryUI?.close();
      }
    };
    window.addEventListener("keydown", this._invKeyHandler);
  }

  /**
   * Paint a radial cooldown sweep on each ability slot.
   * Reads AbilityState.cooldowns[key] and the shared GCD timer; both write
   * a conic-gradient mask + remaining-seconds label without rebuilding DOM.
   */
  _updateAbilityCooldownSweep() {
    const bar = document.getElementById("abilityBar");
    if (!bar || !this.playerEntity) return;
    const as = this.playerEntity.getComponent("AbilityState");
    if (!as) return;
    const weapon = this.getCurrentWeapon();
    if (!weapon) return;
    const keys = Object.keys(weapon.abilities);
    const slots = bar.querySelectorAll(".ability-slot");
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const key = keys[i];
      if (!key) continue;
      const ability = weapon.abilities[key];
      const cd = as.cooldowns[key] || 0;
      const cdMax = ability?.cooldown || 0;
      const gcd = ability?.offGCD ? 0 : this._gcdTimer || 0;
      const remaining = Math.max(cd, gcd);
      let mask = slot.querySelector(".ability-cd-mask");
      let text = slot.querySelector(".ability-cd-text");
      if (remaining <= 0.01) {
        slot.classList.remove("on-cd");
        if (mask) mask.style.display = "none";
        if (text) text.style.display = "none";
        continue;
      }
      slot.classList.add("on-cd");
      if (!mask) {
        mask = document.createElement("div");
        mask.className = "ability-cd-mask";
        slot.appendChild(mask);
      }
      if (!text) {
        text = document.createElement("div");
        text.className = "ability-cd-text";
        slot.appendChild(text);
      }
      // Sweep: full disc shrinks counterclockwise as cooldown expires.
      const denom = cd > 0 ? cdMax : this._gcdDuration || 1.5;
      const pct = Math.min(1, remaining / denom);
      const deg = Math.round(360 * pct);
      mask.style.display = "block";
      mask.style.background = `conic-gradient(rgba(0,0,0,0.65) 0deg ${deg}deg, transparent ${deg}deg 360deg)`;
      text.style.display = "flex";
      text.textContent =
        remaining >= 1 ? Math.ceil(remaining).toString() : remaining.toFixed(1);
    }
  }

  /** Clean dispose — release all GPU resources and DOM elements */
  dispose() {
    this._disposed = true;
    this.clock.stop();

    // Detach inventory hotkey listener
    if (this._invKeyHandler) {
      window.removeEventListener("keydown", this._invKeyHandler);
      this._invKeyHandler = null;
      this._invHotkeysBound = false;
    }

    if (this._softLockMove) {
      window.removeEventListener("mousemove", this._softLockMove);
      this._softLockMove = null;
    }

    // Dispose subsystems
    this.postFX?.dispose();
    this.postFX = null;
    this._dangerLighting?.dispose();
    this._dangerLighting = null;
    this.particleSystem?.dispose();
    this.spriteSystem?.dispose();
    this.gameTimers.clear();
    // AoE / spline systems
    disposeAllGroundSlamVFX();
    this.aoeIndicator?.dispose();
    this._activeMovers.forEach(m => m.dispose());
    this._activeMovers.length = 0;

    // Traverse scene and dispose all geometries/materials/textures
    this.scene?.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        const mats = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const mat of mats) {
          if (!mat) continue;
          for (const key of Object.keys(mat)) {
            const val = mat[key];
            if (val && typeof val.dispose === "function") val.dispose();
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

    console.log("[arena] Disposed all resources");
  }
}

export { GrudgeArena, WeaponDefinitions, ShaderLibrary, Components };
