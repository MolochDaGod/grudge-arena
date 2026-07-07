/**
 * Fantastic Village Pack props — GLB (converted) with texture bind fallback.
 */

import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { islandAssetUrl } from "../assetConfig.js";
import { islandHeight } from "./IslandTerrain.js";
import { bindVillageMaterials } from "./IslandVillageMaterials.js";

const GLB_PATH = islandAssetUrl("village/glb/");
const FBX_PATH = islandAssetUrl("village/props/");

/** GLB exports from fbx2gltf are already in metres; FBX fallback is cm (×0.01). */
const GLB_SCALE = 1;
const FBX_SCALE = 0.01;

const VILLAGE_LAYOUT = [
  { file: "SM_BLD_base_v01_01", x: 12, z: -8, ry: -0.35 },
  { file: "SM_BLD_body_v01_01", x: 12, z: -8, ry: -0.35, yOffset: 1.05 },
  { file: "SM_BLD_chimney_v01_03", x: 12.8, z: -7.2, ry: -0.35, yOffset: 14.8 },
  { file: "SM_BLD_waterwheel_construct", x: -11, z: 9, ry: 1.1 },
  { file: "SM_PROP_well", x: 8, z: -5, ry: 0.2 },
  { file: "SM_PROP_campfire", x: 6, z: -9, ry: 0 },
  { file: "SM_PROP_cart_03", x: 15, z: -11, ry: -1.2 },
  { file: "SM_PROP_barrel_01", x: 9.5, z: -7.5, ry: 0.4 },
  { file: "SM_PROP_crate_01", x: 10.5, z: -6.8, ry: -0.6 },
  { file: "SM_PROP_fence_v01_01", x: 4, z: -6, ry: 0.9 },
  { file: "SM_PROP_fence_v01_02", x: 3.2, z: -4.5, ry: 0.9 },
  { file: "SM_PROP_fence_v01_03", x: 2.5, z: -3, ry: 0.9 },
  { file: "SM_PROP_fence_door_gate", x: 1.8, z: -1.2, ry: 0.9 },
];

function enhanceMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function groundProp(prop, spec, unitScale) {
  const y = islandHeight(spec.x, spec.z);
  prop.position.set(spec.x, y + (spec.yOffset || 0), spec.z);
  prop.rotation.y = spec.ry ?? 0;
  prop.scale.setScalar(unitScale);
  return prop;
}

async function loadVillageProp(spec, gltfLoader, fbxLoader) {
  const glbUrl = `${GLB_PATH}${spec.file}.glb`;
  try {
    const gltf = await gltfLoader.loadAsync(glbUrl);
    const scene = gltf.scene;
    await bindVillageMaterials(scene);
    enhanceMaterials(scene);
    return { scene, unitScale: GLB_SCALE };
  } catch {
    const fbx = await fbxLoader.loadAsync(`${FBX_PATH}${spec.file}.fbx`);
    await bindVillageMaterials(fbx);
    enhanceMaterials(fbx);
    return { scene: fbx, unitScale: FBX_SCALE };
  }
}

/**
 * @param {THREE.Group} root
 * @returns {Promise<{ group: THREE.Group, obstacleMeshes: THREE.Object3D[] }>}
 */
export async function loadVillageCluster(root) {
  const group = new THREE.Group();
  group.name = "island-village";
  const gltfLoader = new GLTFLoader();
  const fbxLoader = new FBXLoader();
  const obstacleMeshes = [];

  await Promise.all(
    VILLAGE_LAYOUT.map(async (spec) => {
      try {
        const { scene: prop, unitScale } = await loadVillageProp(spec, gltfLoader, fbxLoader);
        groundProp(prop, spec, unitScale);
        prop.name = `village-${spec.file}`;
        group.add(prop);
        if (spec.file.includes("BLD_") || spec.file.includes("well") || spec.file.includes("cart")) {
          obstacleMeshes.push(prop);
        }
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