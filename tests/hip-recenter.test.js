import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HipRecenter } from '../src/engine/HipRecenter.js';

describe('HipRecenter', () => {
  it('preserves pelvis Y after foot IK drop', () => {
    const mesh = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'Bip001_Pelvis';
    hips.position.set(0, 0, 0);
    mesh.add(hips);
    mesh.updateMatrixWorld(true);

    const recenter = new HipRecenter(mesh);
    recenter.bind(hips);
    hips.position.y = -0.08;
    recenter.update(0.016, true);
    expect(hips.position.y).toBeCloseTo(-0.08, 4);
  });
});