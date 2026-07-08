/**
 * Island navmesh — heightfield grid from islandHeight() for walkability + A* paths.
 */

import * as THREE from "three";
import { islandHeight, islandLandFactor, ISLAND_SIZE } from "../dangerRoom/IslandTerrain.js";

const DEFAULT_CELL = 2;
const MAX_WALK_SLOPE = 0.52;
const MIN_WALK_Y = -0.35;
const MIN_LAND = 0.03;

/** Combat island spawn pads — stay walkable after obstacle AABB blocking. */
export const ISLAND_SPAWN_PADS = [
  { x: 0, z: 5, radius: 4.5, label: "player" },
  { x: 0, z: 0, radius: 5.5, label: "hub" },
  { x: 0, z: -7, radius: 5, label: "teamB" },
];

function inSpawnPad(x, z, pads = ISLAND_SPAWN_PADS) {
  for (const pad of pads) {
    if (Math.hypot(x - pad.x, z - pad.z) <= pad.radius) return true;
  }
  return false;
}

export class IslandNavMesh {
  /** @param {{ cellSize?: number, halfSize?: number }} [opts] */
  constructor(opts = {}) {
    this.cellSize = opts.cellSize ?? DEFAULT_CELL;
    this.halfSize = opts.halfSize ?? ISLAND_SIZE / 2;
    this.cols = Math.ceil((this.halfSize * 2) / this.cellSize);
    this.rows = this.cols;
    this._walkable = new Uint8Array(this.cols * this.rows);
    this._heights = new Float32Array(this.cols * this.rows);
    this._built = false;
  }

  _idx(cx, cz) {
    return cz * this.cols + cx;
  }

  _worldToCell(x, z) {
    const cx = Math.floor((x + this.halfSize) / this.cellSize);
    const cz = Math.floor((z + this.halfSize) / this.cellSize);
    return {
      cx: Math.max(0, Math.min(this.cols - 1, cx)),
      cz: Math.max(0, Math.min(this.rows - 1, cz)),
    };
  }

  worldToCell(x, z) {
    return this._worldToCell(x, z);
  }

  cellCenter(cx, cz) {
    return {
      x: -this.halfSize + (cx + 0.5) * this.cellSize,
      z: -this.halfSize + (cz + 0.5) * this.cellSize,
    };
  }

  _terrainWalkableAt(x, z) {
    const cs = this.cellSize;
    const y = islandHeight(x, z);
    const land = islandLandFactor(x, z);
    const yN = islandHeight(x, z + cs * 0.5);
    const yS = islandHeight(x, z - cs * 0.5);
    const yE = islandHeight(x + cs * 0.5, z);
    const yW = islandHeight(x - cs * 0.5, z);
    const maxGrade = Math.max(
      Math.abs(yN - y) / (cs * 0.5),
      Math.abs(yS - y) / (cs * 0.5),
      Math.abs(yE - y) / (cs * 0.5),
      Math.abs(yW - y) / (cs * 0.5),
    );
    return land >= MIN_LAND && y >= MIN_WALK_Y && maxGrade <= MAX_WALK_SLOPE;
  }

  build() {
    const cs = this.cellSize;
    for (let cz = 0; cz < this.rows; cz++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const { x, z } = this.cellCenter(cx, cz);
        const y = islandHeight(x, z);
        const i = this._idx(cx, cz);
        this._heights[i] = y;
        this._walkable[i] = this._terrainWalkableAt(x, z) ? 1 : 0;
      }
    }
    this._built = true;
    return this;
  }

  /** Force walkable spawn pads on island land (props keep physics/camera collision). */
  applySpawnPads(pads = ISLAND_SPAWN_PADS) {
    if (!this._built) this.build();
    for (let cz = 0; cz < this.rows; cz++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const { x, z } = this.cellCenter(cx, cz);
        if (!inSpawnPad(x, z, pads)) continue;
        if (islandLandFactor(x, z) >= MIN_LAND) {
          this._walkable[this._idx(cx, cz)] = 1;
        }
      }
    }
    return this;
  }

  /**
   * Mark nav cells under static obstacle AABBs unwalkable (ships, towers, walls).
   * Skips tiny props so the grid stays navigable.
   */
  blockObstacles(roots, { minExtent = 1.25, padding = 0.4 } = {}) {
    if (!this._built) this.build();
    const box = new THREE.Box3();
    for (const root of roots || []) {
      if (!root) continue;
      root.updateMatrixWorld?.(true);
      box.setFromObject(root);
      if (box.isEmpty()) continue;
      const sx = box.max.x - box.min.x;
      const sz = box.max.z - box.min.z;
      if (Math.max(sx, sz) < minExtent) continue;

      const x0 = box.min.x - padding;
      const x1 = box.max.x + padding;
      const z0 = box.min.z - padding;
      const z1 = box.max.z + padding;

      const c0 = this._worldToCell(x0, z0);
      const c1 = this._worldToCell(x1, z1);
      const cxMin = Math.min(c0.cx, c1.cx);
      const cxMax = Math.max(c0.cx, c1.cx);
      const czMin = Math.min(c0.cz, c1.cz);
      const czMax = Math.max(c0.cz, c1.cz);

      for (let cz = czMin; cz <= czMax; cz++) {
        for (let cx = cxMin; cx <= cxMax; cx++) {
          const { x, z } = this.cellCenter(cx, cz);
          if (inSpawnPad(x, z)) continue;
          this._walkable[this._idx(cx, cz)] = 0;
        }
      }
    }
    this.applySpawnPads();
    return this;
  }

  heightAt(x, z) {
    if (!this._built) this.build();
    const { cx, cz } = this._worldToCell(x, z);
    return this._heights[this._idx(cx, cz)];
  }

  isWalkable(x, z) {
    if (!this._built) this.build();
    const { cx, cz } = this._worldToCell(x, z);
    return this._walkable[this._idx(cx, cz)] === 1;
  }

  /**
   * Block or slide movement into unwalkable cells.
   * @returns {{ x: number, z: number, blocked: boolean }}
   */
  constrainMove(x, z, nx, nz) {
    if (this.isWalkable(nx, nz)) return { x: nx, z: nz, blocked: false };
    const slideX = this.isWalkable(nx, z);
    const slideZ = this.isWalkable(x, nz);
    if (slideX && !slideZ) return { x: nx, z, blocked: true };
    if (slideZ && !slideX) return { x, z: nz, blocked: true };
    return { x, z, blocked: true };
  }

  /**
   * A* path on walkable cells.
   * @returns {Array<{x:number,z:number,y:number}>}
   */
  findPath(sx, sz, ex, ez, maxNodes = 800) {
    if (!this._built) this.build();
    const start = this._worldToCell(sx, sz);
    const end = this._worldToCell(ex, ez);
    if (!this._walkable[this._idx(start.cx, start.cz)]) return [];
    if (!this._walkable[this._idx(end.cx, end.cz)]) {
      let best = null;
      let bestD = Infinity;
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          const cx = end.cx + dx;
          const cz = end.cz + dz;
          if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) continue;
          if (!this._walkable[this._idx(cx, cz)]) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = { cx, cz };
          }
        }
      }
      if (!best) return [];
      end.cx = best.cx;
      end.cz = best.cz;
    }

    const key = (cx, cz) => `${cx},${cz}`;
    const open = [{ cx: start.cx, cz: start.cz, g: 0, f: 0 }];
    const came = new Map();
    const gScore = new Map([[key(start.cx, start.cz), 0]]);
    const closed = new Set();
    const h = (cx, cz) => Math.hypot(cx - end.cx, cz - end.cz);

    let nodes = 0;
    while (open.length && nodes++ < maxNodes) {
      open.sort((a, b) => a.f - b.f);
      const cur = open.shift();
      const ck = key(cur.cx, cur.cz);
      if (cur.cx === end.cx && cur.cz === end.cz) {
        const path = [];
        let k = ck;
        while (came.has(k)) {
          const [pcx, pcz] = k.split(",").map(Number);
          const c = this.cellCenter(pcx, pcz);
          path.unshift({ x: c.x, z: c.z, y: this._heights[this._idx(pcx, pcz)] });
          k = came.get(k);
        }
        const sc = this.cellCenter(start.cx, start.cz);
        path.unshift({ x: sc.x, z: sc.z, y: this._heights[this._idx(start.cx, start.cz)] });
        return path;
      }
      if (closed.has(ck)) continue;
      closed.add(ck);

      for (const [dx, dz] of [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [1, -1], [-1, 1], [-1, -1],
      ]) {
        const nx = cur.cx + dx;
        const nz = cur.cz + dz;
        if (nx < 0 || nz < 0 || nx >= this.cols || nz >= this.rows) continue;
        if (!this._walkable[this._idx(nx, nz)]) continue;
        const nk = key(nx, nz);
        if (closed.has(nk)) continue;
        const step = dx !== 0 && dz !== 0 ? 1.414 : 1;
        const tg = (gScore.get(ck) ?? Infinity) + step;
        if (tg >= (gScore.get(nk) ?? Infinity)) continue;
        came.set(nk, ck);
        gScore.set(nk, tg);
        open.push({ cx: nx, cz: nz, g: tg, f: tg + h(nx, nz) });
      }
    }
    return [];
  }
}