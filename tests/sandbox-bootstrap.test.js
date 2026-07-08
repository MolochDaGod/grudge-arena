import { describe, it, expect } from "vitest";
import { Components } from "../src/engine/ECS.js";
import { WeaponDefinitions } from "../src/engine/WeaponDefinitions.js";
import {
  syncSkillBarFromWeapon,
  ABILITY_SLOT_KEYS,
} from "../src/sandboxPlayerBootstrap.js";

describe("sandboxPlayerBootstrap", () => {
  it("syncSkillBarFromWeapon maps Q/E/R/F into slots 1-4", () => {
    const entity = {
      getComponent(name) {
        if (name === "SkillBar") return this._bar;
        return null;
      },
      _bar: Components.SkillBar(9),
    };
    const weapon = WeaponDefinitions.greatsword;
    const changed = syncSkillBarFromWeapon(entity, weapon);
    expect(changed).toBe(true);
    ABILITY_SLOT_KEYS.forEach((key, idx) => {
      const ability = weapon.abilities[key];
      expect(entity._bar.slots[idx]).toBe(`${key}:${ability.name}`);
    });
    expect(entity._bar.slots[4]).toBe(null);
    const ult = weapon.abilities.P;
    expect(entity._bar.slots[8]).toBe(`P:${ult.name}`);
  });

  it("syncSkillBarFromWeapon is idempotent", () => {
    const entity = {
      getComponent(name) {
        if (name === "SkillBar") return this._bar;
        return null;
      },
      _bar: Components.SkillBar(9),
    };
    const weapon = WeaponDefinitions.bow;
    syncSkillBarFromWeapon(entity, weapon);
    const ver = entity._bar.version;
    const changed = syncSkillBarFromWeapon(entity, weapon);
    expect(changed).toBe(false);
    expect(entity._bar.version).toBe(ver);
  });
});