import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  validateCharacterSkeleton,
  validateClipBinding,
  hasD1ModularMeshes,
  D1_REQUIRED_BONES,
  BIP001_D1_BONES,
} from "../src/skeletonContract.js";
import { remapClipBoneNames } from "../src/mixamoRetarget.js";

function makeD1Rig() {
  const root = new THREE.Group();
  const arm = new THREE.Bone();
  arm.name = "Armature";
  root.add(arm);
  for (const name of BIP001_D1_BONES) {
    if (name === "Armature" || name === "Bip001") continue;
    const b = new THREE.Bone();
    b.name = name;
    arm.add(b);
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = "WK_Head_01";
  root.add(mesh);
  return root;
}

describe("skeletonContract", () => {
  it("validates required D1 bones", () => {
    const scene = makeD1Rig();
    const r = validateCharacterSkeleton(scene);
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("detects missing bones", () => {
    const root = new THREE.Group();
    const b = new THREE.Bone();
    b.name = "Bip001 Pelvis";
    root.add(b);
    const r = validateCharacterSkeleton(root);
    expect(r.ok).toBe(false);
    expect(r.missing.length).toBeGreaterThan(0);
  });

  it("detects D1 modular meshes", () => {
    expect(hasD1ModularMeshes(makeD1Rig())).toBe(true);
    expect(hasD1ModularMeshes(new THREE.Group())).toBe(false);
  });

  it("accepts remapped Mixamo clips with full binding on D1 rig", () => {
    const scene = makeD1Rig();
    const times = [0, 0.5, 1];
    const values = new Array(times.length * 4).fill(0);
    const clip = new THREE.AnimationClip("loco", 1, [
      new THREE.QuaternionKeyframeTrack("mixamorig:Hips.quaternion", times, values),
      new THREE.QuaternionKeyframeTrack("mixamorig:LeftHand.quaternion", times, values),
      new THREE.QuaternionKeyframeTrack("mixamorig:RightHand.quaternion", times, values),
      new THREE.QuaternionKeyframeTrack("mixamorig:LeftArm.quaternion", times, values),
      new THREE.QuaternionKeyframeTrack("mixamorig:RightArm.quaternion", times, values),
      new THREE.QuaternionKeyframeTrack("mixamorig:LeftUpLeg.quaternion", times, values),
      new THREE.QuaternionKeyframeTrack("mixamorig:RightUpLeg.quaternion", times, values),
      new THREE.QuaternionKeyframeTrack("mixamorig:Head.quaternion", times, values),
      new THREE.QuaternionKeyframeTrack("mixamorig:Spine.quaternion", times, values),
    ]);
    remapClipBoneNames(clip, scene);
    const r = validateClipBinding(clip, scene);
    expect(r.ok).toBe(true);
    expect(r.ratio).toBe(1);
  });
});