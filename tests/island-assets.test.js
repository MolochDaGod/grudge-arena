import { describe, it, expect } from "vitest";
import { islandAssetUrl } from "../src/assetConfig.js";

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