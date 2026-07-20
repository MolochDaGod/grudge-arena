/**
 * Fantastic Village Pack props — GLB (converted) with texture bind fallback.
 */

import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { createGLTFLoader } from "../gltfLoader.js";
import { islandAssetUrl } from "../assetConfig.js";
import { islandHeight } from "./IslandTerrain.js";
import { bindVillageMaterials } from "./IslandVillageMaterials.js";
import { normalizePropHeight, targetHeightForProp } from "./islandAssetScale.js";

const GLB_PATH = islandAssetUrl("village/glb/");
const FBX_PATH = islandAssetUrl("village/props/");

/** Expanded village showcase cluster (buildings + props). */
const VILLAGE_LAYOUT = [
  { file: "SM_BLD_base_v01_01", x: 12, z: -8, ry: -0.35 },
  { file: "SM_BLD_body_v01_01", x: 12, z: -8, ry: -0.35, yOffset: 1.05 },
  { file: "SM_BLD_chimney_v01_03", x: 12.8, z: -7.2, ry: -0.35, yOffset: 14.8 },
  { file: "SM_BLD_waterwheel_construct", x: -11, z: 9, ry: 1.1 },
  // Second cottage
  { file: "SM_BLD_base_v01_01", x: -14, z: -6, ry: 0.9 },
  { file: "SM_BLD_body_v01_01", x: -14, z: -6, ry: 0.9, yOffset: 1.05 },
  { file: "SM_PROP_well", x: 8, z: -5, ry: 0.2 },
  { file: "SM_PROP_campfire", x: 6, z: -9, ry: 0 },
  { file: "SM_PROP_campfire", x: -8, z: 4, ry: 0.4 },
  { file: "SM_PROP_cart_03", x: 15, z: -11, ry: -1.2 },
  { file: "SM_PROP_cart_03", x: -16, z: 2, ry: 0.6 },
  { file: "SM_PROP_barrel_01", x: 9.5, z: -7.5, ry: 0.4 },
  { file: "SM_PROP_barrel_01", x: 10.2, z: -8.2, ry: 1.1 },
  { file: "SM_PROP_crate_01", x: 10.5, z: -6.8, ry: -0.6 },
  { file: "SM_PROP_crate_01", x: -12, z: 1, ry: 0.3 },
  { file: "SM_PROP_fence_v01_01", x: 4, z: -6, ry: 0.9 },
  { file: "SM_PROP_fence_v01_02", x: 3.2, z: -4.5, ry: 0.9 },
  { file: "SM_PROP_fence_v01_03", x: 2.5, z: -3, ry: 0.9 },
  { file: "SM_PROP_fence_door_gate", x: 1.8, z: -1.2, ry: 0.9 },
  { file: "SM_PROP_fence_v01_01", x: -10, z: -2, ry: -0.4 },
  { file: "SM_PROP_fence_v01_02", x: -11.2, z: -0.5, ry: -0.4 },
];

function enhanceMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function groundProp(prop, spec) {
  normalizePropHeight(prop, targetHeightForProp(spec.file));
  const y = islandHeight(spec.x, spec.z);
  const refH = PROP_HEIGHT_REF[spec.file] ?? targetHeightForProp(spec.file);
  const yOff = (spec.yOffset || 0) * (targetHeightForProp(spec.file) / refH);
  prop.position.set(spec.x, y + yOff, spec.z);
  prop.rotation.y = spec.ry ?? 0;
  return prop;
}

/** Layout yOffsets authored for ~14m building height. */
const PROP_HEIGHT_REF = {
  SM_BLD_body_v01_01: 14,
  SM_BLD_chimney_v01_03: 14,
};

async function loadVillageProp(spec, gltfLoader, fbxLoader) {
  const glbUrl = `${GLB_PATH}${spec.file}.glb`;
  try {
    const gltf = await gltfLoader.loadAsync(glbUrl);
    const scene = gltf.scene;
    await bindVillageMaterials(scene);
    enhanceMaterials(scene);
    return { scene };
  } catch {
    const fbx = await fbxLoader.loadAsync(`${FBX_PATH}${spec.file}.fbx`);
    await bindVillageMaterials(fbx);
    enhanceMaterials(fbx);
    return { scene: fbx };
  }
}

/**
 * @param {THREE.Group} root
 * @returns {Promise<{ group: THREE.Group, obstacleMeshes: THREE.Object3D[] }>}
 */
export async function loadVillageCluster(root) {
  const group = new THREE.Group();
  group.name = "island-village";
  const gltfLoader = await createGLTFLoader();
  const fbxLoader = new FBXLoader();
  const obstacleMeshes = [];

  await Promise.all(
    VILLAGE_LAYOUT.map(async (spec) => {
      try {
        const { scene: prop } = await loadVillageProp(spec, gltfLoader, fbxLoader);
        groundProp(prop, spec);
        prop.name = `village-${spec.file}`;
        group.add(prop);
        obstacleMeshes.push(prop);
      } catch (err) {
        console.warn(`[island] village prop ${spec.file}:`, err.message);
      }
    }),
  );

  const paving = new THREE.Mesh(
    new THREE.CircleGeometry(7, 32),
    new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.92 }),
  );
  paving.rotation.x = -Math.PI / 2;
  paving.position.set(10, islandHeight(10, -7) + 0.04, -7);
  paving.receiveShadow = true;
  paving.name = "village-paving";
  group.add(paving);

  root.add(group);
  return { group, obstacleMeshes };
}