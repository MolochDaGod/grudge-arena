/**
 * Combat sandbox focus soft-lock — enemies / neutrals / harvestables with color recognition.
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
  zoneDimsFromArea,
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

function isInsideZone(px, py) {
  return (
    px >= softLock.zoneX + ZONE_PADDING &&
    px <= softLock.zoneX + softLock.zoneW - ZONE_PADDING &&
    py >= softLock.zoneY + ZONE_PADDING &&
    py <= softLock.zoneY + softLock.zoneH - ZONE_PADDING
  );
}

function applyMagnet(desiredX, desiredY, targetX, targetY, mouseX, mouseY, prof, hard) {
  if (!isInsideZone(mouseX, mouseY)) {
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
  const { w, h } = zoneDimsFromArea(rect.width, rect.height, prof.softAreaFrac);

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

  const left = clamp(next.x - w / 2, rect.left, rect.left + rect.width - w);
  const top = clamp(next.y - h / 2, rect.top, rect.top + rect.height - h);
  softLock.zoneX = left;
  softLock.zoneY = top;
  softLock.zoneW = w;
  softLock.zoneH = h;
  softLock.crosshairX = clamp(softLock.mouseX, left, left + w);
  softLock.crosshairY = clamp(softLock.mouseY, top, top + h);
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
  const targetDims = zoneDimsFromArea(rect.width, rect.height, areaFrac);
  const desiredLeft = clamp(screenX - targetDims.w / 2, rect.left, rect.left + rect.width - targetDims.w);
  const desiredTop = clamp(screenY - targetDims.h / 2, rect.top, rect.top + rect.height - targetDims.h);

  const zoneK = 1 - Math.exp(-ZONE_FOLLOW_RATE * dt);
  if (!softLock.active) {
    softLock.zoneX = desiredLeft;
    softLock.zoneY = desiredTop;
    softLock.zoneW = targetDims.w;
    softLock.zoneH = targetDims.h;
    softLock.crosshairX = screenX;
    softLock.crosshairY = screenY;
  } else {
    const nextW = softLock.zoneW + (targetDims.w - softLock.zoneW) * zoneK;
    const nextH = softLock.zoneH + (targetDims.h - softLock.zoneH) * zoneK;
    softLock.zoneX = clamp(
      softLock.zoneX + (desiredLeft - softLock.zoneX) * zoneK,
      rect.left,
      rect.left + rect.width - nextW,
    );
    softLock.zoneY = clamp(
      softLock.zoneY + (desiredTop - softLock.zoneY) * zoneK,
      rect.top,
      rect.top + rect.height - nextH,
    );
    softLock.zoneW = nextW;
    softLock.zoneH = nextH;
  }

  let desiredX = clamp(softLock.mouseX, softLock.zoneX, softLock.zoneX + softLock.zoneW);
  let desiredY = clamp(softLock.mouseY, softLock.zoneY, softLock.zoneY + softLock.zoneH);

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
  softLock.crosshairX = clamp(softLock.crosshairX, softLock.zoneX, softLock.zoneX + softLock.zoneW);
  softLock.crosshairY = clamp(softLock.crosshairY, softLock.zoneY, softLock.zoneY + softLock.zoneH);
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