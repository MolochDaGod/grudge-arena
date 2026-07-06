/**
 * Procedural island heightfield — combat sandbox terrain with gentle hills.
 * Mirrors probe RTS island play mode: sculpted plateau + grass tones.
 */

import * as THREE from 'three';

const ISLAND_SIZE = 96;
const SEGMENTS = 96;

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  return (
    a * (1 - ux) * (1 - uz) +
    b * ux * (1 - uz) +
    c * (1 - ux) * uz +
    d * ux * uz
  );
}

function islandHeight(x, z) {
  const half = ISLAND_SIZE / 2;
  const nx = x / half;
  const nz = z / half;
  const dist = Math.sqrt(nx * nx + nz * nz);
  const edge = Math.max(0, 1 - Math.pow(dist, 2.2));
  if (edge <= 0) return -2;

  const hills =
    smoothNoise(x * 0.06, z * 0.06) * 2.2 +
    smoothNoise(x * 0.14 + 40, z * 0.14) * 1.1 +
    smoothNoise(x * 0.28, z * 0.28 + 20) * 0.45;
  const plateau = 1.8 + hills;
  return plateau * edge - 0.15;
}

/**
 * @param {THREE.Group} root
 * @returns {{ terrainMesh: THREE.Mesh, terrainMeshes: THREE.Mesh[], clampRadius: number }}
 */
export function buildIslandTerrain(root) {
  const geo = new THREE.PlaneGeometry(ISLAND_SIZE, ISLAND_SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, islandHeight(x, z));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const terrainMesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: 0x4a7a3a,
      roughness: 0.92,
      metalness: 0.02,
      vertexColors: false,
    }),
  );
  terrainMesh.name = 'island-terrain';
  terrainMesh.receiveShadow = true;
  root.add(terrainMesh);

  const sandRing = new THREE.Mesh(
    new THREE.RingGeometry(ISLAND_SIZE * 0.46, ISLAND_SIZE * 0.52, 64),
    new THREE.MeshStandardMaterial({
      color: 0xc4a86a,
      roughness: 1,
      metalness: 0,
    }),
  );
  sandRing.rotation.x = -Math.PI / 2;
  sandRing.position.y = -0.35;
  sandRing.receiveShadow = true;
  root.add(sandRing);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(ISLAND_SIZE * 0.65, 64),
    new THREE.MeshStandardMaterial({
      color: 0x1a4a6a,
      roughness: 0.25,
      metalness: 0.15,
      transparent: true,
      opacity: 0.75,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.5;
  root.add(water);

  return {
    terrainMesh,
    terrainMeshes: [terrainMesh],
    clampRadius: ISLAND_SIZE * 0.42,
  };
}

/** Bilinear height sample (matches gameplay raycast for AI / spawn). */
export function sampleIslandHeight(x, z) {
  return islandHeight(x, z);
}