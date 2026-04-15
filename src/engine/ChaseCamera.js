/**
 * Chase Camera — third-person over-shoulder camera.
 * Follows the target mesh with lerp smoothing. Supports scroll zoom.
 */

import * as THREE from 'three';

export class ChaseCamera {
  constructor(camera, target = null) {
    this.camera = camera;
    this.target = target;

    this.distance = 6;
    this.height = 4;
    this.lookAtHeight = 1.2;
    this.smoothSpeed = 5;

    this.currentPosition = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();
    this.offsetAngle = 0;
    this._initialized = false;
  }

  setTarget(target) {
    this.target = target;
    this._initialized = false;
  }

  update(delta) {
    if (!this.target) return;

    const targetPos = this.target.position.clone();
    const angle = this.target.rotation?.y || 0;

    const desiredPosition = new THREE.Vector3(
      targetPos.x - Math.sin(angle) * this.distance,
      targetPos.y + this.height,
      targetPos.z - Math.cos(angle) * this.distance
    );

    const desiredLookAt = new THREE.Vector3(
      targetPos.x, targetPos.y + this.lookAtHeight, targetPos.z
    );

    if (!this._initialized) {
      this.currentPosition.copy(desiredPosition);
      this.currentLookAt.copy(desiredLookAt);
      this._initialized = true;
    } else {
      this.currentPosition.lerp(desiredPosition, this.smoothSpeed * delta);
      this.currentLookAt.lerp(desiredLookAt, this.smoothSpeed * delta);
    }

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }
}
