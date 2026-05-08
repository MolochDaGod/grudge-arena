import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  Gruda, CharacterGruda, WeaponGruda, runMechanicalChecks,
} from './GrudaSchema';

/**
 * GrudaLoader
 *
 * Resolves a `.gruda` URL to:
 *   1. parsed + schema-validated manifest
 *   2. mechanical-rule check report (warnings/errors)
 *   3. loaded THREE object(s) (lazily, on `.instantiate()`)
 *
 * The loader is the single funnel through which assets enter the game.  No
 * other code is allowed to call GLTFLoader directly for character/weapon/etc.
 * Centralising this lets us:
 *   • cache the underlying GLB by URL (one network fetch per unique asset)
 *   • run §3.2 bone-name normalization once at parse time
 *   • surface validation errors loudly instead of silently rendering broken assets
 */

const gltfCache = new Map<string, Promise<THREE.Group>>();
const gltfLoader = new GLTFLoader();

async function loadGlb(url: string): Promise<THREE.Group> {
  let p = gltfCache.get(url);
  if (!p) {
    p = gltfLoader.loadAsync(url).then(g => {
      // §3.2 — normalize bone names so anim-clip tracks bind reliably.
      g.scene.traverse(o => { o.name = o.name.replace(/ /g, '_'); });
      return g.scene;
    });
    gltfCache.set(url, p);
  }
  // Always return a SkeletonUtils.clone so each instance has its own bones.
  const scene = await p;
  return SkeletonUtils.clone(scene) as THREE.Group;
}

function resolveAssetUrl(grudaUrl: string, asset: string): string {
  const dir = grudaUrl.substring(0, grudaUrl.lastIndexOf('/') + 1);
  return new URL(asset, new URL(dir, window.location.origin)).pathname;
}

export interface LoadedGruda {
  manifest: Gruda;
  url: string;
  checks: ReturnType<typeof runMechanicalChecks>;
  /** Lazily instantiate the underlying GLB into a THREE.Group instance. */
  instantiate(): Promise<THREE.Group>;
}

export async function loadGruda(grudaUrl: string): Promise<LoadedGruda> {
  const res = await fetch(grudaUrl);
  if (!res.ok) throw new Error(`Failed to fetch ${grudaUrl}: ${res.status}`);
  const json = await res.json();

  // Lazy-import the schema (kept separate so this module is light to import).
  const { Gruda } = await import('./GrudaSchema');
  const parsed = Gruda.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Invalid .gruda at ${grudaUrl}: ${parsed.error.message}`);
  }
  const manifest = parsed.data;
  const checks = runMechanicalChecks(manifest);

  const assetUrl = resolveAssetUrl(grudaUrl, manifest.asset);

  return {
    manifest,
    url: grudaUrl,
    checks,
    instantiate: () => loadGlb(assetUrl),
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Composition: assemble a character + attachments at runtime.               */
/* ────────────────────────────────────────────────────────────────────────── */

export interface AssembledCharacter {
  root: THREE.Group;                      // top-level group containing body + attachments
  body: THREE.Group;                      // the character's own GLB instance
  bonesByAbstract: Map<string, THREE.Object3D>; // 'handR' → actual bone object
  attachments: Array<{ part: LoadedGruda; mesh: THREE.Object3D }>;
  characterManifest: CharacterGruda;
  dispose(): void;
}

/**
 * Assemble a character with arbitrary attachments (weapons, armour, hair…).
 * Each attachment is parented to the character bone resolved by:
 *   manifest.attach.socket → character.sockets[socket].bone (abstract)
 *                          → character.skeleton.namedBones[abstract] (real bone name)
 */
export async function assembleCharacter(
  character: LoadedGruda,
  parts: LoadedGruda[],
): Promise<AssembledCharacter> {
  if (character.manifest.kind !== 'character') {
    throw new Error(`Expected character.gruda, got ${character.manifest.kind}`);
  }
  const charManifest = character.manifest as CharacterGruda;

  const root = new THREE.Group();
  root.name = `gruda_${charManifest.id}`;

  const body = await character.instantiate();
  root.add(body);

  // Build abstract-bone lookup: 'handR' → THREE.Object3D
  const bonesByAbstract = new Map<string, THREE.Object3D>();
  const realToAbstract = new Map<string, string>();
  for (const [abstract, real] of Object.entries(charManifest.skeleton.namedBones)) {
    realToAbstract.set(real, abstract);
  }
  body.traverse(o => {
    const a = realToAbstract.get(o.name);
    if (a) bonesByAbstract.set(a, o);
  });

  const attachments: AssembledCharacter['attachments'] = [];
  for (const part of parts) {
    const m = part.manifest;
    if (!('attach' in m) || !m.attach) continue;
    const socketName = m.attach.socket;
    const socket = charManifest.sockets[socketName];
    if (!socket) {
      console.warn(`[Gruda] socket "${socketName}" not on character ${charManifest.id}`);
      continue;
    }
    const bone = bonesByAbstract.get(socket.bone);
    if (!bone) {
      console.warn(`[Gruda] abstract bone "${socket.bone}" not found on body`);
      continue;
    }
    const mesh = await part.instantiate();
    // Apply socket offset, then per-part fine-tune offset.
    mesh.position.fromArray(socket.offset);
    mesh.rotation.set(
      THREE.MathUtils.degToRad(socket.rotationEulerDeg[0]),
      THREE.MathUtils.degToRad(socket.rotationEulerDeg[1]),
      THREE.MathUtils.degToRad(socket.rotationEulerDeg[2]),
    );
    const fine = new THREE.Group();
    fine.position.fromArray(m.attach.localOffset);
    fine.rotation.set(
      THREE.MathUtils.degToRad(m.attach.localRotationEulerDeg[0]),
      THREE.MathUtils.degToRad(m.attach.localRotationEulerDeg[1]),
      THREE.MathUtils.degToRad(m.attach.localRotationEulerDeg[2]),
    );
    fine.add(mesh);
    bone.add(fine);
    attachments.push({ part, mesh: fine });
  }

  function dispose() {
    root.traverse(o => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach(m => m.dispose());
      else mat?.dispose();
    });
  }

  return { root, body, bonesByAbstract, attachments, characterManifest: charManifest, dispose };
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Collider helpers — turn .gruda colliders into visible debug meshes.       */
/* ────────────────────────────────────────────────────────────────────────── */

export function buildColliderDebugMesh(
  collider: import('./GrudaSchema').Collider,
  color: number,
): THREE.Object3D {
  const mat = new THREE.MeshBasicMaterial({
    color, wireframe: true, transparent: true, opacity: 0.85, depthTest: false,
  });
  switch (collider.shape) {
    case 'sphere': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(collider.radius, 12, 8), mat);
      if (collider.centre) m.position.fromArray(collider.centre);
      return m;
    }
    case 'box': {
      const [hx, hy, hz] = collider.halfExtents;
      const m = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), mat);
      if (collider.centre) m.position.fromArray(collider.centre);
      return m;
    }
    case 'capsule': {
      const from = new THREE.Vector3().fromArray(collider.from);
      const to   = new THREE.Vector3().fromArray(collider.to);
      const len  = from.distanceTo(to);
      // CapsuleGeometry length is the cylinder portion (excluding hemispheres).
      const cylLen = Math.max(0.001, len);
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(collider.radius, cylLen, 6, 12), mat);
      // CapsuleGeometry is +Y aligned with origin at centre — translate + orient.
      const mid = from.clone().add(to).multiplyScalar(0.5);
      m.position.copy(mid);
      const dir = to.clone().sub(from).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      m.quaternion.copy(q);
      return m;
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Damage-window lookup — given an animation clip + time, which colliders    */
/*  are currently "live"?  Used by the demo and by the runtime HitboxSystem.  */
/* ────────────────────────────────────────────────────────────────────────── */

export function liveColliderIds(weapon: WeaponGruda, clip: string, t: number): Set<string> {
  const live = new Set<string>();
  for (const w of weapon.damage.windows) {
    if (w.clip !== clip) continue;
    if (t >= w.startSec && t <= w.endSec) {
      for (const id of w.colliderIds) live.add(id);
    }
  }
  return live;
}
