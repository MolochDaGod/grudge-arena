/**
 * Hip recenter — ease the body back to centered between planted feet after mixer pose.
 *
 * XZ system (horizontal): residual pelvis drift from rotation-only clips is eased
 * back to rest so feet plant under the root. Character root XZ is owned by
 * ArenaController — never write mesh.position.x/z here.
 *
 * Y system (vertical): preserve hips.position.y so FootIk / ground snap can drop
 * the pelvis this frame without fighting recenter.
 */

import * as THREE from "three";

const RECENTER_K = 12;
const RECENTER_DEADZONE = 0.18;

const _hips = new THREE.Vector3();
const _hipsLocal = new THREE.Vector3();

export function recenterStep(c, residual, dt, k) {
  const a = 1 - Math.exp(-k * dt);
  return c - residual * a;
}

export function decayToZero(c, dt, k) {
  return c * Math.exp(-k * dt);
}

export function deadzone(v, dz) {
  const a = Math.abs(v);
  return a <= dz ? 0 : (a - dz) * Math.sign(v);
}

export class HipRecenter {
  constructor(mesh) {
    this.mesh = mesh;
    this.center = { x: 0, z: 0 };
    this.hips = null;
    this._hipsRest = new THREE.Vector3();
  }

  /** @param {THREE.Object3D|null} hipsBone */
  bind(hipsBone) {
    this.hips = hipsBone;
    if (hipsBone) this._hipsRest.copy(hipsBone.position);
  }

  /**
   * @param {number} dt
   * @param {boolean} active — false during dash/climb/displacement actions
   */
  update(dt, active) {
    const hips = this.hips;
    if (!hips || !this.mesh) return;

    if (!active) {
      this.center.x = decayToZero(this.center.x, dt, RECENTER_K);
      this.center.z = decayToZero(this.center.z, dt, RECENTER_K);
    } else {
      hips.getWorldPosition(_hips);
      this.mesh.worldToLocal(_hips);
      _hipsLocal.copy(_hips);
      this.center.x = recenterStep(
        this.center.x,
        deadzone(_hipsLocal.x, RECENTER_DEADZONE),
        dt,
        RECENTER_K,
      );
      this.center.z = recenterStep(
        this.center.z,
        deadzone(_hipsLocal.z, RECENTER_DEADZONE),
        dt,
        RECENTER_K,
      );
    }

    // Preserve Y — foot IK may have dropped the pelvis this frame.
    const y = hips.position.y;
    hips.position.set(
      this._hipsRest.x - this.center.x,
      y,
      this._hipsRest.z - this.center.z,
    );
  }
}