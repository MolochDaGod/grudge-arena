import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { effectiveWorldHeight, parseGLB } from "../scripts/lib/glb-scale.mjs";

const ROOT = join(import.meta.dirname, "..");
const PREFAB_DIR = join(ROOT, "public/assets/forge/prefabs");

describe("forge prefab scale", () => {
  const glbs = readdirSync(PREFAB_DIR).filter((f) => f.endsWith(".glb"));

  it("exports at least one forge prefab", () => {
    expect(glbs.length).toBeGreaterThan(0);
  });

  for (const file of glbs) {
    it(`${file} is humanoid-sized via root scale (not vertex bake)`, () => {
      const { json, bin } = parseGLB(readFileSync(join(PREFAB_DIR, file)));
      const w = effectiveWorldHeight(json, bin);
      expect(w.worldHeight).toBeGreaterThan(1.2);
      expect(w.worldHeight).toBeLessThan(2.5);
      // Skinned-root bake: local mesh stays small, root scale carries world size.
      if (w.height < 0.6) {
        expect(w.rootScale).toBeGreaterThan(0.04);
        expect(w.rootScale).toBeLessThan(6);
      }
    });
  }
});