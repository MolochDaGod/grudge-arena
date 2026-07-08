/**
 * Colosseum GLB environment — ported from arpg-game ColosseumMap.tsx.
 */

import * as THREE from "three";
import { createGLTFLoader } from "../gltfLoader.js";
import { assetUrl } from "../assetConfig.js";

const COLOSSEUM_URL = assetUrl("assets/danger/colosseum.glb");

function enhanceMapMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat?.isMeshStandardMaterial) continue;
      mat.envMapIntensity = 0.35;
      if (typeof mat.roughness === "number") {
        mat.roughness = THREE.MathUtils.clamp(mat.roughness * 0.92, 0.35, 1);
      }
      if (typeof mat.metalness === "number") {
        mat.metalness = THREE.MathUtils.clamp(mat.metalness * 0.85, 0, 0.45);
      }
      mat.needsUpdate = true;
    }
  });
}

/**
 * @param {THREE.Scene} scene
 * @returns {Promise<{ root: THREE.Group, terrainMeshes: THREE.Object3D[], obstacleMeshes: THREE.Object3D[] }>}
 */
export async function loadColosseumMap(scene) {
  const root = new THREE.Group();
  root.name = "colosseum-map";

  const loader = await createGLTFLoader();
  const gltf = await loader.loadAsync(COLOSSEUM_URL);
  const map = gltf.scene;
  enhanceMapMaterials(map);
  root.add(map);
  scene.add(root);

  const terrainMeshes = [];
  const obstacleMeshes = [];
  map.traverse((obj) => {
    if (obj.isMesh) {
      terrainMeshes.push(obj);
      if (obj.name?.toLowerCase().includes("column") || obj.name?.toLowerCase().includes("wall")) {
        obstacleMeshes.push(obj);
      }
    }
  });

  return { root, terrainMeshes, obstacleMeshes };
}