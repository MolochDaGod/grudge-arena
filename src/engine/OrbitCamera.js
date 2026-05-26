/**
 * OrbitCamera — Souls-like RPG third-person camera
 *
 * Inspired by Dark Souls / Elden Ring camera behaviour:
 *   - Robust wall/pillar collision using multi-ray sphere-cast
 *   - Smooth distance pull-in near geometry (no pop/snap)
 *   - Recovery push-out when clear of obstacles
 *   - Over-shoulder offset for better spatial awareness
 *   - Camera never clips through walls or pillars
 *   - Pitch auto-adjusts when ceiling/ground constrains
 *
 * Controls:
 *   LMB hold + drag = orbit (yaw + pitch) around the player
 *   Scroll           = zoom (distance)
 *   RMB              = attack (handled by ArenaController)
 *
 * API:
 *   getYaw()              → current yaw (used by ArenaController)
 *   setPlayerMoving(bool) → signal from ArenaController
 *   snapBehind()          → instantly align camera behind character
 *   setCollisionMeshes()  → register arena obstacles for raycasting
 *   nudgeToward()         → Tab-target camera nudge
 */

import * as THREE from 'three';

const PI2 = Math.PI * 2;

// ── Souls-like camera configuration ─────────────────────────────
const CAMERA_CONFIG = {
  // Starting state
  INITIAL_YAW:       0,
  INITIAL_PITCH:     0.30,    // Slightly above shoulder
  INITIAL_DISTANCE:  5.5,     // Souls-like: closer than MMO

  // Distance / zoom
  ZOOM_MIN:          1.8,     // Very close for tight corridors
  ZOOM_MAX:          10,      // Arena is small, cap it
  ZOOM_SENSITIVITY:  0.12,

  // Pitch / vertical limits
  PITCH_MIN:        -0.6,     // Can look slightly below
  PITCH_MAX:         1.3,     // Can look well above

  // Mouse orbit sensitivity
  ORBIT_SENSITIVITY_X: 0.0025,
  ORBIT_SENSITIVITY_Y: 0.0020,

  // Pivot & shoulder
  PIVOT_HEIGHT:      1.55,    // Over-shoulder for souls feel
  SHOULDER_OFFSET:   0.45,    // Right-shoulder offset

  // Camera smoothing — separate pull-in vs push-out speeds
  FOLLOW_SPEED:      8,       // General orbit smoothing
  COLLISION_PULL_IN: 22,      // Fast snap when wall detected (souls-like instant)
  COLLISION_PUSH_OUT: 4,      // Slow recovery when clear of obstacles

  // Passive yaw follow
  PASSIVE_FOLLOW_IDLE:    1.5,
  PASSIVE_FOLLOW_MOVING:  3.5,
  PASSIVE_FOLLOW_THRESHOLD: 0.025,

  // Multi-ray collision sphere cast
  COLLISION_SPHERE_RADIUS: 0.35,  // Virtual camera sphere radius
  COLLISION_RAY_COUNT:     5,     // Rays in the sphere-cast ring
  COLLISION_MIN_DIST:      0.6,   // Absolute min distance from pivot
  COLLISION_SKIN:          0.25,  // Skin offset in front of hit point

  // Floor/ceiling collision
  CAMERA_MIN_HEIGHT:       0.5,   // Never go below this Y
  CAMERA_MAX_HEIGHT:       12,    // Never go above this Y
};

// ── Tab-target nudge constants ───────────────────────────────────
const TAB_NUDGE_ANGLE = 0.25;
const TAB_NUDGE_SPEED = 4.0;

export class OrbitCamera {
  constructor(camera, domElement) {
    this.camera     = camera;
    this.domElement = domElement;
    this.target     = null;

    // Current spherical coords (actual camera state)
    this.yaw      = CAMERA_CONFIG.INITIAL_YAW;
    this.pitch    = CAMERA_CONFIG.INITIAL_PITCH;
    this.distance = CAMERA_CONFIG.INITIAL_DISTANCE;

    // Target spherical coords (input writes here; actual lerps toward)
    this._targetYaw      = this.yaw;
    this._targetPitch    = this.pitch;
    this._targetDistance = this.distance;

    // Collision-adjusted distance (what's actually used for positioning)
    this._effectiveDistance = this.distance;

    // Pivot / look-at offset
    this.pivotOffset    = new THREE.Vector3(0, CAMERA_CONFIG.PIVOT_HEIGHT, 0);
    this.shoulderOffset = CAMERA_CONFIG.SHOULDER_OFFSET;

    // Internal state
    this._currentPos    = new THREE.Vector3();
    this._currentLookAt = new THREE.Vector3();
    this._pivotWorld    = new THREE.Vector3();
    this._initialized   = false;
    this._isDragging    = false;
    this._isMoving      = false;

    // Collision system — multi-ray sphere-cast
    this._raycaster       = new THREE.Raycaster();
    this._collisionMeshes = [];
    this._lastCollisionDist = Infinity;  // Tracks collision distance for smooth recovery

    // Tab-target nudge
    this._tabNudge    = 0;
    this._tabNudgeDir = 0;

    // Reusable vectors (avoid GC pressure)
    this._tmpVec3A = new THREE.Vector3();
    this._tmpVec3B = new THREE.Vector3();
    this._tmpVec3C = new THREE.Vector3();

    this._cfg = CAMERA_CONFIG;
    this._setupInput();
  }

  // ── Public API ───────────────────────────────────────────────────

  setTarget(target) {
    this.target       = target;
    this._initialized = false;
  }

  getYaw() { return this.yaw; }
  get isDragging() { return this._isDragging; }

  setPlayerMoving(moving) { this._isMoving = moving; }

  /**
   * Register arena obstacle meshes for camera collision.
   * Should include pillars, walls, boulders — anything the camera can clip through.
   * @param {THREE.Mesh[]} meshes
   */
  setCollisionMeshes(meshes) {
    this._collisionMeshes = meshes || [];
  }

  nudgeToward(targetPos) {
    if (!this.target) return;
    const toTarget = Math.atan2(
      targetPos.x - this.target.position.x,
      targetPos.z - this.target.position.z,
    );
    let diff = (toTarget + Math.PI) - this._targetYaw;
    while (diff > Math.PI) diff -= PI2;
    while (diff < -Math.PI) diff += PI2;
    this._tabNudge = TAB_NUDGE_ANGLE;
    this._tabNudgeDir = Math.sign(diff) || 1;
  }

  snapBehind() {
    if (!this.target) return;
    this.yaw         = this.target.rotation.y + Math.PI;
    this._targetYaw  = this.yaw;
  }

  // ── Input setup ──────────────────────────────────────────────────

  _setupInput() {
    const el = this.domElement;

    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) this._isDragging = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this._isDragging) return;
      this._targetYaw   -= e.movementX * this._cfg.ORBIT_SENSITIVITY_X;
      this._targetPitch += e.movementY * this._cfg.ORBIT_SENSITIVITY_Y;
      this._targetPitch = Math.max(
        this._cfg.PITCH_MIN,
        Math.min(this._cfg.PITCH_MAX, this._targetPitch),
      );
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const sign = Math.sign(e.deltaY);
      const mag  = Math.min(Math.abs(e.deltaY), 40) * 0.01;
      this._targetDistance += sign * mag * this._cfg.ZOOM_SENSITIVITY * this._targetDistance;
      this._targetDistance = Math.max(
        this._cfg.ZOOM_MIN,
        Math.min(this._cfg.ZOOM_MAX, this._targetDistance),
      );
    }, { passive: false });

    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ── Multi-ray sphere-cast collision ──────────────────────────────

  /**
   * Cast multiple rays from pivot toward the desired camera position,
   * forming a virtual sphere. Returns the shortest safe distance.
   * This prevents the camera from clipping through thin pillars
   * and handles wall corners/angles gracefully.
   */
  _sphereCastCollision(pivot, desiredPos) {
    if (this._collisionMeshes.length === 0) return Infinity;

    const mainDir = this._tmpVec3A.copy(desiredPos).sub(pivot);
    const maxDist = mainDir.length();
    if (maxDist < 0.01) return Infinity;
    mainDir.normalize();

    // Build a perpendicular ring of offset rays around the main ray
    // This simulates a sphere by casting rays from slightly offset positions
    const up = this._tmpVec3B.set(0, 1, 0);
    const right = this._tmpVec3C.crossVectors(mainDir, up).normalize();
    // If mainDir is nearly vertical, recalculate right
    if (right.lengthSq() < 0.001) {
      right.set(1, 0, 0);
    }
    const trueUp = new THREE.Vector3().crossVectors(right, mainDir).normalize();

    const R = this._cfg.COLLISION_SPHERE_RADIUS;
    const N = this._cfg.COLLISION_RAY_COUNT;
    let closestDist = maxDist;

    // Main center ray
    this._raycaster.set(pivot, mainDir);
    this._raycaster.far = maxDist + R;
    const centerHits = this._raycaster.intersectObjects(this._collisionMeshes, true);
    if (centerHits.length > 0) {
      closestDist = Math.min(closestDist, centerHits[0].distance);
    }

    // Ring rays — offset the origin by R in N directions perpendicular to mainDir
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * PI2;
      const offsetX = Math.cos(angle) * R;
      const offsetY = Math.sin(angle) * R;

      const offsetOrigin = pivot.clone()
        .addScaledVector(right, offsetX)
        .addScaledVector(trueUp, offsetY);

      // Ray direction from offset origin toward the desired pos
      const offsetDir = desiredPos.clone().sub(offsetOrigin);
      const offsetDist = offsetDir.length();
      if (offsetDist < 0.01) continue;
      offsetDir.normalize();

      this._raycaster.set(offsetOrigin, offsetDir);
      this._raycaster.far = offsetDist;
      const hits = this._raycaster.intersectObjects(this._collisionMeshes, true);
      if (hits.length > 0) {
        // Map hit back to center-ray distance
        const hitPoint = hits[0].point;
        const projDist = hitPoint.clone().sub(pivot).dot(mainDir);
        closestDist = Math.min(closestDist, Math.max(0, projDist));
      }
    }

    return closestDist;
  }

  // ── Per-frame update ─────────────────────────────────────────────

  update(delta) {
    if (!this.target) return;

    const cfg = this._cfg;

    // ── Passive follow-behind ──────────────────────────────────────
    if (!this._isDragging) {
      const behindYaw = this.target.rotation.y + Math.PI;
      let diff = behindYaw - this._targetYaw;
      while (diff >  Math.PI) diff -= PI2;
      while (diff < -Math.PI) diff += PI2;

      if (Math.abs(diff) > cfg.PASSIVE_FOLLOW_THRESHOLD) {
        const speed = this._isMoving
          ? cfg.PASSIVE_FOLLOW_MOVING
          : cfg.PASSIVE_FOLLOW_IDLE;
        const t = 1 - Math.exp(-speed * delta);
        this._targetYaw += diff * t;
      }
    }

    // ── Tab-target nudge ─────────────────────────────────────────
    if (this._tabNudge > 0.001) {
      this._targetYaw += this._tabNudgeDir * this._tabNudge * delta * TAB_NUDGE_SPEED;
      this._tabNudge *= Math.max(0, 1 - TAB_NUDGE_SPEED * delta);
    }

    // ── Smooth orbit values toward targets ────────────────────────
    const st = 1 - Math.exp(-cfg.FOLLOW_SPEED * delta);
    let yawDiff = this._targetYaw - this.yaw;
    while (yawDiff >  Math.PI) yawDiff -= PI2;
    while (yawDiff < -Math.PI) yawDiff += PI2;
    this.yaw      += yawDiff * st;
    this.pitch    += (this._targetPitch  - this.pitch)  * st;
    this.distance += (this._targetDistance - this.distance) * st;

    // ── Build pivot point ─────────────────────────────────────────
    this._pivotWorld.copy(this.target.position).add(this.pivotOffset);

    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const cosYaw   = Math.cos(this.yaw);
    const sinYaw   = Math.sin(this.yaw);

    // ── Desired camera position (spherical → world) ───────────────
    const desiredPos = new THREE.Vector3(
      this._pivotWorld.x - sinYaw * cosPitch * this.distance + cosYaw * this.shoulderOffset,
      this._pivotWorld.y + sinPitch * this.distance,
      this._pivotWorld.z - cosYaw * cosPitch * this.distance - sinYaw * this.shoulderOffset,
    );

    // Clamp camera height
    desiredPos.y = Math.max(cfg.CAMERA_MIN_HEIGHT, Math.min(cfg.CAMERA_MAX_HEIGHT, desiredPos.y));

    // ── Sphere-cast collision ─────────────────────────────────────
    // Souls-like cameras pull in FAST when hitting walls (almost instant)
    // but push back out SLOWLY when the obstacle clears (smooth recovery).
    const collisionDist = this._sphereCastCollision(this._pivotWorld, desiredPos);
    const skinDist      = collisionDist - cfg.COLLISION_SKIN;
    const wantedDist    = this.distance;
    const clampedDist   = Math.max(cfg.COLLISION_MIN_DIST, Math.min(wantedDist, skinDist));

    // Asymmetric smoothing: fast pull-in, slow push-out
    const isCloser = clampedDist < this._effectiveDistance;
    const collisionSpeed = isCloser ? cfg.COLLISION_PULL_IN : cfg.COLLISION_PUSH_OUT;
    const ct = 1 - Math.exp(-collisionSpeed * delta);
    this._effectiveDistance += (clampedDist - this._effectiveDistance) * ct;
    this._effectiveDistance = Math.max(cfg.COLLISION_MIN_DIST, this._effectiveDistance);

    // Rebuild position using effective (collision-adjusted) distance
    const effectivePos = new THREE.Vector3(
      this._pivotWorld.x - sinYaw * cosPitch * this._effectiveDistance + cosYaw * this.shoulderOffset,
      this._pivotWorld.y + sinPitch * this._effectiveDistance,
      this._pivotWorld.z - cosYaw * cosPitch * this._effectiveDistance - sinYaw * this.shoulderOffset,
    );
    effectivePos.y = Math.max(cfg.CAMERA_MIN_HEIGHT, Math.min(cfg.CAMERA_MAX_HEIGHT, effectivePos.y));

    // ── Look-at with slight forward bias ──────────────────────────
    const lookAtBias = Math.max(0, 1.0 - this._effectiveDistance / 6) * 0.5;
    const desiredLookAt = this._pivotWorld.clone().addScaledVector(
      new THREE.Vector3(-sinYaw, 0, -cosYaw), lookAtBias,
    );

    // ── Apply (snap on first frame, smooth thereafter) ───────────
    if (!this._initialized) {
      this._currentPos.copy(effectivePos);
      this._currentLookAt.copy(desiredLookAt);
      this._effectiveDistance = clampedDist;
      this._initialized = true;
    } else {
      // Position smoothing — also asymmetric (fast pull-in, smooth push-out)
      const posSpeed = isCloser ? cfg.COLLISION_PULL_IN : cfg.FOLLOW_SPEED;
      const pt = 1 - Math.exp(-posSpeed * delta);
      this._currentPos.lerp(effectivePos, pt);

      const lt = 1 - Math.exp(-cfg.FOLLOW_SPEED * delta);
      this._currentLookAt.lerp(desiredLookAt, lt);
    }

    this.camera.position.copy(this._currentPos);
    this.camera.lookAt(this._currentLookAt);
  }
}
