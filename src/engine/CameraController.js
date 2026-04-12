/**
 * CameraController — WoW-style third person camera
 * 
 * Modes:
 *   arena — orbit around player, target lock midpoint
 *   mmo   — same as arena but wider zoom range
 *   rts   — top-down isometric, WASD pans, scroll zooms
 * 
 * Features:
 *   - Right-click drag to orbit
 *   - Scroll to zoom
 *   - Over-shoulder offset (slight right shift)
 *   - Target lock: camera midpoints between player and target
 *   - Pillar collision: camera doesn't clip through geometry
 *   - Smart zoom: pulls back when target is far
 */

import * as THREE from 'three';

export class CameraController {
  constructor(camera, options = {}) {
    this.camera = camera;
    this.mode = options.mode || 'arena';

    // Target (the character to follow)
    this.target = null;          // THREE.Object3D (player mesh)
    this.focusTarget = null;     // THREE.Object3D (enemy, for target lock)

    // Orbit parameters
    this.yaw = Math.PI;          // Horizontal angle
    this.pitch = 0.3;            // Vertical angle (0=level, PI/2=top)
    this.distance = options.distance || 6;
    this.minDistance = options.minDistance || 2;
    this.maxDistance = options.maxDistance || 20;
    this.smoothSpeed = 8;

    // Over-shoulder offset
    this.shoulderOffset = new THREE.Vector3(0.5, 0, 0); // Slight right
    this.lookAtHeight = 1.2; // Look at chest height

    // State
    this._isRMBDown = false;
    this._currentPos = new THREE.Vector3();
    this._currentLookAt = new THREE.Vector3();
    this._initialized = false;

    // Raycaster for pillar collision
    this._raycaster = new THREE.Raycaster();
    this._collisionObjects = [];

    this._setupInput();

    // Register in global updates (annihilate pattern)
    if (!window.updates) window.updates = [];
    window.updates.push(this);
  }

  /** Set the character to follow */
  setTarget(target) {
    this.target = target;
    this._initialized = false;
  }

  /** Set the enemy for target lock */
  setFocusTarget(target) {
    this.focusTarget = target;
  }

  /** Register objects that block camera (pillars, walls) */
  addCollisionObjects(objects) {
    this._collisionObjects.push(...objects);
  }

  /** Get yaw as a ref for PlayerController camera-relative movement */
  get yawRef() {
    return { value: this.yaw };
  }

  _setupInput() {
    // Right-click drag to orbit
    document.addEventListener('mousedown', (e) => {
      if (e.button === 2) this._isRMBDown = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 2) this._isRMBDown = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (this._isRMBDown) {
        this.yaw -= e.movementX * 0.005;
        this.pitch = Math.max(0.05, Math.min(1.3, this.pitch + e.movementY * 0.005));
      }
    });

    // Scroll to zoom
    document.addEventListener('wheel', (e) => {
      this.distance = Math.max(this.minDistance, Math.min(this.maxDistance,
        this.distance + e.deltaY * 0.005
      ));
    }, { passive: true });

    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Called every frame by game loop */
  update(dt) {
    if (!this.target) return;

    const targetPos = this.target.position || this.target;

    // Look-at point: character chest + shoulder offset
    const lookAt = new THREE.Vector3(
      targetPos.x,
      targetPos.y + this.lookAtHeight,
      targetPos.z
    );

    // Target lock: midpoint between player and focus target
    if (this.focusTarget) {
      const focusPos = this.focusTarget.position || this.focusTarget;
      const mid = new THREE.Vector3().lerpVectors(lookAt, focusPos, 0.3);
      mid.y = lookAt.y; // Keep vertical stable
      lookAt.copy(mid);

      // Smart zoom: pull back when target is far
      const dist = targetPos.distanceTo(focusPos);
      const smartDist = Math.max(this.distance, dist * 0.5 + 3);
      this.distance = THREE.MathUtils.lerp(this.distance, smartDist, dt * 2);
    }

    // Camera position on spherical orbit
    let camX = Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance;
    let camY = Math.sin(this.pitch) * this.distance;
    let camZ = Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance;

    const desiredPos = new THREE.Vector3(
      lookAt.x + camX + this.shoulderOffset.x,
      lookAt.y + camY,
      lookAt.z + camZ
    );

    // Pillar collision: raycast from lookAt to desiredPos
    if (this._collisionObjects.length > 0) {
      const dir = new THREE.Vector3().subVectors(desiredPos, lookAt).normalize();
      const maxDist = lookAt.distanceTo(desiredPos);
      this._raycaster.set(lookAt, dir);
      this._raycaster.far = maxDist;
      const hits = this._raycaster.intersectObjects(this._collisionObjects);
      if (hits.length > 0 && hits[0].distance < maxDist) {
        // Pull camera in front of the obstruction
        const safePos = new THREE.Vector3().addVectors(
          lookAt, dir.multiplyScalar(hits[0].distance - 0.5)
        );
        desiredPos.copy(safePos);
      }
    }

    // Smooth follow (snap on first frame)
    if (!this._initialized) {
      this._currentPos.copy(desiredPos);
      this._currentLookAt.copy(lookAt);
      this._initialized = true;
    } else {
      const lerpFactor = 1 - Math.exp(-this.smoothSpeed * dt);
      this._currentPos.lerp(desiredPos, lerpFactor);
      this._currentLookAt.lerp(lookAt, lerpFactor);
    }

    this.camera.position.copy(this._currentPos);
    this.camera.lookAt(this._currentLookAt);
  }

  /** Switch camera mode */
  setMode(mode) {
    this.mode = mode;
    switch (mode) {
      case 'rts':
        this.pitch = 1.2;
        this.distance = 20;
        this.shoulderOffset.set(0, 0, 0);
        break;
      case 'mmo':
        this.maxDistance = 30;
        break;
      case 'arena':
      default:
        this.maxDistance = 15;
        this.shoulderOffset.set(0.5, 0, 0);
        break;
    }
  }
}
