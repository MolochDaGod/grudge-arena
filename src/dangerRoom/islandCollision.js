/**
 * Collect island decor meshes for ground raycasts + environment collision.
 */

const COLLIDER_NAME_RE =
  /pirate-|village-|forest-pack-|island-rock|island-boat|island-pirate|island-village|island-forest|SM_BLD|SM_PROP|tower-|castle-|ship-|cannon|palm-|rocks-|barrel|crate|chest|well|cart|fence|hole|structure-/i;

const SKIP_NAME_RE = /island-water|island-beach|island-terrain|flag-|grass-|patch-|flower|mushroom/i;

/**
 * @param {THREE.Object3D} root
 * @returns {THREE.Object3D[]}
 */
function matchesObstacle(obj) {
  const name = obj.name || "";
  if (SKIP_NAME_RE.test(name)) return false;
  if (COLLIDER_NAME_RE.test(name)) return true;
  let p = obj.parent;
  while (p) {
    const pn = p.name || "";
    if (SKIP_NAME_RE.test(pn)) return false;
    if (COLLIDER_NAME_RE.test(pn)) return true;
    p = p.parent;
  }
  return false;
}

export function collectIslandObstacleMeshes(root) {
  const out = [];
  const seen = new Set();
  root?.traverse?.((obj) => {
    if (!obj) return;
    if (obj.isMesh || obj.isSkinnedMesh) {
      if (!seen.has(obj) && matchesObstacle(obj)) {
        seen.add(obj);
        out.push(obj);
      }
      return;
    }
    if (obj.isGroup && matchesObstacle(obj) && obj.children?.length) {
      if (!seen.has(obj)) {
        seen.add(obj);
        out.push(obj);
      }
    }
  });
  return out;
}

/**
 * Terrain + walkable overlay meshes for height sampling.
 * @param {THREE.Object3D} root
 * @param {THREE.Object3D[]} [terrainMeshes]
 */
export function collectIslandGroundMeshes(root, terrainMeshes = []) {
  const out = [...(terrainMeshes || [])];
  const seen = new Set(out);
  root?.traverse?.((obj) => {
    if (!obj?.isMesh) return;
    const name = obj.name || "";
    if (/island-terrain|island-beach|island-paving|village-paving/.test(name)) {
      if (!seen.has(obj)) {
        seen.add(obj);
        out.push(obj);
      }
    }
  });
  return out;
}