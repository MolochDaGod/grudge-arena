/**
 * Legacy Mixamo → D1 Bip001 retargeting tests.
 */
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  remapMixamoClip,
  remapClipBoneNames,
  stripMixamoPrefix,
  bip001UnderscoreToGltf,
  buildSceneBoneLookup,
  resolveHandBoneName,
  getTrackBindingStats,
  MIXAMO_TO_BIP001,
} from "../src/mixamoRetarget.js";

function makeMixamoClip() {
  const times = [0, 0.5, 1];
  const values = new Array(times.length * 4).fill(0);
  return new THREE.AnimationClip("test", 1, [
    new THREE.QuaternionKeyframeTrack("mixamorig:Hips.quaternion", times, values),
    new THREE.QuaternionKeyframeTrack("mixamorig:LeftHand.quaternion", times, values),
    new THREE.QuaternionKeyframeTrack("mixamorig:RightHand.quaternion", times, values),
    new THREE.QuaternionKeyframeTrack("mixamorig:Spine1.quaternion", times, values),
    new THREE.VectorKeyframeTrack("mixamorig:Hips.position", times, [0, 0, 0, 0, 0, 0, 0, 0, 0]),
  ]);
}

function makeD1RigScene() {
  const root = new THREE.Group();
  const armature = new THREE.Bone();
  armature.name = "Armature";
  root.add(armature);

  const boneNames = [
    "Bip001 Pelvis",
    "Bip001 Spine",
    "Bip001 L Hand",
    "Bip001 R Hand",
    "Bip001 L UpperArm",
    "Bip001 R UpperArm",
  ];
  let parent = armature;
  for (const name of boneNames) {
    const bone = new THREE.Bone();
    bone.name = name;
    parent.add(bone);
    parent = bone;
  }
  return root;
}

describe("mixamoRetarget", () => {
  it("maps Mixamo bare names to D1 spaced Bip001 bones", () => {
    expect(MIXAMO_TO_BIP001.Hips).toBe("Bip001 Pelvis");
    expect(MIXAMO_TO_BIP001.LeftHand).toBe("Bip001 L Hand");
    expect(MIXAMO_TO_BIP001.RightHand).toBe("Bip001 R Hand");
  });

  it("strips numbered mixamorig prefixes", () => {
    expect(stripMixamoPrefix("mixamorig10:Hips")).toBe("Hips");
    expect(stripMixamoPrefix("mixamorig:LeftArm")).toBe("LeftArm");
  });

  it("converts underscore Bip001 names to spaced glTF names", () => {
    expect(bip001UnderscoreToGltf("Bip001_Pelvis")).toBe("Bip001 Pelvis");
    expect(bip001UnderscoreToGltf("Bip001_R_Hand")).toBe("Bip001 R Hand");
  });

  it("remapMixamoClip renames tracks to D1 spaced bones and drops position/spine1", () => {
    const clip = makeMixamoClip();
    remapMixamoClip(clip);

    const names = clip.tracks.map((t) => t.name);
    expect(names).toContain("Bip001 Pelvis.quaternion");
    expect(names).toContain("Bip001 L Hand.quaternion");
    expect(names).toContain("Bip001 R Hand.quaternion");
    expect(names.some((n) => n.includes("Spine1"))).toBe(false);
    expect(names.some((n) => n.includes("position"))).toBe(false);
  });

  it("remapClipBoneNames binds majority of tracks on a D1 rig scene", () => {
    const scene = makeD1RigScene();
    const clip = makeMixamoClip();
    remapClipBoneNames(clip, scene);

    const mixer = new THREE.AnimationMixer(scene);
    const action = mixer.clipAction(clip, scene);
    const stats = getTrackBindingStats(action);

    expect(stats.total).toBeGreaterThan(0);
    expect(stats.bound).toBe(stats.total);
    expect(stats.ratio).toBe(1);
  });

  it("buildSceneBoneLookup indexes spaced and underscore bone names", () => {
    const scene = makeD1RigScene();
    const lookup = buildSceneBoneLookup(scene);
    expect(lookup.get("Bip001 R Hand")).toBe("Bip001 R Hand");
    expect(lookup.get("Bip001_R_Hand")).toBe("Bip001 R Hand");
  });

  it("resolveHandBoneName finds D1 spaced hand bones", () => {
    const scene = makeD1RigScene();
    expect(resolveHandBoneName(scene, "R")).toBe("Bip001 R Hand");
    expect(resolveHandBoneName(scene, "L")).toBe("Bip001 L Hand");
  });

  it("normalizes pre-baked underscore clip tracks for D1 binding", () => {
    const times = [0, 1];
    const values = [0, 0, 0, 1, 0, 0, 0, 1];
    const clip = new THREE.AnimationClip("baked", 1, [
      new THREE.QuaternionKeyframeTrack("Bip001_Pelvis.quaternion", times, values),
      new THREE.QuaternionKeyframeTrack("Bip001_R_Hand.quaternion", times, values),
    ]);
    remapClipBoneNames(clip);

    const names = clip.tracks.map((t) => t.name);
    expect(names).toContain("Bip001 Pelvis.quaternion");
    expect(names).toContain("Bip001 R Hand.quaternion");
    expect(names.some((n) => n.includes("_"))).toBe(false);
  });

  it("keeps underscore track names when the loaded rig uses underscores", () => {
    const root = new THREE.Group();
    const arm = new THREE.Bone();
    arm.name = "Armature";
    root.add(arm);
    for (const name of ["Bip001_Pelvis", "Bip001_Spine", "Bip001_R_Hand", "Bip001_L_Hand"]) {
      const bone = new THREE.Bone();
      bone.name = name;
      arm.add(bone);
    }

    const times = [0, 1];
    const values = [0, 0, 0, 1, 0, 0, 0, 1];
    const clip = new THREE.AnimationClip("baked", 1, [
      new THREE.QuaternionKeyframeTrack("Bip001_Pelvis.quaternion", times, values),
      new THREE.QuaternionKeyframeTrack("Bip001_R_Hand.quaternion", times, values),
    ]);
    remapClipBoneNames(clip, root);

    const names = clip.tracks.map((t) => t.name);
    expect(names).toContain("Bip001_Pelvis.quaternion");
    expect(names).toContain("Bip001_R_Hand.quaternion");

    const mixer = new THREE.AnimationMixer(root);
    const stats = getTrackBindingStats(mixer.clipAction(clip, root));
    expect(stats.ratio).toBe(1);
  });
});