import { describe, it, expect } from "vitest";
import {
  getRaceTargetHeight,
  physicsSizeFromMetrics,
  isBodyMeasureMesh,
} from "../src/characterScale.js";

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
});