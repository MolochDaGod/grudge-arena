import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  inferCmToMetresScale,
  normalizePropHeight,
  measureWorldSize,
  targetHeightForProp,
  PROP_TARGET_HEIGHT,
} from "../src/dangerRoom/islandAssetScale.js";

describe("islandAssetScale", () => {
  it("infers cm→m correction from vertex extent", () => {
    expect(inferCmToMetresScale(120)).toBe(0.01);
    expect(inferCmToMetresScale(30)).toBe(0.1);
    expect(inferCmToMetresScale(12)).toBe(1);
  });

  it("normalizes a 140-unit cm prop to target cannon height", () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(140, 120, 80),
      new THREE.MeshBasicMaterial(),
    );
    group.add(mesh);
    normalizePropHeight(group, PROP_TARGET_HEIGHT.cannon);
    const size = measureWorldSize(group);
    expect(size.y).toBeGreaterThan(0.9);
    expect(size.y).toBeLessThan(1.5);
  });

  it("leaves metre-sized props within tolerance", () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.1, 0.8),
      new THREE.MeshBasicMaterial(),
    );
    group.add(mesh);
    const mult = normalizePropHeight(group, PROP_TARGET_HEIGHT.cannon);
    expect(mult).toBe(1);
    const size = measureWorldSize(group);
    expect(size.y).toBeGreaterThan(0.9);
    expect(size.y).toBeLessThan(1.3);
  });

  it("maps pirate filenames to expected heights", () => {
    expect(targetHeightForProp("ship-pirate-large")).toBe(PROP_TARGET_HEIGHT.shipLarge);
    expect(targetHeightForProp("cannon")).toBe(PROP_TARGET_HEIGHT.cannon);
    expect(targetHeightForProp("SM_BLD_body_v01_01")).toBe(PROP_TARGET_HEIGHT.building);
  });
});