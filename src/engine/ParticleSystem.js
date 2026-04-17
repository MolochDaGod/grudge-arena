/**
 * GPU-friendly particle system using instanced points.
 * Uses swap-and-pop for O(1) particle removal in the update loop.
 */

import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene, config = {}) {
    this.scene = scene;
    this.particles = [];
    this.maxParticles = config.maxParticles || 1000;

    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    this.material = new THREE.PointsMaterial({
      size: 0.2, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);
  }

  emit(config) {
    const count = config.count || 10;
    const position = config.position || new THREE.Vector3();
    const color = config.color || new THREE.Color(0xffffff);
    const velocity = config.velocity || new THREE.Vector3(0, 1, 0);
    const spread = config.spread || 1;
    const lifetime = config.lifetime || 1;
    const size = config.size || 0.2;

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      this.particles.push({
        position: position.clone(),
        velocity: new THREE.Vector3(
          velocity.x + (Math.random() - 0.5) * spread,
          velocity.y + (Math.random() - 0.5) * spread,
          velocity.z + (Math.random() - 0.5) * spread
        ),
        color: color.clone(),
        size: size * (0.5 + Math.random() * 0.5),
        lifetime: lifetime * (0.5 + Math.random() * 0.5),
        maxLifetime: lifetime,
        gravity: config.gravity || 0,
        drag: config.drag || 0
      });
    }
  }

  update(delta) {
    // Swap-and-pop removal — O(1) per dead particle instead of O(n) splice
    let i = 0;
    while (i < this.particles.length) {
      const p = this.particles[i];
      p.lifetime -= delta;
      if (p.lifetime <= 0) {
        // Swap with last element and pop
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue; // Re-check index i (now holds the swapped element)
      }
      p.velocity.y -= p.gravity * delta;
      p.velocity.multiplyScalar(1 - p.drag * delta);
      p.position.add(p.velocity.clone().multiplyScalar(delta));
      i++;
    }

    // Write to buffers
    for (let j = 0; j < this.maxParticles; j++) {
      if (j < this.particles.length) {
        const p = this.particles[j];
        const lifeRatio = p.lifetime / p.maxLifetime;
        this.positions[j * 3] = p.position.x;
        this.positions[j * 3 + 1] = p.position.y;
        this.positions[j * 3 + 2] = p.position.z;
        this.colors[j * 3] = p.color.r * lifeRatio;
        this.colors[j * 3 + 1] = p.color.g * lifeRatio;
        this.colors[j * 3 + 2] = p.color.b * lifeRatio;
        this.sizes[j] = p.size * lifeRatio;
      } else {
        this.positions[j * 3] = 0;
        this.positions[j * 3 + 1] = -1000;
        this.positions[j * 3 + 2] = 0;
        this.sizes[j] = 0;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.setDrawRange(0, this.particles.length);
  }

  emitExplosion(position, color, count = 50) {
    this.emit({ position, color, count, velocity: new THREE.Vector3(0, 2, 0), spread: 5, lifetime: 1, size: 0.3, gravity: 5, drag: 2 });
  }

  emitTrail(position, color) {
    this.emit({ position, color, count: 3, velocity: new THREE.Vector3(0, 0.5, 0), spread: 0.5, lifetime: 0.5, size: 0.15, drag: 5 });
  }

  emitHeal(position) {
    this.emit({ position: position.clone(), color: new THREE.Color(0x44ff44), count: 20, velocity: new THREE.Vector3(0, 3, 0), spread: 1, lifetime: 1.5, size: 0.25, gravity: -2 });
  }

  dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.particles.length = 0;
  }
}
