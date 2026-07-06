/**
 * Danger Room TPS shooter — hitscan + ammo for bow/rifle (puter.site parity).
 */

import * as THREE from "three";
import { registerHit, pulseCrosshairSpread } from "../engine/CombatFeedback.js";

const FIRE_COOLDOWN = {
  bow: 0.55,
  rifle: 0.12,
  greatsword: 0.8,
  default: 0.5,
};

const MAG_SIZE = {
  bow: 1,
  rifle: 30,
};

const RELOAD_TIME = {
  bow: 0.9,
  rifle: 1.8,
};

let ammoState = { bow: 1, rifle: 30 };
let reloading = null;
let reloadTimer = 0;
let fireCooldown = 0;
const listeners = new Set();

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _end = new THREE.Vector3();

export function subscribeShooter(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

export function getAmmo(weaponType) {
  return ammoState[weaponType] ?? 0;
}

export function magSizeFor(weaponType) {
  return MAG_SIZE[weaponType] ?? 0;
}

export function isReloading(weaponType) {
  return reloading === weaponType;
}

export function isFirearm(weaponType) {
  return weaponType === "bow" || weaponType === "rifle";
}

export function resetShooterAmmo() {
  ammoState = { bow: 1, rifle: 30 };
  reloading = null;
  reloadTimer = 0;
  fireCooldown = 0;
  emit();
}

function findTargetHit(origin, dir, maxRange, units) {
  let best = null;
  let bestT = Infinity;
  for (const unit of units) {
    if (unit.isPlayer || unit.entity?.hasTag?.("dead")) continue;
    const pos = unit.mesh?.position;
    if (!pos) continue;
    const to = pos.clone().sub(origin);
    const t = to.dot(dir);
    if (t < 0 || t > maxRange) continue;
    const closest = origin.clone().addScaledVector(dir, t);
    const dist2 = closest.distanceToSquared(pos);
    if (dist2 < 1.2 && t < bestT) {
      bestT = t;
      best = { unit, point: pos.clone().add(new THREE.Vector3(0, 1.2, 0)), t };
    }
  }
  return best;
}

/**
 * @param {object} arena GrudgeArena instance
 * @param {number} dt
 */
export function updateShooter(arena, dt) {
  if (fireCooldown > 0) fireCooldown = Math.max(0, fireCooldown - dt);
  if (reloading) {
    reloadTimer -= dt;
    if (reloadTimer <= 0) {
      ammoState[reloading] = magSizeFor(reloading);
      reloading = null;
      emit();
    }
  }

  const ctrl = arena.playerController;
  const weaponType = arena._getWeaponTypeKey?.() ?? "greatsword";
  if (!ctrl || !isFirearm(weaponType)) return;

  const aiming = !!(arena._autoAttackOn || ctrl.holdKey?._RMB);
  const fireDown = ctrl.holdKey?._LMB || ctrl.tickKey?._LMB;
  if (!aiming || !fireDown || fireCooldown > 0 || isReloading(weaponType)) return;

  const ammo = getAmmo(weaponType);
  if (ammo <= 0) {
    startReload(weaponType);
    return;
  }

  fireHitscan(arena, weaponType);
  ammoState[weaponType] = ammo - 1;
  fireCooldown = FIRE_COOLDOWN[weaponType] ?? FIRE_COOLDOWN.default;
  emit();
}

export function startReload(weaponType) {
  if (!isFirearm(weaponType) || isReloading(weaponType)) return;
  reloading = weaponType;
  reloadTimer = RELOAD_TIME[weaponType] ?? 1.5;
  emit();
}

function fireHitscan(arena, weaponType) {
  const cam = arena.camera;
  const player = arena.playerUnit?.mesh;
  if (!cam || !player) return;

  cam.getWorldDirection(_dir);
  _origin.copy(player.position).add(new THREE.Vector3(0, 1.45, 0));
  _end.copy(_origin).addScaledVector(_dir, weaponType === "bow" ? 40 : 60);

  const hit = findTargetHit(_origin, _dir, weaponType === "bow" ? 40 : 60, arena.allUnits || []);
  pulseCrosshairSpread(weaponType === "rifle" ? 8 : 5);
  if (hit) {
    registerHit();
    arena.combatSystem?.applyDamage?.(hit.unit.entity, weaponType === "rifle" ? 35 : 45);
    arena.playerUnit?.controller?.playOnce?.("fire") ||
      arena.playerUnit?.controller?.playOnce?.("attack1");
  } else {
    arena.playerUnit?.controller?.playOnce?.("fire") ||
      arena.playerUnit?.controller?.playOnce?.("attack1");
  }

  arena.particleSystem?.emit?.({
    position: _end.clone(),
    color: new THREE.Color(0xffaa44),
    count: weaponType === "rifle" ? 6 : 4,
    velocity: _dir.clone().multiplyScalar(2),
    spread: 0.3,
    lifetime: 0.08,
    size: 0.08,
  });
}