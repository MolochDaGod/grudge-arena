import { describe, it, expect } from "vitest";
import { bakedPathForState, bakedPathForKey } from "../src/animCatalog.js";
import { resolveAbilityCast } from "../src/weaponSkillCast.js";
import { attackComboForWeapon, ONE_HAND_MELEE_COMBO } from "../src/attackCombo.js";

describe("animCatalog", () => {
  it("resolves stable keys to baked paths", () => {
    expect(bakedPathForKey("magic_cast")).toContain("magic/");
    expect(bakedPathForKey("sword_attack_a")).toContain("sword_shield/");
  });

  it("resolves FSM state names to baked paths", () => {
    expect(bakedPathForState("cast2H", "staff")).toContain("2h cast");
    expect(bakedPathForState("block", "greatsword")).toContain("block");
    expect(bakedPathForState("powerUp", "staff")).toContain("magic/");
    expect(bakedPathForState("powerUp", "staff")).not.toMatch(/venom|marvel/);
  });
});

describe("weaponSkillCast", () => {
  it("staff meteor uses slow cast extend", () => {
    const spec = resolveAbilityCast(
      { effect: "meteor", skillAnim: "cast2H", castTime: 1.5 },
      "staff",
      "R",
    );
    expect(spec.stateName).toBe("cast2H");
    expect(spec.extend).toBeGreaterThan(1);
    expect(spec.rel).toBeTruthy();
  });

  it("melee charge resolves jump attack", () => {
    const spec = resolveAbilityCast(
      { effect: "dash", skillAnim: "jumpAttack" },
      "greatsword",
      "E",
    );
    expect(spec.stateName).toBe("jumpAttack");
    expect(spec.rel).toContain("melee run jump");
  });
});

describe("attackCombo", () => {
  it("greatsword combo has four baked strikes", () => {
    const combo = attackComboForWeapon("greatsword");
    expect(combo.length).toBe(4);
    expect(combo[0]).toContain("sword");
  });

  it("staff combo uses magic casts", () => {
    const combo = attackComboForWeapon("staff");
    expect(combo.some((p) => /magic/.test(p))).toBe(true);
    expect(combo.every((p) => !/\/(marvel|venom)\//.test(p))).toBe(true);
  });

  it("no combo path references marvel or venom packs", () => {
    for (const weapon of ["greatsword", "staff", "bow", "scythe", "runeblade", "wand"]) {
      const combo = attackComboForWeapon(weapon);
      expect(combo.every((p) => !/\/(marvel|venom)\//.test(p)), weapon).toBe(true);
    }
  });

  it("1-hand melee weapons use 4-click slash chain ending in one hand sword combo", () => {
    for (const weapon of ["sabres", "runeblade", "mace"]) {
      const combo = attackComboForWeapon(weapon);
      expect(combo).toHaveLength(4);
      expect(combo[3]).toContain("one hand sword combo");
      expect(combo[0]).toContain("slash");
    }
    expect(ONE_HAND_MELEE_COMBO).toHaveLength(4);
    expect(ONE_HAND_MELEE_COMBO[3]).toBe("sword_combo_finisher");
  });
});