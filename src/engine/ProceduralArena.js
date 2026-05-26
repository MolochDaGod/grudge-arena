/**
 * ProceduralArena — WoW-style PvP arena built entirely from Three.js geometry.
 *
 * Layout (top-down):
 *
 *       [N pillar]
 *   ___________________
 *  /                   \
 * | [W]     ·     [E]  |   ← 4 stone pillars at N/S/E/W (LoS blockers)
 *  \___________________/
 *       [S pillar]
 *
 * Dimensions: ~34m diameter floor (WoW Nagrand arena is ~34×34 yd)
 * Materials: sandy floor, stone pillars/walls, dark rock boulders
 *
 * Usage:
 *   import { buildArena } from './ProceduralArena.js';
 *   const { group, terrainMeshes } = buildArena(scene);
 *   // group is already added to scene; terrainMeshes = collidable ground surfaces
 */

import * as THREE from 'three';

// ── Material palette ────────────────────────────────────────────────
const MAT = {
  sand: new THREE.MeshStandardMaterial({
    color: 0xc2a46a,
    roughness: 0.92,
    metalness: 0.0,
  }),
  sandDark: new THREE.MeshStandardMaterial({
    color: 0xa08850,
    roughness: 0.95,
    metalness: 0.0,
  }),
  stone: new THREE.MeshStandardMaterial({
    color: 0x888070,
    roughness: 0.85,
    metalness: 0.05,
  }),
  stoneDark: new THREE.MeshStandardMaterial({
    color: 0x5a5248,
    roughness: 0.9,
    metalness: 0.08,
  }),
  rock: new THREE.MeshStandardMaterial({
    color: 0x6a6055,
    roughness: 0.88,
    metalness: 0.04,
  }),
  wallTop: new THREE.MeshStandardMaterial({
    color: 0x9a9080,
    roughness: 0.8,
    metalness: 0.06,
  }),
};

// ── Helpers ─────────────────────────────────────────────────────────

function box(w, h, d, mat, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cylinder(rt, rb, h, seg, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Rounded box approximated with BoxGeometry (good enough for a pillar)
function pillar(group, x, z) {
  const BASE_W = 3.0, BASE_H = 0.6, BASE_D = 3.0;
  const SHAFT_W = 2.4, SHAFT_H = 4.2, SHAFT_D = 2.4;
  const CAP_W  = 2.8, CAP_H  = 0.5, CAP_D  = 2.8;

  // Base slab
  const base = box(BASE_W, BASE_H, BASE_D, MAT.stoneDark);
  base.position.set(x, BASE_H / 2, z);
  group.add(base);

  // Shaft
  const shaft = box(SHAFT_W, SHAFT_H, SHAFT_D, MAT.stone);
  shaft.position.set(x, BASE_H + SHAFT_H / 2, z);
  group.add(shaft);

  // Capital
  const cap = box(CAP_W, CAP_H, CAP_D, MAT.stoneDark);
  cap.position.set(x, BASE_H + SHAFT_H + CAP_H / 2, z);
  group.add(cap);

  return [base, shaft, cap];
}

// ── Main builder ─────────────────────────────────────────────────────

/**
 * Build the arena and add it to the scene.
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group, terrainMeshes: THREE.Mesh[] }}
 */
export function buildArena(scene) {
  const group = new THREE.Group();
  group.name = 'proceduralArena';

  const terrainMeshes = []; // surfaces returned for AoEIndicator raycasting

  const FLOOR_R   = 17;  // arena floor radius (metres)
  const WALL_H    = 3.2; // perimeter wall height
  const WALL_T    = 1.4; // wall thickness
  const WALL_SEGS = 32;  // cylinder segments for wall ring

  // ── Floor ──────────────────────────────────────────────────────────
  // Two concentric cylinders: a lighter centre + a darker ring border
  const floorMain = new THREE.Mesh(
    new THREE.CylinderGeometry(FLOOR_R - 1.5, FLOOR_R - 1.5, 0.25, 64),
    MAT.sand,
  );
  floorMain.position.y = -0.125;
  floorMain.receiveShadow = true;
  group.add(floorMain);
  terrainMeshes.push(floorMain);

  const floorBorder = new THREE.Mesh(
    new THREE.CylinderGeometry(FLOOR_R, FLOOR_R - 1.5, 0.25, 64, 1, true),
    MAT.sandDark,
  );
  floorBorder.position.y = -0.125;
  floorBorder.receiveShadow = true;
  group.add(floorBorder);

  // ── Perimeter wall (ring) ──────────────────────────────────────────
  // Outer solid cylinder wall
  const wallOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(FLOOR_R + WALL_T, FLOOR_R + WALL_T, WALL_H, WALL_SEGS),
    MAT.stone,
  );
  wallOuter.position.y = WALL_H / 2;
  wallOuter.castShadow = true;
  wallOuter.receiveShadow = true;
  group.add(wallOuter);

  // Inner ring face (visible from inside the arena)
  const wallInner = new THREE.Mesh(
    new THREE.CylinderGeometry(FLOOR_R, FLOOR_R, WALL_H, WALL_SEGS, 1, true),
    MAT.stoneDark,
  );
  wallInner.position.y = WALL_H / 2;
  wallInner.material.side = THREE.BackSide; // face inward
  group.add(wallInner);

  // Wall crenellations (merlons) — equally spaced boxes around the top
  const MERLON_COUNT = 24;
  const MERLON_H = 0.7, MERLON_W = 1.8, MERLON_D = WALL_T * 1.2;
  for (let i = 0; i < MERLON_COUNT; i++) {
    const angle = (i / MERLON_COUNT) * Math.PI * 2;
    const r = FLOOR_R + WALL_T / 2;
    const m = box(MERLON_W, MERLON_H, MERLON_D, MAT.wallTop, 0, angle + Math.PI / 2, 0);
    m.position.set(
      Math.sin(angle) * r,
      WALL_H + MERLON_H / 2,
      Math.cos(angle) * r,
    );
    group.add(m);
  }

  // ── 4 LoS pillars (N / S / E / W) ─────────────────────────────────
  const PILLAR_R = 9.5; // distance from centre
  const PILLAR_POSITIONS = [
    [0, -PILLAR_R],      // North
    [0,  PILLAR_R],      // South
    [-PILLAR_R, 0],      // West
    [ PILLAR_R, 0],      // East
  ];
  for (const [x, z] of PILLAR_POSITIONS) {
    pillar(group, x, z);
  }

  // ── Scatter boulders (smaller LoS obstacles) ───────────────────────
  // 8 boulders placed at 45° angles, midway between centre and wall
  const BOULDER_POSITIONS = [
    { x:  6.5, z:  6.5 }, { x: -6.5, z:  6.5 },
    { x:  6.5, z: -6.5 }, { x: -6.5, z: -6.5 },
    { x: 12.5, z:  0   }, { x:-12.5, z:  0   },
    { x:  0,   z: 12.5 }, { x:  0,   z:-12.5 },
  ];
  const boulderGeo = [
    new THREE.DodecahedronGeometry(0.85, 0),
    new THREE.DodecahedronGeometry(0.65, 0),
    new THREE.DodecahedronGeometry(1.05, 0),
  ];
  BOULDER_POSITIONS.forEach((p, i) => {
    const geo = boulderGeo[i % boulderGeo.length];
    const m = new THREE.Mesh(geo, MAT.rock);
    m.position.set(p.x, 0.55, p.z);
    m.rotation.set(
      Math.random() * 0.8,
      Math.random() * Math.PI * 2,
      Math.random() * 0.5,
    );
    m.scale.set(
      0.9 + Math.random() * 0.4,
      0.7 + Math.random() * 0.5,
      0.9 + Math.random() * 0.4,
    );
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  });

  // ── Team spawn pads (raised coloured circles for visual clarity) ───
  const spawnPads = [
    { x: -13, z: 0, color: 0x3366ff }, // Team A — west
    { x:  13, z: 0, color: 0xff3333 }, // Team B — east
  ];
  for (const sp of spawnPads) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.5, 0.1, 32),
      new THREE.MeshStandardMaterial({
        color: sp.color,
        roughness: 0.7,
        metalness: 0.1,
        transparent: true,
        opacity: 0.35,
      }),
    );
    pad.position.set(sp.x, 0.05, sp.z);
    pad.receiveShadow = true;
    group.add(pad);

    // Glow ring on top of pad
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.5, 32),
      new THREE.MeshBasicMaterial({
        color: sp.color,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(sp.x, 0.12, sp.z);
    group.add(ring);
  }

  // ── Gate archways (simple stone arch framing each team entrance) ───
  const archPositions = [
    { x: -FLOOR_R + 0.8, z: 0, ry: Math.PI / 2 }, // west gate
    { x:  FLOOR_R - 0.8, z: 0, ry: -Math.PI / 2 }, // east gate
  ];
  for (const ap of archPositions) {
    // Two pillars
    const lp = box(1.2, 4, 1.2, MAT.stoneDark);
    lp.position.set(ap.x, 2, ap.z - 2);
    lp.rotation.y = ap.ry;
    group.add(lp);

    const rp = box(1.2, 4, 1.2, MAT.stoneDark);
    rp.position.set(ap.x, 2, ap.z + 2);
    rp.rotation.y = ap.ry;
    group.add(rp);

    // Lintel
    const lintel = box(1.2, 0.8, 5.4, MAT.stone);
    lintel.position.set(ap.x, 4.4, ap.z);
    lintel.rotation.y = ap.ry;
    group.add(lintel);
  }

  scene.add(group);

  return { group, terrainMeshes };
}

/**
 * Arena spawn positions for two teams of 3.
 * Team A spawns west, Team B east — mirroring WoW arena layout.
 */
export function getArenaSpawnPosition(teamId, slot, teamSize) {
  const xBase = teamId === 'A' ? -11 : 11;
  const spread = 3.5;
  const zOffset = (slot - (teamSize - 1) / 2) * spread;
  return new THREE.Vector3(xBase, 0, zOffset);
}

export function getArenaSpawnFacing(teamId) {
  return teamId === 'A' ? Math.PI / 2 : -Math.PI / 2;
}

/** Clamp radius (slightly smaller than floor so characters don't touch wall) */
export const ARENA_CLAMP_RADIUS = 14.5;
