/**
 * Collision System — raycasting-based collision detection.
 * Supports layered collision (player, enemy, projectile, environment).
 */

import * as THREE from 'three';

export class CollisionSystem {
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.colliders = [];
    this.layers = { player: 1, enemy: 2, ally: 2, projectile: 4, environment: 8, interactable: 16 };
  }

  addCollider(mesh, layer = 'environment', data = {}) {
    this.colliders.push({ mesh, layer: this.layers[layer] || this.layers.environment, data });
  }

  removeCollider(mesh) {
    const index = this.colliders.findIndex(c => c.mesh === mesh);
    if (index !== -1) this.colliders.splice(index, 1);
  }

  checkCollision(origin, direction, maxDistance = 100, layerMask = 0xFFFF) {
    this.raycaster.set(origin, direction.normalize());
    this.raycaster.far = maxDistance;

    const meshes = this.colliders.filter(c => (c.layer & layerMask) !== 0).map(c => c.mesh);
    const intersects = this.raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const collider = this.colliders.find(c => c.mesh === hit.object || c.mesh.children?.includes(hit.object));
      return {
        hit: true, point: hit.point, distance: hit.distance,
        normal: hit.face?.normal || new THREE.Vector3(0, 1, 0),
        object: hit.object, data: collider?.data || {}
      };
    }
    return { hit: false };
  }

  checkSphereCollision(position, radius, layerMask = 0xFFFF) {
    const directions = [
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)
    ];
    return directions
      .map(dir => this.checkCollision(position, dir, radius, layerMask))
      .filter(r => r.hit);
  }

  resolveCollision(entity, collisions) {
    const transform = entity.getComponent('Transform');
    if (!transform) return;
    for (const collision of collisions) {
      const pushDirection = transform.position.clone().sub(collision.point).normalize();
      transform.position.add(pushDirection.multiplyScalar(collision.distance * 0.5));
    }
  }
}
