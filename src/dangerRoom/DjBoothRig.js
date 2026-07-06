/**
 * DJ booth + Racalvin dancer — vanilla Three.js port of arpg-game DjBoothRig.tsx.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { assetUrl } from "../assetConfig.js";
import { getDangerRoomMusic } from "./DangerRoomMusic.js";

const DJ_BOOTH_URL = assetUrl("assets/danger/dj-booth.glb");
const RACALVIN_URL = assetUrl("assets/danger/racalvin.glb");
const HALF = 16;
const DJ_FLOOR_Y = 4.9;
const BOOTH_TARGET_WIDTH = 6.8;
const BOOTH_BACK_Z = 1.2;
const DJ_STAND_Z = -0.5;

function fitBoothToAlcove(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const scale = BOOTH_TARGET_WIDTH / (size.x || 1);
  obj.scale.setScalar(scale);
  obj.updateWorldMatrix(true, true);
  const box2 = new THREE.Box3().setFromObject(obj);
  const center = box2.getCenter(new THREE.Vector3());
  obj.position.set(-center.x, -box2.min.y, BOOTH_BACK_Z - center.z);
}

function addFallbackBooth(root) {
  const booth = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.1, 0.9),
    new THREE.MeshStandardMaterial({
      color: 0x1a1428,
      emissive: 0x4a2060,
      emissiveIntensity: 0.4,
      metalness: 0.6,
      roughness: 0.4,
    }),
  );
  booth.position.set(0, 0.55, -1);
  booth.castShadow = true;
  root.add(booth);
}

/**
 * @param {THREE.Scene} scene
 * @returns {{ root: THREE.Group, update: (dt: number) => void, dispose: () => void }}
 */
export function createDjBoothRig(scene) {
  const root = new THREE.Group();
  root.name = "dj-booth-rig";
  root.position.set(0, DJ_FLOOR_Y, HALF);

  let mixer = null;
  let danceAction = null;
  let idleAction = null;
  let currentAction = null;
  let lastPhrase = -1;
  const loader = new GLTFLoader();
  const disposables = [];

  addFallbackBooth(root);
  scene.add(root);

  loader.load(
    DJ_BOOTH_URL,
    (gltf) => {
      const booth = gltf.scene;
      booth.traverse((ch) => {
        if (ch.isMesh) {
          ch.castShadow = true;
          ch.receiveShadow = true;
        }
      });
      fitBoothToAlcove(booth);
      root.add(booth);
    },
    undefined,
    () => addFallbackBooth(root),
  );

  loader.load(RACALVIN_URL, (gltf) => {
    const body = gltf.scene;
    body.traverse((ch) => {
      if (ch.isMesh) {
        ch.castShadow = true;
        ch.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(body);
    const size = box.getSize(new THREE.Vector3());
    const scale = 1.75 / (size.y || 1);
    body.scale.setScalar(scale);
    body.position.set(0, -box.min.y * scale, DJ_STAND_Z);
    body.rotation.y = Math.PI;
    root.add(body);

    if (gltf.animations?.length) {
      mixer = new THREE.AnimationMixer(body);
      const clip = gltf.animations[0];
      danceAction = mixer.clipAction(clip);
      danceAction.setLoop(THREE.LoopRepeat, Infinity);
      idleAction = danceAction;
      currentAction = danceAction;
      danceAction.play();
    }
    disposables.push(body);
  });

  function update(dt) {
    if (mixer) mixer.update(dt);
    const pulse = getDangerRoomMusic().update(dt);
    const phrase = Math.floor(pulse.beat / 8);
    const dancing = pulse.intensity > 0.45;
    if (dancing && danceAction && phrase !== lastPhrase) {
      lastPhrase = phrase;
      if (currentAction !== danceAction) {
        danceAction.reset().fadeIn(0.2).play();
        currentAction?.fadeOut(0.2);
        currentAction = danceAction;
      }
    } else if (!dancing && idleAction && currentAction !== idleAction) {
      idleAction.reset().fadeIn(0.3).play();
      currentAction?.fadeOut(0.3);
      currentAction = idleAction;
    }
  }

  function dispose() {
    scene.remove(root);
    if (mixer) mixer.stopAllAction();
    root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m.dispose?.();
      }
    });
  }

  return { root, update, dispose };
}