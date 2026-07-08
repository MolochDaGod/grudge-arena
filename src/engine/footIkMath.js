/**
 * Foot IK math (headless-testable) — law-of-cosines leg solve, reach clamping,
 * pelvis-drop resolution, and frame-rate-independent weight damping.
 * Ported from character-kit footIkMath.ts.
 */

export const FOOT_IK = {
  enabled: true,
  rayUp: 0.6,
  rayDown: 1.2,
  maxPelvisDrop: 0.5,
  maxStep: 0.55,
  reachMargin: 0.02,
  weightRate: 12,
};

export function lawOfCosinesAngle(a, b, c) {
  if (a <= 0 || b <= 0) return 0;
  const cos = (a * a + b * b - c * c) / (2 * a * b);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

export function clampReach(dist, thigh, calf, margin) {
  const min = Math.abs(thigh - calf) + margin;
  const max = thigh + calf - margin;
  if (max <= min) return min;
  return Math.max(min, Math.min(max, dist));
}

export function solveTwoBoneAngles(thigh, calf, dist) {
  return {
    hip: lawOfCosinesAngle(thigh, dist, calf),
    knee: lawOfCosinesAngle(thigh, calf, dist),
  };
}

export function pelvisDrop(deltas, maxDrop) {
  if (deltas.length === 0) return 0;
  let minDelta = 0;
  for (const d of deltas) if (d < minDelta) minDelta = d;
  return Math.max(-maxDrop, minDelta);
}

export function dampWeight(current, target, rate, dt) {
  if (dt <= 0) return current;
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}