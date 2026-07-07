/**
 * Rapier physics for island combat sandbox — heightfield terrain + character capsules.
 * Hitboxes remain on a separate cannon-es world (HitboxSystem).
 */

import RAPIER from "@dimforge/rapier3d-compat";
import { islandHeight } from "../dangerRoom/IslandTerrain.js";

const ISLAND_SIZE = 96;
const SEGMENTS = 64;
const FIXED_DT = 1 / 60;

export const GROUP_SCENE = 2;
export const GROUP_PLAYER = 4;
export const GROUP_ENEMY = 8;

let _initPromise = null;

async function ensureRapier() {
  if (!_initPromise) _initPromise = RAPIER.init();
  await _initPromise;
}

/**
 * Proxy body compatible with game.js sync helpers (names match PhysicsWorld semantics).
 */
function wrapBody(rigidBody, capsuleHalf, radius, heightOffset) {
  const pos = () => rigidBody.translation();
  return {
    rapierBody: rigidBody,
    capsuleHalf,
    radius,
    heightOffset,
    belongTo: null,
    get position() {
      const t = pos();
      return { x: t.x, y: t.y, z: t.z, set: () => {} };
    },
    velocity: { set: () => {} },
  };
}

export class RapierPhysicsWorld {
  /** @param {{ size?: number, segments?: number }} [opts] */
  static async create(opts = {}) {
    await ensureRapier();
    const size = opts.size ?? ISLAND_SIZE;
    const segments = opts.segments ?? SEGMENTS;
    const world = new RAPIER.World({ x: 0, y: -9.82, z: 0 });
    const half = size / 2;
    const n = segments + 1;
    const heights = new Float32Array(n * n);
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = -half + (ix / segments) * size;
        const z = -half + (iz / segments) * size;
        heights[iz * n + ix] = islandHeight(x, z);
      }
    }
    const scale = { x: size / segments, y: 1, z: size / segments };
    const hf = RAPIER.ColliderDesc.heightfield(segments, segments, heights, scale)
      .setTranslation(-half, 0, -half)
      .setFriction(0.85);
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(hf, ground);
    return new RapierPhysicsWorld(world);
  }

  constructor(world) {
    this.world = world;
    this._bodies = new Set();
    /** @type {import('cannon-es').World|null} cannon shim — use _hitboxWorld in game.js */
    this.cannonWorld = null;
  }

  step(delta) {
    const steps = Math.min(3, Math.max(1, Math.round(delta / FIXED_DT)));
    for (let i = 0; i < steps; i++) worldStep(this.world);
  }

  /**
   * @param {{x:number,y:number,z:number}} position
   * @param {number} radius
   * @param {number} height
   */
  createCharacterBody(position, radius = 0.5, height = 1.8, _group, _mask) {
    const half = Math.max(0.05, height * 0.5 - radius);
    const heightOffset = height * 0.5;
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setCanSleep(false)
      .lockRotations();
    const body = this.world.createRigidBody(desc);
    // position.y is capsule centre (game.js passes mesh.y + heightOffset).
    const collider = RAPIER.ColliderDesc.capsule(half, radius).setFriction(0.4);
    this.world.createCollider(collider, body);
    body.setTranslation(
      { x: position.x ?? 0, y: position.y ?? heightOffset, z: position.z ?? 0 },
      true,
    );
    const wrapped = wrapBody(body, half, radius, heightOffset);
    this._bodies.add(wrapped);
    return wrapped;
  }

  /** Mesh drives body (player input) — matches PhysicsWorld.syncBodyToMesh naming. */
  syncBodyToMesh(body, mesh, heightOffset) {
    const off = heightOffset ?? body.heightOffset ?? 0.9;
    const y = mesh.position.y + off;
    body.rapierBody.setNextKinematicTranslation({
      x: mesh.position.x,
      y,
      z: mesh.position.z,
    });
    body.rapierBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Body drives mesh (AI follow) — matches PhysicsWorld.syncMeshToBody naming. */
  syncMeshToBody(mesh, body, heightOffset) {
    const off = heightOffset ?? body.heightOffset ?? 0.9;
    const t = body.rapierBody.translation();
    mesh.position.set(t.x, t.y - off, t.z);
  }

  removeBody(body) {
    if (!body?.rapierBody) return;
    this.world.removeRigidBody(body.rapierBody);
    this._bodies.delete(body);
  }

  addBody() {
    /* hitboxes use cannon _hitboxWorld */
  }
}

function worldStep(world) {
  world.timestep = FIXED_DT;
  world.step();
}