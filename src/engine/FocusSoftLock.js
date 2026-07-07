/**
 * Combat sandbox focus soft-lock — enemies / neutrals / harvestables with color recognition.
 * Circular radial aim zone (no rectangular soft-lock box).
 */

import * as THREE from "three";
import {
  listFocusCandidates,
  getLockedFocusTarget,
  lockFocusTarget,
  clearFocusLock,
  aimWorldForTarget,
  lockedFocusId,
  lockedFocusKind,
  FOCUS_CSS,
} from "../dangerRoom/FocusTargetRegistry.js";
import {
  softLock,
  targetLock,
  clearTabTarget,
  lockProfile,
  zoneRadiusFromArea,
} from "./SoftLockSystem.js";

const _world = new THREE.Vector3();
const _proj = new THREE.Vector3();
const ZONE_PADDING = 0.5;
const ZONE_FOLLOW_RATE = 13;
const CROSSHAIR_RATE = 11;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function projectToClient(camera, world, rect) {
  _proj.copy(world).project(camera);
  const visible = _proj.z > -1 && _proj.z < 1;
  return {
    x: (_proj.x * 0.5 + 0.5) * rect.width + rect.left,
    y: (-_proj.y * 0.5 + 0.5) * rect.height + rect.top,
    visible,
  };
}

function isInsideRadialZone(px, py) {
  const r = Math.max(8, softLock.zoneRadius - ZONE_PADDING);
  return Math.hypot(px - softLock.zoneCx, py - softLock.zoneCy) <= r;
}

function clampToRadialZone(px, py) {
  const dx = px - softLock.zoneCx;
  const dy = py - softLock.zoneCy;
  const dist = Math.hypot(dx, dy);
  const maxR = Math.max(8, softLock.zoneRadius - ZONE_PADDING);
  if (dist <= maxR) return { x: px, y: py };
  const s = maxR / dist;
  return { x: softLock.zoneCx + dx * s, y: softLock.zoneCy + dy * s };
}

function applyMagnet(desiredX, desiredY, targetX, targetY, mouseX, mouseY, prof, hard) {
  if (!isInsideRadialZone(mouseX, mouseY)) {
    return { x: desiredX, y: desiredY, strength: 0 };
  }
  const dx = targetX - desiredX;
  const dy = targetY - desiredY;
  const dist = Math.hypot(dx, dy);
  const radius = prof.magnetRadiusPx;
  if (dist > radius) return { x: desiredX, y: desiredY, strength: 0 };
  const t = 1 - dist / radius;
  let s = t * t;
  if (hard) s = clamp(s * prof.hardMagnetBoost, 0, 1);
  return { x: desiredX + dx * s, y: desiredY + dy * s, strength: s };
}

/** Tab — cycle focus targets (filtered by toggle focus mode). */
export function cycleFocusTabTarget(camera, rect, weaponType) {
  const cands = [];
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const prof = lockProfile(weaponType);
  const zoneR = zoneRadiusFromArea(rect.width, rect.height, prof.softAreaFrac);

  for (const t of listFocusCandidates()) {
    const world = aimWorldForTarget(t);
    const { x, y, visible } = projectToClient(camera, world, rect);
    if (!visible) continue;
    if (x < rect.left || x > rect.left + rect.width) continue;
    if (y < rect.top || y > rect.top + rect.height) continue;
    cands.push({ t, id: t.id, dist: Math.hypot(x - cx, y - cy), x, y });
  }

  cands.sort((a, b) => a.dist - b.dist);
  if (!cands.length) {
    clearFocusLock();
    clearTabTarget();
    return null;
  }

  let next = cands[0];
  if (lockedFocusId) {
    const idx = cands.findIndex((c) => c.id === lockedFocusId);
    if (idx >= 0) next = cands[(idx + 1) % cands.length];
  }

  lockFocusTarget(next.id);
  targetLock.id = next.id;

  softLock.zoneCx = clamp(next.x, rect.left + zoneR, rect.left + rect.width - zoneR);
  softLock.zoneCy = clamp(next.y, rect.top + zoneR, rect.top + rect.height - zoneR);
  softLock.zoneRadius = zoneR;
  const clamped = clampToRadialZone(softLock.mouseX, softLock.mouseY);
  softLock.crosshairX = clamped.x;
  softLock.crosshairY = clamped.y;
  softLock.accuracy = prof.accuracy;
  softLock.active = true;
  softLock.hardLock = false;
  softLock.magnetStrength = 0;
  return next.t;
}

export function lockedFocusWorld() {
  const t = getLockedFocusTarget();
  return t ? aimWorldForTarget(t).clone() : null;
}

export function updateFocusSoftLock(dt, camera, rect, aiming, weaponType) {
  const t = getLockedFocusTarget();
  if (!t) {
    if (softLock.active || lockedFocusId) {
      clearFocusLock();
      clearTabTarget();
    }
    return;
  }

  const prof = lockProfile(weaponType);
  const hard = !!aiming;
  softLock.hardLock = hard;
  softLock.accuracy = prof.accuracy;
  targetLock.id = t.id;

  const world = aimWorldForTarget(t);
  const { x: screenX, y: screenY, visible } = projectToClient(camera, world, rect);
  softLock.targetScreenX = screenX;
  softLock.targetScreenY = screenY;
  softLock.targetVisible = visible;

  const areaFrac = hard ? prof.hardAreaFrac : prof.softAreaFrac;
  const targetR = zoneRadiusFromArea(rect.width, rect.height, areaFrac);
  const desiredCx = clamp(screenX, rect.left + targetR, rect.left + rect.width - targetR);
  const desiredCy = clamp(screenY, rect.top + targetR, rect.top + rect.height - targetR);

  const zoneK = 1 - Math.exp(-ZONE_FOLLOW_RATE * dt);
  if (!softLock.active) {
    softLock.zoneCx = desiredCx;
    softLock.zoneCy = desiredCy;
    softLock.zoneRadius = targetR;
    softLock.crosshairX = screenX;
    softLock.crosshairY = screenY;
  } else {
    softLock.zoneCx = clamp(
      softLock.zoneCx + (desiredCx - softLock.zoneCx) * zoneK,
      rect.left + targetR,
      rect.left + rect.width - targetR,
    );
    softLock.zoneCy = clamp(
      softLock.zoneCy + (desiredCy - softLock.zoneCy) * zoneK,
      rect.top + targetR,
      rect.top + rect.height - targetR,
    );
    softLock.zoneRadius += (targetR - softLock.zoneRadius) * zoneK;
  }

  const mouseClamped = clampToRadialZone(softLock.mouseX, softLock.mouseY);
  let desiredX = mouseClamped.x;
  let desiredY = mouseClamped.y;

  const magnet = applyMagnet(
    desiredX, desiredY, screenX, screenY,
    softLock.mouseX, softLock.mouseY, prof, hard,
  );
  desiredX = magnet.x;
  desiredY = magnet.y;
  softLock.magnetStrength = magnet.strength;

  if (hard) {
    const pullK = 1 - Math.exp(-12 * dt);
    desiredX += (screenX - desiredX) * pullK;
    desiredY += (screenY - desiredY) * pullK;
    softLock.magnetStrength = Math.max(softLock.magnetStrength, pullK);
  }

  const chK = 1 - Math.exp(-CROSSHAIR_RATE * dt);
  softLock.crosshairX += (desiredX - softLock.crosshairX) * chK;
  softLock.crosshairY += (desiredY - softLock.crosshairY) * chK;
  const chClamped = clampToRadialZone(softLock.crosshairX, softLock.crosshairY);
  softLock.crosshairX = chClamped.x;
  softLock.crosshairY = chClamped.y;
  softLock.active = true;
}

export function getFocusSoftLockHudState() {
  const kind = lockedFocusKind;
  return {
    focusKind: kind,
    accent: kind ? FOCUS_CSS[kind] : null,
  };
}

export function focusHardLockCameraAssistRate(aiming, weaponType) {
  if (!aiming || !lockedFocusId) return 0;
  return lockProfile(weaponType).cameraAssistRate;
}