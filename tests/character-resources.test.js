import { describe, it, expect } from "vitest";
import {
  CHARACTER_RACES,
  RACE_GLB_FILES,
  raceGlbUrl,
  raceModelFallbackPaths,
  raceTextureFallbackPaths,
  auditCharacterMaterials,
  textureHealth,
  remediationHint,
  CharacterLoadError,
  isPlaceholderTexture,
  isPlaceholderMapImage,
} from "../src/characterResources.js";

describe("characterResources", () => {
  it("defines all six races with GLB files", () => {
    expect(CHARACTER_RACES).toHaveLength(6);
    for (const race of CHARACTER_RACES) {
      expect(RACE_GLB_FILES[race]).toMatch(/_Characters\.glb$/);
    }
  });

  it("raceGlbUrl points at /cdn assets/characters", () => {
    const url = raceGlbUrl("human");
    expect(url).toContain("assets/characters/human/WK_Characters.glb");
  });

  it("raceModelFallbackPaths prefers CDN GLB before legacy /models", () => {
    const paths = raceModelFallbackPaths("orc");
    expect(paths[0]).toContain("ORC_Characters.glb");
    expect(paths.some((p) => p.endsWith("/models/orc.glb"))).toBe(true);
    expect(paths.at(-1)).toContain(".fbx");
  });

  it("raceTextureFallbackPaths lists bundled, arena mirror, then grudge6 webp", () => {
    const paths = raceTextureFallbackPaths("barbarian");
    expect(paths[0]).toContain("Map__9.png");
    expect(paths[1]).toContain("/api/assets/arena/assets/characters/barbarian");
    expect(paths[2]).toContain("BRB_StandardUnits_texture.webp");
  });

  it("textureHealth flags missing and partial atlases", () => {
    expect(textureHealth({ withMap: 0, total: 42 }).ok).toBe(false);
    expect(textureHealth({ withMap: 10, total: 42 }).level).toBe("warn");
    expect(textureHealth({ withMap: 42, total: 42 }).ok).toBe(true);
    expect(
      textureHealth({ withMap: 42, total: 42, placeholderMaps: 42 }).ok,
    ).toBe(false);
  });

  it("remediationHint maps error codes to operator actions", () => {
    const err = new CharacterLoadError("x", { code: "MODEL_NOT_FOUND" });
    expect(remediationHint(err)).toContain("sync:assets");
    expect(remediationHint({ code: "BAKED_ANIM_INCOMPLETE" })).toContain("baked");
  });

  it("auditCharacterMaterials counts mesh materials", () => {
    const stats = auditCharacterMaterials({ traverse() {} });
    expect(stats).toEqual({ total: 0, withMap: 0, placeholderMaps: 0, visible: 0 });
  });

  it("isPlaceholderTexture accepts loader Texture.image (not only Material.map)", () => {
    expect(isPlaceholderMapImage({ width: 2048, height: 2048 })).toBe(false);
    expect(isPlaceholderTexture({ image: { width: 2048, height: 2048 } })).toBe(
      false,
    );
    expect(isPlaceholderTexture({ image: { width: 1, height: 1 } })).toBe(true);
    expect(
      isPlaceholderTexture({ map: { image: { width: 2048, height: 2048 } } }),
    ).toBe(false);
  });
});