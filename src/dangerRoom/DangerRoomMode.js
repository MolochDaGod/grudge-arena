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
  setDangerMotionLabel,
  setDangerWeaponLabel,
} from "./dangerRoomHud.js";

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

/** Per-frame danger room HUD updates. */
export function tickDangerRoomHud(arena, delta) {
  if (!arena.playerController) return;
  const speed = arena.playerController.currentSpeed || 0;
  const sprint = arena.playerController.holdKey?.ShiftLeft || arena.playerController.holdKey?.ShiftRight;
  let label = "IDLE";
  if (speed > 0.5) label = sprint ? "SPRINT" : speed > 4 ? "RUN" : "WALK";
  const snap = arena.playerController._fsmService?.getSnapshot?.();
  if (snap?.matches?.("attack")) label = "ATTACK";
  if (snap?.matches?.("dash")) label = "ROLL";
  if (snap?.matches?.("block")) label = "BLOCK";
  setDangerMotionLabel(label);
}