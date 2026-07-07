/**
 * D1 Warlords skeleton contract — single source of truth for bone naming,
 * modular slot detection, and animation binding gates.
 */

import * as THREE from "three";
import {
    BIP001_D1_BONES,
    buildSceneBoneLookup,
    getTrackBindingStats,
    isValidBip001Bone,
} from "./mixamoRetarget.js";

/** Bones every modular race GLB must expose (feet-midpoint grounding + combat attach). */
export const D1_REQUIRED_BONES = [
    "Bip001 Pelvis",
    "Bip001 Spine",
    "Bip001 Head",
    "Bip001 L Hand",
    "Bip001 R Hand",
    "Bip001 L Foot",
    "Bip001 R Foot",
  ];

/** Mesh name prefixes on D1 modular character GLBs. */
export const D1_MODULAR_PREFIXES = ["WK_", "BRB_", "ELF_", "DWF_", "ORC_", "UD_"];

/** Minimum fraction of clip tracks that must bind before a clip is registered. */
export const MIN_CLIP_BIND_RATIO = 0.45;

/** Minimum bound tracks for combat/loco overlays (filters empty remaps). */
export const MIN_CLIP_BIND_COUNT = 8;

export function collectSceneBones(scene) {
    const bones = new Set();
    scene.traverse((node) => {
          if (node.isBone) bones.add(node.name);
    });
    return bones;
}

export function hasD1ModularMeshes(scene) {
    let found = false;
    scene.traverse((node) => {
          if (!node.isMesh || found) return;
          const n = node.name || "";
          if (D1_MODULAR_PREFIXES.some((p) => n.startsWith(p))) found = true;
    });
    return found;
}

/**
 * @returns {{ ok: boolean, missing: string[], bones: string[] }}
 */
export function validateCharacterSkeleton(scene) {
    const bones = collectSceneBones(scene);
    // Compare against the scene-bone lookup (handles GLTFLoader's
  // space -> underscore sanitization) instead of raw name equality —
  // D1_REQUIRED_BONES uses space-form names, but real THREE.js scene
  // bones are always underscore-form, so a raw `bones.has(b)` check
  // always failed and reported every rig as "missing" bones even when
  // the skeleton was completely valid.
  const lookup = buildSceneBoneLookup(scene);
    const missing = D1_REQUIRED_BONES.filter((b) => !lookup.has(b));
    return {
          ok: missing.length === 0,
          missing,
          bones: [...bones].sort(),
    };
}

/**
 * Verify a clip binds to the loaded rig (prevents T-pose / collapsed meshes).
 * @param {THREE.AnimationClip} clip
 * @param {THREE.Object3D} scene
 * @param {THREE.AnimationMixer} [mixer]
 */
export function validateClipBinding(clip, scene, mixer = null) {
    const m = mixer || new THREE.AnimationMixer(scene);
    const action = m.clipAction(clip, scene);
    const stats = getTrackBindingStats(action);
    const ok =
          stats.total >= MIN_CLIP_BIND_COUNT &&
          stats.ratio >= MIN_CLIP_BIND_RATIO;
    return { ok, ...stats };
}

export function filterValidBoneTracks(clip, scene = null) {
    const lookup = scene ? buildSceneBoneLookup(scene) : null;
    clip.tracks = clip.tracks.filter((track) => {
          const dot = track.name.indexOf(".");
          if (dot === -1) return true;
          const bone = track.name.substring(0, dot);
          if (lookup) return lookup.has(bone);
          return isValidBip001Bone(bone);
    });
    return clip;
}

export { BIP001_D1_BONES, isValidBip001Bone, buildSceneBoneLookup, getTrackBindingStats };
