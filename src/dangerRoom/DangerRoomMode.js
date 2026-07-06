/**
 * Danger Room training mode — solo player + stationary dummies, no match timer.
 * Uses dangerroom.puter.site controller outline (W/S, A/D turn, Q/E strafe, 1-4 skills).
 */

import * as THREE from "three";
import { DefaultHeroForRace } from "../HeroRegistry.js";
import { buildDangerRoomEnvironment, applyDangerRoomPreset } from "./DangerRoomEnvironment.js";
import {
  getDangerRoomState,
  subscribeDangerRoom,
  setDangerMode,
} from "./dangerRoomStore.js";
import {
  mountDangerRoomHud,
  unmountDangerRoomHud,
  setDangerWeaponLabel,
  updateDangerHud,
  syncAbilityBarFlash,
} from "./dangerRoomHud.js";
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
  const weaponName = arena.getCurrentWeapon?.()?.name || "Weapon";
  setDangerWeaponLabel(weaponName);

  arena._dangerUnsub = subscribeDangerRoom(() => {
    const next = getDangerRoomState();
    arena._dangerEnv = applyDangerRoomPreset(arena.scene, arena._dangerEnv?.root, next.presetId);
    if (arena._dangerEnv) {
      arena._dangerClampRadius = arena._dangerEnv.clampRadius;
      arena._obstacleMeshes = arena._dangerEnv.obstacleMeshes;
      arena._terrainMeshes = arena._dangerEnv.terrainMeshes;
      arena.orbitCamera?.setCollisionMeshes?.(arena._obstacleMeshes);
    }
  });
}

export function teardownDangerRoom(arena) {
  unmountDangerRoomHud();
  arena._dangerUnsub?.();
  arena._dangerUnsub = null;
  setDangerMode(false);
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

  const motion = resolveMotionLabel(feel, {
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
  const lockWeapon = arena._getWeaponTypeKey?.() ?? weaponType;
  const aiming = !!(arena._autoAttackOn || ctrl.holdKey?._RMB);

  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    syncTargetLockFromTargeting(arena.targeting);
    updateSoftLock(delta, arena.camera, rect, arena.targeting, aiming, lockWeapon);
    applyCameraAssist(arena, delta, lockWeapon, aiming);
  }

  updateDangerHud({
    motion,
    weapon: weapon ? `${weapon.name} · ${feel.title}` : feel.title,
    accent: feel.accent,
    combo: getComboStage(),
    spread: getCrosshairSpread(),
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