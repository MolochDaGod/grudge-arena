/**
 * OrbitCamera — WoW-style third-person camera for Grudge Arena
 *
 * Modelled after World of Warcraft camera behaviour:
 *   - Centred behind the character (no shoulder offset at default zoom)
 *   - Single-ray collision that pulls forward smoothly near walls/pillars
 *   - Recovery push-out is gentle — never snaps or pops
 *   - Minimum distance keeps camera well behind the character (no face-zoom)
 *   - Passive follow-behind while running, free orbit while holding LMB
 *   - Tab-target nudge (slight yaw toward selected enemy)
 *   - FOV 50 at default distance gives good spatial awareness
 *
 * Controls (WoW standard):
 *   LMB hold + drag = orbit (yaw + pitch)
 *   Scroll           = zoom in/out
 *   RMB              = attack (handled by ArenaController)
 *
 * API:
 *   getYaw()              → current camera yaw
 *   setPlayerMoving(bool) → ramps passive follow speed
 *   snapBehind()          → instant snap behind character
 *   setCollisionMeshes()  → register arena geometry for collision
 *   nudgeToward()         → Tab-target yaw nudge
 */

import * as THREE from 'three';

const PI2 = Math.PI * 2;

// ── WoW-style camera tuning ─────────────────────────────────
const CFG = {
  INITIAL_YAW:       0,
  INITIAL_PITCH:     0.32,
  INITIAL_DISTANCE:  6.5,     // WoW default — character fills ~30% of screen

  ZOOM_MIN:          2.5,     // Close but not inside the character
  ZOOM_MAX:          14,
  ZOOM_SENSITIVITY:  0.08,

  PITCH_MIN:        -0.5,
  PITCH_MAX:         1.4,

  ORBIT_SENSITIVITY_X: 0.002,
  ORBIT_SENSITIVITY_Y: 0.002,

  PIVOT_HEIGHT:      1.45,    // Just above character shoulder
  SHOULDER_OFFSET:   0.25,    // Slight right offset (WoW uses ~0.2)

  FOLLOW_SPEED:      7,       // General smoothing

  // Passive yaw follow (camera drifts behind character)
  PASSIVE_FOLLOW_IDLE:    2.0,
  PASSIVE_FOLLOW_MOVING:  4.0,
  PASSIVE_FOLLOW_THRESHOLD: 0.02,

  // Collision — single ray, conservative
  COLLISION_MIN_DIST:  1.8,   // Never closer than this (keeps character in frame)
  COLLISION_SKIN:      0.4,   // Pull camera this far in front of hit point
  COLLISION_PULL_IN:   14,    // Speed to pull camera forward (fast but not instant)
  COLLISION_PUSH_OUT:  3.5,   // Speed to recover outward (gentle)

  CAMERA_MIN_HEIGHT:   0.4,
  CAMERA_MAX_HEIGHT:   15,
};

// Tab-target nudge
const TAB_NUDGE_ANGLE = 0.2;
const TAB_NUDGE_SPEED = 4.0;

export class OrbitCamera {
  constructor(camera, domElement) {
    this.camera     = camera;
    this.domElement = domElement;
    this.target     = null;

    this.yaw      = CFG.INITIAL_YAW;
    this.pitch    = CFG.INITIAL_PITCH;
    this.distance = CFG.INITIAL_DISTANCE;

    this._targetYaw      = this.yaw;
    this._targetPitch    = this.pitch;
    this._targetDistance = this.distance;

    // Collision-adjusted distance (smoothed separately from zoom)
    this._effectiveDistance = this.distance;

    this.pivotOffset    = new THREE.Vector3(0, CFG.PIVOT_HEIGHT, 0);
    this.shoulderOffset = CFG.SHOULDER_OFFSET;

    this._currentPos    = new THREE.Vector3();
    this._currentLookAt = new THREE.Vector3();
    this._pivotWorld    = new THREE.Vector3();
    this._initialized   = false;
    this._isDragging    = false;
    this._isMoving      = false;
    this._frameCount    = 0;  // Skip collision for first few frames (spawn safety)

    this._raycaster       = new THREE.Raycaster();
    this._collisionMeshes = [];

    this._tabNudge    = 0;
    this._tabNudgeDir = 0;

    this._setupInput();
  }

  // ── Public API ───────────────────────────────────────────────────

  setTarget(target) {
    this.target       = target;
    this._initialized = false;
    this._frameCount  = 0;
  }

  getYaw()        { return this.yaw; }
  get isDragging() { return this._isDragging; }
  setPlayerMoving(moving) { this._isMoving = moving; }

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

  // ── Input ───────────────────────────────────────────────────────

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
      this._targetYaw   -= e.movementX * CFG.ORBIT_SENSITIVITY_X;
      this._targetPitch += e.movementY * CFG.ORBIT_SENSITIVITY_Y;
      this._targetPitch  = Math.max(CFG.PITCH_MIN, Math.min(CFG.PITCH_MAX, this._targetPitch));
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const d = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 30) * 0.01;
      this._targetDistance *= 1.0 + d * CFG.ZOOM_SENSITIVITY;
      this._targetDistance  = Math.max(CFG.ZOOM_MIN, Math.min(CFG.ZOOM_MAX, this._targetDistance));
    }, { passive: false });

    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ── Single-ray collision ───────────────────────────────────────

  /**
   * Cast a single ray from pivot → desired camera pos.
   * Returns the safe distance (hit distance minus skin),
   * or Infinity if nothing was hit.
   */
  _raycastCollision(pivot, desiredPos) {
    if (this._collisionMeshes.length === 0) return Infinity;

    const dir = desiredPos.clone().sub(pivot);
    const maxDist = dir.length();
    if (maxDist < 0.05) return Infinity;
    dir.normalize();

    this._raycaster.set(pivot, dir);
    this._raycaster.far = maxDist;
    this._raycaster.near = 0;

    const hits = this._raycaster.intersectObjects(this._collisionMeshes, true);
    if (hits.length > 0 && hits[0].distance < maxDist) {
      return Math.max(0, hits[0].distance - CFG.COLLISION_SKIN);
    }
    return Infinity;
  }

  // ── Per-frame update ─────────────────────────────────────────────

  update(delta) {
    if (!this.target) return;
    this._frameCount++;

    // ── 1. Passive follow-behind ────────────────────────────────
    if (!this._isDragging) {
      const behindYaw = this.target.rotation.y + Math.PI;
      let diff = behindYaw - this._targetYaw;
      while (diff >  Math.PI) diff -= PI2;
      while (diff < -Math.PI) diff += PI2;
      if (Math.abs(diff) > CFG.PASSIVE_FOLLOW_THRESHOLD) {
        const speed = this._isMoving ? CFG.PASSIVE_FOLLOW_MOVING : CFG.PASSIVE_FOLLOW_IDLE;
        this._targetYaw += diff * (1 - Math.exp(-speed * delta));
      }
    }

    // ── 2. Tab nudge ───────────────────────────────────────────
    if (this._tabNudge > 0.001) {
      this._targetYaw += this._tabNudgeDir * this._tabNudge * delta * TAB_NUDGE_SPEED;
      this._tabNudge  *= Math.max(0, 1 - TAB_NUDGE_SPEED * delta);
    }

    // ── 3. Smooth toward target orbit ─────────────────────────────
    const st = 1 - Math.exp(-CFG.FOLLOW_SPEED * delta);
    let yd = this._targetYaw - this.yaw;
    while (yd >  Math.PI) yd -= PI2;
    while (yd < -Math.PI) yd += PI2;
    this.yaw      += yd * st;
    this.pitch    += (this._targetPitch    - this.pitch)    * st;
    this.distance += (this._targetDistance - this.distance) * st;

    // ── 4. Pivot (character head position) ───────────────────────
    this._pivotWorld.copy(this.target.position).add(this.pivotOffset);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw),   sy = Math.sin(this.yaw);

    // ── 5. Desired camera position (spherical) ──────────────────
    const desiredPos = new THREE.Vector3(
      this._pivotWorld.x - sy * cp * this.distance + cy * this.shoulderOffset,
      this._pivotWorld.y + sp * this.distance,
      this._pivotWorld.z - cy * cp * this.distance - sy * this.shoulderOffset,
    );
    desiredPos.y = Math.max(CFG.CAMERA_MIN_HEIGHT, Math.min(CFG.CAMERA_MAX_HEIGHT, desiredPos.y));

    // ── 6. Collision — single ray, skip first 10 frames at spawn ──
    let collisionDist = Infinity;
    if (this._frameCount > 10) {
      collisionDist = this._raycastCollision(this._pivotWorld, desiredPos);
    }
    const safeDist   = Math.max(CFG.COLLISION_MIN_DIST, Math.min(this.distance, collisionDist));
    const isCloser   = safeDist < this._effectiveDistance;
    const colSpeed   = isCloser ? CFG.COLLISION_PULL_IN : CFG.COLLISION_PUSH_OUT;
    this._effectiveDistance += (safeDist - this._effectiveDistance) * (1 - Math.exp(-colSpeed * delta));
    this._effectiveDistance  = Math.max(CFG.COLLISION_MIN_DIST, this._effectiveDistance);

    // ── 7. Final camera position using effective distance ────────
    const ed = this._effectiveDistance;
    const finalPos = new THREE.Vector3(
      this._pivotWorld.x - sy * cp * ed + cy * this.shoulderOffset,
      this._pivotWorld.y + sp * ed,
      this._pivotWorld.z - cy * cp * ed - sy * this.shoulderOffset,
    );
    finalPos.y = Math.max(CFG.CAMERA_MIN_HEIGHT, Math.min(CFG.CAMERA_MAX_HEIGHT, finalPos.y));

    // ── 8. Look-at: character pivot with slight forward bias at close zoom
    const bias = Math.max(0, 1.0 - ed / 8) * 0.3;
    const lookAt = this._pivotWorld.clone().addScaledVector(
      new THREE.Vector3(-sy, 0, -cy), bias,
    );

    // ── 9. Apply ───────────────────────────────────────────────
    if (!this._initialized) {
      this._currentPos.copy(finalPos);
      this._currentLookAt.copy(lookAt);
      this._effectiveDistance = this.distance; // No collision adjustment on first frame
      this._initialized = true;
    } else {
      const ps = isCloser ? CFG.COLLISION_PULL_IN : CFG.FOLLOW_SPEED;
      this._currentPos.lerp(finalPos, 1 - Math.exp(-ps * delta));
      this._currentLookAt.lerp(lookAt, 1 - Math.exp(-CFG.FOLLOW_SPEED * delta));
    }

    this.camera.position.copy(this._currentPos);
    this.camera.lookAt(this._currentLookAt);
  }
}
