/**
 * PlayerController — Input handling for player character
 * 
 * Direct adaptation of annihilate RoleControls.js with our hotkeys:
 *   WASD = direction, LMB = attack, RMB = heavy, Space = jump,
 *   Ctrl = dash, Q = block, 1-5 = skills, Shift = sprint
 * 
 * Uses holdKey/tickKey pattern:
 *   holdKey: continuous while key is held (movement)
 *   tickKey: fires once per press, cleared each frame (actions)
 */

import * as THREE from 'three';

export class PlayerController {
  constructor(character, cameraYawRef) {
    this.char = character;
    this.cameraYawRef = cameraYawRef; // { value: number } — ref to camera yaw for relative movement

    this.holdKey = {};
    this.tickKey = {};
    this.direction = new THREE.Vector2();  // May be zero length
    this.facing = new THREE.Vector2(0, -1); // NEVER zero length
    this.speed = 0.11; // annihilate default

    this._setupListeners();
  }

  _setupListeners() {
    window.addEventListener('keydown', (e) => {
      if (this.holdKey[e.code]) return; // Annihilate: prevent repeat
      this.holdKey[e.code] = true;
      this.tickKey[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.holdKey[e.code] = false;

      // Block release (annihilate: keyLUp → idle)
      if (e.code === 'KeyQ') {
        this.char._fsmService?.send('blockRelease');
      }
    });

    // LMB = attack, RMB = heavy (annihilate: J = attack, U = bash)
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.tickKey._LMB = true;
      if (e.button === 2) this.tickKey._RMB = true;
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Call every frame (annihilate: RoleControls.update(dt)) */
  update(dt) {
    const service = this.char._fsmService;
    if (!service) return;
    const state = service.getSnapshot();

    // ── Process tick keys (one-shot actions) ─────────────────────
    if (this.tickKey._LMB) {
      service.send('attack');
    } else if (this.tickKey._RMB) {
      service.send('heavy');
    } else if (this.tickKey.Space) {
      service.send('jump');
    } else if (this.tickKey.ControlLeft || this.tickKey.ControlRight) {
      // Dash: snap facing to direction first (annihilate pattern)
      if (this.direction.lengthSq() > 0) {
        this.facing.copy(this._getWorldDirection());
      }
      service.send('dash');
    } else if (this.tickKey.KeyQ) {
      service.send('block');
    } else if (this.tickKey.Digit1 || this.tickKey.Numpad1) {
      this.char._activeSkill = 1; service.send('skill');
    } else if (this.tickKey.Digit2 || this.tickKey.Numpad2) {
      this.char._activeSkill = 2; service.send('skill');
    } else if (this.tickKey.Digit3 || this.tickKey.Numpad3) {
      this.char._activeSkill = 3; service.send('skill');
    } else if (this.tickKey.Digit4 || this.tickKey.Numpad4) {
      this.char._activeSkill = 4; service.send('skill');
    } else if (this.tickKey.Digit5 || this.tickKey.Numpad5) {
      this.char._activeSkill = 5; service.send('skill');
    }

    // Clear tick keys (annihilate pattern)
    this.tickKey = {};

    // ── Build direction from held keys (annihilate: Vector2 from WASD) ──
    this.direction.set(0, 0);
    if (this.holdKey.KeyW || this.holdKey.ArrowUp)    this.direction.y -= 1;
    if (this.holdKey.KeyS || this.holdKey.ArrowDown)  this.direction.y += 1;
    if (this.holdKey.KeyA || this.holdKey.ArrowLeft)  this.direction.x -= 1;
    if (this.holdKey.KeyD || this.holdKey.ArrowRight) this.direction.x += 1;

    const isSprint = this.holdKey.ShiftLeft || this.holdKey.ShiftRight;
    const spd = isSprint ? this.speed * 1.5 : this.speed;
    this.direction.normalize().multiplyScalar(spd * dt * 60);

    const isMoving = this.direction.lengthSq() > 0;

    // ── Movement (only in canMove states) ────────────────────────
    if (state.hasTag('canMove') || state.matches('idle')) {
      if (isMoving) {
        // Camera-relative direction
        const worldDir = this._getWorldDirection();
        this.facing.copy(worldDir);

        // Rotate mesh (annihilate: -facing.angle() + PI/2)
        this.char.mesh.rotation.y = -this.facing.angle() + Math.PI / 2;

        // Move physics body (annihilate: body.position += direction)
        this.char.body?.move(worldDir.x, worldDir.y);

        // Send run event
        service.send('run');
      } else {
        service.send('stop');
      }
    }

    // ── Ground check → send land event ──────────────────────────
    if (this.char.body) {
      const grounded = this.char.body.checkGrounded();
      if (grounded && (state.matches('fall') || state.matches('jump') || state.matches('doubleJump'))) {
        service.send('land');
      }
      if (!grounded && state.matches('run')) {
        service.send('air');
      }
    }
  }

  /** Get camera-relative world direction from input direction */
  _getWorldDirection() {
    const yaw = this.cameraYawRef?.value ?? 0;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    return new THREE.Vector2(
      this.direction.x * cos - this.direction.y * sin,
      this.direction.x * sin + this.direction.y * cos
    );
  }
}
