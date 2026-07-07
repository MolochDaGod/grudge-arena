/**
 * Legacy Mixamo → Bip001 retargeting for D1 Warlords GLBs.
 *
 * D1 character GLBs keep 3ds Max bone names with spaces:
 *   "Bip001 Pelvis", "Bip001 L Hand", …
 * Mixamo animation GLBs use mixamorig:Hips, mixamorig:LeftArm, etc.
 */

import * as THREE from "three";

export const MIXAMO_PREFIXES = [
    "mixamorig10:",
    "mixamorig9:",
    "mixamorig8:",
    "mixamorig7:",
    "mixamorig6:",
    "mixamorig5:",
    "mixamorig4:",
    "mixamorig3:",
    "mixamorig2:",
    "mixamorig1:",
    "mixamorig:",
  ];

/** Mixamo bare name → D1 glTF bone name (spaces, matches WK_/BRB_/… GLBs). */
export const MIXAMO_TO_BIP001 = {
    Hips: "Bip001 Pelvis",
    Spine: "Bip001 Spine",
    Spine1: null,
    Spine2: null,
    Neck: "Bip001 Neck",
    Head: "Bip001 Head",
    HeadTop_End: "Bip001 Head",
    LeftShoulder: "Bip001 L Clavicle",
    LeftArm: "Bip001 L UpperArm",
    LeftForeArm: "Bip001 L Forearm",
    RightShoulder: "Bip001 R Clavicle",
    RightArm: "Bip001 R UpperArm",
    RightForeArm: "Bip001 R Forearm",
    LeftHand: "Bip001 L Hand",
    RightHand: "Bip001 R Hand",
    LeftUpLeg: "Bip001 L Thigh",
    LeftLeg: "Bip001 L Calf",
    LeftFoot: "Bip001 L Foot",
    LeftToeBase: "Bip001 L Toe0",
    RightUpLeg: "Bip001 R Thigh",
    RightLeg: "Bip001 R Calf",
    RightFoot: "Bip001 R Foot",
    RightToeBase: "Bip001 R Toe0",
    Reye: null,
    Leye: null,
};

/** Canonical Bip001 bones on D1 modular rigs (18 joints + root). */
export const BIP001_D1_BONES = new Set([
    "Bip001 Pelvis",
    "Bip001 Spine",
    "Bip001 Neck",
    "Bip001 Head",
    "Bip001 L Clavicle",
    "Bip001 L UpperArm",
    "Bip001 L Forearm",
    "Bip001 L Hand",
    "Bip001 R Clavicle",
    "Bip001 R UpperArm",
    "Bip001 R Forearm",
    "Bip001 R Hand",
    "Bip001 L Thigh",
    "Bip001 L Calf",
    "Bip001 L Foot",
    "Bip001 L Toe0",
    "Bip001 R Thigh",
    "Bip001 R Calf",
    "Bip001 R Foot",
    "Bip001 R Toe0",
    "Armature",
    "Bip001",
  ]);

/** Underscore variants (FBX / some exports) — accepted after remap. */
export const BIP001_UNDERSCORE_ALIASES = new Set([
    "Bip001_Pelvis",
    "Bip001_Spine",
    "Bip001_Neck",
    "Bip001_Head",
    "Bip001_L_Clavicle",
    "Bip001_L_UpperArm",
    "Bip001_L_Forearm",
    "Bip001_L_Hand",
    "Bip001_R_Clavicle",
    "Bip001_R_UpperArm",
    "Bip001_R_Forearm",
    "Bip001_R_Hand",
    "Bip001_L_Thigh",
    "Bip001_L_Calf",
    "Bip001_L_Foot",
    "Bip001_L_Toe0",
    "Bip001_R_Thigh",
    "Bip001_R_Calf",
    "Bip001_R_Foot",
    "Bip001_R_Toe0",
  ]);

export function stripMixamoPrefix(name) {
    for (const prefix of MIXAMO_PREFIXES) {
          if (name.startsWith(prefix)) return name.slice(prefix.length);
    }
    if (name.startsWith("mixamorig")) return name.slice("mixamorig".length);
    return name;
}

/** Bip001_Pelvis → Bip001 Pelvis */
export function bip001UnderscoreToGltf(name) {
    if (!name.includes("_")) return name;
    return name.replace(/^Bip001_/, "Bip001 ").replace(/_/g, " ");
}

export function toRotationOnlyClip(clip) {
    clip.tracks = clip.tracks.filter((track) => {
          const dot = track.name.indexOf(".");
          if (dot === -1) return true;
          const prop = track.name.substring(dot + 1);
          return prop === "quaternion" || prop === "rotation";
    });
    return clip;
}

/**
 * Build lookup: normalized bone key → actual scene bone name.
 * @param {THREE.Object3D} scene
 */
export function buildSceneBoneLookup(scene) {
    const lookup = new Map();
    scene.traverse((node) => {
          if (!node.isBone) return;
          lookup.set(node.name, node.name);
          lookup.set(bip001UnderscoreToGltf(node.name), node.name);
          lookup.set(node.name.replace(/ /g, "_"), node.name);
    });
    return lookup;
}

function resolveBoneName(bone, sceneLookup) {
    if (sceneLookup?.has(bone)) return sceneLookup.get(bone);
    const gltf = bip001UnderscoreToGltf(bone);
    if (sceneLookup?.has(gltf)) return sceneLookup.get(gltf);
    return bone;
}

/**
 * Remap Mixamo clip tracks → Bip001 D1 names; optional scene bind pass.
 * @param {THREE.AnimationClip} clip
 * @param {THREE.Object3D} [scene] — when set, track names match loaded rig
 */
export function remapMixamoClip(clip, scene = null) {
    const sceneLookup = scene ? buildSceneBoneLookup(scene) : null;

  for (const track of clip.tracks) {
        const dotIdx = track.name.indexOf(".");
        if (dotIdx === -1) continue;
        const bone = track.name.substring(0, dotIdx);
        const prop = track.name.substring(dotIdx);

      let bare = stripMixamoPrefix(bone);
        if (bare in MIXAMO_TO_BIP001) {
                const mapped = MIXAMO_TO_BIP001[bare];
                if (mapped === null) {
                          track.name = "__REMOVE__" + prop;
                          continue;
                }
                bare = mapped;
        }

      // resolveBoneName() already returns the exact name present on the loaded
      // THREE.js scene (GLTFLoader sanitizes spaces to underscores, e.g.
      // "Bip001 Pelvis" -> "Bip001_Pelvis"). Do NOT convert it back to the
      // space form here — that reintroduces a name that no longer exists on
      // the scene and silently breaks every track binding (0/18 bound).
      bare = resolveBoneName(bare, sceneLookup);
        track.name = bare + prop;
  }

  clip.tracks = clip.tracks.filter((t) => !t.name.startsWith("__REMOVE__"));
    return toRotationOnlyClip(clip);
}

export function isValidBip001Bone(name) {
    return (
          BIP001_D1_BONES.has(name) ||
          BIP001_UNDERSCORE_ALIASES.has(name) ||
          BIP001_D1_BONES.has(bip001UnderscoreToGltf(name))
        );
}

export function filterClipToValidBones(clip, scene = null) {
    const sceneBones = scene ? buildSceneBoneLookup(scene) : null;
    clip.tracks = clip.tracks.filter((track) => {
          const dot = track.name.indexOf(".");
          if (dot === -1) return true;
          const bone = track.name.substring(0, dot);
          if (sceneBones) return sceneBones.has(bone);
          return isValidBip001Bone(bone);
    });
    return clip;
}

/** @deprecated alias */
export function remapClipBoneNames(clip, scene = null) {
    return filterClipToValidBones(remapMixamoClip(clip, scene), scene);
}

/**
 * Baked JSON clips (anim-bank) ship Bip001_* — D1 GLBs use spaced names.
 * Call at load time before mixer.clipAction().
 */
export function normalizeBakedBip001Clip(clip, scene = null) {
    return filterClipToValidBones(remapMixamoClip(clip, scene), scene);
}

export function getTrackBindingStats(action) {
    let bound = 0;
    const bindings = action?._propertyBindings || [];
    for (const b of bindings) if (b?.binding?.node) bound++;
    return { bound, total: bindings.length, ratio: bindings.length ? bound / bindings.length : 0 };
}

/** Resolve hand bone name on a loaded character scene. */
export function resolveHandBoneName(scene, side = "R") {
    const lookup = buildSceneBoneLookup(scene);
    const candidates =
          side === "L"
        ? ["Bip001 L Hand", "Bip001_L_Hand", "LeftHand"]
            : ["Bip001 R Hand", "Bip001_R_Hand", "RightHand"];
    for (const c of candidates) {
          if (lookup.has(c)) return lookup.get(c);
    }
    return candidates[0];
}
