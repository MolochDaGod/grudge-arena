/**
 * GroundSampler — raycast terrain height for character grounding.
 * Ported from probe RTS sampleHeight + arpg-game course groundY pattern.
 */

import * as THREE from 'three';

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3(0, -1, 0);

export class GroundSampler {
  constructor() {
    this._raycaster = new THREE.Raycaster();
    this._meshes = [];
    this._propMeshes = [];
    this._fallbackY = 0;
    this._rayHeight = 64;
    /** Analytical height (e.g. islandHeight) when meshes are not streamed yet. */
    this._heightFn = null;
  }

  /** @param {(x: number, z: number) => number} fn */
  setHeightSampleFn(fn) {
    this._heightFn = typeof fn === "function" ? fn : null;
  }

  /** Register walkable terrain meshes (updated when presets swap). */
  setTerrainMeshes(meshes) {
    this._meshes = meshes?.length ? meshes.slice() : [];
  }

  /** Static props/buildings for vertical grounding raycasts (stairs, rocks, docks). */
  setPropMeshes(meshes) {
    this._propMeshes = meshes?.length ? meshes.slice() : [];
  }

  setFallbackY(y) {
    this._fallbackY = y ?? 0;
  }

  /**
   * Sample ground Y at world XZ. Returns fallback when no hit.
   * @param {number} x
   * @param {number} z
   * @param {number} [hintY] — ray origin height hint
   */
  sampleY(x, z, hintY = 0) {
    const rayTargets = this._meshes.length
      ? this._meshes
      : this._propMeshes.length
        ? this._propMeshes
        : null;
    if (rayTargets?.length) {
      _origin.set(x, Math.max(hintY, this._fallbackY) + this._rayHeight, z);
      this._raycaster.set(_origin, _dir);
      this._raycaster.far = this._rayHeight * 2;
      this._raycaster.near = 0;

      let bestY = null;
      const terrainHits = this._raycaster.intersectObjects(rayTargets, true);
      if (terrainHits.length > 0) bestY = terrainHits[0].point.y;

      if (this._propMeshes.length && this._meshes.length) {
        const propHits = this._raycaster.intersectObjects(this._propMeshes, true);
        if (propHits.length > 0) {
          const py = propHits[0].point.y;
          if (bestY == null || py > bestY) bestY = py;
        }
      }
      if (bestY != null) return bestY;
    }
    if (this._heightFn) return this._heightFn(x, z);
    return this._fallbackY;
  }

  /**
   * Stick character root to terrain (mutates mesh.position.y).
   * Root pivot is between feet at local Y=0 — world Y = sampled ground height.
   */
  snapMesh(mesh, footOffset = 0) {
    if (!mesh) return;
    mesh.position.y = this.sampleY(
      mesh.position.x,
      mesh.position.z,
      mesh.position.y + footOffset,
    );
  }
}