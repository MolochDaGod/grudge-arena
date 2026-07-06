/**
 * Open-world island decor — forest_pack.glb scatter, procedural forest, village hub.
 */

import { scatterForestPack } from "./IslandForestPack.js";
import { buildProceduralForest } from "./IslandProceduralForest.js";
import { loadVillageCluster } from "./IslandVillageProps.js";

/**
 * @param {THREE.Group} root
 * @returns {Promise<{ decorRoot: THREE.Group, obstacleMeshes: THREE.Object3D[] }>}
 */
export async function buildIslandWorldDecor(root) {
  const decorRoot = root;
  const obstacleMeshes = [];

  const [pack, village] = await Promise.all([
    scatterForestPack(decorRoot),
    loadVillageCluster(decorRoot),
  ]);
  buildProceduralForest(decorRoot);

  if (pack.obstacleMeshes?.length) obstacleMeshes.push(...pack.obstacleMeshes);
  if (village.obstacleMeshes?.length) obstacleMeshes.push(...village.obstacleMeshes);

  return { decorRoot, obstacleMeshes };
}