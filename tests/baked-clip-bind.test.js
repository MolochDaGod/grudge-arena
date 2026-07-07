import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  normalizeBakedBip001Clip,
  getTrackBindingStats,
} from "../src/mixamoRetarget.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function makeD1Rig() {
  const root = new THREE.Group();
  const arm = new THREE.Bone();
  arm.name = "Armature";
  root.add(arm);
  const bones = [
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
    "Bip001 R Thigh",
    "Bip001 R Calf",
    "Bip001 R Foot",
  ];
  for (const name of bones) {
    const b = new THREE.Bone();
    b.name = name;
    arm.add(b);
  }
  return root;
}

describe("baked clip bone binding", () => {
  it("normalizes anim-bank underscore tracks to D1 spaced bones", () => {
    const path = join(
      ROOT,
      "public/anims/baked/sword_shield/sword and shield idle.json",
    );
    const json = JSON.parse(readFileSync(path, "utf8"));
    const clip = THREE.AnimationClip.parse(json);
    expect(clip.tracks[0].name).toContain("Bip001_");

    normalizeBakedBip001Clip(clip);
    expect(clip.tracks[0].name).toContain("Bip001 Pelvis");
    expect(clip.tracks.some((t) => t.name.includes("_"))).toBe(false);
  });

  it("binds normalized idle clip to D1 rig at high ratio", () => {
    const path = join(
      ROOT,
      "public/anims/baked/sword_shield/sword and shield idle.json",
    );
    const clip = THREE.AnimationClip.parse(JSON.parse(readFileSync(path, "utf8")));
    normalizeBakedBip001Clip(clip);

    const scene = makeD1Rig();
    const mixer = new THREE.AnimationMixer(scene);
    const stats = getTrackBindingStats(mixer.clipAction(clip, scene));
    expect(stats.bound).toBeGreaterThan(12);
    expect(stats.ratio).toBeGreaterThan(0.7);
  });
});