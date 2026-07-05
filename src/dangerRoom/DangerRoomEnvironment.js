/**
 * Procedural Danger Room chamber — vanilla Three.js port of arpg-game DangerRoomEnvironment.
 */

import * as THREE from "three";
import { ROOM_PRESETS } from "./roomPresets.js";

const HALF = 16;
const HEIGHT = 18;

function hex(n) {
  return `#${n.toString(16).padStart(6, "0")}`;
}

function makeGridHelper(preset) {
  const size = HALF * 2;
  const divisions = size;
  const grid = new THREE.GridHelper(size, divisions, preset.gridColor1, preset.gridColor2);
  grid.material.opacity = 0.45;
  grid.material.transparent = true;
  grid.position.y = 0.02;
  return grid;
}

/**
 * Build danger room geometry into the scene.
 * @returns {{ root: THREE.Group, terrainMeshes: THREE.Object3D[], obstacleMeshes: THREE.Object3D[], clampRadius: number }}
 */
export function buildDangerRoomEnvironment(scene, presetId = "holo") {
  const preset = ROOM_PRESETS[presetId] || ROOM_PRESETS.holo;
  const root = new THREE.Group();
  root.name = "danger-room";

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, HALF * 2),
    new THREE.MeshStandardMaterial({
      color: preset.floorColor,
      metalness: preset.floorMetalness,
      roughness: preset.floorRoughness,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);

  if (preset.showGrid) {
    root.add(makeGridHelper(preset));
  }

  const wallMat = new THREE.MeshStandardMaterial({ color: preset.wallColor, roughness: 0.85 });
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HEIGHT), wallMat);
  backWall.position.set(0, HEIGHT / 2, -HALF);
  backWall.receiveShadow = true;
  root.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HEIGHT), wallMat);
  leftWall.position.set(-HALF, HEIGHT / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.receiveShadow = true;
  root.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HEIGHT), wallMat);
  rightWall.position.set(HALF, HEIGHT / 2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.receiveShadow = true;
  root.add(rightWall);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, HALF * 2),
    new THREE.MeshStandardMaterial({ color: preset.ceilColor, roughness: 1 }),
  );
  ceiling.position.y = HEIGHT;
  ceiling.rotation.x = Math.PI / 2;
  ceiling.receiveShadow = true;
  root.add(ceiling);

  const pillarPositions = [
    [-HALF + 1.2, -HALF + 1.2],
    [HALF - 1.2, -HALF + 1.2],
    [-HALF + 1.2, HALF - 1.2],
    [HALF - 1.2, HALF - 1.2],
  ];
  const obstacleMeshes = [];
  for (const [x, z] of pillarPositions) {
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, HEIGHT, 0.9),
      new THREE.MeshStandardMaterial({
        color: preset.pillarColor,
        emissive: preset.pillarGlowColor,
        emissiveIntensity: 0.35,
      }),
    );
    pillar.position.set(x, HEIGHT / 2, z);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    root.add(pillar);
    obstacleMeshes.push(pillar);
  }

  // DJ alcove shell (training room vibe from dangerroom.puter.site)
  const djGroup = new THREE.Group();
  djGroup.position.set(0, 0, HALF);
  const djFloor = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.3, 3.4),
    new THREE.MeshStandardMaterial({ color: 0x0c0f17, metalness: 0.5, roughness: 0.6 }),
  );
  djFloor.position.set(0, 4.75, 1.5);
  djFloor.receiveShadow = true;
  djGroup.add(djFloor);
  root.add(djGroup);

  for (const a of preset.accents) {
    const light = new THREE.PointLight(a.color, a.intensity, a.distance);
    light.position.set(a.pos[0], a.pos[1], a.pos[2]);
    root.add(light);
  }

  scene.add(root);
  scene.background = new THREE.Color(preset.background);
  scene.fog = new THREE.Fog(preset.fogColor, preset.fogNear, preset.fogFar);

  return {
    root,
    preset,
    terrainMeshes: [floor],
    obstacleMeshes,
    clampRadius: preset.clampRadius,
  };
}

/** Swap atmosphere when user cycles presets mid-session. */
export function applyDangerRoomPreset(scene, envRoot, presetId) {
  if (!envRoot) return null;
  const preset = ROOM_PRESETS[presetId] || ROOM_PRESETS.holo;
  scene.remove(envRoot);
  envRoot.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose?.();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
      else obj.material.dispose?.();
    }
  });
  return buildDangerRoomEnvironment(scene, presetId);
}