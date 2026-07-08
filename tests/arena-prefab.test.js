import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  getRacePrefab,
  getHeroPrefab,
  getLoadoutPrefab,
  getDefaultD1Loadout,
  SCHEMA,
} from "../src/arenaPrefab.js";

const ROOT = join(import.meta.dirname, "..");
const MANIFEST = join(ROOT, "public/models/characterManifest.json");

describe("arenaPrefab/1.0 manifest", () => {
  it("on-disk manifest matches schema with slots and prefabs", () => {
    expect(existsSync(MANIFEST)).toBe(true);
    const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
    expect(m.schema).toBe(SCHEMA);
    expect(m.races.human.slots.body.variants).toContain("A");
    expect(m.races.human.weaponMappings.greatsword.rSlot).toBe("axe");
    expect(m.heroes.human.defaultWeapon).toBe("sabres");
    expect(m.prefabs.human_sabres_default.kind).toBe("characterLoadout");
    expect(m.api.r2Base).toContain("assets.grudge-studio.com");
  });

  it("resolves default D1 loadout from prefab helpers", () => {
    const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
    const loadout = getDefaultD1Loadout(m, "human", "sabres");
    expect(loadout.armor.body).toBe("C");
    expect(loadout.armor.head).toBe("D");
    expect(loadout.weapon.rSlot).toBe("sword");
    const prefab = getLoadoutPrefab(m, "human_sabres_default");
    expect(prefab.animPack).toBe("sword_shield");
    expect(getHeroPrefab(m, "elf").defaultWeapon).toBe("bow");
    expect(getRacePrefab(m, "dwarf").model.scaleMode).toBe("skinned-root-only");
  });
});