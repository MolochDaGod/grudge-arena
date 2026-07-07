/**
 * Character scale + grounding — manifest-first, bone-primary measurement.
 * GLBs are pre-scaled by build-character-library.mjs; runtime corrects CDN drift.
 */

import * as THREE from "three";
import { modelUrl } from "./assetConfig.js";
import { getRaceConfig } from "./engine/RaceConfig.js";

const DEFAULT_TARGET_H = 1.75;
const MANIFEST_TOLERANCE = 0.08;
const MAX_HUMANOID_H = 2.5;

let _manifestPromise = null;

export async function loadCharacterManifest() {
  if (_manifestPromise) return _manifestPromise;
  _manifestPromise = fetch(modelUrl("characterManifest.json"))
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return _manifestPromise;
}

/** Body/armor skinned meshes only — ignore baked-in weapon variants. */
export function isBodyMeasureMesh(node) {
  if (!node?.isSkinnedMesh) return false;
  if (node.visible === false) return false;
  const n = (node.name || "").toLowerCase();
  return !/weapon_|_shield_|xtra_|quiver|pick_|wood_/.test(n);
}

function measureBoneHeight(scene) {
  scene.updateMatrixWorld(true);
  let pelvis = null;
  let head = null;
  let foot = null;
  scene.traverse((node) => {
    if (!node.isBone) return;
    const name = node.name;
    if (name === "Bip001_Pelvis" || name === "Bip001 Pelvis") pelvis = node;
    if (name === "Bip001_Head" || name === "Bip001 Head") head = node;
    if (name === "Bip001_L_Foot" || name === "Bip001 L Foot") foot = node;
  });
  if (!pelvis || !head) return 0;
  const p = new THREE.Vector3();
  const h = new THREE.Vector3();
  const f = new THREE.Vector3();
  pelvis.getWorldPosition(p);
  head.getWorldPosition(h);
  if (foot) {
    foot.getWorldPosition(f);
    return Math.abs(h.y - f.y);
  }
  return Math.abs(h.y - p.y) + 0.15;
}

export function measureBodyBoundingBox(scene) {
  const bodyBox = new THREE.Box3();
  let bodyMeshes = 0;
  scene.traverse((node) => {
    if (!isBodyMeasureMesh(node)) return;
    bodyBox.expandByObject(node);
    bodyMeshes++;
  });
  return { bodyBox, bodyMeshes };
}

/**
 * Measure world-space humanoid height. Bones are primary (stable on D1 GLBs);
 * body bbox is fallback only when sane (≤2.5m).
 */
export function measureCharacterHeight(scene) {
  scene.traverse((node) => {
    if (node.isSkinnedMesh?.skeleton) node.normalizeSkinWeights();
  });
  scene.updateMatrixWorld(true);

  const { bodyBox, bodyMeshes } = measureBodyBoundingBox(scene);
  const bboxH = bodyMeshes > 0 ? bodyBox.getSize(new THREE.Vector3()).y : 0;
  const boneH = measureBoneHeight(scene);

  if (boneH >= 1.0 && boneH <= MAX_HUMANOID_H) {
    return { height: boneH, bodyMeshes, method: "bones", bboxH, boneH };
  }
  if (bboxH >= 0.9 && bboxH <= MAX_HUMANOID_H) {
    return { height: bboxH, bodyMeshes, method: "body-bbox", bboxH, boneH };
  }
  if (boneH > 0.001) {
    return { height: boneH, bodyMeshes, method: "bones-oversized", bboxH, boneH };
  }
  if (bboxH > 0.001) {
    return { height: bboxH, bodyMeshes, method: "bbox-oversized", bboxH, boneH };
  }
  return { height: 0, bodyMeshes, method: "unknown", bboxH: 0, boneH: 0 };
}

/**
 * Expected height for a race (manifest target × RaceConfig relative scale).
 */
export async function getRaceTargetHeight(race) {
  const raceConf = getRaceConfig(race);
  const manifest = await loadCharacterManifest();
  const base = manifest?.races?.[race]?.targetHeight ?? DEFAULT_TARGET_H;
  return base * (raceConf.scale ?? 1);
}

const FOOT_BONE_NAMES = new Set([
  "Bip001_L_Foot",
  "Bip001_R_Foot",
  "Bip001 L Foot",
  "Bip001 R Foot",
]);

/**
 * Foot midpoint in world Y — root convention: pivot between feet at Y=0 on flat ground.
 */
function footMidpointY(scene) {
  scene.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  const ys = [];
  scene.traverse((node) => {
    if (!node.isBone || !FOOT_BONE_NAMES.has(node.name)) return;
    node.getWorldPosition(p);
    ys.push(p.y);
  });
  if (!ys.length) return null;
  return ys.reduce((a, b) => a + b, 0) / ys.length;
}

function groundCharacter(scene) {
  const footY = footMidpointY(scene);
  if (footY !== null && Math.abs(footY) > 0.0005) {
    scene.position.y -= footY;
    return 0;
  }
  const { bodyBox, bodyMeshes } = measureBodyBoundingBox(scene);
  const grounded = bodyMeshes > 0 ? bodyBox : new THREE.Box3().setFromObject(scene);
  scene.position.y = -grounded.min.y;
  return 0;
}

/**
 * Absorb legacy export root scales (e.g. ×4.26) into scene.scale so height measurement is sane.
 * Import-time bake should leave root scale at 1; this is a runtime safety net.
 */
/**
 * Skinned GLBs keep export root scale on the armature — do NOT flatten to scene.scale
 * (that desyncs bone bind from mesh). Only absorb on non-skinned props.
 */
export function absorbEmbeddedRootScales(scene) {
  const hasSkin = scene.getObjectByProperty?.("isSkinnedMesh", true)
    || (() => {
      let sk = false;
      scene.traverse((n) => {
        if (n.isSkinnedMesh) sk = true;
      });
      return sk;
    })();
  if (hasSkin) {
    scene.updateMatrixWorld(true);
    return 1;
  }
  let factor = 1;
  for (const child of scene.children) {
    const s = child.scale?.x ?? 1;
    if (
      child.scale &&
      Math.abs(child.scale.x - child.scale.y) < 0.02 &&
      Math.abs(child.scale.y - child.scale.z) < 0.02 &&
      Math.abs(s - 1) > 0.05
    ) {
      factor *= s;
      child.scale.set(1, 1, 1);
    }
  }
  if (Math.abs(factor - 1) > 0.001) {
    scene.scale.multiplyScalar(factor);
  }
  scene.updateMatrixWorld(true);
  return factor;
}

/**
 * Apply scale + grounding. Returns metrics on scene.userData.characterMetrics.
 */
export async function applyCharacterScale(scene, race, opts = {}) {
  const log = opts.log ?? ((m) => console.log(m));
  absorbEmbeddedRootScales(scene);
  const manifest = await loadCharacterManifest();
  const raceEntry = manifest?.races?.[race];
  const raceConf = getRaceConfig(race);
  const targetH = (raceEntry?.targetHeight ?? DEFAULT_TARGET_H) * (raceConf.scale ?? 1);

  const before = measureCharacterHeight(scene);
  let appliedScale = 1;
  let source = "manifest-skip";

  if (before.height > 0.001) {
    const delta = Math.abs(before.height - targetH) / targetH;
    if (raceEntry?.scaleMode === "skinned-root-only" && delta <= MANIFEST_TOLERANCE) {
      appliedScale = 1;
      source = "manifest-baked";
    } else if (delta > MANIFEST_TOLERANCE) {
      appliedScale = targetH / before.height;
      scene.scale.multiplyScalar(appliedScale);
      source = "measured-correct";
    }
  } else {
    log(`[characterScale] ${race}: could not measure height — using target ${targetH.toFixed(2)}m`);
    source = "manifest-assumed";
  }

  scene.updateMatrixWorld(true);
  const after = measureCharacterHeight(scene);
  let resolvedH = after.height > 0.001 ? after.height : targetH;
  if (resolvedH > MAX_HUMANOID_H || Math.abs(resolvedH - targetH) / targetH > 0.25) {
    resolvedH = targetH;
  }

  const groundedY = groundCharacter(scene);

  const metrics = {
    race,
    targetHeight: targetH,
    measuredHeight: resolvedH,
    worldScale: scene.scale.x,
    appliedScale,
    groundedY,
    rootConvention: "feet-midpoint-y0",
    bodyMeshes: after.bodyMeshes,
    manifestScaleFactor: raceEntry?.scaleFactor ?? null,
    heightOffset: raceConf.heightOffset ?? 0,
    measureMethod: after.method,
    bboxHeight: after.bboxH,
    boneHeight: after.boneH,
    source,
  };
  scene.userData.characterMetrics = metrics;

  log(
    `[characterScale] ${race}: target=${targetH.toFixed(3)}m measured=${resolvedH.toFixed(3)}m ` +
      `(bones=${(after.boneH || 0).toFixed(2)} bbox=${(after.bboxH || 0).toFixed(2)}) ` +
      `scale=${scene.scale.x.toFixed(4)} (${source}) y=${groundedY.toFixed(3)}`,
  );

  return metrics;
}

/** Re-ground after equipment visibility changes (no rescale). */
export function regroundCharacter(scene, race) {
  scene.updateMatrixWorld(true);
  const groundedY = groundCharacter(scene);
  const m = scene.userData.characterMetrics;
  if (m) {
    m.groundedY = groundedY;
    m.race = race;
  }
  return groundedY;
}

/** Capsule sizing — prefer target when measured bbox inflated. */
export function physicsSizeFromMetrics(metrics, fallback = { radius: 0.5, height: 1.8, offset: 0.9 }) {
  const target = metrics?.targetHeight || fallback.height;
  let h = metrics?.measuredHeight || target;
  if (h > MAX_HUMANOID_H || h > target * 1.35) h = target;
  const radius = Math.min(0.55, Math.max(0.35, h * 0.28));
  const height = Math.max(1.2, Math.min(2.2, h));
  const offset = height * 0.5 + (metrics?.heightOffset ?? 0);
  return { radius, height, offset };
}