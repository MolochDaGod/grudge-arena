/**
 * HitSplash — Contact-point visual feedback (annihilatetrainer Splash.js pattern).
 *
 * Spawns a small colored cube at the collision contact point, tweens it
 * upward while fading opacity, then auto-disposes. Uses delta-time in a
 * shared update array (no gsap dependency).
 */

import * as THREE from 'three';

/** Global list of active splashes — call `updateSplashes(dt)` each frame. */
export const activeSplashes = [];

export class HitSplash {
  /**
   * @param {THREE.Scene} scene
   * @param {THREE.Vector3} position — world-space contact point
   * @param {object} [opts]
   * @param {number} [opts.color]    — hex color (default red)
   * @param {number} [opts.duration] — seconds to live (default 0.5)
   * @param {number} [opts.rise]     — how far up (default 1.5)
   */
  constructor(scene, position, opts = {}) {
    this.scene = scene;
    this.duration = opts.duration || 0.5;
    this.rise = opts.rise || 1.5;
    this.elapsed = 0;
    this.startY = position.y;
    this._disposed = false;

    const color = opts.color || 0xff2222;
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.12),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 1,
      }),
    );
    this.mesh.position.copy(position);
    this.scene.add(this.mesh);

    activeSplashes.push(this);
  }

  /** Called each frame from the shared update loop. */
  update(dt) {
    if (this._disposed) return;
    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.duration);

    // Rise upward
    this.mesh.position.y = this.startY + this.rise * t;
    // Fade out (sqrt curve for quicker initial fade)
    this.mesh.material.opacity = Math.pow(1 - t, 0.5);

    if (t >= 1) this.dispose();
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.scene.remove(this.mesh);
    this.mesh.geometry?.dispose();
    this.mesh.material?.dispose();
    const idx = activeSplashes.indexOf(this);
    if (idx !== -1) activeSplashes.splice(idx, 1);
  }
}

/**
 * Batch-update all active splashes. Call once per frame from game loop.
 * @param {number} dt — delta time in seconds
 */
export function updateSplashes(dt) {
  // Iterate backwards so disposal-splicing doesn't skip entries
  for (let i = activeSplashes.length - 1; i >= 0; i--) {
    activeSplashes[i].update(dt);
  }
}
