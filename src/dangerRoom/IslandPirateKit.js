/**
 * Kenney Pirate Kit — enemy fleet, fort, claim flags, wildlife, siege props.
 * Player boat dock is built separately in IslandBoatDock.js.
 */

import * as THREE from "three";
import { islandAssetUrl } from "../assetConfig.js";
import { islandHeight, islandEdgeFactor } from "./IslandTerrain.js";
import { getPirateIslandState } from "./pirateIslandStore.js";
import {
  loadPirateModel,
  groundPirateInstance,
  tagPirateInstance,
} from "./IslandPirateLoader.js";
import { DEMO_WRECK_LAYOUT, DAMAGE_VARIANTS } from "./IslandPirateDamage.js";
import { buildBoatDock, BOAT_DOCK_ANCHOR } from "./IslandBoatDock.js";

/** Enemy fleet — pirate sails offshore. */
const ENEMY_FLEET = [
  { file: "ship-pirate-large", x: -22, z: -10, ry: 0.55, collider: true },
  { file: "ship-pirate-medium", x: 26, z: -16, ry: 1.35, collider: true },
  { file: "ship-pirate-small", x: -16, z: 20, ry: 0.2, collider: true },
];

/** Fort — towers, walls, cannons (centre approach). */
const FORT_LAYOUT = [
  { file: "tower-complete-large", x: -7, z: -9, collider: true, kind: "tower" },
  { file: "tower-watch", x: 1, z: -7, ry: -0.3, collider: true, kind: "tower" },
  { file: "tower-complete-small", x: 11, z: -5, ry: 0.15, collider: true, kind: "tower" },
  { file: "castle-gate", x: 5, z: 11, ry: Math.PI, collider: true, kind: "wall" },
  { file: "castle-wall", x: 2, z: 13, ry: 0.4, collider: true, kind: "wall" },
  { file: "castle-wall", x: 9, z: 12, ry: -0.35, collider: true, kind: "wall" },
  { file: "castle-door", x: 5, z: 10, ry: Math.PI, collider: true },
  { file: "castle-window", x: 0, z: 13, ry: 0.5, collider: true },
  { file: "cannon-mobile", x: -1, z: -2, ry: 0.9, collider: true, kind: "cannon" },
  { file: "cannon", x: 6, z: -1, ry: -1.1, collider: true, kind: "cannon" },
  { file: "cannon-ball", x: 7, z: -2 },
  { file: "structure-fence", x: 12, z: 6, ry: 0.8, collider: true },
  { file: "structure-fence-sides", x: 13, z: 7, ry: 0.8, collider: true },
];

/** Claim zones — flags mark territorial control. */
const CLAIM_ZONES = [
  { zone: "north", file: "flag-pirate-high", x: -7, z: -9, yOff: 11 },
  { zone: "east", file: "flag-pirate-pennant", x: 26, z: -16, yOff: 10 },
  { zone: "dock", file: "flag-high", x: 20, z: 8, yOff: 5 },
];

/** Cardinal-axis cover near player spawn (0, 5) — wall-slide + env ray probes. */
const SPAWN_CARDINAL_BARRIERS = [
  { file: "structure-fence", x: 10, z: 5, ry: Math.PI / 2, collider: true },
  { file: "structure-fence", x: -10, z: 5, ry: Math.PI / 2, collider: true },
  { file: "tower-watch", x: 0, z: -3, collider: true, kind: "tower" },
  { file: "rocks-a", x: 0, z: 14, collider: true },
];

/** Environment scatter — rowboats, chests, tools, wildlife. */
const ENV_PROPS = [
  { file: "chest", x: 4, z: 0, ry: 0.4, collider: true },
  { file: "barrel", x: 9, z: 4 },
  { file: "barrel", x: 10, z: 3.5, ry: 0.5 },
  { file: "crate", x: 7, z: 5 },
  { file: "crate-bottles", x: 6, z: 6 },
  { file: "tool-shovel", x: -10, z: -4, ry: 1.2 },
  { file: "hole", x: -10, z: -4, collider: true },
  { file: "patch-sand-foliage", x: -12, z: -14, ry: 0.2 },
  { file: "patch-grass-foliage", x: -8, z: 12, ry: 0.7 },
  { file: "grass-patch", x: -3, z: 14 },
  { file: "grass-plant", x: 2, z: 15 },
  { file: "grass", x: -6, z: 13 },
  { file: "palm-detailed-straight", x: -10, z: 6, collider: true },
  { file: "palm-detailed-bend", x: 13, z: -2, ry: 0.4, collider: true },
  { file: "palm-straight", x: -15, z: 10, collider: true },
  { file: "palm-bend", x: 18, z: 0, ry: -0.6, collider: true },
  { file: "rocks-sand-a", x: -18, z: -6, collider: true },
  { file: "rocks-sand-b", x: 17, z: -8, collider: true },
  { file: "rocks-a", x: 15, z: 16, collider: true },
  { file: "rocks-b", x: -28, z: 4, collider: true },
];

/** @type {Map<string, THREE.Object3D>} */
export const pirateDamageRegistry = new Map();

function isSpawnClear(x, z) {
  return Math.hypot(x, z - 4) > 5 && Math.hypot(x - 10, z + 6) > 6;
}

async function placeSpec(group, obstacleMeshes, spec, styleExtra = {}) {
  if (!isSpawnClear(spec.x, spec.z)) return;

  const claims = getPirateIslandState().claims;
  const claim = spec.claimZone ? claims[spec.claimZone] : null;
  const faction =
    styleExtra.faction ||
    (spec.file.includes("pirate") || claim?.owner === "enemy" ? "enemy" : "player");

  const { root, animations } = await loadPirateModel(spec.file, {
    faction,
    sailColor: getPirateIslandState().sailColor,
    claimColor: claim?.color,
  });

  const inst = root.clone(true);
  groundPirateInstance(inst, spec);

  if (spec.claimZone || spec.kind || DAMAGE_VARIANTS[spec.file]) {
    tagPirateInstance(inst, {
      baseFile: spec.file,
      kind: spec.kind || spec.claimZone || "prop",
      faction,
      claimZone: spec.claimZone,
      maxHealth: spec.kind === "tower" ? 180 : spec.kind === "wall" ? 140 : 100,
    });
    pirateDamageRegistry.set(inst.uuid, inst);
  }

  if (spec.file === "chest" && animations.length) {
    inst.userData.mixer = new THREE.AnimationMixer(inst);
    inst.userData.mixer.clipAction(animations[0]).play();
  }

  group.add(inst);
  if (spec.collider) obstacleMeshes.push(inst);
}

function fallbackRingPlacement(index, total) {
  const t = index / Math.max(1, total);
  const angle = t * Math.PI * 2 + 0.3;
  const radius = 20 + (index % 5) * 4;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, ry: angle + Math.PI };
}

/**
 * @param {THREE.Group} root
 * @returns {Promise<{ group: THREE.Group, obstacleMeshes: THREE.Object3D[], boatDock: object | null }>}
 */
export async function buildPirateOutpost(root) {
  const group = new THREE.Group();
  group.name = "island-pirate-outpost";
  const obstacleMeshes = [];
  pirateDamageRegistry.clear();

  let manifest = null;
  try {
    const res = await fetch(islandAssetUrl("pirate-kit/manifest.json"));
    manifest = res.ok ? await res.json() : null;
  } catch {
    manifest = null;
  }

  const loadJobs = [];

  for (const spec of ENEMY_FLEET) {
    loadJobs.push(placeSpec(group, obstacleMeshes, { ...spec, kind: "enemy-ship" }));
  }
  for (const spec of FORT_LAYOUT) {
    loadJobs.push(placeSpec(group, obstacleMeshes, spec));
  }
  for (const spec of SPAWN_CARDINAL_BARRIERS) {
    loadJobs.push(placeSpec(group, obstacleMeshes, spec));
  }
  for (const spec of CLAIM_ZONES) {
    loadJobs.push(placeSpec(group, obstacleMeshes, { ...spec, collider: false }));
  }
  for (const spec of ENV_PROPS) {
    loadJobs.push(placeSpec(group, obstacleMeshes, spec));
  }
  for (const spec of DEMO_WRECK_LAYOUT) {
    loadJobs.push(placeSpec(group, obstacleMeshes, { ...spec, collider: true }));
  }

  await Promise.all(loadJobs);

  const placed = new Set([
    ...ENEMY_FLEET,
    ...FORT_LAYOUT,
    ...SPAWN_CARDINAL_BARRIERS,
    ...CLAIM_ZONES,
    ...ENV_PROPS,
    ...DEMO_WRECK_LAYOUT,
  ].map((p) => p.file));

  const allModels = manifest?.models ?? [];
  const remaining = allModels.filter((m) => !placed.has(m));
  const extraJobs = [];

  for (let i = 0; i < remaining.length; i++) {
    const file = remaining[i];
    const pos = fallbackRingPlacement(i, remaining.length);
    if (!isSpawnClear(pos.x, pos.z) || islandEdgeFactor(pos.x, pos.z) > 0.7) continue;
    extraJobs.push(
      loadPirateModel(file)
        .then(({ root: model }) => {
          const inst = model.clone(true);
          groundPirateInstance(inst, { file, ...pos });
          group.add(inst);
          if (/ship|tower|castle|rocks|cannon|structure|palm|hole/.test(file)) {
            obstacleMeshes.push(inst);
          }
        })
        .catch((err) => console.warn(`[pirate] ${file}:`, err.message)),
    );
  }

  await Promise.all(extraJobs);

  const boatDock = await buildBoatDock(group);
  if (boatDock.obstacleMeshes?.length) {
    obstacleMeshes.push(...boatDock.obstacleMeshes);
  }

  root.add(group);
  console.log(
    `[island] pirate-kit: ${group.children.length} instances, ` +
      `${allModels.length || "?"} models, dock @ (${BOAT_DOCK_ANCHOR?.x ?? "?"}, ${BOAT_DOCK_ANCHOR?.z ?? "?"})`,
  );

  return { group, obstacleMeshes, boatDock };
}

export { applyPirateDamageState, resolveDamageModel, DAMAGE_VARIANTS } from "./IslandPirateDamage.js";