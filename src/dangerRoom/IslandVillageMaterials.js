/**
 * Bind Fantastic Village Pack textures onto prop meshes.
 * FBX embeds absolute Dropbox paths — we resolve by material name → local PNG.
 */

import * as THREE from "three";
import { islandAssetUrl } from "../assetConfig.js";

const TEX_BASE = islandAssetUrl("village/textures/");
const loader = new THREE.TextureLoader();
const cache = new Map();

/** Filename aliases when FBX references differ from shipped PNG names. */
const FILE_ALIASES = {
  T_stonebrick_02: "T_stonebrick_02_BC",
  T_stonebrick_02_png: "T_stonebrick_02_BC",
  T_rooftiles_05: "T_rooftiles_05_BC",
  T_rooftiles_03: "T_rooftiles_03_BC",
  T_rooftiles_01: "T_rooftiles_01_BC",
  T_wall_02: "T_wall_02_BC",
  T_wood_05: "T_wood_05_BC",
  T_wood_detail_01: "T_wood_detail_01_BC",
  T_metal_02: "T_metal_02_BC",
};

/** Tint when a PNG is missing so props are not flat grey. */
const STEM_FALLBACK_COLORS = {
  wood: 0x6b4423,
  wall: 0x9a8b72,
  stonebrick: 0x7a7a72,
  rooftiles: 0x8b3a2a,
  metal: 0x6a6a72,
  rope: 0x5c4033,
  cloth: 0x4a5a4a,
};

function basename(file) {
  return file.replace(/\\/g, "/").split("/").pop() || file;
}

function materialStem(materialName) {
  const raw = (materialName || "").trim();
  if (!raw) return "";
  const base = raw.replace(/\.(png|jpg|jpeg|tga)$/i, "");
  if (base.startsWith("M_")) return base.slice(2);
  if (base.startsWith("T_")) return base.slice(2);
  return base;
}

function candidateFiles(materialName) {
  const stem = materialStem(materialName);
  if (!stem) return [];
  const texBase = `T_${stem}`;
  const aliased = FILE_ALIASES[texBase] || FILE_ALIASES[stem] || texBase;
  const names = new Set([
    `${aliased}.png`,
    `${aliased}_BC.png`,
    `${texBase}.png`,
    `${texBase}_BC.png`,
    `T_${stem}.png`,
    `T_${stem}_BC.png`,
  ]);
  return [...names];
}

async function loadTextureFile(filename) {
  const key = basename(filename);
  if (cache.has(key)) return cache.get(key);
  const url = TEX_BASE + encodeURIComponent(key).replace(/%2F/g, "/");
  try {
    const tex = await loader.loadAsync(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    cache.set(key, tex);
    return tex;
  } catch {
    cache.set(key, null);
    return null;
  }
}

async function loadTextureForMaterial(materialName) {
  for (const file of candidateFiles(materialName)) {
    const tex = await loadTextureFile(file);
    if (tex) return tex;
  }
  return null;
}

function fallbackColorForStem(stem) {
  if (!stem) return 0x888878;
  const key = Object.keys(STEM_FALLBACK_COLORS).find((k) => stem.includes(k));
  return key ? STEM_FALLBACK_COLORS[key] : 0x888878;
}

/** fbx2gltf embeds a 1×1 placeholder — discard so local PNGs can bind. */
function isPlaceholderMap(tex) {
  if (!tex?.image) return true;
  const w = tex.image.width ?? tex.image.naturalWidth ?? 0;
  const h = tex.image.height ?? tex.image.naturalHeight ?? 0;
  return w <= 4 && h <= 4;
}

function upgradeMaterial(mat, map, normalMap = null, stem = "") {
  let out = mat;
  if (!mat?.isMeshStandardMaterial) {
    out = new THREE.MeshStandardMaterial({
      name: mat?.name || "village",
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
  }
  if (out.map && isPlaceholderMap(out.map)) {
    out.map = null;
  }
  if (map) {
    out.map = map;
    out.color.set(0xffffff);
  } else {
    out.color.set(fallbackColorForStem(stem));
  }
  if (normalMap) {
    out.normalMap = normalMap;
    out.normalScale.set(1, 1);
  }
  out.roughness = 0.88;
  out.metalness = 0.05;
  out.envMapIntensity = Math.max(out.envMapIntensity ?? 0.4, 0.9);
  out.needsUpdate = true;
  return out;
}

/**
 * @param {THREE.Object3D} root
 */
async function bindMeshMaterials(child) {
  const isArray = Array.isArray(child.material);
  const mats = isArray ? child.material : [child.material];
  const upgraded = await Promise.all(
    mats.map(async (mat) => {
      if (!mat) return mat;
      const texKey = mat.name || mat.userData?.texture || child.name;
      const stem = materialStem(texKey);
      const map = await loadTextureForMaterial(texKey);
      if (!map) {
        console.warn(`[island] village texture missing for material "${texKey}"`);
      }

      let normalMap = null;
      const normalCandidates = candidateFiles(texKey).map((f) =>
        f.replace("_BC.png", "_N.png").replace(".png", "_N.png"),
      );
      for (const nf of normalCandidates) {
        normalMap = await loadTextureFile(nf);
        if (normalMap) break;
      }
      return upgradeMaterial(mat, map, normalMap, stem);
    }),
  );
  child.material = isArray ? upgraded : upgraded[0];
}

export async function bindVillageMaterials(root) {
  const meshes = [];
  root.traverse((child) => {
    if (child.isMesh) meshes.push(child);
  });
  await Promise.all(meshes.map(bindMeshMaterials));
  return root;
}