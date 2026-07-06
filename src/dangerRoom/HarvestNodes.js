/**
 * Procedural island harvestables with emissive border glow.
 */

import * as THREE from "three";
import { sampleIslandHeight } from "./IslandTerrain.js";
import { NODE_GLOW, NODE_HP } from "./HarvestDefinitions.js";

const SPAWN_LAYOUT = [
  { x: 14, z: -10, type: "wood" },
  { x: -16, z: 8, type: "wood" },
  { x: 8, z: 18, type: "wood" },
  { x: -12, z: -14, type: "wood" },
  { x: 20, z: 4, type: "stone" },
  { x: -18, z: -6, type: "stone" },
  { x: 6, z: -20, type: "stone" },
  { x: -8, z: 16, type: "ore" },
  { x: 16, z: 12, type: "ore" },
  { x: -20, z: 14, type: "ore" },
];

function addGlowShell(group, colorHex, scale = 1.08) {
  const glow = new THREE.Group();
  glow.name = "harvest-glow";
  group.traverse((child) => {
    if (!child.isMesh || child.name === "harvest-glow-mesh") return;
    const shell = child.clone();
    shell.name = "harvest-glow-mesh";
    shell.scale.multiplyScalar(scale);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.42,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
    });
    shell.material = mat;
    glow.add(shell);
  });
  group.add(glow);
  return glow;
}

function buildTree() {
  const g = new THREE.Group();
  g.name = "harvest-tree";
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.45, 2.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 }),
  );
  trunk.position.y = 1.1;
  trunk.castShadow = true;
  g.add(trunk);
  const foliage = new THREE.Mesh(
    new THREE.ConeGeometry(1.35, 2.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x2d6b2d, roughness: 0.82 }),
  );
  foliage.position.y = 3.2;
  foliage.castShadow = true;
  g.add(foliage);
  return g;
}

function buildRock() {
  const g = new THREE.Group();
  g.name = "harvest-rock";
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(1.05, 0),
    new THREE.MeshStandardMaterial({ color: 0x7a7a82, roughness: 0.88, metalness: 0.08 }),
  );
  rock.position.y = 0.85;
  rock.scale.set(1.1, 0.85, 1.05);
  rock.castShadow = true;
  g.add(rock);
  return g;
}

function buildOre() {
  const g = new THREE.Group();
  g.name = "harvest-ore";
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.95, 0),
    new THREE.MeshStandardMaterial({
      color: 0x3a5a8a,
      emissive: 0x2244aa,
      emissiveIntensity: 0.35,
      roughness: 0.45,
      metalness: 0.55,
    }),
  );
  core.position.y = 0.75;
  core.castShadow = true;
  g.add(core);
  const crystal = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.9, 4),
    new THREE.MeshStandardMaterial({
      color: 0x66ccff,
      emissive: 0x3388ff,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.4,
    }),
  );
  crystal.position.set(0.4, 1.35, 0.15);
  crystal.rotation.z = 0.4;
  g.add(crystal);
  return g;
}

function buildNodeMesh(type) {
  if (type === "wood") return buildTree();
  if (type === "ore") return buildOre();
  return buildRock();
}

/**
 * @param {THREE.Group} root
 * @returns {import('./HarvestSystem.js').HarvestNodeState[]}
 */
export function spawnIslandHarvestables(root) {
  const nodes = [];
  for (const spec of SPAWN_LAYOUT) {
    const y = sampleIslandHeight(spec.x, spec.z);
    if (y < 0.2) continue;
    const group = buildNodeMesh(spec.type);
    group.position.set(spec.x, y, spec.z);
    group.rotation.y = Math.random() * Math.PI * 2;
    const glowColor = NODE_GLOW[spec.type] ?? 0x88ffaa;
    const glowGroup = addGlowShell(group, glowColor, 1.1);
    root.add(group);

    nodes.push({
      id: `harvest_${spec.type}_${spec.x}_${spec.z}`,
      type: spec.type,
      group,
      glowGroup,
      glowColor,
      hp: NODE_HP,
      maxHp: NODE_HP,
      depleted: false,
      felling: false,
      fellStart: 0,
      baseScale: 1,
      worldPos: new THREE.Vector3(spec.x, y, spec.z),
    });
  }
  return nodes;
}

/** Pulse glow shells for living nodes. */
export function pulseHarvestGlow(nodes, time) {
  const pulse = 0.32 + Math.sin(time * 2.8) * 0.12;
  for (const n of nodes) {
    if (n.depleted || !n.glowGroup) continue;
    n.glowGroup.traverse((child) => {
      if (child.isMesh && child.material?.opacity != null) {
        child.material.opacity = pulse;
      }
    });
  }
}