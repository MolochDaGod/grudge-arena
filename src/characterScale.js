/**
 * Character scale + grounding — manifest-first, measure-fallback.
 * GLBs are pre-scaled by build-character-library.mjs; runtime only corrects drift.
 */

import * as THREE from "three";
import { modelUrl } from "./assetConfig.js";
import { getRaceConfig } from "./engine/RaceConfig.js";

const DEFAULT_TARGET_H = 1.75;
const MANIFEST_TOLERANCE = 0.08;

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
  const n = (node.name || "").toLowerCase();
  return !/weapon_|_shield_|xtra_|quiver|pick_|wood_/.test(n);
}

function measureBoneHeight(scene) {
  scene.updateMatrixWorld(true);
  let pelvis = null;
  let head = null;
  scene.traverse((node) => {
    if (!node.isBone) return;
    if (node.name === "Bip001_Pelvis" || node.name === "Bip001 Pelvis") pelvis = node;
    if (node.name === "Bip001_Head" || node.name === "Bip001 Head") head = node;
  });
  if (!pelvis || !head) return 0;
  const p = new THREE.Vector3();
  const h = new THREE.Vector3();
  pelvis.getWorldPosition(p);
  head.getWorldPosition(h);
  return Math.abs(h.y - p.y) + 0.25;
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
 * Measure world-space body height (metres) from skinned body meshes.
 * @returns {{ height: number, bodyMeshes: number, method: string }}
 */
export function measureCharacterHeight(scene) {
  scene.traverse((node) => {
    if (node.isSkinnedMesh) node.normalizeSkinWeights();
  });
  const { bodyBox, bodyMeshes } = measureBodyBoundingBox(scene);
  if (bodyMeshes > 0) {
    const bboxH = bodyBox.getSize(new THREE.Vector3()).y;
    if (bboxH >= 0.9) {
      return { height: bboxH, bodyMeshes, method: "body-bbox" };
    }
    const boneH = measureBoneHeight(scene);
    if (boneH >= 1.0 && boneH <= 2.2) {
      return { height: boneH, bodyMeshes, method: "bones" };
    }
  }
  return { height: 0, bodyMeshes, method: "unknown" };
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

/**
 * Apply scale + grounding. Returns metrics stored on scene.userData.characterMetrics.
 * @param {THREE.Object3D} scene
 * @param {string} race
 * @param {{ log?: (msg: string) => void }} [opts]
 */
export async function applyCharacterScale(scene, race, opts = {}) {
  const log = opts.log ?? ((m) => console.log(m));
  const manifest = await loadCharacterManifest();
  const raceEntry = manifest?.races?.[race];
  const raceConf = getRaceConfig(race);
  const targetH = (raceEntry?.targetHeight ?? DEFAULT_TARGET_H) * (raceConf.scale ?? 1);

  const before = measureCharacterHeight(scene);
  let appliedScale = 1;
  let source = "manifest-skip";

  if (before.height > 0.001) {
    const delta = Math.abs(before.height - targetH) / targetH;
    if (delta > MANIFEST_TOLERANCE) {
      appliedScale = targetH / before.height;
      scene.scale.multiplyScalar(appliedScale);
      source = before.method === "unknown" ? "manifest-fallback" : "measured-correct";
    }
  } else {
    log(`[characterScale] ${race}: could not measure height — using target ${targetH.toFixed(2)}m assumption`);
    source = "manifest-assumed";
  }

  scene.updateMatrixWorld(true);
  const after = measureCharacterHeight(scene);
  const resolvedH = after.height > 0.001 ? after.height : targetH;

  const { bodyBox, bodyMeshes } = measureBodyBoundingBox(scene);
  const grounded = bodyMeshes > 0 ? bodyBox : new THREE.Box3().setFromObject(scene);
  const groundedY = -grounded.min.y;
  scene.position.y = groundedY;

  const metrics = {
    race,
    targetHeight: targetH,
    measuredHeight: resolvedH,
    worldScale: scene.scale.x,
    appliedScale,
    groundedY,
    bodyMeshes: after.bodyMeshes,
    manifestScaleFactor: raceEntry?.scaleFactor ?? null,
    heightOffset: raceConf.heightOffset ?? 0,
    source,
  };
  scene.userData.characterMetrics = metrics;

  log(
    `[characterScale] ${race}: target=${targetH.toFixed(3)}m measured=${resolvedH.toFixed(3)}m ` +
      `scale=${scene.scale.x.toFixed(4)} (${source}) y=${groundedY.toFixed(3)}`,
  );

  return metrics;
}

/** Capsule sizing for physics from character metrics. */
export function physicsSizeFromMetrics(metrics, fallback = { radius: 0.5, height: 1.8, offset: 0.9 }) {
  const h = metrics?.measuredHeight || metrics?.targetHeight || fallback.height;
  const radius = Math.min(0.55, Math.max(0.35, h * 0.28));
  const height = Math.max(1.2, Math.min(2.2, h));
  const offset = height * 0.5 + (metrics?.heightOffset ?? 0);
  return { radius, height, offset };
}