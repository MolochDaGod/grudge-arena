/**
 * Character scale + grounding — manifest-first, bone-primary measurement.
 * GLBs are pre-scaled by build-character-library.mjs; runtime corrects CDN drift.
 */

import * as THREE from "three";
import { modelUrl } from "./assetConfig.js";
import { getRaceConfig } from "./engine/RaceConfig.js";
import { findBip001Bone, BIP001_ALIASES } from "./engine/Bip001Bones.js";

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

/**
 * Armature subtree for the visible body rig (D1 GLBs ship 5+ decoy armatures).
 * AnimationMixer must target this, not the full scene root.
 */
export function getAnimationRoot(scene) {
  let root = null;
  scene.traverse((node) => {
    if (root || !isBodyMeasureMesh(node) || !node.skeleton) return;
    let p = node;
    while (p.parent && p.parent !== scene) p = p.parent;
    root = p;
  });
  return root || scene;
}

/**
 * World-space camera pivot (chest) — bone-primary, not scene root (D1 decoy armatures).
 * @param {THREE.Object3D} scene
 * @param {THREE.Vector3} [out]
 */
/** True when scene carries a Bip001 rig or baked character metrics. */
export function hasCharacterRig(scene) {
  if (!scene) return false;
  if (scene.userData?.characterMetrics) return true;
  let rigged = false;
  scene.traverse((node) => {
    if (rigged) return;
    if (node.isBone && /Bip001.?Pelvis/i.test(node.name)) rigged = true;
    if (isBodyMeasureMesh(node)) rigged = true;
  });
  return rigged;
}

export function getCharacterCameraPivot(scene, out = new THREE.Vector3()) {
  scene.updateMatrixWorld(true);
  const chest =
    findBip001Bone(scene, BIP001_ALIASES.spine2) ??
    findBip001Bone(scene, BIP001_ALIASES.spine1) ??
    findBip001Bone(scene, BIP001_ALIASES.spine) ??
    findBip001Bone(scene, BIP001_ALIASES.pelvis);
  const metrics = scene.userData?.characterMetrics;
  const targetH = metrics?.targetHeight ?? DEFAULT_TARGET_H;

  if (chest) {
    chest.getWorldPosition(out);
    if (chest.name.includes('Pelvis')) out.y += targetH * 0.42;
    return out;
  }

  out.copy(scene.position);
  out.y += targetH * 0.55;
  return out;
}

/** Prefer the skeleton on the first visible body skinned mesh (D1 GLBs ship 5+ armatures). */
function findPrimarySkeleton(scene) {
  let skeleton = null;
  scene.traverse((node) => {
    if (skeleton) return;
    if (!isBodyMeasureMesh(node) || !node.skeleton?.bones?.length) return;
    skeleton = node.skeleton;
  });
  return skeleton;
}

function resolveBoneFromSkeleton(skeleton, ...names) {
  if (!skeleton) return null;
  const lookup = new Map(skeleton.bones.map((b) => [b.name, b]));
  for (const name of names) {
    const hit = lookup.get(name);
    if (hit) return hit;
  }
  return null;
}

function measureBoneHeight(scene) {
  scene.updateMatrixWorld(true);
  const skeleton = findPrimarySkeleton(scene);
  let pelvis = resolveBoneFromSkeleton(skeleton, "Bip001 Pelvis", "Bip001_Pelvis");
  let head = resolveBoneFromSkeleton(skeleton, "Bip001 Head", "Bip001_Head");
  let foot = resolveBoneFromSkeleton(skeleton, "Bip001 L Foot", "Bip001_L_Foot");

  if (!pelvis || !head) {
    scene.traverse((node) => {
      if (!node.isBone) return;
      const name = node.name;
      if (!pelvis && (name === "Bip001_Pelvis" || name === "Bip001 Pelvis")) pelvis = node;
      if (!head && (name === "Bip001_Head" || name === "Bip001 Head")) head = node;
      if (!foot && (name === "Bip001_L_Foot" || name === "Bip001 L Foot")) foot = node;
    });
  }
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
/** World-space body height from skinned mesh vertices (truth for on-screen size). */
export function measureWorldBodyHeight(scene) {
  scene.updateMatrixWorld(true);
  let minY = Infinity;
  let maxY = -Infinity;
  let samples = 0;
  scene.traverse((node) => {
    if (!isBodyMeasureMesh(node) || !node.geometry?.attributes?.position) return;
    const pos = node.geometry.attributes.position;
    const m = node.matrixWorld.elements;
    const step = Math.max(1, Math.floor(pos.count / 400));
    for (let i = 0; i < pos.count; i += step) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const wy = m[1] * x + m[5] * y + m[9] * z + m[13];
      minY = Math.min(minY, wy);
      maxY = Math.max(maxY, wy);
      samples++;
    }
  });
  if (!samples || !Number.isFinite(minY)) return 0;
  return maxY - minY;
}

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
  const skeleton = findPrimarySkeleton(scene);
  const footCandidates = skeleton?.bones?.length
    ? skeleton.bones.filter((b) => FOOT_BONE_NAMES.has(b.name))
    : null;
  const nodes = footCandidates?.length
    ? footCandidates
    : [];
  if (!nodes.length) {
    scene.traverse((node) => {
      if (node.isBone && FOOT_BONE_NAMES.has(node.name)) nodes.push(node);
    });
  }
  for (const node of nodes) {
    node.getWorldPosition(p);
    ys.push(p.y);
  }
  if (!ys.length) return null;
  return ys.reduce((a, b) => a + b, 0) / ys.length;
}

/**
 * World Y of the lowest body contact point (boot sole), else foot-bone midpoint.
 */
export function measureFootContactY(scene) {
  scene.updateMatrixWorld(true);
  const { bodyBox, bodyMeshes } = measureBodyBoundingBox(scene);
  const footY = footMidpointY(scene);
  if (bodyMeshes > 0) {
    const soleY = bodyBox.min.y;
    if (footY === null) return soleY;
    return Math.min(soleY, footY);
  }
  return footY;
}

function groundCharacter(scene) {
  const contactY = measureFootContactY(scene);
  if (contactY !== null && Math.abs(contactY) > 0.0005) {
    scene.position.y -= contactY;
    return 0;
  }
  const grounded = new THREE.Box3().setFromObject(scene);
  scene.position.y = -grounded.min.y;
  return 0;
}

/** Place character at XZ and re-ground soles to Y=0 (never wipe loader Y offset). */
export function placeCharacterOnGround(scene, x = 0, z = 0, race = null) {
  scene.position.x = x;
  scene.position.z = z;
  return regroundCharacter(scene, race);
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
 * Correct scene.scale when skinned body vertices render far taller than target.
 * @returns {{ worldBodyH, worldBodyFix, appliedScale, source, resolvedH }}
 */
export function applyWorldBodyScaleFix(scene, race, targetH, state = {}) {
  let worldBodyH = measureWorldBodyHeight(scene);
  let worldBodyFix = 1;
  let appliedScale = state.appliedScale ?? 1;
  let source = state.source ?? "unknown";
  let resolvedH = state.resolvedH ?? targetH;

  // Synty / unbaked grudge6 GLBs often land at ~30–100× real size (cm as m).
  // Allow aggressive downscale (was clamped to ≥0.12 which blocked 100× fixes).
  if (worldBodyH > targetH * 1.25) {
    const fix = targetH / worldBodyH;
    if (fix >= 0.005 && fix <= 1.05) {
      scene.scale.multiplyScalar(fix);
      scene.updateMatrixWorld(true);
      worldBodyFix = fix;
      appliedScale *= fix;
      source = `${source}+world-body-fix`;
      groundCharacter(scene);
      worldBodyH = measureWorldBodyHeight(scene);
      const remeasured = measureCharacterHeight(scene);
      resolvedH =
        worldBodyH > 0.5 && worldBodyH < MAX_HUMANOID_H * 1.1
          ? worldBodyH
          : remeasured.height > 0.001
            ? remeasured.height
            : targetH;
    }
  }

  const m = scene.userData.characterMetrics;
  if (m) {
    m.worldBodyHeight = worldBodyH;
    m.worldBodyFix = worldBodyFix;
    m.worldScale = scene.scale.x;
    m.appliedScale = appliedScale;
    m.measuredHeight = resolvedH;
    m.source = source;
  }

  return { worldBodyH, worldBodyFix, appliedScale, source, resolvedH };
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

  // Prefer world-space body vertices (truth for on-screen size) over bone estimates.
  // Unbaked arena CDN kits are often 30–100× too tall when root scale was lost.
  const worldBefore = measureWorldBodyHeight(scene);
  const measureH =
    worldBefore > MAX_HUMANOID_H * 1.5
      ? worldBefore
      : before.height > 0.001
        ? before.height
        : worldBefore;

  if (raceEntry?.scaleMode === "skinned-root-only" && measureH > 0.001 && measureH <= MAX_HUMANOID_H * 1.15) {
    // Bake looks good — skip soft drift correction only.
    appliedScale = 1;
    source = "manifest-baked";
  } else if (measureH > 0.001) {
    const delta = Math.abs(measureH - targetH) / targetH;
    // Always correct gross oversize (cm-as-m); allow soft correct within tolerance otherwise.
    const grosslyOversized = measureH > targetH * 1.35 || measureH > MAX_HUMANOID_H;
    if (grosslyOversized || delta > MANIFEST_TOLERANCE) {
      appliedScale = targetH / measureH;
      // Allow 100× downscale for unbaked Synty / grudge6 kits
      appliedScale = Math.min(2.5, Math.max(0.005, appliedScale));
      scene.scale.multiplyScalar(appliedScale);
      source = grosslyOversized ? "force-downscale" : "measured-correct";
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

  const bodyFix = applyWorldBodyScaleFix(scene, race, targetH, {
    appliedScale,
    source,
    resolvedH,
  });
  let worldBodyH = bodyFix.worldBodyH;
  let worldBodyFix = bodyFix.worldBodyFix;
  appliedScale = bodyFix.appliedScale;
  source = bodyFix.source;
  resolvedH = bodyFix.resolvedH;

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
    worldBodyHeight: worldBodyH,
    worldBodyFix,
    source,
  };
  scene.userData.characterMetrics = metrics;

  log(
    `[characterScale] ${race}: target=${targetH.toFixed(3)}m measured=${resolvedH.toFixed(3)}m ` +
      `worldBody=${worldBodyH.toFixed(3)}m (bones=${(after.boneH || 0).toFixed(2)} bbox=${(after.bboxH || 0).toFixed(2)}) ` +
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

/** Capsule sizing — feet at mesh Y=0, center at ~pelvis (52% of standing height). */
export function physicsSizeFromMetrics(metrics, fallback = { radius: 0.5, height: 1.8, offset: 0.9 }) {
  const target = metrics?.targetHeight || fallback.height;
  let h = metrics?.measuredHeight || target;
  if (h > MAX_HUMANOID_H || h > target * 1.35) h = target;
  const radius = Math.min(0.55, Math.max(0.35, h * 0.28));
  const height = Math.max(1.2, Math.min(2.2, h));
  const pelvisFrac = 0.52;
  const offset = h * pelvisFrac + (metrics?.heightOffset ?? 0);
  return { radius, height, offset };
}