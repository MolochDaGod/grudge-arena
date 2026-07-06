/**
 * Third-person controller math — ported from arpg-game tpsMath.ts + combatFeel.ts.
 */

/** @typedef {'forward'|'forward-left'|'forward-right'|'backward'|'backward-left'|'backward-right'|'left'|'right'} LocoDir8 */

/** Classify local-frame movement (lx = strafe+, lz = forward+) into 8 directions. */
export function classifyDir(lx, lz) {
  if (Math.abs(lx) < 0.01 && Math.abs(lz) < 0.01) return "forward";
  const ang = Math.atan2(lx, lz);
  const deg = (ang * 180) / Math.PI;
  if (deg >= -22.5 && deg < 22.5) return "forward";
  if (deg >= 22.5 && deg < 67.5) return "forward-right";
  if (deg >= 67.5 && deg < 112.5) return "right";
  if (deg >= 112.5 && deg < 157.5) return "backward-right";
  if (deg >= 157.5 || deg < -157.5) return "backward";
  if (deg >= -157.5 && deg < -112.5) return "backward-left";
  if (deg >= -112.5 && deg < -67.5) return "left";
  return "forward-left";
}

/** Collapse 8-way direction to 4-way cardinal for clip lookup. */
export function cardinalDir(dir) {
  if (dir === "forward-left" || dir === "forward-right") return "forward";
  if (dir === "backward-left" || dir === "backward-right") return "backward";
  if (dir === "left" || dir === "right" || dir === "forward" || dir === "backward") return dir;
  return "forward";
}

/** Cap gait while ADS — slower deliberate movement (TPS best practice). */
export function gaitTargetWhileAiming(rawGait, aiming, weaponType) {
  if (!aiming) return rawGait;
  const cap = weaponType === "bow" ? 0.5 : weaponType === "rifle" ? 0.68 : 0.75;
  return Math.min(rawGait, cap);
}

/** Shortest signed angle delta from `a` to `b` (radians). */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Shortest-arc lerp between two angles (radians). */
export function lerpAngle(from, to, t) {
  return from + angleDelta(from, to) * t;
}

/**
 * Camera-relative planar move direction (Fortnite / island sandbox).
 * `right` = D+, `forward` = W+ at camera `yaw`.
 */
export function moveDir(right, forward, yaw) {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return {
    x: forward * s - right * c,
    z: forward * c + right * s,
  };
}