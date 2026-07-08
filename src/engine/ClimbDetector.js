/**
 * Climb detection — forward chest ray + steep slope sampling for traversal.
 */

import * as THREE from "three";

const CHEST_OFFSET = 1.1;
const FORWARD_PROBE = 0.85;
const CLIMB_MIN_SLOPE = 0.48;
const CLIMB_MAX_SLOPE = 1.35;
const WALL_MIN_DOT = 0.35;

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _normal = new THREE.Vector3(0, 1, 0);

export class ClimbDetector {
  /**
   * @param {import('./GroundSampler.js').GroundSampler} groundSampler
   * @param {import('./CollisionSystem.js').CollisionSystem} [collisionSystem]
   */
  constructor(groundSampler, collisionSystem = null) {
    this.groundSampler = groundSampler;
    this.collisionSystem = collisionSystem;
    this._raycaster = new THREE.Raycaster();
  }

  /**
   * @param {THREE.Object3D} mesh
   * @param {number} worldDirX
   * @param {number} worldDirZ
   * @returns {{ canClimb: boolean, reason?: string, topY?: number, surfaceNormal?: THREE.Vector3 }}
   */
  detect(mesh, worldDirX, worldDirZ) {
    const len = Math.hypot(worldDirX, worldDirZ);
    if (len < 0.05) return { canClimb: false };

    const fx = worldDirX / len;
    const fz = worldDirZ / len;
    const x = mesh.position.x;
    const z = mesh.position.z;
    const footY = mesh.position.y;
    const chestY = footY + CHEST_OFFSET;

    const y0 = this.groundSampler.sampleY(x, z, footY);
    const yAhead = this.groundSampler.sampleY(
      x + fx * FORWARD_PROBE,
      z + fz * FORWARD_PROBE,
      chestY,
    );
    const rise = yAhead - y0;
    const slope = rise / FORWARD_PROBE;

    if (slope >= CLIMB_MIN_SLOPE && slope <= CLIMB_MAX_SLOPE) {
      const topY = this.groundSampler.sampleY(
        x + fx * FORWARD_PROBE * 2,
        z + fz * FORWARD_PROBE * 2,
        yAhead + 1,
      );
      return {
        canClimb: true,
        reason: "slope",
        topY: Math.max(topY, yAhead),
        surfaceNormal: _normal.set(-fx * slope, 1, -fz * slope).normalize(),
      };
    }

    if (this.collisionSystem) {
      _origin.set(x, chestY, z);
      _dir.set(fx, 0.15, fz).normalize();
      const hit = this.collisionSystem.checkCollision(
        _origin,
        _dir,
        1.2,
        this.collisionSystem.layers.environment,
      );
      if (hit.hit && hit.normal) {
        const upDot = hit.normal.y;
        if (upDot < WALL_MIN_DOT) {
          const topY = this.groundSampler.sampleY(
            x + fx * 1.5,
            z + fz * 1.5,
            chestY + 2,
          );
          return {
            canClimb: true,
            reason: "mesh",
            topY,
            surfaceNormal: hit.normal.clone(),
          };
        }
      }
    }

    return { canClimb: false };
  }
}