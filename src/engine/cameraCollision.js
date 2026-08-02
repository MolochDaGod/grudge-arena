/**
 * Meshes safe for third-person camera wall rays (exclude ground / island heightfield).
 */

const CAMERA_COLLIDER_SKIP_RE =
  /island-terrain|island-beach|island-water|island-paving|village-paving|danger-room|gridhelper|island-rock-scatter/i;

/**
 * @param {import('three').Object3D[]} meshes
 * @returns {import('three').Object3D[]}
 */
export function filterCameraCollisionMeshes(meshes) {
  const out = [];
  const seen = new Set();
  for (const root of meshes || []) {
    if (!root) continue;
    let skip = false;
    root.traverse?.((obj) => {
      if (skip) return;
      const name = obj.name || "";
      if (CAMERA_COLLIDER_SKIP_RE.test(name)) skip = true;
    });
    if (!skip && CAMERA_COLLIDER_SKIP_RE.test(root.name || "")) skip = true;
    if (skip || seen.has(root)) continue;
    seen.add(root);
    out.push(root);
  }
  return out;
}