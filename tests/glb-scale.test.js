import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseGLB,
  bakeGlbToMetres,
  normalizeSkinnedGlbRootScale,
  effectiveWorldHeight,
  measureRootScale,
  RACE_HEIGHT_SCALE,
} from "../scripts/lib/glb-scale.mjs";

const ROOT = join(import.meta.dirname, "..");

describe("glb-scale", () => {
  it("normalizes skinned human GLB to ~1.75m world height (root scale only)", () => {
    const path = join(ROOT, "public/assets/characters/human/WK_Characters.glb");
    const { json, bin } = parseGLB(readFileSync(path));
    const before = effectiveWorldHeight(json, bin);
    const baked = normalizeSkinnedGlbRootScale(json, bin, 1.75);
    expect(baked.after.worldHeight).toBeGreaterThan(1.5);
    expect(baked.after.worldHeight).toBeLessThan(2.0);
    // Vertices unchanged — local height stays at export size.
    expect(baked.after.height).toBeCloseTo(before.height, 3);
    expect(baked.scaleFactor).toBeGreaterThan(1);
  });

  it("on-disk human GLB passes production scale gate after skinned-root bake", () => {
    const path = join(ROOT, "public/assets/characters/human/WK_Characters.glb");
    const { json, bin } = parseGLB(readFileSync(path));
    const world = effectiveWorldHeight(json, bin);
    const targetH = 1.75 * (RACE_HEIGHT_SCALE.human ?? 1);
    expect(world.worldHeight).toBeGreaterThan(1.4);
    expect(world.worldHeight).toBeLessThan(2.1);
    expect(Math.abs(world.worldHeight - targetH) / targetH).toBeLessThan(0.12);
    // Skinned bake keeps local mesh small; root scale carries world size.
    if (world.height < 0.5) {
      expect(world.rootScale).toBeGreaterThan(2);
    }
  });

  it("bakes static island prop GLB to target height with root scale 1", () => {
    const path = join(ROOT, "public/assets/island/forest_pack.glb");
    const { json, bin } = parseGLB(readFileSync(path));
    const before = effectiveWorldHeight(json, bin);
    const baked = bakeGlbToMetres(json, bin, before.height);
    expect(baked.after.height).toBeCloseTo(before.height, 1);
    expect(baked.after.rootScale).toBeCloseTo(1, 1);
  });

  it("race height scales match RaceConfig", () => {
    expect(RACE_HEIGHT_SCALE.dwarf).toBe(0.85);
    expect(RACE_HEIGHT_SCALE.barbarian).toBe(1.12);
  });
});