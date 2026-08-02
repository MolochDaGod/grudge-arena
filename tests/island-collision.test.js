import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  collectIslandGroundMeshes,
  collectIslandObstacleMeshes,
} from "../src/dangerRoom/islandCollision.js";

describe("islandCollision", () => {
  it("collects terrain and paving for ground raycasts", () => {
    const root = new THREE.Group();
    const terrain = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshBasicMaterial(),
    );
    terrain.name = "island-terrain";
    const paving = new THREE.Mesh(
      new THREE.CircleGeometry(3, 8),
      new THREE.MeshBasicMaterial(),
    );
    paving.name = "village-paving";
    root.add(terrain, paving);

    const ground = collectIslandGroundMeshes(root, []);
    expect(ground).toHaveLength(2);
    expect(ground.map((m) => m.name)).toContain("island-terrain");
    expect(ground.map((m) => m.name)).toContain("village-paving");
  });

  it("collects props by name and parent group", () => {
    const root = new THREE.Group();
    const village = new THREE.Group();
    village.name = "island-village";
    const prop = new THREE.Mesh(
      new THREE.BoxGeometry(1, 2, 1),
      new THREE.MeshBasicMaterial(),
    );
    prop.name = "";
    village.add(prop);
    root.add(village);

    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1),
      new THREE.MeshBasicMaterial(),
    );
    rock.name = "island-rock-0";
    root.add(rock);

    const obstacles = collectIslandObstacleMeshes(root);
    expect(obstacles.length).toBeGreaterThanOrEqual(2);
    expect(obstacles.some((m) => m.name === "island-rock-0")).toBe(true);
  });
});