/**
 * Wire island async load into arena ground sampling, nav, collision, and camera.
 */

import { sampleIslandHeight } from "./IslandTerrain.js";
import { createCharacterProceduralRig } from "../engine/CharacterProceduralRig.js";

/**
 * @param {import('../../game.js').GrudgeArena} arena
 * @param {{
 *   terrainMeshes?: import('three').Object3D[],
 *   groundMeshes?: import('three').Object3D[],
 *   propMeshes?: import('three').Object3D[],
 *   obstacleMeshes?: import('three').Object3D[],
 *   clampRadius?: number,
 * }} island
 */
export function applyIslandTerrainLoaded(arena, island) {
  if (!island || !arena._dangerEnv) return;

  const groundMeshes = island.groundMeshes ?? island.terrainMeshes ?? [];
  const propMeshes = island.propMeshes ?? island.obstacleMeshes ?? [];
  const baseObstacles = arena._dangerEnv.obstacleMeshes?.filter?.(
    (m) => !m?.name?.startsWith?.("pirate-") && !m?.name?.startsWith?.("village-"),
  ) ?? [];

  arena._dangerEnv.terrainMeshes = groundMeshes;
  arena._dangerEnv.clampRadius = island.clampRadius ?? arena._dangerEnv.clampRadius;
  arena._terrainMeshes = groundMeshes;
  arena._dangerClampRadius = arena._dangerEnv.clampRadius;

  if (propMeshes.length) {
    arena._dangerEnv.obstacleMeshes = [...baseObstacles, ...propMeshes];
    arena._obstacleMeshes = arena._dangerEnv.obstacleMeshes;
    arena.orbitCamera?.setCollisionMeshes?.(arena._obstacleMeshes);
  }

  arena._groundSampler?.setHeightSampleFn?.(sampleIslandHeight);
  arena._groundSampler?.setTerrainMeshes?.(groundMeshes);
  arena._groundSampler?.setPropMeshes?.(propMeshes);

  arena._terrainSystem?.refresh?.({
    terrainMeshes: groundMeshes,
    obstacleMeshes: arena._obstacleMeshes,
    propMeshes,
  });

  // Rapier heightfield already covers terrain — only register static prop AABBs.
  if (arena.physicsWorld?.addStaticMeshColliders && propMeshes.length) {
    arena.physicsWorld.addStaticMeshColliders(propMeshes);
  }

  if (!arena._proceduralRig && arena.playerUnit?.mesh && arena._groundSampler) {
    arena._proceduralRig = createCharacterProceduralRig(
      arena.playerUnit.mesh,
      arena._groundSampler,
    );
    if (arena._proceduralRig && arena.playerController) {
      arena.playerController.deferGroundSnap = true;
    }
  }
  arena._proceduralRig?.setGroundSampler?.(arena._groundSampler);
  if (arena.playerController?.setTerrainSystem && arena._terrainSystem) {
    arena.playerController.setTerrainSystem(arena._terrainSystem);
  } else if (arena.playerController?.setGroundSampler) {
    arena.playerController.setGroundSampler(arena._groundSampler);
  }
  if (arena.arenaAI && arena._terrainSystem) {
    arena.arenaAI.terrainSystem = arena._terrainSystem;
    arena.arenaAI.clampRadius = arena._dangerClampRadius;
  }
  if (arena.playerController && arena._dangerClampRadius) {
    arena.playerController.clampRadius = arena._dangerClampRadius;
  }

  for (const u of arena.allUnits || []) {
    if (arena._terrainSystem) {
      arena._terrainSystem.snapMesh(u.mesh);
    } else {
      arena._groundSampler?.snapMesh?.(u.mesh);
    }
  }

  arena._islandTerrainReady =
    !!arena._terrainSystem &&
    (arena._obstacleMeshes?.length ?? 0) >= 8 &&
    navMeshSpawnWalkable(arena);
}

/** Player + hub spawn cells walkable and eastward step from player spawn succeeds. */
export function navMeshSpawnWalkable(arena) {
  const nav = arena?._terrainSystem?.navMesh;
  if (!nav) return false;
  const step = nav.constrainMove(0, 5, 2, 5);
  return (
    nav.isWalkable(0, 5) &&
    nav.isWalkable(0, 0) &&
    !step.blocked &&
    Math.hypot(step.x, step.z - 5) > 0.4
  );
}