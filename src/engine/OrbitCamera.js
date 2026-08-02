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
import { recoil, applyCameraShake } from './CameraRecoil.js';
import { getCharacterCameraPivot, hasCharacterRig } from '../characterScale.js';
import { filterCameraCollisionMeshes } from './cameraCollision.js';

const PI2 = Math.PI * 2;

// ── WoW-style camera tuning ─────────────────────────────────
const CFG = {
  INITIAL_YAW:       0,
  INITIAL_PITCH:     0.38,    // Aligned with character creator orbit
  INITIAL_DISTANCE:  5.5,     // Creator-style third-person framing

  ZOOM_MIN:          2.5,
  ZOOM_MAX:          14,
  ZOOM_SENSITIVITY:  0.08,

  PITCH_MIN:        -0.45,
  PITCH_MAX:         1.35,

  ORBIT_SENSITIVITY_X: 0.002,
  ORBIT_SENSITIVITY_Y: 0.002,

  PIVOT_HEIGHT:      1.0,     // Creator targets y≈1 on humanoid
  SHOULDER_OFFSET:   0.2,

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

  // Combat / ADS (dangerroom.puter.site CameraRig)
  HIP_FOV:             50,
  ADS_FOV:             38,
  ADS_DIST_SCALE:      0.72,
  ADS_MIN_DIST:        2.2,
  HIP_SHOULDER:        0.2,
  ADS_SHOULDER:        0.55,
  CAM_POS_SMOOTH:      15,
  CAM_LOOK_SMOOTH:     18,

  // Island sandbox / Fortnite TPS (CameraRig + probe RTS Player)
  TPS_INITIAL_YAW:       Math.PI,
  TPS_INITIAL_PITCH:     0.38,
  TPS_INITIAL_DISTANCE:  5.5,
  TPS_ZOOM_MIN:          2.0,
  TPS_ZOOM_MAX:          10.0,
  TPS_HIP_FOV:           55,
  TPS_ORBIT_SENS_X:      0.0028,
  TPS_ORBIT_SENS_Y:      0.0022,
  TPS_PITCH_MIN:        -1.2,
  TPS_PITCH_MAX:         0.6,
  TPS_PIVOT_HEIGHT:      1.62,
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

    this._aiming = false;
    this._assistYaw = null;
    this._assistPitch = null;
    this._assistRate = 0;
    this._currentFov = CFG.HIP_FOV;
    /** @type {'wow'|'tps'} */
    this.controlMode = 'wow';
    this._rmbDragging = false;

    this._setupInput();
  }

  /** Switch camera control scheme — `tps` for island combat sandbox. */
  setControlMode(mode) {
    const next = mode === 'tps' ? 'tps' : 'wow';
    if (next === this.controlMode) return;
    this.controlMode = next;
    if (next === 'tps') {
      this.yaw = CFG.TPS_INITIAL_YAW;
      this.pitch = CFG.TPS_INITIAL_PITCH;
      this.distance = CFG.TPS_INITIAL_DISTANCE;
      this._targetYaw = this.yaw;
      this._targetPitch = this.pitch;
      this._targetDistance = this.distance;
      this._effectiveDistance = this.distance;
      this.pivotOffset.y = CFG.TPS_PIVOT_HEIGHT;
      this._currentFov = CFG.TPS_HIP_FOV;
      if (this.camera?.isPerspectiveCamera) {
        this.camera.fov = CFG.TPS_HIP_FOV;
        this.camera.updateProjectionMatrix();
      }
    } else {
      this.pivotOffset.y = CFG.PIVOT_HEIGHT;
      this._currentFov = CFG.HIP_FOV;
    }
    this._initialized = false;
    this._frameCount = 0;
  }

  /** RMB hold / attack — pull in over shoulder, tighten FOV. */
  setAiming(aiming) {
    this._aiming = !!aiming;
  }

  /**
   * Tab hard-lock camera assist — gently orbit toward locked target.
   * @param {number|null} yaw
   * @param {number|null} pitch
   * @param {number} rate
   */
  setCameraAssist(yaw, pitch, rate) {
    this._assistYaw = yaw;
    this._assistPitch = pitch;
    this._assistRate = rate || 0;
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
    this._collisionMeshes = filterCameraCollisionMeshes(meshes || []);
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
    // D1 rigs face +X at yaw 0; TPS spawn uses ±π/2 — camera sits opposite forward (+π/2).
    const behind =
      this.controlMode === 'tps'
        ? this.target.rotation.y + Math.PI * 0.5
        : this.target.rotation.y + Math.PI;
    this.yaw = behind;
    this._targetYaw = this.yaw;
  }

  // ── Input ───────────────────────────────────────────────────────

  _setupInput() {
    const el = this.domElement;

    el.addEventListener('mousedown', (e) => {
      if (this.controlMode === 'tps') {
        if (e.button === 2) this._rmbDragging = true;
      } else if (e.button === 0) {
        this._isDragging = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._isDragging = false;
      if (e.button === 2) this._rmbDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      const dragging = this.controlMode === 'tps' ? this._rmbDragging : this._isDragging;
      if (!dragging) return;
      const sensX = this.controlMode === 'tps' ? CFG.TPS_ORBIT_SENS_X : CFG.ORBIT_SENSITIVITY_X;
      const sensY = this.controlMode === 'tps' ? CFG.TPS_ORBIT_SENS_Y : CFG.ORBIT_SENSITIVITY_Y;
      const pMin = this.controlMode === 'tps' ? CFG.TPS_PITCH_MIN : CFG.PITCH_MIN;
      const pMax = this.controlMode === 'tps' ? CFG.TPS_PITCH_MAX : CFG.PITCH_MAX;
      this._targetYaw   -= e.movementX * sensX;
      this._targetPitch += e.movementY * sensY;
      this._targetPitch  = Math.max(pMin, Math.min(pMax, this._targetPitch));
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const d = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 30) * 0.01;
      const zMin = this.controlMode === 'tps' ? CFG.TPS_ZOOM_MIN : CFG.ZOOM_MIN;
      const zMax = this.controlMode === 'tps' ? CFG.TPS_ZOOM_MAX : CFG.ZOOM_MAX;
      this._targetDistance *= 1.0 + d * CFG.ZOOM_SENSITIVITY;
      this._targetDistance  = Math.max(zMin, Math.min(zMax, this._targetDistance));
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

    // ── 1. Passive follow-behind (WoW only — TPS keeps independent camera yaw) ──
    const orbitDragging = this.controlMode === 'tps' ? this._rmbDragging : this._isDragging;
    if (this.controlMode !== 'tps' && !orbitDragging) {
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

    // ── 2b. Hard-lock camera assist (soft-lock tab target) ────────
    if (this._assistRate > 0 && this._assistYaw != null && this._assistPitch != null) {
      const k = 1 - Math.exp(-this._assistRate * delta);
      let yd = this._assistYaw - this._targetYaw;
      while (yd >  Math.PI) yd -= PI2;
      while (yd < -Math.PI) yd += PI2;
      this._targetYaw += yd * k;
      this._targetPitch += (this._assistPitch - this._targetPitch) * k;
      const pMin = this.controlMode === 'tps' ? CFG.TPS_PITCH_MIN : CFG.PITCH_MIN;
      const pMax = this.controlMode === 'tps' ? CFG.TPS_PITCH_MAX : CFG.PITCH_MAX;
      this._targetPitch = Math.max(pMin, Math.min(pMax, this._targetPitch));
    }

    // ── 3. Smooth toward target orbit ─────────────────────────────
    const st = 1 - Math.exp(-CFG.FOLLOW_SPEED * delta);
    let yd = this._targetYaw - this.yaw;
    while (yd >  Math.PI) yd -= PI2;
    while (yd < -Math.PI) yd += PI2;
    this.yaw      += yd * st;
    this.pitch    += (this._targetPitch    - this.pitch)    * st;
    this.distance += (this._targetDistance - this.distance) * st;

    // ── 4. Pivot (chest on live rig — not decoy armature / scene origin) ──
    if (hasCharacterRig(this.target)) {
      getCharacterCameraPivot(this.target, this._pivotWorld);
    } else {
      this._pivotWorld.copy(this.target.position).add(this.pivotOffset);
    }

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw),   sy = Math.sin(this.yaw);

    // ── 5. Desired camera position (spherical) — ADS pulls in + shoulder ──
    const aimDist = this._aiming
      ? Math.max(CFG.ADS_MIN_DIST, this.distance * CFG.ADS_DIST_SCALE)
      : this.distance;
    const shoulder = this._aiming ? CFG.ADS_SHOULDER : CFG.HIP_SHOULDER;
    const desiredPos = new THREE.Vector3(
      this._pivotWorld.x - sy * cp * aimDist + cy * shoulder,
      this._pivotWorld.y + sp * aimDist,
      this._pivotWorld.z - cy * cp * aimDist - sy * shoulder,
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
      this._pivotWorld.x - sy * cp * ed + cy * shoulder,
      this._pivotWorld.y + sp * ed,
      this._pivotWorld.z - cy * cp * ed - sy * shoulder,
    );
    finalPos.y = Math.max(CFG.CAMERA_MIN_HEIGHT, Math.min(CFG.CAMERA_MAX_HEIGHT, finalPos.y));

    // ── 8. Look-at: character pivot with slight forward bias at close zoom
    const bias = Math.max(0, 1.0 - ed / 8) * 0.3;
    const lookAt = this._pivotWorld.clone().addScaledVector(
      new THREE.Vector3(-sy, 0, -cy), bias,
    );

    // Recoil kick — nudge look target (danger room CameraRig parity)
    if (Math.abs(recoil.camPitch) > 1e-6 || Math.abs(recoil.camYaw) > 1e-6) {
      lookAt.y += recoil.camPitch * ed;
      lookAt.x += cy * recoil.camYaw * ed;
      lookAt.z -= sy * recoil.camYaw * ed;
    }

    // ── 9. Apply ───────────────────────────────────────────────
    if (!this._initialized) {
      this._currentPos.copy(finalPos);
      this._currentLookAt.copy(lookAt);
      this._effectiveDistance = this.distance; // No collision adjustment on first frame
      this._initialized = true;
    } else {
      const posK = 1 - Math.exp(-(isCloser ? CFG.COLLISION_PULL_IN : CFG.CAM_POS_SMOOTH) * delta);
      const lookK = 1 - Math.exp(-CFG.CAM_LOOK_SMOOTH * delta);
      this._currentPos.lerp(finalPos, posK);
      this._currentLookAt.lerp(lookAt, lookK);
    }

    this.camera.position.copy(this._currentPos);
    this.camera.lookAt(this._currentLookAt);
    applyCameraShake(this.camera, delta);

    // ADS FOV zoom
    if (this.camera.isPerspectiveCamera) {
      const hipFov = this.controlMode === 'tps' ? CFG.TPS_HIP_FOV : CFG.HIP_FOV;
      const wantFov = this._aiming ? CFG.ADS_FOV : hipFov;
      this._currentFov += (wantFov - this._currentFov) * (1 - Math.exp(-10 * delta));
      if (Math.abs(this.camera.fov - this._currentFov) > 0.05) {
        this.camera.fov = this._currentFov;
        this.camera.updateProjectionMatrix();
      }
    }
  }
}
