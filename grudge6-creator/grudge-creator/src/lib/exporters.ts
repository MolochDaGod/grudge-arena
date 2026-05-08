/**
 * Character export pipeline for the standalone Builder page.
 *
 * Honest take on the format trio (matches the in-page tooltips):
 *
 *   • OBJ            — geometry + UVs only, NO rig, NO materials beyond a
 *                      vanilla .mtl. Mixamo's auto-rigger expects a clean,
 *                      un-rigged mesh in T-pose; OBJ is the safest input
 *                      because there's no skeleton to fight. Drop the .obj
 *                      straight into mixamo.com → Auto-Rigger.
 *
 *   • GLB (rigged)   — game-ready binary glTF. Skeleton + skinning + textures
 *                      + animations all packed into one self-contained file.
 *                      This is what your engine should ship.
 *
 *   • GLTF (.gltf)   — same data as GLB but human-readable JSON with embedded
 *                      base64 buffers (single file, no .bin sidecar). Bigger
 *                      on disk than GLB but trivial to crack open in Blender,
 *                      diff in git, or post-process with glTF-Transform /
 *                      gltf-pipeline (where you'd add Draco compression for
 *                      web delivery — three.js's exporter doesn't ship a
 *                      Draco encoder, so we don't pretend to here).
 *
 * Everything respects current visibility (`onlyVisible: true`) so hidden
 * loadout slots are stripped from the exported file.
 */

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import saveAs from 'file-saver';

/** Force the model to its bind pose before sampling — relevant for GLB/GLTF
 *  (animations + skinned bones are sampled at current state). For OBJ this is
 *  effectively a no-op because OBJExporter doesn't apply skin, but it costs
 *  nothing and keeps the rig honest if multiple exports run in sequence. */
function poseToBind(root: THREE.Object3D): void {
  root.traverse(o => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && sm.skeleton) {
      sm.skeleton.pose();
    }
  });
  root.updateMatrixWorld(true);
}

/**
 * Build a *shallow-cloned* subtree that mirrors `root` but contains ONLY the
 * meshes that are currently visible (and the parent chain needed to keep
 * their world transforms intact). We need this because three.js's
 * OBJExporter walks every mesh and ignores the `.visible` flag entirely —
 * without pruning, hidden loadout slots (e.g. unequipped helmets, alternate
 * arm variants) would still get written into the .obj, producing overlapping
 * geometry that confuses Mixamo's auto-rigger.
 *
 * Implementation notes:
 *   • Object3D.clone() copies position/quaternion/scale and the parent ref
 *     when re-parented, so world transforms are preserved as long as we
 *     replicate the parent chain.
 *   • For Mesh / SkinnedMesh we share geometry + materials (no deep clone) —
 *     OBJExporter only reads them, never mutates, so sharing is safe and
 *     avoids a full GPU buffer duplication.
 *   • SkinnedMesh becomes a plain Mesh in the clone (we drop skeleton +
 *     skinIndex/skinWeight). OBJ has no concept of skinning anyway, so the
 *     output would be identical, and this lets us bypass any skin-bone
 *     gymnastics inside the exporter.
 */
function cloneVisibleForObj(root: THREE.Object3D): THREE.Object3D {
  const clone = root.clone(false);          // shallow: no children
  clone.visible = root.visible;
  for (const child of root.children) {
    if (!child.visible) continue;           // ← prune hidden subtrees here
    const m = child as THREE.Mesh;
    if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
      // Demote SkinnedMesh → Mesh, sharing geometry + material.
      const sm = child as THREE.SkinnedMesh;
      const flat = new THREE.Mesh(sm.geometry, sm.material as THREE.Material);
      flat.name = sm.name;
      flat.position.copy(sm.position);
      flat.quaternion.copy(sm.quaternion);
      flat.scale.copy(sm.scale);
      flat.matrixAutoUpdate = sm.matrixAutoUpdate;
      flat.visible = true;
      clone.add(flat);
    } else if (m.isMesh) {
      const flat = new THREE.Mesh(m.geometry, m.material as THREE.Material);
      flat.name = m.name;
      flat.position.copy(m.position);
      flat.quaternion.copy(m.quaternion);
      flat.scale.copy(m.scale);
      flat.matrixAutoUpdate = m.matrixAutoUpdate;
      flat.visible = true;
      clone.add(flat);
    } else {
      // Bone / Group / Object3D — recurse so descendant meshes still come through
      // with their world transform intact via the cloned parent chain.
      clone.add(cloneVisibleForObj(child));
    }
  }
  return clone;
}

export async function exportOBJ(root: THREE.Object3D, filename: string): Promise<void> {
  poseToBind(root);
  const visibleOnly = cloneVisibleForObj(root);
  visibleOnly.updateMatrixWorld(true);
  const exporter = new OBJExporter();
  const text = exporter.parse(visibleOnly);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  saveAs(blob, `${filename}.obj`);
}

export async function exportGLB(root: THREE.Object3D, filename: string): Promise<void> {
  poseToBind(root);
  const exporter = new GLTFExporter();
  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      root,
      result => resolve(result as ArrayBuffer),
      err => reject(err),
      { binary: true, onlyVisible: true, embedImages: true, includeCustomExtensions: false } as any,
    );
  });
  const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
  saveAs(blob, `${filename}.glb`);
}

export async function exportGLTF(root: THREE.Object3D, filename: string): Promise<void> {
  poseToBind(root);
  const exporter = new GLTFExporter();
  const json = await new Promise<object>((resolve, reject) => {
    exporter.parse(
      root,
      result => resolve(result as object),
      err => reject(err),
      // embedImages: true bakes textures as base64 data URIs INSIDE the .gltf
      // JSON so we ship a single self-contained file (no .bin / .png sidecars
      // to keep track of). Larger than GLB on disk but easy to inspect.
      { binary: false, onlyVisible: true, embedImages: true } as any,
    );
  });
  const text = JSON.stringify(json);
  const blob = new Blob([text], { type: 'model/gltf+json' });
  saveAs(blob, `${filename}.gltf`);
}
