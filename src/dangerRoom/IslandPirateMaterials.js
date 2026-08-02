/**
 * Kenney Pirate Kit materials — colormap + village/terrain texture blend + sail/flag tinting.
 */

import * as THREE from "three";
import { islandAssetUrl } from "../assetConfig.js";

const COLORMAP = islandAssetUrl("pirate-kit/glb/Textures/colormap.png");
const VILLAGE_TEX = islandAssetUrl("village/textures/");

let _texPromise = null;
const _overlayCache = new Map();
const _loader = new THREE.TextureLoader();

const MESH_TEXTURE_RULES = [
  { test: /castle|tower|rocks|stone|wall/i, tex: "T_stonebrick_02_BC.png", repeat: [2, 2] },
  { test: /structure|platform|dock|plank|mast|crate|barrel|chest|boat|ship(?!-ghost)/i, tex: "T_wood_05_BC.png", repeat: [3, 3] },
  { test: /grass|patch|palm|foliage|plant/i, tex: null, color: 0x4a7a3a },
  { test: /sand|hole/i, tex: null, color: 0xc4a574 },
];

async function loadOverlayTexture(filename) {
  if (!filename) return null;
  if (_overlayCache.has(filename)) return _overlayCache.get(filename);
  try {
    const tex = await _loader.loadAsync(VILLAGE_TEX + filename);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    _overlayCache.set(filename, tex);
    return tex;
  } catch {
    _overlayCache.set(filename, null);
    return null;
  }
}

export function loadPirateColormap() {
  if (!_texPromise) {
    _loader.setCrossOrigin("anonymous");
    _texPromise = _loader.loadAsync(COLORMAP).then((tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.flipY = false;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      return tex;
    });
  }
  return _texPromise;
}

function ruleForMesh(name) {
  for (const rule of MESH_TEXTURE_RULES) {
    if (rule.test.test(name)) return rule;
  }
  return null;
}

/**
 * @param {THREE.Object3D} root
 * @param {{ file?: string }} [opts]
 */
export async function bindPirateMaterials(root, opts = {}) {
  const map = await loadPirateColormap();
  const jobs = [];

  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    const meshName = child.name || opts.file || "";
    const rule = ruleForMesh(meshName);
    jobs.push(
      (async () => {
        const overlay = rule?.tex ? await loadOverlayTexture(rule.tex) : null;
        const wasArray = Array.isArray(child.material);
        const mats = wasArray ? child.material : [child.material];
        const bound = mats.map((mat) => {
          if (!mat) return mat;
          const next = mat.clone();
          next.map = overlay || map;
          if (overlay) {
            next.map.repeat.set(rule.repeat[0], rule.repeat[1]);
            next.map.needsUpdate = true;
          }
          next.color.set(rule?.color ? rule.color : 0xffffff);
          if (next.emissive?.set) next.emissive.set(0x000000);
          if (next.emissiveIntensity !== undefined) next.emissiveIntensity = 0;
          next.metalness = Math.min(next.metalness ?? 0, 0.08);
          next.roughness = Math.max(next.roughness ?? 0.85, 0.72);
          next.side = THREE.DoubleSide;
          next.needsUpdate = true;
          return next;
        });
        child.material = wasArray ? bound : bound[0];
      })(),
    );
  });

  await Promise.all(jobs);
}

/**
 * Player ships: white sails + customizable tint. Enemy: pirate colormap sails.
 */
export function applyShipFactionStyle(root, { faction = "player", sailColor = "#f5f5f0" } = {}) {
  const sailHex = new THREE.Color(sailColor);
  const pirateSail = new THREE.Color(0x8b1a1a);
  const pirateHull = new THREE.Color(0x3d2817);

  root.traverse((child) => {
    if (!child.isMesh) return;
    const n = (child.name || "").toLowerCase();
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (n.includes("sail")) {
        if (faction === "player") {
          mat.color.copy(sailHex);
          mat.emissive?.set?.(sailHex).multiplyScalar(0.04);
        } else {
          mat.color.copy(pirateSail);
        }
        mat.needsUpdate = true;
      } else if (faction === "enemy" && n.includes("ship")) {
        mat.color.lerp(pirateHull, 0.25);
        mat.needsUpdate = true;
      } else if (faction === "player" && n.includes("flag")) {
        mat.color.copy(sailHex);
        mat.needsUpdate = true;
      }
    }
  });
}

/** Claim zone flags — player/neutral/enemy colors on pennant meshes. */
export function applyClaimFlagStyle(root, { pirate = false, claimColor = "#4a90d9" } = {}) {
  const tint = new THREE.Color(claimColor);
  root.traverse((child) => {
    if (!child.isMesh) return;
    const n = (child.name || "").toLowerCase();
    if (!n.includes("flag")) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (pirate) {
        mat.color.set(0x8b2635);
      } else {
        mat.color.copy(tint);
      }
      mat.needsUpdate = true;
    }
  });
}