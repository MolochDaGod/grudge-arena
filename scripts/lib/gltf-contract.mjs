/**
 * gltf-contract.mjs — verified GLB/GLTF contract for Grudge Arena D1 characters.
 * Used by validate-gltf-contract.mjs, validate-arena-assets.mjs, and CI gates.
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
import {
  parseGLB,
  effectiveWorldHeight,
  measureRootScale,
  HUMANOID_MIN_M,
  HUMANOID_MAX_M,
  RACE_HEIGHT_SCALE,
} from "./glb-scale.mjs";

export const GLTF_CONTRACT_VERSION = "arenaGltf/1.0";

export const REQUIRED_BONES = [
  "Bip001 Pelvis",
  "Bip001 Head",
  "Bip001 L Foot",
  "Bip001 R Foot",
];

export function bip001Aliases(canonical) {
  return [
    canonical,
    canonical.replace(/^Bip001 /, "Bip001_").replace(/ /g, "_"),
  ];
}

export function hasBone(bones, canonical) {
  return bip001Aliases(canonical).some((name) => bones.has(name));
}

export function collectBonesFromGltf(json) {
  const bones = new Set();
  for (const sk of json.skins || []) {
    for (const jid of sk.joints || []) {
      if (jid == null) continue;
      const n = json.nodes?.[jid]?.name;
      if (n) bones.add(n);
    }
  }
  if (bones.size === 0) {
    for (const n of json.nodes || []) {
      if (n?.name && /Bip001/i.test(n.name)) bones.add(n.name);
    }
  }
  return bones;
}

/** Skin joint integrity — null joints break skinning at runtime. */
export function auditSkinIntegrity(json) {
  const skins = json.skins || [];
  let totalJoints = 0;
  let nullJoints = 0;
  let boundSkins = 0;
  for (const skin of skins) {
    const joints = skin.joints || [];
    if (!joints.length) continue;
    totalJoints += joints.length;
    const nulls = joints.filter((j) => j == null).length;
    nullJoints += nulls;
    if (joints.some((j) => j != null)) boundSkins++;
  }
  return {
    skinCount: skins.length,
    boundSkins,
    totalJoints,
    nullJoints,
    nullRatio: totalJoints ? nullJoints / totalJoints : 0,
  };
}

export function sha256File(path) {
  const buf = readFileSync(path);
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Validate a baked D1 character GLB against the arena contract.
 * @param {string|Buffer} input — file path or buffer
 * @param {{ race?: string, targetHeightM?: number }} [opts]
 */
export function validateCharacterGlbContract(input, opts = {}) {
  const buf = typeof input === "string" ? readFileSync(input) : input;
  const path = typeof input === "string" ? input : opts.path || "(buffer)";
  const { json, bin } = parseGLB(buf);
  const race = opts.race || "unknown";
  const targetH =
    opts.targetHeightM ??
    1.75 * (RACE_HEIGHT_SCALE[race] ?? 1);

  const world = effectiveWorldHeight(json, bin);
  const root = measureRootScale(json);
  const bones = collectBonesFromGltf(json);
  const skin = auditSkinIntegrity(json);
  const missingBones = REQUIRED_BONES.filter((b) => !hasBone(bones, b));

  const skinnedMeshes = (json.meshes || []).filter((m) =>
    (m.primitives || []).some((p) => p.attributes?.JOINTS_0 != null),
  ).length;

  const errors = [];
  const warnings = [];

  if (world.worldHeight < HUMANOID_MIN_M || world.worldHeight > HUMANOID_MAX_M) {
    errors.push(
      `world height ${world.worldHeight.toFixed(2)}m outside ${HUMANOID_MIN_M}–${HUMANOID_MAX_M}m`,
    );
  } else if (Math.abs(world.worldHeight - targetH) / targetH > 0.12) {
    errors.push(
      `world ${world.worldHeight.toFixed(2)}m ≠ target ${targetH.toFixed(2)}m`,
    );
  }

  if (skin.boundSkins < 1) {
    errors.push("no skins with bound joint indices");
  }
  if (skin.nullJoints > 0) {
    errors.push(
      `${skin.nullJoints}/${skin.totalJoints} skin joints are null — rebake from public/models/{race}.glb`,
    );
  }

  if (missingBones.length) {
    errors.push(`missing bones: ${missingBones.join(", ")}`);
  }

  if (skinnedMeshes < 5) {
    warnings.push(`only ${skinnedMeshes} skinned meshes — expected modular D1 parts`);
  }

  if (root.maxS < 0.1 || root.maxS > 8) {
    warnings.push(`unusual root scale ${root.maxS.toFixed(3)}`);
  }

  return {
    contract: GLTF_CONTRACT_VERSION,
    path,
    race,
    ok: errors.length === 0,
    errors,
    warnings,
    sha256: typeof input === "string" ? sha256File(input) : null,
    worldHeightM: parseFloat(world.worldHeight.toFixed(4)),
    vertexHeightM: parseFloat(world.height.toFixed(4)),
    rootScale: root.maxS,
    boneCount: bones.size,
    skinnedMeshCount: skinnedMeshes,
    skin,
    scaleMode: "skinned-root-only",
    targetHeightM: targetH,
  };
}