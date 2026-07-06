/**
 * Cinematic danger-room lighting — warm key + cool rim + character spotlight.
 * Matches dangerroom.puter.site LabScene so modular heroes read clearly.
 */

import * as THREE from "three";

/**
 * @param {THREE.Scene} scene
 * @param {import('../../game.js').GrudgeArena} [arena]
 * @returns {{ lights: THREE.Light[], spotlight: THREE.SpotLight, dispose: () => void, update: (playerMesh?: THREE.Object3D) => void }}
 */
export function installDangerRoomLighting(scene, arena = null) {
  const lights = [];

  const hemi = new THREE.HemisphereLight(0xbcc8da, 0x20242c, 0.85);
  scene.add(hemi);
  lights.push(hemi);

  const key = new THREE.DirectionalLight(0xfff1dc, 1.75);
  key.position.set(8, 14, 6);
  key.castShadow = true;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 60;
  key.shadow.camera.left = -20;
  key.shadow.camera.right = 20;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  scene.add(key);
  lights.push(key);

  const rim = new THREE.DirectionalLight(0x7b8cff, 0.55);
  rim.position.set(-6, 5, -8);
  scene.add(rim);
  lights.push(rim);

  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.32);
  fill.position.set(0, 3, 9);
  scene.add(fill);
  lights.push(fill);

  const spotlight = new THREE.SpotLight(0xfff4e8, 2.4, 28, Math.PI / 5.5, 0.45, 1.2);
  spotlight.position.set(0, 11, 4);
  spotlight.castShadow = false;
  scene.add(spotlight);
  scene.add(spotlight.target);
  lights.push(spotlight);

  if (arena?.renderer) {
    arena.renderer.toneMappingExposure = 1.12;
  }

  function update(playerMesh) {
    if (!playerMesh) return;
    const p = playerMesh.position;
    spotlight.position.set(p.x + 2, 11, p.z + 5);
    spotlight.target.position.set(p.x, 1.2, p.z);
    spotlight.target.updateMatrixWorld();
  }

  function dispose() {
    for (const l of lights) scene.remove(l);
    scene.remove(spotlight.target);
  }

  return { lights, spotlight, dispose, update };
}