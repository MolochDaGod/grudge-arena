/**
 * Player boat dock — Kenney dock platform + watch tower + moorable player ship (3 sizes).
 */

import * as THREE from "three";
import {
  loadPirateModel,
  groundPirateInstance,
  tagPirateInstance,
  clearPirateLoaderCache,
} from "./IslandPirateLoader.js";
import {
  getPirateIslandState,
  subscribePirateIsland,
  PLAYER_BOAT_SIZES,
} from "./pirateIslandStore.js";

/** Shoreline dock hub — structure-platform-dock + tower. */
export const BOAT_DOCK_ANCHOR = { x: -28, z: 22, ry: 0.55 };
export const BOAT_DOCK_INTERACT_RADIUS = 9;

/**
 * @param {THREE.Group} parent
 * @returns {Promise<{ group: THREE.Group, obstacleMeshes: THREE.Object3D[], mooring: THREE.Vector3, refreshShip: () => Promise<void>, dispose: () => void }>}
 */
export async function buildBoatDock(parent) {
  const group = new THREE.Group();
  group.name = "island-boat-dock";
  const obstacleMeshes = [];
  const state = getPirateIslandState();
  let shipSlot = null;
  let unsub = null;

  const dockLayout = [
    { file: "structure-platform-dock", x: BOAT_DOCK_ANCHOR.x, z: BOAT_DOCK_ANCHOR.z, ry: BOAT_DOCK_ANCHOR.ry, collider: true, kind: "dock" },
    {
      file: "tower-complete-small",
      x: BOAT_DOCK_ANCHOR.x + 5.5,
      z: BOAT_DOCK_ANCHOR.z - 2,
      ry: BOAT_DOCK_ANCHOR.ry - 0.4,
      collider: true,
      kind: "tower",
    },
    { file: "flag", x: BOAT_DOCK_ANCHOR.x - 2, z: BOAT_DOCK_ANCHOR.z + 3, yOff: 6, claimZone: "dock" },
    { file: "boat-row-small", x: BOAT_DOCK_ANCHOR.x - 4, z: BOAT_DOCK_ANCHOR.z + 1, ry: 0.2 },
    { file: "boat-row-large", x: BOAT_DOCK_ANCHOR.x - 5.5, z: BOAT_DOCK_ANCHOR.z + 2.5, ry: -0.15 },
    { file: "tool-shovel", x: BOAT_DOCK_ANCHOR.x + 2, z: BOAT_DOCK_ANCHOR.z + 4, ry: 1.1 },
    { file: "tool-paddle", x: BOAT_DOCK_ANCHOR.x - 3.5, z: BOAT_DOCK_ANCHOR.z + 0.5, ry: 0.6 },
    { file: "chest", x: BOAT_DOCK_ANCHOR.x + 3, z: BOAT_DOCK_ANCHOR.z + 1, ry: -0.3, collider: true },
    { file: "cannon", x: BOAT_DOCK_ANCHOR.x + 6, z: BOAT_DOCK_ANCHOR.z + 1, ry: -1.4, collider: true, kind: "cannon" },
    { file: "hole", x: BOAT_DOCK_ANCHOR.x - 8, z: BOAT_DOCK_ANCHOR.z - 3, collider: true },
  ];

  async function mountPlayerShip() {
    const st = getPirateIslandState();
    const claim = st.claims.dock;
    if (shipSlot) {
      group.remove(shipSlot);
      shipSlot = null;
    }
    clearPirateLoaderCache();
    const { root, animations } = await loadPirateModel(st.boatSize, {
      faction: "player",
      sailColor: st.sailColor,
    });
    const inst = root.clone(true);
    groundPirateInstance(inst, {
      file: st.boatSize,
      x: BOAT_DOCK_ANCHOR.x - 7,
      z: BOAT_DOCK_ANCHOR.z + 5,
      ry: BOAT_DOCK_ANCHOR.ry + 0.15,
    });
    inst.userData._sailColor = st.sailColor;
    inst.userData._claimColor = claim?.color;
    tagPirateInstance(inst, {
      baseFile: st.boatSize,
      kind: "player-ship",
      faction: "player",
      maxHealth: 200,
      health: 200,
      claimZone: "dock",
    });
    if (animations.length) {
      inst.userData.mixer = new THREE.AnimationMixer(inst);
      inst.userData.mixer.clipAction(animations[0]).play();
    }
    shipSlot = inst;
    group.add(inst);
    obstacleMeshes.push(inst);
  }

  for (const spec of dockLayout) {
    const claim = spec.claimZone ? getPirateIslandState().claims[spec.claimZone] : null;
    const { root, animations } = await loadPirateModel(spec.file, {
      claimColor: claim?.color,
      faction: claim?.owner === "enemy" ? "enemy" : "player",
    });
    const inst = root.clone(true);
    groundPirateInstance(inst, spec);
    if (claim) {
      inst.userData._claimColor = claim.color;
      tagPirateInstance(inst, { baseFile: spec.file, kind: "claim-flag", claimZone: spec.claimZone });
    } else if (spec.kind) {
      tagPirateInstance(inst, {
        baseFile: spec.file,
        kind: spec.kind,
        maxHealth: spec.kind === "tower" ? 150 : 120,
      });
    }
    if (spec.file === "chest" && animations.length) {
      inst.userData.mixer = new THREE.AnimationMixer(inst);
      inst.userData.mixer.clipAction(animations[0]).play();
    }
    group.add(inst);
    if (spec.collider) obstacleMeshes.push(inst);
  }

  await mountPlayerShip();
  parent.add(group);

  unsub = subscribePirateIsland(() => {
    void mountPlayerShip();
  });

  const mooring = new THREE.Vector3(
    BOAT_DOCK_ANCHOR.x - 7,
    0,
    BOAT_DOCK_ANCHOR.z + 5,
  );

  return {
    group,
    obstacleMeshes,
    mooring,
    refreshShip: mountPlayerShip,
    dispose: () => unsub?.(),
  };
}

export function isNearBoatDock(playerPos) {
  if (!playerPos) return false;
  return (
    Math.hypot(
      playerPos.x - BOAT_DOCK_ANCHOR.x,
      playerPos.z - BOAT_DOCK_ANCHOR.z,
    ) < BOAT_DOCK_INTERACT_RADIUS
  );
}

export { PLAYER_BOAT_SIZES };