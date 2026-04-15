/**
 * Sprite System — camera-facing 2D sprites in 3D space.
 * Includes damage numbers, text labels, and indicator dots.
 *
 * Also exports createSkybox() for the arena environment sphere.
 */

import * as THREE from 'three';

export class SpriteSystem {
  constructor(scene) {
    this.scene = scene;
    this.sprites = [];
  }

  createSprite({ texture = null, color = 0xffffff, position = new THREE.Vector3(), scale = 1, opacity = 1 }) {
    let material;
    if (texture) {
      material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity });
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.beginPath(); ctx.arc(32, 32, 28, 0, Math.PI * 2); ctx.fill();
      material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, opacity });
    }
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(scale, scale, 1);
    this.scene.add(sprite);
    this.sprites.push(sprite);
    return sprite;
  }

  createTextSprite(text, { fontSize = 24, color = '#ffffff', backgroundColor = 'rgba(0,0,0,0.7)', position = new THREE.Vector3(), scale = 1 } = {}) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${fontSize}px Arial`;
    const metrics = ctx.measureText(text);
    canvas.width = Math.ceil(metrics.width) + 20;
    canvas.height = fontSize + 20;
    ctx.fillStyle = backgroundColor;
    ctx.roundRect(0, 0, canvas.width, canvas.height, 8);
    ctx.fill();
    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const material = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.set(scale * (canvas.width / canvas.height), scale, 1);
    this.scene.add(sprite);
    this.sprites.push(sprite);
    return sprite;
  }

  createDamageNumber(damage, position, isCrit = false) {
    const color = isCrit ? '#ffcc00' : '#ffffff';
    const size = isCrit ? 1.5 : 1;
    const sprite = this.createTextSprite(Math.round(damage).toString(), {
      color, backgroundColor: 'transparent',
      position: position.clone().add(new THREE.Vector3(0, 1, 0)), scale: size
    });
    sprite.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2);
    sprite.userData.lifetime = 1;
    sprite.userData.isTemporary = true;
    return sprite;
  }

  update(delta) {
    // Swap-and-pop for temporary sprites
    let i = 0;
    while (i < this.sprites.length) {
      const sprite = this.sprites[i];
      if (!sprite.userData.isTemporary) { i++; continue; }
      sprite.userData.lifetime -= delta;
      if (sprite.userData.lifetime <= 0) {
        this.scene.remove(sprite);
        sprite.material.dispose();
        this.sprites[i] = this.sprites[this.sprites.length - 1];
        this.sprites.pop();
        continue;
      }
      if (sprite.userData.velocity) {
        sprite.position.add(sprite.userData.velocity.clone().multiplyScalar(delta));
        sprite.userData.velocity.y -= 5 * delta;
      }
      sprite.material.opacity = sprite.userData.lifetime;
      i++;
    }
  }

  dispose() {
    for (const sprite of this.sprites) {
      this.scene.remove(sprite);
      sprite.material.dispose();
    }
    this.sprites.length = 0;
  }
}

/** Create a procedural starfield skybox sphere */
export function createSkybox(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(256, 512, 0, 256, 256, 512);
  gradient.addColorStop(0, '#1a0033');
  gradient.addColorStop(0.5, '#0a0020');
  gradient.addColorStop(1, '#000010');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 200; i++) {
    ctx.beginPath();
    ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.8 + 0.2})`;
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  const skybox = new THREE.Mesh(
    new THREE.SphereGeometry(200, 32, 32),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide })
  );
  scene.add(skybox);
  return skybox;
}
