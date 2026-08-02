import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  DAMAGE_VARIANTS,
  resolveDamageModel,
} from "../src/dangerRoom/IslandPirateDamage.js";
import {
  getPirateIslandState,
  PLAYER_BOAT_SIZES,
  DEFAULT_SAIL_COLOR,
} from "../src/dangerRoom/pirateIslandStore.js";
import { BOAT_DOCK_ANCHOR } from "../src/dangerRoom/IslandBoatDock.js";

describe("Kenney Pirate Kit pipeline", () => {
  it("manifest lists 72 models including ships, dock, wildlife", () => {
    const manifest = JSON.parse(
      readFileSync(resolve("public/assets/island/pirate-kit/manifest.json"), "utf8"),
    );
    expect(manifest.models).toHaveLength(72);
    for (const id of [
      "ship-pirate-large",
      "ship-small",
      "ship-medium",
      "ship-large",
      "structure-platform-dock",
      "tower-complete-small",
      "cannon",
      "chest",
      "hole",
      "tool-shovel",
      "boat-row-small",
      "flag-pirate",
      "ship-wreck",
    ]) {
      expect(manifest.models).toContain(id);
    }
  });

  it("colormap texture is deployed", () => {
    const path = resolve("public/assets/island/pirate-kit/glb/Textures/colormap.png");
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path).length).toBeGreaterThan(1000);
  });

  it("damage variants map ships and towers to wreck assets", () => {
    expect(resolveDamageModel("ship-pirate-large", 0.1)).toBe("ship-wreck");
    expect(resolveDamageModel("ship-pirate-large", 0.4)).toBe("ship-ghost");
    expect(resolveDamageModel("ship-pirate-large", 0.9)).toBe("ship-pirate-large");
    expect(resolveDamageModel("tower-complete-large", 0.1)).toBe("rocks-c");
    expect(DAMAGE_VARIANTS["castle-wall"].wrecked).toBe("rocks-c");
  });

  it("player boat store defaults to medium white sails", () => {
    const st = getPirateIslandState();
    expect(PLAYER_BOAT_SIZES).toContain(st.boatSize);
    expect(st.sailColor).toBe(DEFAULT_SAIL_COLOR);
    expect(st.claims.dock.owner).toBe("player");
  });

  it("boat dock anchor is on island shoreline quadrant", () => {
    expect(Math.abs(BOAT_DOCK_ANCHOR.x)).toBeGreaterThan(20);
    expect(BOAT_DOCK_ANCHOR.z).toBeGreaterThan(15);
  });
});