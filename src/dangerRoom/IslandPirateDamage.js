/**
 * Kenney Pirate Kit damage tiers — swap to wreck / modular / rubble variants.
 */

import * as THREE from "three";
import {
  loadPirateModel,
  groundPirateInstance,
  tagPirateInstance,
  UNIT_SCALE,
} from "./IslandPirateLoader.js";

/** @type {Record<string, { damaged?: string, wrecked: string }>} */
export const DAMAGE_VARIANTS = {
  "ship-small": { wrecked: "ship-wreck" },
  "ship-medium": { wrecked: "ship-wreck" },
  "ship-large": { wrecked: "ship-wreck" },
  "ship-pirate-small": { damaged: "ship-ghost", wrecked: "ship-wreck" },
  "ship-pirate-medium": { damaged: "ship-ghost", wrecked: "ship-wreck" },
  "ship-pirate-large": { damaged: "ship-ghost", wrecked: "ship-wreck" },
  "tower-complete-large": { damaged: "tower-middle", wrecked: "rocks-c" },
  "tower-complete-small": { damaged: "tower-base", wrecked: "rocks-b" },
  "tower-watch": { damaged: "tower-middle-windows", wrecked: "rocks-a" },
  "castle-wall": { damaged: "rocks-a", wrecked: "rocks-c" },
  "castle-gate": { damaged: "castle-door", wrecked: "rocks-b" },
  "structure": { damaged: "structure-roof", wrecked: "rocks-a" },
  "structure-platform-dock": { damaged: "platform-planks", wrecked: "rocks-sand-b" },
  "cannon": { damaged: "cannon-ball", wrecked: "barrel" },
  "cannon-mobile": { damaged: "cannon-ball", wrecked: "barrel" },
  "chest": { wrecked: "crate" },
};

export function resolveDamageModel(baseFile, healthRatio) {
  const map = DAMAGE_VARIANTS[baseFile];
  if (!map) return baseFile;
  if (healthRatio <= 0.15) return map.wrecked;
  if (healthRatio <= 0.55 && map.damaged) return map.damaged;
  return baseFile;
}

/**
 * Swap a placed instance to its damage-tier GLB (preserves transform).
 * @param {THREE.Object3D} instance
 * @param {number} healthRatio — 0..1
 */
export async function applyPirateDamageState(instance, healthRatio) {
  const meta = instance.userData?.pirateAsset;
  if (!meta?.baseFile) return instance;

  const targetFile = resolveDamageModel(meta.baseFile, healthRatio);
  meta.health = Math.round(healthRatio * meta.maxHealth);
  if (instance.userData._damageFile === targetFile) return instance;

  const parent = instance.parent;
  if (!parent) return instance;

  const spec = {
    file: targetFile,
    x: instance.position.x,
    z: instance.position.z,
    ry: instance.rotation.y,
    scale: instance.scale.x / UNIT_SCALE,
    yOff: 0,
  };

  const style = {
    faction: meta.faction,
    sailColor: instance.userData._sailColor,
    claimColor: instance.userData._claimColor,
  };

  const { root } = await loadPirateModel(targetFile, style);
  const next = root.clone(true);
  next.position.copy(instance.position);
  next.rotation.copy(instance.rotation);
  next.scale.copy(instance.scale);
  next.name = instance.name;
  next.userData = { ...instance.userData, _damageFile: targetFile };
  tagPirateInstance(next, { ...meta, health: meta.health });

  parent.remove(instance);
  parent.add(next);
  return next;
}

/** Demo wrecks placed at low health for visual reference. */
export const DEMO_WRECK_LAYOUT = [
  { file: "ship-wreck", x: -34, z: -20, ry: -0.4 },
  { file: "ship-ghost", x: 4, z: 30, ry: 1.1 },
];