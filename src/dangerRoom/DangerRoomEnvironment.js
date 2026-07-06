/**
 * Procedural Danger Room chamber — vanilla Three.js port of arpg-game DangerRoomEnvironment.
 */

import * as THREE from "three";
import { ROOM_PRESETS } from "./roomPresets.js";
import { loadColosseumMap } from "./ColosseumMap.js";
import { buildIslandTerrain } from "./IslandTerrain.js";

const HALF = 16;
const HEIGHT = 18;
const DJ_FLOOR_Y = 4.9;
const DJ_DEPTH = 3;

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
  const isColosseum = presetId === "colosseum";
  const isIsland = presetId === "island";

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
  if (!isIsland) root.add(floor);

  if (preset.showGrid) {
    root.add(makeGridHelper(preset));
  }

  let islandTerrain = null;
  if (isIsland) {
    islandTerrain = buildIslandTerrain(root);
  }

  const wallMat = new THREE.MeshStandardMaterial({ color: preset.wallColor, roughness: 0.85 });
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HEIGHT), wallMat);
  backWall.position.set(0, HEIGHT / 2, -HALF);
  backWall.receiveShadow = true;
  if (!isIsland) root.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HEIGHT), wallMat);
  leftWall.position.set(-HALF, HEIGHT / 2, 0);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.receiveShadow = true;
  if (!isIsland) root.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HEIGHT), wallMat);
  rightWall.position.set(HALF, HEIGHT / 2, 0);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.receiveShadow = true;
  if (!isIsland) root.add(rightWall);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF * 2, HALF * 2),
    new THREE.MeshStandardMaterial({ color: preset.ceilColor, roughness: 1 }),
  );
  ceiling.position.y = HEIGHT;
  ceiling.rotation.x = Math.PI / 2;
  ceiling.receiveShadow = true;
  if (!isIsland) root.add(ceiling);

  const pillarPositions = [
    [-HALF + 1.2, -HALF + 1.2],
    [HALF - 1.2, -HALF + 1.2],
    [-HALF + 1.2, HALF - 1.2],
    [HALF - 1.2, HALF - 1.2],
  ];
  const obstacleMeshes = [];
  if (!isIsland) for (const [x, z] of pillarPositions) {
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

  // DJ alcove + neon frame (hidden for colosseum / outdoor island)
  const djGroup = new THREE.Group();
  djGroup.visible = !isColosseum && !isIsland;
  djGroup.position.set(0, 0, HALF);
  const djFloor = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.3, DJ_DEPTH + 0.4),
    new THREE.MeshStandardMaterial({ color: 0x0c0f17, metalness: 0.5, roughness: 0.6 }),
  );
  djFloor.position.set(0, DJ_FLOOR_Y - 0.15, DJ_DEPTH / 2);
  djFloor.receiveShadow = true;
  djGroup.add(djFloor);
  const djWall = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 5.2),
    new THREE.MeshStandardMaterial({ color: 0x0c0f17, roughness: 0.9 }),
  );
  djWall.position.set(0, (DJ_FLOOR_Y + 9.6) / 2, DJ_DEPTH);
  djWall.receiveShadow = true;
  djGroup.add(djWall);
  const frameColor = preset.pillarGlowColor || 0xff2bd6;
  const frames = [
    [7.5, 0.16, 0, DJ_FLOOR_Y],
    [7.5, 0.16, 0, 9.4],
    [0.16, 4.5, -3.6, (DJ_FLOOR_Y + 9.4) / 2],
    [0.16, 4.5, 3.6, (DJ_FLOOR_Y + 9.4) / 2],
  ];
  for (const [w, h, x, y] of frames) {
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: frameColor,
        transparent: true,
        opacity: 0.85,
        toneMapped: false,
      }),
    );
    frame.position.set(x, y, -0.08);
    frame.rotation.y = Math.PI;
    djGroup.add(frame);
  }
  root.add(djGroup);

  // Heavy training bags — side anchors with local spot fill
  const bagMat = new THREE.MeshStandardMaterial({
    color: 0x5c3d1e,
    roughness: 0.82,
    metalness: 0.08,
  });
  const bagPositions = [
    [-9, 0, -4],
    [9, 0, -4],
    [-7, 0, 6],
    [7, 0, 6],
  ];
  if (!isIsland) for (const [x, , z] of bagPositions) {
    const bagGroup = new THREE.Group();
    bagGroup.position.set(x, 0, z);
    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.7, roughness: 0.35 }),
    );
    chain.position.y = HEIGHT - 1.1;
    bagGroup.add(chain);
    const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 2.4, 12), bagMat);
    bag.position.y = HEIGHT - 2.8;
    bag.castShadow = true;
    bag.receiveShadow = true;
    bagGroup.add(bag);
    const bagLight = new THREE.PointLight(0xffe8c0, 1.1, 10);
    bagLight.position.set(0, HEIGHT - 2.5, 0.8);
    bagGroup.add(bagLight);
    root.add(bagGroup);
    obstacleMeshes.push(bag);
  }

  for (const a of preset.accents) {
    const light = new THREE.PointLight(a.color, a.intensity, a.distance);
    light.position.set(a.pos[0], a.pos[1], a.pos[2]);
    root.add(light);
  }

  scene.add(root);
  scene.background = new THREE.Color(preset.background);
  if (isIsland) {
    scene.fog = new THREE.FogExp2(preset.fogColor, 0.008);
  } else {
    scene.fog = new THREE.Fog(preset.fogColor, preset.fogNear, preset.fogFar);
  }

  const env = {
    root,
    preset,
    presetId,
    terrainMeshes: islandTerrain?.terrainMeshes ?? [floor],
    obstacleMeshes,
    clampRadius: islandTerrain?.clampRadius ?? preset.clampRadius,
    colosseumRoot: null,
    showDjBooth: !isColosseum && !isIsland,
    outdoor: !!preset.outdoor,
  };

  if (isColosseum) {
    loadColosseumMap(scene)
      .then((map) => {
        env.colosseumRoot = map.root;
        env.terrainMeshes = map.terrainMeshes.length ? map.terrainMeshes : [floor];
        env.obstacleMeshes = [...obstacleMeshes, ...map.obstacleMeshes];
        backWall.visible = false;
        leftWall.visible = false;
        rightWall.visible = false;
        ceiling.visible = false;
        floor.visible = false;
      })
      .catch((err) => console.warn("[danger] colosseum map:", err.message));
  }

  return env;
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