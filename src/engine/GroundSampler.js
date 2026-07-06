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
    this._fallbackY = 0;
    this._rayHeight = 64;
  }

  /** Register walkable terrain meshes (updated when presets swap). */
  setTerrainMeshes(meshes) {
    this._meshes = meshes?.length ? meshes.slice() : [];
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
    if (!this._meshes.length) return this._fallbackY;

    _origin.set(x, Math.max(hintY, this._fallbackY) + this._rayHeight, z);
    this._raycaster.set(_origin, _dir);
    this._raycaster.far = this._rayHeight * 2;
    this._raycaster.near = 0;

    const hits = this._raycaster.intersectObjects(this._meshes, true);
    if (hits.length > 0) return hits[0].point.y;
    return this._fallbackY;
  }

  /** Stick mesh feet to terrain (mutates mesh.position.y). */
  snapMesh(mesh, footOffset = 0) {
    if (!mesh) return;
    mesh.position.y = this.sampleY(
      mesh.position.x,
      mesh.position.z,
      mesh.position.y + footOffset,
    );
  }
}