import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  resolveVariantKey,
  getRaceClassArmor,
  WEAPON_EQUIP_MAP,
} from "../src/d1SlotCatalog.js";
import { filterCameraCollisionMeshes } from "../src/engine/cameraCollision.js";
import { getCharacterCameraPivot, hasCharacterRig } from "../src/characterScale.js";

/** Mirrors OrbitCamera.snapBehind() TPS branch (D1 +X-forward @ island spawn). */
function tpsBehindYaw(rotationY) {
  return rotationY + Math.PI * 0.5;
}

describe("resolveVariantKey", () => {
  it("matches single-letter variants to compound weapon keys", () => {
    const keys = ["AXE_A", "AXE_B"];
    expect(resolveVariantKey(keys, "A")).toBe("AXE_A");
    expect(resolveVariantKey(keys, "B")).toBe("AXE_B");
  });

  it("matches staff and sword compound keys", () => {
    expect(resolveVariantKey(["STAFF_A", "STAFF_B"], "A")).toBe("STAFF_A");
    expect(resolveVariantKey(["SWORD_A", "SWORD_B"], "B")).toBe("SWORD_B");
  });

  it("returns exact key when already compound", () => {
    expect(resolveVariantKey(["AXE_A", "AXE_B"], "AXE_B")).toBe("AXE_B");
  });

  it("falls back to first key when no match", () => {
    expect(resolveVariantKey(["DEFAULT"], "Z")).toBe("DEFAULT");
  });
});

describe("getRaceClassArmor", () => {
  it("returns clothed human warrior preset (not bare body A)", () => {
    const armor = getRaceClassArmor("human", "warrior");
    expect(armor.body).toBe("C");
    expect(armor.head).toBe("D");
    expect(armor.arms).toBe("B");
    expect(armor.legs).toBe("B");
    expect(armor.shoulders).toBe("A");
  });

  it("maps greatsword to warrior axe variant B", () => {
    expect(WEAPON_EQUIP_MAP.greatsword.rVariant).toBe("B");
    expect(WEAPON_EQUIP_MAP.greatsword.rSlot).toBe("axe");
  });
});

describe("TPS camera pivot + collision", () => {
  it("places camera behind D1 rig at island spawn yaw π/2", () => {
    expect(tpsBehindYaw(Math.PI / 2)).toBeCloseTo(Math.PI, 4);
    expect(tpsBehindYaw(-Math.PI / 2)).toBeCloseTo(0, 4);
  });

  it("excludes island terrain from camera collision rays", () => {
    const terrain = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    terrain.name = "island-terrain";
    const wall = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    wall.name = "pirate-crate_A";
    const filtered = filterCameraCollisionMeshes([terrain, wall]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe("pirate-crate_A");
  });

  it("uses pelvis bone world position for camera pivot", () => {
    const scene = new THREE.Group();
    scene.position.set(10, 0, 5);
    const arm = new THREE.Group();
    scene.add(arm);
    const pelvis = new THREE.Bone();
    pelvis.name = "Bip001 Pelvis";
    pelvis.position.set(0, 1.0, 0);
    arm.add(pelvis);
    const skin = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    skin.name = "WK_Units_Body_C";
    skin.skeleton = new THREE.Skeleton([pelvis]);
    arm.add(skin);
    scene.userData.characterMetrics = { targetHeight: 1.75 };
    scene.updateMatrixWorld(true);

    expect(hasCharacterRig(scene)).toBe(true);
    const pivot = getCharacterCameraPivot(scene);
    expect(pivot.x).toBeCloseTo(10, 2);
    expect(pivot.y).toBeGreaterThan(1.5);
    expect(pivot.z).toBeCloseTo(5, 2);
  });

  it("detects rig from skinned body mesh without metrics", () => {
    const scene = new THREE.Group();
    const skin = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial(),
    );
    skin.name = "WK_Units_Body_C";
    scene.add(skin);
    expect(hasCharacterRig(scene)).toBe(true);
  });
});