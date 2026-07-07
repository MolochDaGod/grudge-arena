/**
 * Soft-focus bloom — port of dangerroom.puter.site LabScene post-processing.
 * Keeps characters sharp; only HDR-bright VFX (muzzle, hits, emissive pillars) glow.
 */

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export class CombatPostFX {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {{ bloom?: boolean }} [opts]
   */
  constructor(renderer, scene, camera, opts = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;
    this.bloom = null;

    const size = new THREE.Vector2();
    renderer.getSize(size);

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    // Unlit Synty atlases bloom into solid yellow silhouettes — match anim-test (no bloom).
    if (opts.bloom !== false) {
      this.bloom = new UnrealBloomPass(size, 0.35, 0.28, 1.05);
      this.composer.addPass(this.bloom);
    }
  }

  setSize(width, height) {
    this.composer.setSize(width, height);
    this.bloom?.resolution.set(width, height);
  }

  render() {
    if (this.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.composer.dispose();
  }
}