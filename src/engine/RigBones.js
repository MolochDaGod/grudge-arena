/**
 * Resolve hand / arm / hip bones for Bip001 or mixamorig skeletons.
 */

import { findBip001Bone, BIP001_ALIASES } from './Bip001Bones.js';

function findBoneBySuffix(root, suffix) {
  let hit = null;
  root.traverse((node) => {
    if (!hit && node.isBone && node.name.endsWith(suffix)) hit = node;
  });
  return hit;
}

function findHandBone(root, side) {
  const aliases = side === 'R' ? BIP001_ALIASES.rightHand : BIP001_ALIASES.leftHand;
  const hit = findBip001Bone(root, aliases);
  if (hit) return hit;
  const suffix = side === 'R' ? 'RightHand' : 'LeftHand';
  return findBoneBySuffix(root, suffix);
}

/** @param {THREE.Object3D} root */
export function resolveRigBones(root) {
  const hips =
    findBip001Bone(root, BIP001_ALIASES.pelvis) ??
    findBoneBySuffix(root, 'Hips') ??
    findBoneBySuffix(root, 'Pelvis') ??
    null;

  return {
    rightHand: findHandBone(root, 'R'),
    rightArm:
      findBip001Bone(root, BIP001_ALIASES.rightUpperArm) ??
      findBoneBySuffix(root, 'RightArm') ??
      null,
    rightForeArm:
      findBip001Bone(root, BIP001_ALIASES.rightForearm) ??
      findBoneBySuffix(root, 'RightForeArm') ??
      null,
    leftArm:
      findBip001Bone(root, BIP001_ALIASES.leftUpperArm) ??
      findBoneBySuffix(root, 'LeftArm') ??
      null,
    leftForeArm:
      findBip001Bone(root, BIP001_ALIASES.leftForearm) ??
      findBoneBySuffix(root, 'LeftForeArm') ??
      null,
    leftHand: findHandBone(root, 'L'),
    hips,
    spine:
      findBip001Bone(root, BIP001_ALIASES.spine) ??
      findBoneBySuffix(root, 'Spine') ??
      null,
    spine1:
      findBip001Bone(root, BIP001_ALIASES.spine1) ??
      findBoneBySuffix(root, 'Spine1') ??
      null,
    spine2:
      findBip001Bone(root, BIP001_ALIASES.spine2) ??
      findBoneBySuffix(root, 'Spine2') ??
      null,
    neck:
      findBip001Bone(root, BIP001_ALIASES.neck) ??
      findBoneBySuffix(root, 'Neck') ??
      null,
    rightClavicle:
      findBip001Bone(root, BIP001_ALIASES.rightClavicle) ??
      findBoneBySuffix(root, 'RightShoulder') ??
      null,
  };
}