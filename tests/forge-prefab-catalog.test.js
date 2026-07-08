import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  listForgeAuxScenes,
  pickBestScene,
  scoreForgeScene,
} from "../scripts/lib/forge-prefab-catalog.mjs";
import { parseGLB } from "../scripts/lib/glb-scale.mjs";

const FORGE_MASTER = resolve(
  "public/assets/forge/30grudge6characters.glb",
);

describe("forge prefab catalog", () => {
  it("matches default hero loadouts from master GLB", { timeout: 30_000 }, () => {
    const buf = readFileSync(FORGE_MASTER);
    const { json } = parseGLB(buf);
    const scenes = listForgeAuxScenes(json);
    expect(scenes.length).toBe(30);

    const pairs = [
      ["human", "sabres"],
      ["barbarian", "mace"],
      ["elf", "bow"],
      ["dwarf", "sabres"],
      ["orc", "greatsword"],
      ["undead", "staff"],
    ];
    for (const [race, weapon] of pairs) {
      const match = pickBestScene(scenes, race, weapon);
      expect(match, `${race}/${weapon}`).not.toBeNull();
      expect(scoreForgeScene(match.meshes, race, weapon)).toBeGreaterThanOrEqual(2);
    }
  });

  it("exports forge manifest with combat sandbox prefabs", () => {
    const manifest = JSON.parse(
      readFileSync(resolve("public/assets/forge/forge-prefab-manifest.json"), "utf8"),
    );
    expect(manifest.prefabs.length).toBeGreaterThanOrEqual(6);
    const ids = manifest.prefabs.map((p) => p.prefabId);
    expect(ids).toContain("human_sabres_default");
    expect(ids).toContain("elf_bow_default");
  });
});