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

/** Training dummies — enemy team targets that don't chase the player. */
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
    { heroId: "orc", weapon: "greatsword", isPlayer: false, tier: 1, displayName: "Training Dummy" },
    { heroId: "elf", weapon: "bow", isPlayer: false, tier: 1, displayName: "Archer Dummy" },
    { heroId: "undead", weapon: "staff", isPlayer: false, tier: 1, displayName: "Mage Dummy" },
  ];
  return { TEAM_A, TEAM_B };
}

/** Compact spawns inside the 32×32 training chamber. */
export function getDangerSpawnPosition(teamId, slot, teamSize) {
  if (teamId === "A") {
    return new THREE.Vector3(0, 0, 5);
  }
  const x = (slot - (teamSize - 1) / 2) * 3.5;
  return new THREE.Vector3(x, 0, -7);
}

export function getDangerSpawnFacing(teamId) {
  return teamId === "A" ? Math.PI : 0;
}

/**
 * Attach danger room systems to a GrudgeArena instance.
 * @param {import('../../game.js').GrudgeArena} arena
 */
export function bootstrapDangerRoom(arena) {
  setDangerMode(true);
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
    }
  });
}

export function teardownDangerRoom(arena) {
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
export function applyDangerLiveLoadout(arena) {
  const unit = arena.playerUnit;
  if (!unit?.equipment) return;
  const st = getD1LoadoutState();
  const weapon = arena._getWeaponTypeKey?.() ?? st.weapon;
  applyLiveD1ToEquipment(unit.equipment, weapon, getD1LoadoutForRace(st.race));
  syncGearCatalog(unit.equipment);
}

const _toTarget = new THREE.Vector3();

function applyCameraAssist(arena, dt, weaponType, aiming) {
  const cam = arena.orbitCamera;
  if (!cam) return;
  const rate = hardLockCameraAssistRate(aiming, weaponType);
  if (rate <= 0) {
    cam.setCameraAssist(null, null, 0);
    return;
  }
  const world = lockedTargetWorld(arena.targeting);
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
  const motion = resolveMotionLabel(feel, {
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

  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    syncTargetLockFromTargeting(arena.targeting);
    updateSoftLock(delta, arena.camera, rect, arena.targeting, aiming, lockWeapon);
    applyCameraAssist(arena, delta, lockWeapon, aiming);
  }

  const crosshairBase = getDangerRoomState().crosshairBase ?? 10;
  updateDangerHud({
    motion,
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

/** Tab cycle with soft-lock zone (danger room). */
export function dangerRoomCycleTarget(arena) {
  const canvas = arena.renderer?.domElement;
  if (!canvas || !arena.targeting) return;
  const rect = canvas.getBoundingClientRect();
  const weaponType = arena._getWeaponTypeKey?.() ?? "greatsword";
  cycleTabTarget(arena.camera, rect, arena.targeting, weaponType);
  arena.orbitCamera?.nudgeToward?.(
    arena.targeting.currentTarget?.mesh?.position ?? new THREE.Vector3(),
  );
}