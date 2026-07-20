/**
 * Danger Room training mode — solo player + stationary dummies, no match timer.
 * WoW-style controls: W/S move, A/D turn, RMB attack/strafe, LMB camera orbit.
 */

import * as THREE from "three";
import { DefaultHeroForRace } from "../HeroRegistry.js";
import { buildDangerRoomEnvironment, applyDangerRoomPreset } from "./DangerRoomEnvironment.js";
import {
  getDangerRoomState,
  subscribeDangerRoom,
  setDangerMode,
  isCombatSandboxUi,
  needsIslandTerrain,
} from "./dangerRoomStore.js";
import {
  mountDangerRoomHud,
  unmountDangerRoomHud,
  setDangerWeaponLabel,
  updateDangerHud,
  syncAbilityBarFlash,
} from "./dangerRoomHud.js";
import {
  mountDangerRoomLoadoutPanel,
  unmountDangerRoomLoadoutPanel,
  syncGearCatalog,
  applyLiveD1ToEquipment,
} from "./dangerRoomLoadoutPanel.js";
import { getDangerRoomMusic, disposeDangerRoomMusic } from "./DangerRoomMusic.js";
import { createDjBoothRig } from "./DjBoothRig.js";
import { mountDangerRoomDock, unmountDangerRoomDock } from "./dangerRoomDock.js";
import {
  mountBoatDockPanel,
  unmountBoatDockPanel,
  tickBoatDockPanel,
} from "./islandBoatDockPanel.js";
import {
  setupWeaponRadialInput,
  teardownWeaponRadialInput,
} from "./weaponRadial.js";
import { updateShooter, resetShooterAmmo, isReloading } from "./ShooterSystem.js";
import { setD1Weapon } from "../d1LoadoutStore.js";
import { getD1LoadoutState, getD1LoadoutForRace } from "../d1LoadoutStore.js";
import { getWeaponFeel, resolveMotionLabel } from "../engine/WeaponFeel.js";
import {
  getComboStage,
  getCrosshairSpread,
  getHitMarkerId,
} from "../engine/CombatFeedback.js";
import {
  getSoftLockHudState,
  cycleTabTarget,
} from "../engine/SoftLockSystem.js";
import {
  cyclePlayerTarget,
  UNIVERSAL_CONTROL_SCHEME,
} from "../engine/PlayerControlStack.js";
import {
  mountHarvestForArena,
  teardownHarvestForArena,
  tickHarvestForArena,
} from "./HarvestSystem.js";
import { clearFocusTargets } from "./FocusTargetRegistry.js";
import { loadBakedClip } from "../bakedAnimLoader.js";
import { reapplyRaceTextures } from "../modelLoader.js";
import { sampleIslandHeight } from "./IslandTerrain.js";
import { loadIslandOutdoorSky, applyIslandEnvMap } from "./IslandOutdoorSky.js";
import { applyIslandTerrainLoaded } from "./islandTerrainBindings.js";

/** Island neutrals — standard locomotion idle (examine idle spins torso unnaturally). */
export async function applyNeutralExamineIdle(units) {
  for (const u of units || []) {
    if (u.team !== "N" || !u.controller?.director || !u.mesh) continue;
    try {
      const clip = await loadBakedClip("locomotion/idle", u.mesh);
      clip.name = "idle";
      u.controller.clips?.set?.("idle", clip.clone());
      u.controller.director.playLoop(clip, 0.35);
      u.controller.currentState = "idle";
    } catch (err) {
      console.warn("[danger] baked neutral idle unavailable:", err.message);
    }
  }
}

/** Island NPCs — neutrals that idle around the hub (foragers / traders). */
export function getDangerNeutralTeams() {
  return [
    { race: "human", weapon: "staff", isPlayer: false, tier: 1, displayName: "Island Forager", neutral: true },
    { race: "dwarf", weapon: "mace", isPlayer: false, tier: 1, displayName: "Rock Trader", neutral: true },
    { race: "elf", weapon: "bow", isPlayer: false, tier: 1, displayName: "Wood Gatherer", neutral: true },
    { race: "barbarian", weapon: "greatsword", isPlayer: false, tier: 1, displayName: "Dock Hand", neutral: true },
    { race: "orc", weapon: "mace", isPlayer: false, tier: 1, displayName: "Shore Scout", neutral: true },
    { race: "undead", weapon: "staff", isPlayer: false, tier: 1, displayName: "Harbor Mage", neutral: true },
  ];
}

export function getDangerTrainingTeams(playerRace, playerWeapon, buildConfig) {
  // Game-ready default: Grudge6 human warrior + greatsword
  const race = playerRace && playerRace !== "default" ? playerRace : "human";
  const weapon = playerWeapon || "greatsword";
  const playerProfile = buildConfig || {};
  const TEAM_A = [
    {
      heroId: DefaultHeroForRace[race] || "human",
      race,
      weapon,
      isPlayer: true,
      tier: 3,
      displayName: buildConfig?.displayName || "Human Champion",
      profile: playerProfile,
    },
  ];
  // Training dummies + race variety for combat practice
  const TEAM_B = [
    { race: "orc", weapon: "greatsword", isPlayer: false, tier: 1, displayName: "Training Dummy" },
    { race: "elf", weapon: "bow", isPlayer: false, tier: 1, displayName: "Archer Dummy" },
    { race: "undead", weapon: "staff", isPlayer: false, tier: 1, displayName: "Mage Dummy" },
    { race: "dwarf", weapon: "mace", isPlayer: false, tier: 1, displayName: "Shield Dummy" },
  ];
  return { TEAM_A, TEAM_B };
}

let _useIslandSpawnHeights = false;

/** Enable heightfield Y for combat-island spawns (metres, not flat y=0). */
export function setIslandSpawnHeights(enabled) {
  _useIslandSpawnHeights = !!enabled;
}

/** True when spawns include island heightfield Y (combat sandbox). */
export function isIslandSpawnHeightsEnabled() {
  return _useIslandSpawnHeights;
}

function spawnY(x, z) {
  return _useIslandSpawnHeights ? sampleIslandHeight(x, z) : 0;
}

/** Compact spawns inside the 32×32 training chamber (island: on heightfield). */
export function getDangerSpawnPosition(teamId, slot, teamSize) {
  if (teamId === "A") {
    const x = 0;
    const z = 5;
    return new THREE.Vector3(x, spawnY(x, z), z);
  }
  if (teamId === "N") {
    // Spread NPCs around village / dock / fort for island showcase
    const spots = [
      [10, 6],
      [-11, 4],
      [5, -12],
      [14, -6],
      [-8, 10],
      [8, 12],
      [-20, 18],
      [22, 4],
    ];
    const s = spots[slot % spots.length];
    return new THREE.Vector3(s[0], spawnY(s[0], s[1]), s[1]);
  }
  const x = (slot - (teamSize - 1) / 2) * 3.5;
  const z = -7;
  return new THREE.Vector3(x, spawnY(x, z), z);
}

/**
 * Bip001 D1 GLBs face +X at yaw 0. Island spawns use −Z / +Z lanes (not arena ±X).
 * Team A @ z+5 faces dummies @ z−7 (−Z) → π/2. Team B faces player (+Z) → −π/2.
 */
export function getDangerSpawnFacing(teamId) {
  if (teamId === "A") return Math.PI / 2;
  if (teamId === "N") return -Math.PI / 2;
  return -Math.PI / 2;
}

/** Build island / chamber geometry before character GLBs finish loading. */
export function prebuildDangerEnvironment(arena) {
  if (arena._dangerEnv) return arena._dangerEnv;
  const state = getDangerRoomState();
  arena._dangerEnv = buildDangerRoomEnvironment(arena.scene, state.presetId);
  arena._dangerClampRadius = arena._dangerEnv.clampRadius;
  arena._obstacleMeshes = arena._dangerEnv.obstacleMeshes;
  arena._terrainMeshes = arena._dangerEnv.terrainMeshes;
  if (needsIslandTerrain()) {
    arena._dangerEnv.terrainLoadPromise?.then((island) => {
      applyIslandTerrainLoaded(arena, island);
    });
  }
  return arena._dangerEnv;
}

/**
 * Attach danger room systems to a GrudgeArena instance.
 * @param {import('../../game.js').GrudgeArena} arena
 */
export function bootstrapDangerRoom(arena) {
  setDangerMode(true);
  if (!arena._dangerEnv) prebuildDangerEnvironment(arena);
  if (isCombatSandboxUi()) {
    document.body.classList.add("combat-sandbox-active");
  }
  if (arena._skybox) {
    arena.scene.remove(arena._skybox);
    arena._skybox.geometry?.dispose?.();
    arena._skybox.material?.map?.dispose?.();
    arena._skybox.material?.dispose?.();
    arena._skybox = null;
  }
  const state = getDangerRoomState();
  if (!arena._dangerEnv || arena._dangerEnv.presetId !== state.presetId) {
    if (arena._dangerEnv?.root) {
      arena.scene.remove(arena._dangerEnv.root);
    }
    arena._dangerEnv = buildDangerRoomEnvironment(arena.scene, state.presetId);
  }
  arena._dangerClampRadius = arena._dangerEnv.clampRadius;
  arena._obstacleMeshes = arena._dangerEnv.obstacleMeshes;
  arena._terrainMeshes = arena._dangerEnv.terrainMeshes;

  mountDangerRoomHud();
  // Island showcase: boat dock UI always on island (not only combat-sandbox host)
  const island = needsIslandTerrain() || state.presetId === "island";
  if (island || isCombatSandboxUi()) mountBoatDockPanel();
  mountDangerRoomDock({
    onWeaponPick: (weapon) => {
      setD1Weapon(weapon);
      arena.reloadDangerPlayer?.();
    },
  });
  mountDangerRoomLoadoutPanel({
    onApply: (opts) => arena.reloadDangerPlayer?.(opts),
    getEquipment: () => arena.playerUnit?.equipment,
  });
  resetShooterAmmo();
  setupWeaponRadialInput((weapon) => {
    setD1Weapon(weapon);
    arena.reloadDangerPlayer?.();
  });

  const music = getDangerRoomMusic();
  music.setEnabled(state.musicEnabled);
  music.setVolume(state.musicVolume);
  const resumeMusic = () => void music.resume();
  window.addEventListener("pointerdown", resumeMusic, { once: true });
  window.addEventListener("keydown", resumeMusic, { once: true });
  arena._dangerMusicResume = resumeMusic;

  if (arena._dangerEnv?.showDjBooth !== false) {
    arena._djBooth = createDjBoothRig(arena.scene);
  }
  if (arena.playerUnit?.equipment) {
    syncGearCatalog(arena.playerUnit.equipment);
  }
  const weaponName = arena.getCurrentWeapon?.()?.name || "Weapon";
  setDangerWeaponLabel(weaponName);
  mountHarvestForArena(arena);
  if (needsIslandTerrain()) {
    setIslandSpawnHeights(true);
    arena._dangerEnv?.terrainLoadPromise?.then(async (islandData) => {
      applyIslandTerrainLoaded(arena, islandData);
      // Production physics: register prop colliders + re-snap player after island ready
      try {
        if (arena.physicsWorld && !arena._dangerPhysicsInited) {
          arena._initPhysicsBodies?.();
          arena._dangerPhysicsInited = true;
        }
      } catch (err) {
        console.warn("[danger] physics init:", err?.message || err);
      }
      const outdoor = await loadIslandOutdoorSky(arena.renderer, arena.scene);
      if (outdoor?.envMap && arena._dangerEnv?.root) {
        applyIslandEnvMap(arena._dangerEnv.root, outdoor.envMap);
        arena.renderer.toneMappingExposure = 1.15;
      }
      // Mount parade (cavalry showcase) — non-blocking
      try {
        const { spawnIslandMountShowcase } = await import("./IslandMountShowcase.js");
        await spawnIslandMountShowcase(arena);
      } catch (err) {
        console.warn("[danger] mount showcase:", err?.message || err);
      }
      if (arena.playerUnit?.mesh) {
        arena.orbitCamera?.snapBehind?.();
        arena._terrainSystem?.snapMesh?.(arena.playerUnit.mesh);
      }
      // Pointer lock / focus canvas so WASD works immediately
      try {
        arena.renderer?.domElement?.focus?.();
      } catch {
        /* ignore */
      }
    });
  }

  arena._dangerUnsub = subscribeDangerRoom(() => {
    const next = getDangerRoomState();
    getDangerRoomMusic().setEnabled(next.musicEnabled);
    getDangerRoomMusic().setVolume(next.musicVolume);
    arena._dangerEnv = applyDangerRoomPreset(arena.scene, arena._dangerEnv?.root, next.presetId);
    if (arena._dangerEnv) {
      arena._dangerClampRadius = arena._dangerEnv.clampRadius;
      arena._obstacleMeshes = arena._dangerEnv.obstacleMeshes;
      arena._terrainMeshes = arena._dangerEnv.terrainMeshes;
      arena._terrainSystem?.refresh?.({
        terrainMeshes: arena._terrainMeshes,
        obstacleMeshes: arena._obstacleMeshes,
        propMeshes: arena._obstacleMeshes,
      });
      arena._groundSampler?.setTerrainMeshes?.(arena._terrainMeshes);
      arena._groundSampler?.setPropMeshes?.(arena._obstacleMeshes);
      for (const u of arena.allUnits || []) {
        if (arena._terrainSystem) {
          arena._terrainSystem.snapMesh(u.mesh);
        } else {
          arena._groundSampler?.snapMesh?.(u.mesh);
        }
      }
      arena.orbitCamera?.setCollisionMeshes?.(arena._obstacleMeshes);
      if (next.presetId === "colosseum") {
        arena._djBooth?.dispose?.();
        arena._djBooth = null;
      } else if (!arena._djBooth) {
        arena._djBooth = createDjBoothRig(arena.scene);
      }
      if (next.presetId === "island") {
        setIslandSpawnHeights(true);
        arena._dangerEnv?.terrainLoadPromise?.then((island) => {
          applyIslandTerrainLoaded(arena, island);
        });
        if (isCombatSandboxUi()) mountHarvestForArena(arena);
      } else {
        setIslandSpawnHeights(false);
        teardownHarvestForArena(arena);
      }
    }
  });
}

export function teardownDangerRoom(arena) {
  clearFocusTargets();
  teardownHarvestForArena(arena);
  unmountDangerRoomLoadoutPanel();
  unmountDangerRoomDock();
  unmountBoatDockPanel();
  unmountDangerRoomHud();
  teardownWeaponRadialInput();
  arena._djBooth?.dispose?.();
  arena._djBooth = null;
  disposeDangerRoomMusic();
  arena._dangerUnsub?.();
  arena._dangerUnsub = null;
  setDangerMode(false);
  document.body.classList.remove("combat-sandbox-active");
}

/** Live D1 mesh tweak without full reload (armor / weapon variant only). */
export async function applyDangerLiveLoadout(arena) {
  const unit = arena.playerUnit;
  if (!unit?.equipment) return;
  const st = getD1LoadoutState();
  const weapon = arena._getWeaponTypeKey?.() ?? st.weapon;
  const race = st.race || unit.race || "human";
  applyLiveD1ToEquipment(unit.equipment, weapon, getD1LoadoutForRace(race));
  await reapplyRaceTextures(unit.mesh, race);
  syncGearCatalog(unit.equipment);
}

/** Per-frame danger room systems (music, DJ, shooter, HUD). */
export function tickDangerRoomSystems(arena, delta = 0.016) {
  getDangerRoomMusic().setIntensityTarget(0.35);
  getDangerRoomMusic().update(delta);
  arena._djBooth?.update?.(delta);
  updateShooter(arena, delta);
  tickHarvestForArena(arena, delta);
  tickBoatDockPanel(arena);
  tickDangerRoomHud(arena, delta);
  // Mount parade idle loops
  for (const m of arena._mountMixers || []) {
    try {
      m.update(delta);
    } catch {
      /* ignore */
    }
  }
}

/** Per-frame danger room HUD updates (soft lock via universal PlayerControlStack). */
export function tickDangerRoomHud(arena, delta = 0.016) {
  if (!arena.playerController) return;
  const ctrl = arena.playerController;
  // Enforce universal TPS stack on Teidland / island / sandbox
  if (ctrl.controlScheme !== UNIVERSAL_CONTROL_SCHEME) {
    ctrl.controlScheme = UNIVERSAL_CONTROL_SCHEME;
  }
  if (arena.orbitCamera?.controlMode !== UNIVERSAL_CONTROL_SCHEME) {
    arena.orbitCamera?.setControlMode?.(UNIVERSAL_CONTROL_SCHEME);
  }

  // Aim systems ticked once from game.js for all modes (avoid double soft-lock)

  const speed = ctrl.currentSpeed || 0;
  const sprint = ctrl.holdKey?.ShiftLeft || ctrl.holdKey?.ShiftRight;
  const snap = ctrl._fsmService?.getSnapshot?.();
  const snapVal = snap?.value;
  const stateStr = typeof snapVal === "string" ? snapVal : JSON.stringify(snapVal ?? "");

  const ws = arena.playerEntity?.getComponent("WeaponState");
  const weaponType = ws
    ? (ws.activeSlot === "primary" ? ws.primary : ws.secondary)
    : "greatsword";
  const feel = getWeaponFeel(weaponType);
  const weapon = arena.getCurrentWeapon?.();
  const lockWeapon = arena._getWeaponTypeKey?.() ?? weaponType;
  const aiming = !!(arena._autoAttackOn || ctrl.holdKey?._RMB);

  arena._reloading = isReloading(lockWeapon);
  const harvestTool = arena._harvest?.activeTool;
  const motion = harvestTool
    ? `HARVEST · ${harvestTool.label.toUpperCase()}`
    : resolveMotionLabel(feel, {
    skillName: arena._activeSkillLabel,
    reloading: arena._reloading,
    aiming: aiming && weapon?.range > 5,
    casting: arena._casting,
    dashing: stateStr.includes("dash"),
    blocking: stateStr.includes("block"),
    attacking: stateStr.includes("attack") || stateStr.includes("skill"),
    sprinting: sprint && speed > 0.5,
    moving: speed > 0.5,
  });

  let rangeState = "none";
  if (weapon?.range > 5) {
    const target = arena.targeting?.currentTarget;
    if (target && !target.entity?.hasTag("dead")) {
      const dist = arena.playerUnit.mesh.position.distanceTo(target.mesh.position);
      const r = weapon.range;
      if (dist < r * 0.45) rangeState = "close";
      else if (dist <= r * 0.95) rangeState = "optimal";
      else rangeState = "far";
    }
  }

  const crosshairBase = getDangerRoomState().crosshairBase ?? 10;
  const metrics = arena.playerUnit?.characterMetrics || arena.playerUnit?.mesh?.userData?.characterMetrics;
  const measuredH = metrics?.measuredHeight ?? metrics?.targetHeight;

  updateDangerHud({
    motion,
    height: measuredH,
    weapon: weapon ? `${weapon.name} · ${feel.title}` : feel.title,
    accent: feel.accent,
    combo: getComboStage(),
    spread: crosshairBase + getCrosshairSpread(),
    hitMarker: getHitMarkerId(),
    rangeState,
    softLock: getSoftLockHudState(),
  });
  syncAbilityBarFlash();
}

/** Tab cycle with soft-lock zone — all play modes. */
export function dangerRoomCycleTarget(arena) {
  cyclePlayerTarget(arena);
}