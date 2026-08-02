/**
 * Arena terrain — navmesh, climb detection, obstacle colliders, movement resolution.
 * Island combat sandbox: heightfield walk + Rapier static props + mesh raycasts.
 */

import * as THREE from "three";
import { GroundSampler } from "./GroundSampler.js";
import { IslandNavMesh } from "./IslandNavMesh.js";
import { ClimbDetector } from "./ClimbDetector.js";
import { sampleIslandHeight } from "../dangerRoom/IslandTerrain.js";

const WALL_SLIDE_EPS = 0.08;

export class ArenaTerrainSystem {
  /**
   * @param {{
   *   groundSampler?: GroundSampler,
   *   collisionSystem?: import('./CollisionSystem.js').CollisionSystem,
   *   rapierWorld?: import('./RapierPhysicsWorld.js').RapierPhysicsWorld,
   * }} deps
   */
  constructor(deps = {}) {
    this.groundSampler = deps.groundSampler ?? new GroundSampler();
    this.collisionSystem = deps.collisionSystem ?? null;
    this.rapierWorld = deps.rapierWorld ?? null;
    this.navMesh = new IslandNavMesh();
    this.climbDetector = new ClimbDetector(this.groundSampler, this.collisionSystem);
    this._obstacleMeshes = [];
    this._registeredColliders = new Set();
    this._built = false;
  }

  /** Wire island height + terrain meshes; build nav grid. */
  init({
    terrainMeshes = [],
    obstacleMeshes = [],
    propMeshes = obstacleMeshes,
    heightFn = sampleIslandHeight,
  } = {}) {
    this.groundSampler.setHeightSampleFn(heightFn);
    this.groundSampler.setTerrainMeshes(terrainMeshes);
    this.groundSampler.setPropMeshes(propMeshes);
    this._obstacleMeshes = obstacleMeshes?.slice() ?? [];
    this.navMesh.build();
    this._registerEnvironmentColliders(terrainMeshes);
    this._registerObstacleColliders(obstacleMeshes);
    this.navMesh.blockObstacles(this._obstacleMeshes);
    this.navMesh.applySpawnPads();
    this._built = true;
    return this;
  }

  /** Refresh when island async load completes. */
  refresh({ terrainMeshes, obstacleMeshes, propMeshes } = {}) {
    if (terrainMeshes?.length) {
      this.groundSampler.setTerrainMeshes(terrainMeshes);
      this._registerEnvironmentColliders(terrainMeshes);
    }
    if (propMeshes?.length) {
      this.groundSampler.setPropMeshes(propMeshes);
    } else if (obstacleMeshes?.length) {
      this.groundSampler.setPropMeshes(obstacleMeshes);
    }
    if (obstacleMeshes?.length) {
      this._obstacleMeshes = obstacleMeshes.slice();
      this._registerObstacleColliders(obstacleMeshes);
    }
    this.navMesh.build();
    this.navMesh.blockObstacles(this._obstacleMeshes);
    this.navMesh.applySpawnPads();
    return this;
  }

  _collectColliderTargets(root) {
    const targets = [];
    if (!root) return targets;
    root.traverse?.((obj) => {
      if ((obj.isMesh || obj.isSkinnedMesh) && obj.geometry) {
        targets.push(obj);
      }
    });
    if (!targets.length && (root.isMesh || root.isSkinnedMesh)) {
      targets.push(root);
    }
    return targets;
  }

  _registerColliderMeshes(meshes, data = {}) {
    if (!this.collisionSystem) return;
    for (const root of meshes || []) {
      for (const mesh of this._collectColliderTargets(root)) {
        if (this._registeredColliders.has(mesh)) continue;
        this._registeredColliders.add(mesh);
        this.collisionSystem.addCollider(mesh, "environment", { terrain: true, ...data });
      }
    }
  }

  _registerEnvironmentColliders(meshes) {
    this._registerColliderMeshes(meshes);
  }

  _registerObstacleColliders(meshes) {
    const list = meshes || [];
    this._registerColliderMeshes(list);
    this.rapierWorld?.addStaticMeshColliders?.(list);
  }

  /** Register one obstacle (harvest nodes, dynamic props) and refresh nav. */
  registerObstacle(mesh, data = {}) {
    if (!mesh) return;
    this._obstacleMeshes.push(mesh);
    if (this.collisionSystem && !this._registeredColliders.has(mesh)) {
      this._registeredColliders.add(mesh);
      this.collisionSystem.addCollider(mesh, "environment", { terrain: true, ...data });
    }
    this.rapierWorld?.addStaticMeshColliders?.([mesh]);
    this.navMesh.build();
    this.navMesh.blockObstacles(this._obstacleMeshes);
    this.navMesh.applySpawnPads();
  }

  /** Remove obstacle from movement + camera collision lists. */
  unregisterObstacle(mesh) {
    if (!mesh) return;
    const idx = this._obstacleMeshes.indexOf(mesh);
    if (idx >= 0) this._obstacleMeshes.splice(idx, 1);
    if (this._registeredColliders.has(mesh)) {
      this._registeredColliders.delete(mesh);
      this.collisionSystem?.removeCollider(mesh);
    }
    this.navMesh.build();
    this.navMesh.blockObstacles(this._obstacleMeshes);
    this.navMesh.applySpawnPads();
  }

  snapMesh(mesh, footOffset = 0) {
    this.groundSampler.snapMesh(mesh, footOffset);
  }

  /**
   * Resolve horizontal move with nav constraints + environment wall slide.
   * @returns {{ x: number, z: number, blocked: boolean, climb?: object }}
   */
  resolveMove(mesh, dx, dz, worldDirX, worldDirZ) {
    const ox = mesh.position.x;
    const oz = mesh.position.z;
    let nx = ox + dx;
    let nz = oz + dz;

    const nav = this.navMesh.constrainMove(ox, oz, nx, nz);
    nx = nav.x;
    nz = nav.z;

    if (this.collisionSystem && (dx !== 0 || dz !== 0)) {
      const chest = mesh.position.clone();
      chest.y += 1.0;
      const dir = new THREE.Vector3(dx, 0, dz);
      const dist = dir.length();
      if (dist > 0.001) {
        dir.normalize();
        const hit = this.collisionSystem.checkCollision(
          chest,
          dir,
          dist + 0.35,
          this.collisionSystem.layers.environment,
        );
        if (hit.hit && hit.distance < dist + WALL_SLIDE_EPS) {
          if (hit.normal) {
            const move = new THREE.Vector3(dx, 0, dz);
            const projected = move.addScaledVector(hit.normal, -move.dot(hit.normal));
            nx = ox + projected.x;
            nz = oz + projected.z;
            const nav2 = this.navMesh.constrainMove(ox, oz, nx, nz);
            nx = nav2.x;
            nz = nav2.z;
          } else {
            nx = ox;
            nz = oz;
          }
        }
      }
    }

    const climb =
      worldDirX != null && worldDirZ != null
        ? this.climbDetector.detect(mesh, worldDirX, worldDirZ)
        : { canClimb: false };

    return {
      x: nx,
      z: nz,
      blocked: nav.blocked && nx === ox && nz === oz,
      climb,
    };
  }

  /** A* path for AI — world-space waypoints. */
  findPath(sx, sz, ex, ez) {
    return this.navMesh.findPath(sx, sz, ex, ez);
  }

  isWalkable(x, z) {
    return this.navMesh.isWalkable(x, z);
  }

  slopeSpeedMultiplier(mesh, worldDirX, worldDirZ) {
    const len = Math.hypot(worldDirX, worldDirZ);
    if (len < 0.01) return 1;
    const x = mesh.position.x;
    const z = mesh.position.z;
    const y0 = this.groundSampler.sampleY(x, z, mesh.position.y);
    const ahead = 1.35;
    const y1 = this.groundSampler.sampleY(
      x + (worldDirX / len) * ahead,
      z + (worldDirZ / len) * ahead,
      y0,
    );
    const grade = (y1 - y0) / ahead;
    if (grade >= 0.14) return 0.7 + Math.max(0, 0.2 - grade);
    if (grade <= -0.1) return 1.08;
    return 1;
  }
}