import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Skull Altar — low-poly stone arch with a glowing red skull at its centre,
 * flanked by six standing monoliths. Replaces the procedural obelisk relic
 * so the splash gets a real authored hero prop while staying dark/spooky.
 *
 * Visual treatment:
 *   • The model's diffuse atlas is desaturated and tinted cool-stone so it
 *     reads as ancient ruin instead of fresh concrete.
 *   • A red point light is parented to the central skull, pulsing slowly so
 *     the altar feels "alive". A blue rim point light behind the arch
 *     silhouettes the monoliths against the starfield.
 *   • A subtle glowing red shard sits where the original "eye" of the skull
 *     would be — additive blending, slowly bobbing.
 */

export interface SkullAltar {
  group: THREE.Group;
  update(t: number): void;
  dispose(): void;
}

const BASE_PATH = `${import.meta.env.BASE_URL}models/gltf/skull_altar/scene.gltf`;
const TARGET_HEIGHT = 9; // metres — tall enough to tower over the 1.8m champions

let cachedScene: THREE.Group | null = null;

async function loadAltarScene(): Promise<THREE.Group> {
  if (cachedScene) return cachedScene.clone(true);
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(BASE_PATH);
  cachedScene = gltf.scene;
  return cachedScene.clone(true);
}

export async function createSkullAltar(): Promise<SkullAltar> {
  const root = await loadAltarScene();

  // ── Auto-fit ──────────────────────────────────────────────────────────────
  // Centre the model horizontally on the origin, sit it on y=0, and scale
  // uniformly so its overall height matches TARGET_HEIGHT.
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  const centre = new THREE.Vector3(); box.getCenter(centre);
  const scale = TARGET_HEIGHT / Math.max(size.y, 0.001);
  root.scale.setScalar(scale);
  root.position.x = -centre.x * scale;
  root.position.z = -centre.z * scale;
  root.position.y = -box.min.y * scale; // sit on ground

  // ── Material treatment — desaturate & cool-tint the stone ────────────────
  // The asset ships as PBR specular-glossiness via KHR_materials_pbrSpecularGlossiness;
  // GLTFLoader converts these to MeshStandardMaterial. We re-tint the diffuse
  // map's apparent colour by setting `material.color` (it modulates the texture).
  root.traverse(o => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[] | undefined;
    if (!m) return;
    const mats = Array.isArray(m) ? m : [m];
    for (const mat of mats) {
      if (!(mat as THREE.MeshStandardMaterial).color) continue;
      // Cold blue-grey tint pulls the warm stone into a moonlit ruin.
      mat.color.setHex(0x6a7382);
      mat.roughness = 0.95;
      mat.metalness = 0.05;
      // A whisper of self-emission lifts the silhouette out of the fog.
      mat.emissive = new THREE.Color(0x0a0e16);
      mat.emissiveIntensity = 1;
      mat.needsUpdate = true;
    }
    (o as THREE.Mesh).castShadow = false;
    (o as THREE.Mesh).receiveShadow = false;
  });

  // ── Glowing skull "eye" ───────────────────────────────────────────────────
  // The skull sits roughly at the top-centre of the arch (above ground level
  // ≈ 0.55 of the model height in this asset).  A small additive sprite
  // gives it a hot core; a red point light gives it volumetric reach.
  const eyeY = TARGET_HEIGHT * 0.62;
  const eyeZ = 0.0;
  const eyeMat = new THREE.MeshBasicMaterial({
    color: 0xff2a18,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), eyeMat);
  eye.position.set(0, eyeY, eyeZ + 0.05);
  root.add(eye);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 20, 14),
    new THREE.MeshBasicMaterial({
      color: 0xff5030,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.position.copy(eye.position);
  root.add(halo);

  const eyeLight = new THREE.PointLight(0xff3520, 5.0, 18, 1.6);
  eyeLight.position.copy(eye.position);
  root.add(eyeLight);

  // ── Cool rim light behind the arch (separates it from the starfield) ─────
  const rimLight = new THREE.PointLight(0x4a78ff, 3.0, 22, 1.4);
  rimLight.position.set(0, TARGET_HEIGHT * 0.55, -2.5);
  root.add(rimLight);

  // ── Group up ─────────────────────────────────────────────────────────────
  const group = new THREE.Group();
  group.name = 'SkullAltar';
  group.add(root);

  function update(t: number) {
    // Slow pulse on the eye — never fully off, never blinding.
    const pulse = 0.7 + 0.3 * Math.sin(t * 1.6);
    eyeMat.opacity = 0.6 + 0.35 * pulse;
    (halo.material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.22 * pulse;
    eyeLight.intensity = 3.5 + 2.5 * pulse;
    // Rim light very slightly breathes too — keeps the silhouette alive.
    rimLight.intensity = 2.2 + 0.6 * Math.sin(t * 0.7);
  }

  function dispose() {
    group.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      const mats = Array.isArray(m) ? m : [m];
      for (const mat of mats) mat.dispose();
    });
  }

  return { group, update, dispose };
}
