/**
 * OrbitCamera — Third-person camera with mouse orbit
 *
 * Controls:
 *   RMB drag  = orbit (yaw + pitch) around the player
 *   Scroll    = zoom in/out
 *   LMB drag  = orbit (same as RMB, for when no target selected)
 *
 * The camera tracks a target mesh with lerp smoothing.
 * Exposes `yaw` for the controller to compute camera-relative movement.
 *
 * Design: Camera position is computed from spherical coordinates
 * (yaw, pitch, distance) around the target's pivot point.
 */

import * as THREE from 'three';

const PI2 = Math.PI * 2;

export class OrbitCamera {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = null; // THREE.Object3D to follow

    // Spherical coords around target
    this.yaw = 0;            // Horizontal angle (radians, 0 = behind -Z)
    this.pitch = 0.35;       // Vertical angle (radians, 0 = level)
    this.distance = 7;       // Arm length

    // Limits
    this.minDistance = 2.5;
    this.maxDistance = 18;
    this.minPitch = -0.1;    // Slightly below horizon
    this.maxPitch = 1.2;     // ~70° up

    // Pivot offset from target root (shoulder height)
    this.pivotOffset = new THREE.Vector3(0, 1.4, 0);

    // Shoulder offset (slight right shift for over-shoulder feel)
    this.shoulderOffset = 0.5;

    // Smoothing
    this.followSpeed = 8;      // Position lerp speed
    this.orbitSensitivity = 0.003;
    this.zoomSensitivity = 0.08;

    // Internal state
    this._currentPos = new THREE.Vector3();
    this._currentLookAt = new THREE.Vector3();
    this._pivotWorld = new THREE.Vector3();
    this._initialized = false;
    this._isDragging = false;

    this._setupInput();
  }

  setTarget(target) {
    this.target = target;
    this._initialized = false;
  }

  /** Camera yaw in radians — used by controller for camera-relative movement */
  getYaw() {
    return this.yaw;
  }

  // ── Input ────────────────────────────────────────────────────────

  _setupInput() {
    const el = this.domElement;

    // Mouse drag for orbit
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        this._isDragging = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 || e.button === 2) {
        this._isDragging = false;
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this._isDragging) return;
      this.yaw -= e.movementX * this.orbitSensitivity;
      this.pitch += e.movementY * this.orbitSensitivity;
      this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
    });

    // Scroll zoom
    el.addEventListener('wheel', (e) => {
      this.distance += e.deltaY * this.zoomSensitivity;
      this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
    }, { passive: true });

    // Prevent context menu on canvas
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ── Update (call every frame) ────────────────────────────────────

  update(delta) {
    if (!this.target) return;

    // Compute pivot point (target position + offset)
    this._pivotWorld.copy(this.target.position).add(this.pivotOffset);

    // Spherical → Cartesian offset from pivot
    const cosPitch = Math.cos(this.pitch);
    const desiredPos = new THREE.Vector3(
      this._pivotWorld.x - Math.sin(this.yaw) * cosPitch * this.distance + Math.cos(this.yaw) * this.shoulderOffset,
      this._pivotWorld.y + Math.sin(this.pitch) * this.distance,
      this._pivotWorld.z - Math.cos(this.yaw) * cosPitch * this.distance - Math.sin(this.yaw) * this.shoulderOffset,
    );

    // Look-at: pivot point (slight forward bias so we see ahead of character)
    const desiredLookAt = this._pivotWorld.clone();

    // First frame: snap immediately
    if (!this._initialized) {
      this._currentPos.copy(desiredPos);
      this._currentLookAt.copy(desiredLookAt);
      this._initialized = true;
    } else {
      // Smooth follow
      const t = 1 - Math.exp(-this.followSpeed * delta);
      this._currentPos.lerp(desiredPos, t);
      this._currentLookAt.lerp(desiredLookAt, t);
    }

    this.camera.position.copy(this._currentPos);
    this.camera.lookAt(this._currentLookAt);
  }
}
