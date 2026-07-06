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

  it("raceTextureFallbackPaths lists cdn then grudge6 mirror", () => {
    const paths = raceTextureFallbackPaths("dwarf");
    expect(paths[0]).toContain("Map__12.png");
    expect(paths[1]).toContain("/api/assets/arena/assets/characters/dwarf");
  });

  it("textureHealth flags missing and partial atlases", () => {
    expect(textureHealth({ withMap: 0, total: 42 }).ok).toBe(false);
    expect(textureHealth({ withMap: 10, total: 42 }).level).toBe("warn");
    expect(textureHealth({ withMap: 42, total: 42 }).ok).toBe(true);
  });

  it("remediationHint maps error codes to operator actions", () => {
    const err = new CharacterLoadError("x", { code: "MODEL_NOT_FOUND" });
    expect(remediationHint(err)).toContain("sync:assets");
    expect(remediationHint({ code: "BAKED_ANIM_INCOMPLETE" })).toContain("baked");
  });

  it("auditCharacterMaterials counts mesh materials", () => {
    const stats = auditCharacterMaterials({ traverse() {} });
    expect(stats).toEqual({ total: 0, withMap: 0, visible: 0 });
  });
});