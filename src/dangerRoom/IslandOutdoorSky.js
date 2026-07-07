/**
 * Poly Haven outdoor HDR for the combat island — sky + PMREM IBL.
 */

import * as THREE from "three";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

const POLYHAVEN_HDR =
  "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/kloppenheim_06_puresky_4k.hdr";

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 */
export async function loadIslandOutdoorSky(renderer, scene) {
  try {
    const hdr = await new RGBELoader().loadAsync(POLYHAVEN_HDR);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    hdr.colorSpace = THREE.LinearSRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const envMap = pmrem.fromEquirectangular(hdr).texture;
    pmrem.dispose();

    scene.environment = envMap;
    scene.background = hdr;
    if ("environmentIntensity" in scene) {
      scene.environmentIntensity = 1.2;
    }
    scene.fog = new THREE.FogExp2(0x9ec8e8, 0.0065);

    return { envMap, background: hdr };
  } catch (err) {
    console.warn("[island] outdoor HDR failed:", err.message);
    return null;
  }
}

/** Boost PBR response on island meshes after IBL is ready. */
export function applyIslandEnvMap(root, envMap) {
  if (!envMap || !root) return;
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (!mat?.isMeshStandardMaterial) continue;
      mat.envMap = envMap;
      mat.envMapIntensity = Math.max(mat.envMapIntensity ?? 0.4, 0.95);
      mat.needsUpdate = true;
    }
  });
}