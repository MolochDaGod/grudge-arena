import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  validateCharacterGlbContract,
  auditSkinIntegrity,
  collectBonesFromGltf,
  GLTF_CONTRACT_VERSION,
  REQUIRED_BONES,
  hasBone,
} from "../scripts/lib/gltf-contract.mjs";
import { parseGLB, RACE_HEIGHT_SCALE } from "../scripts/lib/glb-scale.mjs";

const ROOT = join(import.meta.dirname, "..");

const BAKED_RACES = {
  human: "WK_Characters.glb",
  barbarian: "BRB_Characters.glb",
  elf: "ELF_Characters.glb",
  dwarf: "DWF_Characters.glb",
  orc: "ORC_Characters.glb",
  undead: "UD_Characters.glb",
};

describe("gltf-contract", () => {
  it("exports arenaGltf/1.0 contract version", () => {
    expect(GLTF_CONTRACT_VERSION).toBe("arenaGltf/1.0");
    expect(REQUIRED_BONES.length).toBeGreaterThanOrEqual(4);
  });

  it("canonical human.glb has Bip001 bones (source mesh)", () => {
    const path = join(ROOT, "public/models/human.glb");
    if (!existsSync(path)) return;
    const { json } = parseGLB(readFileSync(path));
    const bones = collectBonesFromGltf(json);
    for (const bone of REQUIRED_BONES) {
      expect(hasBone(bones, bone)).toBe(true);
    }
    const skin = auditSkinIntegrity(json);
    expect(skin.nullJoints).toBe(0);
  });

  for (const [race, file] of Object.entries(BAKED_RACES)) {
    it(`baked ${race} passes full GLTF contract`, () => {
      const path = join(ROOT, "public/assets/characters", race, file);
      expect(existsSync(path)).toBe(true);
      const targetH = 1.75 * (RACE_HEIGHT_SCALE[race] ?? 1);
      const r = validateCharacterGlbContract(path, { race, targetHeightM: targetH });
      expect(r.contract).toBe(GLTF_CONTRACT_VERSION);
      expect(r.errors).toEqual([]);
      expect(r.ok).toBe(true);
      expect(r.skin.nullJoints).toBe(0);
      expect(r.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(r.scaleMode).toBe("skinned-root-only");
    });
  }
});