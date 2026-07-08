/**
 * Foot IK applier — plants feet on terrain after the animation mixer poses the skeleton.
 * Supports Bip001 race champions and mixamorig rigs.
 * Ported from character-kit footIk.ts.
 */

import * as THREE from 'three';
import {
  clampReach,
  dampWeight,
  lawOfCosinesAngle,
  pelvisDrop,
  solveTwoBoneAngles,
} from './footIkMath.js';
import { findBip001Bone, BIP001_ALIASES } from './Bip001Bones.js';
import { getAnimationRoot } from '../characterScale.js';

const MIXAMO_LEG_SET = {
  pelvis: 'mixamorigHips',
  left: {
    thigh: 'mixamorigLeftUpLeg',
    calf: 'mixamorigLeftLeg',
    foot: 'mixamorigLeftFoot',
  },
  right: {
    thigh: 'mixamorigRightUpLeg',
    calf: 'mixamorigRightLeg',
    foot: 'mixamorigRightFoot',
  },
};

const DEFAULT_REST_OFFSET = 0.1;
const REST_OFFSET_MIN = 0.04;
const REST_OFFSET_MAX = 0.2;

function resolveLegChain(byName, names) {
  const thigh = byName.get(names.thigh);
  const calf = byName.get(names.calf);
  const foot = byName.get(names.foot);
  if (!thigh || !calf || !foot) return null;
  return { thigh, calf, foot, restOffset: DEFAULT_REST_OFFSET };
}

function resolveBip001Legs(root) {
  const pelvis = findBip001Bone(root, BIP001_ALIASES.pelvis);
  const left = {
    thigh: findBip001Bone(root, BIP001_ALIASES.leftThigh),
    calf: findBip001Bone(root, BIP001_ALIASES.leftCalf),
    foot: findBip001Bone(root, BIP001_ALIASES.leftFoot),
  };
  const right = {
    thigh: findBip001Bone(root, BIP001_ALIASES.rightThigh),
    calf: findBip001Bone(root, BIP001_ALIASES.rightCalf),
    foot: findBip001Bone(root, BIP001_ALIASES.rightFoot),
  };
  if (!pelvis || !left.thigh || !left.calf || !left.foot || !right.thigh || !right.calf || !right.foot) {
    return null;
  }
  return {
    pelvis,
    legs: [
      { thigh: left.thigh, calf: left.calf, foot: left.foot, restOffset: DEFAULT_REST_OFFSET },
      { thigh: right.thigh, calf: right.calf, foot: right.foot, restOffset: DEFAULT_REST_OFFSET },
    ],
  };
}

export class FootIkRig {
  constructor(root) {
    this.root = root;
    this.pelvis = null;
    this.pelvisRest = new THREE.Vector3();
    this.legs = [];
    this.calibrated = false;
    this.weight = 0;

    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._c = new THREE.Vector3();
    this._foot = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._axis = new THREE.Vector3();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._pelvisWorld = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._bw = new THREE.Quaternion();
    this._pw = new THREE.Quaternion();

    const animRoot = getAnimationRoot(root);
    const bip = resolveBip001Legs(animRoot);
    if (bip) {
      this.pelvis = bip.pelvis;
      this.pelvisRest.copy(bip.pelvis.position);
      this.legs = bip.legs;
      return;
    }

    const byName = new Map();
    animRoot.traverse((n) => {
      if (n.isBone) byName.set(n.name, n);
    });
    const pelvis = byName.get(MIXAMO_LEG_SET.pelvis) ?? null;
    const left = resolveLegChain(byName, MIXAMO_LEG_SET.left);
    const right = resolveLegChain(byName, MIXAMO_LEG_SET.right);
    if (pelvis && left && right) {
      this.pelvis = pelvis;
      this.pelvisRest.copy(pelvis.position);
      this.legs = [left, right];
    }
  }

  get valid() {
    return this.pelvis !== null && this.legs.length === 2;
  }

  /**
   * @param {(x: number, y: number, z: number) => number | null} raycastGround
   * @param {boolean} active
   * @param {number} dt
   * @param {import('./footIkMath.js').typeof FOOT_IK} tune
   */
  apply(raycastGround, active, dt, tune) {
    if (!this.valid) return;
    const pelvis = this.pelvis;

    const target = active && tune.enabled ? 1 : 0;
    this.weight = dampWeight(this.weight, target, tune.weightRate, dt);
    if (this.weight < 0.001) {
      this.weight = 0;
      pelvis.position.copy(this.pelvisRest);
      return;
    }

    this.root.updateWorldMatrix(true, true);
    pelvis.position.copy(this.pelvisRest);
    pelvis.updateWorldMatrix(false, true);

    const groundYs = [];
    const deltas = [];
    for (const leg of this.legs) {
      leg.foot.getWorldPosition(this._foot);
      const gy = raycastGround(this._foot.x, this._foot.y, this._foot.z);
      groundYs.push(gy);
      if (gy === null) continue;
      if (!this.calibrated) {
        leg.restOffset = THREE.MathUtils.clamp(
          this._foot.y - gy,
          REST_OFFSET_MIN,
          REST_OFFSET_MAX,
        );
      }
      let delta = gy + leg.restOffset - this._foot.y;
      delta = THREE.MathUtils.clamp(delta, -tune.maxStep, tune.maxStep);
      deltas.push(delta);
    }
    if (deltas.length > 0) this.calibrated = true;

    const drop = pelvisDrop(deltas, tune.maxPelvisDrop) * this.weight;
    if (drop !== 0) {
      pelvis.getWorldPosition(this._pelvisWorld);
      this._desired.copy(this._pelvisWorld).y += drop;
      pelvis.parent?.worldToLocal(this._desired);
      pelvis.position.copy(this._desired);
      this.root.updateWorldMatrix(false, true);
    }

    for (let i = 0; i < this.legs.length; i++) {
      const gy = groundYs[i];
      if (gy === null) continue;
      const leg = this.legs[i];
      leg.foot.getWorldPosition(this._foot);
      const targetY = THREE.MathUtils.lerp(
        this._foot.y,
        gy + leg.restOffset,
        this.weight,
      );
      this._target.set(this._foot.x, targetY, this._foot.z);
      this.solveLeg(leg, this._target);
    }
  }

  solveLeg(leg, target) {
    const { thigh, calf, foot } = leg;
    thigh.getWorldPosition(this._a);
    calf.getWorldPosition(this._b);
    foot.getWorldPosition(this._c);

    const l1 = this._a.distanceTo(this._b);
    const l2 = this._b.distanceTo(this._c);
    if (l1 <= 1e-5 || l2 <= 1e-5) return;

    const curDist = this._a.distanceTo(this._c);
    const wantDist = clampReach(this._a.distanceTo(target), l1, l2, 0.02);
    const kneeNow = lawOfCosinesAngle(l1, l2, curDist);
    const kneeWant = solveTwoBoneAngles(l1, l2, wantDist).knee;

    this._axis.copy(this._a).sub(this._b);
    this._v1.copy(this._c).sub(this._b);
    this._axis.cross(this._v1);
    if (this._axis.lengthSq() < 1e-8) {
      this._v2.copy(this._c).sub(this._a).normalize();
      this._axis.set(0, 0, 1).cross(this._v2);
      if (this._axis.lengthSq() < 1e-8) this._axis.set(1, 0, 0);
    }
    this._axis.normalize();

    const bend = kneeWant - kneeNow;
    this.rotateBoneWorld(calf, this._axis, bend);
    foot.getWorldPosition(this._foot);
    const after = this._a.distanceTo(this._foot);
    if (Math.abs(after - wantDist) > Math.abs(curDist - wantDist) + 1e-4) {
      this.rotateBoneWorld(calf, this._axis, -2 * bend);
    }

    foot.getWorldPosition(this._foot);
    this._v1.copy(this._foot).sub(this._a);
    this._v2.copy(target).sub(this._a);
    if (this._v1.lengthSq() < 1e-8 || this._v2.lengthSq() < 1e-8) return;
    const ang = this._v1.angleTo(this._v2);
    if (ang < 1e-4) return;
    this._axis.copy(this._v1).cross(this._v2);
    if (this._axis.lengthSq() < 1e-8) return;
    this._axis.normalize();
    this.rotateBoneWorld(thigh, this._axis, ang);
  }

  rotateBoneWorld(bone, worldAxis, angle) {
    if (Math.abs(angle) < 1e-6) return;
    this._q.setFromAxisAngle(worldAxis, angle);
    bone.getWorldQuaternion(this._bw);
    this._bw.premultiply(this._q);
    if (bone.parent) {
      bone.parent.getWorldQuaternion(this._pw);
      this._pw.invert();
      bone.quaternion.copy(this._pw).multiply(this._bw);
    } else {
      bone.quaternion.copy(this._bw);
    }
    bone.updateWorldMatrix(false, true);
  }
}