import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { verifyArenaRoster } from "../src/arenaQualityGate.js";

function makePassingPlayerScene() {
  const scene = new THREE.Group();
  const arm = new THREE.Group();
  arm.name = "BodyArmature";
  scene.add(arm);

  const boneNames = [
    "Bip001 Pelvis",
    "Bip001 Spine",
    "Bip001 Head",
    "Bip001 L Hand",
    "Bip001 R Hand",
    "Bip001 L Foot",
    "Bip001 R Foot",
  ];
  const bones = boneNames.map((name) => {
    const b = new THREE.Bone();
    b.name = name;
    return b;
  });
  const [pelvis, ...rest] = bones;
  arm.add(pelvis);
  for (const b of rest) pelvis.add(b);

  const skin = new THREE.SkinnedMesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicMaterial(),
  );
  skin.name = "WK_Units_Body_A";
  skin.skeleton = new THREE.Skeleton(bones);
  arm.add(skin);

  scene.userData.characterMetrics = {
    targetHeight: 1.75,
    measuredHeight: 1.74,
    appliedScale: 1,
    source: "manifest-baked",
    worldBodyHeight: 1.74,
  };
  return scene;
}

describe("verifyArenaRoster playerOnly", () => {
  const goodUnit = {
    scene: makePassingPlayerScene(),
    mixer: {},
    controller: { clips: new Map() },
    race: "human",
    isPlayer: true,
  };

  const badPlayer = {
    scene: null,
    mixer: null,
    controller: null,
    race: "human",
    isPlayer: true,
  };

  const badNpc = {
    scene: null,
    mixer: null,
    controller: null,
    race: "orc",
    isPlayer: false,
  };

  it("throws when player fails in strict playerOnly mode", () => {
    expect(() =>
      verifyArenaRoster([badPlayer], { strict: true, playerOnly: true }),
    ).toThrow(/qualityGate/);
  });

  it("allows NPC failures when playerOnly strict", () => {
    const report = verifyArenaRoster([goodUnit, badNpc], {
      strict: true,
      playerOnly: true,
    });
    expect(report.playerOk).toBe(true);
    expect(report.ok).toBe(false);
    expect(report.units.some((u) => u.label?.includes("orc"))).toBe(true);
  });

  it("throws on any failure when strict without playerOnly", () => {
    expect(() =>
      verifyArenaRoster([goodUnit, badNpc], { strict: true, playerOnly: false }),
    ).toThrow(/qualityGate/);
  });
});