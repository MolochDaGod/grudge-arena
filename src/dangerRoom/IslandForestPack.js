/**
 * Scatter meshes from forest_pack.glb (Sketchfab forest kit) on the island heightfield.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { assetUrl } from "../assetConfig.js";
import { islandHeight, islandEdgeFactor } from "./IslandTerrain.js";

const PACK_URL = assetUrl("assets/island/forest_pack.glb");

const SCATTER = [
  { template: "tree 1", count: 22, minScale: 2.8, maxScale: 4.2, minY: 0.35 },
  { template: "tree 2", count: 18, minScale: 2.4, maxScale: 3.8, minY: 0.35 },
  { template: "rock 1", count: 14, minScale: 1.2, maxScale: 2.4, minY: 0.2 },
  { template: "rock 2", count: 10, minScale: 1.4, maxScale: 2.8, minY: 0.2 },
  { template: "grass 1", count: 28, minScale: 0.9, maxScale: 1.4, minY: 0.15 },
  { template: "grass 2", count: 24, minScale: 0.85, maxScale: 1.3, minY: 0.15 },
  { template: "flower 1", count: 16, minScale: 0.8, maxScale: 1.2, minY: 0.15 },
  { template: "mushroom 1", count: 12, minScale: 0.7, maxScale: 1.1, minY: 0.15 },
];

function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function enhanceMesh(obj) {
  obj.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.side = THREE.DoubleSide;
    }
  });
}

function normalizeTemplate(group, targetHeight = 3.5) {
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const h = Math.max(size.y, 0.001);
  const s = targetHeight / h;
  group.scale.setScalar(s);
  box.setFromObject(group);
  group.position.y -= box.min.y;
  return group;
}

function extractTemplates(scene) {
  const templates = new Map();
  const wanted = new Set(SCATTER.map((s) => s.template));
  scene.traverse((obj) => {
    if (!wanted.has(obj.name) || templates.has(obj.name)) return;
    const clone = obj.clone(true);
    enhanceMesh(clone);
    const baseName = obj.name;
    normalizeTemplate(
      clone,
      baseName.startsWith("tree") ? 3.6 : baseName.startsWith("rock") ? 1.6 : 1,
    );
    templates.set(baseName, clone);
  });
  return templates;
}

function isClearOfHub(x, z) {
  const hub = Math.hypot(x - 10, z + 6);
  const spawn = Math.hypot(x, z - 4);
  return hub > 9 && spawn > 7;
}

/**
 * @param {THREE.Group} root
 * @returns {Promise<{ group: THREE.Group, obstacleMeshes: THREE.Object3D[] }>}
 */
export async function scatterForestPack(root) {
  const group = new THREE.Group();
  group.name = "island-forest-pack";
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(PACK_URL);
  const templates = extractTemplates(gltf.scene);
  const rand = mulberry32(90210);
  const obstacleMeshes = [];

  for (const spec of SCATTER) {
    const template = templates.get(spec.template);
    if (!template) {
      console.warn(`[island] forest_pack missing template: ${spec.template}`);
      continue;
    }
    let placed = 0;
    let attempts = 0;
    while (placed < spec.count && attempts < spec.count * 12) {
      attempts++;
      const x = (rand() - 0.5) * 72;
      const z = (rand() - 0.5) * 72;
      const y = islandHeight(x, z);
      if (y < spec.minY || islandEdgeFactor(x, z) > 0.62) continue;
      if (!isClearOfHub(x, z)) continue;

      const inst = template.clone(true);
      const scale = spec.minScale + rand() * (spec.maxScale - spec.minScale);
      inst.scale.multiplyScalar(scale / (spec.template.startsWith("tree") ? 3.6 : 1));
      inst.position.set(x, y, z);
      inst.rotation.y = rand() * Math.PI * 2;
      inst.name = `forest-pack-${spec.template}-${placed}`;
      group.add(inst);
      if (spec.template.startsWith("tree") || spec.template.startsWith("rock")) {
        obstacleMeshes.push(inst);
      }
      placed++;
    }
  }

  root.add(group);
  return { group, obstacleMeshes };
}