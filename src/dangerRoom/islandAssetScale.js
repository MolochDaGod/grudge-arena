/**
 * Island prop scale — normalize Kenney / village GLBs to game metres.
 * Handles both metre exports and legacy centimetre vertex data (100× too large at scale 1).
 */

import * as THREE from "three";

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

/** Measure world-axis size of an object (after current transform). */
export function measureWorldSize(object3d) {
  if (!object3d) return { x: 0, y: 0, z: 0, max: 0 };
  object3d.updateMatrixWorld(true);
  _box.setFromObject(object3d);
  _box.getSize(_size);
  return {
    x: _size.x,
    y: _size.y,
    z: _size.z,
    max: Math.max(_size.x, _size.y, _size.z),
  };
}

/**
 * Infer cm→m correction: vertex coords > 45 units usually means unscaled FBX/cm data.
 */
export function inferCmToMetresScale(maxExtent) {
  if (maxExtent > 45) return 0.01;
  if (maxExtent > 25) return 0.1;
  return 1;
}

/**
 * Scale `object3d` so its tallest axis matches `targetHeightM` (within ~15%).
 * @returns {number} multiplier applied (1 = unchanged)
 */
export function normalizePropHeight(object3d, targetHeightM) {
  if (!object3d || targetHeightM <= 0) return 1;
  const before = measureWorldSize(object3d);
  if (before.y < 1e-4 && before.max < 1e-4) return 1;

  let height = before.y > 1e-4 ? before.y : before.max;
  let unit = inferCmToMetresScale(height);
  if (unit !== 1) {
    object3d.scale.multiplyScalar(unit);
    object3d.updateMatrixWorld(true);
    const afterUnit = measureWorldSize(object3d);
    height = afterUnit.y > 1e-4 ? afterUnit.y : afterUnit.max;
  }

  const err = Math.abs(height - targetHeightM) / targetHeightM;
  if (err < 0.15) return unit;

  const fit = targetHeightM / height;
  object3d.scale.multiplyScalar(fit);
  return unit * fit;
}

/** Expected heights (metres) for island layout props. */
export const PROP_TARGET_HEIGHT = {
  building: 14,
  chimney: 7,
  well: 5,
  cart: 2.5,
  barrel: 1.1,
  fence: 1.4,
  campfire: 0.8,
  waterwheel: 6,
  shipLarge: 12,
  shipMedium: 9,
  shipSmall: 6,
  towerLarge: 8,
  towerSmall: 5,
  wall: 4,
  cannon: 1.2,
  palm: 7,
  chest: 0.7,
  tree: 3.6,
  rock: 1.8,
  default: 2,
};

export function targetHeightForProp(fileName) {
  const f = (fileName || "").toLowerCase();
  if (/ship-pirate-large/.test(f)) return PROP_TARGET_HEIGHT.shipLarge;
  if (/ship-pirate-medium/.test(f)) return PROP_TARGET_HEIGHT.shipMedium;
  if (/ship-pirate-small|boat-row-large/.test(f)) return PROP_TARGET_HEIGHT.shipMedium;
  if (/boat-row-small|boat-row/.test(f)) return PROP_TARGET_HEIGHT.shipSmall;
  if (/tower-complete-large|tower-watch/.test(f)) return PROP_TARGET_HEIGHT.towerLarge;
  if (/tower-complete-small/.test(f)) return PROP_TARGET_HEIGHT.towerSmall;
  if (/castle-gate|castle-wall|castle-door/.test(f)) return PROP_TARGET_HEIGHT.wall;
  if (/cannon/.test(f)) return PROP_TARGET_HEIGHT.cannon;
  if (/palm/.test(f)) return PROP_TARGET_HEIGHT.palm;
  if (/chest|crate/.test(f)) return PROP_TARGET_HEIGHT.chest;
  if (/barrel/.test(f)) return PROP_TARGET_HEIGHT.barrel;
  if (/bld_body|bld_base/.test(f)) return PROP_TARGET_HEIGHT.building;
  if (/chimney/.test(f)) return PROP_TARGET_HEIGHT.chimney;
  if (/well/.test(f)) return PROP_TARGET_HEIGHT.well;
  if (/cart/.test(f)) return PROP_TARGET_HEIGHT.cart;
  if (/fence/.test(f)) return PROP_TARGET_HEIGHT.fence;
  if (/campfire/.test(f)) return PROP_TARGET_HEIGHT.campfire;
  if (/waterwheel/.test(f)) return PROP_TARGET_HEIGHT.waterwheel;
  if (/rock/.test(f)) return PROP_TARGET_HEIGHT.rock;
  if (/tree/.test(f)) return PROP_TARGET_HEIGHT.tree;
  return PROP_TARGET_HEIGHT.default;
}