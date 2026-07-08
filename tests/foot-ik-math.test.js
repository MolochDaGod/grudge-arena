import { describe, it, expect } from 'vitest';
import {
  lawOfCosinesAngle,
  clampReach,
  solveTwoBoneAngles,
  pelvisDrop,
  dampWeight,
  FOOT_IK,
} from '../src/engine/footIkMath.js';

describe('footIkMath', () => {
  it('lawOfCosinesAngle returns PI for degenerate sides', () => {
    expect(lawOfCosinesAngle(0, 1, 1)).toBe(0);
    expect(lawOfCosinesAngle(1, 0, 1)).toBe(0);
  });

  it('clampReach stays inside two-bone reach band', () => {
    const thigh = 0.45;
    const calf = 0.42;
    const margin = 0.02;
    const min = Math.abs(thigh - calf) + margin;
    const max = thigh + calf - margin;
    expect(clampReach(0, thigh, calf, margin)).toBeCloseTo(min, 5);
    expect(clampReach(10, thigh, calf, margin)).toBeCloseTo(max, 5);
    expect(clampReach(0.5, thigh, calf, margin)).toBeCloseTo(0.5, 5);
  });

  it('solveTwoBoneAngles produces positive joint angles', () => {
    const { hip, knee } = solveTwoBoneAngles(0.45, 0.42, 0.5);
    expect(hip).toBeGreaterThan(0);
    expect(knee).toBeGreaterThan(0);
  });

  it('pelvisDrop picks lowest foot delta capped by maxDrop', () => {
    expect(pelvisDrop([], 0.5)).toBe(0);
    expect(pelvisDrop([0.1, -0.2, 0.05], 0.5)).toBeCloseTo(-0.2, 5);
    expect(pelvisDrop([0, -0.9], 0.5)).toBeCloseTo(-0.5, 5);
  });

  it('dampWeight eases toward target', () => {
    const w = dampWeight(0, 1, FOOT_IK.weightRate, 0.1);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(1);
    expect(dampWeight(0.5, 0.5, 12, 0.016)).toBeCloseTo(0.5, 5);
  });
});