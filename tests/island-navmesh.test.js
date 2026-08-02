import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { IslandNavMesh } from "../src/engine/IslandNavMesh.js";
import { islandLandFactor } from "../src/dangerRoom/IslandTerrain.js";

describe("IslandNavMesh", () => {
  it("marks island interior and player spawn walkable (not shore-only donut)", () => {
    const nav = new IslandNavMesh({ cellSize: 2, halfSize: 48 });
    nav.build();
    expect(islandLandFactor(0, 0)).toBeGreaterThan(0.9);
    expect(nav.isWalkable(0, 0)).toBe(true);
    expect(nav.isWalkable(0, 5)).toBe(true);
  });

  it("finds a path across the island interior", () => {
    const nav = new IslandNavMesh({ cellSize: 4, halfSize: 48 });
    nav.build();
    const sx = 0;
    const sz = 5;
    const ex = 8;
    const ez = 12;
    expect(nav.isWalkable(sx, sz)).toBe(true);
    const path = nav.findPath(sx, sz, ex, ez);
    expect(path.length).toBeGreaterThan(1);
    expect(path[0]).toMatchObject({ x: expect.any(Number), z: expect.any(Number), y: expect.any(Number) });
  });

  it("blocks nav cells under large obstacle AABBs", () => {
    const nav = new IslandNavMesh({ cellSize: 2, halfSize: 48 });
    nav.build();
    const sx = 8;
    const sz = 8;
    expect(nav.isWalkable(sx, sz)).toBe(true);
    const blocker = {
      updateMatrixWorld: () => {},
      children: [],
    };
    const box = { min: { x: 6, y: 0, z: 6 }, max: { x: 12, y: 4, z: 12 }, isEmpty: () => false };
    const orig = THREE.Box3.prototype.setFromObject;
    THREE.Box3.prototype.setFromObject = function () {
      this.min.copy(box.min);
      this.max.copy(box.max);
      return this;
    };
    try {
      nav.blockObstacles([blocker]);
      expect(nav.isWalkable(sx, sz)).toBe(false);
    } finally {
      THREE.Box3.prototype.setFromObject = orig;
    }
  });

  it("keeps spawn pads walkable when a full-island obstacle AABB is applied", () => {
    const nav = new IslandNavMesh({ cellSize: 2, halfSize: 48 });
    nav.build();
    const blocker = {
      updateMatrixWorld: () => {},
      children: [],
    };
    const box = {
      min: { x: -50, y: 0, z: -50 },
      max: { x: 50, y: 8, z: 50 },
      isEmpty: () => false,
    };
    const orig = THREE.Box3.prototype.setFromObject;
    THREE.Box3.prototype.setFromObject = function () {
      this.min.copy(box.min);
      this.max.copy(box.max);
      return this;
    };
    try {
      nav.blockObstacles([blocker]);
      expect(nav.isWalkable(0, 0)).toBe(true);
      expect(nav.isWalkable(0, 5)).toBe(true);
      const step = nav.constrainMove(0, 5, 2, 5);
      expect(step.blocked).toBe(false);
      expect(Math.hypot(step.x, step.z - 5)).toBeGreaterThan(0.4);
    } finally {
      THREE.Box3.prototype.setFromObject = orig;
    }
  });

  it("allows small moves from spawn and blocks leaps off-island", () => {
    const nav = new IslandNavMesh({ cellSize: 2, halfSize: 48 });
    nav.build();
    const near = nav.constrainMove(0, 5, 2, 5);
    expect(near.blocked).toBe(false);
    expect(Math.hypot(near.x - 0, near.z - 5)).toBeGreaterThan(0.5);

    const far = nav.constrainMove(0, 5, 200, 200);
    expect(far.blocked || Math.hypot(far.x - 200, far.z - 200) > 20).toBe(true);
  });
});