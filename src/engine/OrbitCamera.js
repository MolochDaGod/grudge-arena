/**
 * OrbitCamera — Fortnite/MMO hybrid third-person camera
 *
 * Controls:
 *   LMB hold + drag = orbit (yaw + pitch) around the player
 *     → Requests pointer-lock for precision mouse movement
 *   Scroll           = proportional zoom (distance + pitch scale together)
 *   RMB              = attack (handled by ArenaController, NOT camera)
 *
 * When LMB is NOT held the camera passively drifts behind the character.
 * Passive follow speed increases when the player is actively moving,
 * giving a Fortnite-style "camera stays behind you while running" feel.
 *
 * API:
 *   getYaw()              → current yaw (used by ArenaController)
 *   setPlayerMoving(bool) → signal from ArenaController; ramps follow speed
 *   snapBehind()          → instantly align camera behind character
 */

import * as THREE from 'three';

const PI2 = Math.PI * 2;

// ── Tunable constants ────────────────────────────────────────────
const CAMERA_CONFIG = {
  // Starting state
  INITIAL_YAW:       0,     // Radians (0 = facing -Z)
  INITIAL_PITCH:     0.30,  // Radians (slight downward look)
  INITIAL_DISTANCE:  6.5,   // Units from player pivot

  // Distance / zoom
  ZOOM_MIN:          2.5,
  ZOOM_MAX:          18,
  ZOOM_SENSITIVITY:  0.10,  // Wheel multiplier (1+delta*sensitivity)

  // Pitch / vertical
  PITCH_MIN:        -0.08,  // Slightly below horizon
  PITCH_MAX:         1.15,  // ~66° above horizon

  // Mouse orbit sensitivity
  ORBIT_SENSITIVITY_X: 0.0028,
  ORBIT_SENSITIVITY_Y: 0.0028,

  // Pivot & shoulder
  PIVOT_HEIGHT:      1.45,  // Camera look-at height above player root
  SHOULDER_OFFSET:   0.45,  // Rightward shift for over-shoulder view

  // Camera position smoothing (exponential lerp)
  FOLLOW_SPEED:      9,     // Radians/sec equivalent (higher = tighter)

  // Passive yaw follow (camera drifts behind character)
  PASSIVE_FOLLOW_IDLE:    1.8,  // Speed when player is standing still
  PASSIVE_FOLLOW_MOVING: 10.0,  // Speed when player is running (Fortnite feel)
  PASSIVE_FOLLOW_THRESHOLD: 0.015, // Min angle diff before following
};
// ─────────────────────────────────────────────────────────────────

export class OrbitCamera {
  constructor(camera, domElement) {
    this.camera     = camera;
    this.domElement = domElement;
    this.target     = null;   // THREE.Object3D to follow

    // Current spherical coords (what the camera actually uses)
    this.yaw      = CAMERA_CONFIG.INITIAL_YAW;
    this.pitch    = CAMERA_CONFIG.INITIAL_PITCH;
    this.distance = CAMERA_CONFIG.INITIAL_DISTANCE;

    // Target spherical coords (mouse input goes here; current lerps toward these)
    this._targetYaw      = this.yaw;
    this._targetPitch    = this.pitch;
    this._targetDistance = this.distance;

    // Pivot / look-at offset
    this.pivotOffset    = new THREE.Vector3(0, CAMERA_CONFIG.PIVOT_HEIGHT, 0);
    this.shoulderOffset = CAMERA_CONFIG.SHOULDER_OFFSET;

    // Internal state
    this._currentPos    = new THREE.Vector3();
    this._currentLookAt = new THREE.Vector3();
    this._pivotWorld    = new THREE.Vector3();
    this._initialized   = false;
    this._isDragging    = false;   // LMB held
    this._isMoving      = false;   // Set by ArenaController via setPlayerMoving()

    // Cached config refs
    this._cfg = CAMERA_CONFIG;

    this._setupInput();
  }

  // ── Public API ───────────────────────────────────────────────────

  setTarget(target) {
    this.target       = target;
    this._initialized = false;
  }

  /** Current yaw in radians — read by ArenaController for camera-relative movement */
  getYaw() { return this.yaw; }

  /** Whether the player is actively orbiting (LMB held + pointer-locked) */
  get isDragging() { return this._isDragging; }

  /**
   * Called by ArenaController every frame so the camera knows when to apply
   * aggressive Fortnite-style passive follow vs. gentle idle drift.
   * @param {boolean} moving
   */
  setPlayerMoving(moving) { this._isMoving = moving; }

  /**
   * Instantly snap the camera yaw to sit directly behind the character.
   * Useful when the player spawns or respawns.
   */
  snapBehind() {
    if (!this.target) return;
    this.yaw         = this.target.rotation.y + Math.PI;
    this._targetYaw  = this.yaw;
  }

  // ── Input setup ──────────────────────────────────────────────────

  _setupInput() {
    const el = this.domElement;

    // LMB drag = orbit (button 0). RMB (button 2) belongs to ArenaController.
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this._isDragging = true;
      // Request pointer-lock so mouse movement is raw delta (no edge clamping).
      el.requestPointerLock?.();
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      this._isDragging = false;
      // Release pointer lock when orbit ends.
      if (document.pointerLockElement === el) document.exitPointerLock?.();
    });

    // Mouse movement — accumulate into TARGET yaw/pitch while dragging.
    // Works both with pointer-lock (movementX/Y) and without.
    window.addEventListener('mousemove', (e) => {
      if (!this._isDragging) return;
      this._targetYaw   -= e.movementX * this._cfg.ORBIT_SENSITIVITY_X;
      this._targetPitch += e.movementY * this._cfg.ORBIT_SENSITIVITY_Y;
      this._targetPitch = Math.max(
        this._cfg.PITCH_MIN,
        Math.min(this._cfg.PITCH_MAX, this._targetPitch),
      );
    });

    // Scroll = proportional zoom.
    // Zooming in/out scales BOTH distance AND pitch so the camera angle
    // stays constant — identical to the pattern in the reference code.
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      // Normalise deltaY magnitude to avoid huge jumps on trackpads.
      const normalised = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 30) * 0.01;
      const factor     = 1.0 + normalised * this._cfg.ZOOM_SENSITIVITY;

      this._targetDistance *= factor;
      this._targetPitch    *= factor; // Keeps angle constant while zooming.

      this._targetDistance = Math.max(
        this._cfg.ZOOM_MIN,
        Math.min(this._cfg.ZOOM_MAX, this._targetDistance),
      );
      this._targetPitch = Math.max(
        this._cfg.PITCH_MIN,
        Math.min(this._cfg.PITCH_MAX, this._targetPitch),
      );
    }, { passive: false });

    // Prevent right-click context menu on canvas.
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ── Per-frame update ─────────────────────────────────────────────

  update(delta) {
    if (!this.target) return;

    // ── Passive follow-behind ──────────────────────────────────────
    // When NOT dragging the camera passively drifts to sit behind
    // the character's facing. Speed ramps up while the player moves
    // so the camera snaps behind quickly (Fortnite style).
    if (!this._isDragging) {
      const behindYaw = this.target.rotation.y + Math.PI;
      let diff = behindYaw - this._targetYaw;
      // Wrap diff to [-PI, PI]
      while (diff >  Math.PI) diff -= PI2;
      while (diff < -Math.PI) diff += PI2;

      if (Math.abs(diff) > this._cfg.PASSIVE_FOLLOW_THRESHOLD) {
        const speed = this._isMoving
          ? this._cfg.PASSIVE_FOLLOW_MOVING
          : this._cfg.PASSIVE_FOLLOW_IDLE;
        const t = 1 - Math.exp(-speed * delta);
        this._targetYaw += diff * t;
      }
    }

    // ── Smooth actual values toward targets ──────────────────────
    // Orbit inputs write to _targetYaw/_targetPitch/_targetDistance;
    // we lerp the live values for smooth camera glide.
    const st = 1 - Math.exp(-this._cfg.FOLLOW_SPEED * delta);
    let yawDiff = this._targetYaw - this.yaw;
    while (yawDiff >  Math.PI) yawDiff -= PI2;
    while (yawDiff < -Math.PI) yawDiff += PI2;
    this.yaw      += yawDiff * st;
    this.pitch    += (this._targetPitch    - this.pitch)    * st;
    this.distance += (this._targetDistance - this.distance) * st;

    // ── Build desired camera position (spherical → world) ────────
    this._pivotWorld.copy(this.target.position).add(this.pivotOffset);

    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const cosYaw   = Math.cos(this.yaw);
    const sinYaw   = Math.sin(this.yaw);

    const desiredPos = new THREE.Vector3(
      this._pivotWorld.x - sinYaw * cosPitch * this.distance + cosYaw * this.shoulderOffset,
      this._pivotWorld.y + sinPitch * this.distance,
      this._pivotWorld.z - cosYaw * cosPitch * this.distance - sinYaw * this.shoulderOffset,
    );

    // Look slightly ahead of the pivot (less tunnel-vision on tight zooms)
    const lookAtBias = Math.max(0, 1.0 - this.distance / 8) * 0.4;
    const desiredLookAt = this._pivotWorld.clone().addScaledVector(
      new THREE.Vector3(-sinYaw, 0, -cosYaw), lookAtBias,
    );

    // ── Apply (snap on first frame, smooth thereafter) ───────────
    if (!this._initialized) {
      this._currentPos.copy(desiredPos);
      this._currentLookAt.copy(desiredLookAt);
      this._initialized = true;
    } else {
      const ft = 1 - Math.exp(-this._cfg.FOLLOW_SPEED * delta);
      this._currentPos.lerp(desiredPos, ft);
      this._currentLookAt.lerp(desiredLookAt, ft);
    }

    this.camera.position.copy(this._currentPos);
    this.camera.lookAt(this._currentLookAt);
  }
}
