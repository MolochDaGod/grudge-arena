/**
 * Island mount parade — load Grudge6 race cavalry GLBs from CDN for showcase.
 * Non-blocking; failures are logged and skipped.
 */
import * as THREE from "three";
import { createGLTFLoader } from "../gltfLoader.js";
import { sampleIslandHeight } from "./IslandTerrain.js";

const RACES = ["human", "barbarian", "elf", "dwarf", "orc", "undead"];

/** CDN keys on assets.grudge-studio.com */
function mountUrl(race) {
  return `https://assets.grudge-studio.com/models/vehicles/mounts/${race}/cavalry.glb`;
}

const LAYOUT = [
  { race: "human", x: 18, z: 8, ry: -0.8 },
  { race: "barbarian", x: 20, z: 5, ry: -0.5 },
  { race: "elf", x: 16, z: 11, ry: -1.0 },
  { race: "dwarf", x: 22, z: 9, ry: -0.3 },
  { race: "orc", x: 19, z: 2, ry: 0.2 },
  { race: "undead", x: 24, z: 6, ry: -0.9 },
];

/**
 * @param {import('../../game.js').GrudgeArena} arena
 */
export async function spawnIslandMountShowcase(arena) {
  if (arena._mountShowcase) return arena._mountShowcase;

  const group = new THREE.Group();
  group.name = "island-mount-showcase";
  const loader = await createGLTFLoader();
  const obstacles = [];

  await Promise.all(
    LAYOUT.map(async (spec) => {
      try {
        const gltf = await loader.loadAsync(mountUrl(spec.race));
        const root = gltf.scene.clone(true);
        root.name = `mount_${spec.race}`;
        // Fit ~2.2m tall
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const h = Math.max(size.y, 0.01);
        const s = 2.2 / h;
        root.scale.setScalar(s);
        root.updateMatrixWorld(true);
        const box2 = new THREE.Box3().setFromObject(root);
        const y = sampleIslandHeight(spec.x, spec.z) - box2.min.y;
        root.position.set(spec.x, y, spec.z);
        root.rotation.y = spec.ry;
        root.traverse((c) => {
          if (c.isMesh) {
            c.castShadow = true;
            c.receiveShadow = true;
            if (c.material) {
              const mats = Array.isArray(c.material) ? c.material : [c.material];
              for (const m of mats) {
                if (m.map) {
                  m.map.colorSpace = THREE.SRGBColorSpace;
                  m.map.needsUpdate = true;
                }
                m.needsUpdate = true;
              }
            }
          }
        });
        if (gltf.animations?.length) {
          const mixer = new THREE.AnimationMixer(root);
          mixer.clipAction(gltf.animations[0]).play();
          root.userData.mixer = mixer;
        }
        group.add(root);
        obstacles.push(root);
      } catch (err) {
        console.warn(`[mounts] ${spec.race}:`, err?.message || err);
      }
    }),
  );

  if (!group.children.length) {
    console.warn("[mounts] no cavalry GLBs loaded");
    return null;
  }

  const parent = arena._dangerEnv?.root || arena.scene;
  parent.add(group);
  arena._mountShowcase = group;
  arena._mountMixers = group.children
    .map((c) => c.userData.mixer)
    .filter(Boolean);

  if (obstacles.length) {
    arena._obstacleMeshes = [...(arena._obstacleMeshes || []), ...obstacles];
    arena._dangerEnv && (arena._dangerEnv.obstacleMeshes = arena._obstacleMeshes);
    arena.orbitCamera?.setCollisionMeshes?.(arena._obstacleMeshes);
    arena.physicsWorld?.addStaticMeshColliders?.(obstacles);
    arena._groundSampler?.setPropMeshes?.(arena._obstacleMeshes);
  }

  console.log(`[mounts] showcase ×${group.children.length} cavalry`);
  return group;
}

/** Tick mount idle animations */
export function tickMountShowcase(arena, dt) {
  for (const m of arena._mountMixers || []) m.update(dt);
}
