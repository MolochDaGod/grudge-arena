import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  getRaceTargetHeight,
  physicsSizeFromMetrics,
  isBodyMeasureMesh,
  measureCharacterHeight,
} from "../src/characterScale.js";

function makeBoneScene({ boneH = 1.75, bboxH = 7.5 } = {}) {
  const root = new THREE.Group();
  root.name = "character";

  const pelvis = new THREE.Bone();
  pelvis.name = "Bip001_Pelvis";
  pelvis.position.set(0, 0, 0);

  const head = new THREE.Bone();
  head.name = "Bip001_Head";
  head.position.set(0, boneH, 0);

  const foot = new THREE.Bone();
  foot.name = "Bip001_L_Foot";
  foot.position.set(0, 0, 0);

  pelvis.add(head);
  pelvis.add(foot);
  root.add(pelvis);

  const bodyGeo = new THREE.BoxGeometry(0.5, bboxH, 0.5);
  const pos = bodyGeo.attributes.position;
  const skinIndex = new Uint16Array(pos.count * 4);
  const skinWeight = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    skinIndex[i * 4] = 0;
    skinWeight[i * 4] = 1;
  }
  bodyGeo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
  bodyGeo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));

  const body = new THREE.SkinnedMesh(bodyGeo, new THREE.MeshBasicMaterial());
  body.name = "WK_body_A";
  body.add(pelvis);
  body.bind(new THREE.Skeleton([pelvis, head, foot]));
  root.add(body);

  root.updateMatrixWorld(true);
  return root;
}

describe("characterScale", () => {
  it("computes per-race target heights from RaceConfig scale", async () => {
    const human = await getRaceTargetHeight("human");
    const dwarf = await getRaceTargetHeight("dwarf");
    const barbarian = await getRaceTargetHeight("barbarian");
    expect(human).toBeCloseTo(1.75, 2);
    expect(dwarf).toBeLessThan(human);
    expect(barbarian).toBeGreaterThan(human);
  });

  it("physicsSizeFromMetrics scales capsule to measured height", () => {
    const phys = physicsSizeFromMetrics({
      measuredHeight: 1.49,
      targetHeight: 1.49,
      heightOffset: -0.08,
    });
    expect(phys.height).toBeCloseTo(1.49, 2);
    expect(phys.radius).toBeGreaterThan(0.35);
    expect(phys.offset).toBeGreaterThan(0.6);
  });

  it("isBodyMeasureMesh excludes weapon variants", () => {
    expect(isBodyMeasureMesh({ isSkinnedMesh: true, name: "WK_body_A" })).toBe(true);
    expect(isBodyMeasureMesh({ isSkinnedMesh: true, name: "WK_weapon_sword_A" })).toBe(
      false,
    );
  });

  it("measureCharacterHeight prefers bones over inflated body bbox", () => {
    const scene = makeBoneScene({ boneH: 1.75, bboxH: 7.5 });
    const m = measureCharacterHeight(scene);
    expect(m.method).toBe("bones");
    expect(m.height).toBeCloseTo(1.75, 1);
    expect(m.bboxH).toBeGreaterThan(5);
  });

  it("physicsSizeFromMetrics clamps inflated bbox to target height", () => {
    const phys = physicsSizeFromMetrics({
      measuredHeight: 7.5,
      targetHeight: 1.75,
      heightOffset: 0,
    });
    expect(phys.height).toBeCloseTo(1.75, 2);
  });
});