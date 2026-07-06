/**
 * Break-apart chunk VFX when harvest nodes lose material per hit.
 */

import * as THREE from "three";

const POOL = [];
const ACTIVE = [];
const MAX_POOL = 48;

function acquireChunk(color) {
  let mesh = POOL.pop();
  if (!mesh) {
    const geo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05 }),
    );
    mesh.castShadow = true;
  } else {
    mesh.material.color.setHex(color);
    mesh.visible = true;
  }
  return mesh;
}

function releaseChunk(mesh) {
  mesh.visible = false;
  mesh.parent?.remove(mesh);
  if (POOL.length < MAX_POOL) POOL.push(mesh);
}

/**
 * @param {THREE.Object3D} parent
 * @param {THREE.Vector3} worldPos
 * @param {number} colorHex
 * @param {number} [count]
 * @param {number} [impulse]
 */
export function spawnHarvestChunks(parent, worldPos, colorHex, count = 6, impulse = 4) {
  if (!parent) return;
  const color = colorHex;
  for (let i = 0; i < count; i++) {
    const mesh = acquireChunk(color);
    parent.add(mesh);
    mesh.position.copy(worldPos);
    mesh.position.x += (Math.random() - 0.5) * 0.4;
    mesh.position.y += Math.random() * 0.35;
    mesh.position.z += (Math.random() - 0.5) * 0.4;
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * impulse,
      2 + Math.random() * 3,
      (Math.random() - 0.5) * impulse,
    );
    ACTIVE.push({ mesh, vel, life: 1.4 + Math.random() * 0.4, age: 0 });
  }
}

export function updateHarvestChunks(dt, scene) {
  const g = -11;
  for (let i = ACTIVE.length - 1; i >= 0; i--) {
    const p = ACTIVE[i];
    p.age += dt;
    p.vel.y += g * dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += dt * 5;
    p.mesh.rotation.z += dt * 4;
    const t = p.age / p.life;
    if (t >= 1) {
      releaseChunk(p.mesh);
      ACTIVE.splice(i, 1);
      continue;
    }
    p.mesh.material.opacity = 1 - t;
    p.mesh.material.transparent = t > 0.55;
  }
}

export function clearHarvestChunks() {
  for (const p of ACTIVE) releaseChunk(p.mesh);
  ACTIVE.length = 0;
}