import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { findBip001Bone, BIP001_ALIASES } from '../src/engine/Bip001Bones.js';

function makeSpacedRig() {
  const root = new THREE.Group();
  const pelvis = new THREE.Bone();
  pelvis.name = 'Bip001 Pelvis';
  const thigh = new THREE.Bone();
  thigh.name = 'Bip001 L Thigh';
  const calf = new THREE.Bone();
  calf.name = 'Bip001 L Calf';
  const foot = new THREE.Bone();
  foot.name = 'Bip001 L Foot';
  pelvis.add(thigh);
  thigh.add(calf);
  calf.add(foot);

  const geo = new THREE.BoxGeometry(0.4, 1.6, 0.4);
  const skinIndex = new Uint16Array(geo.attributes.position.count * 4);
  const skinWeight = new Float32Array(geo.attributes.position.count * 4);
  for (let i = 0; i < geo.attributes.position.count; i++) {
    skinIndex[i * 4] = 0;
    skinWeight[i * 4] = 1;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));

  const body = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
  body.name = 'WK_body_A';
  body.add(pelvis);
  body.bind(new THREE.Skeleton([pelvis, thigh, calf, foot]));
  root.add(body);
  root.updateMatrixWorld(true);
  return root;
}

describe('Bip001Bones', () => {
  it('finds spaced D1 pelvis names on the animation armature', () => {
    const root = makeSpacedRig();
    const pelvis = findBip001Bone(root, BIP001_ALIASES.pelvis);
    expect(pelvis?.name).toBe('Bip001 Pelvis');
  });

  it('finds leg chain with spaced bone names', () => {
    const root = makeSpacedRig();
    expect(findBip001Bone(root, BIP001_ALIASES.leftFoot)?.name).toBe('Bip001 L Foot');
  });
});