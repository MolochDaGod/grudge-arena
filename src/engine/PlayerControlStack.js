/**
 * Universal player control stack for all Warlords character play.
 *
 * Contract (every mode: Teidland island, combat-sandbox, flat arena PvP,
 * queue matches, Combat Studio / anim-test):
 *
 *   camera     → OrbitCamera controlMode "tps"
 *   move/combat→ ArenaController controlScheme "tps"
 *   locomotion → baked Bip001 gait (useBakedLoco)
 *   targeting  → SoftLockSystem soft + hard lock
 *   skills     → WeaponDefinitions Q/E/R/F/P via ArenaController
 *   block/dodge→ V hold / Ctrl + double-tap (CharacterFSM)
 *   climb/swim → ArenaController + ground/water probes
 *
 * Source of truth for feel: Teidland / danger-room runtime (same modules).
 */

import * as THREE from "three";
import { OrbitCamera } from "./OrbitCamera.js";
import { ArenaController } from "./ArenaController.js";
import {
  setRawMouse,
  updateSoftLock,
  getSoftLockHudState,
  hardLockCameraAssistRate,
  lockedTargetWorld,
  cycleTabTarget,
  syncTargetLockFromTargeting,
  softLock,
} from "./SoftLockSystem.js";
import { getWeaponFeel, resolveMotionLabel } from "./WeaponFeel.js";
import {
  getComboStage,
  getCrosshairSpread,
  getHitMarkerId,
} from "./CombatFeedback.js";

/** Always TPS — Fortnite/danger-room locomotion + camera. */
export const UNIVERSAL_CONTROL_SCHEME = "tps";

const _toTarget = new THREE.Vector3();

/**
 * Create OrbitCamera + ArenaController wired for production TPS play.
 * @param {object} opts
 * @param {import('three').PerspectiveCamera} opts.camera
 * @param {HTMLElement} opts.domElement
 * @param {import('three').Object3D} opts.mesh
 * @param {*} opts.animCtrl — BakedAnimationController / AnimationController
 * @param {import('three').Object3D[]} [opts.obstacleMeshes]
 * @param {number|null} [opts.clampRadius]
 * @param {*} [opts.groundSampler]
 * @param {*} [opts.terrainSystem]
 */
export function createPlayerControlStack(opts) {
  const {
    camera,
    domElement,
    mesh,
    animCtrl,
    obstacleMeshes = [],
    clampRadius = null,
    groundSampler = null,
    terrainSystem = null,
  } = opts;

  const orbitCamera = new OrbitCamera(camera, domElement);
  orbitCamera.setControlMode(UNIVERSAL_CONTROL_SCHEME);
  orbitCamera.setTarget(mesh);
  if (obstacleMeshes?.length) {
    orbitCamera.setCollisionMeshes(obstacleMeshes);
  }
  orbitCamera.snapBehind();

  const playerController = new ArenaController(mesh, animCtrl, orbitCamera);
  playerController.controlScheme = UNIVERSAL_CONTROL_SCHEME;
  playerController.useBakedLoco = !!animCtrl?.useBakedLoco;
  playerController.targetYaw = mesh.rotation.y;
  if (clampRadius != null) playerController.clampRadius = clampRadius;
  if (terrainSystem && playerController.setTerrainSystem) {
    playerController.setTerrainSystem(terrainSystem);
  } else if (groundSampler) {
    if (playerController.setGroundSampler) {
      playerController.setGroundSampler(groundSampler);
    } else {
      playerController.groundSampler = groundSampler;
    }
  }

  animCtrl?.setWeaponType?.(opts.weaponType);

  return { orbitCamera, playerController };
}

/**
 * Soft-lock mouse + TPS LMB attack + MMB hard-lock toggle.
 * Idempotent — safe to call on every match start.
 * @param {object} arena — GrudgeArena-like host
 */
export function setupPlayerPointerInput(arena) {
  if (!arena) return;

  if (!arena._softLockMove) {
    arena._softLockMove = (e) => setRawMouse(e.clientX, e.clientY);
    window.addEventListener("mousemove", arena._softLockMove, { passive: true });
    const rect = arena.renderer?.domElement?.getBoundingClientRect?.();
    if (rect) {
      setRawMouse(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5);
    }
  }

  if (!arena._universalMouseDown) {
    arena._universalMouseDown = (e) => {
      if (!arena.playerController) return;
      if (e.button === 0) {
        arena.playerController.holdKey._LMB = true;
      }
      // Middle mouse = hard lock toggle (when a soft target exists)
      if (e.button === 1) {
        e.preventDefault();
        if (softLock.active || arena.targeting?.currentTarget) {
          softLock.hardLock = !softLock.hardLock;
        } else {
          arena.playerController.onTarget?.();
          softLock.hardLock = true;
        }
      }
    };
    arena._universalMouseUp = (e) => {
      if (!arena.playerController) return;
      if (e.button === 0) {
        arena.playerController.holdKey._LMB = false;
        if (arena._harvest?.isActive?.()) {
          arena.playerController.tickKey._LMB = true;
        } else {
          arena.playerController.tickKey._LMBAttack = true;
        }
      }
    };
    window.addEventListener("mousedown", arena._universalMouseDown);
    window.addEventListener("mouseup", arena._universalMouseUp);
    window.addEventListener("auxclick", (e) => {
      if (e.button === 1) e.preventDefault();
    });
  }
}

export function teardownPlayerPointerInput(arena) {
  if (!arena) return;
  if (arena._softLockMove) {
    window.removeEventListener("mousemove", arena._softLockMove);
    arena._softLockMove = null;
  }
  if (arena._universalMouseDown) {
    window.removeEventListener("mousedown", arena._universalMouseDown);
    window.removeEventListener("mouseup", arena._universalMouseUp);
    arena._universalMouseDown = null;
    arena._universalMouseUp = null;
  }
}

/**
 * Wire combat callbacks shared by arena PvP + Teidland + sandbox.
 * @param {object} arena
 * @param {ArenaController} ctrl
 */
export function wirePlayerCombatCallbacks(arena, ctrl) {
  ctrl.onAttack = (_type) => arena._toggleAutoAttack?.();

  ctrl.onAbility = (slotKey) => {
    if (["Q", "E", "R", "F"].includes(slotKey)) {
      arena.useAbility?.(slotKey);
    } else if (["6", "7", "8"].includes(slotKey)) {
      const idx = parseInt(slotKey, 10);
      arena.inventoryUI?.useConsumableSlot?.(idx - 5);
    } else if (slotKey === "P" || slotKey === "5") {
      arena.useAbility?.("P");
    }
  };

  ctrl.onTarget = () => {
    cyclePlayerTarget(arena);
  };

  ctrl.onDash = () => {
    const fwd = ctrl.getForward();
    const weaponType = arena._getWeaponTypeKey?.() ?? "greatsword";
    const dashFeel = getWeaponFeel(weaponType);
    const dashColor = dashFeel?.accent
      ? new THREE.Color(dashFeel.accent)
      : new THREE.Color(0x3366ff);
    arena.particleSystem?.emit?.({
      position: arena.playerUnit.mesh.position
        .clone()
        .add(new THREE.Vector3(0, 0.5, 0)),
      color: dashColor,
      count: dashFeel?.title === "ASSASSIN" ? 28 : 20,
      velocity: fwd.clone().multiplyScalar(-4),
      spread: 1.5,
      lifetime: 0.4,
      size: 0.2,
    });
    arena._playSFX?.(arena._weaponSfx?.ui?.dash, 0.35);
  };
}

/** Tab-cycle targets with soft-lock zone (all play modes). */
export function cyclePlayerTarget(arena) {
  const canvas = arena.renderer?.domElement;
  if (!canvas || !arena.targeting) return;
  const rect = canvas.getBoundingClientRect();
  const weaponType = arena._getWeaponTypeKey?.() ?? "greatsword";
  cycleTabTarget(arena.camera, rect, arena.targeting, weaponType);
  const pos = arena.targeting.currentTarget?.mesh?.position;
  if (pos) arena.orbitCamera?.nudgeToward?.(pos);
}

function applyCameraAssist(arena, dt, weaponType, aiming) {
  const cam = arena.orbitCamera;
  if (!cam?.setCameraAssist) return;
  const rate = hardLockCameraAssistRate(aiming || softLock.hardLock, weaponType);
  if (rate <= 0) {
    cam.setCameraAssist(null, null, 0);
    return;
  }
  const world = lockedTargetWorld(arena.targeting);
  if (!world) {
    cam.setCameraAssist(null, null, 0);
    return;
  }
  _toTarget.copy(world).sub(arena.camera.position);
  if (_toTarget.lengthSq() < 1e-6) return;
  _toTarget.normalize();
  const yaw = Math.atan2(_toTarget.x, _toTarget.z);
  const pitch = Math.asin(Math.max(-1, Math.min(1, _toTarget.y)));
  cam.setCameraAssist(yaw, pitch, rate);
}

/**
 * Per-frame soft/hard lock + camera assist. Call for every character-play mode.
 * @param {object} arena
 * @param {number} delta
 */
export function tickPlayerAimSystems(arena, delta = 0.016) {
  if (!arena?.playerController || !arena.camera) return;
  const canvas = arena.renderer?.domElement;
  if (!canvas) return;

  const weaponType = arena._getWeaponTypeKey?.() ?? "greatsword";
  const ctrl = arena.playerController;
  // ADS / auto-attack OR explicit hard-lock flag
  const aiming = !!(
    arena._autoAttackOn ||
    ctrl.holdKey?._RMB ||
    softLock.hardLock
  );

  const rect = canvas.getBoundingClientRect();
  if (arena.targeting) {
    syncTargetLockFromTargeting(arena.targeting);
  }
  updateSoftLock(delta, arena.camera, rect, arena.targeting, aiming, weaponType);
  applyCameraAssist(arena, delta, weaponType, aiming);
  arena.orbitCamera?.setPlayerMoving?.(
    (ctrl.currentSpeed || 0) > 0.15 ||
      !!(ctrl.holdKey?.ShiftLeft || ctrl.holdKey?.ShiftRight),
  );
  arena.orbitCamera?.setAiming?.(aiming && (arena.getCurrentWeapon?.()?.range ?? 0) > 5);
}

/**
 * Ensure soft-lock / crosshair DOM exists on #gameUI (arena + island).
 * Safe if danger-room HUD already mounted.
 */
export function ensureCombatAimHudShell() {
  const gameUI = document.getElementById("gameUI");
  if (!gameUI) return null;
  let root = document.getElementById("universal-combat-aim");
  if (root) return root;
  // Prefer existing danger-room aim layer
  if (document.getElementById("dr-crosshair")) return document.getElementById("dr-crosshair")?.parentElement;
  root = document.createElement("div");
  root.id = "universal-combat-aim";
  root.className = "dr-aim-layer";
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="dr-softlock-zone" id="dr-softlock-zone" hidden></div>
    <div class="dr-target-pip" id="dr-target-pip" hidden></div>
    <div class="dr-crosshair dr-crosshair-cursor" id="dr-crosshair">
      <span class="dr-ch-magnet-ring" id="dr-ch-magnet"></span>
      <span class="dr-ch-range" id="dr-ch-range"></span>
      <span class="dr-ch-hit" id="dr-ch-hit" hidden></span>
      <span class="dr-ch-arm dr-ch-arm-t"></span>
      <span class="dr-ch-arm dr-ch-arm-b"></span>
      <span class="dr-ch-arm dr-ch-arm-l"></span>
      <span class="dr-ch-arm dr-ch-arm-r"></span>
      <span class="dr-ch-dot"></span>
    </div>
  `;
  gameUI.appendChild(root);
  return root;
}

/**
 * Lightweight combat feel HUD (motion + soft lock) when full danger HUD is off.
 * @param {object} arena
 * @param {number} delta
 * @param {(payload: object) => void} [updateHud] — optional dangerRoomHud.updateDangerHud
 */
export function tickUniversalCombatHud(arena, delta, updateHud) {
  tickPlayerAimSystems(arena, delta);
  if (!updateHud || !arena.playerController) return;

  const ctrl = arena.playerController;
  const speed = ctrl.currentSpeed || 0;
  const sprint = ctrl.holdKey?.ShiftLeft || ctrl.holdKey?.ShiftRight;
  const snap = ctrl._fsmService?.getSnapshot?.();
  const snapVal = snap?.value;
  const stateStr = typeof snapVal === "string" ? snapVal : JSON.stringify(snapVal ?? "");
  const weaponType = arena._getWeaponTypeKey?.() ?? "greatsword";
  const feel = getWeaponFeel(weaponType);
  const weapon = arena.getCurrentWeapon?.();
  const aiming = !!(arena._autoAttackOn || ctrl.holdKey?._RMB || softLock.hardLock);

  const motion = resolveMotionLabel(feel, {
    skillName: arena._activeSkillLabel,
    reloading: arena._reloading,
    aiming: aiming && weapon?.range > 5,
    casting: arena._casting,
    dashing: stateStr.includes("dash"),
    blocking: stateStr.includes("block"),
    attacking: stateStr.includes("attack") || stateStr.includes("skill"),
    sprinting: sprint && speed > 0.5,
    moving: speed > 0.5,
  });

  let rangeState = "none";
  if (weapon?.range > 5) {
    const target = arena.targeting?.currentTarget;
    if (target && !target.entity?.hasTag("dead")) {
      const dist = arena.playerUnit.mesh.position.distanceTo(target.mesh.position);
      const r = weapon.range;
      if (dist < r * 0.45) rangeState = "close";
      else if (dist <= r * 0.95) rangeState = "optimal";
      else rangeState = "far";
    }
  }

  updateHud({
    motion,
    weapon: weapon ? `${weapon.name} · ${feel.title}` : feel.title,
    accent: feel.accent,
    combo: getComboStage(),
    spread: (arena._crosshairBase ?? 10) + getCrosshairSpread(),
    hitMarker: getHitMarkerId(),
    rangeState,
    softLock: getSoftLockHudState(),
  });
}
