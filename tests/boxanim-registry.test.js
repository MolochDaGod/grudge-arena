import { describe, it, expect } from "vitest";
import { categorizeBoxAnim, shouldSkipBoxAnim } from "../scripts/lib/boxanim-categorize.mjs";
import { BOX_ANIM_GLOBAL, BOX_ANIM_BY_PACK, applyBoxAnimOverrides } from "../src/boxAnimRegistry.js";

describe("boxanim categorize", () => {
  it("categorizes locomotion clips", () => {
    const c = categorizeBoxAnim("Dodging Back.fbx");
    expect(c.category).toBe("locomotion");
    expect(c.name).toBe("Dodging Back");
  });

  it("categorizes sword_shield clips", () => {
    const c = categorizeBoxAnim("Sword And Shield Slash (3).fbx");
    expect(c.category).toBe("sword_shield");
  });

  it("skips non-gameplay clips", () => {
    expect(shouldSkipBoxAnim("Driving.fbx")).toBe(true);
    expect(shouldSkipBoxAnim("Dodging Back.fbx")).toBe(false);
  });
});

describe("boxAnimRegistry", () => {
  it("maps global gameplay states", () => {
    expect(BOX_ANIM_GLOBAL.dodgeBack).toContain("boxanimations/");
    expect(BOX_ANIM_GLOBAL.taunt).toContain("Standing Taunt");
  });

  it("applyBoxAnimOverrides merges pack-specific clips", () => {
    const rels = new Map([["idle", "sword_shield/sword and shield idle"]]);
    applyBoxAnimOverrides(rels, "sword_shield");
    expect(rels.get("dodgeBack")).toBe(BOX_ANIM_GLOBAL.dodgeBack);
    expect(rels.get("combo1")).toBe(BOX_ANIM_BY_PACK.sword_shield.combo1);
  });
});