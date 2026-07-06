/**
 * Tab-target soft-track — invisible aim zone + crosshair magnet (dangerroom.puter.site).
 * Adapted from arpg-game softLock.ts for Grudge Arena TargetSystem units.
 */

import * as THREE from "three";

const ZONE_FOLLOW_RATE = 13;
const CROSSHAIR_RATE = 11;
const ZONE_PADDING = 0.5;

const WEAPON_LOCK_PROFILES = {
  bow: { softAreaFrac: 0.14, hardAreaFrac: 0.08, magnetRadiusPx: 120, hardMagnetBoost: 1.35, cameraAssistRate: 5.5, accuracy: 0.92 },
  rifle: { softAreaFrac: 0.12, hardAreaFrac: 0.07, magnetRadiusPx: 100, hardMagnetBoost: 1.4, cameraAssistRate: 6, accuracy: 0.95 },
  greatsword: { softAreaFrac: 0.18, hardAreaFrac: 0.11, magnetRadiusPx: 90, hardMagnetBoost: 1.2, cameraAssistRate: 4, accuracy: 0.88 },
  sabres: { softAreaFrac: 0.16, hardAreaFrac: 0.1, magnetRadiusPx: 95, hardMagnetBoost: 1.25, cameraAssistRate: 4.5, accuracy: 0.9 },
  staff: { softAreaFrac: 0.15, hardAreaFrac: 0.09, magnetRadiusPx: 105, hardMagnetBoost: 1.3, cameraAssistRate: 5, accuracy: 0.91 },
  mace: { softAreaFrac: 0.17, hardAreaFrac: 0.1, magnetRadiusPx: 88, hardMagnetBoost: 1.15, cameraAssistRate: 3.5, accuracy: 0.87 },
  scythe: { softAreaFrac: 0.16, hardAreaFrac: 0.1, magnetRadiusPx: 92, hardMagnetBoost: 1.2, cameraAssistRate: 4, accuracy: 0.89 },
  runeblade: { softAreaFrac: 0.16, hardAreaFrac: 0.1, magnetRadiusPx: 94, hardMagnetBoost: 1.22, cameraAssistRate: 4.2, accuracy: 0.9 },
};

const DEFAULT_PROFILE = WEAPON_LOCK_PROFILES.greatsword;

export const targetLock = { id: null };

export const softLock = {
  active: false,
  hardLock: false,
  mouseX: 0,
  mouseY: 0,
  crosshairX: 0,
  crosshairY: 0,
  zoneX: 0,
  zoneY: 0,
  zoneW: 0,
  zoneH: 0,
  targetScreenX: 0,
  targetScreenY: 0,
  targetVisible: false,
  accuracy: 0,
  magnetStrength: 0,
};

const _world = new THREE.Vector3();
const _proj = new THREE.Vector3();

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lockProfile(weaponType) {
  return WEAPON_LOCK_PROFILES[weaponType] || DEFAULT_PROFILE;
}

function zoneDimsFromArea(rectW, rectH, areaFrac) {
  const w = Math.sqrt(areaFrac) * rectW;
  const h = Math.sqrt(areaFrac) * rectH;
  return { w: Math.max(48, w), h: Math.max(48, h) };
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

function aimWorldPoint(unit) {
  _world.copy(unit.mesh.position);
  _world.y += 1.25;
  return _world;
}

function unitId(unit) {
  return unit.entity?.id ?? unit.mesh?.uuid ?? String(unit.mesh?.id);
}

function lockedUnit(targeting) {
  if (!targetLock.id || !targeting) return null;
  const hit = targeting.units.find((u) => unitId(u) === targetLock.id);
  if (!hit || hit.entity?.hasTag?.("dead")) return null;
  return hit;
}

export function setRawMouse(clientX, clientY) {
  softLock.mouseX = clientX;
  softLock.mouseY = clientY;
}

export function clearTabTarget() {
  targetLock.id = null;
  softLock.active = false;
  softLock.hardLock = false;
  softLock.magnetStrength = 0;
}

export function syncTargetLockFromTargeting(targeting) {
  const cur = targeting?.currentTarget;
  if (!cur || cur.entity?.hasTag?.("dead")) {
    if (targetLock.id) clearTabTarget();
    return;
  }
  targetLock.id = unitId(cur);
  softLock.active = true;
}

export function cycleTabTarget(camera, rect, targeting, weaponType) {
  const enemies = targeting?.enemies || [];
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const prof = lockProfile(weaponType);
  const { w, h } = zoneDimsFromArea(rect.width, rect.height, prof.softAreaFrac);
  const cands = [];

  for (const u of enemies) {
    const world = aimWorldPoint(u);
    const { x, y, visible } = projectToClient(camera, world, rect);
    if (!visible) continue;
    if (x < rect.left || x > rect.left + rect.width) continue;
    if (y < rect.top || y > rect.top + rect.height) continue;
    cands.push({ unit: u, id: unitId(u), dist: Math.hypot(x - cx, y - cy), x, y });
  }

  cands.sort((a, b) => a.dist - b.dist);
  if (!cands.length) {
    clearTabTarget();
    targeting?.deselect?.();
    return;
  }

  let next = cands[0];
  if (targetLock.id) {
    const idx = cands.findIndex((c) => c.id === targetLock.id);
    if (idx >= 0) next = cands[(idx + 1) % cands.length];
  }

  targetLock.id = next.id;
  targeting?.select?.(next.unit);
  softLock.accuracy = prof.accuracy;
  softLock.active = true;
  softLock.hardLock = false;
  softLock.magnetStrength = 0;

  const left = clamp(next.x - w / 2, rect.left, rect.left + rect.width - w);
  const top = clamp(next.y - h / 2, rect.top, rect.top + rect.height - h);
  softLock.zoneX = left;
  softLock.zoneY = top;
  softLock.zoneW = w;
  softLock.zoneH = h;
  softLock.crosshairX = clamp(softLock.mouseX, left, left + w);
  softLock.crosshairY = clamp(softLock.mouseY, top, top + h);
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
  return {
    x: desiredX + dx * s,
    y: desiredY + dy * s,
    strength: s,
  };
}

export function lockedTargetWorld(targeting) {
  const u = lockedUnit(targeting);
  return u ? aimWorldPoint(u).clone() : null;
}

export function hardLockCameraAssistRate(aiming, weaponType) {
  if (!aiming || !targetLock.id) return 0;
  return lockProfile(weaponType).cameraAssistRate;
}

/** Per-frame soft-track zone + crosshair magnet. */
export function updateSoftLock(dt, camera, rect, targeting, aiming, weaponType) {
  const unit = lockedUnit(targeting);
  if (!unit) {
    if (softLock.active || targetLock.id) clearTabTarget();
    return;
  }

  const prof = lockProfile(weaponType);
  const hard = !!aiming;
  softLock.hardLock = hard;
  softLock.accuracy = prof.accuracy;

  const world = aimWorldPoint(unit);
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

export function getSoftLockHudState() {
  return {
    active: softLock.active && softLock.targetVisible,
    x: softLock.crosshairX,
    y: softLock.crosshairY,
    hardLock: softLock.hardLock,
    aiming: softLock.hardLock,
    magnet: softLock.magnetStrength,
  };
}