/**
 * Combat VFX — slash trails and cast bursts anchored to character bones.
 */

import * as THREE from "three";

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();

function findBone(scene, names) {
  let hit = null;
  scene.traverse((n) => {
    if (hit || !n.isBone) return;
    if (names.some((nm) => n.name === nm || n.name?.includes(nm))) hit = n;
  });
  return hit;
}

/** Short-lived ribbon slash along weapon swing. */
export function spawnSlashTrail(scene, { color = 0xffd080, duration = 0.35 } = {}) {
  const hand =
    findBone(scene, ["Bip001_R_Hand", "Bip001 R Hand", "R_hand_container"]) ||
    scene;
  hand.getWorldPosition(_v0);
  _v1.copy(_v0);
  _v1.x += 0.55;
  _v1.y += 0.35;

  const geo = new THREE.BufferGeometry().setFromPoints([_v0, _v1]);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  scene.parent?.add(line) || scene.add(line);

  const t0 = performance.now();
  const tick = () => {
    const k = (performance.now() - t0) / (duration * 1000);
    if (k >= 1) {
      geo.dispose();
      mat.dispose();
      line.removeFromParent();
      return;
    }
    mat.opacity = 0.95 * (1 - k);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Cast burst at chest/hands for spell skills. */
export function spawnCastBurst(scene, { color = 0x88ccff, count = 24, duration = 0.5 } = {}) {
  const anchor =
    findBone(scene, ["Bip001_R_Hand", "Bip001 L Hand", "Bip001_Spine", "Bip001 Spine"]) ||
    scene;
  anchor.getWorldPosition(_v0);

  const positions = new Float32Array(count * 3);
  const velocities = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = _v0.x;
    positions[i * 3 + 1] = _v0.y + 0.9;
    positions[i * 3 + 2] = _v0.z;
    velocities.push(
      new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2.5, (Math.random() - 0.5) * 2),
    );
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color,
    size: 0.12,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  scene.parent?.add(pts) || scene.add(pts);

  const t0 = performance.now();
  const tick = () => {
    const dt = 1 / 60;
    const k = (performance.now() - t0) / (duration * 1000);
    if (k >= 1) {
      geo.dispose();
      mat.dispose();
      pts.removeFromParent();
      return;
    }
    const pos = geo.attributes.position;
    for (let i = 0; i < count; i++) {
      velocities[i].y -= 4 * dt;
      pos.array[i * 3] += velocities[i].x * dt;
      pos.array[i * 3 + 1] += velocities[i].y * dt;
      pos.array[i * 3 + 2] += velocities[i].z * dt;
    }
    pos.needsUpdate = true;
    mat.opacity = 0.9 * (1 - k);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const MELEE_CLIPS = new Set([
  "attack1", "attack2", "attack3", "attack4", "combo1", "combo2", "combo3",
  "slash1", "slash2", "slash3", "swing", "jumpAttack",
]);
const CAST_CLIPS = new Set([
  "cast", "cast2H", "aoe", "aoe2", "fire", "powerUp",
]);

/** Fire appropriate VFX when a clip plays (anim-test + arena). */
export function vfxForClip(scene, clipKey) {
  if (!scene || !clipKey) return;
  if (MELEE_CLIPS.has(clipKey)) spawnSlashTrail(scene);
  else if (CAST_CLIPS.has(clipKey)) spawnCastBurst(scene);
}