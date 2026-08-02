import { describe, it, expect } from 'vitest';
import { classifyOmniDir, resolveOmniLocoBaked, LOCO_STATES } from '../src/omniLoco.js';
import { idleVarietyBakedForWeapon } from '../src/idleVariety.js';
import { BAKED_DIR_RELS } from '../src/bakedAnimLoader.js';

describe('omni locomotion', () => {
  it('classifies 8-way sectors from local move vector', () => {
    expect(classifyOmniDir(0, 1)).toBe('forward');
    expect(classifyOmniDir(1, 0)).toBe('right');
    expect(classifyOmniDir(0, -1)).toBe('backward');
    expect(classifyOmniDir(-1, 0)).toBe('left');
    expect(classifyOmniDir(0.5, 0.5)).toBe('forward-right');
    expect(classifyOmniDir(-0.5, 0.5)).toBe('forward-left');
    expect(classifyOmniDir(0, 0)).toBe('forward');
  });

  it('resolves direction-specific baked paths for sword_shield pack', () => {
    const back = resolveOmniLocoBaked('greatsword', 'walk', 'backward');
    expect(back).toBe(BAKED_DIR_RELS.sword_shield.runBack);
    const left = resolveOmniLocoBaked('greatsword', 'run', 'left');
    expect(left).toBe(BAKED_DIR_RELS.sword_shield.strafeLeft);
    for (const st of LOCO_STATES) {
      const rel = resolveOmniLocoBaked('greatsword', st, 'forward');
      expect(rel).toBeTruthy();
    }
  });

  it('idle variety excludes primary idle and returns alternates', () => {
    const primary = 'sword_shield/sword and shield idle';
    const alts = idleVarietyBakedForWeapon('greatsword', primary);
    expect(alts.length).toBeGreaterThan(0);
    expect(alts).not.toContain(primary);
  });
});