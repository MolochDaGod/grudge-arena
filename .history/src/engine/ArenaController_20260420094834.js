/**
 * ArenaController — Player input controller for arena combat
 *
 * Bridges game.js mesh-based units with the XState CharacterFSM.
 * Works with AnimationController (from modelLoader) instead of GrudgeCharacter.
 *
 * Features:
 *   - Camera-relative WASD movement (W = forward from camera)
 *   - Smooth rotation interpolation (no snapping)
 *   - Acceleration / deceleration curves
 *   - holdKey / tickKey pattern (annihilate)
 *   - Double-tap WASD directional dodge
 *   - FSM-driven state transitions (attack, dash, block, skill, jump)
 *   - Animation coordination via FSM entry actions
 *
 * Requires:
 *   - mesh: THREE.Object3D (the character scene root)
 *   - animCtrl: AnimationController (from modelLoader.js)
 *   - camera: OrbitCamera (for yaw reference)
 *   - onAttack/onAbility callbacks wired by game.js
 */

import * as THREE from 'three';
import { createCharacterFSM } from './CharacterFSM.js';

// ── Constants ────────────────────────────────────────────────────

const MOVE_SPEED = 5.5;         // Base units/sec
const SPRINT_MULTIPLIER = 1.6;
const ACCEL_RATE = 25;          // Units/sec² to reach full speed
const DECEL_RATE = 20;          // Units/sec² to stop
const TURN_SPEED = 12;          // Radians/sec for smooth rotation
const ARENA_RADIUS = 35;        // Position clamp

const DOUBLE_TAP_WINDOW = 280;  // ms
const DOUBLE_TAP_COOLDOWN = 0.5;// seconds
const DASH_SPEED = 14;          // Units/sec burst
const DASH_DISTANCE = 5;        // How far a dash moves

export class ArenaController {
  /**
   * @param {THREE.Object3D} mesh
   * @param {import('./modelLoader.js').AnimationController} animCtrl
   * @param {import('./OrbitCamera.js').OrbitCamera} orbitCamera
   */
  constructor(mesh, animCtrl, orbitCamera) {
    this.mesh = mesh;
    this.animCtrl = animCtrl;
    this.camera = orbitCamera;

    // Movement state
    this.velocity = new THREE.Vector2(0, 0);  // Current XZ velocity
    this.targetYaw = mesh.rotation.y;         // Desired facing angle
    this.currentSpeed = 0;                    // Scalar speed (for accel/decel)

    // Input state (holdKey = continuous, tickKey = one-shot per press)
    this.holdKey = {};
    this.tickKey = {};

    // Double-tap dodge tracking
    this._lastTapTime = {};
    this._doubleTapCooldown = 0;

    // FSM bridge — create a lightweight char-like interface for CharacterFSM
    this._fsmChar = this._createFSMBridge();
    this._fsmService = createCharacterFSM(this._fsmChar);
    this._activeSkill = 0;

    // Callbacks set by game.js
    this.onAttack = null;    // (type: number|string) => void
    this.onAbility = null;   // (skillIndex: number) => void
    this.onDash = null;      // () => void

    this._setupListeners();
  }

  /** Is the FSM in a state tagged 'canMove'? */
  get canMove() {
    const snap = this._fsmService.getSnapshot();
    return snap.hasTag('canMove') || snap.matches('idle');
  }

  /** Is the FSM in a state tagged 'canDamage'? */
  get canDamage() {
    return this._fsmService.getSnapshot().hasTag('canDamage');
  }

  /** Current FSM state name */
  get stateName() {
    const v = this._fsmService.getSnapshot().value;
    return typeof v === 'string' ? v : JSON.stringify(v);
  }

  /** Facing direction as a unit Vector3 (XZ plane) */
  getForward() {
    return new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.mesh.rotation.y);
  }

  // ── FSM Bridge ─────────────────────────────────────────────────

  /**
   * CharacterFSM expects a `char` object with:
   *   fadeToAction(name, dur), oaction, body, facing, mesh, onAttack, onDash, etc.
   * We bridge the AnimationController's interface to match.
   */
  _createFSMBridge() {
    const self = this;
    return {
      get mesh() { return self.mesh; },
      get oaction() {
        // Convert AnimationController's Map to a plain object-like accessor
        const proxy = {};
        if (self.animCtrl?.actions) {
          for (const [k, v] of self.animCtrl.actions) proxy[k] = v;
        }
        return proxy;
      },
      // FSM uses body?.jump / body?.dash — we simulate with mesh position movement
      body: {
        isAir: false,
        jump: () => { /* no physics jump yet — placeholder */ },
        dash: (fx, fz, speed) => {
          // Instant position dash along facing
          const len = Math.sqrt(fx * fx + fz * fz) || 1;
          self.mesh.position.x += (fx / len) * DASH_DISTANCE;
          self.mesh.position.z += (fz / len) * DASH_DISTANCE;
          self._clampPosition();
        },
        checkGrounded: () => true,
      },
      facing: new THREE.Vector2(0, -1),
      direction: new THREE.Vector2(),
      _fsmService: null, // Set by createCharacterFSM
      _activeSkill: 0,

      fadeToAction: (name, duration) => {
        if (duration === 0) {
          self.animCtrl.playOnce(name, 1.0);
        } else {
          self.animCtrl.play(name, { fadeDuration: duration ?? 0.15 });
        }
      },

      // Callbacks — routed through to game.js
      get onAttack() { return self.onAttack; },
      get onSkill() { return () => self.onAbility?.(self._activeSkill); },
      get onDash() { return self.onDash; },
      get onHit() { return null; },
      get onDeath() { return null; },
    };
  }

  // ── Input Listeners ────────────────────────────────────────────

  _setupListeners() {
    window.addEventListener('keydown', (e) => {
      if (this.holdKey[e.code]) return; // Prevent repeat
      this.holdKey[e.code] = true;
      this.tickKey[e.code] = true;

      // Double-tap dodge detection
      const dirKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
      if (dirKeys.includes(e.code) && this._doubleTapCooldown <= 0) {
        const now = performance.now();
        const last = this._lastTapTime[e.code] || 0;
        if (now - last < DOUBLE_TAP_WINDOW) {
          this._fireDodge(e.code);
          this._lastTapTime[e.code] = 0;
          this._doubleTapCooldown = DOUBLE_TAP_COOLDOWN;
        } else {
          this._lastTapTime[e.code] = now;
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.holdKey[e.code] = false;
      // Block release
      if (e.code === 'KeyQ') {
        this._fsmService.send('blockRelease');
      }
    });

    // RMB = attack (LMB is camera orbit, handled by OrbitCamera)
    window.addEventListener('mousedown', (e) => {
      if (e.button === 2) this.tickKey._RMB = true;
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ── Per-frame Update ───────────────────────────────────────────

  update(delta) {
    const fsm = this._fsmService;
    this._doubleTapCooldown = Math.max(0, this._doubleTapCooldown - delta);

    // ── Process tick keys (one-shot actions) ──
    // RMB → toggle auto-attack (WoW-style). Swing anims are driven by
    // game.js _performAttack inside the auto-attack loop, so we don't
    // dispatch the FSM 'attack' event here.
    if (this.tickKey._RMB) {
      this.onAttack?.("toggle");
    } else if (this.tickKey.Space) {
      fsm.send("jump");
    } else if (this.tickKey.ControlLeft || this.tickKey.ControlRight) {
      fsm.send("dash");
    } else if (this.tickKey.KeyQ) {
      fsm.send("block");
    } else if (this.tickKey.Digit1 || this.tickKey.Numpad1) {
      this._activeSkill = 1;
      fsm.send("skill");
    } else if (this.tickKey.Digit2 || this.tickKey.Numpad2) {
      this._activeSkill = 2;
      fsm.send("skill");
    } else if (this.tickKey.Digit3 || this.tickKey.Numpad3) {
      this._activeSkill = 3;
      fsm.send("skill");
    } else if (this.tickKey.Digit4 || this.tickKey.Numpad4) {
      this._activeSkill = 4;
      fsm.send("skill");
    } else if (this.tickKey.Digit5 || this.tickKey.Numpad5) {
      this._activeSkill = 5;
      fsm.send("skill");
    }
    this.tickKey = {};

    // ── Build input direction from held keys ──
    let ix = 0,
      iz = 0;
    if (this.holdKey.KeyW || this.holdKey.ArrowUp) iz -= 1;
    if (this.holdKey.KeyS || this.holdKey.ArrowDown) iz += 1;
    if (this.holdKey.KeyA || this.holdKey.ArrowLeft) ix -= 1;
    if (this.holdKey.KeyD || this.holdKey.ArrowRight) ix += 1;

    const hasInput = ix !== 0 || iz !== 0;
    const isSprint = this.holdKey.ShiftLeft || this.holdKey.ShiftRight;
    const maxSpeed = isSprint ? MOVE_SPEED * SPRINT_MULTIPLIER : MOVE_SPEED;

    // ── Camera-relative direction ──
    let worldDirX = 0,
      worldDirZ = 0;
    if (hasInput) {
      const len = Math.sqrt(ix * ix + iz * iz);
      ix /= len;
      iz /= len;
      const yaw = this.camera.getYaw();
      const cos = Math.cos(yaw),
        sin = Math.sin(yaw);
      worldDirX = ix * cos - iz * sin;
      worldDirZ = ix * sin + iz * cos;
    }

    // ── Movement (only when FSM allows) ──
    // Only dispatch 'run'/'stop' when the FSM is in idle/run (not mid-attack,
    // mid-jump, etc.) AND only on state-change boundaries to avoid spamming
    // XState with events it won't act on anyway.
    const fsmValue = fsm.getSnapshot().value;

    if (this.canMove) {
      if (hasInput) {
        // Accelerate
        this.currentSpeed = Math.min(
          maxSpeed,
          this.currentSpeed + ACCEL_RATE * delta,
        );

        // Compute target facing angle from movement direction
        this.targetYaw = Math.atan2(worldDirX, worldDirZ);

        // Move mesh
        this.mesh.position.x += worldDirX * this.currentSpeed * delta;
        this.mesh.position.z += worldDirZ * this.currentSpeed * delta;
        this._clampPosition();

        // Update FSM bridge facing
        this._fsmChar.facing.set(worldDirX, worldDirZ);

        // Only enter 'run' state from idle — avoids flooding XState
        if (fsmValue === "idle") fsm.send("run");
      } else {
        // Decelerate
        this.currentSpeed = Math.max(0, this.currentSpeed - DECEL_RATE * delta);
        if (this.currentSpeed < 0.01) {
          this.currentSpeed = 0;
          if (fsmValue === "run") fsm.send("stop");
        }
      }
    } else {
      // Not in a movable state — decelerate to 0
      this.currentSpeed = Math.max(0, this.currentSpeed - DECEL_RATE * delta);
    }

    // ── Smooth rotation ──
    // Lerp mesh.rotation.y toward targetYaw
    let diff = this.targetYaw - this.mesh.rotation.y;
    // Wrap to [-PI, PI]
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const rotStep = TURN_SPEED * delta;
    if (Math.abs(diff) < rotStep) {
      this.mesh.rotation.y = this.targetYaw;
    } else {
      this.mesh.rotation.y += Math.sign(diff) * rotStep;
    }
    // Normalize rotation.y to [-PI, PI]
    while (this.mesh.rotation.y > Math.PI) this.mesh.rotation.y -= Math.PI * 2;
    while (this.mesh.rotation.y < -Math.PI) this.mesh.rotation.y += Math.PI * 2;

    // ── Animation mixer update is handled by game.js loop via animCtrl.update(delta) ──
  }

  // ── Double-tap Dodge ───────────────────────────────────────────

  _fireDodge(keyCode) {
    const yaw = this.camera.getYaw();
    let dx = 0, dz = 0;
    switch (keyCode) {
      case 'KeyW': dz = -1; break;
      case 'KeyS': dz = 1;  break;
      case 'KeyA': dx = -1; break;
      case 'KeyD': dx = 1;  break;
    }
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const worldX = dx * cos - dz * sin;
    const worldZ = dx * sin + dz * cos;

    // Face dodge direction
    this.targetYaw = Math.atan2(worldX, worldZ);
    this.mesh.rotation.y = this.targetYaw; // Snap for dodge (instant)

    this._fsmChar.facing.set(worldX, worldZ);
    this._fsmService.send('dash');
    this.onDash?.();
  }

  // ── Helpers ────────────────────────────────────────────────────

  _clampPosition() {
    this.mesh.position.x = Math.max(-ARENA_RADIUS, Math.min(ARENA_RADIUS, this.mesh.position.x));
    this.mesh.position.z = Math.max(-ARENA_RADIUS, Math.min(ARENA_RADIUS, this.mesh.position.z));
  }

  /** Send an FSM event from outside (e.g. game.js combat system) */
  send(event) {
    this._fsmService.send(event);
  }

  dispose() {
    this._fsmService.stop();
  }
}
