/**
 * Danger Room training mode — solo player + stationary dummies, no match timer.
 * Island sandbox TPS: WASD move, RMB look, Shift sprint, Q/E/R/F skills.
 */

import * as THREE from "three";
import { DefaultHeroForRace } from "../HeroRegistry.js";
import { buildDangerRoomEnvironment, applyDangerRoomPreset } from "./DangerRoomEnvironment.js";
import {
  getDangerRoomState,
  subscribeDangerRoom,
  setDangerMode,
  isCombatSandboxUi,
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
  updateSoftLock,
  getSoftLockHudState,
  hardLockCameraAssistRate,
  lockedTargetWorld,
  syncTargetLockFromTargeting,
  cycleTabTarget,
} from "../engine/SoftLockSystem.js";
import {
  mountHarvestForArena,
  teardownHarvestForArena,
  tickHarvestForArena,
} from "./HarvestSystem.js";
import {
  syncUnitsToFocusRegistry,
  clearFocusTargets,
  toggleFocusFilter,
  getFocusFilterLabel,
  registerFocusTarget,
  unregisterFocusTarget,
  lockFocusTarget,
  clearFocusLock,
  getLockedFocusTarget,
} from "./FocusTargetRegistry.js";
import {
  cycleFocusTabTarget,
  updateFocusSoftLock,
  lockedFocusWorld,
  focusHardLockCameraAssistRate,
  getFocusSoftLockHudState,
} from "../engine/FocusSoftLock.js";
import { BAKED_IDLE_EXAMINE_REL, loadBakedClip } from "../bakedAnimLoader.js";
import { reapplyRaceTextures } from "../modelLoader.js";
import { sampleIslandHeight } from "./IslandTerrain.js";
import { loadIslandOutdoorSky, applyIslandEnvMap } from "./IslandOutdoorSky.js";

/** Island neutrals — baked Bip001 examine idle via AnimationDirector overlay. */
export async function applyNeutralExamineIdle(units) {
  let clip;
  try {
    clip = await loadBakedClip(BAKED_IDLE_EXAMINE_REL);
    clip.name = "idleExamine";
  } catch (err) {
    console.warn("[danger] baked idleExamine unavailable:", err.message);
    return;
  }
  for (const u of units || []) {
    if (u.team !== "N" || !u.controller?.director) continue;
    u.controller.clips?.set?.("idleExamine", clip.clone());
    u.controller.director.playLoop(clip, 0.35);
    u.controller.currentState = "idleExamine";
  }
}

/** Training dummies — enemy team targets that don't chase the player. */
export function getDangerNeutralTeams() {
  return [
    { race: "human", weapon: "staff", isPlayer: false, tier: 1, displayName: "Island Forager", neutral: true },
    { race: "dwarf", weapon: "mace", isPlayer: false, tier: 1, displayName: "Rock Trader", neutral: true },
    { race: "elf", weapon: "bow", isPlayer: false, tier: 1, displayName: "Wood Gatherer", neutral: true },
  ];
}

export function getDangerTrainingTeams(playerRace, playerWeapon, buildConfig) {
  const playerProfile = buildConfig || {};
  const TEAM_A = [
    {
      heroId: DefaultHeroForRace[playerRace] || "human",
      race: playerRace,
      weapon: playerWeapon,
      isPlayer: true,
      tier: 3,
      displayName: buildConfig?.displayName || "Champion",
      profile: playerProfile,
    },
  ];
  const TEAM_B = [
    { race: "orc", weapon: "greatsword", isPlayer: false, tier: 1, displayName: "Training Dummy" },
    { race: "elf", weapon: "bow", isPlayer: false, tier: 1, displayName: "Archer Dummy" },
    { race: "undead", weapon: "staff", isPlayer: false, tier: 1, displayName: "Mage Dummy" },
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
    const spots = [
      [10, 6],
      [-11, 4],
      [5, -12],
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
  if (isCombatSandboxUi()) {
    arena._dangerEnv.terrainLoadPromise?.then((island) => {
      if (!island || !arena._dangerEnv) return;
      arena._dangerEnv.terrainMeshes = island.terrainMeshes;
      arena._dangerEnv.clampRadius = island.clampRadius;
      arena._terrainMeshes = island.terrainMeshes;
      arena._dangerClampRadius = island.clampRadius;
      if (island.obstacleMeshes?.length) {
        arena._dangerEnv.obstacleMeshes = [
          ...arena._dangerEnv.obstacleMeshes,
          ...island.obstacleMeshes,
        ];
        arena._obstacleMeshes = arena._dangerEnv.obstacleMeshes;
      }
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
  arena._dangerEnv = buildDangerRoomEnvironment(arena.scene, state.presetId);
  arena._dangerClampRadius = arena._dangerEnv.clampRadius;
  arena._obstacleMeshes = arena._dangerEnv.obstacleMeshes;
  arena._terrainMeshes = arena._dangerEnv.terrainMeshes;

  mountDangerRoomHud();
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
  if (isCombatSandboxUi()) {
    setIslandSpawnHeights(true);
    syncUnitsToFocusRegistry(arena.allUnits);
    arena._dangerEnv?.terrainLoadPromise?.then(async (island) => {
      if (!island || !arena._dangerEnv) return;
      arena._dangerEnv.terrainMeshes = island.terrainMeshes;
      arena._dangerEnv.clampRadius = island.clampRadius;
      arena._terrainMeshes = island.terrainMeshes;
      arena._dangerClampRadius = island.clampRadius;
      if (island.obstacleMeshes?.length) {
        arena._dangerEnv.obstacleMeshes = [
          ...arena._dangerEnv.obstacleMeshes,
          ...island.obstacleMeshes,
        ];
        arena._obstacleMeshes = arena._dangerEnv.obstacleMeshes;
        arena.orbitCamera?.setCollisionMeshes?.(arena._obstacleMeshes);
      }
      for (const mesh of island.terrainMeshes || []) {
        arena.collisionSystem?.addCollider(mesh, "environment");
      }
      for (const mesh of island.obstacleMeshes || []) {
        arena.collisionSystem?.addCollider(mesh, "environment");
      }
      arena._groundSampler?.setHeightSampleFn?.(sampleIslandHeight);
      arena._groundSampler?.setTerrainMeshes?.(island.terrainMeshes);
      const outdoor = await loadIslandOutdoorSky(arena.renderer, arena.scene);
      if (outdoor?.envMap && arena._dangerEnv?.root) {
        applyIslandEnvMap(arena._dangerEnv.root, outdoor.envMap);
        arena.renderer.toneMappingExposure = 1.15;
      }
      for (const u of arena.allUnits || []) {
        arena._groundSampler?.snapMesh?.(u.mesh);
      }
      if (arena.playerUnit?.mesh) {
        arena.orbitCamera?.snapBehind?.();
      }
    });
    arena._focusFilterToast = (label) => {
      const ff = document.getElementById("dr-focus-filter");
      if (ff) ff.textContent = `FOCUS: ${label}`;
    };
    arena._focusKeyHandler = (e) => {
      if (e.code === "Backquote" && !e.repeat) {
        e.preventDefault();
        toggleFocusFilter();
        arena._focusFilterToast?.(getFocusFilterLabel());
      }
    };
    window.addEventListener("keydown", arena._focusKeyHandler);
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
      arena._groundSampler?.setTerrainMeshes?.(arena._terrainMeshes);
      for (const u of arena.allUnits || []) {
        arena._groundSampler?.snapMesh?.(u.mesh);
      }
      arena.orbitCamera?.setCollisionMeshes?.(arena._obstacleMeshes);
      if (next.presetId === "colosseum") {
        arena._djBooth?.dispose?.();
        arena._djBooth = null;
      } else if (!arena._djBooth) {
        arena._djBooth = createDjBoothRig(arena.scene);
      }
      if (next.presetId === "island" && isCombatSandboxUi()) {
        mountHarvestForArena(arena);
      } else {
        teardownHarvestForArena(arena);
      }
    }
  });
}

export function teardownDangerRoom(arena) {
  if (arena._focusKeyHandler) {
    window.removeEventListener("keydown", arena._focusKeyHandler);
    arena._focusKeyHandler = null;
  }
  clearFocusTargets();
  teardownHarvestForArena(arena);
  unmountDangerRoomLoadoutPanel();
  unmountDangerRoomDock();
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

const _toTarget = new THREE.Vector3();

function applyCameraAssist(arena, dt, weaponType, aiming) {
  const cam = arena.orbitCamera;
  if (!cam) return;
  const sandbox = isCombatSandboxUi();
  const rate = sandbox
    ? focusHardLockCameraAssistRate(aiming, weaponType)
    : hardLockCameraAssistRate(aiming, weaponType);
  if (rate <= 0) {
    cam.setCameraAssist(null, null, 0);
    return;
  }
  const world = sandbox ? lockedFocusWorld() : lockedTargetWorld(arena.targeting);
  if (!world) {
    cam.setCameraAssist(null, null, 0);
    return;
  }
  _toTarget.copy(world).sub(arena.camera.position);
  if (_toTarget.lengthSq() < 1e-6) return;
  _toTarget.normalize();
  const yaw = Math.atan2(_toTarget.x, _toTarget.z);
  const pitch = Math.asin(Math.max(-1, Math.min(1, _toTarget.y)));
  cam.setCameraAssist(yaw, pitch, rate);
}

/** Per-frame danger room systems (music, DJ, shooter, HUD). */
export function tickDangerRoomSystems(arena, delta = 0.016) {
  getDangerRoomMusic().setIntensityTarget(0.35);
  getDangerRoomMusic().update(delta);
  arena._djBooth?.update?.(delta);
  updateShooter(arena, delta);
  tickHarvestForArena(arena, delta);
  tickDangerRoomHud(arena, delta);
}

/** Per-frame danger room HUD updates. */
export function tickDangerRoomHud(arena, delta = 0.016) {
  if (!arena.playerController) return;
  const ctrl = arena.playerController;
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

  const canvas = arena.renderer?.domElement;

  const sandbox = isCombatSandboxUi();
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    if (sandbox) {
      updateFocusSoftLock(delta, arena.camera, rect, aiming, lockWeapon);
    } else {
      syncTargetLockFromTargeting(arena.targeting);
      updateSoftLock(delta, arena.camera, rect, arena.targeting, aiming, lockWeapon);
    }
    applyCameraAssist(arena, delta, lockWeapon, aiming);
  }

  const crosshairBase = getDangerRoomState().crosshairBase ?? 10;
  const focusHud = sandbox ? getFocusSoftLockHudState() : {};
  const locked = sandbox ? getLockedFocusTarget() : null;
  const metrics = arena.playerUnit?.characterMetrics || arena.playerUnit?.mesh?.userData?.characterMetrics;
  const measuredH = metrics?.measuredHeight ?? metrics?.targetHeight;

  updateDangerHud({
    motion,
    height: measuredH,
    weapon: locked
      ? `${locked.label} · ${locked.kind.toUpperCase()}`
      : (weapon ? `${weapon.name} · ${feel.title}` : feel.title),
    accent: focusHud.accent || feel.accent,
    focusKind: focusHud.focusKind,
    focusFilter: sandbox ? getFocusFilterLabel() : null,
    combo: getComboStage(),
    spread: crosshairBase + getCrosshairSpread(),
    hitMarker: getHitMarkerId(),
    rangeState,
    softLock: getSoftLockHudState(),
  });
  syncAbilityBarFlash();
}

/** Tab cycle with soft-lock zone (danger room). */
export function dangerRoomCycleTarget(arena) {
  const canvas = arena.renderer?.domElement;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const weaponType = arena._getWeaponTypeKey?.() ?? "greatsword";
  if (isCombatSandboxUi()) {
    const picked = cycleFocusTabTarget(arena.camera, rect, weaponType);
    if (picked?.mesh) {
      arena.orbitCamera?.nudgeToward?.(picked.mesh.position);
    } else if (picked) {
      const p = picked.getWorld(new THREE.Vector3());
      arena.orbitCamera?.nudgeToward?.(p);
    }
    return;
  }
  if (!arena.targeting) return;
  cycleTabTarget(arena.camera, rect, arena.targeting, weaponType);
  arena.orbitCamera?.nudgeToward?.(
    arena.targeting.currentTarget?.mesh?.position ?? new THREE.Vector3(),
  );
}