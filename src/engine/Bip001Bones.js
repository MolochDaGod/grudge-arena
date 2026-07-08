/**
 * Canonical Bip001 bone lookup — GLTFLoader uses underscores; D1 source uses spaces.
 * Always resolve from the animation armature subtree, not decoy scene bones.
 */

import { getAnimationRoot } from '../characterScale.js';
import { bip001UnderscoreToGltf } from '../mixamoRetarget.js';

/** @typedef {keyof typeof BIP001_ALIASES} Bip001BoneRole */

export const BIP001_ALIASES = {
  pelvis: ['Bip001_Pelvis', 'Bip001 Pelvis'],
  spine: ['Bip001_Spine', 'Bip001 Spine'],
  spine1: ['Bip001_Spine1', 'Bip001 Spine1'],
  spine2: ['Bip001_Spine2', 'Bip001 Spine2'],
  neck: ['Bip001_Neck', 'Bip001 Neck'],
  head: ['Bip001_Head', 'Bip001 Head'],
  leftClavicle: ['Bip001_L_Clavicle', 'Bip001 L Clavicle'],
  rightClavicle: ['Bip001_R_Clavicle', 'Bip001 R Clavicle'],
  leftUpperArm: ['Bip001_L_UpperArm', 'Bip001 L UpperArm'],
  rightUpperArm: ['Bip001_R_UpperArm', 'Bip001 R UpperArm'],
  leftForearm: ['Bip001_L_Forearm', 'Bip001 L Forearm'],
  rightForearm: ['Bip001_R_Forearm', 'Bip001 R Forearm'],
  leftHand: ['Bip001_L_Hand', 'Bip001 L Hand'],
  rightHand: ['Bip001_R_Hand', 'Bip001 R Hand'],
  leftThigh: ['Bip001_L_Thigh', 'Bip001 L Thigh'],
  rightThigh: ['Bip001_R_Thigh', 'Bip001 R Thigh'],
  leftCalf: ['Bip001_L_Calf', 'Bip001 L Calf'],
  rightCalf: ['Bip001_R_Calf', 'Bip001 R Calf'],
  leftFoot: ['Bip001_L_Foot', 'Bip001 L Foot'],
  rightFoot: ['Bip001_R_Foot', 'Bip001 R Foot'],
};

function expandAliases(aliases) {
  const names = new Set();
  for (const raw of aliases) {
    names.add(raw);
    names.add(raw.replace(/ /g, '_'));
    names.add(bip001UnderscoreToGltf(raw));
  }
  return names;
}

/**
 * @param {THREE.Object3D} root — character scene root
 * @param {string[]} aliases
 * @param {THREE.Object3D} [searchRoot]
 */
export function findBip001Bone(root, aliases, searchRoot = null) {
  const names = expandAliases(aliases);
  const roots = searchRoot ? [searchRoot, root] : [getAnimationRoot(root), root];
  let hit = null;
  for (const r of roots) {
    if (!r || hit) break;
    r.traverse((node) => {
      if (!hit && node.isBone && names.has(node.name)) hit = node;
    });
  }
  return hit;
}

/**
 * @param {THREE.Object3D} root
 * @returns {Map<string, THREE.Bone>}
 */
export function buildBip001BoneMap(root) {
  const map = new Map();
  for (const [role, aliases] of Object.entries(BIP001_ALIASES)) {
    const bone = findBip001Bone(root, aliases);
    if (bone) map.set(role, bone);
  }
  return map;
}