/**
 * Post-mixer procedural rig — foot IK, hip recenter, weapon aim IK.
 * Danger room / explorer parity for island combat sandbox.
 */

import * as THREE from 'three';
import { FootIkRig } from './FootIkRig.js';
import { FOOT_IK } from './footIkMath.js';
import { applyWeaponAimIk } from './WeaponAimIk.js';
import { getAnimationRoot } from '../characterScale.js';
import { resolveRigBones } from './RigBones.js';
import { HipRecenter } from './HipRecenter.js';

const FIREARM_TYPES = new Set(['bow', 'rifle']);

const _aimDir = new THREE.Vector3();
const _hipsLocal = new THREE.Vector3();

function isFirearmType(weaponType) {
  return FIREARM_TYPES.has(weaponType);
}

function baseAimIkStrength(aiming, hipFiring, kind) {
  if (aiming) {
    if (kind === 'bow') return 0.78;
    return 0.9;
  }
  if (hipFiring) return 0.58;
  return kind === 'bow' ? 0.22 : 0.3;
}

/** Find visible weapon mesh for barrel aim IK. */
function findAimWeaponMesh(root) {
  let procedural = null;
  let skinned = null;
  root.traverse((n) => {
    if (!n.visible) return;
    if (n.name === '__weapon') procedural = n;
    const lower = (n.name || '').toLowerCase();
    if (
      (n.isMesh || n.isSkinnedMesh) &&
      /weapon_/.test(lower) &&
      !/shield|quiver|extra|xtra/i.test(lower)
    ) {
      skinned = n;
    }
  });
  return procedural ?? skinned;
}

export class CharacterProceduralRig {
  /**
   * @param {THREE.Object3D} mesh
   * @param {import('./GroundSampler.js').GroundSampler} [groundSampler]
   */
  constructor(mesh, groundSampler = null) {
    this.mesh = mesh;
    this.animRoot = getAnimationRoot(mesh);
    this.groundSampler = groundSampler;
    this.footIk = new FootIkRig(mesh);
    this.hipRecenter = new HipRecenter(mesh);
    this.bones = resolveRigBones(mesh);
    this.hipRecenter.bind(this.bones.hips);
    this.weaponMesh = findAimWeaponMesh(mesh);
    this.valid = this.footIk.valid;
  }

  /** @param {import('./GroundSampler.js').GroundSampler} sampler */
  setGroundSampler(sampler) {
    this.groundSampler = sampler;
  }

  refreshWeaponMesh() {
    this.weaponMesh = findAimWeaponMesh(this.mesh);
  }

  /**
   * @param {object} ctx
   * @param {number} ctx.dt
   * @param {THREE.Camera} ctx.camera
   * @param {boolean} ctx.grounded
   * @param {boolean} ctx.climbing
   * @param {boolean} ctx.dashing
   * @param {boolean} ctx.aiming
   * @param {boolean} ctx.hipFiring
   * @param {string} ctx.weaponType
   * @param {number} ctx.speed01
   */
  update(ctx) {
    const {
      dt,
      camera,
      grounded = true,
      climbing = false,
      dashing = false,
      aiming = false,
      hipFiring = false,
      weaponType = 'greatsword',
      speed01 = 0,
    } = ctx;

    const footActive = grounded && !climbing && !dashing;
    if (this.footIk.valid) {
      this.footIk.apply(
        (x, y, z) => this._groundRay(x, y, z),
        footActive,
        dt,
        FOOT_IK,
      );
    }

    const recenterActive = footActive && !dashing;
    this.hipRecenter.update(dt, recenterActive);

    if (camera && this.weaponMesh && isFirearmType(weaponType)) {
      camera.getWorldDirection(_aimDir);
      if (_aimDir.lengthSq() > 1e-8) {
        const strength = baseAimIkStrength(aiming, hipFiring, weaponType);
        const gaitCap = aiming ? 0.68 : 1;
        const moveAtten = 1 - Math.min(speed01, 1) * (aiming ? 0.35 : 0.2);
        applyWeaponAimIk(
          this.weaponMesh,
          _aimDir,
          {
            spine: this.bones.spine,
            spine1: this.bones.spine1,
            spine2: this.bones.spine2,
            neck: this.bones.neck,
            rightClavicle: this.bones.rightClavicle,
            rightArm: this.bones.rightArm,
          },
          strength * moveAtten * gaitCap,
          { torsoOnly: true },
        );
      }
    }
  }

  _groundRay(x, y, z) {
    if (this.groundSampler) {
      const gy = this.groundSampler.sampleY(x, z, y + FOOT_IK.rayUp);
      if (gy != null && Number.isFinite(gy)) return gy;
    }
    return null;
  }
}

/** @param {THREE.Object3D} mesh */
export function createCharacterProceduralRig(mesh, groundSampler) {
  const rig = new CharacterProceduralRig(mesh, groundSampler);
  return rig.valid || rig.bones.hips ? rig : null;
}