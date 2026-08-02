/**
 * Island heightfield + Poly Haven PBR ground (grass inland, sand shore, rock scatter).
 */

import * as THREE from "three";
import { loadTerrainPBR, makeTerrainMaterial } from "./TerrainTextureLoader.js";
import { buildIslandWorldDecor } from "./IslandWorldDecor.js";
import {
  collectIslandGroundMeshes,
  collectIslandObstacleMeshes,
} from "./islandCollision.js";

export const ISLAND_SIZE = 96;
export const ISLAND_SEGMENTS = 128;
const SEGMENTS = ISLAND_SEGMENTS;

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

export function islandHeight(x, z) {
  const half = ISLAND_SIZE / 2;
  const nx = x / half;
  const nz = z / half;
  const dist = Math.sqrt(nx * nx + nz * nz);
  const edge = Math.max(0, 1 - Math.pow(dist, 2.15));
  if (edge <= 0) return -2.5;

  const hills =
    smoothNoise(x * 0.055, z * 0.055) * 2.4 +
    smoothNoise(x * 0.13 + 40, z * 0.13) * 1.15 +
    smoothNoise(x * 0.26, z * 0.26 + 20) * 0.5;
  // Walkable centre ~Y=0 — game gravity / character root align to heightfield baseline.
  const plateau = 0.12 + hills;
  return plateau * edge - 0.12;
}

/** Land mass mask (1 = island centre, 0 = off-island water). Used for nav walkability. */
export function islandLandFactor(x, z) {
  const half = ISLAND_SIZE / 2;
  const nx = x / half;
  const nz = z / half;
  const dist = Math.sqrt(nx * nx + nz * nz);
  return Math.max(0, 1 - Math.pow(dist, 2.15));
}

/** Shore/sand splat mask only — not walkability. */
export function islandEdgeFactor(x, z) {
  const half = ISLAND_SIZE / 2;
  const dist = Math.sqrt((x / half) ** 2 + (z / half) ** 2);
  return Math.max(0, Math.min(1, (dist - 0.55) / 0.38));
}

/**
 * @param {THREE.Group} root
 * @returns {Promise<{ terrainMesh: THREE.Mesh, terrainMeshes: THREE.Mesh[], clampRadius: number }>}
 */
function buildHeightfieldGeometry() {
  const geo = new THREE.PlaneGeometry(ISLAND_SIZE, ISLAND_SIZE, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const splat = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = islandHeight(x, z);
    pos.setY(i, y);
    const edge = islandEdgeFactor(x, z);
    const sandW = Math.pow(edge, 1.4);
    const grassW = Math.max(0, 1 - sandW * 1.15);
    splat[i * 2] = grassW;
    splat[i * 2 + 1] = sandW;
    colors[i * 3] = 0.55 + grassW * 0.2;
    colors[i * 3 + 1] = 0.5 + grassW * 0.25;
    colors[i * 3 + 2] = 0.45 + sandW * 0.15;
  }
  pos.needsUpdate = true;
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("splat", new THREE.BufferAttribute(splat, 2));
  geo.computeVertexNormals();
  return geo;
}

export async function buildIslandTerrain(root) {
  let grassMaps;
  let sandMaps;
  let landMaps;
  try {
    [grassMaps, sandMaps, landMaps] = await Promise.all([
      loadTerrainPBR("/textures/terrain/aerial_grass_rock", "aerial_grass_rock", { repeat: 10 }),
      loadTerrainPBR("/textures/terrain/coast_sand_rocks_02", "coast_sand_rocks_02", { repeat: 12 }),
      loadTerrainPBR("/textures/terrain/coast_land_rocks_01", "coast_land_rocks_01", { repeat: 10 }),
    ]);
  } catch (err) {
    console.warn("[island] PBR textures unavailable — vertex-color terrain:", err.message);
    grassMaps = sandMaps = landMaps = null;
  }

  const geo = buildHeightfieldGeometry();

  const terrainMat = grassMaps?.map
    ? makeTerrainMaterial(grassMaps, {
        color: 0xffffff,
        roughness: 0.92,
        metalness: 0.02,
      })
    : new THREE.MeshStandardMaterial({
        color: 0x4a7a3a,
        roughness: 0.92,
        metalness: 0.02,
        vertexColors: true,
      });
  const terrainMesh = new THREE.Mesh(geo, terrainMat);
  terrainMesh.name = "island-terrain";
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = false;
  root.add(terrainMesh);

  const beachGeo = new THREE.PlaneGeometry(ISLAND_SIZE * 1.02, ISLAND_SIZE * 1.02, 64, 64);
  beachGeo.rotateX(-Math.PI / 2);
  const bPos = beachGeo.attributes.position;
  for (let i = 0; i < bPos.count; i++) {
    const x = bPos.getX(i);
    const z = bPos.getZ(i);
    const y = islandHeight(x, z);
    bPos.setY(i, y + 0.03);
  }
  bPos.needsUpdate = true;
  beachGeo.computeVertexNormals();

  const sandMat = sandMaps?.map
    ? makeTerrainMaterial(sandMaps, {
        color: 0xffffff,
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      })
    : new THREE.MeshStandardMaterial({
        color: 0xc4a574,
        roughness: 0.95,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        vertexColors: true,
      });
  const beachMesh = new THREE.Mesh(beachGeo, sandMat);
  beachMesh.name = "island-beach-overlay";
  beachMesh.receiveShadow = true;
  root.add(beachMesh);

  const rockMat = landMaps?.map
    ? makeTerrainMaterial(landMaps)
    : new THREE.MeshStandardMaterial({ color: 0x6a6a62, roughness: 0.9 });
  const rocks = new THREE.Group();
  rocks.name = "island-rock-scatter";
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rng = (n) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
  for (let i = 0; i < 28; i++) {
    const x = (rng(i * 3) - 0.5) * ISLAND_SIZE * 0.75;
    const z = (rng(i * 5 + 1) - 0.5) * ISLAND_SIZE * 0.75;
    const y = islandHeight(x, z);
    if (y < 0.4 || islandEdgeFactor(x, z) > 0.65) continue;
    const rock = new THREE.Mesh(rockGeo, rockMat);
    const s = 0.35 + rng(i) * 0.9;
    rock.scale.set(s * 1.2, s * 0.7, s);
    rock.position.set(x, y + s * 0.35, z);
    rock.rotation.set(rng(i + 2) * 0.4, rng(i + 4) * Math.PI * 2, rng(i + 6) * 0.3);
    rock.name = `island-rock-${i}`;
    rock.castShadow = true;
    rock.receiveShadow = true;
    rocks.add(rock);
  }
  root.add(rocks);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(ISLAND_SIZE * 0.72, 96),
    new THREE.MeshStandardMaterial({
      color: 0x1a5a7a,
      roughness: 0.15,
      metalness: 0.35,
      transparent: true,
      opacity: 0.82,
      envMapIntensity: 1.2,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.45;
  water.name = "island-water";
  root.add(water);

  let decorObstacles = [];
  try {
    const decor = await buildIslandWorldDecor(root);
    decorObstacles = decor.obstacleMeshes || [];
  } catch (err) {
    console.warn("[island] world decor:", err.message);
  }

  const cardinalWalls = [];
  const wallMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  for (const { x, z } of [
    { x: 11, z: 5 },
    { x: -11, z: 5 },
    { x: 0, z: -4 },
    { x: 0, z: 12 },
  ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.6, 2.8), wallMat);
    const y = islandHeight(x, z);
    wall.position.set(x, y + 1.8, z);
    wall.name = "island-cardinal-wall";
    wall.castShadow = false;
    wall.receiveShadow = false;
    root.add(wall);
    cardinalWalls.push(wall);
  }

  const groundMeshes = collectIslandGroundMeshes(root, [terrainMesh, beachMesh]);
  const collected = collectIslandObstacleMeshes(root);
  const seen = new Set();
  const propMeshes = [];
  for (const m of [...cardinalWalls, ...decorObstacles, ...collected]) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    propMeshes.push(m);
  }

  return {
    terrainMesh,
    terrainMeshes: groundMeshes,
    groundMeshes,
    propMeshes,
    obstacleMeshes: propMeshes,
    clampRadius: ISLAND_SIZE * 0.42,
  };
}

/** Bilinear height sample on the visual heightfield grid (128², matches terrain mesh). */
export function sampleIslandHeight(x, z) {
  const half = ISLAND_SIZE / 2;
  const gs = ISLAND_SIZE / SEGMENTS;
  const gx = (x + half) / gs;
  const gz = (z + half) / gs;
  const ix = Math.max(0, Math.min(SEGMENTS - 1, Math.floor(gx)));
  const iz = Math.max(0, Math.min(SEGMENTS - 1, Math.floor(gz)));
  const fx = gx - ix;
  const fz = gz - iz;
  const x0 = -half + ix * gs;
  const z0 = -half + iz * gs;
  const x1 = x0 + gs;
  const z1 = z0 + gs;
  const h00 = islandHeight(x0, z0);
  const h10 = islandHeight(x1, z0);
  const h01 = islandHeight(x0, z1);
  const h11 = islandHeight(x1, z1);
  const hx0 = h00 * (1 - fx) + h10 * fx;
  const hx1 = h01 * (1 - fx) + h11 * fx;
  return hx0 * (1 - fz) + hx1 * fz;
}