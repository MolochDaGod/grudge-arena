/**
 * Upper-body IK — steers a held weapon's barrel (+Z local) toward a world aim direction.
 * Ported from character-kit weaponAimIk.ts.
 */

import * as THREE from 'three';

const _localBarrel = new THREE.Vector3(0, 0, 1);
const _barrel = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _dq = new THREE.Quaternion();
const _partial = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();

function applyDeltaWorld(bone, deltaWorld) {
  bone.getWorldQuaternion(_wq);
  _wq.premultiply(deltaWorld);
  if (bone.parent) {
    bone.parent.getWorldQuaternion(_pq).invert();
    bone.quaternion.copy(_pq).multiply(_wq);
  } else {
    bone.quaternion.copy(_wq);
  }
  bone.updateWorldMatrix(false, true);
}

/**
 * @param {THREE.Object3D} weapon
 * @param {THREE.Vector3} aimDirWorld
 * @param {{ spine?: THREE.Object3D|null, spine1?: THREE.Object3D|null, spine2?: THREE.Object3D|null, neck?: THREE.Object3D|null, rightClavicle?: THREE.Object3D|null, rightArm?: THREE.Object3D|null }} chain
 * @param {number} strength
 * @param {{ torsoOnly?: boolean }} [opts]
 */
export function applyWeaponAimIk(weapon, aimDirWorld, chain, strength, opts) {
  if (strength < 1e-4) return;
  _aim.copy(aimDirWorld);
  if (_aim.lengthSq() < 1e-8) return;
  _aim.normalize();

  const bones = [];
  const shares = [];
  const push = (b, share) => {
    if (b) {
      bones.push(b);
      shares.push(share);
    }
  };
  push(chain.spine, 0.28);
  push(chain.spine1 ?? chain.spine2, 0.34);
  push(chain.neck, 0.08);
  push(chain.rightClavicle, 0.3);
  if (!opts?.torsoOnly) {
    push(chain.rightArm, 0.28);
  }
  if (bones.length === 0) return;

  const total = shares.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < bones.length; i++) {
    weapon.updateWorldMatrix(true, false);
    _barrel.copy(_localBarrel).transformDirection(weapon.matrixWorld).normalize();
    if (_barrel.dot(_aim) > 0.992) break;
    _dq.setFromUnitVectors(_barrel, _aim);
    const frac = (shares[i] / total) * strength;
    _partial.identity().slerp(_dq, frac);
    applyDeltaWorld(bones[i], _partial);
  }
}