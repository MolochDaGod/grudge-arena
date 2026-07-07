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
  /** Circular aim zone center (screen px). */
  zoneCx: 0,
  zoneCy: 0,
  zoneRadius: 0,
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

export function lockProfile(weaponType) {
  return WEAPON_LOCK_PROFILES[weaponType] || DEFAULT_PROFILE;
}

/** Circular zone radius from screen-area fraction (replaces rectangular zone). */
export function zoneRadiusFromArea(rectW, rectH, areaFrac) {
  const area = areaFrac * rectW * rectH;
  return Math.max(56, Math.sqrt(area / Math.PI));
}

/** @deprecated Rectangular zones — kept for tests; gameplay uses zoneRadiusFromArea. */
export function zoneDimsFromArea(rectW, rectH, areaFrac) {
  const r = zoneRadiusFromArea(rectW, rectH, areaFrac);
  return { w: r * 2, h: r * 2 };
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
  const zoneR = zoneRadiusFromArea(rect.width, rect.height, prof.softAreaFrac);
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

  softLock.zoneCx = clamp(next.x, rect.left + zoneR, rect.left + rect.width - zoneR);
  softLock.zoneCy = clamp(next.y, rect.top + zoneR, rect.top + rect.height - zoneR);
  softLock.zoneRadius = zoneR;
  const clamped = clampToRadialZone(softLock.mouseX, softLock.mouseY);
  softLock.crosshairX = clamped.x;
  softLock.crosshairY = clamped.y;
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

export function getSoftLockHudState() {
  return {
    active: softLock.active && softLock.targetVisible,
    x: softLock.crosshairX,
    y: softLock.crosshairY,
    hardLock: softLock.hardLock,
    aiming: softLock.hardLock,
    magnet: softLock.magnetStrength,
    zoneCx: softLock.zoneCx,
    zoneCy: softLock.zoneCy,
    zoneRadius: softLock.zoneRadius,
    targetX: softLock.targetScreenX,
    targetY: softLock.targetScreenY,
    accuracy: softLock.accuracy,
  };
}