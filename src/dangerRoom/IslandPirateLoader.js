/**
 * Shared Kenney Pirate Kit GLB loader + grounding.
 */

import * as THREE from "three";
import { createGLTFLoader } from "../gltfLoader.js";
import { islandAssetUrl } from "../assetConfig.js";
import { islandHeight } from "./IslandTerrain.js";
import {
  bindPirateMaterials,
  applyShipFactionStyle,
  applyClaimFlagStyle,
} from "./IslandPirateMaterials.js";
import { normalizePropHeight, targetHeightForProp } from "./islandAssetScale.js";

/** Kenney GLB format ships in metres; cm legacy exports are corrected in normalizePropHeight. */
export const UNIT_SCALE = 1;
const GLB_BASE = islandAssetUrl("pirate-kit/glb/");
const _loaderCache = new Map();

/**
 * @param {string} file — basename without .glb
 * @param {{ faction?: 'player'|'enemy'|'neutral', sailColor?: string, claimColor?: string }} [style]
 */
export async function loadPirateModel(file, style = {}) {
  const key = `${file}:${style.faction || ""}:${style.sailColor || ""}:${style.claimColor || ""}`;
  if (_loaderCache.has(key)) return _loaderCache.get(key);

  const loader = await createGLTFLoader();
  const url = `${GLB_BASE}${file}.glb`;
  const promise = loader.loadAsync(url).then(async (gltf) => {
    const root = gltf.scene;
    normalizePropHeight(root, targetHeightForProp(file));
    await bindPirateMaterials(root, { file });
    if (/^ship-/.test(file) && !/wreck|ghost/.test(file)) {
      applyShipFactionStyle(root, {
        faction: style.faction || (file.includes("pirate") ? "enemy" : "player"),
        sailColor: style.sailColor,
      });
    }
    if (/^flag/.test(file)) {
      applyClaimFlagStyle(root, {
        pirate: file.includes("pirate"),
        claimColor: style.claimColor,
      });
    }
    return { root, animations: gltf.animations || [] };
  });
  _loaderCache.set(key, promise);
  return promise;
}

export function clearPirateLoaderCache() {
  _loaderCache.clear();
}

/**
 * @param {THREE.Object3D} obj
 * @param {{ file: string, x: number, z: number, ry?: number, scale?: number, yOff?: number }} spec
 */
export function groundPirateInstance(obj, spec) {
  const scale = (spec.scale ?? 1) * UNIT_SCALE;
  obj.scale.setScalar(scale);
  if (spec.ry) obj.rotation.y = spec.ry;
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const y = islandHeight(spec.x, spec.z) - box.min.y + (spec.yOff ?? 0);
  obj.position.set(spec.x, y, spec.z);
  obj.name = `pirate-${spec.file}`;
  return obj;
}

export function tagPirateInstance(obj, meta) {
  obj.userData.pirateAsset = {
    baseFile: meta.baseFile,
    kind: meta.kind || "prop",
    maxHealth: meta.maxHealth ?? 100,
    health: meta.health ?? meta.maxHealth ?? 100,
    faction: meta.faction || "neutral",
    claimZone: meta.claimZone || null,
  };
  return obj;
}