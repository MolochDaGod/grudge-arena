/**
 * Fantastic Village Pack props — FBX cluster near the island spawn hub.
 */

import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { assetUrl } from "../assetConfig.js";
import { islandHeight } from "./IslandTerrain.js";

const TEX_PATH = assetUrl("assets/island/village/textures/");
const PROP_PATH = assetUrl("assets/island/village/props/");

const VILLAGE_LAYOUT = [
  { file: "SM_BLD_base_v01_01.fbx", x: 12, z: -8, ry: -0.35, scale: 0.012 },
  { file: "SM_BLD_body_v01_01.fbx", x: 12, z: -8, ry: -0.35, scale: 0.012, yOffset: 0.05 },
  { file: "SM_BLD_chimney_v01_03.fbx", x: 12.8, z: -7.2, ry: -0.35, scale: 0.012, yOffset: 4.2 },
  { file: "SM_BLD_waterwheel_construct.fbx", x: -11, z: 9, ry: 1.1, scale: 0.011 },
  { file: "SM_PROP_well.fbx", x: 8, z: -5, ry: 0.2, scale: 0.013 },
  { file: "SM_PROP_campfire.fbx", x: 6, z: -9, ry: 0, scale: 0.013 },
  { file: "SM_PROP_cart_03.fbx", x: 15, z: -11, ry: -1.2, scale: 0.012 },
  { file: "SM_PROP_barrel_01.fbx", x: 9.5, z: -7.5, ry: 0.4, scale: 0.013 },
  { file: "SM_PROP_crate_01.fbx", x: 10.5, z: -6.8, ry: -0.6, scale: 0.013 },
  { file: "SM_PROP_fence_v01_01.fbx", x: 4, z: -6, ry: 0.9, scale: 0.013 },
  { file: "SM_PROP_fence_v01_02.fbx", x: 3.2, z: -4.5, ry: 0.9, scale: 0.013 },
  { file: "SM_PROP_fence_v01_03.fbx", x: 2.5, z: -3, ry: 0.9, scale: 0.013 },
  { file: "SM_PROP_fence_door_gate.fbx", x: 1.8, z: -1.2, ry: 0.9, scale: 0.013 },
];

function enhanceFbxMaterials(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.roughness = Math.min(mat.roughness ?? 0.85, 0.95);
      mat.metalness = Math.min(mat.metalness ?? 0, 0.25);
    }
  });
}

function groundProp(prop, spec) {
  const y = islandHeight(spec.x, spec.z);
  prop.position.set(spec.x, y + (spec.yOffset || 0), spec.z);
  prop.rotation.y = spec.ry ?? 0;
  prop.scale.setScalar(spec.scale ?? 0.012);
  return prop;
}

/**
 * @param {THREE.Group} root
 * @returns {Promise<{ group: THREE.Group, obstacleMeshes: THREE.Object3D[] }>}
 */
export async function loadVillageCluster(root) {
  const group = new THREE.Group();
  group.name = "island-village";
  const loader = new FBXLoader();
  loader.setResourcePath(TEX_PATH);
  const obstacleMeshes = [];

  await Promise.all(
    VILLAGE_LAYOUT.map(async (spec) => {
      try {
        const fbx = await loader.loadAsync(PROP_PATH + spec.file);
        enhanceFbxMaterials(fbx);
        groundProp(fbx, spec);
        fbx.name = `village-${spec.file.replace(".fbx", "")}`;
        group.add(fbx);
        if (spec.file.includes("BLD_") || spec.file.includes("well") || spec.file.includes("cart")) {
          obstacleMeshes.push(fbx);
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