/**
 * ArenaController — Player input controller for arena combat (MMO-style)
 *
 * Bridges game.js mesh-based units with the XState CharacterFSM.
 * Works with AnimationController (from modelLoader).
 *
 * Controls (WoW / MMO style):
 *   W/S   = move forward / backward (always camera-relative, Fortnite style)
 *   A/D   = turn character left / right (camera follows behind aggressively)
 *   Q/E   = strafe left / right (camera-relative, no rotation)
 *   Shift = sprint
 *   Space = jump
 *   Ctrl  = dash/roll
 *   V     = block (hold)
 *   RMB   = toggle auto-attack
 *   1-4   = skill slots (Q/E/R/F in combat, mapped to ability bar)
 *   5     = empty / reserved (no action)
 *   6-8   = consumable / on-use relic slots
 *   Tab   = cycle next enemy target (WoW-style)
 *
 * Features:
 *   - Camera-relative W/S + Q/E movement
 *   - A/D keyboard turning with smooth interpolation
 *   - Acceleration / deceleration curves
 *   - holdKey / tickKey pattern (annihilate)
 *   - Double-tap W/S directional dodge
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
import { ARENA_CLAMP_RADIUS } from './ProceduralArena.js';
import {
  DirLocoBlend,
  computeGaitTarget,
  resolveLocoDir,
  defaultLocoClip,
} from './DirLocoBlend.js';
import { moveDir, lerpAngle } from './tpsMath.js';
import { TerrainLocoFeedback } from './TerrainLocoFeedback.js';

// ── Constants ────────────────────────────────

const MOVE_SPEED = 5.5;         // Base units/sec
const SPRINT_MULTIPLIER = 1.6;
const ACCEL_RATE = 25;          // Units/sec² to reach full speed
const DECEL_RATE = 20;          // Units/sec² to stop
const TURN_SPEED = 12;          // Radians/sec for smooth mesh rotation lerp
const KB_TURN_SPEED = 3.0;      // Radians/sec for A/D keyboard turning
const ARENA_RADIUS = ARENA_CLAMP_RADIUS; // Position clamp — tied to ProceduralArena

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
    this.onAttack  = null;   // (type: number|string) => void
    this.onAbility = null;   // (slotKey: string) => void  — 'Q'/'E'/'R'/'F' (skills) or '6'/'7'/'8' (consumables)
    this.onDash    = null;   // () => void
    this.onTarget  = null;   // () => void — Tab: cycle next enemy target (WoW-style)

    /** Optional override for danger room / custom arenas (defaults to ProceduralArena radius). */
    this.clampRadius = null;

    /** `tps` = island sandbox (W/S/A/D move, RMB orbit); `wow` = MMO default. */
    this.controlScheme = 'wow';
    /** Raycast terrain snap — set by danger room bootstrap. */
    this.groundSampler = null;
    this._terrainLoco = null;
    this._prevYaw = mesh.rotation.y;

    /** Baked Bip001 gait (AnimationDirector) — danger room Grudge6 pipeline. */
    this.useBakedLoco = !!animCtrl?.useBakedLoco;
    /** Directional gait blend (legacy GLB/FBX packs). */
    this.useDirLoco = !this.useBakedLoco;
    this._locoBlend = null;
    if (!this.useBakedLoco && animCtrl?.actions) {
      this._locoBlend = new DirLocoBlend((key) => animCtrl.actions.get(key) || null);
    }

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

      // Double-tap dodge detection (W/S only — A/D are turn keys in MMO mode)
      const dodgeKeys = ['KeyW', 'KeyS'];
      if (dodgeKeys.includes(e.code) && this._doubleTapCooldown <= 0) {
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
      // Block release (V key)
      if (e.code === 'KeyV') {
        this._fsmService.send({ type: 'blockRelease' });
      }
    });

    // RMB hold = strafe mode (WoW standard: A/D become strafe, character faces camera)
    // RMB click (tap) = toggle auto-attack
    window.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        this.holdKey._RMB = true;
        this._rmbDownTime = performance.now();
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        this.holdKey._RMB = false;
        // Short click = auto-attack toggle; long hold = strafe only
        if (performance.now() - (this._rmbDownTime || 0) < 200) {
          this.tickKey._RMB = true;
        }
      }
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ── Per-frame Update ───────────────────────────────────────────

  update(delta) {
    const fsm = this._fsmService;
    this._doubleTapCooldown = Math.max(0, this._doubleTapCooldown - delta);

    // ── Process tick keys (one-shot actions) ──
    //
    // Hotbar layout (matches game.js ability bar + user rule):
    //   Slots 1-4  = skill abilities  (keys Q / E / R / F or Digit1-4)
    //   Slot  5    = EMPTY  (no action — reserved / visual separator)
    //   Slots 6-8  = consumables / on-use relics  (Digit6-8)
    //
    // RMB → toggle auto-attack (WoW-style).
    // Tab → cycle to next enemy target (WoW-style).

    if (this.tickKey._RMB) {
      this.onAttack?.("toggle");
    }

    // Tab: cycle target
    if (this.tickKey.Tab) {
      this.onTarget?.();
    }

    if (this.tickKey.Space) {
      fsm.send({ type: "jump" });
    } else if (this.tickKey.ControlLeft || this.tickKey.ControlRight) {
      fsm.send({ type: "dash" });
    } else if (this.tickKey.KeyV) {
      fsm.send({ type: "block" });
    }

    // ─ Skill slots 1-4 (Digit1-4 OR Numpad1-4) ─
    if (this.tickKey.Digit1 || this.tickKey.Numpad1) {
      this._activeSkill = 1; this._fireSkill('Q');
    } else if (this.tickKey.Digit2 || this.tickKey.Numpad2) {
      this._activeSkill = 2; this._fireSkill('E');
    } else if (this.tickKey.Digit3 || this.tickKey.Numpad3) {
      this._activeSkill = 3; this._fireSkill('R');
    } else if (this.tickKey.Digit4 || this.tickKey.Numpad4) {
      this._activeSkill = 4; this._fireSkill('F');
    }
    // Slot 5 = empty (intentional no-op)

    // ─ Consumable slots 6-8 (Digit6-8 OR Numpad6-8) ─
    if (this.tickKey.Digit6 || this.tickKey.Numpad6) {
      this.onAbility?.('6');
    } else if (this.tickKey.Digit7 || this.tickKey.Numpad7) {
      this.onAbility?.('7');
    } else if (this.tickKey.Digit8 || this.tickKey.Numpad8) {
      this.onAbility?.('8');
    }

    this.tickKey = {};

    const rmbHeld = !!this.holdKey._RMB;
    const pressA  = this.holdKey.KeyA || this.holdKey.ArrowLeft;
    const pressD  = this.holdKey.KeyD || this.holdKey.ArrowRight;
    const isTps = this.controlScheme === 'tps';

    if (!isTps) {
      // ── A/D behaviour depends on RMB (WoW standard) ──
      if (!rmbHeld && this.canMove && (pressA || pressD)) {
        const turnDir = (pressA ? 1 : 0) - (pressD ? 1 : 0);
        this.targetYaw += turnDir * KB_TURN_SPEED * delta;
        while (this.targetYaw > Math.PI) this.targetYaw -= Math.PI * 2;
        while (this.targetYaw < -Math.PI) this.targetYaw += Math.PI * 2;
      }
      if (rmbHeld && this.canMove) {
        this.targetYaw = this.camera.getYaw() + Math.PI;
      }
    }

    // ── Build input direction from held keys ──
    let ix = 0;
    let iz = 0;
    let fwd = 0;
    let rgt = 0;

    if (isTps) {
      if (this.holdKey.KeyW || this.holdKey.ArrowUp) fwd += 1;
      if (this.holdKey.KeyS || this.holdKey.ArrowDown) fwd -= 1;
      if (this.holdKey.KeyD || this.holdKey.ArrowRight) rgt += 1;
      if (this.holdKey.KeyA || this.holdKey.ArrowLeft) rgt -= 1;
    } else {
      if (this.holdKey.KeyW || this.holdKey.ArrowUp) iz -= 1;
      if (this.holdKey.KeyS || this.holdKey.ArrowDown) iz += 1;
      if (this.holdKey.KeyQ) ix -= 1;
      if (this.holdKey.KeyE) ix += 1;
      if (rmbHeld && pressA) ix -= 1;
      if (rmbHeld && pressD) ix += 1;
    }

    const hasInput = isTps ? (fwd !== 0 || rgt !== 0) : (ix !== 0 || iz !== 0);
    const isSprint = this.holdKey.ShiftLeft || this.holdKey.ShiftRight;
    let maxSpeed = isSprint ? MOVE_SPEED * SPRINT_MULTIPLIER : MOVE_SPEED;

    let worldDirX = 0;
    let worldDirZ = 0;
    if (hasInput) {
      if (isTps) {
        const world = moveDir(rgt, fwd, this.camera.getYaw());
        const len = Math.hypot(world.x, world.z) || 1;
        worldDirX = world.x / len;
        worldDirZ = world.z / len;
        const flen = Math.hypot(fwd, rgt) || 1;
        ix = rgt / flen;
        iz = -fwd / flen;
      } else {
        const len = Math.sqrt(ix * ix + iz * iz);
        ix /= len;
        iz /= len;
        const yaw = this.camera.getYaw();
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        worldDirX = ix * cos - iz * sin;
        worldDirZ = ix * sin + iz * cos;
      }
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

        this.targetYaw = Math.atan2(worldDirX, worldDirZ);

        if (this.groundSampler) {
          const slopeMult = this._terrainLoco?.slopeSpeedMultiplier(worldDirX, worldDirZ) ?? 1;
          maxSpeed *= slopeMult;
          this.currentSpeed = Math.min(this.currentSpeed, maxSpeed);
        }

        this.mesh.position.x += worldDirX * this.currentSpeed * delta;
        this.mesh.position.z += worldDirZ * this.currentSpeed * delta;
        this._clampPosition();
        this._snapToGround();

        const speed01 = maxSpeed > 0 ? Math.min(1, this.currentSpeed / maxSpeed) : 0;
        const turnRate = (this.mesh.rotation.y - this._prevYaw) / Math.max(delta, 1e-4);
        this._terrainLoco?.afterMove(delta, {
          moving: true,
          worldDirX,
          worldDirZ,
          turnRate,
        });
        this._terrainLoco?.maybeDescendOverlay(true, speed01, worldDirX, worldDirZ);

        // Update FSM bridge facing
        this._fsmChar.facing.set(worldDirX, worldDirZ);

        if (!this._driveLocomotion(fsmValue, fsm, ix, iz, isSprint, maxSpeed, delta, hasInput)) {
          if (fsmValue === "idle") fsm.send({ type: "run" });
        }
      } else {
        // Decelerate
        this.currentSpeed = Math.max(0, this.currentSpeed - DECEL_RATE * delta);
        if (this.currentSpeed < 0.01) {
          this.currentSpeed = 0;
          if (!this._driveLocomotion(fsmValue, fsm, 0, 0, false, maxSpeed, delta, false)) {
            if (fsmValue === "run") fsm.send({ type: "stop" });
          }
        } else if (this.useBakedLoco || (this._locoBlend && this.useDirLoco)) {
          this._driveLocomotion(fsmValue, fsm, ix, iz, isSprint, maxSpeed, delta, false);
        }
      }
    } else {
      // Not in a movable state — decelerate to 0
      this.currentSpeed = Math.max(0, this.currentSpeed - DECEL_RATE * delta);
    }

    // ── Notify camera of movement + aim state ──
    const isActuallyMoving = isTps
      ? hasInput
      : (hasInput || (!rmbHeld && (pressA || pressD)));
    this.camera.setPlayerMoving?.(isActuallyMoving);
    this.camera.setAiming?.(rmbHeld);

    if (isTps && this.canMove && !hasInput) {
      this.targetYaw = lerpAngle(
        this.targetYaw,
        this.camera.getYaw(),
        Math.min(1, delta * 6),
      );
    }

    // ── Smooth rotation ──
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
    this._prevYaw = this.mesh.rotation.y;

    // ── Animation mixer update is handled by game.js loop via animCtrl.update(delta) ──
  }

  /** Wire island terrain sampler + anim-bank terrain overlays (combat sandbox). */
  setGroundSampler(sampler) {
    this.groundSampler = sampler;
    if (sampler && this.useBakedLoco) {
      this._terrainLoco = new TerrainLocoFeedback(this.mesh, sampler, this.animCtrl);
    } else {
      this._terrainLoco = null;
    }
  }

  /**
   * Locomotion driver — baked gait (Grudge6) or directional blend (legacy).
   * Returns true when locomotion was handled this frame.
   */
  _driveLocomotion(fsmValue, fsm, ix, iz, isSprint, maxSpeed, delta, hasInput) {
    if (this.useBakedLoco && this.animCtrl) {
      const movable = fsmValue === 'idle' || fsmValue === 'run';
      if (!movable) {
        this.animCtrl.setDirLocomotion?.(0, 0, 0, false, !!this.holdKey._RMB);
        return false;
      }
      const moving = hasInput || this.currentSpeed > 0.05;
      const speed01 = maxSpeed > 0 ? Math.min(1, this.currentSpeed / maxSpeed) : 0;
      const rmbHeld = !!this.holdKey._RMB;
      if (this.animCtrl.setDirLocomotion) {
        const yaw = this.mesh.rotation.y;
        const sin = Math.sin(yaw);
        const cos = Math.cos(yaw);
        let lx = 0;
        let lz = 0;
        if (hasInput) {
          const len = Math.sqrt(ix * ix + iz * iz) || 1;
          const camYaw = this.camera.getYaw();
          const c = Math.cos(camYaw);
          const s = Math.sin(camYaw);
          const wx = (ix / len) * c - (iz / len) * s;
          const wz = (ix / len) * s + (iz / len) * c;
          lx = wx * cos - wz * sin;
          lz = wx * sin + wz * cos;
        }
        this.animCtrl.setDirLocomotion(
          lx,
          lz,
          moving ? speed01 : 0,
          isSprint && moving,
          rmbHeld,
        );
      } else if (this.animCtrl.setGaitFromSpeed) {
        this.animCtrl.setGaitFromSpeed(moving ? speed01 : 0, isSprint && moving);
      } else {
        this.animCtrl.setGaitTarget?.(moving, isSprint && moving);
      }
      if (hasInput && fsmValue === 'idle') fsm.send({ type: 'run' });
      if (!hasInput && this.currentSpeed < 0.01 && fsmValue === 'run') fsm.send({ type: 'stop' });
      return true;
    }
    return this._driveDirLoco(fsmValue, fsm, ix, iz, isSprint, maxSpeed, delta);
  }

  /**
   * Directional locomotion blend — returns true when loco handled this frame.
   */
  _driveDirLoco(fsmValue, fsm, ix, iz, isSprint, maxSpeed, delta) {
    if (!this._locoBlend || !this.useDirLoco) return false;
    const movable = fsmValue === "idle" || fsmValue === "run";
    if (!movable) {
      this._locoBlend.setSingle("idle", 0.12);
      this._locoBlend.update(delta);
      return false;
    }

    const hasInput = ix !== 0 || iz !== 0;
    const dir = resolveLocoDir(ix, iz);
    const speed01 = maxSpeed > 0 ? this.currentSpeed / maxSpeed : 0;
    const gait = computeGaitTarget(speed01, isSprint, hasInput);
    const rmbHeld = !!this.holdKey._RMB;

    this._locoBlend.setBlend(dir, (band, d) => defaultLocoClip(band, d), 0.12);
    this._locoBlend.setGaitTarget(gait);
    this._locoBlend.setAiming(rmbHeld);
    this._locoBlend.update(delta);

    if (hasInput && fsmValue === "idle") fsm.send({ type: "run" });
    if (!hasInput && this.currentSpeed < 0.01 && fsmValue === "run") fsm.send({ type: "stop" });
    return true;
  }

  // ── Skill helper ───────────────────────────────────────────────

  /**
   * Fire a skill slot and emit the FSM skill event.
   * @param {string} slotKey - 'Q' | 'E' | 'R' | 'F'
   */
  _fireSkill(slotKey) {
    const fsm = this._fsmService;
    fsm.send({ type: 'skill' });
    this.onAbility?.(slotKey);
  }

  // ── Double-tap Dodge ───────────────────────────────────────────

  _fireDodge(keyCode) {
    const yaw = this.camera.getYaw();
    let dx = 0, dz = 0;
    switch (keyCode) {
      case 'KeyW': dz = -1; break;
      case 'KeyS': dz = 1;  break;
    }
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const worldX = dx * cos - dz * sin;
    const worldZ = dx * sin + dz * cos;

    // Face dodge direction
    this.targetYaw = Math.atan2(worldX, worldZ);
    this.mesh.rotation.y = this.targetYaw; // Snap for dodge (instant)

    this._fsmChar.facing.set(worldX, worldZ);
    this._fsmService.send({ type: 'dash' });
    this.onDash?.();
  }

  // ── Helpers ────────────────────────────────────────────────────

  _clampPosition() {
    const r = this.clampRadius ?? ARENA_RADIUS;
    this.mesh.position.x = Math.max(-r, Math.min(r, this.mesh.position.x));
    this.mesh.position.z = Math.max(-r, Math.min(r, this.mesh.position.z));
  }

  _snapToGround() {
    if (!this.groundSampler) return;
    this._terrainLoco?.beforeGroundSnap?.();
    this.groundSampler.snapMesh(this.mesh);
  }

  /** Send an FSM event from outside (e.g. game.js combat system) */
  send(event) {
    const evt = typeof event === 'string' ? { type: event } : event;
    this._fsmService.send(evt);
  }

  dispose() {
    this._fsmService.stop();
  }
}
