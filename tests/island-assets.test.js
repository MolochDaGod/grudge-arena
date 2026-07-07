import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { islandAssetUrl } from "../src/assetConfig.js";

describe("island village GLB scale", () => {
  it("building GLBs are metre-sized (not FBX cm) — runtime must use scale 1", () => {
    const path = resolve("public/assets/island/village/glb/SM_BLD_body_v01_01.glb");
    const buf = readFileSync(path);
    const jsonLen = buf.readUInt32LE(12);
    const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString());
    const binStart = 20 + jsonLen + 8;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const mesh of json.meshes || []) {
      for (const prim of mesh.primitives || []) {
        const acc = json.accessors[prim.attributes.POSITION];
        const bv = json.bufferViews[acc.bufferView];
        const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
        for (let i = 0; i < acc.count; i++) {
          const y = buf.readFloatLE(binStart + off + i * 12 + 4);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    const height = maxY - minY;
    expect(height).toBeGreaterThan(8);
    expect(height).toBeLessThan(20);
  });
});

describe("islandAssetUrl", () => {
  it("serves from deployment static /assets/island (not /cdn R2)", () => {
    expect(islandAssetUrl("forest_pack.glb")).toBe("/assets/island/forest_pack.glb");
    expect(islandAssetUrl("village/textures/T_wood_05_BC.png")).toBe(
      "/assets/island/village/textures/T_wood_05_BC.png",
    );
    expect(islandAssetUrl("assets/island/village/glb/SM_PROP_well.glb")).toBe(
      "/assets/island/village/glb/SM_PROP_well.glb",
    );
  });
});