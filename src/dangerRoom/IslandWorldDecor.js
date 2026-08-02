/**
 * Open-world island decor — Kenney Pirate Kit outpost (all 72 GLBs) + light forest fringe.
 */

import { scatterForestPack } from "./IslandForestPack.js";
import { buildProceduralForest } from "./IslandProceduralForest.js";
import { buildPirateOutpost } from "./IslandPirateKit.js";
import { loadVillageCluster } from "./IslandVillageProps.js";

/**
 * @param {THREE.Group} root
 * @returns {Promise<{ decorRoot: THREE.Group, obstacleMeshes: THREE.Object3D[] }>}
 */
export async function buildIslandWorldDecor(root) {
  const decorRoot = root;
  const obstacleMeshes = [];

  const [pirate, pack, village] = await Promise.all([
    buildPirateOutpost(decorRoot),
    scatterForestPack(decorRoot),
    loadVillageCluster(decorRoot),
  ]);
  buildProceduralForest(decorRoot);

  if (pirate.obstacleMeshes?.length) obstacleMeshes.push(...pirate.obstacleMeshes);
  if (pack.obstacleMeshes?.length) obstacleMeshes.push(...pack.obstacleMeshes);
  if (village.obstacleMeshes?.length) obstacleMeshes.push(...village.obstacleMeshes);

  return { decorRoot, obstacleMeshes };
}